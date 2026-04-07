// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";

/**
 * @title UpgradeShareAndSpinSecurity
 * @notice Post-exploit hardening:
 *         - EOA check on recordShareSpin, claimFreeSlice, saveFreeSlice, claimPendingSlice, giftFreeSlice
 *         - On-chain hasFreeSlice eligibility (spin must award before claim)
 *         - maxEntryFee cap on all treasury-funded entries
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeShareAndSpinSecurity.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeShareAndSpinSecurity.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeShareAndSpinSecurity is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        ShareAndSpinUpgradeable proxy = ShareAndSpinUpgradeable(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("UPGRADE SHARE & SPIN - SECURITY HARDENING");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Current owner:", proxy.owner());
        console.log("Paused:", proxy.paused());

        vm.startBroadcast(deployerPrivateKey);

        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("New security features:");
        console.log("  - EOA check on all spin/claim functions");
        console.log("  - hasFreeSlice on-chain eligibility tracking");
        console.log("  - maxEntryFee cap (must be set before unpause)");
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. adminSetMaxEntryFee(amount) - set fee cap");
        console.log("  2. Re-approve treasury with capped allowance");
        console.log("  3. unpause()");
    }
}
