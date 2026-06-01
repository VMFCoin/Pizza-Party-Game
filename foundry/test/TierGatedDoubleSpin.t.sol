// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPizzaPartyGameId {
    function dailyGameId() external view returns (uint256);
}

/// @dev Tier-gated double spin: Oven Operator (>=500M staked) and above get 2 spins/day.
/// Slice Runner (<500M staked) gets 1 spin/day. The legacy maxSpinsPerDay toggle is a no-op.
/// Run: forge test --match-contract TierGatedDoubleSpin --fork-url https://mainnet.base.org -vvv
contract TierGatedDoubleSpinTest is Test {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;
    address constant OWNER = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;
    address constant TREASURY = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;

    uint256 constant TIER1_THRESHOLD = 500_000_000 * 1e18; // Oven Operator
    uint256 constant TIER2_THRESHOLD = 2_000_000_000 * 1e18; // Pie Boss
    uint256 constant TIER3_THRESHOLD = 5_000_000_000 * 1e18; // Pizza Tycoon

    PizzaStakingV1Upgradeable staking;
    IERC20 pizza;

    address sliceRunner;
    address ovenOperator;
    address pieBoss;
    address pizzaTycoon;

    uint256 currentMockGameId;

    function setUp() public {
        staking = PizzaStakingV1Upgradeable(STAKING_PROXY);
        pizza = IERC20(PIZZA_TOKEN);
        currentMockGameId = IPizzaPartyGameId(PIZZA_PARTY_PROXY).dailyGameId();

        sliceRunner = makeAddr("sliceRunner");
        ovenOperator = makeAddr("ovenOperator");
        pieBoss = makeAddr("pieBoss");
        pizzaTycoon = makeAddr("pizzaTycoon");

        // Upgrade to the tier-gated implementation
        vm.startPrank(OWNER);
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        staking.upgradeToAndCall(address(newImpl), "");
        vm.stopPrank();

        // Fund test users — enough for Pizza Tycoon tier
        vm.startPrank(TREASURY);
        pizza.transfer(sliceRunner, TIER1_THRESHOLD); // enough to cross threshold in upgrade test
        pizza.transfer(ovenOperator, TIER1_THRESHOLD);
        pizza.transfer(pieBoss, TIER2_THRESHOLD);
        pizza.transfer(pizzaTycoon, TIER3_THRESHOLD);
        vm.stopPrank();

        // Register FIDs (anti-sybil — required to stake)
        vm.startPrank(OWNER);
        staking.adminRegisterFidWallet(20001, sliceRunner);
        staking.adminRegisterFidWallet(20002, ovenOperator);
        staking.adminRegisterFidWallet(20003, pieBoss);
        staking.adminRegisterFidWallet(20004, pizzaTycoon);
        staking.adminSetSpinEnabled(true);
        vm.stopPrank();
    }

    function _stake(address user, uint256 amount) internal {
        // Set both msg.sender AND tx.origin — recordSpin enforces tx.origin == msg.sender
        vm.startPrank(user, user);
        pizza.approve(address(staking), amount);
        staking.stake(amount, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();
    }

    function _addRewards(uint256 amount) internal {
        vm.prank(TREASURY);
        pizza.transfer(address(staking), amount);
        vm.prank(OWNER);
        staking.notifyRewardAmount(amount);
    }

    function _advanceDay() internal {
        vm.warp(block.timestamp + 1 days);
        currentMockGameId++;
        bytes32 slot = _findStorageSlot(PIZZA_PARTY_PROXY, currentMockGameId - 1);
        require(slot != bytes32(type(uint256).max), "dailyGameId slot not found");
        vm.store(PIZZA_PARTY_PROXY, slot, bytes32(currentMockGameId));
    }

    function _findStorageSlot(address target, uint256 expectedValue) internal view returns (bytes32) {
        for (uint256 i = 0; i < 200; i++) {
            bytes32 slot = bytes32(i);
            if (uint256(vm.load(target, slot)) == expectedValue) return slot;
        }
        return bytes32(type(uint256).max);
    }

    // ----- Slice Runner (tier 0): exactly 1 spin -----

    function testSliceRunner_OneSpinOnly() public {
        _stake(sliceRunner, 1_000_000 * 1e18);
        _addRewards(10_000 * 1e18);

        assertEq(uint8(staking.getTier(sliceRunner)), uint8(PizzaStakingV1Upgradeable.Tier.SliceRunner));

        vm.startPrank(sliceRunner, sliceRunner);
        assertTrue(staking.canSpinToday(sliceRunner));
        staking.recordSpin();

        assertFalse(staking.canSpinToday(sliceRunner));
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        vm.stopPrank();
    }

    // ----- Oven Operator (tier 1): exactly 2 spins -----

    function testOvenOperator_TwoSpinsAllowed() public {
        _stake(ovenOperator, TIER1_THRESHOLD);
        _addRewards(10_000 * 1e18);

        assertEq(uint8(staking.getTier(ovenOperator)), uint8(PizzaStakingV1Upgradeable.Tier.OvenOperator));

        vm.startPrank(ovenOperator, ovenOperator);
        assertTrue(staking.canSpinToday(ovenOperator));
        staking.recordSpin();
        assertTrue(staking.canSpinToday(ovenOperator), "2nd spin allowed for Oven Operator");
        staking.recordSpin();
        assertFalse(staking.canSpinToday(ovenOperator));
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        vm.stopPrank();
    }

    function testOvenOperator_BothOutcomesSummedOnClaim() public {
        _stake(ovenOperator, TIER1_THRESHOLD);
        _addRewards(100_000 * 1e18);

        uint256 balBefore = pizza.balanceOf(ovenOperator);
        vm.startPrank(ovenOperator, ovenOperator);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        assertGt(pizza.balanceOf(ovenOperator), balBefore, "Should receive combined reward");
    }

    function testOvenOperator_OneSpinThenClaim_StillWorks() public {
        _stake(ovenOperator, TIER1_THRESHOLD);
        _addRewards(100_000 * 1e18);

        vm.startPrank(ovenOperator, ovenOperator);
        staking.recordSpin();
        // Claim without using the second spin
        staking.claimAfterSpin();
        vm.stopPrank();
    }

    function testOvenOperator_DoubleSpinRestake() public {
        _stake(ovenOperator, TIER1_THRESHOLD);
        _addRewards(100_000 * 1e18);

        uint256 stakedBefore = staking.getTotalStaked(ovenOperator);
        vm.startPrank(ovenOperator, ovenOperator);
        staking.recordSpin();
        staking.recordSpin();
        staking.restake(PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertGt(staking.getTotalStaked(ovenOperator), stakedBefore);
    }

    // ----- Pie Boss / Pizza Tycoon also get 2 spins -----

    function testPieBoss_TwoSpinsAllowed() public {
        _stake(pieBoss, TIER2_THRESHOLD);
        _addRewards(100_000 * 1e18);

        assertEq(uint8(staking.getTier(pieBoss)), uint8(PizzaStakingV1Upgradeable.Tier.PieBoss));

        vm.startPrank(pieBoss, pieBoss);
        staking.recordSpin();
        staking.recordSpin();
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        vm.stopPrank();
    }

    function testPizzaTycoon_TwoSpinsAllowed() public {
        _stake(pizzaTycoon, TIER3_THRESHOLD);
        _addRewards(100_000 * 1e18);

        assertEq(uint8(staking.getTier(pizzaTycoon)), uint8(PizzaStakingV1Upgradeable.Tier.PizzaTycoon));

        vm.startPrank(pizzaTycoon, pizzaTycoon);
        staking.recordSpin();
        staking.recordSpin();
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        vm.stopPrank();
    }

    // ----- Crossing the tier threshold mid-flow -----

    function testCrossingThreshold_TierUpgrade_UnlocksSecondSpin() public {
        // Stake below Oven Operator — only 1 spin allowed
        _stake(sliceRunner, TIER1_THRESHOLD - 1);
        _addRewards(100_000 * 1e18);

        vm.startPrank(sliceRunner, sliceRunner);
        staking.recordSpin();
        assertFalse(staking.canSpinToday(sliceRunner), "1 spin while Slice Runner");

        // Top up to cross threshold mid-day
        pizza.approve(address(staking), 1);
        staking.stake(1, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        // Now Oven Operator — second spin should now be allowed
        assertEq(uint8(staking.getTier(sliceRunner)), uint8(PizzaStakingV1Upgradeable.Tier.OvenOperator));
        assertTrue(staking.canSpinToday(sliceRunner), "Second spin unlocked after tier upgrade");

        vm.prank(sliceRunner, sliceRunner);
        staking.recordSpin();
    }

    function testCrossingThreshold_TierDowngrade_BlocksSecondSpin() public {
        // Start at Oven Operator
        _stake(ovenOperator, TIER1_THRESHOLD);
        _addRewards(100_000 * 1e18);

        vm.startPrank(ovenOperator, ovenOperator);
        staking.recordSpin();
        assertTrue(staking.canSpinToday(ovenOperator), "2nd spin available");

        // Drop below threshold by unstaking
        staking.unstake(1, PizzaStakingV1Upgradeable.LockType.Flexible);
        vm.stopPrank();

        assertEq(uint8(staking.getTier(ovenOperator)), uint8(PizzaStakingV1Upgradeable.Tier.SliceRunner));
        assertFalse(staking.canSpinToday(ovenOperator), "2nd spin revoked after dropping tier");

        vm.prank(ovenOperator, ovenOperator);
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
    }

    // ----- Legacy maxSpinsPerDay toggle is now a no-op -----

    function testLegacyToggle_MaxSpinsPerDay_Ignored() public {
        // Owner sets maxSpinsPerDay=2 — should NOT grant a 2nd spin to Slice Runner
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(2);

        _stake(sliceRunner, 1_000_000 * 1e18);
        _addRewards(100_000 * 1e18);

        vm.startPrank(sliceRunner, sliceRunner);
        staking.recordSpin();
        assertFalse(staking.canSpinToday(sliceRunner), "Legacy toggle does not grant 2nd spin");
        vm.expectRevert(PizzaStakingV1Upgradeable.AlreadySpunToday.selector);
        staking.recordSpin();
        vm.stopPrank();
    }

    function testLegacyToggle_MaxSpinsPerDay1_DoesNotRestrictOvenOperator() public {
        // Owner sets maxSpinsPerDay=1 — Oven Operator still gets 2 spins
        vm.prank(OWNER);
        staking.adminSetMaxSpinsPerDay(1);

        _stake(ovenOperator, TIER1_THRESHOLD);
        _addRewards(100_000 * 1e18);

        vm.startPrank(ovenOperator, ovenOperator);
        staking.recordSpin();
        assertTrue(staking.canSpinToday(ovenOperator), "Tier overrides legacy toggle");
        staking.recordSpin();
        vm.stopPrank();
    }

    // ----- Resets across game days -----

    function testResetsAcrossDays() public {
        _stake(ovenOperator, TIER1_THRESHOLD);
        _addRewards(100_000 * 1e18);

        vm.startPrank(ovenOperator, ovenOperator);
        staking.recordSpin();
        staking.recordSpin();
        staking.claimAfterSpin();
        vm.stopPrank();

        _advanceDay();
        _addRewards(100_000 * 1e18);

        assertTrue(staking.canSpinToday(ovenOperator));
        vm.startPrank(ovenOperator, ovenOperator);
        staking.recordSpin();
        assertTrue(staking.canSpinToday(ovenOperator));
        staking.recordSpin();
        vm.stopPrank();
    }

    // ----- Multi-user independence -----

    function testMultiUser_TiersIndependent() public {
        _stake(sliceRunner, 1_000_000 * 1e18);
        _stake(ovenOperator, TIER1_THRESHOLD);
        _addRewards(200_000 * 1e18);

        // Slice Runner — 1 spin
        vm.prank(sliceRunner, sliceRunner);
        staking.recordSpin();
        assertFalse(staking.canSpinToday(sliceRunner));

        // Oven Operator — 2 spins, unaffected by Slice Runner's count
        vm.startPrank(ovenOperator, ovenOperator);
        staking.recordSpin();
        assertTrue(staking.canSpinToday(ovenOperator));
        staking.recordSpin();
        vm.stopPrank();
    }
}
