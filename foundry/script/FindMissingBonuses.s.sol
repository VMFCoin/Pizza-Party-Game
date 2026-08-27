// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";

contract FindMissingBonuses is Script {
    address constant PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external view {
        PizzaPartyV2Upgradeable pizza = PizzaPartyV2Upgradeable(PROXY);
        
        // These are the addresses that have been active this week - we need to check them
        // We'll pass them in via command line or check known addresses
        address[] memory playersToCheck = new address[](10);
        playersToCheck[0] = 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66; // Already credited
        playersToCheck[1] = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765;
        playersToCheck[2] = address(0); // placeholder
        
        console.log("=== Checking for missing +3 streak bonuses ===");
        console.log("");
        
        for (uint i = 0; i < 2; i++) {
            address player = playersToCheck[i];
            (uint256 earned, uint256 claimed, uint256 plays,,,, ) = pizza.getPlayerWeeklyInfo(player);
            
            console.log("Player:", player);
            console.log("  dailyPlays:", plays);
            console.log("  toppingsEarned:", earned);
            console.log("  toppingsClaimed:", claimed);
            
            // Check if they have 7 plays but earned less than expected (7 daily + 3 streak = 10 base)
            if (plays == 7 && earned < 10) {
                console.log("  >>> NEEDS +3 CREDIT <<<");
            }
            console.log("");
        }
    }
}
