// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeParlorManagerAdminSlice
 * @dev Adds adminSendSlice function for admin to send slices on behalf of sponsors
 */
contract UpgradeParlorManagerAdminSlice is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Upgrading ParlorManager at:", PARLOR_MANAGER_PROXY);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation:", address(newImpl));

        // Upgrade proxy
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("SUCCESS! ParlorManager upgraded with adminSendSlice");
    }
}
