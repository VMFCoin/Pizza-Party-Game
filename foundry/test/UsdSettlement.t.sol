// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";

contract UsdSettlementTest is Test {
    PizzaPartyV2Upgradeable public pizzaParty;

    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant OWNER = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;

    function setUp() public {
        // Fork Base mainnet
        vm.createSelectFork("https://base-rpc.publicnode.com");
        pizzaParty = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
    }

    function test_DailyGameUsdValueStored() public {
        // Verify Game 3 has USD value set
        uint256 game3Usd = pizzaParty.getDailyGameUsdValue(3);
        assertEq(game3Usd, 591, "Game 3 should have USD value 591 cents");
        console.log("Game 3 USD cents:", game3Usd);
    }

    function test_SettleDailyGameWithUsd() public {
        // Get current state
        uint256 gameId = pizzaParty.dailyGameId();
        console.log("Current dailyGameId:", gameId);

        // Get game end time and warp past it
        (uint256 startTime, uint256 endTime,,,) = _getDailyGame(gameId);
        console.log("Game", gameId, "ends at:", endTime);

        // Warp to after end time
        vm.warp(endTime + 1);

        // Verify game is ready
        bool isReady = pizzaParty.isDailyGameReady();
        assertTrue(isReady, "Game should be ready to settle");

        // Calculate expected USD (1525 PIZZA * 0.94 / 8 winners * $0.00869 = ~$1.56 = 156 cents)
        uint256 usdCentsPerWinner = 156;

        // Settle with USD - anyone can call
        vm.prank(address(0x1234));
        pizzaParty.settleDailyGameWithUsd(usdCentsPerWinner);

        // Verify USD value was stored
        uint256 storedUsd = pizzaParty.getDailyGameUsdValue(gameId);
        assertEq(storedUsd, usdCentsPerWinner, "USD value should be stored");
        console.log("Stored USD cents for game", gameId, ":", storedUsd);

        // Verify game was settled
        (,,,, bool settled) = _getDailyGame(gameId);
        assertTrue(settled, "Game should be settled");

        // Verify winners were selected
        address[] memory winners = pizzaParty.getDailyGameWinners(gameId);
        assertEq(winners.length, 8, "Should have 8 winners");
        console.log("Winners count:", winners.length);
    }

    function test_SettleDailyGameWithUsd_RequiresUsdValue() public {
        uint256 gameId = pizzaParty.dailyGameId();
        (,uint256 endTime,,,) = _getDailyGame(gameId);
        vm.warp(endTime + 1);

        // Should revert with 0 USD value
        vm.expectRevert("USD value required");
        pizzaParty.settleDailyGameWithUsd(0);
    }

    function test_AdminSetDailyGameUsdValue() public {
        vm.prank(OWNER);
        pizzaParty.adminSetDailyGameUsdValue(1, 500);

        uint256 storedUsd = pizzaParty.getDailyGameUsdValue(1);
        assertEq(storedUsd, 500, "Admin should be able to set USD value");
    }

    function test_AdminSetDailyGameUsdValue_OnlyOwner() public {
        vm.prank(address(0x1234));
        vm.expectRevert();
        pizzaParty.adminSetDailyGameUsdValue(1, 500);
    }

    function test_WeeklyGameUsdValueFunctions() public {
        // Test that weekly USD functions exist and work
        uint256 weekId = pizzaParty.weeklyGameId();
        console.log("Current weeklyGameId:", weekId);

        // Get weekly game data
        (uint256 claimStart, uint256 claimEnd,,,) = _getWeeklyGame(weekId);
        console.log("Week claim window start:", claimStart);
        console.log("Week claim window end:", claimEnd);

        // Test admin can set weekly USD value
        vm.prank(OWNER);
        pizzaParty.adminSetWeeklyGameUsdValue(weekId, 650);

        uint256 storedUsd = pizzaParty.getWeeklyGameUsdValue(weekId);
        assertEq(storedUsd, 650, "Admin should be able to set weekly USD value");
        console.log("Stored weekly USD cents:", storedUsd);
    }

    function test_SettleWeeklyGameWithUsd_WhenReady() public {
        uint256 weekId = pizzaParty.weeklyGameId();

        // Get weekly game data
        (,uint256 claimEnd,,,) = _getWeeklyGame(weekId);

        // First check if there are any claimers
        address[] memory claimers = pizzaParty.getWeeklyGameClaimers(weekId);
        console.log("Week", weekId, "claimers:", claimers.length);

        // If no claimers, skip this test (can't settle empty week)
        if (claimers.length == 0) {
            console.log("Skipping - no claimers in weekly game");
            return;
        }

        // Warp to after claim window
        vm.warp(claimEnd + 1);

        // Verify game is ready
        bool isReady = pizzaParty.isWeeklyGameReady();
        assertTrue(isReady, "Weekly game should be ready to settle");

        // Calculate USD (jackpot / 10 winners * price)
        uint256 usdCentsPerWinner = 650;

        // Settle with USD
        vm.prank(address(0x1234));
        pizzaParty.settleWeeklyGameWithUsd(usdCentsPerWinner);

        // Verify USD value was stored
        uint256 storedUsd = pizzaParty.getWeeklyGameUsdValue(weekId);
        assertEq(storedUsd, usdCentsPerWinner, "Weekly USD value should be stored");

        // Verify game was settled
        (,,,,bool settled) = _getWeeklyGame(weekId);
        assertTrue(settled, "Weekly game should be settled");

        console.log("Weekly game settled with USD cents:", storedUsd);
    }

    function test_SettleWeeklyGameWithUsd_RequiresUsdValue() public {
        uint256 weekId = pizzaParty.weeklyGameId();
        (,uint256 claimEnd,,,) = _getWeeklyGame(weekId);
        vm.warp(claimEnd + 1);

        // Check if there are claimers first
        address[] memory claimers = pizzaParty.getWeeklyGameClaimers(weekId);
        if (claimers.length == 0) {
            console.log("Skipping - no claimers");
            return;
        }

        // Should revert with 0 USD value
        vm.expectRevert("USD value required");
        pizzaParty.settleWeeklyGameWithUsd(0);
    }

    function _getDailyGame(uint256 gameId) internal view returns (
        uint256 startTime,
        uint256 endTime,
        address firstPlayer,
        uint256 potAmount,
        bool settled
    ) {
        (bool success, bytes memory data) = address(pizzaParty).staticcall(
            abi.encodeWithSignature("dailyGames(uint256)", gameId)
        );
        require(success, "Failed to get game data");
        return abi.decode(data, (uint256, uint256, address, uint256, bool));
    }

    function _getWeeklyGame(uint256 weekId) internal view returns (
        uint256 claimWindowStart,
        uint256 claimWindowEnd,
        uint256 totalClaimedToppings,
        uint256 potAmount,
        bool settled
    ) {
        (bool success, bytes memory data) = address(pizzaParty).staticcall(
            abi.encodeWithSignature("weeklyGames(uint256)", weekId)
        );
        require(success, "Failed to get weekly game data");
        return abi.decode(data, (uint256, uint256, uint256, uint256, bool));
    }
}
