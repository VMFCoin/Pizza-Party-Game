// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";

/**
 * @title UpgradeShareAndSpin
 * @notice Upgrades ShareAndSpin with:
 *         - recordShare(uint256 claimedReward) — frontend passes price-checked amount
 *         - Contract validates claimedReward <= 2x oracle-set shareRewardAmount
 *         - Sets correct shareRewardAmount based on current PIZZA price
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeShareAndSpin.s.sol --rpc-url https://mainnet.base.org
 *   Execute:  forge script script/UpgradeShareAndSpin.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeShareAndSpin is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;

    // Current price: $0.000004857 per PIZZA
    // $0.01 / $0.000004857 = ~2,059 PIZZA
    uint256 constant CORRECT_REWARD = 2_059 * 1e18;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        ShareAndSpinUpgradeable proxy = ShareAndSpinUpgradeable(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("UPGRADE SHARE & SPIN - PRICE VALIDATION");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("");
        console.log("BEFORE UPGRADE:");
        console.log("  owner:", proxy.owner());
        console.log("  shareRewardAmount:", proxy.shareRewardAmount() / 1e18, "PIZZA");
        console.log("  treasuryWallet:", proxy.treasuryWallet());

        vm.startBroadcast(deployerPrivateKey);

        ShareAndSpinUpgradeable newImpl = new ShareAndSpinUpgradeable();
        console.log("");
        console.log("New implementation:", address(newImpl));

        proxy.upgradeToAndCall(address(newImpl), "");

        // Set correct reward amount (~$0.01 at current price)
        proxy.adminSetShareRewardAmount(CORRECT_REWARD);

        vm.stopBroadcast();

        console.log("");
        console.log("AFTER UPGRADE:");
        console.log("  shareRewardAmount:", proxy.shareRewardAmount() / 1e18, "PIZZA (~$0.01)");
        console.log("  owner:", proxy.owner());
        console.log("  treasuryWallet:", proxy.treasuryWallet());
        console.log("");
        console.log("=================================================");
        console.log("UPGRADE COMPLETE!");
        console.log("=================================================");
        console.log("");
        console.log("recordShare(uint256 claimedReward) now live.");
        console.log("Frontend calculates: floor(0.01 / pizzaUsdPrice * 1e18)");
        console.log("Contract validates: claimedReward <= 2x oracle amount");
    }
}
