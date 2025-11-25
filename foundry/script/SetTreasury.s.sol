// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParty} from "../src/PizzaParty.sol";

contract SetTreasury is Script {
    address constant PIZZA_PARTY_ADDRESS = 0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7;
    address constant NEW_TREASURY = 0x4479b00012D35894278C754385f5640A7AD5A27E;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        PizzaParty pizzaParty = PizzaParty(PIZZA_PARTY_ADDRESS);
        
        console.log("Current Treasury:", pizzaParty.treasuryWallet());
        console.log("Contract Owner:", pizzaParty.owner());
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("New Treasury:", NEW_TREASURY);
        
        // Check if treasury needs to be updated
        address currentTreasury = pizzaParty.treasuryWallet();
        if (currentTreasury == NEW_TREASURY) {
            console.log("Treasury is already set correctly!");
        } else {
            console.log("Setting new treasury wallet...");
            pizzaParty.setTreasuryWallet(NEW_TREASURY);
            console.log("Treasury updated!");
            console.log("New Treasury:", pizzaParty.treasuryWallet());
        }
        
        vm.stopBroadcast();
    }
}

