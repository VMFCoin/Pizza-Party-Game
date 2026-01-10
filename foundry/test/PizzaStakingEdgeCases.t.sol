// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PizzaStakingEdgeCasesTest
 * @dev Comprehensive edge case tests for all staking transaction scenarios
 *
 * Run against Base mainnet fork:
 * forge test --match-contract PizzaStakingEdgeCases --fork-url https://mainnet.base.org -vvv
 *
 * TEST CATEGORIES:
 * 1. Approval Flow Edge Cases
 * 2. Stake Transaction Edge Cases
 * 3. Unstake Transaction Edge Cases
 * 4. Claim Transaction Edge Cases
 * 5. Restake Transaction Edge Cases
 * 6. Double Transaction Prevention
 * 7. Race Condition Scenarios
 * 8. State Recovery After Failed Transactions
 * 9. Gas Limit Edge Cases
 * 10. Concurrent Transaction Scenarios
 */
contract PizzaStakingEdgeCasesTest is Test {
    // Live contract addresses
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;
    address constant OWNER = 0x828F516b379A2532bB33a00d34125560BF4c1853;
    address constant TREASURY = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;

    PizzaStakingV1Upgradeable staking;
    IERC20 pizza;

    // Test users
    address user1;
    address user2;
    address user3;

    // Constants from contract
    uint256 constant MIN_STAKE = 100 * 1e18;
    uint256 constant MAX_STAKE = 1_000_000 * 1e18;
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

        // Fund test users from treasury
        vm.startPrank(TREASURY);
        pizza.transfer(user1, 600_000 * 1e18);
        pizza.transfer(user2, 300_000 * 1e18);
        pizza.transfer(user3, 100_000 * 1e18);
        vm.stopPrank();
    }

    // ==================================================================================
    // SECTION 1: APPROVAL FLOW EDGE CASES
    // ==================================================================================

    function testApproval_ExactAmount() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), stakeAmount);
    }

    function testApproval_ExcessAmount() public {
        uint256 stakeAmount = 100_000 * 1e18;
        uint256 approveAmount = 500_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), approveAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), stakeAmount);
        // Remaining allowance should still be available
        assertEq(pizza.allowance(user1, address(staking)), approveAmount - stakeAmount);
    }

    function testApproval_InsufficientForStake_Reverts() public {
        uint256 stakeAmount = 100_000 * 1e18;
        uint256 approveAmount = 50_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), approveAmount);
        vm.expectRevert(); // ERC20 insufficient allowance
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testApproval_ZeroAllowance_Reverts() public {
        vm.startPrank(user1);
        // No approve call
        vm.expectRevert();
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testApproval_ChangeAllowanceMidway() public {
        uint256 firstApprove = 50_000 * 1e18;
        uint256 secondApprove = 100_000 * 1e18;
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        // First approve (insufficient)
        pizza.approve(address(staking), firstApprove);

        // Change approve before stake
        pizza.approve(address(staking), secondApprove);

        // Now stake should work
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), stakeAmount);
    }

    function testApproval_RevokeAfterApprove_Reverts() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        // Revoke approval
        pizza.approve(address(staking), 0);

        vm.expectRevert();
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testApproval_UnlimitedApproval() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), type(uint256).max);

        // First stake
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Second stake (no new approval needed)
        staking.stake(50_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 150_000 * 1e18);
    }

    // ==================================================================================
    // SECTION 2: STAKE TRANSACTION EDGE CASES
    // ==================================================================================

    function testStake_ExactMinimum() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), MIN_STAKE);
    }

    function testStake_OneBelowMinimum_Reverts() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE - 1);
        vm.expectRevert(PizzaStakingV1Upgradeable.BelowMinimumStake.selector);
        staking.stake(MIN_STAKE - 1, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testStake_ExactMaximum() public {
        // Give user1 enough for max stake
        vm.prank(TREASURY);
        pizza.transfer(user1, 400_000 * 1e18);

        vm.startPrank(user1);
        pizza.approve(address(staking), MAX_STAKE);
        staking.stake(MAX_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), MAX_STAKE);
    }

    function testStake_OneAboveMaximum_Reverts() public {
        vm.prank(TREASURY);
        pizza.transfer(user1, 500_000 * 1e18);

        vm.startPrank(user1);
        pizza.approve(address(staking), MAX_STAKE + 1);
        vm.expectRevert(PizzaStakingV1Upgradeable.ExceedsMaximumStake.selector);
        staking.stake(MAX_STAKE + 1, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testStake_MultipleStakesSameBlock() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 300_000 * 1e18);

        // Multiple stakes in same block
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 300_000 * 1e18);
    }

    function testStake_FlexibleThenLocked_SameBlock() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 200_000 * 1e18);

        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        (uint256 total, uint256 flex, uint256 locked,,,,) = staking.getStakeInfo(user1);
        assertEq(total, 200_000 * 1e18);
        assertEq(flex, 100_000 * 1e18);
        assertEq(locked, 100_000 * 1e18);
    }

    function testStake_ExceedsMaxAcrossBothPositions_Reverts() public {
        vm.prank(TREASURY);
        pizza.transfer(user1, 500_000 * 1e18);

        vm.startPrank(user1);
        pizza.approve(address(staking), 1_200_000 * 1e18);

        // First stake 600K flexible
        staking.stake(600_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Try to stake 500K locked - total would be 1.1M (> 1M max)
        vm.expectRevert(PizzaStakingV1Upgradeable.ExceedsMaximumStake.selector);
        staking.stake(500_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();
    }

    function testStake_AddBelowMinToExisting_Succeeds() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 200_000 * 1e18);

        // Initial stake above minimum
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Add below minimum (allowed for existing positions)
        staking.stake(50 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 100_050 * 1e18);
    }

    function testStake_InsufficientBalance_Reverts() public {
        uint256 userBalance = pizza.balanceOf(user1);

        vm.startPrank(user1);
        pizza.approve(address(staking), userBalance + 1);
        vm.expectRevert();
        staking.stake(userBalance + 1, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testStake_ZeroAmount_Reverts() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE);
        vm.expectRevert(PizzaStakingV1Upgradeable.ZeroAmount.selector);
        staking.stake(0, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testStake_WhilePaused_Reverts() public {
        vm.prank(OWNER);
        staking.adminPause();

        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE);
        vm.expectRevert();
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.adminUnpause();
    }

    // ==================================================================================
    // SECTION 3: UNSTAKE TRANSACTION EDGE CASES
    // ==================================================================================

    function testUnstake_ExactAmount() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 0);
        assertEq(balanceAfter - balanceBefore, stakeAmount);
    }

    function testUnstake_PartialAmount() public {
        uint256 stakeAmount = 100_000 * 1e18;
        uint256 unstakeAmount = 40_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        staking.unstake(unstakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), stakeAmount - unstakeAmount);
    }

    function testUnstake_MoreThanStaked_CapsToMax() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(stakeAmount * 2, PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 0);
        assertEq(balanceAfter - balanceBefore, stakeAmount); // Only staked amount returned
    }

    function testUnstake_NoPosition_Reverts() public {
        vm.startPrank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.NoStakePosition.selector);
        staking.unstake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testUnstake_ZeroAmount_Reverts() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);

        vm.expectRevert(PizzaStakingV1Upgradeable.ZeroAmount.selector);
        staking.unstake(0, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testUnstake_WrongLockType_Reverts() public {
        // Stake as flexible
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Try to unstake from locked (no locked position)
        vm.expectRevert(PizzaStakingV1Upgradeable.NoStakePosition.selector);
        staking.unstake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();
    }

    function testUnstake_LockedEarlyWithPenalty() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);

        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        uint256 expectedPenalty = (stakeAmount * EARLY_UNSTAKE_PENALTY_BPS) / BPS;
        assertEq(balanceAfter - balanceBefore, stakeAmount - expectedPenalty);
    }

    function testUnstake_LockedAfterExpiry_NoPenalty() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        // Warp past lock period
        vm.warp(block.timestamp + LOCK_DURATION + 1);

        vm.startPrank(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter - balanceBefore, stakeAmount); // Full amount, no penalty
    }

    function testUnstake_LockedExactlyAtExpiry() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        // Get lock end timestamp
        (, , , , uint256 lockEnd, , ) = staking.getStakeInfo(user1);

        // Warp to exactly lock end - contract uses block.timestamp < lockEndTimestamp
        // so at exactly lockEnd, the condition is false (not less than)
        vm.warp(lockEnd);

        vm.startPrank(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        // At exactly lockEnd: block.timestamp < lockEndTimestamp is false, so NO penalty
        // This is the correct behavior - lock has expired at lockEnd
        assertEq(balanceAfter - balanceBefore, stakeAmount, "No penalty at exact expiry");
    }

    function testUnstake_LockedOneSecondAfterExpiry() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        // Get lock end timestamp
        (, , , , uint256 lockEnd, , ) = staking.getStakeInfo(user1);

        // Warp to one second after lock end
        vm.warp(lockEnd + 1);

        vm.startPrank(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Locked);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter - balanceBefore, stakeAmount); // No penalty
    }

    function testUnstake_MultiplePartialsUntilZero() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Unstake in chunks
        staking.unstake(30_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        assertEq(staking.getTotalStaked(user1), 70_000 * 1e18);

        staking.unstake(30_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        assertEq(staking.getTotalStaked(user1), 40_000 * 1e18);

        staking.unstake(40_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        assertEq(staking.getTotalStaked(user1), 0);
        vm.stopPrank();
    }

    function testUnstake_WhilePaused_Reverts() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.adminPause();

        vm.startPrank(user1);
        vm.expectRevert();
        staking.unstake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.adminUnpause();
    }

    // ==================================================================================
    // SECTION 4: CLAIM TRANSACTION EDGE CASES
    // ==================================================================================

    function testClaim_NoRewards() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.claim();
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter, balanceBefore); // No change
    }

    function testClaim_WithRewards() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Distribute rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        uint256 pendingBefore = staking.getPendingRewards(user1);
        assertTrue(pendingBefore > 0);

        vm.startPrank(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.claim();
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertTrue(balanceAfter > balanceBefore);
    }

    function testClaim_TwiceSameDay_Reverts() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Enable spin
        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        // Distribute rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        vm.prank(user1);
        staking.claim();

        // Distribute more rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        // Second claim should fail
        vm.startPrank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.claim();
        vm.stopPrank();
    }

    function testClaim_NoPosition_NoEffect() public {
        // Claiming with no position should just do nothing
        vm.prank(user1);
        staking.claim();
        // No revert, just no-op
    }

    function testClaim_FromBothPositions() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 200_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        // Distribute rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(2000 * 1e18);

        uint256 pending = staking.getPendingRewards(user1);
        assertTrue(pending > 0);

        vm.startPrank(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.claim();
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertTrue(balanceAfter > balanceBefore);
    }

    function testClaim_ImmediatelyAfterStake() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Claim immediately (no rewards distributed yet)
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.claim();
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter, balanceBefore); // No rewards
    }

    // ==================================================================================
    // SECTION 5: RESTAKE TRANSACTION EDGE CASES
    // ==================================================================================

    function testRestake_NoPosition_Reverts() public {
        vm.startPrank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.NoStakePosition.selector);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function testRestake_NoRewards_NoOp() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 stakeBefore = staking.getTotalStaked(user1);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 stakeAfter = staking.getTotalStaked(user1);
        vm.stopPrank();

        assertEq(stakeBefore, stakeAfter);
    }

    function testRestake_WithRewards() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.notifyRewardAmount(10000 * 1e18);

        vm.startPrank(user1);
        uint256 stakeBefore = staking.getTotalStaked(user1);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 stakeAfter = staking.getTotalStaked(user1);
        vm.stopPrank();

        assertTrue(stakeAfter > stakeBefore);
    }

    function testRestake_FlexibleToLocked() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.notifyRewardAmount(10000 * 1e18);

        // Verify there are pending rewards before restake
        assertTrue(staking.getPendingRewards(user1) > 0, "Should have pending rewards");

        vm.prank(user1);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Locked);

        (, , uint256 locked,,,,) = staking.getStakeInfo(user1);
        assertTrue(locked > 0, "Should have locked stake after restake");
    }

    function testRestake_ExceedsMax_PartialRestake() public {
        // Stake close to max
        vm.prank(TREASURY);
        pizza.transfer(user1, 400_000 * 1e18);

        vm.startPrank(user1);
        pizza.approve(address(staking), MAX_STAKE - 1000 * 1e18);
        staking.stake(MAX_STAKE - 1000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Add large rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(100000 * 1e18);

        vm.startPrank(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), MAX_STAKE, "Should cap at max");
        assertTrue(balanceAfter > balanceBefore, "Excess should go to wallet");
    }

    // ==================================================================================
    // SECTION 6: DOUBLE TRANSACTION PREVENTION
    // ==================================================================================

    function testDoubleStake_SameAmountSameBlock() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 200_000 * 1e18);

        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 200_000 * 1e18); // Both should succeed
    }

    function testDoubleUnstake_ExceedsBalance() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // First unstake
        staking.unstake(60_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        assertEq(staking.getTotalStaked(user1), 40_000 * 1e18);

        // Second unstake (more than remaining)
        staking.unstake(60_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 0); // Capped at remaining
    }

    function testDoubleClaim_SpinEnabledSameDay() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.adminSetSpinEnabled(true);

        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        vm.prank(user1);
        staking.claim(); // First claim succeeds

        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        vm.prank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.claim(); // Second claim reverts
    }

    // ==================================================================================
    // SECTION 7: RACE CONDITION SCENARIOS
    // ==================================================================================

    function testRace_StakeAndRewardInSameBlock() public {
        // User stakes and rewards are distributed in same block
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.notifyRewardAmount(1000 * 1e18);

        // User should have pending rewards even in same block
        uint256 pending = staking.getPendingRewards(user1);
        assertTrue(pending > 0);
    }

    function testRace_TwoUsersStakeSameBlock() public {
        uint256 totalStakedBefore = staking.totalStaked();

        vm.prank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);

        vm.prank(user2);
        pizza.approve(address(staking), 100_000 * 1e18);

        // Both stake in same block
        vm.prank(user1);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        vm.prank(user2);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        assertEq(staking.getTotalStaked(user1), 100_000 * 1e18);
        assertEq(staking.getTotalStaked(user2), 100_000 * 1e18);
        // Total should increase by 200K relative to before
        assertEq(staking.totalStaked(), totalStakedBefore + 200_000 * 1e18);
    }

    function testRace_UnstakeWhileRewardsDistributed() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Rewards distributed - use smaller amount since contract may have limited balance
        vm.prank(OWNER);
        staking.notifyRewardAmount(100 * 1e18);

        // User unstakes - unstake claims pending rewards too
        vm.startPrank(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        // Should receive stake back at minimum (may get rewards too depending on contract balance)
        assertTrue(balanceAfter >= balanceBefore + 100_000 * 1e18, "Should receive at least stake back");
    }

    // ==================================================================================
    // SECTION 8: STATE RECOVERY AFTER FAILED TRANSACTIONS
    // ==================================================================================

    function testRecovery_FailedStake_StateUnchanged() public {
        uint256 stakeBefore = staking.getTotalStaked(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);

        vm.startPrank(user1);
        // Approve insufficient amount
        pizza.approve(address(staking), MIN_STAKE / 2);

        vm.expectRevert();
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), stakeBefore);
        assertEq(pizza.balanceOf(user1), balanceBefore);
    }

    function testRecovery_FailedUnstake_StateUnchanged() public {
        // No position, unstake should fail
        vm.startPrank(user1);
        vm.expectRevert(PizzaStakingV1Upgradeable.NoStakePosition.selector);
        staking.unstake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 0);
    }

    function testRecovery_PauseThenUnpause() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.prank(OWNER);
        staking.adminPause();

        // Operations should fail while paused
        vm.startPrank(user1);
        vm.expectRevert();
        staking.unstake(50_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Unpause
        vm.prank(OWNER);
        staking.adminUnpause();

        // Operations should work again
        vm.startPrank(user1);
        staking.unstake(50_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 50_000 * 1e18);
    }

    // ==================================================================================
    // SECTION 9: GAS LIMIT EDGE CASES
    // ==================================================================================

    function testGas_StakeWithMaxApproval() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), type(uint256).max);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 100_000 * 1e18);
    }

    function testGas_ManySmallStakes() public {
        uint256 iterations = 10;
        uint256 amountPerStake = 10_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), amountPerStake * iterations);

        // Initial stake to create position
        staking.stake(MIN_STAKE, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Many small additions
        for (uint256 i = 0; i < iterations - 1; i++) {
            staking.stake(amountPerStake, PizzaStakingV1Upgradeable.LockType.Flexible);
        }
        vm.stopPrank();
    }

    // ==================================================================================
    // SECTION 10: CONCURRENT TRANSACTION SCENARIOS
    // ==================================================================================

    function testConcurrent_MultipleUsersStake() public {
        uint256 totalStakedBefore = staking.totalStaked();

        // Setup approvals
        vm.prank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        vm.prank(user2);
        pizza.approve(address(staking), 100_000 * 1e18);
        vm.prank(user3);
        pizza.approve(address(staking), 100_000 * 1e18);

        // All stake in same block
        vm.prank(user1);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.prank(user2);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.prank(user3);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // Total should increase by 300K (relative to what was there before)
        assertEq(staking.totalStaked(), totalStakedBefore + 300_000 * 1e18);
    }

    function testConcurrent_StakeUnstakeClaim() public {
        // User1 stakes
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // User2 stakes
        vm.startPrank(user2);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Rewards distributed
        vm.prank(OWNER);
        staking.notifyRewardAmount(2000 * 1e18);

        // User1 claims, User2 unstakes
        vm.prank(user1);
        staking.claim();

        vm.prank(user2);
        staking.unstake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // State should be consistent
        assertEq(staking.getTotalStaked(user1), 100_000 * 1e18);
        assertEq(staking.getTotalStaked(user2), 0);
    }

    function testConcurrent_RewardsWhileUnstaking() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        vm.startPrank(user2);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Distribute rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(2000 * 1e18);

        // User1 partial unstake
        vm.prank(user1);
        staking.unstake(50_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);

        // More rewards
        vm.prank(OWNER);
        staking.notifyRewardAmount(1500 * 1e18);

        // Check pending - user2 should have more since user1 reduced stake
        uint256 pending1 = staking.getPendingRewards(user1);
        uint256 pending2 = staking.getPendingRewards(user2);

        console.log("User1 pending:", pending1);
        console.log("User2 pending:", pending2);

        assertTrue(pending2 > pending1, "User2 should have more pending (didn't unstake)");
    }

    // ==================================================================================
    // SECTION 11: BOUNDARY VALUE TESTS
    // ==================================================================================

    function testBoundary_TierThresholds() public {
        // Just below tier 1
        vm.startPrank(user3);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(49_999 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(user3)), 0, "Below tier 1 threshold");

        // Add 1 more to hit tier 1 exactly
        vm.startPrank(user3);
        staking.stake(1 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(user3)), 1, "At tier 1 threshold");
    }

    function testBoundary_LockDuration() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Locked);
        vm.stopPrank();

        (, , , , uint256 lockEnd, , ) = staking.getStakeInfo(user1);

        // At LOCK_DURATION - 1 second: still locked
        vm.warp(lockEnd - 1);
        vm.startPrank(user1);
        uint256 balanceBefore = pizza.balanceOf(user1);
        staking.unstake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Locked);
        uint256 balanceAfter = pizza.balanceOf(user1);
        vm.stopPrank();

        uint256 expectedPenalty = (100_000 * 1e18 * EARLY_UNSTAKE_PENALTY_BPS) / BPS;
        assertEq(balanceAfter - balanceBefore, 100_000 * 1e18 - expectedPenalty, "Should have penalty");
    }

    // ==================================================================================
    // SECTION 12: TOKEN TRANSFER EDGE CASES
    // ==================================================================================

    function testToken_TransferAfterStake() public {
        uint256 stakeAmount = 100_000 * 1e18;

        vm.startPrank(user1);
        pizza.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        uint256 remainingBalance = pizza.balanceOf(user1);

        // Transfer remaining tokens away
        pizza.transfer(user2, remainingBalance);
        vm.stopPrank();

        // Stake should still be intact
        assertEq(staking.getTotalStaked(user1), stakeAmount);

        // User can still unstake
        vm.prank(user1);
        staking.unstake(stakeAmount, PizzaStakingV1Upgradeable.LockType.Flexible);

        assertEq(staking.getTotalStaked(user1), 0);
        assertEq(pizza.balanceOf(user1), stakeAmount);
    }

    function testToken_ReceiveAfterStake() public {
        vm.startPrank(user1);
        pizza.approve(address(staking), 100_000 * 1e18);
        staking.stake(100_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // User2 sends tokens to user1
        vm.prank(user2);
        pizza.transfer(user1, 50_000 * 1e18);

        // User1 can stake more
        vm.startPrank(user1);
        pizza.approve(address(staking), 50_000 * 1e18);
        staking.stake(50_000 * 1e18, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(staking.getTotalStaked(user1), 150_000 * 1e18);
    }
}
