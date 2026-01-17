// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AddToDailyJackpot is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;

    // $20 worth of PIZZA at $0.001377 per PIZZA = 14524.33 PIZZA
    uint256 constant PIZZA_AMOUNT = 14524_329700072621105152;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaPartyV2Upgradeable party = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        IERC20 pizza = IERC20(PIZZA_TOKEN);

        console.log("=================================================");
        console.log("ADD $20 TO DAILY JACKPOT FROM TREASURY");
        console.log("=================================================");
        console.log("Deployer:", deployer);

        uint256 currentPot = party.currentDailyPot();
        address treasury = party.treasuryWallet();
        uint256 treasuryBalance = pizza.balanceOf(treasury);

        console.log("Treasury:", treasury);
        console.log("Treasury balance:", treasuryBalance / 1e18, "PIZZA");
        console.log("Current daily pot:", currentPot / 1e18, "PIZZA");
        console.log("Adding:", PIZZA_AMOUNT / 1e18, "PIZZA (~$20)");

        require(treasuryBalance >= PIZZA_AMOUNT, "Treasury has insufficient PIZZA");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with adminAddToDailyPotFromTreasury function
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation:", address(newImpl));

        // Upgrade proxy
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgraded proxy");

        // Pull from treasury and add to daily pot
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
