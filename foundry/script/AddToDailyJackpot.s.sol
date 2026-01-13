// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title AddToDailyJackpot
 * @dev Adds PIZZA from treasury to the daily jackpot
 *      Treasury must have approved PizzaParty contract to spend PIZZA
 *
 * Usage:
 * - Dry run: forge script script/AddToDailyJackpot.s.sol --rpc-url https://mainnet.base.org
 * - Execute: PRIVATE_KEY="0x..." forge script script/AddToDailyJackpot.s.sol --rpc-url https://mainnet.base.org --broadcast
 */
contract AddToDailyJackpot is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;

    // $11 worth of PIZZA at $0.001487 per PIZZA = 7397.44 PIZZA
    uint256 constant PIZZA_AMOUNT = 7397_444519166106140672;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaPartyV2Upgradeable party = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        IERC20 pizza = IERC20(PIZZA_TOKEN);

        console.log("=================================================");
        console.log("ADD $11 TO DAILY JACKPOT");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("PizzaParty:", PIZZA_PARTY_PROXY);
        console.log("");

        uint256 currentPot = party.currentDailyPot();
        uint256 deployerBalance = pizza.balanceOf(deployer);

        console.log("BEFORE:");
        console.log("  currentDailyPot:", currentPot / 1e18, "PIZZA");
        console.log("  Deployer balance:", deployerBalance / 1e18, "PIZZA");
        console.log("  Adding:", PIZZA_AMOUNT / 1e18, "PIZZA (~$11)");

        require(deployerBalance >= PIZZA_AMOUNT, "Deployer has insufficient PIZZA");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Transfer PIZZA from deployer to PizzaParty contract
        pizza.transfer(PIZZA_PARTY_PROXY, PIZZA_AMOUNT);
        console.log("");
        console.log("Transferred PIZZA to contract");

        // Step 2: Update currentDailyPot storage
        uint256 newPot = currentPot + PIZZA_AMOUNT;
        party.adminSetCurrentDailyPot(newPot);
        console.log("Updated currentDailyPot to:", newPot / 1e18, "PIZZA");

        vm.stopBroadcast();

        console.log("");
        console.log("AFTER:");
        console.log("  currentDailyPot:", party.currentDailyPot() / 1e18, "PIZZA");
        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! Added $11 to daily jackpot");
        console.log("=================================================");
    }
}
