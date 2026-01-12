// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title AddMissingStakers
 * @dev Upgrades staking contract and adds missing staker(s)
 *
 * Usage:
 * - Dry run: forge script script/AddMissingStakers.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/AddMissingStakers.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract AddMissingStakers is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    // Missing staker that wasn't initialized
    address constant MISSING_STAKER = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        console.log("==========================================");
        console.log("ADDING MISSING STAKERS");
        console.log("==========================================");
        console.log("Deployer:", deployer);
        console.log("Staking Proxy:", STAKING_PROXY);
        console.log("");

        // Show current values before upgrade
        console.log("--- BEFORE ---");
        console.log("Staker Count:", staking.stakerCount());
        console.log("Total Staked:", staking.totalStaked() / 1e18, "PIZZA");
        console.log("");

        // Check missing staker's stake
        (uint256 totalStakedAmount,,,,,,) = staking.getStakeInfo(MISSING_STAKER);
        console.log("Missing staker total:", totalStakedAmount / 1e18, "PIZZA");
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with adminAddMissingStakers function
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New Implementation:", address(newImpl));

        // Upgrade proxy to new implementation
        staking.upgradeToAndCall(address(newImpl), "");

        // Add missing staker
        address[] memory stakers = new address[](1);
        stakers[0] = MISSING_STAKER;
        staking.adminAddMissingStakers(stakers);

        vm.stopBroadcast();

        // Verify new values
        console.log("");
        console.log("==========================================");
        console.log("COMPLETE");
        console.log("==========================================");
        console.log("");
        console.log("--- AFTER ---");
        console.log("Staker Count:", staking.stakerCount());
        console.log("Total Staked:", staking.totalStaked() / 1e18, "PIZZA");
        console.log("");
        console.log("Missing staker reward debt:", staking.stakerRewardDebt(MISSING_STAKER));
        console.log("Missing staker pending rewards:", staking.getPendingRewards(MISSING_STAKER) / 1e18, "PIZZA");
    }
}
