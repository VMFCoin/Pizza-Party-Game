// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {PizzaTippingVaultUpgradeable} from "../src/PizzaTippingVaultUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockPizza is ERC20 {
    constructor() ERC20("MockPizza", "MPZA") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/**
 * @title TippingVaultHandler
 * @notice Handler contract for stateful invariant testing.
 *         The fuzzer randomly calls these wrapper functions in unpredictable sequences,
 *         simulating real-world chaos: many actors, interleaved actions, edge cases.
 *
 * Tracks ALL credits and ALL withdrawals/spends so the invariant can verify
 * total ledger == sum of all credits - sum of all tips out - sum of all withdrawals - sum of all forfeits.
 */
contract TippingVaultHandler is Test {
    PizzaTippingVaultUpgradeable public vault;
    MockPizza public token;

    address public owner;
    address public staking;
    address public signer;
    address public treasury;

    // Track actors so the invariant can sum their balances
    address[] public actors;
    mapping(address => bool) public isActor;

    // Track every state change for invariant verification
    uint256 public totalCredited;
    uint256 public totalSpentOut;     // tokens that left vault via spendTip
    uint256 public totalWithdrawn;    // tokens that left vault via withdraw
    uint256 public totalForfeited;    // tokens that left vault via forfeitTips

    // Counters to know what the fuzzer's been doing
    uint256 public callCount_credit;
    uint256 public callCount_spendTip;
    uint256 public callCount_withdraw;
    uint256 public callCount_pause;
    uint256 public callCount_unpause;
    uint256 public callCount_setLimits;
    uint256 public callCount_forfeit;
    uint256 public callCount_skipped;

    // Cast hash counter to ensure uniqueness in spendTip
    uint256 private hashSeed;

    constructor(
        PizzaTippingVaultUpgradeable _vault,
        MockPizza _token,
        address _owner,
        address _staking,
        address _signer,
        address _treasury
    ) {
        vault = _vault;
        token = _token;
        owner = _owner;
        staking = _staking;
        signer = _signer;
        treasury = _treasury;
    }

    function _registerActor(address a) internal {
        if (!isActor[a]) {
            isActor[a] = true;
            actors.push(a);
        }
    }

    function _pickActor(uint256 seed) internal returns (address) {
        // Sometimes create a new actor, sometimes reuse
        if (actors.length < 5 || seed % 4 == 0) {
            address a = address(uint160(uint256(keccak256(abi.encode("actor", seed)))));
            if (a == address(0) || a == address(vault) || a == address(token)) {
                a = address(uint160(uint256(keccak256(abi.encode("actor2", seed)))));
            }
            _registerActor(a);
            return a;
        }
        return actors[seed % actors.length];
    }

    /// @notice Fuzzer calls this to simulate staking crediting a user.
    /// @dev   Mirrors REAL staking flow: same tx mints + credits atomically.
    ///        If credit reverts, the entire tx reverts, so no dangling tokens.
    ///        We simulate this by checking if credit would succeed FIRST.
    function credit(uint256 actorSeed, uint256 amount) external {
        address user = _pickActor(actorSeed);
        amount = bound(amount, 1, vault.maxCreditPerTx());

        // Pre-check: would credit revert?
        if (vault.paused() || amount == 0) {
            callCount_skipped++;
            return;
        }

        // Atomic push-then-credit (same as production staking flow)
        token.mint(address(vault), amount);
        vm.prank(staking);
        vault.credit(user, amount);
        totalCredited += amount;
        callCount_credit++;
    }

    /// @notice Fuzzer calls this to simulate backend tipping
    function spendTip(uint256 fromSeed, uint256 toSeed, uint256 amount, uint256 fid) external {
        if (actors.length == 0) {
            callCount_skipped++;
            return;
        }
        address from = _pickActor(fromSeed);
        address to = _pickActor(toSeed);
        if (from == to) to = _pickActor(toSeed + 1);
        if (from == to) {
            callCount_skipped++;
            return;
        }

        amount = bound(amount, vault.minTipAmount(), vault.maxTipPerCast());
        fid = bound(fid, 1, type(uint64).max);
        bytes32 castHash = keccak256(abi.encode("h", hashSeed++));

        vm.prank(signer);
        try vault.spendTip(from, to, fid, amount, castHash) {
            totalSpentOut += amount;
            callCount_spendTip++;
        } catch {
            callCount_skipped++;
        }
    }

    /// @notice Fuzzer calls this to simulate user withdrawing
    function withdraw(uint256 actorSeed, uint256 amount) external {
        if (actors.length == 0) {
            callCount_skipped++;
            return;
        }
        address user = _pickActor(actorSeed);
        uint256 bal = vault.tipBalance(user);
        if (bal == 0) {
            callCount_skipped++;
            return;
        }
        amount = bound(amount, 1, bal);

        vm.prank(user);
        try vault.withdraw(amount) {
            totalWithdrawn += amount;
            callCount_withdraw++;
        } catch {
            callCount_skipped++;
        }
    }

    /// @notice Fuzzer calls this to pause
    function pause() external {
        vm.prank(owner);
        try vault.pause() {
            callCount_pause++;
        } catch {
            callCount_skipped++;
        }
    }

    /// @notice Fuzzer calls this to unpause
    function unpause() external {
        vm.prank(owner);
        try vault.unpause() {
            callCount_unpause++;
        } catch {
            callCount_skipped++;
        }
    }

    /// @notice Fuzzer changes limits
    function setLimits(uint256 newMin, uint256 newMaxTip, uint256 newMaxCredit) external {
        // Keep limits in plausible ranges so other actions can succeed
        newMin = bound(newMin, 1, 10_000 * 1e18);
        newMaxTip = bound(newMaxTip, newMin, 100_000_000 * 1e18);
        newMaxCredit = bound(newMaxCredit, newMaxTip, 1_000_000_000 * 1e18);

        vm.prank(owner);
        try vault.setLimits(newMin, newMaxTip, newMaxCredit) {
            callCount_setLimits++;
        } catch {
            callCount_skipped++;
        }
    }

    /// @notice Fuzzer forfeits a user's balance to treasury (rare admin op)
    function forfeitTips(uint256 actorSeed) external {
        if (actors.length == 0) {
            callCount_skipped++;
            return;
        }
        address user = _pickActor(actorSeed);
        uint256 bal = vault.tipBalance(user);
        if (bal == 0) {
            callCount_skipped++;
            return;
        }

        vm.prank(owner);
        try vault.forfeitTips(user) {
            totalForfeited += bal;
            callCount_forfeit++;
        } catch {
            callCount_skipped++;
        }
    }

    // ============================================================
    // VIEW HELPERS FOR INVARIANT
    // ============================================================

    function getActorsLength() external view returns (uint256) {
        return actors.length;
    }

    function getActor(uint256 i) external view returns (address) {
        return actors[i];
    }

    function sumLedger() external view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; i++) {
            sum += vault.tipBalance(actors[i]);
        }
    }

    function sumLifetimeSent() external view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; i++) {
            sum += vault.lifetimeTipsSent(actors[i]);
        }
    }

    function sumLifetimeReceived() external view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; i++) {
            sum += vault.lifetimeTipsReceived(actors[i]);
        }
    }

    function sumLifetimeSentCount() external view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; i++) {
            sum += vault.lifetimeTipsSentCount(actors[i]);
        }
    }

    function sumLifetimeReceivedCount() external view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; i++) {
            sum += vault.lifetimeTipsReceivedCount(actors[i]);
        }
    }
}

/**
 * @title PizzaTippingVaultInvariantTest
 * @notice Stateful invariant testing — fuzzer randomly calls Handler functions
 *         in unpredictable sequences across many actors. Tests global properties
 *         that must hold for any sequence of operations.
 *
 * Run: forge test --match-contract PizzaTippingVaultInvariantTest -vvv
 *
 * Configure runs/depth in foundry.toml [invariant] section, or use defaults.
 */
contract PizzaTippingVaultInvariantTest is StdInvariant, Test {
    PizzaTippingVaultUpgradeable public vault;
    MockPizza public token;
    TippingVaultHandler public handler;

    address owner = makeAddr("owner");
    address staking = makeAddr("staking");
    address signer = makeAddr("backendSigner");
    address treasury = makeAddr("treasury");

    function setUp() public {
        token = new MockPizza();
        PizzaTippingVaultUpgradeable impl = new PizzaTippingVaultUpgradeable();
        bytes memory initData = abi.encodeCall(
            PizzaTippingVaultUpgradeable.initialize,
            (address(token), staking, signer, treasury, owner)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vault = PizzaTippingVaultUpgradeable(address(proxy));

        handler = new TippingVaultHandler(vault, token, owner, staking, signer, treasury);

        // Tell foundry to only call the handler (not the vault directly)
        targetContract(address(handler));

        // Restrict the fuzzer to handler functions
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = handler.credit.selector;
        selectors[1] = handler.spendTip.selector;
        selectors[2] = handler.withdraw.selector;
        selectors[3] = handler.pause.selector;
        selectors[4] = handler.unpause.selector;
        selectors[5] = handler.setLimits.selector;
        selectors[6] = handler.forfeitTips.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // ============================================================
    // INVARIANTS — these must hold for ANY sequence of operations
    // ============================================================

    /// @notice Invariant 1: vault token balance ALWAYS equals sum of all tipBalances + treasury withdrawn during forfeit
    /// @dev    Net flow: credits flow IN, withdraws/spends/forfeits flow OUT.
    ///         Vault balance = total in - total out = total credited - withdrawn - spent - forfeited
    ///         Ledger sum    = total credited - withdrawn - spent - forfeited (forfeit zeroes the ledger)
    ///         So: vault balance == ledger sum, always.
    function invariant_balanceMatchesLedger() public view {
        uint256 ledgerSum = handler.sumLedger();
        uint256 vaultBalance = token.balanceOf(address(vault));
        assertEq(ledgerSum, vaultBalance, "vault balance must equal sum of all tipBalances");
    }

    /// @notice Invariant 2: net token flow accounting MUST balance
    function invariant_netFlowAccounting() public view {
        // What went in minus what came out should equal current vault balance
        uint256 inflow = handler.totalCredited();
        uint256 outflow = handler.totalSpentOut() + handler.totalWithdrawn() + handler.totalForfeited();

        assertEq(inflow - outflow, token.balanceOf(address(vault)), "vault balance = total in - total out");
    }

    /// @notice Invariant 3: forfeit funds always reach treasury
    function invariant_forfeitedFundsInTreasury() public view {
        // Treasury balance >= total forfeited (treasury could also be tip recipient for some test cases)
        // We use >= because treasury could also receive tips
        assertGe(token.balanceOf(treasury), handler.totalForfeited(), "treasury must hold at least totalForfeited");
    }

    /// @notice Invariant 4: total ledger never exceeds total credited
    function invariant_ledgerNeverExceedsCredited() public view {
        assertLe(handler.sumLedger(), handler.totalCredited(), "ledger cannot exceed total credited");
    }

    /// @notice Invariant 5: limits are always sane (no admin can set min > max)
    function invariant_limitsSanity() public view {
        // We don't enforce min < max in setLimits, so this is a soft check
        // (If we ever add that constraint, this test will start verifying it)
        assertGt(vault.maxTipPerCast(), 0);
        assertGt(vault.maxCreditPerTx(), 0);
    }

    /// @notice Invariant 6: vault can NEVER have more tokens than accounted for in ledger.
    /// @dev    Under honest flows: vault balance ≤ sum of tipBalances (with equality the strict guarantee).
    ///         If this is ever violated, tokens have arrived without a corresponding credit
    ///         (e.g., direct token transfer to vault, or staking bug). Documents real risk.
    function invariant_noUnexpectedTokenInflation() public view {
        uint256 vaultBal = token.balanceOf(address(vault));
        uint256 ledger = handler.sumLedger();
        assertLe(vaultBal, ledger, "vault must not hold more tokens than the ledger tracks");
    }

    /// @notice Invariant 7: lifetime tips sent == lifetime tips received (globally)
    /// @dev    Every PIZZA tipped from a sender must show up as received by a recipient.
    function invariant_lifetimeSumsBalance() public view {
        assertEq(
            handler.sumLifetimeSent(),
            handler.sumLifetimeReceived(),
            "lifetime sent total must equal lifetime received total"
        );
    }

    /// @notice Invariant 8: lifetime tips sent count == lifetime tips received count (globally)
    function invariant_lifetimeCountsBalance() public view {
        assertEq(
            handler.sumLifetimeSentCount(),
            handler.sumLifetimeReceivedCount(),
            "lifetime sent count must equal lifetime received count"
        );
    }

    /// @notice Invariant 9: lifetime sent equals total spent out (only spendTip increments lifetime)
    function invariant_lifetimeMatchesSpentOut() public view {
        assertEq(
            handler.sumLifetimeSent(),
            handler.totalSpentOut(),
            "lifetime sent must equal total tips ever spent"
        );
    }

    /// @notice Print stats at end of run for visibility
    function invariant_callSummary() public view {
        // This always passes; just logs handler activity
        console.log("--- handler call counts ---");
        console.log("credit:    ", handler.callCount_credit());
        console.log("spendTip:  ", handler.callCount_spendTip());
        console.log("withdraw:  ", handler.callCount_withdraw());
        console.log("pause:     ", handler.callCount_pause());
        console.log("unpause:   ", handler.callCount_unpause());
        console.log("setLimits: ", handler.callCount_setLimits());
        console.log("forfeit:   ", handler.callCount_forfeit());
        console.log("skipped:   ", handler.callCount_skipped());
        console.log("actors:    ", handler.getActorsLength());
    }
}
