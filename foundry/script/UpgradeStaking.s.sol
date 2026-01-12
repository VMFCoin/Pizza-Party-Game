// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStaking
 * @dev Upgrades PizzaStakingV1Upgradeable to EQUAL reward distribution
 *
 * Usage:
 * - Dry run: forge script script/UpgradeStaking.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeStaking.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * This upgrade changes reward distribution from proportional to EQUAL:
 * - All stakers get the same base reward from daily pot (split equally)
 * - Tier bonuses, lock bonuses, and early boost still apply as multipliers
 * - Rewards accumulate if not claimed (can claim multiple days at once)
 */
contract UpgradeStaking is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    // Existing stakers to initialize (2 current stakers)
    address constant STAKER1 = 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66; // Your wallet
    address constant STAKER2 = 0x9157Feb12812b253e84447C6B52C38651fd67FcA; // Other tester

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        console.log("===========================================");
        console.log("UPGRADING PIZZA STAKING - EQUAL DISTRIBUTION");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Staking Proxy:", STAKING_PROXY);
        console.log("Current Owner:", staking.owner());
        console.log("");

        // Show current values before upgrade
        console.log("--- BEFORE UPGRADE ---");
        console.log("Total Staked:", staking.totalStaked() / 1e18, "PIZZA");
        console.log("accRewardPerShare:", staking.accRewardPerShare());
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with equal distribution
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New Implementation:", address(newImpl));

        // Upgrade proxy to new implementation
        staking.upgradeToAndCall(address(newImpl), "");

        // Initialize staker count with existing stakers
        address[] memory stakers = new address[](2);
        stakers[0] = STAKER1;
        stakers[1] = STAKER2;
        staking.adminInitializeStakerCount(2, stakers);

        vm.stopBroadcast();

        // Verify new values
        console.log("");
        console.log("===========================================");
        console.log("UPGRADE COMPLETE");
        console.log("===========================================");
        console.log("");
        console.log("--- AFTER UPGRADE ---");
        console.log("Staker Count:", staking.stakerCount());
        console.log("accRewardPerStaker:", staking.accRewardPerStaker());
        console.log("Total Staked:", staking.totalStaked() / 1e18, "PIZZA");
        console.log("");
        console.log("Staker 1 reward debt:", staking.stakerRewardDebt(STAKER1));
        console.log("Staker 2 reward debt:", staking.stakerRewardDebt(STAKER2));
        console.log("");
        console.log("Staker 1 pending rewards:", staking.getPendingRewards(STAKER1) / 1e18, "PIZZA");
        console.log("Staker 2 pending rewards:", staking.getPendingRewards(STAKER2) / 1e18, "PIZZA");
    }
}
