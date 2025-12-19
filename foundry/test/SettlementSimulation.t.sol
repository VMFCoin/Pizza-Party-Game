// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";

/**
 * @title SettlementSimulationTest
 * @dev Forks Base mainnet and simulates settlement with current on-chain state
 *      Tests that the settle-game cron job will execute without errors
 */
contract SettlementSimulationTest is Test {
    PizzaPartyV2Upgradeable public pizzaParty;
    PizzaParlorManagerUpgradeable public parlorManager;

    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function setUp() public {
        // Fork Base mainnet at latest block
        vm.createSelectFork("https://mainnet.base.org");
        pizzaParty = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        parlorManager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);
    }

    function test_CurrentGameStateAndSettlement() public {
        console.log("\n=== Current On-Chain State ===");

        // Get current game info
        uint256 dailyGameId = pizzaParty.dailyGameId();
        console.log("Daily Game ID: %s", dailyGameId);

        // Get game details
        (uint256 startTime, uint256 endTime, uint256 playerCount, uint256 pot, bool settled) =
            pizzaParty.getCurrentDailyGame();

        console.log("Start Time: %s", startTime);
        console.log("End Time: %s", endTime);
        console.log("Player Count: %s", playerCount);
        console.log("Pot (PIZZA): %s", pot / 1e18);
        console.log("Settled: %s", settled);

        // Get actual players list
        address[] memory players = pizzaParty.getDailyGamePlayers(dailyGameId);
        console.log("\n--- Players in Game %s ---", dailyGameId);
        for (uint256 i = 0; i < players.length; i++) {
            console.log("Player %s: %s", i + 1, players[i]);
        }

        // Check if game is ready to settle
        bool isDailyReady = pizzaParty.isDailyGameReady();
        console.log("\nisDailyGameReady: %s", isDailyReady);

        // Check ParlorManager state
        console.log("\n--- Parlor Manager State ---");
        uint256 totalParlors = parlorManager.totalParlors();
        uint256 parlorOwnersCount = parlorManager.parlorOwnersCount();
        console.log("Total Parlors: %s", totalParlors);
        console.log("Parlor Owners Count: %s", parlorOwnersCount);

        // List parlor owners and their parlor counts
        for (uint256 i = 0; i < parlorOwnersCount; i++) {
            address owner = parlorManager.parlorOwnerAt(i);
            uint256 count = parlorManager.parlorCount(owner);
            uint256 claimable = parlorManager.claimableBalance(owner);
            console.log("Owner %s: %s parlors, %s PIZZA claimable", i + 1, count, claimable / 1e18);
        }

        // Check pending fees
        uint256 pendingFees = parlorManager.pendingFees();
        console.log("\nPending Fees: %s PIZZA", pendingFees / 1e18);

        // If game is ready, simulate settlement
        if (isDailyReady) {
            console.log("\n=== Simulating Settlement ===");
            _simulateSettlement(dailyGameId, pot, players.length);
        } else {
            console.log("\nGame not ready to settle yet. Warping to after end time...");
            vm.warp(endTime + 1);

            isDailyReady = pizzaParty.isDailyGameReady();
            console.log("isDailyGameReady after warp: %s", isDailyReady);

            if (isDailyReady) {
                _simulateSettlement(dailyGameId, pot, players.length);
            }
        }
    }

    function _simulateSettlement(uint256 gameId, uint256 pot, uint256 playerCount) internal {
        // Calculate expected allocations
        uint256 charityTotal = (pot * 300) / 10000; // 3%
        uint256 ownerFee = (pot * 300) / 10000;     // 3%
        uint256 playersPool = (pot * 9400) / 10000; // 94%

        uint256 winnerCount = playerCount < 8 ? playerCount : 8;
        uint256 perWinner = playersPool / winnerCount;

        // At $0.007/PIZZA
        uint256 perWinnerUsdCents = (perWinner * 7) / 1e16;

        console.log("\n--- Expected Allocations ---");
        console.log("Charity (3%%): %s PIZZA", charityTotal / 1e18);
        console.log("Owner Fee (3%%): %s PIZZA", ownerFee / 1e18);
        console.log("Players Pool (94%%): %s PIZZA", playersPool / 1e18);
        console.log("Per Winner: %s PIZZA (~$%s.%s)", perWinner / 1e18, perWinnerUsdCents / 100, perWinnerUsdCents % 100);
        console.log("Expected Winners: %s", winnerCount);

        // Record balances before
        address pizzaToken = address(pizzaParty.pizzaToken());
        uint256 parlorManagerBalBefore = IToken(pizzaToken).balanceOf(address(parlorManager));

        // Perform settlement (anyone can call)
        console.log("\nExecuting settleDailyGameWithUsd...");
        uint256 usdCents = (perWinner * 7) / 1e16; // Convert to cents at $0.007
        if (usdCents == 0) usdCents = 1; // Minimum 1 cent

        pizzaParty.settleDailyGameWithUsd(usdCents);

        console.log("Settlement successful!");

        // Verify settlement
        (,,,, bool settled) = pizzaParty.getCurrentDailyGame();
        assertTrue(settled || pizzaParty.dailyGameId() > gameId, "Game should be settled or advanced");

        // Get winners
        address[] memory winners = pizzaParty.getDailyGameWinners(gameId);
        console.log("\n--- Winners ---");
        for (uint256 i = 0; i < winners.length; i++) {
            console.log("Winner %s: %s", i + 1, winners[i]);
        }

        // Check USD value was stored
        uint256 storedUsd = pizzaParty.getDailyGameUsdValue(gameId);
        console.log("\nStored USD cents per winner: %s ($%s.%s)", storedUsd, storedUsd / 100, storedUsd % 100);

        // Check ParlorManager received owner fee
        uint256 parlorManagerBalAfter = IToken(pizzaToken).balanceOf(address(parlorManager));
        console.log("\n--- Parlor Manager Fee ---");
        console.log("Balance Before: %s PIZZA", parlorManagerBalBefore / 1e18);
        console.log("Balance After: %s PIZZA", parlorManagerBalAfter / 1e18);

        // Check pending fees
        uint256 pendingFees = parlorManager.pendingFees();
        console.log("Pending Fees: %s PIZZA", pendingFees / 1e18);

        // Simulate cron job allocating fees if pending
        if (pendingFees > 0) {
            console.log("\nAllocating parlor fees...");
            parlorManager.allocateFees();
            console.log("Allocation successful!");

            // Check claimable balances
            console.log("\n--- Updated Claimable Balances ---");
            uint256 parlorOwnersCount = parlorManager.parlorOwnersCount();
            for (uint256 i = 0; i < parlorOwnersCount; i++) {
                address owner = parlorManager.parlorOwnerAt(i);
                uint256 claimable = parlorManager.claimableBalance(owner);
                if (claimable > 0) {
                    console.log("Owner %s: %s PIZZA claimable", i + 1, claimable / 1e18);
                }
            }
        }

        console.log("\n=== Settlement Simulation Complete ===");
    }

    function test_SettlementWillSucceed() public {
        console.log("\n=== Testing Settlement Will Succeed ===");

        uint256 dailyGameId = pizzaParty.dailyGameId();
        address[] memory players = pizzaParty.getDailyGamePlayers(dailyGameId);

        console.log("Game ID: %s", dailyGameId);
        console.log("Players: %s", players.length);

        // The game must have at least 1 player
        assertTrue(players.length > 0, "Game must have players to settle");

        // Get end time and warp past it
        (,uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();
        vm.warp(endTime + 1);

        assertTrue(pizzaParty.isDailyGameReady(), "Game should be ready after warp");

        // Calculate USD value (simplified - at $0.007/PIZZA)
        uint256 pot = pizzaParty.currentDailyPot();
        uint256 playersPool = (pot * 9400) / 10000;
        uint256 winnerCount = players.length < 8 ? players.length : 8;
        uint256 perWinner = playersPool / winnerCount;
        uint256 usdCents = (perWinner * 7) / 1e16;
        if (usdCents == 0) usdCents = 1;

        console.log("Pot: %s PIZZA", pot / 1e18);
        console.log("Per Winner: %s PIZZA", perWinner / 1e18);
        console.log("USD cents: %s", usdCents);

        // This should NOT revert
        pizzaParty.settleDailyGameWithUsd(usdCents);

        console.log("Settlement transaction succeeded!");

        // Verify
        address[] memory winners = pizzaParty.getDailyGameWinners(dailyGameId);
        assertEq(winners.length, winnerCount, "Should have correct number of winners");

        console.log("Winners selected: %s", winners.length);
        console.log("\nTEST PASSED: Settlement will succeed without errors");
    }

    function test_ParlorFeeAllocationWillSucceed() public {
        console.log("\n=== Testing Parlor Fee Allocation ===");

        // First settle to generate fees
        uint256 dailyGameId = pizzaParty.dailyGameId();
        (,uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();
        vm.warp(endTime + 1);

        uint256 pot = pizzaParty.currentDailyPot();
        uint256 playersPool = (pot * 9400) / 10000;
        address[] memory players = pizzaParty.getDailyGamePlayers(dailyGameId);
        uint256 winnerCount = players.length < 8 ? players.length : 8;
        uint256 perWinner = playersPool / winnerCount;
        uint256 usdCents = (perWinner * 7) / 1e16;
        if (usdCents == 0) usdCents = 1;

        pizzaParty.settleDailyGameWithUsd(usdCents);
        console.log("Daily game settled");

        // Check pending fees
        uint256 pendingFees = parlorManager.pendingFees();
        console.log("Pending fees after settlement: %s PIZZA", pendingFees / 1e18);

        // Allocate fees (this is what the cron does)
        if (pendingFees > 0) {
            parlorManager.allocateFees();
            console.log("Fees allocated successfully!");

            uint256 pendingAfter = parlorManager.pendingFees();
            assertEq(pendingAfter, 0, "Pending fees should be 0 after allocation");
        }

        console.log("\nTEST PASSED: Parlor fee allocation will succeed");
    }
}

interface IToken {
    function balanceOf(address) external view returns (uint256);
}
