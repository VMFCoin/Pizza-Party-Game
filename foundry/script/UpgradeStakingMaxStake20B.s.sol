// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingMaxStake20B
 * @notice Upgrades PizzaStaking to raise MAX_STAKE from 10B to 20B PIZZA per wallet
 * @dev Only change: MAX_STAKE constant increased from 10_000_000_000 to 20_000_000_000.
 *      No storage layout changes, no logic changes beyond the cap value.
 */
contract UpgradeStakingMaxStake20B is Script {
    // Base mainnet staking proxy
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImpl));

        // Upgrade proxy to new implementation
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(PIZZA_STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded successfully");

        // Verify the upgrade
        console.log("New MAX_STAKE:", proxy.MAX_STAKE() / 1e18, "PIZZA");
        console.log("Total staked:", proxy.totalStaked());
        console.log("Staker count:", proxy.stakerCount());

        vm.stopBroadcast();

        console.log("\n=== UPGRADE COMPLETE ===");
        console.log("MAX_STAKE raised from 10B to 20B PIZZA per wallet");
    }
}
