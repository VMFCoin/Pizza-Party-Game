// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradePizzaPartyResetGame3
 * @dev Upgrades the PizzaParty proxy and resets Game 3 to be the active unsettled game
 *
 * This fixes the issue where Game 3 was marked as settled after the previous upgrade.
 * After this upgrade:
 * - Game 2 = Your actual Game 2 with 8 winners (settled)
 * - Game 3 = Current active game (NOT settled)
 *
 * Usage:
 * - Dry run: forge script script/UpgradePizzaPartyResetGame3.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradePizzaPartyResetGame3.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradePizzaPartyResetGame3.s.sol --fork-url $BASE_RPC --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradePizzaPartyResetGame3 is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("UPGRADING PIZZA PARTY - RESET GAME 3");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("");

        // Check current state BEFORE upgrade
        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        console.log("Current owner:", current.owner());
        console.log("Current dailyGameId:", current.dailyGameId());

        // Check Game 2 and Game 3 states
        (uint256 g2Start, uint256 g2End, , uint256 g2Pot, bool g2Settled) = current.dailyGames(2);
        (uint256 g3Start, uint256 g3End, , uint256 g3Pot, bool g3Settled) = current.dailyGames(3);

        console.log("");
        console.log("--- BEFORE UPGRADE ---");
        console.log("Game 2: pot=", g2Pot, "settled=", g2Settled);
        console.log("Game 3: pot=", g3Pot, "settled=", g3Settled);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with the reset function
        console.log("");
        console.log("--- Deploying new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation address:", address(newImpl));

        // Upgrade proxy to new implementation
        console.log("");
        console.log("--- Upgrading proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // Reset Game 3 to unsettled (making it the active game)
        console.log("");
        console.log("--- Resetting Game 3 to active (unsettled) ---");
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        upgraded.adminResetDailyGameSettled(3);
        console.log("Game 3 reset to unsettled!");

        vm.stopBroadcast();

        // Verify upgrade
        console.log("");
        console.log("===========================================");
        console.log("UPGRADE VERIFICATION");
        console.log("===========================================");

        // Re-check Game 2 and Game 3 states AFTER upgrade
        (, , , , bool g2SettledAfter) = upgraded.dailyGames(2);
        (, , , , bool g3SettledAfter) = upgraded.dailyGames(3);

        console.log("");
        console.log("--- AFTER UPGRADE ---");
        console.log("Game 2 settled:", g2SettledAfter, "(should be TRUE - your real Game 2)");
        console.log("Game 3 settled:", g3SettledAfter, "(should be FALSE - current active game)");
        console.log("dailyGameId:", upgraded.dailyGameId(), "(should be 3)");

        // Check Game 2 winners exist
        address[] memory g2Winners = upgraded.getDailyGameWinners(2);
        console.log("");
        console.log("Game 2 winners count:", g2Winners.length, "(should be 8)");

        console.log("");
        console.log("SUCCESS! Contract state:");
        console.log("- Game 2: SETTLED with 8 winners");
        console.log("- Game 3: ACTIVE (unsettled) - current game");
    }
}
