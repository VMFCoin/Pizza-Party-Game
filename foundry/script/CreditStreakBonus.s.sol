// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract TempCredit is OwnableUpgradeable, UUPSUpgradeable {
    // Match storage layout exactly:
    // slots 0-6: pizzaToken, treasuryWallet, charityWallets, ownerFeeBPS, ownerFeeRecipient, noonPacificUtcHour, dailyGameId
    uint256[7] private __gap0_6;
    uint256 public weeklyGameId; // slot 7
    uint256[2] private __gap8_9; // currentDailyPot, holdingsUnitPizza
    mapping(uint256 => DailyGame) public dailyGames; // slot 10
    mapping(uint256 => WeeklyGame) public weeklyGames; // slot 11
    mapping(uint256 => mapping(address => bool)) public hasPlayedDaily; // slot 12
    mapping(uint256 => mapping(address => PlayerWeekly)) public weeklyPlayers; // slot 13
    mapping(address => PlayerLifetimeStats) public playerStats; // slot 14

    struct DailyGame { uint256 a; uint256 b; address c; address[] d; address[] e; uint256 f; bool g; }
    struct WeeklyGame { uint256 claimWindowStart; uint256 claimWindowEnd; uint256 totalClaimedToppings; address[] claimers; address[] winners; uint256 potAmount; bool settled; }
    struct PlayerWeekly { uint256 toppingsEarned; uint256 toppingsClaimed; uint256 dailyPlays; uint256 referralsUsed; bool hasClaimed; }
    struct PlayerLifetimeStats { uint256 a; uint256 b; uint256 c; uint256 lifetimeToppings; uint256 e; }

    event ToppingsEarned(uint256 indexed w, address indexed p, uint256 a, string r);

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function credit(address[] calldata p) external onlyOwner {
        uint256 w = weeklyGameId;
        for (uint256 i = 0; i < p.length; i++) {
            if (weeklyPlayers[w][p[i]].dailyPlays == 7 && weeklyPlayers[w][p[i]].toppingsEarned < 10) {
                weeklyPlayers[w][p[i]].toppingsEarned += 3;
                weeklyPlayers[w][p[i]].toppingsClaimed += 3;
                playerStats[p[i]].lifetimeToppings += 3;
                if (weeklyPlayers[w][p[i]].hasClaimed) {
                    weeklyGames[w].totalClaimedToppings += 3;
                }
                emit ToppingsEarned(w, p[i], 3, "streak");
            }
        }
    }
}

contract CreditStreakBonus is Script {
    address constant PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address[] memory p = new address[](2);
        p[0] = 0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF;
        p[1] = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765;

        console.log("Before:");
        (uint256 before,,,,,, ) = PizzaPartyV2Upgradeable(PROXY).getPlayerWeeklyInfo(p[0]);
        console.log("  toppingsEarned:", before);

        vm.startBroadcast(pk);
        TempCredit temp = new TempCredit();
        console.log("Temp impl:", address(temp));
        UUPSUpgradeable(PROXY).upgradeToAndCall(address(temp), "");
        TempCredit(PROXY).credit(p);
        PizzaPartyV2Upgradeable fin = new PizzaPartyV2Upgradeable();
        console.log("Final impl:", address(fin));
        UUPSUpgradeable(PROXY).upgradeToAndCall(address(fin), "");
        vm.stopBroadcast();

        console.log("After:");
        (uint256 after_,,,,,, ) = PizzaPartyV2Upgradeable(PROXY).getPlayerWeeklyInfo(p[0]);
        console.log("  toppingsEarned:", after_);
    }
}
