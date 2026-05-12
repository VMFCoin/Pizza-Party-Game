// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";

/**
 * @title UpgradeShareAndSpinExpiry
 * @notice Adds 48-hour expiration to free slices.
 *         A slice earned on game N is valid only for games N and N+1.
 *         New storage: freeSliceGameId at slot 14 (append-only, safe).
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeShareAndSpinExpiry.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeShareAndSpinExpiry.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeShareAndSpinExpiry is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        ShareAndSpinUpgradeable proxy = ShareAndSpinUpgradeable(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("UPGRADE SHARE & SPIN - 48HR FREE SLICE EXPIRY");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Current owner:", proxy.owner());
        console.log("shareRewardAmount:", proxy.shareRewardAmount() / 1e18, "PIZZA");

        vm.startBroadcast(deployerPrivateKey);

        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("New behavior:");
        console.log("  - Free slice valid for current + next daily game only");
        console.log("  - claimFreeSlice / saveFreeSlice / claimPendingSlice / giftFreeSlice all enforce expiry");
        console.log("  - New view: freeSliceGameId(player)");
    }
}
