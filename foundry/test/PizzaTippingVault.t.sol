// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaTippingVaultUpgradeable} from "../src/PizzaTippingVaultUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal mock ERC20
contract MockPizza is ERC20 {
    constructor() ERC20("MockPizza", "MPZA") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Returns false on transfer instead of reverting (non-standard ERC20)
contract BadERC20 is ERC20 {
    constructor() ERC20("Bad", "BAD") {}
    function mint(address to, uint256 amt) external { _mint(to, amt); }
    function transfer(address, uint256) public pure override returns (bool) {
        return false; // silently fails
    }
}

/// @dev Fee-on-transfer ERC20 — takes 2% fee, recipient gets less
contract FeeOnTransferToken is ERC20 {
    uint256 public constant FEE_BPS = 200; // 2%
    constructor() ERC20("FeeToken", "FEE") {}
    function mint(address to, uint256 amt) external { _mint(to, amt); }
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = (value * FEE_BPS) / 10000;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @dev Malicious upgrade target — has a backdoor `rug()` function
contract EvilImpl is PizzaTippingVaultUpgradeable {
    function rug(address to) external {
        ERC20(pizzaToken).transfer(to, ERC20(pizzaToken).balanceOf(address(this)));
    }
}

/// @dev Reentrancy attacker — tries to re-call withdraw during transfer callback
/// (Standard ERC20s have no callback, but this proves the nonReentrant guard works)
contract ReentrantToken is ERC20 {
    PizzaTippingVaultUpgradeable public vault;
    bool public attacking;

    constructor() ERC20("Reentrant", "RE") {}

    function setVault(address _v) external { vault = PizzaTippingVaultUpgradeable(_v); }
    function mint(address to, uint256 amt) external { _mint(to, amt); }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (attacking && from == address(vault) && to != address(0)) {
            // Try to re-enter withdraw
            attacking = false;
            try vault.withdraw(1) {
                revert("REENTRY SUCCEEDED");
            } catch {}
        }
    }

    function attack() external {
        attacking = true;
        vault.withdraw(100);
    }
}

/**
 * @title PizzaTippingVaultTest
 * @dev Full pre-deploy attack-simulation suite for PizzaTippingVaultUpgradeable.
 *      Modeled on the user's war-game checklist:
 *      1) Staking → Vault integration attacks
 *      2) Tip execution attacks
 *      3) Farcaster input attacks (covered by API layer + replay tests here)
 *      4) Backend failure scenarios
 *      5) Withdrawal safety
 *      6) Owner / admin attacks
 *      7) Balance integrity invariants
 *      8) Edge cases
 *      9) Monitoring drills (off-chain)
 *      10) Full system dry run
 *
 * Run: forge test --match-contract PizzaTippingVaultTest -vvv
 */
contract PizzaTippingVaultTest is Test {
    PizzaTippingVaultUpgradeable vault;
    MockPizza token;

    address owner = makeAddr("owner");
    address staking = makeAddr("staking");
    address signer = makeAddr("backendSigner");
    address treasury = makeAddr("treasury");

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address attacker = makeAddr("attacker");

    uint256 constant MIN_TIP = 1_000 * 1e18;
    uint256 constant MAX_TIP = 10_000_000 * 1e18;
    uint256 constant MAX_CREDIT = 100_000_000 * 1e18;

    event Credited(address indexed user, uint256 amount);
    event Tipped(address indexed from, address indexed to, uint256 amount, uint256 recipientFid, bytes32 castHash);
    event Withdrawn(address indexed user, uint256 amount);
    event Forfeited(address indexed user, uint256 amount);

    function setUp() public {
        token = new MockPizza();
        PizzaTippingVaultUpgradeable impl = new PizzaTippingVaultUpgradeable();
        bytes memory initData = abi.encodeCall(
            PizzaTippingVaultUpgradeable.initialize,
            (address(token), staking, signer, treasury, owner)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vault = PizzaTippingVaultUpgradeable(address(proxy));
    }

    // Helper: simulate staking pushing tokens then crediting (push-then-credit)
    function _stakingCreditWithTransfer(address user, uint256 amount) internal {
        token.mint(address(vault), amount);
        vm.prank(staking);
        vault.credit(user, amount);
    }

    // ============================================================
    // INIT
    // ============================================================

    function test_init_setsAllValues() public view {
        assertEq(vault.pizzaToken(), address(token));
        assertEq(vault.stakingContract(), staking);
        assertEq(vault.backendSigner(), signer);
        assertEq(vault.treasury(), treasury);
        assertEq(vault.owner(), owner);
        assertEq(vault.minTipAmount(), MIN_TIP);
        assertEq(vault.maxTipPerCast(), MAX_TIP);
        assertEq(vault.maxCreditPerTx(), MAX_CREDIT);
        assertFalse(vault.paused());
    }

    function test_init_revertsOnSecondCall() public {
        vm.expectRevert();
        vault.initialize(address(token), staking, signer, treasury, owner);
    }

    function test_init_disabledOnImplementation() public {
        PizzaTippingVaultUpgradeable freshImpl = new PizzaTippingVaultUpgradeable();
        vm.expectRevert();
        freshImpl.initialize(address(token), staking, signer, treasury, owner);
    }

    function test_init_revertsOnZeroToken() public {
        PizzaTippingVaultUpgradeable impl2 = new PizzaTippingVaultUpgradeable();
        bytes memory bad = abi.encodeCall(
            PizzaTippingVaultUpgradeable.initialize,
            (address(0), staking, signer, treasury, owner)
        );
        vm.expectRevert();
        new ERC1967Proxy(address(impl2), bad);
    }

    // ============================================================
    // 1) STAKING → VAULT INTEGRATION ATTACKS
    // ============================================================

    /// @notice Test: Over-credit exploit (critical)
    function test_attack_overCredit_revertsAboveCap() public {
        token.mint(address(vault), MAX_CREDIT + 1);
        vm.prank(staking);
        vm.expectRevert(PizzaTippingVaultUpgradeable.AmountAboveCreditCap.selector);
        vault.credit(alice, MAX_CREDIT + 1);
    }

    function test_credit_atExactCap_succeeds() public {
        token.mint(address(vault), MAX_CREDIT);
        vm.prank(staking);
        vault.credit(alice, MAX_CREDIT);
        assertEq(vault.tipBalance(alice), MAX_CREDIT);
    }

    /// @notice Test: Credit without token transfer (insolvency check)
    /// Vault MUST eventually be solvent — if staking credits without transferring tokens,
    /// the contract balance won't match the ledger. This test documents the trust assumption.
    function test_attack_creditWithoutTransfer_creates_insolvency() public {
        // Staking calls credit but DOESN'T send tokens first (bug scenario)
        vm.prank(staking);
        vault.credit(alice, 5_000 * 1e18);
        assertEq(vault.tipBalance(alice), 5_000 * 1e18);
        assertEq(token.balanceOf(address(vault)), 0); // <-- INSOLVENT

        // Alice's withdraw will revert because vault has no tokens to send
        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(5_000 * 1e18);
    }

    /// @notice Test: Wrong staking contract calling credit
    function test_attack_randomCallerCredit_reverts() public {
        token.mint(address(vault), 1_000 * 1e18);
        vm.prank(attacker);
        vm.expectRevert(PizzaTippingVaultUpgradeable.NotStakingContract.selector);
        vault.credit(alice, 1_000 * 1e18);
    }

    function test_credit_revertsIfZero() public {
        vm.prank(staking);
        vm.expectRevert(PizzaTippingVaultUpgradeable.ZeroAmount.selector);
        vault.credit(alice, 0);
    }

    function test_credit_revertsWhenPaused() public {
        vm.prank(owner);
        vault.pause();
        token.mint(address(vault), 1_000 * 1e18);
        vm.prank(staking);
        vm.expectRevert();
        vault.credit(alice, 1_000 * 1e18);
    }

    // ============================================================
    // 2) TIP EXECUTION ATTACKS
    // ============================================================

    /// @notice Test: Replay attack — same cast hash twice
    function test_attack_replay_reverts() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        bytes32 h = keccak256("c1");
        vm.prank(signer);
        vault.spendTip(alice, bob, 12345, MIN_TIP, h);

        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.CastAlreadyUsed.selector);
        vault.spendTip(alice, bob, 12345, MIN_TIP, h);
    }

    /// @notice Test: Backend signer compromise — caps still enforced
    function test_attack_compromisedSigner_capStillEnforced() public {
        _stakingCreditWithTransfer(alice, 100_000_000 * 1e18); // alice has 100M

        // Compromised signer tries to drain alice in one tx
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.AmountAboveMax.selector);
        vault.spendTip(alice, attacker, 12345, MAX_TIP + 1, keccak256("evil"));

        // Confirms attacker can only steal at most maxTipPerCast per call
    }

    /// @notice Test: Self-tip bypass attempt
    function test_attack_selfTip_reverts() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.SelfTipNotAllowed.selector);
        vault.spendTip(alice, alice, 12345, MIN_TIP, keccak256("c"));
    }

    /// @notice Test: Fake FID (= 0)
    function test_attack_zeroFid_reverts() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.InvalidRecipientFid.selector);
        vault.spendTip(alice, bob, 0, MIN_TIP, keccak256("c"));
    }

    /// @notice Test: Insufficient balance
    function test_attack_insufficientBalance_reverts() public {
        _stakingCreditWithTransfer(alice, MIN_TIP); // exactly min
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.InsufficientBalance.selector);
        vault.spendTip(alice, bob, 12345, MIN_TIP + 1, keccak256("c"));
    }

    /// @notice Test: Random caller (not signer) → revert
    function test_attack_unauthorizedSpend_reverts() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(attacker);
        vm.expectRevert(PizzaTippingVaultUpgradeable.NotBackendSigner.selector);
        vault.spendTip(alice, bob, 12345, MIN_TIP, keccak256("c"));
    }

    function test_spendTip_atExactBoundaries() public {
        _stakingCreditWithTransfer(alice, MAX_TIP);
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MAX_TIP, keccak256("c1"));
        assertEq(token.balanceOf(bob), MAX_TIP);

        _stakingCreditWithTransfer(alice, MIN_TIP);
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("c2"));
        assertEq(token.balanceOf(bob), MAX_TIP + MIN_TIP);
    }

    function test_spendTip_belowMin_reverts() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.AmountBelowMin.selector);
        vault.spendTip(alice, bob, 12345, MIN_TIP - 1, keccak256("c"));
    }

    // ============================================================
    // 3) FARCASTER INPUT ATTACKS (parsing happens off-chain;
    //    on-chain we test that bad inputs are rejected by the contract)
    // ============================================================

    /// @notice Very large number → caught by max cap
    function test_attack_hugeAmount_revertsCap() public {
        _stakingCreditWithTransfer(alice, MAX_CREDIT);
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.AmountAboveMax.selector);
        vault.spendTip(alice, bob, 12345, type(uint256).max, keccak256("c"));
    }

    // ============================================================
    // 4) BACKEND FAILURE SCENARIOS
    // ============================================================

    /// @notice Backend may send to wrong recipient — contract WILL execute (trust layer).
    /// Document: this is expected behavior. Mitigation = off-chain monitoring.
    function test_backendBug_wrongRecipient_executes() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        // Backend "intends" bob but sends to attacker — contract trusts the signer
        vm.prank(signer);
        vault.spendTip(alice, attacker, 12345, MIN_TIP, keccak256("c"));
        assertEq(token.balanceOf(attacker), MIN_TIP);
    }

    /// @notice Even with backend skipping API validation, contract enforces hard caps
    function test_backendBug_skipValidation_contractStillEnforces() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);

        // Backend tries: from==to (self-tip) — contract blocks
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.SelfTipNotAllowed.selector);
        vault.spendTip(alice, alice, 12345, MIN_TIP, keccak256("c1"));

        // Backend tries: fid=0 — contract blocks
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.InvalidRecipientFid.selector);
        vault.spendTip(alice, bob, 0, MIN_TIP, keccak256("c2"));

        // Backend tries: replay — contract blocks
        bytes32 h = keccak256("c3");
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, h);
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.CastAlreadyUsed.selector);
        vault.spendTip(alice, bob, 1, MIN_TIP, h);
    }

    // ============================================================
    // 5) WITHDRAWAL SAFETY
    // ============================================================

    function test_withdraw_happyPath() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(alice, 2_000 * 1e18);
        vault.withdraw(2_000 * 1e18);
        assertEq(vault.tipBalance(alice), 3_000 * 1e18);
        assertEq(token.balanceOf(alice), 2_000 * 1e18);
    }

    /// @notice CRITICAL: withdraw must work when paused (user safety valve)
    function test_withdraw_worksWhenPaused() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(owner);
        vault.pause();
        assertTrue(vault.paused());

        vm.prank(alice);
        vault.withdraw(2_000 * 1e18);
        assertEq(token.balanceOf(alice), 2_000 * 1e18);
    }

    function test_withdraw_full_resetsBalance() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(alice);
        vault.withdraw(5_000 * 1e18);
        assertEq(vault.tipBalance(alice), 0);
        assertEq(token.balanceOf(alice), 5_000 * 1e18);
    }

    function test_withdraw_revertsIfZero() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(alice);
        vm.expectRevert(PizzaTippingVaultUpgradeable.ZeroAmount.selector);
        vault.withdraw(0);
    }

    function test_withdraw_revertsIfInsufficient() public {
        _stakingCreditWithTransfer(alice, 1_000 * 1e18);
        vm.prank(alice);
        vm.expectRevert(PizzaTippingVaultUpgradeable.InsufficientBalance.selector);
        vault.withdraw(2_000 * 1e18);
    }

    /// @notice Reentrancy guard test — uses malicious token that tries to reenter
    function test_attack_reentrancy_blocked() public {
        // Deploy fresh vault with malicious token
        ReentrantToken bad = new ReentrantToken();
        PizzaTippingVaultUpgradeable impl = new PizzaTippingVaultUpgradeable();
        bytes memory initData = abi.encodeCall(
            PizzaTippingVaultUpgradeable.initialize,
            (address(bad), staking, signer, treasury, owner)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        PizzaTippingVaultUpgradeable badVault = PizzaTippingVaultUpgradeable(address(proxy));
        bad.setVault(address(badVault));

        // Credit attacker
        bad.mint(address(badVault), 1_000);
        vm.prank(staking);
        badVault.credit(address(bad), 1_000);

        // Trigger attack — must NOT succeed in reentering
        bad.attack();
        // If we got here without revert("REENTRY SUCCEEDED"), reentrancy was blocked.
    }

    // ============================================================
    // 6) OWNER / ADMIN ATTACKS
    // ============================================================

    /// @notice Compromised owner CAN steal — documents trust assumption.
    function test_attack_compromisedOwner_canForfeit() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        // Compromised owner = system fully compromised. Documented expectation.
        vm.prank(owner);
        vault.forfeitTips(alice);
        assertEq(token.balanceOf(treasury), 5_000 * 1e18);
    }

    /// @notice Pause mid-flow blocks new tips, allows withdraw
    function test_pauseDuringActiveTipping() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);

        vm.prank(owner);
        vault.pause();

        // spendTip blocked
        vm.prank(signer);
        vm.expectRevert();
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("c"));

        // credit blocked
        token.mint(address(vault), 1_000 * 1e18);
        vm.prank(staking);
        vm.expectRevert();
        vault.credit(alice, 1_000 * 1e18);

        // withdraw still works
        vm.prank(alice);
        vault.withdraw(1_000 * 1e18);
    }

    function test_pause_revertsIfNotOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        vault.pause();
    }

    function test_setBackendSigner_works() public {
        address newSigner = makeAddr("newSigner");
        vm.prank(owner);
        vault.setBackendSigner(newSigner);
        assertEq(vault.backendSigner(), newSigner);
    }

    function test_setBackendSigner_revertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(PizzaTippingVaultUpgradeable.ZeroAddress.selector);
        vault.setBackendSigner(address(0));
    }

    function test_setStakingContract_works() public {
        address newStaking = makeAddr("newStaking");
        vm.prank(owner);
        vault.setStakingContract(newStaking);
        assertEq(vault.stakingContract(), newStaking);
    }

    function test_setTreasury_works() public {
        address newT = makeAddr("newT");
        vm.prank(owner);
        vault.setTreasury(newT);
        assertEq(vault.treasury(), newT);
    }

    function test_setLimits_works() public {
        vm.prank(owner);
        vault.setLimits(2_000 * 1e18, 20_000_000 * 1e18, 200_000_000 * 1e18);
        assertEq(vault.minTipAmount(), 2_000 * 1e18);
        assertEq(vault.maxTipPerCast(), 20_000_000 * 1e18);
        assertEq(vault.maxCreditPerTx(), 200_000_000 * 1e18);
    }

    function test_admin_revertsIfNotOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        vault.setBackendSigner(attacker);

        vm.prank(attacker);
        vm.expectRevert();
        vault.setStakingContract(attacker);

        vm.prank(attacker);
        vm.expectRevert();
        vault.setTreasury(attacker);

        vm.prank(attacker);
        vm.expectRevert();
        vault.setLimits(0, 0, 0);
    }

    // ============================================================
    // 7) BALANCE INTEGRITY INVARIANTS
    // ============================================================

    /// @notice Vault token balance MUST equal sum of all tipBalance after honest activity
    function test_invariant_balanceMatches_afterHonestActivity() public {
        _stakingCreditWithTransfer(alice, 10_000 * 1e18);
        _stakingCreditWithTransfer(bob, 5_000 * 1e18);

        // alice tips bob 1000 (out of vault to bob's wallet)
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("c1"));

        // alice withdraws 2000
        vm.prank(alice);
        vault.withdraw(2_000 * 1e18);

        uint256 ledger = vault.tipBalance(alice) + vault.tipBalance(bob);
        uint256 vaultBal = token.balanceOf(address(vault));
        assertEq(ledger, vaultBal, "ledger must match vault balance");
    }

    /// @notice Forfeit sweeps to treasury and zeroes ledger
    function test_invariant_forfeit_preservesIntegrity() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        _stakingCreditWithTransfer(bob, 3_000 * 1e18);

        vm.prank(owner);
        vault.forfeitTips(alice);

        assertEq(vault.tipBalance(alice), 0);
        assertEq(token.balanceOf(treasury), 5_000 * 1e18);
        // bob's ledger still equals remaining vault balance
        assertEq(vault.tipBalance(bob), token.balanceOf(address(vault)));
    }

    // ============================================================
    // 8) EDGE CASES
    // ============================================================

    function test_edge_zeroAmounts_rejected() public {
        // credit 0
        vm.prank(staking);
        vm.expectRevert(PizzaTippingVaultUpgradeable.ZeroAmount.selector);
        vault.credit(alice, 0);

        // withdraw 0
        _stakingCreditWithTransfer(alice, 1_000 * 1e18);
        vm.prank(alice);
        vm.expectRevert(PizzaTippingVaultUpgradeable.ZeroAmount.selector);
        vault.withdraw(0);
    }

    function test_edge_multipleRapidTips() public {
        _stakingCreditWithTransfer(alice, MIN_TIP * 5);
        for (uint256 i = 0; i < 5; i++) {
            bytes32 h = keccak256(abi.encode("cast", i));
            vm.prank(signer);
            vault.spendTip(alice, bob, 1, MIN_TIP, h);
        }
        assertEq(vault.tipBalance(alice), 0);
        assertEq(token.balanceOf(bob), MIN_TIP * 5);
    }

    function test_edge_forfeit_noBalance_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PizzaTippingVaultUpgradeable.NoBalanceToForfeit.selector);
        vault.forfeitTips(alice);
    }

    // ============================================================
    // 10) FULL SYSTEM DRY RUN
    // ============================================================

    function test_dryRun_fullLifecycle() public {
        // Step 1: Staking credits alice
        _stakingCreditWithTransfer(alice, 50_000 * 1e18);
        assertEq(vault.tipBalance(alice), 50_000 * 1e18);

        // Step 2: Alice tips bob
        vm.prank(signer);
        vault.spendTip(alice, bob, 12345, 5_000 * 1e18, keccak256("dry1"));
        assertEq(token.balanceOf(bob), 5_000 * 1e18);
        assertEq(vault.tipBalance(alice), 45_000 * 1e18);

        // Step 3: Alice tips again (different cast)
        vm.prank(signer);
        vault.spendTip(alice, bob, 12345, 3_000 * 1e18, keccak256("dry2"));
        assertEq(token.balanceOf(bob), 8_000 * 1e18);

        // Step 4: Alice withdraws remainder
        vm.prank(alice);
        vault.withdraw(42_000 * 1e18);
        assertEq(vault.tipBalance(alice), 0);
        assertEq(token.balanceOf(alice), 42_000 * 1e18);

        // Final: vault should be empty (all PIZZA distributed)
        assertEq(token.balanceOf(address(vault)), 0);
    }

    // ============================================================
    // 11) FUZZ INVARIANTS
    // ============================================================

    /// @notice Fuzz: ledger total must always equal vault token balance after honest credits
    function test_fuzz_invariant_totalBalance(uint256 a, uint256 b) public {
        a = bound(a, MIN_TIP, MAX_CREDIT);
        b = bound(b, MIN_TIP, MAX_CREDIT);

        _stakingCreditWithTransfer(alice, a);
        _stakingCreditWithTransfer(bob, b);

        uint256 ledger = vault.tipBalance(alice) + vault.tipBalance(bob);
        uint256 vaultBal = token.balanceOf(address(vault));
        assertEq(ledger, vaultBal);
    }

    /// @notice Fuzz: tip amount within bounds — invariant holds after tip
    function test_fuzz_spendTip_invariant(
        uint256 creditAmount,
        uint256 tipAmount,
        uint256 fid,
        bytes32 castHash
    ) public {
        creditAmount = bound(creditAmount, MIN_TIP, MAX_CREDIT);
        tipAmount = bound(tipAmount, MIN_TIP, MAX_TIP);
        fid = bound(fid, 1, type(uint64).max);
        vm.assume(tipAmount <= creditAmount);

        _stakingCreditWithTransfer(alice, creditAmount);

        vm.prank(signer);
        vault.spendTip(alice, bob, fid, tipAmount, castHash);

        // ledger + recipient wallet = original vault deposit
        assertEq(vault.tipBalance(alice) + token.balanceOf(bob), creditAmount);
        assertEq(token.balanceOf(address(vault)), vault.tipBalance(alice));
        assertTrue(vault.usedCastHashes(castHash));
    }

    // ============================================================
    // 12) UPGRADE SAFETY
    // ============================================================

    /// @notice CRITICAL — UUPS upgrade must preserve all state
    function test_upgrade_preservesStorage() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        _stakingCreditWithTransfer(bob, 3_000 * 1e18);

        bytes32 castHash = keccak256("upgradeTest");
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, castHash);

        // Snapshot pre-upgrade state
        uint256 aliceBalBefore = vault.tipBalance(alice);
        uint256 bobBalBefore = vault.tipBalance(bob);
        uint256 minBefore = vault.minTipAmount();
        address signerBefore = vault.backendSigner();

        // Deploy new implementation and upgrade
        PizzaTippingVaultUpgradeable newImpl = new PizzaTippingVaultUpgradeable();
        vm.prank(owner);
        vault.upgradeToAndCall(address(newImpl), "");

        // All state must be preserved
        assertEq(vault.tipBalance(alice), aliceBalBefore);
        assertEq(vault.tipBalance(bob), bobBalBefore);
        assertEq(vault.minTipAmount(), minBefore);
        assertEq(vault.backendSigner(), signerBefore);
        assertTrue(vault.usedCastHashes(castHash)); // replay protection still in place
    }

    function test_upgrade_revertsIfNotOwner() public {
        PizzaTippingVaultUpgradeable newImpl = new PizzaTippingVaultUpgradeable();
        vm.prank(attacker);
        vm.expectRevert();
        vault.upgradeToAndCall(address(newImpl), "");
    }

    // ============================================================
    // 13) PAUSE → UNPAUSE RECOVERY
    // ============================================================

    function test_pause_then_unpause_restoresFunctionality() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);

        vm.prank(owner);
        vault.pause();
        assertTrue(vault.paused());

        // Confirm spendTip blocked
        vm.prank(signer);
        vm.expectRevert();
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("paused"));

        // Unpause
        vm.prank(owner);
        vault.unpause();
        assertFalse(vault.paused());

        // spendTip works again
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("after-unpause"));
        assertEq(token.balanceOf(bob), MIN_TIP);

        // credit works again
        token.mint(address(vault), 1_000 * 1e18);
        vm.prank(staking);
        vault.credit(alice, 1_000 * 1e18);
    }

    // ============================================================
    // 14) EVENT CORRECTNESS (indexing)
    // ============================================================

    function test_event_credited_emittedCorrectly() public {
        token.mint(address(vault), 7_777 * 1e18);
        vm.prank(staking);
        vm.expectEmit(true, false, false, true, address(vault));
        emit Credited(alice, 7_777 * 1e18);
        vault.credit(alice, 7_777 * 1e18);
    }

    function test_event_tipped_logsRecipientFid() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        bytes32 hash_ = keccak256("evt");
        uint256 fidValue = 999_888;

        vm.prank(signer);
        vm.expectEmit(true, true, false, true, address(vault));
        emit Tipped(alice, bob, MIN_TIP, fidValue, hash_);
        vault.spendTip(alice, bob, fidValue, MIN_TIP, hash_);
    }

    function test_event_forfeited_emittedCorrectly() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(vault));
        emit Forfeited(alice, 5_000 * 1e18);
        vault.forfeitTips(alice);
    }

    // ============================================================
    // 15) CHANGING LIMITS MID-FLIGHT
    // ============================================================

    /// @notice Reduce maxTipPerCast — old in-flight tip below new max still works,
    ///         tip above new max reverts.
    function test_changingLimits_reducesMaxTip() public {
        _stakingCreditWithTransfer(alice, 20_000_000 * 1e18);

        // Owner reduces maxTipPerCast to 5M
        vm.prank(owner);
        vault.setLimits(MIN_TIP, 5_000_000 * 1e18, MAX_CREDIT);

        // Tip of 5M: ok
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, 5_000_000 * 1e18, keccak256("a"));

        // Tip of 5M + 1: revert
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.AmountAboveMax.selector);
        vault.spendTip(alice, bob, 1, 5_000_000 * 1e18 + 1, keccak256("b"));
    }

    /// @notice Increase minTipAmount — tips below new min start failing
    function test_changingLimits_increasesMinTip() public {
        _stakingCreditWithTransfer(alice, 50_000 * 1e18);

        // Tip of 1000 ok (default min)
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("a"));

        // Owner raises min to 5000
        vm.prank(owner);
        vault.setLimits(5_000 * 1e18, MAX_TIP, MAX_CREDIT);

        // 1000 now reverts
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.AmountBelowMin.selector);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("b"));

        // 5000 ok
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, 5_000 * 1e18, keccak256("c"));
    }

    /// @notice Reduce maxCreditPerTx — future credits above new cap revert
    function test_changingLimits_reducesMaxCredit() public {
        // Initial 100M cap — 50M credit ok
        token.mint(address(vault), 50_000_000 * 1e18);
        vm.prank(staking);
        vault.credit(alice, 50_000_000 * 1e18);

        // Owner reduces to 10M
        vm.prank(owner);
        vault.setLimits(MIN_TIP, MAX_TIP, 10_000_000 * 1e18);

        // 50M credit now reverts
        token.mint(address(vault), 50_000_000 * 1e18);
        vm.prank(staking);
        vm.expectRevert(PizzaTippingVaultUpgradeable.AmountAboveCreditCap.selector);
        vault.credit(alice, 50_000_000 * 1e18);

        // 10M ok
        vm.prank(staking);
        vault.credit(alice, 10_000_000 * 1e18);
    }

    // ============================================================
    // 16) BALANCE EXHAUSTION
    // ============================================================

    /// @notice Tip exactly to zero — next tip fails on insufficient balance
    function test_exhaustBalance_thenNextTipFails() public {
        // Credit alice exactly 3 × MIN_TIP
        _stakingCreditWithTransfer(alice, MIN_TIP * 3);

        // Tip 3 times — exactly drains
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("e1"));
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("e2"));
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("e3"));

        assertEq(vault.tipBalance(alice), 0);

        // 4th tip fails
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.InsufficientBalance.selector);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("e4"));

        // Withdraw also fails (nothing to take)
        vm.prank(alice);
        vm.expectRevert(PizzaTippingVaultUpgradeable.InsufficientBalance.selector);
        vault.withdraw(MIN_TIP);
    }

    // ============================================================
    // 17) NON-STANDARD ERC20 BEHAVIOR
    // ============================================================

    /// @notice Token returns false on transfer (non-standard) — must revert via SafeERC20
    function test_badERC20_returnsFalse_safeTransferReverts() public {
        BadERC20 bad = new BadERC20();
        PizzaTippingVaultUpgradeable impl = new PizzaTippingVaultUpgradeable();
        bytes memory initData = abi.encodeCall(
            PizzaTippingVaultUpgradeable.initialize,
            (address(bad), staking, signer, treasury, owner)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        PizzaTippingVaultUpgradeable badVault = PizzaTippingVaultUpgradeable(address(proxy));

        bad.mint(address(badVault), 5_000 * 1e18);
        vm.prank(staking);
        badVault.credit(alice, 5_000 * 1e18);

        // withdraw must revert (SafeERC20 catches false return)
        vm.prank(alice);
        vm.expectRevert();
        badVault.withdraw(MIN_TIP);

        // spendTip must revert too
        vm.prank(signer);
        vm.expectRevert();
        badVault.spendTip(alice, bob, 1, MIN_TIP, keccak256("c"));
    }

    /// @notice Fee-on-transfer token breaks accounting invariant — documented risk
    /// @dev Pizza is a standard ERC20 so this is not a current threat, but if we ever
    ///      switch tokens we must ensure no fee-on-transfer behavior.
    function test_feeOnTransferToken_breaksInvariant_documentRisk() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        PizzaTippingVaultUpgradeable impl = new PizzaTippingVaultUpgradeable();
        bytes memory initData = abi.encodeCall(
            PizzaTippingVaultUpgradeable.initialize,
            (address(fee), staking, signer, treasury, owner)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        PizzaTippingVaultUpgradeable feeVault = PizzaTippingVaultUpgradeable(address(proxy));

        // Mint 1000 to vault — fee takes 20, vault gets 980
        fee.mint(address(this), 1000 * 1e18);
        fee.transfer(address(feeVault), 1000 * 1e18);
        uint256 vaultActual = fee.balanceOf(address(feeVault));
        assertLt(vaultActual, 1000 * 1e18); // less than expected due to fee

        // Credit assumes 1000 — ledger > balance
        vm.prank(staking);
        feeVault.credit(alice, 1000 * 1e18);
        assertGt(feeVault.tipBalance(alice), fee.balanceOf(address(feeVault)));
        // ↑ This INTENTIONALLY documents the broken invariant.
        // PIZZA is standard ERC20, so we accept this risk for v1.
    }

    // ============================================================
    // 18) CREDIT ORDERING (PUSH-THEN-CREDIT INVARIANT)
    // ============================================================

    /// @notice Locks the design assumption: token transfer must precede credit
    function test_creditOrdering_strictPushThenCredit() public {
        token.mint(address(vault), 1000 * 1e18);
        // tokens already in vault
        vm.prank(staking);
        vault.credit(alice, 1000 * 1e18);
        // now ledger == vault balance
        assertEq(token.balanceOf(address(vault)), 1000 * 1e18);
        assertEq(vault.tipBalance(alice), 1000 * 1e18);
    }

    // ============================================================
    // 19) CAST HASH GLOBAL UNIQUENESS
    // ============================================================

    /// @notice Same cast hash cannot be reused across different sender/recipient pairs.
    ///         This locks in the design choice of GLOBAL hash uniqueness.
    function test_castHash_globalCollision() public {
        _stakingCreditWithTransfer(alice, MIN_TIP);
        _stakingCreditWithTransfer(bob, MIN_TIP);

        bytes32 h = keccak256("same");

        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, h);

        // bob → alice with same hash should revert
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.CastAlreadyUsed.selector);
        vault.spendTip(bob, alice, 1, MIN_TIP, h);
    }

    // ============================================================
    // 20) FORFEIT AFTER PARTIAL USAGE
    // ============================================================

    function test_forfeit_after_partial_usage() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);

        // Alice tips bob a bit
        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("x"));

        uint256 remaining = vault.tipBalance(alice);
        assertEq(remaining, 4_000 * 1e18);

        // Forfeit her remaining
        vm.prank(owner);
        vault.forfeitTips(alice);

        assertEq(vault.tipBalance(alice), 0);
        assertEq(token.balanceOf(treasury), remaining);

        // Withdraw after forfeit must fail
        vm.prank(alice);
        vm.expectRevert(PizzaTippingVaultUpgradeable.InsufficientBalance.selector);
        vault.withdraw(1);
    }

    // ============================================================
    // 21) UPGRADE TO MALICIOUS IMPL — DOCUMENTS OWNER TRUST
    // ============================================================

    /// @notice Documents trust assumption: owner can upgrade to a contract with backdoors.
    ///         Mitigation = hardware wallet, multisig, monitoring (all off-chain).
    function test_upgrade_toEvilImpl_documents_ownerRisk() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);

        EvilImpl evil = new EvilImpl();

        vm.prank(owner);
        vault.upgradeToAndCall(address(evil), "");

        // Now the owner-controlled "evil" implementation can drain
        EvilImpl(address(vault)).rug(attacker);
        assertGt(token.balanceOf(attacker), 0);
        // This test PASSES as documentation, not as a fix.
    }

    // ============================================================
    // 22) SIGNER ROTATION
    // ============================================================

    function test_signerRotation_oldSignerStopsWorking() public {
        _stakingCreditWithTransfer(alice, MIN_TIP * 2);

        address newSigner = makeAddr("newSigner");

        vm.prank(owner);
        vault.setBackendSigner(newSigner);

        // Old signer cannot tip anymore
        vm.prank(signer);
        vm.expectRevert(PizzaTippingVaultUpgradeable.NotBackendSigner.selector);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("old"));

        // New signer can tip
        vm.prank(newSigner);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("new"));
    }

    // ============================================================
    // 23) TREASURY ZERO ADDRESS GUARD
    // ============================================================

    function test_setTreasury_zero_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PizzaTippingVaultUpgradeable.ZeroAddress.selector);
        vault.setTreasury(address(0));
    }

    // ============================================================
    // 24) MISC — TIP TO CONTRACT, MULTI-USER CONTENTION
    // ============================================================

    /// @notice Tipping a contract address behaves identically (treasury could be a multisig)
    function test_tipToContract_works() public {
        _stakingCreditWithTransfer(alice, 5_000 * 1e18);
        address contractRecipient = address(new MockPizza()); // any contract address

        vm.prank(signer);
        vault.spendTip(alice, contractRecipient, 1, MIN_TIP, keccak256("c"));
        assertEq(token.balanceOf(contractRecipient), MIN_TIP);
    }

    /// @notice Multiple users tipping same recipient — accounting holds
    function test_multipleUsers_sameRecipient() public {
        _stakingCreditWithTransfer(alice, MIN_TIP);
        _stakingCreditWithTransfer(bob, MIN_TIP);
        address charlie = makeAddr("charlie");
        _stakingCreditWithTransfer(charlie, MIN_TIP);

        vm.prank(signer);
        vault.spendTip(alice, bob, 1, MIN_TIP, keccak256("a"));
        vm.prank(signer);
        vault.spendTip(charlie, bob, 1, MIN_TIP, keccak256("b"));

        // bob received MIN_TIP × 2 in his wallet
        assertEq(token.balanceOf(bob), MIN_TIP * 2);
        // bob's tip balance unchanged (he didn't claim to tip)
        assertEq(vault.tipBalance(bob), MIN_TIP);
    }
}
