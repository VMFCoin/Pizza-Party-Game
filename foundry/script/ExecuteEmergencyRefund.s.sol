// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title ExecuteEmergencyRefund
 * @notice Executes emergency refund for specified stakers using OLD token
 * @dev Run with: forge script script/ExecuteEmergencyRefund.s.sol --rpc-url base --broadcast
 *
 * IMPORTANT: Update the STAKERS array with actual staker addresses before running!
 */
contract ExecuteEmergencyRefund is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    // OLD PIZZA token (the one stakers deposited before migration)
    // You need to fill in the correct old token address here
    address constant OLD_PIZZA_TOKEN = address(0); // TODO: Set old token address

    function run() external {
        require(OLD_PIZZA_TOKEN != address(0), "Set OLD_PIZZA_TOKEN address first!");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // ============================================================
        // ADD STAKER ADDRESSES HERE
        // ============================================================
        address[] memory stakers = new address[](1);
        stakers[0] = address(0); // TODO: Replace with actual staker address
        // Add more stakers as needed:
        // stakers[1] = 0x...;
        // stakers[2] = 0x...;
        // ============================================================

        require(stakers[0] != address(0), "Set staker addresses first!");

        vm.startBroadcast(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        console.log("=== EMERGENCY REFUND (OLD TOKEN MIGRATION) ===");
        console.log("Staking contract:", STAKING_PROXY);
        console.log("Old token address:", OLD_PIZZA_TOKEN);
        console.log("Number of stakers to refund:", stakers.length);
        console.log("");

        // Log each staker's balance before refund
        for (uint256 i = 0; i < stakers.length; i++) {
            (uint256 totalStaked,,,,,,) = staking.getStakeInfo(stakers[i]);
            console.log("Staker", i, ":", stakers[i]);
            console.log("  Total staked:", totalStaked / 1e18, "PIZZA (old token)");
        }

        console.log("");
        console.log("Executing emergency refund...");

        // Execute the refund with OLD token address
        staking.adminEmergencyRefund(OLD_PIZZA_TOKEN, stakers);

        console.log("");
        console.log("=== EMERGENCY REFUND COMPLETE ===");
        console.log("All stakers have been refunded their old PIZZA tokens");

        vm.stopBroadcast();
    }
}
