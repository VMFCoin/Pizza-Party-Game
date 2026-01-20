// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ApproveStakingRewardsWallet
 * @notice Approves the staking contract to spend PIZZA from the staking rewards wallet
 * @dev Run with: forge script script/ApproveStakingRewardsWallet.s.sol --rpc-url base --broadcast
 *
 * IMPORTANT: This must be run from the staking rewards wallet address!
 */
contract ApproveStakingRewardsWallet is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    // NEW PIZZA token address
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;

    // Staking rewards wallet
    address constant STAKING_REWARDS_WALLET = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Verify the private key corresponds to the staking rewards wallet
        address signer = vm.addr(deployerPrivateKey);
        console.log("Signer address:", signer);
        console.log("Expected staking rewards wallet:", STAKING_REWARDS_WALLET);

        require(signer == STAKING_REWARDS_WALLET, "Private key must be for staking rewards wallet!");

        vm.startBroadcast(deployerPrivateKey);

        IERC20 pizza = IERC20(PIZZA_TOKEN);

        // Check current allowance
        uint256 currentAllowance = pizza.allowance(STAKING_REWARDS_WALLET, STAKING_PROXY);
        console.log("Current allowance:", currentAllowance / 1e18, "PIZZA");

        // Approve max uint256 for unlimited spending
        uint256 approveAmount = type(uint256).max;
        console.log("Approving staking contract for unlimited PIZZA...");

        pizza.approve(STAKING_PROXY, approveAmount);

        // Verify new allowance
        uint256 newAllowance = pizza.allowance(STAKING_REWARDS_WALLET, STAKING_PROXY);
        console.log("New allowance:", newAllowance > 1e50 ? "unlimited" : "check failed");

        vm.stopBroadcast();

        console.log("");
        console.log("=== APPROVAL COMPLETE ===");
        console.log("Staking rewards wallet:", STAKING_REWARDS_WALLET);
        console.log("Approved spender:", STAKING_PROXY);
        console.log("Token:", PIZZA_TOKEN);
    }
}
