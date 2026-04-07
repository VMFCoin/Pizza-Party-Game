// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

interface IShareAndSpin {
    function adminSetShareRewardAmount(uint256 amount) external;
    function adminSetMaxEntryFee(uint256 amount) external;
    function unpause() external;
    function shareRewardAmount() external view returns (uint256);
    function maxEntryFee() external view returns (uint256);
    function paused() external view returns (bool);
}

/**
 * @title UnpauseShareAndSpin
 * @notice Sets shareRewardAmount + maxEntryFee then unpauses.
 *         Update SHARE_REWARD_AMOUNT and MAX_ENTRY_FEE before running.
 *
 * Usage:
 *   Dry run:  forge script script/UnpauseShareAndSpin.s.sol --rpc-url https://mainnet.base.org
 *   Execute:  forge script script/UnpauseShareAndSpin.s.sol --rpc-url https://mainnet.base.org --broadcast
 */
contract UnpauseShareAndSpin is Script {
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;

    // ~$0.01 of PIZZA at $0.0620/PIZZA = 0.01 / 0.0620 = ~161 PIZZA
    uint256 constant SHARE_REWARD_AMOUNT = 161 ether;


    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerKey = vm.parseUint(keyStr);

        IShareAndSpin proxy = IShareAndSpin(SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("UNPAUSE SHARE & SPIN");
        console.log("=================================================");
        console.log("Currently paused:", proxy.paused());
        console.log("Current shareRewardAmount:", proxy.shareRewardAmount() / 1e18, "PIZZA");
        console.log("Setting shareRewardAmount to:", SHARE_REWARD_AMOUNT / 1e18, "PIZZA");

        vm.startBroadcast(deployerKey);

        proxy.adminSetShareRewardAmount(SHARE_REWARD_AMOUNT);
        proxy.unpause();

        vm.stopBroadcast();

        console.log("shareRewardAmount:", proxy.shareRewardAmount() / 1e18, "PIZZA");
        console.log("maxEntryFee:", proxy.maxEntryFee() / 1e18, "PIZZA");
        console.log("Paused:", proxy.paused());
        console.log("=================================================");
        console.log("SHARE & SPIN IS LIVE!");
        console.log("=================================================");
    }
}
