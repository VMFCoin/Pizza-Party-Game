// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingNoAutoClaimOnUnstake
 * @notice Upgrades the staking contract to remove automatic reward claiming on unstake
 * @dev Previously, unstake() would auto-claim rewards. Now users must explicitly claim.
 * @dev Run with: forge script script/UpgradeStakingNoAutoClaimOnUnstake.s.sol --rpc-url base --broadcast --verify
 */
contract UpgradeStakingNoAutoClaimOnUnstake is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaStakingV1Upgradeable newImplementation = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImplementation));

        // Log the fix
        console.log("");
        console.log("=== NO AUTO-CLAIM ON UNSTAKE FIX ===");
        console.log("Before: unstake() would auto-claim rewards");
        console.log("After: unstake() only unstakes - rewards stay pending");
        console.log("Users must explicitly claim via claim() or SPIN THE PIE");
        console.log("");

        // Upgrade the proxy to the new implementation
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImplementation), "");
        console.log("Proxy upgraded successfully!");

        vm.stopBroadcast();
    }
}
