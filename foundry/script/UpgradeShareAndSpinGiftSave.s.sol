// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";

/**
 * @title UpgradeShareAndSpinGiftSave
 * @notice Adds gift/save free slice functionality:
 *         - saveFreeSlice() — saves pending slice for tomorrow
 *         - claimPendingSlice(entryFee) — claims saved slice
 *         - giftFreeSlice(recipient, entryFee) — sends slice to friend
 *         - pendingFreeSlice(player) — view if player has pending slice
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeShareAndSpinGiftSave.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeShareAndSpinGiftSave.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeShareAndSpinGiftSave is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        ShareAndSpinUpgradeable proxy = ShareAndSpinUpgradeable(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("UPGRADE SHARE & SPIN - GIFT & SAVE");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("shareRewardAmount:", proxy.shareRewardAmount() / 1e18, "PIZZA");
        console.log("Current owner:", proxy.owner());

        vm.startBroadcast(deployerPrivateKey);

        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("New functions available:");
        console.log("  saveFreeSlice()");
        console.log("  claimPendingSlice(entryFee)");
        console.log("  giftFreeSlice(recipient, entryFee)");
        console.log("  pendingFreeSlice(player) view");
    }
}
