// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";

/**
 * @title AdminSetParlorName
 * @dev Admin script to set a parlor owner's franchise name
 *
 * Usage:
 * forge script script/AdminSetParlorName.s.sol --fork-url $BASE_RPC --broadcast
 */
contract AdminSetParlorName is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Admin address:", deployer);

        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        // Target wallet and name
        address owner = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765;
        string memory name = unicode"🍕PIZZA-SHIP🚀";

        console.log("Setting parlor name for:", owner);
        console.log("Name:", name);
        console.log("Name bytes length:", bytes(name).length);
        console.log("Current parlor count:", manager.parlorCount(owner));
        console.log("Current name:", manager.parlorName(owner));

        vm.startBroadcast(deployerPrivateKey);

        manager.adminSetParlorName(owner, name);

        vm.stopBroadcast();

        console.log("Done! New name:", manager.parlorName(owner));
    }
}
