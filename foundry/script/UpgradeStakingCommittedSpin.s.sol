// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingCommittedSpin
 * @notice Upgrades PizzaStaking to commit spin outcome during recordSpin()
 * @dev This fixes the jackpot bonus issue where UI showed different outcome than contract paid
 *
 * Changes in this upgrade:
 * 1. recordSpin() now determines and stores the spin outcome on-chain
 * 2. SpinRecorded event now includes the outcome
 * 3. claimAfterSpin/restake use the pre-committed outcome instead of re-rolling
 * 4. This ensures UI shows the REAL outcome and jackpot winners get their 10M bonus
 */
contract UpgradeStakingCommittedSpin is Script {
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
        console.log("Spin enabled:", proxy.spinEnabled());
        console.log("Total staked:", proxy.totalStaked());

        vm.stopBroadcast();

        console.log("\n=== UPGRADE COMPLETE ===");
        console.log("The staking contract now commits spin outcomes during recordSpin()");
        console.log("This ensures jackpot winners receive their 10M PIZZA bonus");
    }
}
