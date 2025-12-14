// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";

/**
 * @title WireV2System
 * @dev Wires the V2 system after deployment
 *
 * Run AFTER DeployV2System.s.sol to connect the contracts.
 *
 * IMPORTANT: This script does NOT broadcast by default.
 * - Dry run: forge script script/WireV2System.s.sol --fork-url $BASE_RPC
 * - Execute: forge script script/WireV2System.s.sol --fork-url $BASE_RPC --broadcast
 *
 * Requires: PIZZA_PARTY_PROXY and PARLOR_MANAGER_PROXY env vars
 */
contract WireV2System is Script {
    function run() external {
        // Load environment
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);

        address pizzaPartyProxy = vm.envAddress("PIZZA_PARTY_PROXY");
        address parlorManagerProxy = vm.envAddress("PARLOR_MANAGER_PROXY");

        PizzaPartyV2Upgradeable party = PizzaPartyV2Upgradeable(pizzaPartyProxy);
        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(parlorManagerProxy);

        console.log("===========================================");
        console.log("WIRING V2 SYSTEM");
        console.log("===========================================");
        console.log("PizzaParty Proxy:", pizzaPartyProxy);
        console.log("ParlorManager Proxy:", parlorManagerProxy);
        console.log("Current PizzaParty Owner:", party.owner());
        console.log("Current ParlorManager:", party.parlorManager());
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Set ParlorManager on PizzaParty
        console.log("Step 1: Setting ParlorManager on PizzaParty...");
        if (party.parlorManager() != parlorManagerProxy) {
            party.setParlorManager(parlorManagerProxy);
            console.log("  ParlorManager set to:", party.parlorManager());
        } else {
            console.log("  Already set correctly");
        }

        // Step 2: Transfer PizzaParty ownership to ParlorManager
        // This routes owner fees (3%) to ParlorManager for franchise distribution
        console.log("");
        console.log("Step 2: Transferring PizzaParty ownership to ParlorManager...");
        if (party.owner() != parlorManagerProxy) {
            party.transferOwnership(parlorManagerProxy);
            console.log("  Ownership transferred to:", parlorManagerProxy);
            console.log("  (Owner fees will now flow to ParlorManager)");
        } else {
            console.log("  Already owned by ParlorManager");
        }

        vm.stopBroadcast();

        // Verify final state
        console.log("");
        console.log("===========================================");
        console.log("WIRING COMPLETE - FINAL STATE:");
        console.log("===========================================");
        console.log("PizzaParty Owner:", party.owner());
        console.log("PizzaParty ParlorManager:", party.parlorManager());
        console.log("");
        console.log("REMAINING MANUAL STEP:");
        console.log("Treasury wallet must approve PizzaParty for weekly jackpot:");
        console.log("  From treasury, call: PIZZA.approve(%s, type(uint256).max)", pizzaPartyProxy);
    }
}
