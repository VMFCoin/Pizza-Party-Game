// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeToppingToPizza
 * @dev Upgrades the PizzaParty proxy to make toppingToPizza configurable:
 *      - Changed from constant 100 PIZZA to state variable
 *      - Added setToppingToPizza() owner function
 *      - Sets initial value to 10 PIZZA per topping
 *
 * Usage:
 * - Dry run: forge script script/UpgradeToppingToPizza.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: forge script script/UpgradeToppingToPizza.s.sol --rpc-url https://mainnet.base.org --broadcast
 * - Deploy + Verify: forge script script/UpgradeToppingToPizza.s.sol --rpc-url https://mainnet.base.org --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeToppingToPizza is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    // New topping to pizza value: 10 PIZZA per topping (was 100)
    uint256 constant NEW_TOPPING_TO_PIZZA = 10e18;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("UPGRADING PIZZA PARTY - TOPPING TO PIZZA UPDATE");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("New toppingToPizza value:", NEW_TOPPING_TO_PIZZA);
        console.log("");

        // Check current state
        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        console.log("Current owner:", current.owner());
        console.log("Current dailyGameId:", current.dailyGameId());
        console.log("Current weeklyGameId:", current.weeklyGameId());
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy new implementation
        console.log("--- Step 1: Deploying new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation address:", address(newImpl));

        // Step 2: Upgrade proxy to new implementation
        console.log("");
        console.log("--- Step 2: Upgrading proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // Step 3: Set the new toppingToPizza value
        console.log("");
        console.log("--- Step 3: Setting toppingToPizza to 10 PIZZA ---");
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        upgraded.setToppingToPizza(NEW_TOPPING_TO_PIZZA);
        console.log("toppingToPizza set to:", upgraded.toppingToPizza());

        vm.stopBroadcast();

        // Verify the upgrade
        console.log("");
        console.log("=================================================");
        console.log("VERIFICATION");
        console.log("=================================================");
        console.log("Owner (should be unchanged):", upgraded.owner());
        console.log("dailyGameId:", upgraded.dailyGameId());
        console.log("weeklyGameId:", upgraded.weeklyGameId());
        console.log("toppingToPizza:", upgraded.toppingToPizza());

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! Weekly jackpot now uses 10 PIZZA per topping");
        console.log("=================================================");
    }
}
