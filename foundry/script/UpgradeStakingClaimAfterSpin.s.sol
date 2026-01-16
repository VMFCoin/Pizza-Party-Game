// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingClaimAfterSpin
 * @dev Upgrades PizzaStakingV1Upgradeable to add claimAfterSpin() function
 *
 * Usage:
 * - Dry run: forge script script/UpgradeStakingClaimAfterSpin.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeStakingClaimAfterSpin.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * This upgrade adds claimAfterSpin() function:
 * - New function: claimAfterSpin() - claims rewards without triggering spin logic
 * - Used after user has already called recordSpin() and seen spin animation
 * - Fixes WALLET button failing with "AlreadySpunToday" error
 */
contract UpgradeStakingClaimAfterSpin is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        console.log("===========================================");
        console.log("UPGRADING PIZZA STAKING - ADD claimAfterSpin()");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Staking Proxy:", STAKING_PROXY);
        console.log("Current Owner:", staking.owner());
        console.log("");

        // Show current values before upgrade
        console.log("--- BEFORE UPGRADE ---");
        console.log("Total Staked:", staking.totalStaked() / 1e18, "PIZZA");
        console.log("Staker Count:", staking.stakerCount());
        console.log("Spin Enabled:", staking.spinEnabled());
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with claimAfterSpin
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New Implementation:", address(newImpl));

        // Upgrade proxy to new implementation
        staking.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        // Verify upgrade
        console.log("");
        console.log("===========================================");
        console.log("UPGRADE COMPLETE");
        console.log("===========================================");
        console.log("");
        console.log("--- AFTER UPGRADE ---");
        console.log("Total Staked:", staking.totalStaked() / 1e18, "PIZZA");
        console.log("Staker Count:", staking.stakerCount());
        console.log("Spin Enabled:", staking.spinEnabled());
        console.log("");
        console.log("claimAfterSpin() function is now available!");
        console.log("Users can now claim to wallet after spinning without errors.");
    }
}
