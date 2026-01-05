// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeWeeklyTreasuryBonus
 * @dev Upgrades the PizzaParty proxy to enable weekly treasury bonus feature:
 *      - Added weeklyTreasuryBonus state variable (fixed PIZZA amount added to weekly jackpot)
 *      - Updated getCurrentWeeklyGame() to include bonus in projectedJackpot
 *      - Added setWeeklyTreasuryBonus() owner function
 *      - Sets initial value to ~$20 worth of PIZZA (~2632 PIZZA at $0.0076)
 *
 * This ensures the weekly jackpot starts at a minimum of $20 instead of $0
 * at the beginning of each week.
 *
 * Usage:
 * - Dry run: forge script script/UpgradeWeeklyTreasuryBonus.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: forge script script/UpgradeWeeklyTreasuryBonus.s.sol --rpc-url https://mainnet.base.org --broadcast
 * - Deploy + Verify: forge script script/UpgradeWeeklyTreasuryBonus.s.sol --rpc-url https://mainnet.base.org --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeWeeklyTreasuryBonus is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    // Treasury bonus: ~$20 worth of PIZZA
    // At $0.0076/PIZZA: $20 / $0.0076 = ~2632 PIZZA
    // Using 2632 PIZZA as the initial bonus
    uint256 constant WEEKLY_TREASURY_BONUS = 2632e18;

    function run() external {
        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("UPGRADING PIZZA PARTY - WEEKLY TREASURY BONUS");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("Weekly treasury bonus:", WEEKLY_TREASURY_BONUS / 1e18, "PIZZA");
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

        // Step 3: Set the weekly treasury bonus
        console.log("");
        console.log("--- Step 3: Setting weekly treasury bonus to 2632 PIZZA (~$20) ---");
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        upgraded.setWeeklyTreasuryBonus(WEEKLY_TREASURY_BONUS);
        console.log("weeklyTreasuryBonus set to:", upgraded.weeklyTreasuryBonus() / 1e18, "PIZZA");

        vm.stopBroadcast();

        // Verify the upgrade
        console.log("");
        console.log("=================================================");
        console.log("VERIFICATION");
        console.log("=================================================");
        console.log("Owner (should be unchanged):", upgraded.owner());
        console.log("dailyGameId:", upgraded.dailyGameId());
        console.log("weeklyGameId:", upgraded.weeklyGameId());
        console.log("weeklyTreasuryBonus:", upgraded.weeklyTreasuryBonus() / 1e18, "PIZZA");
        console.log("toppingUnitPizza:", upgraded.toppingUnitPizza() / 1e18, "PIZZA");

        // Test getCurrentWeeklyGame to verify bonus is included
        (
            uint256 claimStart,
            uint256 claimEnd,
            uint256 totalToppings,
            uint256 claimerCount,
            uint256 projectedJackpot,
            bool settled
        ) = upgraded.getCurrentWeeklyGame();

        console.log("");
        console.log("Current Weekly Game Status:");
        console.log("  claimStart:", claimStart);
        console.log("  claimEnd:", claimEnd);
        console.log("  totalToppings:", totalToppings);
        console.log("  claimerCount:", claimerCount);
        console.log("  projectedJackpot:", projectedJackpot / 1e18, "PIZZA (includes treasury bonus)");
        console.log("  settled:", settled);

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! Weekly jackpot now includes $20 treasury bonus");
        console.log("=================================================");
    }
}
