// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IERC20Burnable {
    function burn(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function symbol() external view returns (string memory);
}

/**
 * @title BurnPizza
 * @notice Burns PIZZA tokens from the caller's wallet
 * @dev Run with: forge script script/BurnPizza.s.sol --rpc-url base --broadcast
 */
contract BurnPizza is Script {
    // New PIZZA token address
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;

    // Amount to burn: 54,531,516.07406870318305246 PIZZA
    // = 54531516074068703183052460 wei (with 18 decimals)
    uint256 constant BURN_AMOUNT = 54531516074068703183052460;

    function run() external {
        uint256 privateKey = vm.envUint("FARCASTER_PRIVATE_KEY");
        address wallet = vm.addr(privateKey);

        IERC20Burnable pizza = IERC20Burnable(PIZZA_TOKEN);

        console.log("");
        console.log("=== PIZZA BURN ===");
        console.log("");
        console.log("Token:", PIZZA_TOKEN);
        console.log("Wallet:", wallet);
        console.log("");

        uint256 balanceBefore = pizza.balanceOf(wallet);
        console.log("Balance before:", balanceBefore / 1e18, "PIZZA");
        console.log("Amount to burn:", BURN_AMOUNT / 1e18, "PIZZA");

        require(balanceBefore >= BURN_AMOUNT, "Insufficient balance to burn");

        vm.startBroadcast(privateKey);

        pizza.burn(BURN_AMOUNT);

        vm.stopBroadcast();

        uint256 balanceAfter = pizza.balanceOf(wallet);
        console.log("");
        console.log("Balance after:", balanceAfter / 1e18, "PIZZA");
        console.log("Burned:", (balanceBefore - balanceAfter) / 1e18, "PIZZA");
        console.log("");
        console.log("=== BURN COMPLETE ===");
        console.log("Transaction visible on Basescan!");
    }
}
