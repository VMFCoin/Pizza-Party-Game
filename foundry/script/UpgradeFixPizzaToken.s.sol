// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeFixPizzaToken
 * @dev Emergency fix for corrupted pizzaToken storage slot
 *      The pizzaToken address was corrupted to a number instead of an address
 *      This script upgrades and resets the pizzaToken to correct address
 *
 * Usage:
 * - Dry run: forge script script/UpgradeFixPizzaToken.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: forge script script/UpgradeFixPizzaToken.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeFixPizzaToken is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("FIX CORRUPTED pizzaToken ADDRESS");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy:", PIZZA_PARTY_PROXY);
        console.log("Correct PIZZA Token:", PIZZA_TOKEN);

        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        console.log("");
        console.log("BEFORE:");
        console.log("  pizzaToken:", address(current.pizzaToken()));
        console.log("  dailyGameId:", current.dailyGameId());
        console.log("  weeklyGameId:", current.weeklyGameId());
        console.log("  currentDailyPot:", current.currentDailyPot());

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy new implementation with adminSetPizzaToken
        console.log("");
        console.log("--- Step 1: Deploy new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation:", address(newImpl));

        // Step 2: Upgrade
        console.log("");
        console.log("--- Step 2: Upgrade proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");

        // Step 3: Reset pizzaToken to correct address
        console.log("");
        console.log("--- Step 3: Reset pizzaToken to correct address ---");
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        upgraded.adminSetPizzaToken(PIZZA_TOKEN);

        vm.stopBroadcast();

        console.log("");
        console.log("AFTER:");
        console.log("  pizzaToken:", address(upgraded.pizzaToken()));
        console.log("  dailyGameId:", upgraded.dailyGameId());
        console.log("  weeklyGameId:", upgraded.weeklyGameId());
        console.log("  currentDailyPot:", upgraded.currentDailyPot());

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! pizzaToken fixed - players can now enter");
        console.log("=================================================");
    }
}
