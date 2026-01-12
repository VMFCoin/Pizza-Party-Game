// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStaking
 * @dev Upgrades PizzaStakingV1Upgradeable to new implementation with adjusted thresholds
 *
 * Usage:
 * - Dry run: forge script script/UpgradeStaking.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeStaking.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * This upgrade adjusts thresholds for 10M PIZZA supply testing:
 * - MIN_STAKE: 100 PIZZA (was 100,000)
 * - MAX_STAKE: 1,000,000 PIZZA (was 1,000,000,000)
 * - TIER1: 50,000 PIZZA (was 50,000,000)
 * - TIER2: 200,000 PIZZA (was 200,000,000)
 * - TIER3: 500,000 PIZZA (was 500,000,000)
 */
contract UpgradeStaking is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        console.log("===========================================");
        console.log("UPGRADING PIZZA STAKING - 10M SUPPLY THRESHOLDS");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Staking Proxy:", STAKING_PROXY);
        console.log("Current Owner:", staking.owner());
        console.log("");

        // Show current values before upgrade
        console.log("--- BEFORE UPGRADE ---");
        console.log("MIN_STAKE (fallback):", staking.MIN_STAKE_FALLBACK() / 1e18, "PIZZA");
        console.log("MIN_STAKE (current):", staking.getMinStake() / 1e18, "PIZZA");
        console.log("MAX_STAKE:", staking.MAX_STAKE() / 1e18, "PIZZA");
        console.log("TIER1_THRESHOLD:", staking.TIER1_THRESHOLD() / 1e18, "PIZZA");
        console.log("TIER2_THRESHOLD:", staking.TIER2_THRESHOLD() / 1e18, "PIZZA");
        console.log("TIER3_THRESHOLD:", staking.TIER3_THRESHOLD() / 1e18, "PIZZA");
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with adjusted thresholds
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New Implementation:", address(newImpl));

        // Upgrade proxy to new implementation
        staking.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        // Verify new values
        console.log("");
        console.log("===========================================");
        console.log("UPGRADE COMPLETE");
        console.log("===========================================");
        console.log("");
        console.log("--- AFTER UPGRADE ---");
        console.log("MIN_STAKE (fallback):", staking.MIN_STAKE_FALLBACK() / 1e18, "PIZZA");
        console.log("MIN_STAKE (current):", staking.getMinStake() / 1e18, "PIZZA");
        console.log("MAX_STAKE:", staking.MAX_STAKE() / 1e18, "PIZZA");
        console.log("TIER1_THRESHOLD:", staking.TIER1_THRESHOLD() / 1e18, "PIZZA");
        console.log("TIER2_THRESHOLD:", staking.TIER2_THRESHOLD() / 1e18, "PIZZA");
        console.log("TIER3_THRESHOLD:", staking.TIER3_THRESHOLD() / 1e18, "PIZZA");
        console.log("");
        console.log("Pizza price (micro-USD):", staking.pizzaPriceMicroUsd());
        console.log("Staking rewards wallet:", staking.stakingRewardsWallet());
        console.log("Spin enabled:", staking.spinEnabled());
    }
}
