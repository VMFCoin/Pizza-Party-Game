// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";

/**
 * @title UpgradePizzaPartyStaking
 * @dev Upgrades PizzaPartyV2 to include staking integration (93% winners, 1% staking)
 *
 * Usage:
 * - Dry run: forge script script/UpgradePizzaPartyStaking.s.sol --rpc-url $BASE_RPC
 * - Deploy: forge script script/UpgradePizzaPartyStaking.s.sol --rpc-url $BASE_RPC --broadcast --verify
 *
 * This upgrade:
 * - Changes pot distribution from 94% winners to 93% winners
 * - Adds 1% staking pool distribution
 * - Adds staking contract integration
 *
 * AFTER UPGRADE, run:
 * - adminSetStakingContract(stakingProxyAddress) to enable staking rewards
 */
contract UpgradePizzaPartyStaking is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("UPGRADING PIZZA PARTY V2 - STAKING INTEGRATION");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Proxy:", PIZZA_PARTY_PROXY);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New Implementation:", address(newImpl));

        // Upgrade proxy
        PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(
            address(newImpl),
            "" // No initialization needed for this upgrade
        );

        vm.stopBroadcast();

        // Verify
        console.log("");
        console.log("===========================================");
        console.log("UPGRADE COMPLETE");
        console.log("===========================================");

        PizzaPartyV2Upgradeable party = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        console.log("PLAYERS_POOL_BPS:", party.PLAYERS_POOL_BPS());
        console.log("STAKING_POOL_BPS:", party.STAKING_POOL_BPS());
        console.log("Staking Contract:", party.stakingContract());

        console.log("");
        console.log("NOTE: Run adminSetStakingContract(stakingProxy) to enable rewards.");
    }
}
