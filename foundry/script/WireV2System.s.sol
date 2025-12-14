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

        console.log("===========================================");
        console.log("WIRING V2 SYSTEM");
        console.log("===========================================");
        console.log("PizzaParty Proxy:", pizzaPartyProxy);
        console.log("ParlorManager Proxy:", parlorManagerProxy);
        console.log("Current PizzaParty Owner:", party.owner());
        console.log("Current ParlorManager:", party.parlorManager());
        console.log("Current OwnerFeeRecipient:", party.ownerFeeRecipient());
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Set ParlorManager on PizzaParty (enables slice redemption)
        console.log("Step 1: Setting ParlorManager on PizzaParty...");
        if (party.parlorManager() != parlorManagerProxy) {
            party.setParlorManager(parlorManagerProxy);
            console.log("  ParlorManager set to:", party.parlorManager());
        } else {
            console.log("  Already set correctly");
        }

        // Step 2: Set OwnerFeeRecipient to ParlorManager
        // This routes 3% owner fees to ParlorManager for franchise distribution
        // NOTE: Do NOT transfer ownership - OWNER_WALLET keeps admin control
        console.log("");
        console.log("Step 2: Setting OwnerFeeRecipient to ParlorManager...");
        if (party.ownerFeeRecipient() != parlorManagerProxy) {
            party.setOwnerFeeRecipient(parlorManagerProxy);
            console.log("  OwnerFeeRecipient set to:", party.ownerFeeRecipient());
            console.log("  (3% owner fees will now flow to ParlorManager)");
        } else {
            console.log("  Already set correctly");
        }

        vm.stopBroadcast();

        // Verify final state
        console.log("");
        console.log("===========================================");
        console.log("WIRING COMPLETE - FINAL STATE:");
        console.log("===========================================");
        console.log("PizzaParty Owner:", party.owner());
        console.log("PizzaParty ParlorManager:", party.parlorManager());
        console.log("PizzaParty OwnerFeeRecipient:", party.ownerFeeRecipient());
        console.log("");
        console.log("REMAINING MANUAL STEP:");
        console.log("Treasury wallet must approve PizzaParty for weekly jackpot:");
        console.log("  From treasury, call: PIZZA.approve(%s, type(uint256).max)", pizzaPartyProxy);
    }
}
