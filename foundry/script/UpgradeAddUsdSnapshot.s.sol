// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeAddUsdSnapshot
 * @dev Upgrades the PizzaParty proxy to add USD snapshot feature:
 *      - settleDailyGameWithUsd() - locks USD value at settlement
 *      - settleWeeklyGameWithUsd() - locks USD value at settlement
 *      - getDailyGameUsdValue() - read stored USD value
 *      - getWeeklyGameUsdValue() - read stored USD value
 *      - adminSetDailyGameUsdValue() - backfill historical games
 *      - adminSetWeeklyGameUsdValue() - backfill historical games
 *
 * Also sets USD values for historical games:
 * - Daily Game 3: 591 cents ($5.91)
 * - Weekly Games 1-4: 652 cents ($6.52)
 *
 * Usage:
 * - Dry run: forge script script/UpgradeAddUsdSnapshot.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradeAddUsdSnapshot.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradeAddUsdSnapshot.s.sol --fork-url $BASE_RPC --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeAddUsdSnapshot is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("UPGRADING PIZZA PARTY - ADD USD SNAPSHOT FEATURE");
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

        // Now we can use the new admin functions
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        // Step 3: Set USD values for historical games
        console.log("");
        console.log("--- Step 3: Setting USD values for historical games ---");

        // Daily Game 3: $5.91 per winner = 591 cents
        upgraded.adminSetDailyGameUsdValue(3, 591);
        console.log("Daily Game 3: set to 591 cents ($5.91)");

        // Weekly Games 1-4: $6.52 per winner = 652 cents
        for (uint256 i = 1; i <= 4; i++) {
            upgraded.adminSetWeeklyGameUsdValue(i, 652);
            console.log("Weekly Game", i, ": set to 652 cents ($6.52)");
        }

        vm.stopBroadcast();

        // Verify the upgrade
        console.log("");
        console.log("=================================================");
        console.log("VERIFICATION");
        console.log("=================================================");

        console.log("Owner (should be unchanged):", upgraded.owner());
        console.log("dailyGameId:", upgraded.dailyGameId());
        console.log("weeklyGameId:", upgraded.weeklyGameId());

        // Check stored USD values
        console.log("");
        console.log("--- Stored USD Values ---");
        console.log("Daily Game 3 USD (cents):", upgraded.getDailyGameUsdValue(3));
        console.log("Weekly Game 1 USD (cents):", upgraded.getWeeklyGameUsdValue(1));
        console.log("Weekly Game 4 USD (cents):", upgraded.getWeeklyGameUsdValue(4));

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! USD snapshot feature added:");
        console.log("- settleDailyGameWithUsd(usdCents) available");
        console.log("- settleWeeklyGameWithUsd(usdCents) available");
        console.log("- Historical games backfilled with USD values");
        console.log("=================================================");
    }
}
