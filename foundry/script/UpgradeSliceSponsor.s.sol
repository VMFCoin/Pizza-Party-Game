// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeSliceSponsor
 * @dev Upgrades the PizzaParty proxy with slice sponsor mechanics fixes:
 *      - Per-sponsor tracking with hasSlicedPlayer mapping
 *      - Sponsor only gets 50% reward on FIRST slice to each player ever
 *      - Weekly sponsor tracking per week with weeklySliceSponsor mapping
 *      - Fix array out-of-bounds in _settleWeeklyGame weighted winner selection
 *
 * Usage:
 * - Dry run: forge script script/UpgradeSliceSponsor.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradeSliceSponsor.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradeSliceSponsor.s.sol --fork-url $BASE_RPC --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeSliceSponsor is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("UPGRADING PIZZA PARTY - SLICE SPONSOR MECHANICS FIX");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("");

        // Check current state
        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        console.log("Current owner:", current.owner());
        console.log("Current dailyGameId:", current.dailyGameId());
        console.log("Current weeklyGameId:", current.weeklyGameId());
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy new implementation
        console.log("--- Step 1: Deploying new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation address:", address(newImpl));

        // Step 2: Upgrade proxy to new implementation
        console.log("");
        console.log("--- Step 2: Upgrading proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        vm.stopBroadcast();

        // Verify the upgrade
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        console.log("");
        console.log("=================================================");
        console.log("VERIFICATION");
        console.log("=================================================");
        console.log("Owner (should be unchanged):", upgraded.owner());
        console.log("dailyGameId:", upgraded.dailyGameId());
        console.log("weeklyGameId:", upgraded.weeklyGameId());

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! Slice sponsor mechanics fixed:");
        console.log("- hasSlicedPlayer[sponsor][player] tracking active");
        console.log("- weeklySliceSponsor[weekId][player] tracking active");
        console.log("- Weekly settlement array bounds fix applied");
        console.log("=================================================");
    }
}
