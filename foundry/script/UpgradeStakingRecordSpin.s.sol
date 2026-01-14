// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingRecordSpin
 * @dev Upgrades PizzaStakingV1Upgradeable to add recordSpin() function
 *
 * Usage:
 * - Dry run: forge script script/UpgradeStakingRecordSpin.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeStakingRecordSpin.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * This upgrade adds recordSpin() to prevent multi-device spin exploit:
 * - Users must call recordSpin() on-chain BEFORE the spin animation
 * - This records lastSpinGameId[user] = currentGameId
 * - Prevents spinning on multiple devices (only first device succeeds)
 * - The claim() function still checks lastSpinGameId as a second layer of defense
 */
contract UpgradeStakingRecordSpin is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        console.log("===========================================");
        console.log("UPGRADING PIZZA STAKING - ADD recordSpin()");
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

        // Deploy new implementation with recordSpin() function
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
        console.log("recordSpin() function is now available!");
        console.log("Frontend will call recordSpin() before showing spin animation.");
    }
}
