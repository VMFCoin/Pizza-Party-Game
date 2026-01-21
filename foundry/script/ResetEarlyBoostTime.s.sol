// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title ResetEarlyBoostTime
 * @notice Resets the early staker boost end time to 60 games (days) from now
 * @dev This gives new public stakers the full 60-game +30% boost window
 *
 * Run: forge script script/ResetEarlyBoostTime.s.sol:ResetEarlyBoostTime --rpc-url base --broadcast
 */
contract ResetEarlyBoostTime is Script {
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(PIZZA_STAKING_PROXY);

        // Get current boost end time
        uint256 currentBoostEndTime = staking.boostEndTime();
        console.log("Current boost end time:", currentBoostEndTime);
        console.log("Current time:", block.timestamp);

        if (currentBoostEndTime > block.timestamp) {
            uint256 daysRemaining = (currentBoostEndTime - block.timestamp) / 1 days;
            console.log("Days remaining on current boost:", daysRemaining);
        } else {
            console.log("Boost has already expired!");
        }

        // Set new boost end time to 60 games (days) from now
        uint256 newBoostEndTime = block.timestamp + 60 days;
        staking.adminSetBoostEndTime(newBoostEndTime);

        console.log("");
        console.log("=== Early Boost Reset Complete ===");
        console.log("New boost end time:", newBoostEndTime);
        console.log("Boost will now last 60 games (days) from this transaction");
        console.log("All stakers get +30% bonus until then!");

        vm.stopBroadcast();
    }
}
