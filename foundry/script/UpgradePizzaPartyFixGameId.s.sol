// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradePizzaPartyFixGameId
 * @dev Upgrades the PizzaParty proxy to fix the empty game settlement bug
 *      and resets the dailyGameId to the correct value (3)
 *
 * Changes in this upgrade:
 * - settleDailyGame() now takes NO parameters (USD value calculated on frontend)
 * - settleWeeklyGame() now takes NO parameters (USD value calculated on frontend)
 * - settleDailyGame requires at least 1 player (prevents empty game settlements)
 * - settleWeeklyGame requires at least 1 claimer
 * - Added adminSetDailyGameId() to correct game ID after skipped empty games
 * - Added adminSetWeeklyGameId() to correct weekly game ID
 *
 * Usage:
 * - Dry run: forge script script/UpgradePizzaPartyFixGameId.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradePizzaPartyFixGameId.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradePizzaPartyFixGameId.s.sol --fork-url $BASE_RPC --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradePizzaPartyFixGameId is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    // Correct game ID (we've had 2 real games, so current game should be #3)
    uint256 constant CORRECT_DAILY_GAME_ID = 3;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("UPGRADING PIZZA PARTY - FIX GAME ID BUG");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("");

        // Check current state
        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        uint256 currentGameId = current.dailyGameId();
        console.log("Current owner:", current.owner());
        console.log("Current dailyGameId:", currentGameId);
        console.log("Target dailyGameId:", CORRECT_DAILY_GAME_ID);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        console.log("--- Deploying new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation address:", address(newImpl));

        // Upgrade proxy to new implementation
        console.log("");
        console.log("--- Upgrading proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // Fix the game ID
        console.log("");
        console.log("--- Fixing dailyGameId ---");
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        upgraded.adminSetDailyGameId(CORRECT_DAILY_GAME_ID);
        console.log("dailyGameId set to:", CORRECT_DAILY_GAME_ID);

        vm.stopBroadcast();

        // Verify upgrade
        console.log("");
        console.log("===========================================");
        console.log("UPGRADE VERIFICATION");
        console.log("===========================================");

        console.log("Owner (should be unchanged):", upgraded.owner());
        console.log("dailyGameId (should be 3):", upgraded.dailyGameId());
        console.log("weeklyGameId:", upgraded.weeklyGameId());

        // Check the current game state
        (uint256 startTime, uint256 endTime, uint256 playerCount, uint256 pot, bool settled) = upgraded.getCurrentDailyGame();
        console.log("");
        console.log("--- Current Daily Game State ---");
        console.log("Start time:", startTime);
        console.log("End time:", endTime);
        console.log("Player count:", playerCount);
        console.log("Pot:", pot);
        console.log("Settled:", settled);

        console.log("");
        console.log("Upgrade successful! Bug fixes applied:");
        console.log("- settleDailyGame() now takes NO parameters");
        console.log("- settleWeeklyGame() now takes NO parameters");
        console.log("- settleDailyGame requires at least 1 player");
        console.log("- settleWeeklyGame requires at least 1 claimer");
        console.log("- adminSetDailyGameId() added for game ID corrections");
        console.log("- adminSetWeeklyGameId() added for weekly corrections");
    }
}
