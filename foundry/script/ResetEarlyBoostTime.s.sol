// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

interface IPizzaParty {
    function dailyGameId() external view returns (uint256);
    function noonPacificUtcHour() external view returns (uint256);
}

/**
 * @title ResetEarlyBoostTime
 * @notice Extends early staker boost (+30%) to end exactly when Game 100 settles (Game 101 starts)
 * @dev Reads current dailyGameId from PizzaParty to calculate the exact end timestamp.
 *      Game 100 ends at noon Pacific on the day it settles. The boost expires at that moment,
 *      so stakers get +30% through the entire Game 100 celebration.
 *
 * Run: forge script script/ResetEarlyBoostTime.s.sol:ResetEarlyBoostTime --rpc-url base --broadcast
 */
contract ResetEarlyBoostTime is Script {
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    uint256 constant TARGET_GAME = 100;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(PIZZA_STAKING_PROXY);
        IPizzaParty party = IPizzaParty(PIZZA_PARTY_PROXY);

        // Read current game state
        uint256 currentGameId = party.dailyGameId();
        uint256 noonHour = party.noonPacificUtcHour();

        console.log("=== EXTEND EARLY BOOST TO GAME 100 END ===");
        console.log("");
        console.log("Current daily game ID:", currentGameId);
        console.log("Noon Pacific UTC hour:", noonHour);
        require(currentGameId <= TARGET_GAME, "Game 100 has already passed!");

        // Calculate days until Game 100 ends (= Game 101 starts)
        // Each game is 1 day. Game 100 ends when it settles at the NEXT noon Pacific.
        // Games remaining after current: (100 - currentGameId) more games to play
        // +1 because Game 100 itself needs to complete
        uint256 gamesRemaining = (TARGET_GAME - currentGameId) + 1;
        console.log("Games remaining (including Game 100):", gamesRemaining);

        // Calculate Game 101 start time = next noon PT + gamesRemaining days
        uint256 dayStart = (block.timestamp / 1 days) * 1 days;
        uint256 noonPT = dayStart + (noonHour * 1 hours);
        if (block.timestamp >= noonPT) {
            noonPT += 1 days;
        }
        // noonPT is now the next noon Pacific (= when current game settles)
        // Add gamesRemaining days to get to when Game 100 settles
        uint256 game101StartTime = noonPT + (gamesRemaining * 1 days);

        console.log("Next noon Pacific:", noonPT);
        console.log("Game 101 start (boost end):", game101StartTime);
        console.log("Days from now:", (game101StartTime - block.timestamp) / 1 days);

        // Show current boost status
        uint256 currentBoostEndTime = staking.boostEndTime();
        console.log("");
        console.log("Current boost end time:", currentBoostEndTime);
        if (currentBoostEndTime > block.timestamp) {
            uint256 daysRemaining2 = (currentBoostEndTime - block.timestamp) / 1 days;
            console.log("Days remaining on current boost:", daysRemaining2);
        } else {
            console.log("Boost has already expired!");
        }

        vm.startBroadcast(deployerPrivateKey);

        staking.adminSetBoostEndTime(game101StartTime);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Early Boost Extended ===");
        console.log("Boost end time set to:", game101StartTime);
        console.log("Early staker +30% bonus active through all of Game 100!");
        console.log("Boost expires when Game 101 starts.");
    }
}
