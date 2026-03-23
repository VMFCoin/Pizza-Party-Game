// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPizzaPartyRead {
    function getDailyGamePlayers(uint256 gameId) external view returns (address[] memory);
    function dailyGameId() external view returns (uint256);
    function dailyGames(uint256 gameId) external view returns (
        uint256 startTime,
        uint256 endTime,
        address firstPlayer,
        uint256 potAmount,
        bool settled
    );
}

/**
 * @title ReimburseGame100Players
 * @notice Send a configurable PIZZA amount to every player in a given game.
 * @dev Designed for Game 100 ($2 PIZZA reimbursement) but reusable for any game.
 *
 * Environment variables:
 *   PRIVATE_KEY       - owner/treasury wallet private key
 *   GAME_ID           - game ID to reimburse (e.g. 100)
 *   REIMBURSE_AMOUNT  - PIZZA amount per player in whole tokens (e.g. 1000000 for 1M PIZZA)
 *
 * Example:
 *   GAME_ID=100 REIMBURSE_AMOUNT=1000000 forge script script/ReimburseGame100Players.s.sol \
 *     --rpc-url https://mainnet.base.org --broadcast
 */
contract ReimburseGame100Players is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address sender = vm.addr(deployerPrivateKey);

        uint256 gameId = vm.envUint("GAME_ID");
        uint256 reimburseAmount = vm.envUint("REIMBURSE_AMOUNT") * 1e18;

        require(gameId > 0, "GAME_ID must be > 0");
        require(reimburseAmount > 0, "REIMBURSE_AMOUNT must be > 0");

        IPizzaPartyRead party = IPizzaPartyRead(PIZZA_PARTY_PROXY);
        IERC20 pizza = IERC20(PIZZA_TOKEN);

        address[] memory players = party.getDailyGamePlayers(gameId);
        require(players.length > 0, "No players found for this game");

        uint256 totalNeeded = reimburseAmount * players.length;
        uint256 senderBalance = pizza.balanceOf(sender);

        console.log("=================================================");
        console.log("REIMBURSE GAME PLAYERS");
        console.log("=================================================");
        console.log("Sender:", sender);
        console.log("Game ID:", gameId);
        console.log("Players found:", players.length);
        console.log("Amount per player:", reimburseAmount / 1e18, "PIZZA");
        console.log("Total needed:", totalNeeded / 1e18, "PIZZA");
        console.log("Sender balance:", senderBalance / 1e18, "PIZZA");

        require(senderBalance >= totalNeeded, "Insufficient PIZZA balance");

        vm.startBroadcast(deployerPrivateKey);

        for (uint256 i = 0; i < players.length; i++) {
            pizza.transfer(players[i], reimburseAmount);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! Per player:", reimburseAmount / 1e18, "PIZZA");
        console.log("Players paid:", players.length);
        console.log("Total sent:", totalNeeded / 1e18, "PIZZA");
        console.log("=================================================");
    }
}
