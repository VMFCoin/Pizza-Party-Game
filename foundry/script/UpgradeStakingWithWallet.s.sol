// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title UpgradeStakingWithWallet
 * @dev Upgrades staking contract and sets up staking wallet for bonus payouts
 *
 * This script does 3 things:
 * 1. Deploys new implementation with updated reward logic (extras from wallet)
 * 2. Sets stakingRewardsWallet on the contract
 * 3. Approves staking contract to spend PIZZA from staking wallet
 *
 * Usage:
 * - Dry run: forge script script/UpgradeStakingWithWallet.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." STAKING_WALLET_PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeStakingWithWallet.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeStakingWithWallet is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;

    function run() external {
        // Get deployer (owner) private key
        string memory deployerKeyStr = vm.envString("PRIVATE_KEY");
        require(bytes(deployerKeyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(deployerKeyStr);
        address deployer = vm.addr(deployerPrivateKey);

        // Get staking wallet private key
        string memory stakingWalletKeyStr = vm.envString("STAKING_WALLET_PRIVATE_KEY");
        require(bytes(stakingWalletKeyStr).length > 0, "STAKING_WALLET_PRIVATE_KEY not set");
        uint256 stakingWalletPrivateKey = vm.parseUint(stakingWalletKeyStr);
        address stakingWallet = vm.addr(stakingWalletPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);
        IERC20 pizza = IERC20(PIZZA_TOKEN);

        console.log("==========================================");
        console.log("UPGRADING STAKING + SETTING UP WALLET");
        console.log("==========================================");
        console.log("Deployer (owner):", deployer);
        console.log("Staking Wallet:", stakingWallet);
        console.log("Staking Proxy:", STAKING_PROXY);
        console.log("");

        // Show current state
        console.log("--- BEFORE ---");
        console.log("Current stakingRewardsWallet:", staking.stakingRewardsWallet());
        console.log("Staking wallet PIZZA balance:", pizza.balanceOf(stakingWallet) / 1e18, "PIZZA");
        console.log("Current allowance to staking contract:", pizza.allowance(stakingWallet, STAKING_PROXY) / 1e18, "PIZZA");
        console.log("");

        // Step 1: Deploy new implementation and upgrade (as deployer/owner)
        vm.startBroadcast(deployerPrivateKey);

        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New Implementation:", address(newImpl));

        staking.upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded to new implementation");

        // Step 2: Set staking rewards wallet (as owner)
        staking.adminSetStakingRewardsWallet(stakingWallet);
        console.log("Set stakingRewardsWallet to:", stakingWallet);

        vm.stopBroadcast();

        // Step 3: Approve staking contract to spend PIZZA (as staking wallet)
        vm.startBroadcast(stakingWalletPrivateKey);

        // Approve max uint256 so we don't need to approve again
        uint256 approvalAmount = type(uint256).max;
        pizza.approve(STAKING_PROXY, approvalAmount);
        console.log("Approved staking contract to spend PIZZA from staking wallet");

        vm.stopBroadcast();

        // Verify final state
        console.log("");
        console.log("==========================================");
        console.log("COMPLETE");
        console.log("==========================================");
        console.log("");
        console.log("--- AFTER ---");
        console.log("stakingRewardsWallet:", staking.stakingRewardsWallet());
        console.log("Allowance to staking contract:", pizza.allowance(stakingWallet, STAKING_PROXY) > 1e30 ? "UNLIMITED" : "LIMITED");
        console.log("Staking wallet PIZZA balance:", pizza.balanceOf(stakingWallet) / 1e18, "PIZZA");
        console.log("");
        console.log("REWARD FUNDING MODEL:");
        console.log("- BASE rewards (1%): from contract balance (PizzaPartyV2 daily pot)");
        console.log("- EXTRAS (spin + bonuses): from staking wallet");
    }
}
