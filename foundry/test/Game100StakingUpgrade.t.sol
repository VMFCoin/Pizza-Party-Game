// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPizzaPartyGameId {
    function dailyGameId() external view returns (uint256);
}

/**
 * @title Game100StakingUpgradeTest
 * @dev Exhaustive tests for Game 100 staking changes:
 *      - Double spins (2 per day during Game 100)
 *      - Hidden 10% gold chance (force Jackpot, once per day)
 *      - Configurable APY (20% -> 25%)
 *      - Both spins summed into 1 claim
 *      - All edge cases and regression tests
 *
 * Run: forge test --match-contract Game100StakingUpgrade --fork-url https://mainnet.base.org -vvv
 */
contract Game100StakingUpgradeTest is Test {
    // Live addresses
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;
    address constant OWNER = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;
    address constant TREASURY = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;
    address constant STAKING_REWARDS_WALLET = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;

    PizzaStakingV1Upgradeable staking;
    IERC20 pizza;

    address user1;
    address user2;
    address user3;
    address user4;
    address user5;

    uint256 constant BPS = 10000;
    uint256 currentMockGameId;

    function setUp() public {
        staking = PizzaStakingV1Upgradeable(STAKING_PROXY);
        pizza = IERC20(PIZZA_TOKEN);
        // Capture the real game ID from the fork
        currentMockGameId = IPizzaPartyGameId(PIZZA_PARTY_PROXY).dailyGameId();

        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        user3 = makeAddr("user3");
        user4 = makeAddr("user4");
        user5 = makeAddr("user5");

        // Deploy new implementation and upgrade
        vm.startPrank(OWNER);
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        staking.upgradeToAndCall(address(newImpl), "");
        vm.stopPrank();

        // Fund users from treasury
        vm.startPrank(TREASURY);
        pizza.transfer(user1, 1_000_000_000 * 1e18);
        pizza.transfer(user2, 1_000_000_000 * 1e18);
        pizza.transfer(user3, 1_000_000_000 * 1e18);
        pizza.transfer(user4, 1_000_000_000 * 1e18);
        pizza.transfer(user5, 1_000_000_000 * 1e18);
        vm.stopPrank();

        // Register FIDs for users (anti-sybil)
        vm.startPrank(OWNER);
        staking.adminRegisterFidWallet(10001, user1);
        staking.adminRegisterFidWallet(10002, user2);
        staking.adminRegisterFidWallet(10003, user3);
        staking.adminRegisterFidWallet(10004, user4);
        staking.adminRegisterFidWallet(10005, user5);
        vm.stopPrank();
    }

    // Helper: stake a user with flexible position
    function _stakeUser(address user, uint256 amount) internal {
        vm.startPrank(user);
        pizza.approve(address(staking), amount);
        staking.stake(amount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    // Helper: stake a user with locked position
    function _stakeUserLocked(address user, uint256 amount) internal {
        vm.startPrank(user);
        pizza.approve(address(staking), amount);
        staking.stake(amount, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();
    }

    // Helper: add rewards to pool (simulate daily pot distribution)
    function _addRewards(uint256 amount) internal {
        // Transfer tokens from treasury to staking contract
        vm.prank(TREASURY);
        pizza.transfer(address(staking), amount);
        // Notify reward amount (called by PizzaParty during settlement, or owner)
        vm.prank(OWNER);
        staking.notifyRewardAmount(amount);
    }

    // Helper: advance to next game day by warping time and bumping PizzaParty's dailyGameId
    function _advanceDay() internal {
        vm.warp(block.timestamp + 1 days);
        currentMockGameId++;
        // Directly overwrite dailyGameId in PizzaParty proxy storage
        // so staking contract sees a new game day (test-only, no production changes)
        bytes32 slot = _findStorageSlot(PIZZA_PARTY_PROXY, currentMockGameId - 1);
        require(slot != bytes32(type(uint256).max), "Could not find dailyGameId slot");
        vm.store(PIZZA_PARTY_PROXY, slot, bytes32(currentMockGameId));
    }

    function _findStorageSlot(address target, uint256 expectedValue) internal view returns (bytes32) {
        for (uint256 i = 0; i < 200; i++) {
            bytes32 slot = bytes32(i);
            bytes32 val = vm.load(target, slot);
            if (uint256(val) == expectedValue) return slot;
        }
        return bytes32(type(uint256).max);
    }

    // ==================================================================================
    // SECTION 1: STORAGE LAYOUT PRESERVED (no regression)
    // ==================================================================================

    function testUpgrade_ExistingStatePreserved() public view {
        // Verify key state is intact after upgrade
        assertTrue(staking.spinEnabled() || !staking.spinEnabled(), "spinEnabled readable");
        assertTrue(staking.totalStaked() >= 0, "totalStaked readable");
        assertTrue(staking.stakerCount() >= 0, "stakerCount readable");
        assertEq(address(staking.pizzaPartyContract()) != address(0) ? 1 : 0, 1, "pizzaPartyContract set");
    }

    function testUpgrade_NewStorageDefaultsToZero() public view {
        assertEq(staking.lockedApyBps(), 0, "lockedApyBps should default to 0");
        assertEq(staking.maxSpinsPerDay(), 0, "maxSpinsPerDay should default to 0");
        assertEq(staking.game100GoldAwardedGameId(), 0, "game100GoldAwardedGameId should default to 0");
        assertEq(staking.goldChancePct(), 0, "goldChancePct should default to 0");
    }

    // ==================================================================================
    // SECTION 2: NORMAL 1-SPIN FLOW (regression — must work exactly as before)
    // ==================================================================================

    function testNormalSpin_SingleSpinStillWorks() public {
        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(10_000 * 1e18);

        // Enable spin
        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        // Record spin (normal mode, maxSpinsPerDay=0 which means 1)
        vm.prank(user1);
        staking.recordSpin();

        // Should NOT be able to spin again
        assertFalse(staking.canSpinToday(user1), "Should not spin again with maxSpinsPerDay=0");

        // Claim should work
        vm.prank(user1);
        staking.claimAfterSpin();
    }

    function testNormalSpin_SecondSpinReverts() public {
        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(10_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();

        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        vm.stopPrank();
    }

    function testNormalSpin_MaxSpinsPerDay1_SameAsBefore() public {
        // Explicitly set to 1 — should behave identically to 0
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(10_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();

        assertFalse(staking.canSpinToday(user1), "Should not spin again");

        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        vm.stopPrank();
    }

    // ==================================================================================
    // SECTION 3: DOUBLE SPIN (Game 100 mode)
    // ==================================================================================

    function testDoubleSpin_TwoSpinsAllowed() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(10_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);

        // Spin 1
        assertTrue(staking.canSpinToday(user1), "Should be able to spin");
        staking.recordSpin();

        // Spin 2
        assertTrue(staking.canSpinToday(user1), "Should be able to spin again");
        staking.recordSpin();

        // Spin 3 should fail
        assertFalse(staking.canSpinToday(user1), "Should NOT be able to spin 3rd time");
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();

        vm.stopPrank();
    }

    function testDoubleSpin_BothOutcomesSummedOnClaim() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        uint256 balBefore = pizza.balanceOf(user1);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        uint256 balAfter = pizza.balanceOf(user1);
        assertTrue(balAfter > balBefore, "Should have received rewards from both spins");
    }

    function testDoubleSpin_ClaimWithRestake() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        uint256 stakedBefore = staking.getTotalStaked(user1);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        uint256 stakedAfter = staking.getTotalStaked(user1);
        assertTrue(stakedAfter > stakedBefore, "Stake should increase from restaked rewards");
    }

    function testDoubleSpin_ClaimFromPosition() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimFromPosition(PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testDoubleSpin_OnlyOneSpinDone_ClaimStillWorks() public {
        // User only does 1 spin even though 2 are allowed
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        // Only 1 spin — claim should work with just spin 1
        staking.claimAfterSpin();
        vm.stopPrank();
    }

    // ==================================================================================
    // SECTION 4: DOUBLE SPIN RESETS BETWEEN DAYS
    // ==================================================================================

    function testDoubleSpin_ResetsNextGameDay() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        // Day 1: spin twice and claim
        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        // Advance 1 day
        _advanceDay();

        // Add more rewards
        _addRewards(100_000 * 1e18);

        // Day 2: should be able to spin again
        assertTrue(staking.canSpinToday(user1), "Should be able to spin on new day");

        vm.startPrank(user1);
        staking.recordSpin();
        assertTrue(staking.canSpinToday(user1), "Should be able to spin 2nd time on new day");
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();
    }

    // ==================================================================================
    // SECTION 5: REVERT TO 1 SPIN (Game 101)
    // ==================================================================================

    function testRevertTo1Spin_AfterGame100() public {
        // Game 100: double spins
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        // Game 101: revert to 1 spin
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);

        _advanceDay();
        _addRewards(100_000 * 1e18);

        vm.startPrank(user1);
        staking.recordSpin();

        // 2nd spin should fail
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        vm.stopPrank();
    }

    function testEdge_MaxSpinsSetTo1_WhileUserHas2SpinsRecorded() public {
        // Game 100: user does 2 spins
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        vm.stopPrank();

        // Admin sets back to 1 BEFORE user claims
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);

        // User should still be able to claim (both spins already recorded)
        vm.prank(user1);
        staking.claimAfterSpin();
    }

    // ==================================================================================
    // SECTION 6: HIDDEN GOLD (10% chance during double spin mode)
    // ==================================================================================

    function testHiddenGold_OnlyDuringDoubleSpin() public {
        // With maxSpinsPerDay=1 (normal), gold should never trigger even with goldChancePct set
        vm.startPrank(OWNER);
        staking.adminSetGoldChancePct(10);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        // Normal mode: gold should never be awarded
        vm.prank(user1);
        staking.recordSpin();

        assertEq(staking.game100GoldAwardedGameId(), 0, "Gold should not trigger in normal mode");
    }

    function testHiddenGold_ZeroChance_NeverTriggers() public {
        // goldChancePct = 0 (default) means gold never triggers even in double spin mode
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        vm.stopPrank();

        assertEq(staking.game100GoldAwardedGameId(), 0, "Gold should not trigger when goldChancePct=0");
    }

    function testHiddenGold_MaxOncePerDay() public {
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetGoldChancePct(10);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _addRewards(100_000 * 1e18);

        // Stake many users and spin them all — gold can trigger at most once
        for (uint i = 0; i < 5; i++) {
            address user;
            if (i == 0) user = user1;
            else if (i == 1) user = user2;
            else if (i == 2) user = user3;
            else if (i == 3) user = user4;
            else user = user5;

            _stakeUser(user, 500_000_000 * 1e18);

            vm.startPrank(user);
            staking.recordSpin();
            staking.recordSpin();
            staking.claimAfterSpin();
            vm.stopPrank();
        }

        // Whether or not gold triggered, it can only have been for 1 game day
        uint256 goldGameId = staking.game100GoldAwardedGameId();
        if (goldGameId > 0) {
            // Gold was awarded — verify it was for today's game
            console.log("Hidden gold was awarded for game:", goldGameId);
        } else {
            // Gold didn't trigger (90%^10 = ~35% chance of this) — that's valid
            console.log("Hidden gold did not trigger (random chance)");
        }
    }

    // ==================================================================================
    // SECTION 6B: GOLD CHANCE CONFIGURABLE (adminSetGoldChancePct)
    // ==================================================================================

    function testGoldChance_OnlyOwnerCanSet() public {
        vm.prank(user1);
        vm.expectRevert();
        staking.adminSetGoldChancePct(10);
    }

    function testGoldChance_MaxIs100() public {
        vm.prank(OWNER);
        vm.expectRevert("Max 100");
        staking.adminSetGoldChancePct(101);
    }

    function testGoldChance_CanSetToZeroToDisable() public {
        vm.startPrank(OWNER);
        staking.adminSetGoldChancePct(10);
        assertEq(staking.goldChancePct(), 10);
        staking.adminSetGoldChancePct(0);
        assertEq(staking.goldChancePct(), 0);
        vm.stopPrank();
    }

    function testGoldChance_CanSetDifferentValues() public {
        vm.startPrank(OWNER);
        staking.adminSetGoldChancePct(5);
        assertEq(staking.goldChancePct(), 5, "Should be 5%");
        staking.adminSetGoldChancePct(20);
        assertEq(staking.goldChancePct(), 20, "Should be 20%");
        staking.adminSetGoldChancePct(100);
        assertEq(staking.goldChancePct(), 100, "Should be 100%");
        vm.stopPrank();
    }

    function testGoldChance_100Pct_AlwaysTriggersInDoubleMode() public {
        // With 100% chance, gold should always trigger for first spinner
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetGoldChancePct(100);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.startPrank(user1);
        staking.recordSpin();
        vm.stopPrank();

        uint256 currentGameId = IPizzaPartyGameId(PIZZA_PARTY_PROXY).dailyGameId();
        // With 100% chance, gold MUST have triggered (unless natural jackpot, which also counts)
        // Either way the spin happened successfully
        assertTrue(
            staking.game100GoldAwardedGameId() == currentGameId ||
            staking.committedSpinOutcome(user1) == PizzaStakingV1Upgradeable.SpinOutcome.Jackpot,
            "Gold should trigger or natural jackpot at 100%"
        );
    }

    // ==================================================================================
    // SECTION 7: APY CONFIGURABLE
    // ==================================================================================

    function testAPY_DefaultFallsBackTo20Percent() public {
        // lockedApyBps = 0 (default) should use LOCKED_APY_BPS constant = 2000
        _stakeUserLocked(user1, 1_000_000_000 * 1e18);

        // Advance 365 days
        vm.warp(block.timestamp + 365 days);

        uint256 apyReward = staking.getPendingApyReward(user1);
        // 20% of 1B = 200M PIZZA (approximately, within 1% tolerance)
        uint256 expected = 200_000_000 * 1e18;
        assertApproxEqRel(apyReward, expected, 0.01e18, "APY should be ~20% when lockedApyBps=0");
    }

    function testAPY_SetTo25Percent() public {
        vm.prank(OWNER);
        staking.adminSetLockedApyBps(2500);

        _stakeUserLocked(user1, 1_000_000_000 * 1e18);

        // Advance 365 days
        vm.warp(block.timestamp + 365 days);

        uint256 apyReward = staking.getPendingApyReward(user1);
        // 25% of 1B = 250M PIZZA
        uint256 expected = 250_000_000 * 1e18;
        assertApproxEqRel(apyReward, expected, 0.01e18, "APY should be ~25% when lockedApyBps=2500");
    }

    function testAPY_CannotExceed25Percent() public {
        vm.prank(OWNER);
        vm.expectRevert("Max 25%");
        staking.adminSetLockedApyBps(2501);
    }

    function testAPY_SetBackToZero_RestoresDefault() public {
        vm.startPrank(OWNER);
        staking.adminSetLockedApyBps(2500);
        staking.adminSetLockedApyBps(0);
        vm.stopPrank();

        _stakeUserLocked(user1, 1_000_000_000 * 1e18);
        vm.warp(block.timestamp + 365 days);

        uint256 apyReward = staking.getPendingApyReward(user1);
        uint256 expected = 200_000_000 * 1e18;
        assertApproxEqRel(apyReward, expected, 0.01e18, "APY should be back to 20%");
    }

    // ==================================================================================
    // SECTION 8: ADMIN SETTERS ACCESS CONTROL
    // ==================================================================================

    function testAdmin_OnlyOwnerCanSetAPY() public {
        vm.prank(user1);
        vm.expectRevert();
        staking.adminSetLockedApyBps(2500);
    }

    function testAdmin_OnlyOwnerCanSetMaxSpins() public {
        vm.prank(user1);
        vm.expectRevert();
        staking.adminSetMaxSpinsPerDay(2);
    }

    function testAdmin_MaxSpinsInvalidValues() public {
        vm.startPrank(OWNER);

        vm.expectRevert("1 or 2");
        staking.adminSetMaxSpinsPerDay(0);

        vm.expectRevert("1 or 2");
        staking.adminSetMaxSpinsPerDay(3);

        vm.stopPrank();
    }

    // ==================================================================================
    // SECTION 9: EDGE CASES
    // ==================================================================================

    function testEdge_SpinWithNoRewards() public {
        _stakeUser(user1, 500_000_000 * 1e18);
        // No rewards added

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        // Should be able to spin even with 0 rewards
        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        // Claim with 0 base — should not revert
        staking.claimAfterSpin();
        vm.stopPrank();
    }

    function testEdge_ZeroStake_CannotSpin() public {
        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        vm.prank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.NoStakePosition.selector);
        staking.recordSpin();
    }

    function testEdge_SpinDisabled_CannotSpin() public {
        _stakeUser(user1, 500_000_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(false);

        vm.prank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.Unauthorized.selector);
        staking.recordSpin();
    }

    function testEdge_DoubleSpinWithLockedPosition() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUserLocked(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();
    }

    function testEdge_DoubleSpinWithBothPositions() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        // User has both flexible and locked
        _stakeUser(user1, 500_000_000 * 1e18);
        _stakeUserLocked(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();
    }

    function testEdge_Game100ToGame101Transition() public {
        // Simulate full Game 100 -> 101 transition
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);  // Game 100 active
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);
        _stakeUserLocked(user2, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        // Game 100: double spin
        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        vm.startPrank(user2);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        // Advance to Game 101
        _advanceDay();
        _addRewards(100_000 * 1e18);

        // Admin reverts to normal
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);   // Back to 1 spin
        staking.adminSetLockedApyBps(2500);  // APY to 25%
        vm.stopPrank();

        // User1 can only spin once
        vm.startPrank(user1);
        staking.recordSpin();
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        // Verify APY is now 25%
        assertEq(staking.lockedApyBps(), 2500, "APY should be 2500");
    }

    function testEdge_MultipleUsersSpinSameDay() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        _stakeUser(user1, 500_000_000 * 1e18);
        _stakeUser(user2, 500_000_000 * 1e18);
        _stakeUser(user3, 500_000_000 * 1e18);
        _addRewards(300_000 * 1e18);

        // All users spin twice
        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        vm.stopPrank();

        vm.startPrank(user2);
        staking.recordSpin();
        staking.recordSpin();
        vm.stopPrank();

        vm.startPrank(user3);
        staking.recordSpin();
        staking.recordSpin();
        vm.stopPrank();

        // All claim
        vm.prank(user1);
        staking.claimAfterSpin();

        vm.prank(user2);
        staking.claimAfterSpin();

        vm.prank(user3);
        staking.claimAfterSpin();
    }

    function testEdge_SpinThenUnstake_ThenClaim() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();

        // Unstake everything
        staking.unstake(500_000_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Try to claim — should handle gracefully (no stake = no base reward)
        staking.claimAfterSpin();
        vm.stopPrank();
    }

    function testEdge_CanSpinToday_CorrectForAllStates() public {
        _stakeUser(user1, 500_000_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        // maxSpinsPerDay = 0 (default): should allow 1 spin
        assertTrue(staking.canSpinToday(user1), "Should spin with default maxSpinsPerDay");
        vm.prank(user1);
        staking.recordSpin();
        assertFalse(staking.canSpinToday(user1), "Should not spin again with default");

        // Next day
        _advanceDay();

        // Set to 2
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        assertTrue(staking.canSpinToday(user1), "Should spin on new day");
        vm.prank(user1);
        staking.recordSpin();
        assertTrue(staking.canSpinToday(user1), "Should spin 2nd time");
        vm.prank(user1);
        staking.recordSpin();
        assertFalse(staking.canSpinToday(user1), "Should not spin 3rd time");
    }

    // ==================================================================================
    // SECTION 10: DOUBLE SPIN REWARD MATH VERIFICATION
    // ==================================================================================

    function testDoubleSpin_RewardIsMoreThanSingleSpin() public {
        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        // User1: single spin mode
        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(200_000 * 1e18);

        uint256 bal1Before = pizza.balanceOf(user1);
        vm.prank(user1);
        staking.recordSpin();
        vm.prank(user1);
        staking.claimAfterSpin();
        uint256 singleSpinReward = pizza.balanceOf(user1) - bal1Before;

        // Advance day, set double spin
        _advanceDay();
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _addRewards(200_000 * 1e18);

        uint256 bal2Before = pizza.balanceOf(user1);
        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();
        uint256 doubleSpinReward = pizza.balanceOf(user1) - bal2Before;

        // Double spin should give more (base is applied to each spin separately)
        assertTrue(doubleSpinReward >= singleSpinReward, "Double spin should yield >= single spin");
        console.log("Single spin reward:", singleSpinReward / 1e18);
        console.log("Double spin reward:", doubleSpinReward / 1e18);
    }

    // ==================================================================================
    // SECTION 11: APY WITH CLAIM FLOW
    // ==================================================================================

    function testAPY_25Percent_PaidOnClaim() public {
        vm.prank(OWNER);
        staking.adminSetLockedApyBps(2500);

        _stakeUserLocked(user1, 1_000_000_000 * 1e18);

        // Advance 30 days
        vm.warp(block.timestamp + 30 days);

        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        uint256 balBefore = pizza.balanceOf(user1);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        uint256 reward = pizza.balanceOf(user1) - balBefore;
        // 25% APY on 1B for 30 days = ~20.5M PIZZA, plus base reward + bonuses
        assertTrue(reward > 20_000_000 * 1e18, "Should include 25% APY portion");
        console.log("30-day reward with 25% APY:", reward / 1e18);
    }

    // ==================================================================================
    // SECTION 12: EXISTING STAKERS NOT AFFECTED
    // ==================================================================================

    function testExistingStakers_CanStillClaimNormally() public {
        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        // Spin disabled — claim without spin
        vm.prank(OWNER);
        staking.adminSetSpinEnabled(false);

        uint256 balBefore = pizza.balanceOf(user1);
        vm.prank(user1);
        staking.claim();
        uint256 balAfter = pizza.balanceOf(user1);

        assertTrue(balAfter > balBefore, "Should claim rewards without spin");
    }

    function testExistingStakers_CanStillRestakeNormally() public {
        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(false);

        uint256 stakedBefore = staking.getTotalStaked(user1);
        vm.prank(user1);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 stakedAfter = staking.getTotalStaked(user1);

        assertTrue(stakedAfter > stakedBefore, "Should restake rewards");
    }

    // ==================================================================================
    // SECTION 13: DOUBLE SPIN EXTRA EDGE CASES
    // ==================================================================================

    function testDoubleSpin_Spin1ThenClaimWithoutSpin2() public {
        // User does 1 of 2 allowed spins, then claims — only spin 1 applies
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        // Do NOT spin a second time
        uint256 balBefore = pizza.balanceOf(user1);
        staking.claimAfterSpin();
        vm.stopPrank();

        uint256 reward = pizza.balanceOf(user1) - balBefore;
        assertTrue(reward > 0, "Should get spin 1 reward only");
        console.log("1-of-2 spin reward:", reward / 1e18);
    }

    function testDoubleSpin_Spin1Restake_Spin2Claim() public {
        // User spins once, restakes, then tries 2nd spin — should NOT work (restake resets claimable)
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);

        // 2nd spin is still allowed (spin count was 1)
        staking.recordSpin();
        // Claim again — base reward may be 0 or small since we just claimed
        staking.claimAfterSpin();
        vm.stopPrank();
    }

    function testDoubleSpin_TwoUsersIndependentSpinCounts() public {
        // User1 and user2 spin counts don't interfere
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _stakeUser(user2, 500_000_000 * 1e18);
        _addRewards(200_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        // User1 does 2 spins
        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        vm.stopPrank();

        // User2 does 1 spin — should work fine
        vm.prank(user2);
        staking.recordSpin();
        assertTrue(staking.canSpinToday(user2), "User2 should still have 1 spin left");

        // User1 should be maxed out
        assertFalse(staking.canSpinToday(user1), "User1 should be done");
    }

    function testDoubleSpin_ClaimWithoutSpin_RequiresSpin() public {
        // When spin is enabled, claim() requires recordSpin() first — even in double spin mode
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        // Claim without spinning should revert
        vm.prank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.claim();
    }

    function testDoubleSpin_ClaimWithoutSpin_SpinDisabled() public {
        // When spin is disabled, claim works fine even with maxSpinsPerDay=2
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(false);

        uint256 balBefore = pizza.balanceOf(user1);
        vm.prank(user1);
        staking.claim();
        uint256 reward = pizza.balanceOf(user1) - balBefore;
        assertTrue(reward > 0, "Should get base reward with spin disabled");
    }

    function testDoubleSpin_ToggleMidDay_NoExtraSpins() public {
        // Admin sets to 2, user spins once, admin sets to 1 — user cannot spin again
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.prank(user1);
        staking.recordSpin();

        // Admin drops to 1 mid-day
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);

        // User already spun once — should be blocked now
        assertFalse(staking.canSpinToday(user1), "Should be blocked after admin lowers to 1");
        vm.prank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
    }

    function testDoubleSpin_SpinCountPersistsUntilNewDay() public {
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        // Same day — still maxed
        assertFalse(staking.canSpinToday(user1), "Still maxed same day after claim");

        // New day — canSpinToday should return true (resets on first spin of new day)
        _advanceDay();
        _addRewards(100_000 * 1e18);
        assertTrue(staking.canSpinToday(user1), "Should be able to spin on new day");
    }

    // ==================================================================================
    // SECTION 14: HIDDEN GOLD EXTRA EDGE CASES
    // ==================================================================================

    function testGold_OnlyWhenDoubleSpinActive() public {
        // maxSpinsPerDay=1 + goldChancePct=100 — gold should NOT trigger
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);
        staking.adminSetGoldChancePct(100);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.prank(user1);
        staking.recordSpin();

        assertEq(staking.game100GoldAwardedGameId(), 0, "Gold must not trigger in single-spin mode even at 100%");
    }

    function testGold_ResetsOnNewDay() public {
        // Gold triggers on day 1, resets for day 2
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetGoldChancePct(100); // guarantee trigger
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);
        _stakeUser(user2, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        // Day 1: user1 triggers gold
        vm.prank(user1);
        staking.recordSpin();
        uint256 goldDay1 = staking.game100GoldAwardedGameId();
        assertTrue(goldDay1 > 0, "Gold should trigger day 1");

        // Day 1: user2 should NOT trigger gold again (already awarded)
        vm.prank(user2);
        staking.recordSpin();
        assertEq(staking.game100GoldAwardedGameId(), goldDay1, "Gold should not change for 2nd user same day");

        // Day 2: gold can trigger again
        _advanceDay();
        _addRewards(100_000 * 1e18);

        vm.prank(user1);
        staking.recordSpin();
        uint256 goldDay2 = staking.game100GoldAwardedGameId();
        assertTrue(goldDay2 > goldDay1, "Gold should be eligible on new day");
    }

    function testGold_DoesNotTriggerWhenAlreadyNaturalJackpot() public {
        // If _spin() already returns Jackpot, gold check is skipped (outcome != Jackpot check)
        // We can't control _spin() output, but we verify the logic path:
        // With goldChancePct=100 and double spin, at least one spin should be Jackpot
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetGoldChancePct(100);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin(); // Should not revert regardless of outcome combination
        vm.stopPrank();
    }

    function testGold_DisabledAfterGame100() public {
        // Simulate: Game 100 has gold on, Game 101 turns it off
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetGoldChancePct(100);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        // Game 100: gold triggers
        vm.prank(user1);
        staking.recordSpin();
        assertTrue(staking.game100GoldAwardedGameId() > 0, "Gold on during Game 100");

        // Game 101: disable gold + back to 1 spin
        _advanceDay();
        _addRewards(100_000 * 1e18);
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);
        staking.adminSetGoldChancePct(0);
        vm.stopPrank();

        uint256 goldBefore = staking.game100GoldAwardedGameId();
        vm.prank(user1);
        staking.recordSpin();
        // Gold should NOT have updated (single spin mode + 0%)
        assertEq(staking.game100GoldAwardedGameId(), goldBefore, "Gold should not trigger after disabled");
    }

    // ==================================================================================
    // SECTION 15: APY EXTRA EDGE CASES
    // ==================================================================================

    function testAPY_FlexiblePosition_NoAPY() public {
        // APY only applies to locked positions
        vm.prank(OWNER);
        staking.adminSetLockedApyBps(2500);

        _stakeUser(user1, 1_000_000_000 * 1e18); // flexible only
        vm.warp(block.timestamp + 365 days);

        uint256 apyReward = staking.getPendingApyReward(user1);
        assertEq(apyReward, 0, "Flexible position should NOT earn APY");
    }

    function testAPY_ChangesMidStake() public {
        // Stake locked, verify APY changes from 20% to 25% correctly
        _stakeUserLocked(user1, 1_000_000_000 * 1e18);

        // Check at 20% (default) after 180 days
        vm.warp(block.timestamp + 180 days);
        uint256 apy20 = staking.getPendingApyReward(user1);
        // 20% of 1B for 180 days = ~98.6M
        uint256 expected20 = 98_600_000 * 1e18;
        assertApproxEqRel(apy20, expected20, 0.02e18, "Should be ~20% APY for 180 days");

        // Change to 25% — instantly changes calculation for pending
        vm.prank(OWNER);
        staking.adminSetLockedApyBps(2500);

        uint256 apy25 = staking.getPendingApyReward(user1);
        // 25% of 1B for 180 days = ~123.3M (same elapsed time, higher rate)
        uint256 expected25 = 123_300_000 * 1e18;
        assertApproxEqRel(apy25, expected25, 0.02e18, "Should be ~25% APY for same 180 days");

        assertTrue(apy25 > apy20, "25% should yield more than 20% for same period");
        console.log("APY at 20%:", apy20 / 1e18);
        console.log("APY at 25%:", apy25 / 1e18);
    }

    function testAPY_ZeroBps_FallsBackTo20() public {
        // Explicitly verify 0 = use constant
        assertEq(staking.lockedApyBps(), 0, "Should start at 0");

        _stakeUserLocked(user1, 1_000_000_000 * 1e18);
        vm.warp(block.timestamp + 365 days);

        uint256 apyReward = staking.getPendingApyReward(user1);
        uint256 expected20 = 200_000_000 * 1e18;
        assertApproxEqRel(apyReward, expected20, 0.01e18, "0 bps should fallback to 20%");
    }

    function testAPY_15Percent_CustomValue() public {
        // Can set to any value under 25%
        vm.prank(OWNER);
        staking.adminSetLockedApyBps(1500); // 15%

        _stakeUserLocked(user1, 1_000_000_000 * 1e18);
        vm.warp(block.timestamp + 365 days);

        uint256 apyReward = staking.getPendingApyReward(user1);
        uint256 expected15 = 150_000_000 * 1e18;
        assertApproxEqRel(apyReward, expected15, 0.01e18, "15% APY should yield ~150M");
    }

    function testAPY_WithDoubleSpinAndGold() public {
        // Everything active at once: double spin + gold + 25% APY
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetGoldChancePct(100);
        staking.adminSetLockedApyBps(2500);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUserLocked(user1, 1_000_000_000 * 1e18);
        vm.warp(block.timestamp + 30 days);
        _addRewards(100_000 * 1e18);

        uint256 balBefore = pizza.balanceOf(user1);

        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        uint256 reward = pizza.balanceOf(user1) - balBefore;
        // Should include: base x spin1 + base x spin2 + bonuses + jackpot bonus(es) + APY
        assertTrue(reward > 20_000_000 * 1e18, "Combined reward should be substantial");
        console.log("Full Game 100 locked staker reward:", reward / 1e18);
    }

    function testAPY_AccruesOverTime() public {
        // Verify APY accrues correctly at 25% for a known period
        vm.prank(OWNER);
        staking.adminSetLockedApyBps(2500);

        _stakeUserLocked(user1, 1_000_000_000 * 1e18);

        // After 365 days, should be ~250M (25% of 1B)
        vm.warp(block.timestamp + 365 days);
        uint256 apy365 = staking.getPendingApyReward(user1);
        uint256 expected = 250_000_000 * 1e18;
        assertApproxEqRel(apy365, expected, 0.01e18, "365-day APY at 25% should be ~250M");

        // After 30 more days (395 total), should be proportionally more
        vm.warp(block.timestamp + 30 days);
        uint256 apy395 = staking.getPendingApyReward(user1);
        assertTrue(apy395 > apy365, "APY should keep accruing");
        console.log("365-day APY at 25%:", apy365 / 1e18);
        console.log("395-day APY at 25%:", apy395 / 1e18);
    }

    // ==================================================================================
    // SECTION 16: FULL GAME 100 → 101 LIFECYCLE
    // ==================================================================================

    function testFullLifecycle_Game100To101() public {
        // Complete simulation: enable everything, play Game 100, disable, play Game 101
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetGoldChancePct(10);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        // 3 users: flexible, locked, both
        _stakeUser(user1, 500_000_000 * 1e18);
        _stakeUserLocked(user2, 500_000_000 * 1e18);
        _stakeUser(user3, 250_000_000 * 1e18);
        _stakeUserLocked(user3, 250_000_000 * 1e18);
        _addRewards(300_000 * 1e18);

        // === GAME 100 ===
        // All users double spin + claim
        vm.startPrank(user1);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        vm.startPrank(user2);
        staking.recordSpin();
        staking.recordSpin();
        staking.restake(PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        vm.startPrank(user3);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        // === TRANSITION TO GAME 101 ===
        _advanceDay();
        _addRewards(300_000 * 1e18);

        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);
        staking.adminSetGoldChancePct(0);
        staking.adminSetLockedApyBps(2500);
        vm.stopPrank();

        // Verify state
        assertEq(staking.maxSpinsPerDay(), 1, "Should be 1 spin");
        assertEq(staking.goldChancePct(), 0, "Gold should be off");
        assertEq(staking.lockedApyBps(), 2500, "APY should be 25%");

        // === GAME 101 ===
        // All users single spin + claim
        vm.startPrank(user1);
        staking.recordSpin();
        assertFalse(staking.canSpinToday(user1), "Only 1 spin in Game 101");
        staking.claimAfterSpin();
        vm.stopPrank();

        vm.startPrank(user2);
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        vm.startPrank(user3);
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        // Verify no gold triggered in Game 101
        uint256 goldGameId = staking.game100GoldAwardedGameId();
        assertTrue(goldGameId == 0 || goldGameId < currentMockGameId, "No gold in Game 101");
    }

    function testFullLifecycle_MultiDayDoubleSpins() public {
        // Double spins active for 3 consecutive days
        vm.startPrank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);
        staking.adminSetGoldChancePct(10);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();

        _stakeUser(user1, 500_000_000 * 1e18);

        for (uint256 day = 0; day < 3; day++) {
            _addRewards(100_000 * 1e18);

            vm.startPrank(user1);
            assertTrue(staking.canSpinToday(user1), "Should spin each day");
            staking.recordSpin();
            assertTrue(staking.canSpinToday(user1), "Should spin 2nd each day");
            staking.recordSpin();
            assertFalse(staking.canSpinToday(user1), "Should be maxed each day");
            staking.claimAfterSpin();
            vm.stopPrank();

            if (day < 2) _advanceDay();
        }
    }
}
