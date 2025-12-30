// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeParlorManagerNoOwnerSlices
 * @dev Adds restriction: parlor owners cannot send/receive free slices to/from each other
 *
 * This prevents gaming the system where parlor owners give each other free entries
 * without having to pay to play.
 *
 * Changes:
 * - sendSlice() now reverts with RecipientIsParlorOwner if recipient owns parlors
 * - tipSlice() now reverts with RecipientIsParlorOwner if recipient owns parlors
 * - redeemSlice() now reverts with RecipientIsParlorOwner if msg.sender owns parlors
 * - claimSlice() now reverts with RecipientIsParlorOwner if msg.sender owns parlors
 *
 * Usage:
 * PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeParlorManagerNoOwnerSlices.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeParlorManagerNoOwnerSlices is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("==============================================");
        console.log("UPGRADING PARLOR MANAGER: NO OWNER SLICES");
        console.log("==============================================");
        console.log("Deployer:", deployer);
        console.log("Proxy:", PARLOR_MANAGER_PROXY);

        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        console.log("");
        console.log("=== CURRENT STATE ===");
        console.log("Total parlors:", manager.totalParlors());
        console.log("Total parlor owners:", manager.parlorOwnersCount());

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        console.log("");
        console.log("--- Deploying new implementation ---");
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation:", address(newImpl));

        // Upgrade proxy
        console.log("");
        console.log("--- Upgrading proxy ---");
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        vm.stopBroadcast();

        console.log("");
        console.log("=== UPGRADE SUCCESSFUL ===");
        console.log("Parlor owners can no longer send/receive free slices to/from each other.");
        console.log("");
        console.log("New restrictions:");
        console.log("- sendSlice() reverts if recipient is a parlor owner");
        console.log("- tipSlice() reverts if recipient is a parlor owner");
        console.log("- redeemSlice() reverts if caller is a parlor owner");
        console.log("- claimSlice() reverts if caller is a parlor owner");
    }
}
