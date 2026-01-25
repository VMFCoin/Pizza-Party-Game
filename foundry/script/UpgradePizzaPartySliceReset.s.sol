// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";

/**
 * @title UpgradePizzaPartySliceReset
 * @dev Upgrades PizzaPartyV2 to add adminResetHasSlicedPlayer function
 *
 * Usage:
 * - Dry run: forge script script/UpgradePizzaPartySliceReset.s.sol --rpc-url $BASE_RPC
 * - Deploy: forge script script/UpgradePizzaPartySliceReset.s.sol --rpc-url $BASE_RPC --broadcast --verify
 *
 * This upgrade adds:
 * - adminResetHasSlicedPlayer(sponsors[], players[]) to reset slice history for clean slate
 */
contract UpgradePizzaPartySliceReset is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("UPGRADING PIZZA PARTY V2 - SLICE RESET");
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
        console.log("Daily Game ID:", party.dailyGameId());
        console.log("Weekly Game ID:", party.weeklyGameId());

        console.log("");
        console.log("Next steps:");
        console.log("1. Run ResetSliceHistory.s.sol to batch reset hasSlicedPlayer mapping");
        console.log("2. Manually compensate 0xffde42d40175b3b9349Dfb384439dCB811691E09 for missed reward");
    }
}
