// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";

/**
 * @title UpgradeParlorManagerSecurity
 * @notice Post-exploit hardening:
 *         - EOA check on claimSlice and redeemSlice
 *         - maxSliceEntryFee cap on treasury-funded entries
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeParlorManagerSecurity.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeParlorManagerSecurity.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeParlorManagerSecurity is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaParlorManagerUpgradeable proxy = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        console.log("=================================================");
        console.log("UPGRADE PARLOR MANAGER - SECURITY HARDENING");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Current owner:", proxy.owner());

        vm.startBroadcast(deployerPrivateKey);

        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("New security features:");
        console.log("  - EOA check on claimSlice and redeemSlice");
        console.log("  - maxSliceEntryFee cap (must be set via adminSetMaxSliceEntryFee)");
    }
}
