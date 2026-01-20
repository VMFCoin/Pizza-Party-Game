// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingRestakeFix
 * @notice Upgrades the staking contract to fix the restake APY double-counting bug
 * @dev The restake() function was not updating lastApyClaimTimestamp, causing APY
 *      to be counted multiple times when users restaked their rewards.
 * @dev Run with: forge script script/UpgradeStakingRestakeFix.s.sol --rpc-url base --broadcast --verify
 */
contract UpgradeStakingRestakeFix is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with the restake APY fix
        PizzaStakingV1Upgradeable newImplementation = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImplementation));

        // Log the fix
        console.log("");
        console.log("=== RESTAKE APY FIX ===");
        console.log("Bug: restake() was not updating lastApyClaimTimestamp");
        console.log("Fix: Now updates lastApyClaimTimestamp after restaking");
        console.log("This prevents APY from being double-counted on restake");
        console.log("");

        // Upgrade the proxy to the new implementation
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImplementation), "");
        console.log("Proxy upgraded successfully!");

        vm.stopBroadcast();
    }
}
