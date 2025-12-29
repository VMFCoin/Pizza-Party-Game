// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeParlorManagerFixFees
 * @dev Fixes corrupted claimableBalance storage and redistributes fees
 *
 * Problem: claimableBalance mapping was corrupted during a previous upgrade,
 *          storing address values as uint256 instead of actual fee amounts.
 *
 * Solution:
 * 1. Upgrade to new implementation with resetClaimableBalance() function
 * 2. Reset all corrupted balances to 0
 * 3. Call allocateFees() to properly distribute the 202+ PIZZA in the contract
 *
 * Usage:
 * forge script script/UpgradeParlorManagerFixFees.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeParlorManagerFixFees is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("FIXING PARLOR MANAGER CLAIMABLE BALANCES");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Proxy:", PARLOR_MANAGER_PROXY);

        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        // Show corrupted state
        console.log("");
        console.log("=== BEFORE FIX ===");
        console.log("Total parlors:", manager.totalParlors());

        // Check a few owners
        address owner0 = manager.parlorOwners(0);
        address owner2 = manager.parlorOwners(2);
        console.log("Owner 0:", owner0);
        console.log("  Corrupted claimable:", manager.claimableBalance(owner0));
        console.log("Owner 2:", owner2);
        console.log("  Corrupted claimable:", manager.claimableBalance(owner2));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with fix
        console.log("");
        console.log("--- Deploying new implementation ---");
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation:", address(newImpl));

        // Upgrade
        console.log("");
        console.log("--- Upgrading proxy ---");
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // Reset corrupted balances
        console.log("");
        console.log("--- Resetting corrupted balances ---");
        manager.resetClaimableBalance(owner0);
        console.log("Reset owner 0");
        manager.resetClaimableBalance(owner2);
        console.log("Reset owner 2");

        // Now allocate fees properly
        console.log("");
        console.log("--- Allocating fees ---");
        manager.allocateFees();
        console.log("Fees allocated!");

        vm.stopBroadcast();

        // Verify
        console.log("");
        console.log("=== AFTER FIX ===");
        console.log("Owner 0 claimable:", manager.claimableBalance(owner0));
        console.log("Owner 2 claimable:", manager.claimableBalance(owner2));

        console.log("");
        console.log("Fix complete! Parlor owners can now claim their fees.");
    }
}
