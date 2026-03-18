// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StickerRegistryUpgradeable} from "../src/StickerRegistryUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployStickerRegistry
 * @dev Deploys StickerRegistryUpgradeable as UUPS proxy
 *
 * Usage:
 * - Dry run: forge script script/DeployStickerRegistry.s.sol --rpc-url $BASE_RPC
 * - Deploy: forge script script/DeployStickerRegistry.s.sol --rpc-url $BASE_RPC --broadcast --verify
 */
contract DeployStickerRegistry is Script {
    address constant OWNER_WALLET = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("DEPLOYING STICKER REGISTRY CONTRACT");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Owner:", OWNER_WALLET);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy implementation
        StickerRegistryUpgradeable impl = new StickerRegistryUpgradeable();
        console.log("Implementation:", address(impl));

        // Encode initializer
        bytes memory initData = abi.encodeWithSelector(
            StickerRegistryUpgradeable.initialize.selector,
            OWNER_WALLET
        );

        // Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        console.log("Proxy:", address(proxy));

        vm.stopBroadcast();

        // Verify
        StickerRegistryUpgradeable registry = StickerRegistryUpgradeable(address(proxy));
        console.log("");
        console.log("===========================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("===========================================");
        console.log("  Proxy:", address(proxy));
        console.log("  Owner:", registry.owner());
        console.log("  Total Finds:", registry.totalFinds());
        console.log("");
        console.log("UPDATE FRONTEND:");
        console.log("  Add STICKER_REGISTRY_ADDRESS='%s' to .env", address(proxy));
    }
}
