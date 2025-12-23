// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeHoldingsAndToppingRate
 * @dev Upgrades the PizzaParty proxy with new economic constants:
 *      - HOLDINGS_TOPPINGS: 3 -> 1 (1 topping per $10 of PIZZA held)
 *      - HOLDINGS_MAX_TOPPINGS: 30 -> 5 (max at $50 instead of $100)
 *      - toppingToPizza already set to 1e18 via setToppingToPizza() call
 *
 * These changes reduce weekly jackpot inflation by:
 *   - Reducing holdings bonus from 3 toppings/$10 (30 max) to 1 topping/$10 (5 max)
 *   - Reducing topping value from 10 PIZZA to 1 PIZZA per topping
 *
 * Usage:
 * - Dry run: forge script script/UpgradeHoldingsAndToppingRate.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: forge script script/UpgradeHoldingsAndToppingRate.s.sol --rpc-url https://mainnet.base.org --broadcast
 * - Deploy + Verify: forge script script/UpgradeHoldingsAndToppingRate.s.sol --rpc-url https://mainnet.base.org --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeHoldingsAndToppingRate is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================================");
        console.log("UPGRADING PIZZA PARTY - HOLDINGS BONUS & TOPPING RATE UPDATE");
        console.log("=================================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("");
        console.log("Changes in this upgrade:");
        console.log("  - HOLDINGS_TOPPINGS: 3 -> 1 (1 topping per $10 of PIZZA)");
        console.log("  - HOLDINGS_MAX_TOPPINGS: 30 -> 5 (max at $50 worth)");
        console.log("  - toppingToPizza: already set to 1e18 (1 PIZZA per topping)");
        console.log("");

        // Check current state
        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        console.log("--- Current State ---");
        console.log("Owner:", current.owner());
        console.log("dailyGameId:", current.dailyGameId());
        console.log("weeklyGameId:", current.weeklyGameId());
        console.log("toppingToPizza:", current.toppingToPizza());
        console.log("HOLDINGS_TOPPINGS (old constant):", current.HOLDINGS_TOPPINGS());
        console.log("HOLDINGS_MAX_TOPPINGS (old constant):", current.HOLDINGS_MAX_TOPPINGS());
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with updated constants
        console.log("--- Deploying new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation address:", address(newImpl));

        // Upgrade proxy to new implementation
        console.log("");
        console.log("--- Upgrading proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        vm.stopBroadcast();

        // Verify the upgrade
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        console.log("");
        console.log("=================================================================");
        console.log("VERIFICATION");
        console.log("=================================================================");
        console.log("Owner (unchanged):", upgraded.owner());
        console.log("dailyGameId:", upgraded.dailyGameId());
        console.log("weeklyGameId:", upgraded.weeklyGameId());
        console.log("");
        console.log("--- New Constants ---");
        console.log("HOLDINGS_TOPPINGS:", upgraded.HOLDINGS_TOPPINGS());
        console.log("HOLDINGS_MAX_TOPPINGS:", upgraded.HOLDINGS_MAX_TOPPINGS());
        console.log("toppingToPizza:", upgraded.toppingToPizza());
        console.log("");

        // Verify expected values
        require(upgraded.HOLDINGS_TOPPINGS() == 1, "HOLDINGS_TOPPINGS should be 1");
        require(upgraded.HOLDINGS_MAX_TOPPINGS() == 5, "HOLDINGS_MAX_TOPPINGS should be 5");
        require(upgraded.toppingToPizza() == 1e18, "toppingToPizza should be 1e18");

        console.log("=================================================================");
        console.log("SUCCESS! Weekly jackpot inflation reduced:");
        console.log("  - Holdings bonus: 1 topping per $10 (max 5 toppings)");
        console.log("  - Topping value: 1 PIZZA per topping");
        console.log("=================================================================");
    }
}
