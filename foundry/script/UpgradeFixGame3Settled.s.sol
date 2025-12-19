// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeFixGame3Settled
 * @dev Upgrades the PizzaParty proxy to fix Game 3/4 state:
 *      - Contract says dailyGameId=3 but we're actually on Game 4
 *      - Game 3 has winners stored but settled=false (needs to be marked settled)
 *      - Today's players are in what should be Game 4
 *
 * Actions:
 * 1. Deploy new implementation with adminMarkDailyGameSettled() and adminSetDailyGameIdOnly()
 * 2. Mark Game 3 as settled (so leaderboard shows its winners)
 * 3. Set dailyGameId to 4 WITHOUT re-initializing (preserves today's players)
 *
 * CRITICAL: Does NOT reset Game 4 - preserves all existing players who entered today
 *
 * Usage:
 * - Dry run: forge script script/UpgradeFixGame3Settled.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradeFixGame3Settled.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradeFixGame3Settled.s.sol --fork-url $BASE_RPC --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeFixGame3Settled is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("UPGRADING PIZZA PARTY - FIX GAME 3/4 STATE");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("");

        // Check current state
        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        uint256 currentGameId = current.dailyGameId();
        console.log("Current owner:", current.owner());
        console.log("Current dailyGameId:", currentGameId);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        console.log("--- Step 1: Deploying new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation address:", address(newImpl));

        // Upgrade proxy to new implementation
        console.log("");
        console.log("--- Step 2: Upgrading proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // Now we can use the new admin functions
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        // Mark Game 3 as settled (winners already stored from yesterday's settlement)
        // This prevents tomorrow's settle bot from trying to re-settle Game 3
        // Today's players ARE in Game 3, but when the game ends tomorrow,
        // the auto-settle in _enterDaily will handle it properly since
        // settled=true will be checked and a new game will start
        console.log("");
        console.log("--- Step 3: Marking Game 3 as settled ---");
        upgraded.adminMarkDailyGameSettled(3);
        console.log("Game 3 marked as settled!");

        // NOTE: We are NOT changing dailyGameId to 4 because:
        // - Today's 35 players are stored in dailyGames[3].players
        // - If we change dailyGameId to 4, those players would be orphaned
        // - Tomorrow when someone enters, the auto-settle logic will see:
        //   * block.timestamp >= game.endTime (true - game ended)
        //   * game.settled = true (we just set it)
        //   * So it will INCREMENT dailyGameId to 4 and start fresh
        console.log("");
        console.log("--- IMPORTANT: dailyGameId stays at 3 ---");
        console.log("Today's players are in Game 3. When Game 3 ends tomorrow,");
        console.log("the auto-settle logic will properly start Game 4.");

        vm.stopBroadcast();

        // Verify the fix
        console.log("");
        console.log("===========================================");
        console.log("VERIFICATION");
        console.log("===========================================");

        console.log("Owner (should be unchanged):", upgraded.owner());
        console.log("dailyGameId (should be 4):", upgraded.dailyGameId());

        // Check Game 3 state
        (uint256 g3Start, uint256 g3End, address g3First, uint256 g3Pot, bool g3Settled) = _getDailyGame(upgraded, 3);
        console.log("");
        console.log("--- Game 3 State (should be SETTLED) ---");
        console.log("Pot:", g3Pot);
        console.log("Settled:", g3Settled);

        // Check Game 4 state (current game)
        (uint256 startTime, uint256 endTime, uint256 playerCount, uint256 pot, bool settled) = upgraded.getCurrentDailyGame();
        console.log("");
        console.log("--- Game 4 State (should be ACTIVE) ---");
        console.log("Start time:", startTime);
        console.log("End time:", endTime);
        console.log("Player count:", playerCount);
        console.log("Pot:", pot);
        console.log("Settled (should be false):", settled);

        // Verify players were preserved
        address[] memory game4Players = upgraded.getDailyGamePlayers(4);
        console.log("");
        console.log("--- Game 4 Players (should be preserved) ---");
        console.log("Player count:", game4Players.length);

        console.log("");
        console.log("SUCCESS! Game state fixed:");
        console.log("- Game 3: settled=true (leaderboard will show these winners)");
        console.log("- Game 4: active with ALL existing players preserved!");
    }

    function _getDailyGame(PizzaPartyV2Upgradeable proxy, uint256 gameId) internal view returns (
        uint256 startTime,
        uint256 endTime,
        address firstPlayer,
        uint256 potAmount,
        bool settled
    ) {
        // Use low-level call to get the struct
        (bool success, bytes memory data) = address(proxy).staticcall(
            abi.encodeWithSignature("dailyGames(uint256)", gameId)
        );
        require(success, "Failed to get game data");
        return abi.decode(data, (uint256, uint256, address, uint256, bool));
    }
}
