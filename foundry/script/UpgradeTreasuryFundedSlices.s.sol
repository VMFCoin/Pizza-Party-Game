// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";

/**
 * @title UpgradeTreasuryFundedSlices
 * @dev Upgrade both PizzaParty and ParlorManager to support treasury-funded slice entries
 *
 * Changes:
 * - PizzaParty.enterDailyWithSlice now accepts amount parameter
 * - ParlorManager.claimSlice now pulls $1 from treasury and adds to pot
 *
 * Run commands:
 * - Dry run: forge script script/UpgradeTreasuryFundedSlices.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeTreasuryFundedSlices.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeTreasuryFundedSlices is Script {
    // Proxy addresses
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("=== UPGRADING PIZZA PARTY ===");
        console.log("Proxy:", PIZZA_PARTY_PROXY);

        // Deploy new PizzaParty implementation
        PizzaPartyV2Upgradeable newPizzaPartyImpl = new PizzaPartyV2Upgradeable();
        console.log("New PizzaParty implementation:", address(newPizzaPartyImpl));

        // Upgrade PizzaParty proxy
        PizzaPartyV2Upgradeable pizzaParty = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        pizzaParty.upgradeToAndCall(address(newPizzaPartyImpl), "");
        console.log("PizzaParty upgraded!");

        console.log("\n=== UPGRADING PARLOR MANAGER ===");
        console.log("Proxy:", PARLOR_MANAGER_PROXY);

        // Deploy new ParlorManager implementation
        PizzaParlorManagerUpgradeable newParlorManagerImpl = new PizzaParlorManagerUpgradeable();
        console.log("New ParlorManager implementation:", address(newParlorManagerImpl));

        // Upgrade ParlorManager proxy
        PizzaParlorManagerUpgradeable parlorManager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);
        parlorManager.upgradeToAndCall(address(newParlorManagerImpl), "");
        console.log("ParlorManager upgraded!");

        // Verify treasury wallet
        address treasury = parlorManager.treasuryWallet();
        console.log("\n=== CONFIGURATION ===");
        console.log("Treasury wallet:", treasury);
        console.log("Treasury must approve ParlorManager to spend PIZZA for slice entries");

        vm.stopBroadcast();
    }
}
