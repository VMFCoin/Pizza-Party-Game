// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeParlorManagerTransfer
 * @dev Upgrades ParlorManager to add adminTransferParlor, then transfers a parlor
 *
 * Usage:
 * - Dry run: forge script script/UpgradeParlorManagerTransfer.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradeParlorManagerTransfer.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradeParlorManagerTransfer.s.sol --fork-url $BASE_RPC --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeParlorManagerTransfer is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    // Transfer: from Base Wallet to Farcaster Wallet
    address constant FROM = 0xf987f7b9F87B918fd1D6E3Ab8cE7834ac50A8D3f;
    address constant TO   = 0x9246550Ed36AC2c01afAa216d2a807bb8b1780bc;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        console.log("===========================================");
        console.log("UPGRADE + TRANSFER PARLOR");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("From:", FROM);
        console.log("To:", TO);
        console.log("");

        // Pre-upgrade state
        console.log("--- Pre-Upgrade State ---");
        console.log("From parlor count:", manager.parlorCount(FROM));
        console.log("From parlor name:", manager.parlorName(FROM));
        console.log("From claimable:", manager.claimableBalance(FROM));
        console.log("To parlor count:", manager.parlorCount(TO));
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new implementation
        console.log("--- Deploying new implementation ---");
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation:", address(newImpl));

        // 2. Upgrade proxy
        console.log("--- Upgrading proxy ---");
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // 3. Transfer parlor
        console.log("");
        console.log("--- Transferring parlor ---");
        manager.adminTransferParlor(FROM, TO);
        console.log("Transfer complete!");

        vm.stopBroadcast();

        // Verify
        console.log("");
        console.log("===========================================");
        console.log("VERIFICATION");
        console.log("===========================================");
        console.log("From parlor count (should be 0):", manager.parlorCount(FROM));
        console.log("From isParlorOwner (should be false):", manager.isParlorOwner(FROM));
        console.log("To parlor count:", manager.parlorCount(TO));
        console.log("To isParlorOwner (should be true):", manager.isParlorOwner(TO));
        console.log("To parlor name:", manager.parlorName(TO));
        console.log("To claimable:", manager.claimableBalance(TO));
    }
}
