// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingJackpotFix
 * @notice Upgrades the staking contract to fix jackpot parameters:
 *         - Jackpot bonus: 10B -> 10M PIZZA
 *         - Jackpot multiplier: 4x -> 3x (40000 -> 30000 BPS)
 * @dev Run with: forge script script/UpgradeStakingJackpotFix.s.sol --rpc-url base --broadcast --verify
 */
contract UpgradeStakingJackpotFix is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with fixed jackpot parameters
        PizzaStakingV1Upgradeable newImplementation = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImplementation));

        // Log the fixed values
        console.log("");
        console.log("=== JACKPOT PARAMETER FIXES ===");
        console.log("Jackpot bonus: 10M PIZZA (was 10B)");
        console.log("Jackpot multiplier: 3x / 30000 BPS (was 4x / 40000 BPS)");
        console.log("");

        // Upgrade the proxy to the new implementation
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImplementation), "");
        console.log("Proxy upgraded successfully!");

        // Verify the new constants
        console.log("");
        console.log("=== VERIFICATION ===");
        console.log("JACKPOT_FIXED_BONUS:", newImplementation.JACKPOT_FIXED_BONUS() / 1e18, "PIZZA");
        console.log("SPIN_JACKPOT_MULTIPLIER_BPS:", newImplementation.SPIN_JACKPOT_MULTIPLIER_BPS());

        vm.stopBroadcast();
    }
}
