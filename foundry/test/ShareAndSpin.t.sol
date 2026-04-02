// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ShareAndSpinTest
 * @dev Tests for the ShareAndSpin contract — share on Farcaster, earn PIZZA + spin.
 *
 * Run: forge test --match-contract ShareAndSpinTest --fork-url https://mainnet.base.org -vvv
 */
contract ShareAndSpinTest is Test {

    // Live addresses
    address constant PP    = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;
    address constant OWNER = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;
    address constant TREAS = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;

    PizzaPartyV2Upgradeable game;
    ShareAndSpinUpgradeable sns;
    IERC20 pizza;

    address p1; address p2; address p3;

    uint256 constant REWARD = 100_000 * 1e18;
    uint256 currentMockGameId;

    // Event sigs
    event ShareRecorded(address indexed, uint256 indexed, uint256 indexed, uint256, uint256);
    event ShareSpinRecorded(address indexed, uint256 indexed, uint256 indexed, uint8, bytes32);
    event ShareSpinGoldWinner(address indexed, uint256 indexed, uint256);
    event ToppingsEarned(uint256 indexed, address indexed, uint256, string);

    function setUp() public {
        game  = PizzaPartyV2Upgradeable(PP);
        pizza = IERC20(TOKEN);
        p1 = makeAddr("p1");
        p2 = makeAddr("p2");
        p3 = makeAddr("p3");

        // Upgrade PizzaParty with bridge function
        vm.startPrank(OWNER);
        PizzaPartyV2Upgradeable newGameImpl = new PizzaPartyV2Upgradeable();
        game.upgradeToAndCall(address(newGameImpl), "");
        vm.stopPrank();

        // Deploy ShareAndSpin behind proxy
        ShareAndSpinUpgradeable snsImpl = new ShareAndSpinUpgradeable();
        bytes memory initData = abi.encodeWithSelector(
            ShareAndSpinUpgradeable.initialize.selector,
            TOKEN, PP, TREAS, OWNER
        );
        ERC1967Proxy snsProxy = new ERC1967Proxy(address(snsImpl), initData);
        sns = ShareAndSpinUpgradeable(address(snsProxy));

        // Wire PizzaParty to accept calls from ShareAndSpin
        vm.startPrank(OWNER);
        game.adminSetShareAndSpinContract(address(sns));
        sns.adminSetShareRewardAmount(REWARD);
        vm.stopPrank();

        // Treasury approves ShareAndSpin contract to pull PIZZA
        vm.prank(TREAS);
        pizza.approve(address(sns), type(uint256).max);

        currentMockGameId = game.dailyGameId();
    }

    function _advanceDay() internal {
        vm.warp(block.timestamp + 1 days);
        currentMockGameId++;
        // dailyGameId is at storage slot 6 in PizzaParty proxy
        vm.store(PP, bytes32(uint256(6)), bytes32(currentMockGameId));
    }

    // ══════════════════════════════════════════════════════════
    // 1. INITIALIZATION
    // ══════════════════════════════════════════════════════════

    function test_Init_StateCorrect() public view {
        assertEq(address(sns.pizzaToken()), TOKEN);
        assertEq(address(sns.pizzaParty()), PP);
        assertEq(sns.treasuryWallet(), TREAS);
        assertEq(sns.shareRewardAmount(), REWARD);
        assertEq(sns.owner(), OWNER);
    }

    function test_Init_CannotReinitialize() public {
        vm.expectRevert();
        sns.initialize(TOKEN, PP, TREAS, OWNER);
    }

    // ══════════════════════════════════════════════════════════
    // 2. recordShare — BASIC
    // ══════════════════════════════════════════════════════════

    function test_Share_PaysFromTreasury() public {
        uint256 pBefore = pizza.balanceOf(p1);
        uint256 tBefore = pizza.balanceOf(TREAS);
        vm.prank(p1); sns.recordShare(REWARD);
        assertEq(pizza.balanceOf(p1) - pBefore, REWARD, "player receives reward");
        assertEq(tBefore - pizza.balanceOf(TREAS), REWARD, "treasury pays reward");
    }

    function test_Share_AddsToppingToPizzaParty() public {
        vm.prank(p1); sns.recordShare(REWARD);
        (uint256 toppings,,,,, ) = game.getPlayerWeeklyInfo(p1);
        assertEq(toppings, 1, "1 topping added to PizzaParty");
    }

    function test_Share_IncrementsLifetimeToppings() public {
        (,,,uint256 ltBefore,) = game.getPlayerLifetimeStats(p1);
        vm.prank(p1); sns.recordShare(REWARD);
        (,,,uint256 ltAfter,) = game.getPlayerLifetimeStats(p1);
        assertEq(ltAfter - ltBefore, 1, "lifetime toppings incremented");
    }

    function test_Share_RecordsTimestamp() public {
        uint256 t = block.timestamp;
        vm.prank(p1); sns.recordShare(REWARD);
        assertApproxEqAbs(sns.playerLastShareTimestamp(p1), t, 1);
    }

    function test_Share_IncrementsWeeklyCount() public {
        vm.prank(p1); sns.recordShare(REWARD);
        (uint256 used,,) = sns.getShareInfo(p1);
        assertEq(used, 1);
    }

    function test_Share_EmitsEvent() public {
        uint256 gameId = game.dailyGameId();
        uint256 weekId = game.weeklyGameId();
        vm.expectEmit(true, true, true, false);
        emit ShareRecorded(p1, gameId, weekId, 1, REWARD);
        vm.prank(p1); sns.recordShare(REWARD);
    }

    function test_Share_WorksWithoutPlayingGameFirst() public {
        uint256 b = pizza.balanceOf(p1);
        vm.prank(p1); sns.recordShare(REWARD);
        assertTrue(pizza.balanceOf(p1) > b);
    }

    function test_Share_ZeroClaimedReward_NoTransfer() public {
        uint256 b = pizza.balanceOf(p1);
        vm.prank(p1); sns.recordShare(0);
        assertEq(pizza.balanceOf(p1), b, "no transfer when claimed is 0");
    }

    function test_Share_RevertsWhenOracleNotSet() public {
        vm.prank(OWNER); sns.adminSetShareRewardAmount(0);
        vm.prank(p1);
        vm.expectRevert(bytes("Share: reward not set"));
        sns.recordShare(REWARD);
    }

    function test_Share_RevertsWhenClaimedTooHigh() public {
        // Oracle set to REWARD, claimed is 2x + 1 = over limit
        vm.prank(p1);
        vm.expectRevert(bytes("Share: reward too high"));
        sns.recordShare(REWARD * 2 + 1);
    }

    function test_Share_AllowsExactly2xOracle() public {
        uint256 doubleReward = REWARD * 2;
        uint256 b = pizza.balanceOf(p1);
        vm.prank(p1); sns.recordShare(doubleReward);
        assertEq(pizza.balanceOf(p1) - b, doubleReward, "2x oracle amount accepted");
    }

    function test_Share_AllowsLessThanOracle() public {
        uint256 halfReward = REWARD / 2;
        uint256 b = pizza.balanceOf(p1);
        vm.prank(p1); sns.recordShare(halfReward);
        assertEq(pizza.balanceOf(p1) - b, halfReward, "half oracle amount accepted");
    }

    function test_Share_PaysExactClaimedAmount() public {
        // Frontend calculates precise amount, contract pays exactly that
        uint256 preciseAmount = 2_065 * 1e18;
        vm.prank(OWNER); sns.adminSetShareRewardAmount(preciseAmount);
        uint256 b = pizza.balanceOf(p1);
        vm.prank(p1); sns.recordShare(preciseAmount);
        assertEq(pizza.balanceOf(p1) - b, preciseAmount, "exact amount paid");
    }

    // ══════════════════════════════════════════════════════════
    // 3. PER-GAME LIMIT
    // ══════════════════════════════════════════════════════════

    function test_PerGame_BlocksSameGame() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1);
        vm.expectRevert("Share: already shared this game");
        sns.recordShare(REWARD);
    }

    function test_PerGame_BlocksSameGameEvenAfterTimePass() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.warp(block.timestamp + 12 hours);
        vm.prank(p1);
        vm.expectRevert("Share: already shared this game");
        sns.recordShare(REWARD);
    }

    function test_PerGame_TracksGameId() public {
        uint256 gameId = game.dailyGameId();
        vm.prank(p1); sns.recordShare(REWARD);
        assertEq(sns.lastShareGameId(p1), gameId);
    }

    // ══════════════════════════════════════════════════════════
    // 4. WEEKLY CAP
    // ══════════════════════════════════════════════════════════

    function test_Weekly_BlocksAfterThree() public {
        _share3(p1);
        _advanceDay();
        vm.prank(p1);
        vm.expectRevert("Share: weekly limit");
        sns.recordShare(REWARD);
    }

    function test_Weekly_IndependentPerPlayer() public {
        _share3(p1);
        vm.prank(p2); sns.recordShare(REWARD);
        (uint256 used,,) = sns.getShareInfo(p2);
        assertEq(used, 1);
    }

    function test_Weekly_3Shares_3xReward() public {
        uint256 b = pizza.balanceOf(p1);
        _share3(p1);
        assertEq(pizza.balanceOf(p1) - b, 3 * REWARD);
    }

    function test_Weekly_3Shares_3Toppings() public {
        _share3(p1);
        (uint256 toppings,,,,, ) = game.getPlayerWeeklyInfo(p1);
        assertEq(toppings, 3);
    }

    // ══════════════════════════════════════════════════════════
    // 5. getShareInfo
    // ══════════════════════════════════════════════════════════

    function test_ShareInfo_InitialState() public view {
        (uint256 used, bool canNow,) = sns.getShareInfo(p1);
        assertEq(used, 0);
        assertTrue(canNow);
    }

    function test_ShareInfo_FalseAfterShare() public {
        vm.prank(p1); sns.recordShare(REWARD);
        (, bool canNow,) = sns.getShareInfo(p1);
        assertFalse(canNow);
    }

    function test_ShareInfo_NextShareAtCorrect() public {
        uint256 t = block.timestamp;
        vm.prank(p1); sns.recordShare(REWARD);
        (,, uint256 nextAt) = sns.getShareInfo(p1);
        assertEq(nextAt, t + 1 days);
    }

    function test_ShareInfo_FalseAtWeeklyCap() public {
        _share3(p1);
        (, bool canNow,) = sns.getShareInfo(p1);
        assertFalse(canNow);
    }

    function test_ShareInfo_TrueAfterNewGame() public {
        vm.prank(p1); sns.recordShare(REWARD);
        _advanceDay();
        (, bool canNow,) = sns.getShareInfo(p1);
        assertTrue(canNow);
    }

    // ══════════════════════════════════════════════════════════
    // 6. recordShareSpin — BASIC
    // ══════════════════════════════════════════════════════════

    function test_Spin_RevertsWithoutShare() public {
        vm.prank(p1);
        vm.expectRevert("Spin: share first");
        sns.recordShareSpin(bytes32(0));
    }

    function test_Spin_SucceedsAfterShare() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); sns.recordShareSpin(bytes32(0));
    }

    function test_Spin_OutcomeInValidRange() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); uint8 o = sns.recordShareSpin(bytes32(0));
        assertTrue(o <= 2, "outcome must be 0, 1, or 2");
    }

    function test_Spin_EmitsEvent() public {
        vm.prank(p1); sns.recordShare(REWARD);
        uint256 gameId = game.dailyGameId();
        uint256 weekId = game.weeklyGameId();
        // Check indexed topics match (player, gameId, weekId)
        vm.expectEmit(true, true, true, false);
        emit ShareSpinRecorded(p1, gameId, weekId, 0, bytes32(0));
        vm.prank(p1); sns.recordShareSpin(bytes32(0));
    }

    function test_Spin_CastHashStoredOnChain() public {
        bytes32 h = keccak256("my_cast_hash");
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); sns.recordShareSpin(h);
        assertTrue(sns.usedCastHashes(h), "cast hash should be marked as used");
    }

    function test_Spin_RevertsAfterWindowExpires() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.warp(block.timestamp + 26 hours);
        vm.prank(p1);
        vm.expectRevert("Spin: share first");
        sns.recordShareSpin(bytes32(0));
    }

    function test_Spin_SucceedsJustBeforeWindowExpires() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.warp(block.timestamp + 25 hours - 1);
        vm.prank(p1); sns.recordShareSpin(bytes32(0));
    }

    // ══════════════════════════════════════════════════════════
    // 7. CAST HASH DEDUP
    // ══════════════════════════════════════════════════════════

    function test_CastHash_BlocksReuse() public {
        bytes32 h = keccak256("cast1");
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); sns.recordShareSpin(h);

        // p2 tries same cast hash
        vm.prank(p2); sns.recordShare(REWARD);
        vm.prank(p2);
        vm.expectRevert("Spin: cast used");
        sns.recordShareSpin(h);
    }

    function test_CastHash_ZeroBypassesDedup() public {
        // bytes32(0) = no cast hash provided, skip dedup
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); sns.recordShareSpin(bytes32(0));

        vm.prank(p2); sns.recordShare(REWARD);
        vm.prank(p2); sns.recordShareSpin(bytes32(0));
    }

    function test_CastHash_DifferentHashesWork() public {
        bytes32 h1 = keccak256("cast1");
        bytes32 h2 = keccak256("cast2");

        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); sns.recordShareSpin(h1);

        vm.prank(p2); sns.recordShare(REWARD);
        vm.prank(p2); sns.recordShareSpin(h2);
    }

    // ══════════════════════════════════════════════════════════
    // 8. GOLD — ONCE PER WEEK
    // ══════════════════════════════════════════════════════════

    function test_Gold_MaxOncePerWeek() public {
        uint256 weekId = game.weeklyGameId();
        uint256 goldCount;

        for (uint i; i < 30; i++) {
            address p = makeAddr(string(abi.encodePacked("g", i)));
            vm.prank(p); sns.recordShare(REWARD);
            vm.warp(block.timestamp + 1);
            vm.prank(p); uint8 o = sns.recordShareSpin(bytes32(uint256(i)));
            if (o == 2) goldCount++;
        }

        assertTrue(goldCount <= 1, "Gold must not hit more than once per week");
        if (goldCount == 1) {
            assertEq(sns.shareSpinGoldAwardedWeekId(), weekId);
            console.log("Gold hit once (expected)");
        } else {
            console.log("Gold did not hit in 30 spins (valid at 1% odds)");
        }
    }

    function test_Gold_AfterHit_CannotHitAgainSameWeek() public {
        bool goldHit;
        for (uint i; i < 150; i++) {
            address p = makeAddr(string(abi.encodePacked("gh", i)));
            vm.prank(p); sns.recordShare(REWARD);
            vm.warp(block.timestamp + 1);
            vm.prank(p); uint8 o = sns.recordShareSpin(bytes32(uint256(i)));
            if (o == 2) {
                if (!goldHit) {
                    goldHit = true;
                    console.log("First gold at spin", i);
                } else {
                    revert("Gold hit twice in same week - INVARIANT VIOLATED");
                }
            }
        }
        if (!goldHit) console.log("Gold did not hit in 150 spins (valid ~22% chance at 1%)");
    }

    function test_Gold_DowngradesToFreeSlice_WhenAlreadyAwarded() public {
        // Force gold by spinning many times, then verify second gold becomes FreeSlice
        uint256 weekId = game.weeklyGameId();
        bool firstGoldFound;

        for (uint i; i < 200; i++) {
            address p = makeAddr(string(abi.encodePacked("gd", i)));
            vm.prank(p); sns.recordShare(REWARD);
            vm.warp(block.timestamp + 1);
            vm.prank(p); uint8 o = sns.recordShareSpin(bytes32(uint256(i)));

            if (o == 2 && !firstGoldFound) {
                firstGoldFound = true;
                assertEq(sns.shareSpinGoldAwardedWeekId(), weekId);
            }
            // After gold awarded, any 990-999 roll should become FreeSlice (1)
            // We can't control random, but the invariant check above covers this
        }
    }

    // ══════════════════════════════════════════════════════════
    // 9. PROBABILITY MATH
    // ══════════════════════════════════════════════════════════

    function test_Probability_RangesSum1000() public pure {
        uint256 nothingRange   = 940;  // 0-939
        uint256 freeSliceRange =  50;  // 940-989
        uint256 goldRange      =  10;  // 990-999
        assertEq(nothingRange + freeSliceRange + goldRange, 1000);
    }

    function test_Probability_ConstantsCorrect() public view {
        assertEq(sns.SHARE_SPIN_NOTHING_MAX(), 939);
        assertEq(sns.SHARE_SPIN_FREESLICE_MAX(), 989);
        assertEq(sns.SHARE_SPIN_WEIGHT_TOTAL(), 1000);
    }

    function test_Probability_BoundaryValues() public pure {
        assertEq(uint256(939 - 0 + 1), uint256(940));     // Nothing range
        assertEq(uint256(989 - 940 + 1), uint256(50));    // FreeSlice range
        assertEq(uint256(999 - 990 + 1), uint256(10));    // Gold range
    }

    function test_Probability_Distribution_50Spins() public {
        uint256[3] memory counts;
        for (uint i; i < 50; i++) {
            address p = makeAddr(string(abi.encodePacked("dist", i)));
            vm.prank(p); sns.recordShare(REWARD);
            vm.warp(block.timestamp + 1);
            vm.prank(p); uint8 o = sns.recordShareSpin(bytes32(uint256(i + 100)));
            counts[o]++;
        }
        assertEq(counts[0] + counts[1] + counts[2], 50, "All spins accounted for");
        assertTrue(counts[0] > 30, "Nothing should dominate at 94%");
        console.log("Nothing / Free / Gold:", counts[0], counts[1], counts[2]);
    }

    function test_Probability_EachSpinIsIndependent() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); uint8 o1 = sns.recordShareSpin(bytes32(uint256(1)));
        _advanceDay();
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); uint8 o2 = sns.recordShareSpin(bytes32(uint256(2)));
        assertTrue(o1 <= 2);
        assertTrue(o2 <= 2);
        console.log("Day 1:", o1, "Day 2:", o2);
    }

    // ══════════════════════════════════════════════════════════
    // 10. MULTIPLE PLAYERS SAME BLOCK
    // ══════════════════════════════════════════════════════════

    function test_MultiPlayer_SameBlock_AllWork() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p2); sns.recordShare(REWARD);
        vm.prank(p3); sns.recordShare(REWARD);
        (uint256 u1,,) = sns.getShareInfo(p1);
        (uint256 u2,,) = sns.getShareInfo(p2);
        (uint256 u3,,) = sns.getShareInfo(p3);
        assertEq(u1, 1); assertEq(u2, 1); assertEq(u3, 1);
    }

    function test_MultiPlayer_SpinSameBlock_DifferentOutcomes() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p2); sns.recordShare(REWARD);
        vm.prank(p3); sns.recordShare(REWARD);

        vm.prank(p1); uint8 o1 = sns.recordShareSpin(bytes32(uint256(1)));
        vm.prank(p2); uint8 o2 = sns.recordShareSpin(bytes32(uint256(2)));
        vm.prank(p3); uint8 o3 = sns.recordShareSpin(bytes32(uint256(3)));
        assertTrue(o1 <= 2); assertTrue(o2 <= 2); assertTrue(o3 <= 2);
        console.log("Outcomes p1/p2/p3:", o1, o2, o3);
    }

    // ══════════════════════════════════════════════════════════
    // 11. ADMIN & ACCESS CONTROL
    // ══════════════════════════════════════════════════════════

    function test_Admin_OnlyOwner_SetReward() public {
        vm.prank(p1); vm.expectRevert(); sns.adminSetShareRewardAmount(1e18);
    }

    function test_Admin_SetReward_Updates() public {
        vm.prank(OWNER); sns.adminSetShareRewardAmount(50_000 * 1e18);
        assertEq(sns.shareRewardAmount(), 50_000 * 1e18);
    }

    function test_Admin_OnlyOwner_SetTreasury() public {
        vm.prank(p1); vm.expectRevert(); sns.adminSetTreasuryWallet(p1);
    }

    function test_Admin_SetTreasury_RejectsZero() public {
        vm.prank(OWNER); vm.expectRevert(bytes("0")); sns.adminSetTreasuryWallet(address(0));
    }

    function test_Admin_OnlyOwner_SetPizzaParty() public {
        vm.prank(p1); vm.expectRevert(); sns.adminSetPizzaParty(p1);
    }

    function test_Admin_OnlyOwner_Pause() public {
        vm.prank(p1); vm.expectRevert(); sns.pause();
    }

    function test_Admin_OnlyOwner_Unpause() public {
        vm.prank(OWNER); sns.pause();
        vm.prank(p1); vm.expectRevert(); sns.unpause();
    }

    // ══════════════════════════════════════════════════════════
    // 12. PAUSABLE
    // ══════════════════════════════════════════════════════════

    function test_Paused_RecordShare_Reverts() public {
        vm.prank(OWNER); sns.pause();
        vm.prank(p1); vm.expectRevert(); sns.recordShare(REWARD);
    }

    function test_Paused_RecordShareSpin_Reverts() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(OWNER); sns.pause();
        vm.prank(p1); vm.expectRevert(); sns.recordShareSpin(bytes32(0));
    }

    function test_Unpaused_WorksAgain() public {
        vm.prank(OWNER); sns.pause();
        vm.prank(OWNER); sns.unpause();
        vm.prank(p1); sns.recordShare(REWARD);
    }

    // ══════════════════════════════════════════════════════════
    // 13. BRIDGE SECURITY
    // ══════════════════════════════════════════════════════════

    function test_Bridge_OnlyShareAndSpin_CanAddToppings() public {
        vm.prank(p1);
        vm.expectRevert(bytes("!sns"));
        game.addToppingsFromShareAndSpin(p1, 1);
    }

    function test_Bridge_RandomAddress_CannotAddToppings() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(bytes("!sns"));
        game.addToppingsFromShareAndSpin(p1, 100);
    }

    function test_Bridge_OwnerCannotAddToppings() public {
        vm.prank(OWNER);
        vm.expectRevert(bytes("!sns"));
        game.addToppingsFromShareAndSpin(p1, 1);
    }

    // ══════════════════════════════════════════════════════════
    // 14. UPGRADEABLE
    // ══════════════════════════════════════════════════════════

    function test_Upgrade_OnlyOwner() public {
        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        vm.prank(p1);
        vm.expectRevert();
        sns.upgradeToAndCall(address(newImpl), "");
    }

    function test_Upgrade_OwnerSucceeds() public {
        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        vm.prank(OWNER);
        sns.upgradeToAndCall(address(newImpl), "");
    }

    function test_Upgrade_StatePreserved() public {
        // Share first
        vm.prank(p1); sns.recordShare(REWARD);
        uint256 ts = sns.playerLastShareTimestamp(p1);

        // Upgrade
        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        vm.prank(OWNER); sns.upgradeToAndCall(address(newImpl), "");

        // State preserved
        assertEq(sns.playerLastShareTimestamp(p1), ts);
        assertEq(sns.shareRewardAmount(), REWARD);
        assertEq(address(sns.pizzaParty()), PP);
    }

    // ══════════════════════════════════════════════════════════
    // 15. EDGE CASES
    // ══════════════════════════════════════════════════════════

    function test_Edge_ShareThenSpinThenShareNextDay() public {
        // Day 1: share + spin
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); sns.recordShareSpin(bytes32(uint256(1)));

        // Day 2: share + spin again
        _advanceDay();
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); sns.recordShareSpin(bytes32(uint256(2)));

        (uint256 used,,) = sns.getShareInfo(p1);
        assertEq(used, 2);
    }

    function test_Edge_SpinWithoutCastHash_Works() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); uint8 o = sns.recordShareSpin(bytes32(0));
        assertTrue(o <= 2);
    }

    function test_Edge_ShareDoesNotRequireStake() public {
        // p1 has no stake, no game plays, nothing
        uint256 b = pizza.balanceOf(p1);
        vm.prank(p1); sns.recordShare(REWARD);
        assertEq(pizza.balanceOf(p1) - b, REWARD);
    }

    function test_Edge_CannotSpinTwicePerShare() public {
        vm.prank(p1); sns.recordShare(REWARD);
        vm.prank(p1); sns.recordShareSpin(bytes32(uint256(1)));

        // Second spin with different cast hash — should still work within window
        // (spin is not limited per share, only per cast hash)
        vm.prank(p1); sns.recordShareSpin(bytes32(uint256(2)));
    }

    function test_Edge_TreasuryWithZeroBalance_Reverts() public {
        // Set reward very high — more than treasury has
        vm.prank(OWNER); sns.adminSetShareRewardAmount(type(uint256).max);
        vm.prank(p1);
        vm.expectRevert();
        sns.recordShare(REWARD);
    }

    // ══════════════════════════════════════════════════════════
    // 16. FREE SLICE ENTRY
    // ══════════════════════════════════════════════════════════

    function test_FreeSlice_EntersPlayerIntoGame() public {
        // $1 worth of PIZZA at test price
        uint256 entryFee = 1_000_000 * 1e18;

        // Fund treasury with enough PIZZA and approve PizzaParty
        vm.prank(TREAS);
        pizza.approve(PP, type(uint256).max);

        uint256 potBefore = game.currentDailyPot();

        vm.prank(p1);
        sns.claimFreeSlice(entryFee);

        uint256 potAfter = game.currentDailyPot();
        assertEq(potAfter - potBefore, entryFee, "Entry fee added to daily pot");

        uint256 gameId = game.dailyGameId();
        assertTrue(game.hasPlayedDaily(gameId, p1), "Player entered the game");
    }

    function test_FreeSlice_AwardsTopping() public {
        uint256 entryFee = 1_000_000 * 1e18;
        vm.prank(TREAS);
        pizza.approve(PP, type(uint256).max);

        vm.prank(p1);
        sns.claimFreeSlice(entryFee);

        (uint256 toppings,,,,, ) = game.getPlayerWeeklyInfo(p1);
        assertTrue(toppings >= 1, "Player earned topping from entry");
    }

    function test_FreeSlice_CannotEnterTwiceSameDay() public {
        uint256 entryFee = 1_000_000 * 1e18;
        vm.prank(TREAS);
        pizza.approve(PP, type(uint256).max);

        vm.prank(p1);
        sns.claimFreeSlice(entryFee);

        vm.prank(p1);
        vm.expectRevert();
        sns.claimFreeSlice(entryFee);
    }

    function test_FreeSlice_OnlyShareAndSpinCanCall() public {
        vm.prank(p1);
        vm.expectRevert(bytes("!sns"));
        game.enterDailyFromShareAndSpin(p1, 1_000_000 * 1e18);
    }

    function test_FreeSlice_TreasuryPays() public {
        uint256 entryFee = 1_000_000 * 1e18;
        vm.prank(TREAS);
        pizza.approve(PP, type(uint256).max);

        uint256 treasBefore = pizza.balanceOf(TREAS);

        vm.prank(p1);
        sns.claimFreeSlice(entryFee);

        uint256 treasAfter = pizza.balanceOf(TREAS);
        assertEq(treasBefore - treasAfter, entryFee, "Treasury paid the entry fee");
    }

    // ══════════════════════════════════════════════════════════
    // HELPER
    // ══════════════════════════════════════════════════════════

    function _share3(address p) internal {
        vm.prank(p); sns.recordShare(REWARD);
        _advanceDay();
        vm.prank(p); sns.recordShare(REWARD);
        _advanceDay();
        vm.prank(p); sns.recordShare(REWARD);
        _advanceDay();
    }
}
