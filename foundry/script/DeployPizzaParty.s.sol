// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParty} from "../src/PizzaParty.sol";

contract DeployPizzaParty is Script {
    // Base mainnet addresses
    address constant VMF_TOKEN = 0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776;
    
    function run() external {
        // PRIVATE_KEY must have 0x prefix in .env file
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address treasuryWallet = vm.envAddress("TREASURY_WALLET");
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying PizzaParty to Base mainnet...");
        console.log("VMF Token:", VMF_TOKEN);
        console.log("Treasury Wallet:", treasuryWallet);
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        
        PizzaParty pizzaParty = new PizzaParty(VMF_TOKEN, treasuryWallet);
        
        console.log("PizzaParty deployed at:", address(pizzaParty));
        console.log("Owner:", pizzaParty.owner());
        console.log("VMF Token:", address(pizzaParty.vmfToken()));
        console.log("Treasury Wallet:", pizzaParty.treasuryWallet());
        
        vm.stopBroadcast();
    }
}

