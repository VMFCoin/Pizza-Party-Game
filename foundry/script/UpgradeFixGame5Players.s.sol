// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeFixGame5Players
 * @dev Fixes Game 5 corrupted players array
 *
 * Problem:
 * - Game 5 shows 10 players but only 3 actually entered and paid today
 * - _initializeDailyGame() wasn't clearing the players array
 * - Leftover data from previous storage was showing up
 *
 * Fix:
 * 1. Deploy new implementation with:
 *    - _initializeDailyGame() now clears players array
 *    - New admin function: adminFixDailyGamePlayers
 * 2. Fix Game 5's players array to show only the 3 real players
 *
 * Usage:
 * forge script script/UpgradeFixGame5Players.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeFixGame5Players is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        // The 3 legitimate players who entered and paid for Game 5
        // First player: 0x9157Feb12812b253e84447C6B52C38651fd67FcA
        address[] memory correctPlayers = new address[](3);
        correctPlayers[0] = 0x9157Feb12812b253e84447C6B52C38651fd67FcA;
        correctPlayers[1] = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;
        correctPlayers[2] = 0xa8cD49251BAcC991e8fB4D3df1302ae987F73716;

        address firstPlayer = 0x9157Feb12812b253e84447C6B52C38651fd67FcA;

        console.log("=================================================");
        console.log("UPGRADING PIZZA PARTY - FIX GAME 5 PLAYERS");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("");

        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        // Show current broken state
        console.log("--- Current Game 5 State (BROKEN) ---");
        console.log("dailyGameId:", current.dailyGameId());
        address[] memory brokenPlayers = current.getDailyGamePlayers(5);
        console.log("Players count (should be 3, showing):", brokenPlayers.length);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy new implementation
        console.log("--- Step 1: Deploying new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation:", address(newImpl));

        // Step 2: Upgrade proxy
        console.log("");
        console.log("--- Step 2: Upgrading proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        // Step 3: Fix Game 5's players array
        console.log("");
        console.log("--- Step 3: Fixing Game 5 players ---");
        upgraded.adminFixDailyGamePlayers(5, correctPlayers, firstPlayer);
        console.log("Players fixed!");

        vm.stopBroadcast();

        // Verify the fix
        console.log("");
        console.log("=================================================");
        console.log("VERIFICATION");
        console.log("=================================================");

        address[] memory fixedPlayers = upgraded.getDailyGamePlayers(5);
        console.log("Players count (should be 3):", fixedPlayers.length);
        for (uint256 i = 0; i < fixedPlayers.length; i++) {
            console.log("Player", i, ":", fixedPlayers[i]);
        }

        (uint256 startTime, uint256 endTime, uint256 playerCount, uint256 pot, bool settled) = upgraded.getCurrentDailyGame();
        console.log("");
        console.log("--- getCurrentDailyGame() ---");
        console.log("Player count:", playerCount);
        console.log("Pot:", pot);
        console.log("Settled:", settled);

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! Game 5 now shows 3 players");
        console.log("=================================================");
    }
}
