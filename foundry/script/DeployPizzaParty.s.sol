// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployPizzaPartyV2 is Script {
    // Base mainnet addresses
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;
    address constant OWNER_WALLET = 0x828F516b379A2532bB33a00d34125560BF4c1853;

    function run() external {
        // PRIVATE_KEY must be a hex string (0x...) in .env file
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set in .env file");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);

        address treasuryWallet = vm.envAddress("TREASURY_WALLET");

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying PizzaPartyV2Upgradeable to Base mainnet...");
        console.log("PIZZA Token:", PIZZA_TOKEN);
        console.log("Treasury Wallet:", treasuryWallet);
        console.log("Owner:", OWNER_WALLET);
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        // 1. Deploy implementation
        PizzaPartyV2Upgradeable implementation = new PizzaPartyV2Upgradeable();
        console.log("Implementation deployed at:", address(implementation));

        // 2. Encode initializer call
        bytes memory initData = abi.encodeWithSelector(
            PizzaPartyV2Upgradeable.initialize.selector,
            PIZZA_TOKEN,
            treasuryWallet,
            new address[](0),
            OWNER_WALLET
        );

        // 3. Deploy proxy pointing to implementation
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("Proxy deployed at:", address(proxy));

        // 4. Verify deployment
        PizzaPartyV2Upgradeable pizzaParty = PizzaPartyV2Upgradeable(address(proxy));
        console.log("=== Verification ===");
        console.log("Owner:", pizzaParty.owner());
        console.log("PIZZA Token:", address(pizzaParty.pizzaToken()));
        console.log("Treasury Wallet:", pizzaParty.treasuryWallet());
        console.log("Holdings Unit Pizza:", pizzaParty.holdingsUnitPizza());

        vm.stopBroadcast();
    }
}
