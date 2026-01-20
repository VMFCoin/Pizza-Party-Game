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
    address constant OLD_PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;

    function run() external {
        require(OLD_PIZZA_TOKEN != address(0), "Set OLD_PIZZA_TOKEN address first!");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // ============================================================
        // STAKER ADDRESSES (only those with balances)
        // Staker 3: 1,870.47 PIZZA (70.47 flexible + 1,800 locked)
        // Staker 4: 23.72 PIZZA (locked)
        // Staker 5: 4,602.02 PIZZA (flexible) - this is your 4.6K
        // Total: ~6,496 old PIZZA
        // ============================================================
        address[] memory stakers = new address[](3);
        stakers[0] = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765; // 1,870.47 PIZZA
        stakers[1] = 0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF; // 23.72 PIZZA
        stakers[2] = 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66; // 4,602.02 PIZZA
        // ============================================================

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
