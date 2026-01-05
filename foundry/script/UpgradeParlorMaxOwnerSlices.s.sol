// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeParlorMaxOwnerSlices
 * @dev Upgrades PizzaParlorManager to give 5-parlor owners 7 slices per week:
 *      - Owners with 1-4 parlors: 1 slice per parlor per week (unchanged)
 *      - Owners with 5 parlors: 7 slices per week (1 per day bonus!)
 *
 * Usage:
 * - Dry run: forge script script/UpgradeParlorMaxOwnerSlices.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradeParlorMaxOwnerSlices.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradeParlorMaxOwnerSlices.s.sol --fork-url $BASE_RPC --broadcast --verify
 */
contract UpgradeParlorMaxOwnerSlices is Script {
    // Existing proxy address on Base mainnet
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("UPGRADING PARLOR MANAGER - MAX OWNER SLICE BONUS");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PARLOR_MANAGER_PROXY);
        console.log("");

        // Check current state
        PizzaParlorManagerUpgradeable currentManager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);
        console.log("Current owner:", currentManager.owner());
        console.log("Total parlors sold:", currentManager.totalParlors());
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
        console.log("");
        console.log("NEW SLICE CONSTANTS:");
        console.log("  WEEKLY_SLICES_PER_PARLOR:", upgraded.WEEKLY_SLICES_PER_PARLOR());
        console.log("  MAX_SLICES_PER_DAY:", upgraded.MAX_SLICES_PER_DAY());
        console.log("  MAX_OWNER_WEEKLY_SLICES:", upgraded.MAX_OWNER_WEEKLY_SLICES());
        console.log("");
        console.log("NEW VIEW FUNCTIONS:");
        console.log("  weeklySliceAllowance(deployer):", upgraded.weeklySliceAllowance(deployer));
        console.log("  slicesRemainingThisWeek(deployer):", upgraded.slicesRemainingThisWeek(deployer));

        console.log("");
        console.log("Upgrade successful!");
        console.log("New slice limits:");
        console.log("  - 1-4 parlors: 1 slice per parlor per week");
        console.log("  - 5 parlors: 7 slices per week (1 per day bonus!)");
    }
}
