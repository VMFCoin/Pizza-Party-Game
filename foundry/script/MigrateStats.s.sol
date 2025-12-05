// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IPizzaParty {
    struct PlayerLifetimeStats {
        uint256 totalDailyWins;
        uint256 totalWeeklyWins;
        uint256 totalVmfWon;
        uint256 lifetimeToppings;
        uint256 lifetimeReferrals;
    }

    function migratePlayerStats(
        address[] calldata players,
        PlayerLifetimeStats[] calldata stats
    ) external;

    function playerStats(address player) external view returns (
        uint256 totalDailyWins,
        uint256 totalWeeklyWins,
        uint256 totalVmfWon,
        uint256 lifetimeToppings,
        uint256 lifetimeReferrals
    );
}

contract MigrateStats is Script {
    // Current PizzaParty contract
    address constant PIZZA_PARTY = 0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        // Add 0x prefix if missing
        string memory prefixedKey = string(abi.encodePacked("0x", keyStr));
        uint256 deployerPrivateKey = vm.parseUint(prefixedKey);

        // ============================================
        // COMBINED STATS FROM ALL 4 CONTRACTS
        // ============================================
        // Data collected from:
        // - 0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7 (Original)
        // - 0xC24449caEf85f2abEdB879be5e0b1e5864839D73 (Second)
        // - 0x5c3aaD450F0014292Ff363b2147e6571b16c8035 (Third)
        // - 0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB (Current)

        address[] memory players = new address[](16);
        players[0]  = 0x9157Feb12812b253e84447C6B52C38651fd67FcA;
        players[1]  = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765;
        players[2]  = 0xdf13d712d58EF7F7Abd4D29B398d503262ba4AC0;
        players[3]  = 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66;
        players[4]  = 0x65e3419E633833Df1D602e7905Cb9C7e541f0849;
        players[5]  = 0xD68C5493e41F03faC90776ad0366376E245255E8;
        players[6]  = 0xC77dA8cB158BA77BaC765625745a766Af3111A69;
        players[7]  = 0x108608F3f993bfd55Fab50D9EF1a5C7E2C47f29B;
        players[8]  = 0xffde42d40175b3b9349Dfb384439dCB811691E09;
        players[9]  = 0x1B49689db12080f5FcC5DC36f990599739487566;
        players[10] = 0xACBf90a3F03A34faA8235854Ca6c3Ee0cC8c7546;
        players[11] = 0x12e31f706010AE0996A2D8247c432d9102e3c871;
        players[12] = 0x14E8FddFa4a7c709C19a8C7DA5205c3ae366355c;
        players[13] = 0x86E36C9Ba3C6A2542Fd761bC2b4FD61A110ea6CD;
        players[14] = 0x802F18765D6945b82075241e40b6214331ca3641;
        players[15] = 0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF;

        IPizzaParty.PlayerLifetimeStats[] memory stats = new IPizzaParty.PlayerLifetimeStats[](16);

        // Player 1: 0x9157feb12812b253e84447c6b52c38651fd67fca
        // Daily: 23, Weekly: 2, VMF: 2939.2, Toppings: 27, Referrals: 0
        stats[0] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 23,
            totalWeeklyWins: 2,
            totalVmfWon: 2939.2 ether,
            lifetimeToppings: 27,
            lifetimeReferrals: 0
        });

        // Player 2: 0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765
        // Daily: 20, Weekly: 2, VMF: 2399.6, Toppings: 27, Referrals: 0
        stats[1] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 20,
            totalWeeklyWins: 2,
            totalVmfWon: 2399.6 ether,
            lifetimeToppings: 27,
            lifetimeReferrals: 0
        });

        // Player 3: 0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0
        // Daily: 15, Weekly: 4, VMF: 1952.6, Toppings: 19, Referrals: 2
        stats[2] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 15,
            totalWeeklyWins: 4,
            totalVmfWon: 1952.6 ether,
            lifetimeToppings: 19,
            lifetimeReferrals: 2
        });

        // Player 4: 0x257cbe89968495c3ae8c81bccb8be7f257cd5f66
        // Daily: 14, Weekly: 4, VMF: 1849.7, Toppings: 17, Referrals: 12
        stats[3] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 14,
            totalWeeklyWins: 4,
            totalVmfWon: 1849.7 ether,
            lifetimeToppings: 17,
            lifetimeReferrals: 12
        });

        // Player 5: 0x65e3419e633833df1d602e7905cb9c7e541f0849
        // Daily: 15, Weekly: 2, VMF: 2251.4, Toppings: 16, Referrals: 0
        stats[4] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 15,
            totalWeeklyWins: 2,
            totalVmfWon: 2251.4 ether,
            lifetimeToppings: 16,
            lifetimeReferrals: 0
        });

        // Player 6: 0xd68c5493e41f03fac90776ad0366376e245255e8
        // Daily: 14, Weekly: 2, VMF: 2083.4, Toppings: 16, Referrals: 0
        stats[5] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 14,
            totalWeeklyWins: 2,
            totalVmfWon: 2083.4 ether,
            lifetimeToppings: 16,
            lifetimeReferrals: 0
        });

        // Player 7: 0xc77da8cb158ba77bac765625745a766af3111a69
        // Daily: 12, Weekly: 4, VMF: 1254.6, Toppings: 20, Referrals: 0
        stats[6] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 12,
            totalWeeklyWins: 4,
            totalVmfWon: 1254.6 ether,
            lifetimeToppings: 20,
            lifetimeReferrals: 0
        });

        // Player 8: 0x108608f3f993bfd55fab50d9ef1a5c7e2c47f29b
        // Daily: 8, Weekly: 2, VMF: 1206.2, Toppings: 12, Referrals: 0
        stats[7] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 8,
            totalWeeklyWins: 2,
            totalVmfWon: 1206.2 ether,
            lifetimeToppings: 12,
            lifetimeReferrals: 0
        });

        // Player 9: 0xffde42d40175b3b9349dfb384439dcb811691e09
        // Daily: 8, Weekly: 2, VMF: 1068.6, Toppings: 15, Referrals: 0
        stats[8] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 8,
            totalWeeklyWins: 2,
            totalVmfWon: 1068.6 ether,
            lifetimeToppings: 15,
            lifetimeReferrals: 0
        });

        // Player 10: 0x1b49689db12080f5fcc5dc36f990599739487566
        // Daily: 7, Weekly: 2, VMF: 1062.8, Toppings: 14, Referrals: 0
        stats[9] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 7,
            totalWeeklyWins: 2,
            totalVmfWon: 1062.8 ether,
            lifetimeToppings: 14,
            lifetimeReferrals: 0
        });

        // Player 11: 0xacbf90a3f03a34faa8235854ca6c3ee0cc8c7546
        // Daily: 4, Weekly: 2, VMF: 760.8, Toppings: 8, Referrals: 0
        stats[10] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 4,
            totalWeeklyWins: 2,
            totalVmfWon: 760.8 ether,
            lifetimeToppings: 8,
            lifetimeReferrals: 0
        });

        // Player 12: 0x12e31f706010ae0996a2d8247c432d9102e3c871
        // Daily: 4, Weekly: 1, VMF: 603.2, Toppings: 6, Referrals: 1
        stats[11] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 4,
            totalWeeklyWins: 1,
            totalVmfWon: 603.2 ether,
            lifetimeToppings: 6,
            lifetimeReferrals: 1
        });

        // Player 13: 0x14e8fddfa4a7c709c19a8c7da5205c3ae366355c
        // Daily: 3, Weekly: 0, VMF: 549.6, Toppings: 6, Referrals: 0
        stats[12] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 3,
            totalWeeklyWins: 0,
            totalVmfWon: 549.6 ether,
            lifetimeToppings: 6,
            lifetimeReferrals: 0
        });

        // Player 14: 0x86e36c9ba3c6a2542fd761bc2b4fd61a110ea6cd
        // Daily: 1, Weekly: 0, VMF: 128.8, Toppings: 3, Referrals: 0
        stats[13] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 1,
            totalWeeklyWins: 0,
            totalVmfWon: 128.8 ether,
            lifetimeToppings: 3,
            lifetimeReferrals: 0
        });

        // Player 15: 0x802f18765d6945b82075241e40b6214331ca3641
        // Daily: 1, Weekly: 0, VMF: 128.8, Toppings: 3, Referrals: 0
        stats[14] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 1,
            totalWeeklyWins: 0,
            totalVmfWon: 128.8 ether,
            lifetimeToppings: 3,
            lifetimeReferrals: 0
        });

        // Player 16: 0x46e9beef5dc68dff095eca56dadf90247f1af7ef
        // Daily: 1, Weekly: 0, VMF: 104.8, Toppings: 5, Referrals: 0
        stats[15] = IPizzaParty.PlayerLifetimeStats({
            totalDailyWins: 1,
            totalWeeklyWins: 0,
            totalVmfWon: 104.8 ether,
            lifetimeToppings: 5,
            lifetimeReferrals: 0
        });

        console.log("===========================================");
        console.log("MIGRATING STATS TO CURRENT CONTRACT");
        console.log("===========================================");
        console.log("Contract:", PIZZA_PARTY);
        console.log("Players to migrate:", players.length);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        IPizzaParty(PIZZA_PARTY).migratePlayerStats(players, stats);

        vm.stopBroadcast();

        console.log("===========================================");
        console.log("MIGRATION COMPLETE!");
        console.log("===========================================");

        // Verify migration
        console.log("\nVerifying migration...");
        for (uint256 i = 0; i < players.length; i++) {
            (uint256 daily, uint256 weekly, uint256 vmf, uint256 toppings, uint256 referrals) =
                IPizzaParty(PIZZA_PARTY).playerStats(players[i]);
            console.log("Player", i + 1);
            console.log("  Address:", players[i]);
            console.log("  Daily Wins:", daily);
            console.log("  Weekly Wins:", weekly);
            console.log("  VMF Won:", vmf / 1e18);
            console.log("  Toppings:", toppings);
            console.log("  Referrals:", referrals);
        }
    }
}
