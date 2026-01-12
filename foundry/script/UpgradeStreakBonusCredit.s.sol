// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IPizzaParty {
    function owner() external view returns (address);
    function weeklyGameId() external view returns (uint256);
    function getPlayerWeeklyInfo(address player) external view returns (
        uint256 toppingsEarned,
        uint256 toppingsClaimed,
        uint256 dailyPlays,
        uint256 referralsUsed,
        bool hasClaimed,
        uint256 projectedHoldingsBonus
    );
}

// Temporary contract with credit function - will be upgraded again immediately
contract PizzaPartyWithCredit {
    // Storage layout must match - we only need access to weeklyPlayers and playerStats
    // Simplified: just add a one-time credit function that writes directly

    mapping(uint256 => mapping(address => PlayerWeekly)) public weeklyPlayers;
    mapping(address => PlayerLifetimeStats) public playerStats;
    uint256 public weeklyGameId;

    struct PlayerWeekly {
        uint256 toppingsEarned;
        uint256 toppingsClaimed;
        uint256 dailyPlays;
        uint256 referralsUsed;
        bool hasClaimed;
    }

    struct PlayerLifetimeStats {
        uint256 totalDailyWins;
        uint256 totalWeeklyWins;
        uint256 totalPizzaWon;
        uint256 lifetimeToppings;
        uint256 lifetimeReferrals;
    }

    event ToppingsEarned(uint256 indexed weekId, address indexed player, uint256 amount, string reason);

    function creditStreakBonus(address[] calldata players) external {
        uint256 weekId = weeklyGameId;
        for (uint256 i = 0; i < players.length; i++) {
            if (weeklyPlayers[weekId][players[i]].dailyPlays == 7) {
                weeklyPlayers[weekId][players[i]].toppingsEarned += 3;
                playerStats[players[i]].lifetimeToppings += 3;
                emit ToppingsEarned(weekId, players[i], 3, "streak_bonus_credit");
            }
        }
    }
}

contract UpgradeStreakBonusCredit is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console.log("=== Credit Missing Streak Bonuses ===");

        // Get players with 7 daily plays who need credit
        // For now just credit the user who reported: 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66
        address[] memory playersToCredit = new address[](1);
        playersToCredit[0] = 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66;

        vm.startBroadcast(deployerPrivateKey);

        // Just call creditStreakBonus directly on proxy using low-level call
        // This works because the current implementation has the streak bonus logic
        // We just need to add the 3 toppings to players who already have 7 dailyPlays

        // Actually, simpler: deploy temp impl with credit function, credit, then upgrade back
        // But that's complex. Let's just use cast to write directly to storage

        vm.stopBroadcast();

        console.log("Use cast to credit directly");
    }
}
