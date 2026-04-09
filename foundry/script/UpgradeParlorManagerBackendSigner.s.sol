// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";

/**
 * @title UpgradeParlorManagerBackendSigner
 * @notice Migrates ParlorManager claimSlice + redeemSlice to backend signer pattern.
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeParlorManagerBackendSigner.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeParlorManagerBackendSigner.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeParlorManagerBackendSigner is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;
    address constant BACKEND_SIGNER = 0x528952ae107198011C2a1df8c05A82702D5778D6;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaParlorManagerUpgradeable proxy = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        console.log("=================================================");
        console.log("UPGRADE PARLOR MANAGER - BACKEND SIGNER");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Current owner:", proxy.owner());
        console.log("Backend signer:", BACKEND_SIGNER);

        vm.startBroadcast(deployerPrivateKey);

        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        proxy.adminSetBackendSigner(BACKEND_SIGNER);

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("Backend signer set to:", proxy.backendSigner());
        console.log("claimSlice + redeemSlice now require backend signer");
    }
}
