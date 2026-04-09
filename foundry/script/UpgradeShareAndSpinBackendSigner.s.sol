// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";

/**
 * @title UpgradeShareAndSpinBackendSigner
 * @notice Migrates ShareAndSpin to backend signer pattern:
 *         - All reward functions now require msg.sender == backendSigner
 *         - Functions accept address player parameter instead of using msg.sender
 *         - Sets backend signer to dedicated EOA
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeShareAndSpinBackendSigner.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeShareAndSpinBackendSigner.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeShareAndSpinBackendSigner is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;
    address constant BACKEND_SIGNER = 0x528952ae107198011C2a1df8c05A82702D5778D6;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        ShareAndSpinUpgradeable proxy = ShareAndSpinUpgradeable(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("UPGRADE SHARE & SPIN - BACKEND SIGNER");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Current owner:", proxy.owner());
        console.log("Backend signer:", BACKEND_SIGNER);

        vm.startBroadcast(deployerPrivateKey);

        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        proxy.adminSetBackendSigner(BACKEND_SIGNER);

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("Backend signer set to:", proxy.backendSigner());
        console.log("All reward functions now require backend signer");
    }
}
