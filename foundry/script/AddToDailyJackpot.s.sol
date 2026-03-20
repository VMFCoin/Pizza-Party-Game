// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AddToDailyJackpot is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;

    // $25.12 worth of PIZZA at $0.000002011 per PIZZA = 12,489,806.07 PIZZA
    uint256 constant PIZZA_AMOUNT = 12489806_070000000000000000;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaPartyV2Upgradeable party = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        IERC20 pizza = IERC20(PIZZA_TOKEN);

        console.log("=================================================");
        console.log("ADD $25.12 TO DAILY JACKPOT FROM TREASURY");
        console.log("=================================================");
        console.log("Deployer:", deployer);

        uint256 currentPot = party.currentDailyPot();
        address treasury = party.treasuryWallet();
        uint256 treasuryBalance = pizza.balanceOf(treasury);

        console.log("Treasury:", treasury);
        console.log("Treasury balance:", treasuryBalance / 1e18, "PIZZA");
        console.log("Current daily pot:", currentPot / 1e18, "PIZZA");
        console.log("Adding:", PIZZA_AMOUNT / 1e18, "PIZZA (~$25.12)");

        require(treasuryBalance >= PIZZA_AMOUNT, "Treasury has insufficient PIZZA");

        vm.startBroadcast(deployerPrivateKey);

        party.adminAddToDailyPotFromTreasury(PIZZA_AMOUNT);
        console.log("Added PIZZA from treasury to daily pot");

        vm.stopBroadcast();

        console.log("");
        console.log("AFTER:");
        console.log("  currentDailyPot:", party.currentDailyPot() / 1e18, "PIZZA");
        console.log("=================================================");
        console.log("SUCCESS!");
        console.log("=================================================");
    }
}
