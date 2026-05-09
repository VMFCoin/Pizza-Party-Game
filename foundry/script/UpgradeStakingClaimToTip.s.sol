// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingClaimToTip
 * @notice Upgrades PizzaStakingV1Upgradeable to add `tippingVault` slot, `claimToTip()`,
 *         and `adminSetTippingVault()`.
 *
 * Storage change: ONE slot appended at end (tippingVault). No reorder.
 *
 * Run AFTER DeployPizzaTippingVault.s.sol completes. This script does NOT
 * automatically call adminSetTippingVault — do that as a separate transaction
 * after verifying the upgrade.
 */
contract UpgradeStakingClaimToTip is Script {
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // Deploy new implementation
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New staking implementation:", address(newImpl));

        // Upgrade proxy
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(PIZZA_STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded.");

        // Verify state preserved
        console.log("MAX_STAKE:", proxy.MAX_STAKE() / 1e18, "PIZZA");
        console.log("totalStaked:", proxy.totalStaked());
        console.log("stakerCount:", proxy.stakerCount());
        console.log("tippingVault (should be 0x0 until adminSet):", proxy.tippingVault());

        vm.stopBroadcast();

        console.log("\n=== UPGRADE COMPLETE ===");
        console.log("NEXT STEP:");
        console.log("Call: staking.adminSetTippingVault(<vault proxy address>)");
    }
}
