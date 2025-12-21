// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeFixCurrentDailyPot
 * @dev Fixes the corrupted currentDailyPot value caused by storage slot collision
 *      Adds adminSetCurrentDailyPot() function and resets pot to 0
 *
 * Usage:
 * - Dry run: forge script script/UpgradeFixCurrentDailyPot.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: forge script script/UpgradeFixCurrentDailyPot.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeFixCurrentDailyPot is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("FIX CORRUPTED currentDailyPot");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy:", PIZZA_PARTY_PROXY);

        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        console.log("");
        console.log("BEFORE:");
        console.log("  currentDailyPot:", current.currentDailyPot());
        console.log("  dailyGameId:", current.dailyGameId());
        console.log("  weeklyGameId:", current.weeklyGameId());
        console.log("  toppingToPizza:", current.toppingToPizza());

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy new implementation with adminSetCurrentDailyPot
        console.log("");
        console.log("--- Step 1: Deploy new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation:", address(newImpl));

        // Step 2: Upgrade
        console.log("");
        console.log("--- Step 2: Upgrade proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");

        // Step 3: Reset currentDailyPot to 0
        console.log("");
        console.log("--- Step 3: Reset currentDailyPot to 0 ---");
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        upgraded.adminSetCurrentDailyPot(0);

        vm.stopBroadcast();

        console.log("");
        console.log("AFTER:");
        console.log("  currentDailyPot:", upgraded.currentDailyPot());
        console.log("  dailyGameId:", upgraded.dailyGameId());
        console.log("  weeklyGameId:", upgraded.weeklyGameId());
        console.log("  toppingToPizza:", upgraded.toppingToPizza());

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! currentDailyPot fixed");
        console.log("=================================================");
    }
}
