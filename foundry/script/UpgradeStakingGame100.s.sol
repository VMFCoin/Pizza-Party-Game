// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingGame100
 * @notice Upgrades staking contract with Game 100 features:
 *         - Double spins (configurable maxSpinsPerDay, 1 or 2)
 *         - Hidden gold chance (configurable goldChancePct, 0-100%)
 *         - Configurable APY (lockedApyBps, 0 = default 20%, max 2500 = 25%)
 *
 * After upgrade, call these admin functions to activate Game 100:
 *   adminSetMaxSpinsPerDay(2)   — enable double spins
 *   adminSetGoldChancePct(10)   — enable 10% hidden gold chance
 *
 * After Game 100, call to revert:
 *   adminSetMaxSpinsPerDay(1)   — back to single spin
 *   adminSetGoldChancePct(0)    — disable hidden gold
 *   adminSetLockedApyBps(2500)  — set APY to 25% for Game 101+
 */
contract UpgradeStakingGame100 is Script {
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(PIZZA_STAKING_PROXY);

        console.log("=================================================");
        console.log("UPGRADE STAKING - GAME 100 FEATURES");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("");
        console.log("BEFORE UPGRADE:");
        console.log("  Spin enabled:", proxy.spinEnabled());
        console.log("  Total staked:", proxy.totalStaked() / 1e18, "PIZZA");
        console.log("  Staker count:", proxy.stakerCount());

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("");
        console.log("New implementation:", address(newImpl));

        // Upgrade proxy
        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        // Verify upgrade — read new storage vars (should all be 0/defaults)
        console.log("");
        console.log("AFTER UPGRADE:");
        console.log("  maxSpinsPerDay:", proxy.maxSpinsPerDay());
        console.log("  goldChancePct:", proxy.goldChancePct());
        console.log("  lockedApyBps:", proxy.lockedApyBps());
        console.log("  Spin enabled:", proxy.spinEnabled());
        console.log("  Total staked:", proxy.totalStaked() / 1e18, "PIZZA");
        console.log("  Staker count:", proxy.stakerCount());
        console.log("");
        console.log("=================================================");
        console.log("UPGRADE COMPLETE!");
        console.log("=================================================");
        console.log("");
        console.log("Next steps to activate Game 100:");
        console.log("  1. adminSetMaxSpinsPerDay(2)");
        console.log("  2. adminSetGoldChancePct(10)");
        console.log("");
        console.log("After Game 100 settles:");
        console.log("  1. adminSetMaxSpinsPerDay(1)");
        console.log("  2. adminSetGoldChancePct(0)");
        console.log("  3. adminSetLockedApyBps(2500)");
    }
}
