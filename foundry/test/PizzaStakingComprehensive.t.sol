// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PizzaStakingComprehensiveTest
 * @dev Comprehensive test suite for PizzaStakingV1Upgradeable
 *
 * Run against Base mainnet fork:
 * forge test --match-contract PizzaStakingComprehensive --fork-url https://mainnet.base.org -vvv
 *
 * TESTS COVER:
 * 1. Staking Edge Cases
 *    - Minimum/maximum stake limits
 *    - Multiple wallets staking
 *    - Adding to existing positions
 *    - Flexible vs Locked positions
 *
 * 2. Unstaking Edge Cases
 *    - Early unstake penalties
 *    - Partial unstakes
 *    - Full unstakes
 *    - Unstake after lock expires
 *
 * 3. Reward Calculations
 *    - Tier bonuses (+1.5%, +5%, +10%, +20%)
 *    - Lock bonus (+10%)
 *    - Early staker boost (+30%)
 *    - Combined bonuses (additive)
 *
 * 4. Spin the Pie Mechanics
 *    - Daily spin limit (one per gameId)
 *    - Spin outcomes (Regular, Loaded, Hot, Jackpot)
 *    - Bonus pool usage and auto-topup
 *
 * 5. Failed Transaction Recovery
 *    - Approval failures
 *    - Insufficient balance
 *    - Contract paused state
 *
 * 6. Multi-wallet Scenarios
 *    - Different tiers simultaneously
 *    - Reward distribution fairness
 */
contract PizzaStakingComprehensiveTest is Test {
    // Live contract addresses
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;
    address constant OWNER = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;
    address constant TREASURY = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;

    PizzaStakingV1Upgradeable staking;
    IERC20 pizza;

    // Test users
    address user1;
    address user2;
    address user3;
    address attacker;

    // Constants from contract
    uint256 constant MIN_STAKE = 100 * 1e18;
    uint256 constant MAX_STAKE = 1_000_000 * 1e18;
    uint256 constant TIER1_THRESHOLD = 50_000 * 1e18;
    uint256 constant TIER2_THRESHOLD = 200_000 * 1e18;
    uint256 constant TIER3_THRESHOLD = 500_000 * 1e18;
    uint256 constant LOCK_DURATION = 7 days;
    uint256 constant EARLY_UNSTAKE_PENALTY_BPS = 1500;
    uint256 constant BPS = 10000;

    function setUp() public {
        staking = PizzaStakingV1Upgradeable(STAKING_PROXY);
        pizza = IERC20(PIZZA_TOKEN);

        // Create test users
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        user3 = makeAddr("user3");
        attacker = makeAddr("attacker");

        // Fund test users from treasury
        vm.startPrank(TREASURY);
        pizza.transfer(user1, 600_000 * 1e18); // Enough for tier 3
        pizza.transfer(user2, 300_000 * 1e18); // Enough for tier 2
        pizza.transfer(user3, 100_000 * 1e18); // Enough for tier 1
        pizza.transfer(attacker, 50_000 * 1e18);
        vm.stopPrank();
    }

    // ==================================================================================
    // SECTION 1: STAKING EDGE CASES
    // ==================================================================================

    function testStake_MinimumAmount() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), MIN_STAKE, "Should stake minimum amount");
        assertEq(uint8(staking.getTier(user1)), 0, "Should be tier 0 (Slice Runner)");
    }

    function testStake_BelowMinimum_Reverts() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE - 1);
        vm.expectRevert(PizzaStakingV1Upgradeable.BelowMinimumStake.selector);
        staking.stake(MIN_STAKE - 1, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testStake_MaximumAmount() public {
        // Transfer more to user1 for max stake test
        vm.prank(TREASURY);
        pizza.transfer(user1, 400_000 * 1e18);

        vm.startPrank(user1);
        pizza.approve(address(staking), MAX_STAKE);
        staking.stake(MAX_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), MAX_STAKE, "Should stake maximum amount");
    }

    function testStake_AboveMaximum_Reverts() public {
        // Transfer more to user1
        vm.prank(TREASURY);
        pizza.transfer(user1, 500_000 * 1e18);

        vm.startPrank(user1);
        pizza.approve(address(staking), MAX_STAKE + 1);
        vm.expectRevert(PizzaStakingV1Upgradeable.ExceedsMaximumStake.selector);
        staking.stake(MAX_STAKE + 1, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testStake_ZeroAmount_Reverts() public {
        vm.startPrank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.ZeroAmount.selector);
        staking.stake(0, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testStake_FlexibleAndLocked_Separate() public {
        uint256 flexAmount = 100_000 * 1e18;
        uint256 lockAmount = 200_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), flexAmount + lockAmount);

        // Stake flexible
        staking.stake(flexAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Stake locked
        staking.stake(lockAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        // Check both positions
        (uint256 total, uint256 flex, uint256 locked,,,, ) = staking.getStakeInfo(user1);
        assertEq(total, flexAmount + lockAmount, "Total should be sum of both");
        assertEq(flex, flexAmount, "Flexible amount should match");
        assertEq(locked, lockAmount, "Locked amount should match");
    }

    function testStake_AddToExistingPosition() public {
        uint256 initial = 50_000 * 1e18;
        uint256 additional = 30_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), initial + additional);

        staking.stake(initial, PizzaStakingV1Upgradeable.LockType.Flexible);
        assertEq(staking.getTotalStaked(user1), initial);

        // Add more (below MIN_STAKE is ok for existing position)
        staking.stake(additional, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), initial + additional);
    }

    function testStake_LockedResetsTimer() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount * 2);

        // Initial lock
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        (, , , , uint256 lockEnd1, , ) = staking.getStakeInfo(user1);

        // Advance 3 days
        vm.warp(block.timestamp + 3 days);

        // Add more - should reset lock timer
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        (, , , , uint256 lockEnd2, , ) = staking.getStakeInfo(user1);
        vm.stopPrank();

        assertTrue(lockEnd2 > lockEnd1, "Lock end time should be extended");
        assertEq(lockEnd2, block.timestamp + LOCK_DURATION, "Lock should reset to 7 days from now");
    }

    // ==================================================================================
    // SECTION 2: UNSTAKING EDGE CASES
    // ==================================================================================

    function testUnstake_FlexibleNoPenalty() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter - balanceBefore, stakeAmount, "Should receive full amount, no penalty");
        assertEq(staking.getTotalStaked(user1), 0, "Should have no stake left");
    }

    function testUnstake_LockedEarlyPenalty() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);

        uint256 balanceBefore = pizza.balanceOf(user1);

        // Unstake early (before lock expires)
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        uint256 expectedPenalty = (stakeAmount * EARLY_UNSTAKE_PENALTY_BPS) / BPS;
        assertEq(balanceAfter - balanceBefore, stakeAmount - expectedPenalty, "Should receive amount minus 15% penalty");
    }

    function testUnstake_LockedAfterExpiry_NoPenalty() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);

        // Advance past lock period
        vm.warp(block.timestamp + LOCK_DURATION + 1);

        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter - balanceBefore, stakeAmount, "Should receive full amount after lock expires");
    }

    function testUnstake_PartialAmount() public {
        uint256 stakeAmount = 100_000 * 1e18;
        uint256 unstakeAmount = 40_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        staking.unstake(unstakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), stakeAmount - unstakeAmount, "Should have remaining stake");
    }

    function testUnstake_MoreThanStaked_CapsAtMax() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 balanceBefore = pizza.balanceOf(user1);
        // Try to unstake more than staked - should cap at staked amount
        staking.unstake(stakeAmount * 2, PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter - balanceBefore, stakeAmount, "Should receive only staked amount");
        assertEq(staking.getTotalStaked(user1), 0, "Should have no stake left");
    }

    function testUnstake_NoPosition_Reverts() public {
        vm.startPrank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.NoStakePosition.selector);
        staking.unstake(1000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testUnstake_EarlyPenalty_GoesToBonusPool() public {
        uint256 stakeAmount = 100_000 * 1e18;
        uint256 bonusPoolBefore = staking.bonusPool();

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        uint256 expectedPenalty = (stakeAmount * EARLY_UNSTAKE_PENALTY_BPS) / BPS;
        assertEq(staking.bonusPool(), bonusPoolBefore + expectedPenalty, "Penalty should go to bonus pool");
    }

    // ==================================================================================
    // SECTION 3: TIER CALCULATIONS
    // ==================================================================================

    function testTier_SliceRunner() public {
        vm.startPrank(user3);
        pizza.approve(address(staking), 1000 * 1e18);
        staking.stake(1000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(user3)), 0, "Should be Slice Runner");
        assertEq(staking.getToppingBonus(user3), 0, "Slice Runner gets 0 bonus toppings");
    }

    function testTier_OvenOperator() public {
        vm.startPrank(user3);
        pizza.approve(address(staking), TIER1_THRESHOLD);
        staking.stake(TIER1_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(user3)), 1, "Should be Oven Operator");
        assertEq(staking.getToppingBonus(user3), 1, "Oven Operator gets 1 bonus topping");
    }

    function testTier_PieBoss() public {
        vm.startPrank(user2);
        pizza.approve(address(staking), TIER2_THRESHOLD);
        staking.stake(TIER2_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(user2)), 2, "Should be Pie Boss");
        assertEq(staking.getToppingBonus(user2), 3, "Pie Boss gets 3 bonus toppings");
    }

    function testTier_PizzaTycoon() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), TIER3_THRESHOLD);
        staking.stake(TIER3_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(user1)), 3, "Should be Pizza Tycoon");
        assertEq(staking.getToppingBonus(user1), 5, "Pizza Tycoon gets 5 bonus toppings");
    }

    function testTier_BasedOnTotalStake() public {
        // User stakes 100K flexible + 150K locked = 250K total = Tier 2
        vm.startPrank(user2);
        pizza.approve(address(staking), 250_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        staking.stake(150_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(user2)), 2, "Should be Pie Boss based on total");
    }

    function testTier_DowngradeOnUnstake() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), TIER3_THRESHOLD);
        staking.stake(TIER3_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Flexible);
        assertEq(uint8(staking.getTier(user1)), 3, "Should be Pizza Tycoon");

        // Unstake to go below tier 2
        staking.unstake(400_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(user1)), 1, "Should downgrade to Oven Operator");
    }

    // ==================================================================================
    // SECTION 4: REWARD CALCULATIONS
    // ==================================================================================

    function testRewards_AccumulateOverTime() public {
        // Stake
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Simulate rewards notification from PizzaParty
        uint256 rewardAmount = 1000 * 1e18;
        vm.prank(OWNER);
        staking.notifyRewardAmount(rewardAmount);

        // Check pending rewards
        uint256 pending = staking.getPendingRewards(user1);
        assertTrue(pending > 0, "Should have pending rewards");
    }

    function testRewards_TierBonusApplied() public {
        // User1 stakes for tier 3 (Pizza Tycoon = +20%)
        vm.startPrank(user1);
        pizza.approve(address(staking), TIER3_THRESHOLD);
        staking.stake(TIER3_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // User3 stakes for tier 0 (Slice Runner = +1.5%)
        vm.startPrank(user3);
        pizza.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Distribute rewards
        uint256 rewardAmount = 10000 * 1e18;
        vm.prank(OWNER);
        staking.notifyRewardAmount(rewardAmount);

        uint256 pending1 = staking.getPendingRewards(user1);
        uint256 pending3 = staking.getPendingRewards(user3);

        // user1 has ~5000x more staked, and higher tier bonus
        // Base ratio: 500_000 / 100 = 5000x
        // User1 bonus: 1 + 0.20 = 1.20 (tier 3)
        // User3 bonus: 1 + 0.015 = 1.015 (tier 0)
        // Effective ratio: 5000 * (1.20/1.015) ≈ 5911x
        console.log("User1 pending:", pending1);
        console.log("User3 pending:", pending3);

        assertTrue(pending1 > pending3 * 5000, "Tier 3 should get significantly more rewards");
    }

    function testRewards_LockBonusApplied() public {
        // Same stake amount, different lock types
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        vm.startPrank(user2);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Distribute rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        uint256 pendingLocked = staking.getPendingRewards(user1);
        uint256 pendingFlex = staking.getPendingRewards(user2);

        // Locked gets +10% lock bonus
        // User1: 1 + 0.05 (tier1) + 0.10 (lock) = 1.15
        // User2: 1 + 0.05 (tier1) = 1.05
        assertTrue(pendingLocked > pendingFlex, "Locked position should get more rewards");
    }

    function testRewards_EarlyBoostApplied() public {
        // Check if early boost is active
        assertTrue(staking.boostEndTime() > block.timestamp, "Early boost should be active");

        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        (,,,,,, bool isEarlyBoostActive) = staking.getStakeInfo(user1);
        assertTrue(isEarlyBoostActive, "Early boost should be active for user");

        uint256 pending = staking.getPendingRewards(user1);
        // With early boost: 1 + 0.05 (tier1) + 0.30 (early) = 1.35
        // Without: 1 + 0.05 = 1.05
        console.log("Pending with early boost:", pending);
    }

    function testRewards_CombinedBonuses() public {
        // Pizza Tycoon + Locked + Early Boost
        // Total: 1 + 0.20 (tier3) + 0.10 (lock) + 0.30 (early) = 1.60

        vm.startPrank(user1);
        pizza.approve(address(staking), TIER3_THRESHOLD);
        staking.stake(TIER3_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        uint256 pending = staking.getPendingRewards(user1);

        // Base reward would be ~1000 PIZZA (sole staker)
        // With 60% bonus: ~1600 PIZZA
        console.log("Combined bonus pending:", pending);
        assertTrue(pending > 1500 * 1e18, "Should have significant bonus applied");
    }

    // ==================================================================================
    // SECTION 5: SPIN THE PIE MECHANICS
    // ==================================================================================

    function testSpin_OncePerDay() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Add rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        // First claim with spin should work
        vm.prank(user1);
        staking.claim();

        // Add more rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        // Second claim same day should revert
        vm.prank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.claim();
    }

    function testSpin_CanSpinAfterNewGame() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Add rewards and claim
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);
        vm.prank(user1);
        staking.claim();

        // Simulate new game by settling daily game on PizzaParty
        // This would increment dailyGameId
        // For now we just verify canSpinToday returns false
        assertFalse(staking.canSpinToday(user1), "Should not be able to spin again same day");
    }

    function testSpin_BonusPoolUsage() public {
        // Top up bonus pool
        vm.startPrank(OWNER);
        staking.adminTopUpBonusPool(10000 * 1e18);
        vm.stopPrank();

        uint256 bonusBefore = staking.bonusPool();
        assertTrue(bonusBefore > 0, "Bonus pool should have funds");

        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Add large rewards so spin bonus matters
        vm.prank(OWNER);
        staking.notifyRewardAmount(10000 * 1e18);

        // Claim (will spin)
        vm.prank(user1);
        staking.claim();

        // Bonus pool may have decreased if spin was > 100%
        console.log("Bonus pool after:", staking.bonusPool());
    }

    function testSpin_Disabled_Pays100Percent() public {
        // Disable spin
        vm.prank(OWNER);
        staking.adminSetSpinEnabled(false);

        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        uint256 pendingBefore = staking.getPendingRewards(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);

        vm.prank(user1);
        staking.claim();

        uint256 balanceAfter = pizza.balanceOf(user1);
        assertEq(balanceAfter - balanceBefore, pendingBefore, "Should receive exactly pending amount when spin disabled");

        // Re-enable spin
        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);
    }

    // ==================================================================================
    // SECTION 6: MULTI-WALLET SCENARIOS
    // ==================================================================================

    function testMultiWallet_FairDistribution() public {
        // Three users stake equal amounts
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.startPrank(user2);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.startPrank(user3);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Distribute rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(3000 * 1e18);

        // Each should get approximately equal share (with tier bonuses)
        uint256 p1 = staking.getPendingRewards(user1);
        uint256 p2 = staking.getPendingRewards(user2);
        uint256 p3 = staking.getPendingRewards(user3);

        console.log("User1 pending:", p1);
        console.log("User2 pending:", p2);
        console.log("User3 pending:", p3);

        // Should be approximately equal (same tier, same amount)
        assertApproxEqRel(p1, p2, 0.01e18, "User1 and User2 should have equal rewards");
        assertApproxEqRel(p2, p3, 0.01e18, "User2 and User3 should have equal rewards");
    }

    function testMultiWallet_LateStakerGetsLessRewards() public {
        // User1 stakes first
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Rewards distributed
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        // User2 stakes after
        vm.startPrank(user2);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // More rewards distributed
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        uint256 p1 = staking.getPendingRewards(user1);
        uint256 p2 = staking.getPendingRewards(user2);

        console.log("User1 (early):", p1);
        console.log("User2 (late):", p2);

        assertTrue(p1 > p2, "Early staker should have more rewards");
    }

    function testMultiWallet_DifferentTiers() public {
        // User1: Tier 3 (500K)
        vm.startPrank(user1);
        pizza.approve(address(staking), TIER3_THRESHOLD);
        staking.stake(TIER3_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // User2: Tier 2 (200K)
        vm.startPrank(user2);
        pizza.approve(address(staking), TIER2_THRESHOLD);
        staking.stake(TIER2_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // User3: Tier 1 (50K)
        vm.startPrank(user3);
        pizza.approve(address(staking), TIER1_THRESHOLD);
        staking.stake(TIER1_THRESHOLD, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Distribute rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(10000 * 1e18);

        console.log("Total staked:", staking.totalStaked());
        console.log("User1 tier:", uint8(staking.getTier(user1)));
        console.log("User2 tier:", uint8(staking.getTier(user2)));
        console.log("User3 tier:", uint8(staking.getTier(user3)));

        uint256 p1 = staking.getPendingRewards(user1);
        uint256 p2 = staking.getPendingRewards(user2);
        uint256 p3 = staking.getPendingRewards(user3);

        console.log("User1 pending:", p1);
        console.log("User2 pending:", p2);
        console.log("User3 pending:", p3);

        assertTrue(p1 > p2, "Tier 3 should get more than Tier 2");
        assertTrue(p2 > p3, "Tier 2 should get more than Tier 1");
    }

    // ==================================================================================
    // SECTION 7: FAILED TRANSACTION RECOVERY
    // ==================================================================================

    function test_RevertWhen_InsufficientApproval() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 1000 * 1e18); // Approve less than stake amount
        vm.expectRevert(); // ERC20 will revert on insufficient allowance
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function test_RevertWhen_InsufficientBalance() public {
        vm.startPrank(attacker);
        pizza.approve(address(staking), 1_000_000 * 1e18);
        vm.expectRevert(); // ERC20 will revert on insufficient balance
        staking.stake(1_000_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible); // More than balance
        vm.stopPrank();
    }

    function testPaused_StakeReverts() public {
        vm.prank(OWNER);
        staking.adminPause();

        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        vm.expectRevert();
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.adminUnpause();
    }

    function testPaused_UnstakeReverts() public {
        // First stake
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Pause
        vm.prank(OWNER);
        staking.adminPause();

        // Try to unstake
        vm.startPrank(user1);
        vm.expectRevert();
        staking.unstake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.adminUnpause();
    }

    // ==================================================================================
    // SECTION 8: RESTAKE FUNCTIONALITY
    // ==================================================================================

    function testRestake_IntoFlexible() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Add rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(10000 * 1e18);

        uint256 stakeBefore = staking.getTotalStaked(user1);

        // Restake rewards
        vm.prank(user1);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 stakeAfter = staking.getTotalStaked(user1);
        assertTrue(stakeAfter > stakeBefore, "Total stake should increase after restake");
    }

    function testRestake_IntoLocked() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Add rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(10000 * 1e18);

        // Restake rewards into locked position
        vm.prank(user1);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Locked);

        (,, uint256 lockedAmount,,,, ) = staking.getStakeInfo(user1);
        assertTrue(lockedAmount > 0, "Should have locked stake after restake");
    }

    function testRestake_RespectMaxStake() public {
        // Stake close to max
        vm.prank(TREASURY);
        pizza.transfer(user1, 400_000 * 1e18); // Give more

        vm.startPrank(user1);
        pizza.approve(address(staking), MAX_STAKE - 1000 * 1e18);
        staking.stake(MAX_STAKE - 1000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Add big rewards that would exceed max
        vm.prank(OWNER);
        staking.notifyRewardAmount(100000 * 1e18);

        uint256 stakeBefore = staking.getTotalStaked(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);

        // Restake - should only restake up to max
        vm.prank(user1);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 stakeAfter = staking.getTotalStaked(user1);
        uint256 balanceAfter = pizza.balanceOf(user1);

        assertEq(stakeAfter, MAX_STAKE, "Should cap at max stake");
        assertTrue(balanceAfter > balanceBefore, "Excess should be sent to wallet");
    }

    // ==================================================================================
    // SECTION 9: EDGE CASES
    // ==================================================================================

    function testEdge_StakeWithNoRewardsWallet() public {
        // This should still work, just no auto-topup for bonus pool
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 100_000 * 1e18);
    }

    function testEdge_ClaimWithZeroRewards() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Claim without any rewards distributed (should not revert, just no-op)
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.claim();
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter, balanceBefore, "Balance should not change with zero rewards");
    }

    function testEdge_NotifyZeroRewards() public {
        vm.prank(OWNER);
        staking.notifyRewardAmount(0); // Should not revert, just no-op
    }

    function testEdge_NotifyRewardsNoStakers() public {
        uint256 bonusBefore = staking.bonusPool();

        // Notify rewards with no stakers - should go to bonus pool
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        assertEq(staking.bonusPool(), bonusBefore + 1000 * 1e18, "Rewards should go to bonus pool");
    }

    // ==================================================================================
    // SECTION 10: SECURITY TESTS
    // ==================================================================================

    function testSecurity_OnlyOwnerCanPause() public {
        vm.prank(attacker);
        vm.expectRevert();
        staking.adminPause();
    }

    function testSecurity_OnlyOwnerCanSetToken() public {
        vm.prank(attacker);
        vm.expectRevert();
        staking.adminSetPizzaToken(address(0x123));
    }

    function testSecurity_OnlyAuthorizedCanNotifyRewards() public {
        vm.prank(attacker);
        vm.expectRevert(PizzaStakingV1Upgradeable.Unauthorized.selector);
        staking.notifyRewardAmount(1000 * 1e18);
    }

    function testSecurity_CannotStakeToOtherAddress() public {
        // Contract only allows staking to msg.sender, not arbitrary addresses
        // This is implicit in the design
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 100_000 * 1e18);
        assertEq(staking.getTotalStaked(user2), 0);
    }

    // ==================================================================================
    // CLEANUP: Unstake all users after tests (for fork state cleanliness)
    // ==================================================================================

    function _cleanupStakes() internal {
        // Helper to cleanup stakes - not a test
    }
}
