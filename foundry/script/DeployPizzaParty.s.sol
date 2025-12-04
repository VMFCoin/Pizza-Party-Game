// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParty} from "../../PizzaParty (1).sol";

contract DeployPizzaParty is Script {
    // Base mainnet addresses
    address constant VMF_TOKEN = 0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776;
    address constant OWNER_WALLET = 0xf091E8c19D1F5F3D44D0D3311001Af1437B4F5B8;

    function run() external {
        // PRIVATE_KEY must be a hex string (0x...) in .env file
        // Read as string and parse as uint256 (handles hex strings)
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set in .env file");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);  // parseUint handles both hex (0x...) and decimal
        
        address treasuryWallet = vm.envAddress("TREASURY_WALLET");

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying PizzaParty to Base mainnet...");
        console.log("VMF Token:", VMF_TOKEN);
        console.log("Treasury Wallet:", treasuryWallet);
        console.log("Owner:", OWNER_WALLET);
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        PizzaParty pizzaParty = new PizzaParty(
            VMF_TOKEN,
            treasuryWallet,
            new address[](0),
            OWNER_WALLET,
            13,  // _startingDailyGameId (continues from Game 12)
            3    // _startingWeeklyGameId (continues from Weekly 2)
        );

        console.log("PizzaParty deployed at:", address(pizzaParty));
        console.log("Owner:", pizzaParty.owner());
        console.log("VMF Token:", address(pizzaParty.vmfToken()));
        console.log("Treasury Wallet:", pizzaParty.treasuryWallet());

        vm.stopBroadcast();
    }
}

