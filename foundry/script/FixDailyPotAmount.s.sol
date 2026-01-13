// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract FixDailyPotAmount is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    // Game 29 actual pot: 8 winners * 1281.19 PIZZA / 0.94 = 10903.74 PIZZA
    uint256 constant GAME_29_POT = 10903744680851065012224;

    function run() external {
        uint256 pk = vm.parseUint(vm.envString("PRIVATE_KEY"));
        address deployer = vm.addr(pk);

        console.log("Deployer:", deployer);
        console.log("Proxy:", PIZZA_PARTY_PROXY);
        console.log("Game 29 - fixing potAmount");

        vm.startBroadcast(pk);

        // Deploy new implementation with adminSetDailyGamePotAmount
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New impl:", address(newImpl));

        // Upgrade
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgraded");

        // Fix the pot amount
        PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY).adminSetDailyGamePotAmount(29, GAME_29_POT);
        console.log("Fixed Game 29 pot to:", GAME_29_POT / 1e18, "PIZZA");

        vm.stopBroadcast();
    }
}
