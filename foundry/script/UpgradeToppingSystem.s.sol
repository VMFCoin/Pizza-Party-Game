// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeToppingSystem
 * @dev Upgrades the PizzaParty proxy with new topping system:
 *      - toppingUnitPizza: 1 topping = $0.10 worth of PIZZA
 *      - 7-day streak bonus: +3 toppings for playing all 7 days (10 max from daily)
 *
 * After deployment, the cron job will automatically update toppingUnitPizza
 * weekly based on current PIZZA price.
 *
 * Usage:
 * - Dry run: forge script script/UpgradeToppingSystem.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: forge script script/UpgradeToppingSystem.s.sol --rpc-url https://mainnet.base.org --broadcast
 * - Deploy + Verify: forge script script/UpgradeToppingSystem.s.sol --rpc-url https://mainnet.base.org --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeToppingSystem is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    // Initial toppingUnitPizza: $0.10 worth of PIZZA
    // At ~$0.007/PIZZA: $0.10 / $0.007 = ~14.3 PIZZA
    // Using 15 PIZZA as initial value (will be updated by cron job)
    uint256 constant INITIAL_TOPPING_UNIT_PIZZA = 15e18;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("UPGRADING PIZZA PARTY - NEW TOPPING SYSTEM");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("");
        console.log("Changes in this upgrade:");
        console.log("  - toppingUnitPizza: 1 topping = $0.10 of PIZZA");
        console.log("  - 7-day streak bonus: +3 toppings for full week");
        console.log("  - Max daily toppings: 10 (7 plays + 3 bonus)");
        console.log("");

        // Check current state
        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        console.log("--- Current State ---");
        console.log("Owner:", current.owner());
        console.log("dailyGameId:", current.dailyGameId());
        console.log("weeklyGameId:", current.weeklyGameId());
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

        // Step 3: Set initial toppingUnitPizza value
        console.log("");
        console.log("--- Step 3: Setting toppingUnitPizza ---");
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        upgraded.setToppingUnitPizza(INITIAL_TOPPING_UNIT_PIZZA);
        console.log("toppingUnitPizza set to:", upgraded.toppingUnitPizza() / 1e18, "PIZZA");

        vm.stopBroadcast();

        // Verify
        console.log("");
        console.log("=================================================");
        console.log("VERIFICATION");
        console.log("=================================================");
        console.log("Owner (unchanged):", upgraded.owner());
        console.log("dailyGameId:", upgraded.dailyGameId());
        console.log("weeklyGameId:", upgraded.weeklyGameId());
        console.log("toppingUnitPizza:", upgraded.toppingUnitPizza() / 1e18, "PIZZA");
        console.log("weeklyTreasuryBonus:", upgraded.weeklyTreasuryBonus() / 1e18, "PIZZA");
        console.log("");

        console.log("=================================================");
        console.log("SUCCESS! New topping system deployed:");
        console.log("  - 1 topping = $0.10 worth of PIZZA");
        console.log("  - 7-day streak bonus active");
        console.log("  - Cron job will auto-update toppingUnitPizza weekly");
        console.log("=================================================");
    }
}
