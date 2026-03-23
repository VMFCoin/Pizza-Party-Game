// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPizzaPartyCharity {
    function charityWallets(uint256 index) external view returns (address);
    function dailyGames(uint256 gameId) external view returns (
        uint256 startTime,
        uint256 endTime,
        address firstPlayer,
        uint256 potAmount,
        bool settled
    );
    function dailyGameId() external view returns (uint256);
}

/**
 * @title Game100CharityMatch
 * @notice Send a configurable PIZZA amount split equally across all charity wallets.
 * @dev Designed for Game 100 (match the daily pot to charities) but reusable.
 *      Reads charity wallets directly from PizzaParty contract.
 *
 * Environment variables:
 *   PRIVATE_KEY     - owner/treasury wallet private key
 *   CHARITY_AMOUNT  - total PIZZA to distribute in whole tokens (e.g. 50000000 for 50M PIZZA)
 *                     If set to 0, reads potAmount from GAME_ID and uses that as the total.
 *   GAME_ID         - (optional) game ID to match pot from. Only used when CHARITY_AMOUNT=0.
 *
 * Example (manual amount):
 *   CHARITY_AMOUNT=50000000 forge script script/Game100CharityMatch.s.sol \
 *     --rpc-url https://mainnet.base.org --broadcast
 *
 * Example (match game pot):
 *   CHARITY_AMOUNT=0 GAME_ID=100 forge script script/Game100CharityMatch.s.sol \
 *     --rpc-url https://mainnet.base.org --broadcast
 */
contract Game100CharityMatch is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address sender = vm.addr(deployerPrivateKey);

        uint256 charityAmount = vm.envUint("CHARITY_AMOUNT") * 1e18;

        IPizzaPartyCharity party = IPizzaPartyCharity(PIZZA_PARTY_PROXY);
        IERC20 pizza = IERC20(PIZZA_TOKEN);

        // If CHARITY_AMOUNT=0, read pot from GAME_ID
        if (charityAmount == 0) {
            uint256 gameId = vm.envUint("GAME_ID");
            require(gameId > 0, "GAME_ID required when CHARITY_AMOUNT=0");
            (, , , uint256 potAmount, bool settled) = party.dailyGames(gameId);
            require(settled, "Game not settled yet");
            require(potAmount > 0, "Game pot is 0");
            charityAmount = potAmount;
            console.log("Matching pot from Game:", gameId);
            console.log("Pot amount:", potAmount / 1e18, "PIZZA");
        }

        // Read charity wallets from contract
        address[] memory charities = new address[](20); // max reasonable
        uint256 charityCount = 0;
        for (uint256 i = 0; i < 20; i++) {
            try party.charityWallets(i) returns (address wallet) {
                charities[i] = wallet;
                charityCount++;
            } catch {
                break;
            }
        }
        require(charityCount > 0, "No charity wallets found");

        uint256 perCharity = charityAmount / charityCount;
        uint256 totalNeeded = perCharity * charityCount;
        uint256 senderBalance = pizza.balanceOf(sender);

        console.log("=================================================");
        console.log("CHARITY MATCH - SEND PIZZA TO ALL CHARITIES");
        console.log("=================================================");
        console.log("Sender:", sender);
        console.log("Charities found:", charityCount);
        console.log("Total to distribute:", charityAmount / 1e18, "PIZZA");
        console.log("Per charity:", perCharity / 1e18, "PIZZA");
        console.log("Sender balance:", senderBalance / 1e18, "PIZZA");

        require(senderBalance >= totalNeeded, "Insufficient PIZZA balance");

        // Log each charity
        for (uint256 i = 0; i < charityCount; i++) {
            console.log("  Charity", i, ":", charities[i]);
        }

        vm.startBroadcast(deployerPrivateKey);

        for (uint256 i = 0; i < charityCount; i++) {
            pizza.transfer(charities[i], perCharity);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! Per charity:", perCharity / 1e18, "PIZZA");
        console.log("Charities paid:", charityCount);
        console.log("Total sent:", totalNeeded / 1e18, "PIZZA");
        console.log("=================================================");
    }
}
