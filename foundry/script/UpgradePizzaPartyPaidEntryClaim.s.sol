// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";

/**
 * @title UpgradePizzaPartyPaidEntryClaim
 * @notice Requires at least one paid daily entry per week before claimToppings().
 *         Blocks Share & Spin / free-slice-only players from entering weekly jackpot.
 *
 * Usage:
 *   Dry run:  forge script script/UpgradePizzaPartyPaidEntryClaim.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradePizzaPartyPaidEntryClaim.s.sol --rpc-url https://mainnet.base.org --broadcast
 */
contract UpgradePizzaPartyPaidEntryClaim is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaPartyV2Upgradeable proxy = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        console.log("=================================================");
        console.log("UPGRADE PIZZA PARTY - PAID ENTRY FOR TOPPING CLAIM");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("dailyGameId:", proxy.dailyGameId());
        console.log("weeklyGameId:", proxy.weeklyGameId());

        vm.startBroadcast(deployerPrivateKey);

        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("claimToppings() now requires hasPaidWeeklyEntry for current week");
    }
}
