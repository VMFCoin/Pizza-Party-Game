// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UnpauseStaking
 * @notice Unpauses the staking contract
 * @dev Run with: forge script script/UnpauseStaking.s.sol --rpc-url base --broadcast
 */
contract UnpauseStaking is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        // Check if paused
        bool isPaused = staking.paused();
        console.log("Staking contract:", STAKING_PROXY);
        console.log("Currently paused:", isPaused);

        if (isPaused) {
            console.log("Unpausing staking contract...");
            staking.adminUnpause();
            console.log("Staking contract unpaused successfully!");
        } else {
            console.log("Contract is already unpaused, no action needed.");
        }

        vm.stopBroadcast();
    }
}
