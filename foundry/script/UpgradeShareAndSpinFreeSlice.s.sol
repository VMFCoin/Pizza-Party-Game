// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";

/**
 * @title UpgradeShareAndSpinFreeSlice
 * @notice Adds claimFreeSlice(entryFee) to ShareAndSpin.
 *         When player wins Free Slice on the wheel, this calls
 *         PizzaParty.enterDailyFromShareAndSpin() to enter them
 *         with $1 of PIZZA from treasury.
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeShareAndSpinFreeSlice.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeShareAndSpinFreeSlice.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeShareAndSpinFreeSlice is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        ShareAndSpinUpgradeable proxy = ShareAndSpinUpgradeable(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("UPGRADE SHARE & SPIN - FREE SLICE");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("shareRewardAmount:", proxy.shareRewardAmount() / 1e18, "PIZZA");

        vm.startBroadcast(deployerPrivateKey);

        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("claimFreeSlice(entryFee) now available");
    }
}
