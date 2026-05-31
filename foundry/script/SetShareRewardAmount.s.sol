// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

interface IShareAndSpin {
    function adminSetShareRewardAmount(uint256 amount) external;
    function shareRewardAmount() external view returns (uint256);
}

/**
 * @title SetShareRewardAmount
 * @notice Update shareRewardAmount to match current PIZZA price.
 *
 * Current price: $0.00000008313 per PIZZA
 * $0.01 / $0.00000008313 = ~120,294 PIZZA
 *
 * Usage:
 *   Dry run:  forge script script/SetShareRewardAmount.s.sol --rpc-url https://mainnet.base.org
 *   Execute:  forge script script/SetShareRewardAmount.s.sol --rpc-url https://mainnet.base.org --broadcast
 */
contract SetShareRewardAmount is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;
    uint256 constant NEW_REWARD = 120_294 * 1e18;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);

        IShareAndSpin sns = IShareAndSpin(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("SET SHARE REWARD AMOUNT");
        console.log("=================================================");
        console.log("Current reward:", sns.shareRewardAmount() / 1e18, "PIZZA");
        console.log("New reward:", NEW_REWARD / 1e18, "PIZZA (~$0.01 at $0.0000002207)");

        vm.startBroadcast(deployerPrivateKey);
        sns.adminSetShareRewardAmount(NEW_REWARD);
        vm.stopBroadcast();

        console.log("Updated to:", sns.shareRewardAmount() / 1e18, "PIZZA");
        console.log("=================================================");
    }
}
