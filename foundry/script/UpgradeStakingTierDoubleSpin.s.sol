// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingTierDoubleSpin
 * @notice Upgrades staking contract to make double-spin tier-gated.
 *
 *         Behavior change:
 *           - Oven Operator tier (>= 500M PIZZA staked) and above get 2 spins per day
 *           - Slice Runner (default tier) keeps 1 spin per day
 *           - maxSpinsPerDay / goldChancePct setters remain (storage preserved) but
 *             are no longer read by recordSpin / canSpinToday / pending reward display.
 *
 *         No admin calls required after upgrade — the rule is hard-coded.
 */
contract UpgradeStakingTierDoubleSpin is Script {
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(PIZZA_STAKING_PROXY);

        console.log("=================================================");
        console.log("UPGRADE STAKING - TIER-GATED DOUBLE SPIN");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("");
        console.log("BEFORE UPGRADE:");
        console.log("  Spin enabled:", proxy.spinEnabled());
        console.log("  Total staked:", proxy.totalStaked() / 1e18, "PIZZA");
        console.log("  Staker count:", proxy.stakerCount());

        vm.startBroadcast(deployerPrivateKey);

        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("");
        console.log("New implementation:", address(newImpl));

        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("AFTER UPGRADE:");
        console.log("  Spin enabled:", proxy.spinEnabled());
        console.log("  Total staked:", proxy.totalStaked() / 1e18, "PIZZA");
        console.log("  Staker count:", proxy.stakerCount());
        console.log("");
        console.log("=================================================");
        console.log("UPGRADE COMPLETE");
        console.log("=================================================");
        console.log("");
        console.log("Oven Operator+ (500M PIZZA staked) now get 2 spins/day.");
        console.log("No admin calls needed.");
    }
}
