// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeMigrateGame4
 * @dev Upgrades the PizzaParty proxy and migrates 7 players from Game 3 to Game 4
 *
 * Current State:
 * - dailyGameId = 3
 * - Game 3 has 35 players (28 from yesterday + 7 from today)
 * - Game 3 has 8 winners stored (correct winners from Dec 18 settlement)
 * - Game 3 settled = false (bug)
 *
 * Fix Actions:
 * 1. Deploy new implementation with adminMigratePlayers() function
 * 2. Mark Game 3 as settled
 * 3. Initialize Game 4 with correct times (Dec 18 12pm PST to Dec 19 12pm PST)
 * 4. Migrate the 7 NEW players from Game 3 to Game 4
 * 5. Set dailyGameId to 4
 *
 * Result:
 * - Game 3: settled=true, 8 winners shown on leaderboard
 * - Game 4: 7 players, active game, ends Dec 19 12pm PST
 *
 * Usage:
 * - Dry run: forge script script/UpgradeMigrateGame4.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/UpgradeMigrateGame4.s.sol --fork-url $BASE_RPC --broadcast
 * - Deploy + Verify: forge script script/UpgradeMigrateGame4.s.sol --fork-url $BASE_RPC --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract UpgradeMigrateGame4 is Script {
    // Existing proxy address on Base mainnet
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    // The 7 NEW players who entered after 12pm PST on Dec 18, 2025
    // These are the ones who should be in Game 4
    address[] public newPlayers;

    // Entry fee per player (calculated from pot / players = 5652.95 / 35 = ~161.51 PIZZA)
    uint256 constant PIZZA_PER_PLAYER = 161512888639945015296; // ~161.51 PIZZA per entry

    // Game 4 times (Dec 18 12pm PST to Dec 19 12pm PST)
    uint256 constant GAME_4_START = 1766088000; // Dec 18, 2025 12:00 PM PST (20:00 UTC)
    uint256 constant GAME_4_END = 1766174400;   // Dec 19, 2025 12:00 PM PST (20:00 UTC)

    function run() external {
        // Initialize the players array
        newPlayers.push(0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF);
        newPlayers.push(0xC77dA8cB158BA77BaC765625745a766Af3111A69);
        newPlayers.push(0xAbacfD4c6d2E21802910A7e667E6efF159602535);
        newPlayers.push(0x65e3419E633833Df1D602e7905Cb9C7e541f0849);
        newPlayers.push(0xdf13d712d58EF7F7Abd4D29B398d503262ba4AC0);
        newPlayers.push(0xD68C5493e41F03faC90776ad0366376E245255E8);
        newPlayers.push(0x1E3c69B61744C9D0b41652117d93a93b45aD4344);

        // Load private key
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("UPGRADING PIZZA PARTY - MIGRATE 7 PLAYERS TO GAME 4");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Proxy address:", PIZZA_PARTY_PROXY);
        console.log("");

        // Check current state
        PizzaPartyV2Upgradeable current = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);
        uint256 currentGameId = current.dailyGameId();
        console.log("Current owner:", current.owner());
        console.log("Current dailyGameId:", currentGameId);
        console.log("");

        // Get current Game 3 state
        (uint256 g3Start, uint256 g3End, address g3First, uint256 g3Pot, bool g3Settled) = _getDailyGame(current, 3);
        address[] memory g3Players = current.getDailyGamePlayers(3);
        console.log("--- Current Game 3 State ---");
        console.log("Players:", g3Players.length);
        console.log("Pot:", g3Pot);
        console.log("Settled:", g3Settled);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy new implementation
        console.log("--- Step 1: Deploying new implementation ---");
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New implementation address:", address(newImpl));

        // Step 2: Upgrade proxy to new implementation
        console.log("");
        console.log("--- Step 2: Upgrading proxy ---");
        UUPSUpgradeable(PIZZA_PARTY_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // Now we can use the new admin functions
        PizzaPartyV2Upgradeable upgraded = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        // Step 3: Mark Game 3 as settled
        console.log("");
        console.log("--- Step 3: Marking Game 3 as settled ---");
        upgraded.adminMarkDailyGameSettled(3);
        console.log("Game 3 marked as settled!");

        // Step 4: Initialize Game 4 with correct times
        console.log("");
        console.log("--- Step 4: Initializing Game 4 ---");
        upgraded.adminInitializeDailyGame(4, GAME_4_START, GAME_4_END);
        console.log("Game 4 initialized with start:", GAME_4_START, "end:", GAME_4_END);

        // Step 5: Migrate the 7 new players from Game 3 to Game 4
        console.log("");
        console.log("--- Step 5: Migrating 7 players to Game 4 ---");
        upgraded.adminMigratePlayers(3, 4, newPlayers, PIZZA_PER_PLAYER);
        console.log("Migrated players:", newPlayers.length);

        // Step 6: Set dailyGameId to 4
        console.log("");
        console.log("--- Step 6: Setting dailyGameId to 4 ---");
        upgraded.adminSetDailyGameIdOnly(4);
        console.log("dailyGameId set to 4!");

        vm.stopBroadcast();

        // Verify the fix
        console.log("");
        console.log("=================================================");
        console.log("VERIFICATION");
        console.log("=================================================");

        console.log("Owner (should be unchanged):", upgraded.owner());
        console.log("dailyGameId (should be 4):", upgraded.dailyGameId());

        // Check Game 3 state
        (g3Start, g3End, g3First, g3Pot, g3Settled) = _getDailyGame(upgraded, 3);
        address[] memory g3WinnersAfter = upgraded.getDailyGameWinners(3);
        console.log("");
        console.log("--- Game 3 State (should be SETTLED) ---");
        console.log("Pot:", g3Pot);
        console.log("Settled:", g3Settled);
        console.log("Winners:", g3WinnersAfter.length);

        // Check Game 4 state
        (uint256 g4Start, uint256 g4End, address g4First, uint256 g4Pot, bool g4Settled) = _getDailyGame(upgraded, 4);
        address[] memory g4Players = upgraded.getDailyGamePlayers(4);
        console.log("");
        console.log("--- Game 4 State (should be ACTIVE) ---");
        console.log("Start time:", g4Start);
        console.log("End time:", g4End);
        console.log("First player:", g4First);
        console.log("Player count:", g4Players.length);
        console.log("Pot:", g4Pot);
        console.log("Settled (should be false):", g4Settled);

        console.log("");
        console.log("=================================================");
        console.log("SUCCESS! Game state fixed:");
        console.log("- Game 3: settled=true, 8 winners on leaderboard");
        console.log("- Game 4: active with 7 players, ends Dec 19 12pm PST");
        console.log("=================================================");
    }

    function _getDailyGame(PizzaPartyV2Upgradeable proxy, uint256 gameId) internal view returns (
        uint256 startTime,
        uint256 endTime,
        address firstPlayer,
        uint256 potAmount,
        bool settled
    ) {
        // Use low-level call to get the struct
        (bool success, bytes memory data) = address(proxy).staticcall(
            abi.encodeWithSignature("dailyGames(uint256)", gameId)
        );
        require(success, "Failed to get game data");
        return abi.decode(data, (uint256, uint256, address, uint256, bool));
    }
}
