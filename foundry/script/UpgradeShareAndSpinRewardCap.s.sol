// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";

/**
 * @title UpgradeShareAndSpinRewardCap
 * @notice Widens the recordShare reward validation cap from 2x to 5x the
 *         oracle-set shareRewardAmount. This gives much more headroom for
 *         PIZZA price swings between manual oracle updates so a stale
 *         shareRewardAmount does not break the share flow.
 *
 *         No storage changes. Logic-only upgrade.
 *
 *         Worst-case overpay if oracle is stale: 5x ~$0.01 = ~$0.05 per share.
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeShareAndSpinRewardCap.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeShareAndSpinRewardCap.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeShareAndSpinRewardCap is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        ShareAndSpinUpgradeable proxy = ShareAndSpinUpgradeable(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("UPGRADE SHARE & SPIN - WIDEN REWARD CAP 2x -> 5x");
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
        console.log("recordShare now accepts claimedReward up to 5x shareRewardAmount");
        console.log("(was 2x, broke during price drops between manual oracle updates)");
    }
}
