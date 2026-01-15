// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingAPY
 * @dev Upgrades PizzaStakingV1Upgradeable to add 20% APY for locked stakers
 *
 * Usage:
 * - Dry run: forge script script/UpgradeStakingAPY.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeStakingAPY.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * This upgrade adds 20% APY rewards for locked stakers:
 * - New constants: LOCKED_APY_BPS (2000) and DAYS_PER_YEAR (365)
 * - New mapping: lastApyClaimTimestamp tracks APY claim timestamps
 * - New function: getPendingApyReward() returns accumulated APY
 * - Modified claim functions include APY in final reward
 * - APY is paid from stakingRewardsWallet (same as other bonuses)
 *
 * APY Calculation:
 * - Daily rate = lockedAmount × 2000 / (365 × 10000) = ~0.0548% per day
 * - Example: 100,000 PIZZA locked = 54.79 PIZZA/day APY
 */
contract UpgradeStakingAPY is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        console.log("===========================================");
        console.log("UPGRADING PIZZA STAKING - ADD 20% APY");
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

        // Deploy new implementation with APY feature
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
        console.log("New APY Constants:");
        console.log("  LOCKED_APY_BPS:", staking.LOCKED_APY_BPS());
        console.log("  DAYS_PER_YEAR:", staking.DAYS_PER_YEAR());
        console.log("");
        console.log("20% APY for locked stakers is now active!");
        console.log("Existing locked stakers will start earning APY from their stake timestamp.");
    }
}
