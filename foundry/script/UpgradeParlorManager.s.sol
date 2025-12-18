// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeParlorManager
 * @dev Upgrades the PizzaParlorManager proxy to a new implementation
 *
 * Usage:
 * - Dry run: forge script script/UpgradeParlorManager.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradeParlorManager.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradeParlorManager.s.sol --fork-url $BASE_RPC --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeParlorManager is Script {
    // Existing proxy address on Base mainnet
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("UPGRADING PARLOR MANAGER");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PARLOR_MANAGER_PROXY);
        console.log("");

        // Check current state
        PizzaParlorManagerUpgradeable currentManager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);
        console.log("Current owner:", currentManager.owner());
        console.log("Total parlors:", currentManager.totalParlors());
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        console.log("--- Deploying new implementation ---");
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation address:", address(newImpl));

        // Upgrade proxy to new implementation
        console.log("");
        console.log("--- Upgrading proxy ---");
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        vm.stopBroadcast();

        // Verify upgrade
        console.log("");
        console.log("===========================================");
        console.log("UPGRADE VERIFICATION");
        console.log("===========================================");

        PizzaParlorManagerUpgradeable upgraded = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);
        console.log("Owner (should be unchanged):", upgraded.owner());
        console.log("Total parlors (should be unchanged):", upgraded.totalParlors());
        console.log("MIN_PARLOR_PRICE:", upgraded.MIN_PARLOR_PRICE());
        console.log("MAX_PARLOR_PRICE:", upgraded.MAX_PARLOR_PRICE());

        // Verify new naming functions exist
        console.log("");
        console.log("--- Parlor Naming Feature ---");
        console.log("hasParlorName(deployer):", upgraded.hasParlorName(deployer));
        console.log("parlorName(deployer):", upgraded.parlorName(deployer));

        console.log("");
        console.log("Upgrade successful! New features available:");
        console.log("- setParlorName(string): Set franchise name (one-time, max 20 chars)");
        console.log("- parlorName(address): Read franchise name");
        console.log("- hasParlorName(address): Check if name is set");
    }
}
