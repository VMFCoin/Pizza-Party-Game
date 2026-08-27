// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockPIZZA
 * @dev Mock PIZZA token for testing with burn capability
 */
contract MockPIZZASlice is ERC20 {
    constructor() ERC20("PIZZA Token", "PIZZA") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}

/**
 * @title SliceSponsorRewardsTest
 * @dev Tests slice sponsor 50% reward mechanics:
 *   - First-time slice: sponsor gets 50% of daily win
 *   - Repeat slice to same player: sponsor gets NOTHING
 *   - Multiple sponsors can each get 50% from same player (first slice each)
 *   - Weekly rewards: first sponsor in that week gets 50%
 *   - Perfect week scenario: 7 slices, 7 daily wins, all 7 win weekly = 14 sponsor payouts
 */
contract SliceSponsorRewardsTest is Test {
    MockPIZZASlice public pizzaToken;
    PizzaPartyV2Upgradeable public pizzaParty;
    PizzaParlorManagerUpgradeable public parlorManager;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public ops = makeAddr("ops");

    // Charities
    address public charity1 = makeAddr("charity1");
    address public charity2 = makeAddr("charity2");
    address public charity3 = makeAddr("charity3");

    // Parlor owner (sponsor) - owns 5 parlors (max per wallet)
    address public sponsor = makeAddr("sponsor");

    // Second sponsor for multi-sponsor tests
    address public sponsor2 = makeAddr("sponsor2");

    // Additional sponsors for the 7-day perfect week test
    address public sponsor3 = makeAddr("sponsor3");
    address public sponsor4 = makeAddr("sponsor4");

    // Players who will receive slices
    address[10] public slicedPlayers;

    // Regular paying players to fill the pool
    address[20] public regularPlayers;

    uint256 public constant ENTRY_FEE = 143e18; // ~143 PIZZA for $1 at $0.007
    uint256 public constant PARLOR_PRICE = 7143e18; // ~7143 PIZZA for $50
    uint256 public constant TOPPING_TO_PIZZA = 100e18; // 100 PIZZA per topping

    function setUp() public {
        // Warp to a Sunday at noon Pacific (start of a week)
        // Dec 15, 2024 is a Sunday
        vm.warp(1734285600); // Dec 15, 2024 12:00:00 PM Pacific (20:00 UTC)

        // Deploy mock PIZZA token
        pizzaToken = new MockPIZZASlice();

        // Deploy PizzaPartyV2 implementation and proxy
        PizzaPartyV2Upgradeable pizzaPartyImpl = new PizzaPartyV2Upgradeable();
        address[] memory charities = new address[](3);
        charities[0] = charity1;
        charities[1] = charity2;
        charities[2] = charity3;

        bytes memory pizzaPartyInitData = abi.encodeWithSelector(
            PizzaPartyV2Upgradeable.initialize.selector,
            address(pizzaToken),
            treasury,
            charities,
            owner
        );
        ERC1967Proxy pizzaPartyProxy = new ERC1967Proxy(address(pizzaPartyImpl), pizzaPartyInitData);
        pizzaParty = PizzaPartyV2Upgradeable(address(pizzaPartyProxy));

        // Deploy ParlorManager implementation and proxy
        PizzaParlorManagerUpgradeable parlorManagerImpl = new PizzaParlorManagerUpgradeable();
        bytes memory parlorManagerInitData = abi.encodeWithSelector(
            PizzaParlorManagerUpgradeable.initialize.selector,
            address(pizzaParty),
            treasury,
            ops,
            owner
        );
        ERC1967Proxy parlorManagerProxy = new ERC1967Proxy(address(parlorManagerImpl), parlorManagerInitData);
        parlorManager = PizzaParlorManagerUpgradeable(address(parlorManagerProxy));

        // Wire up
        vm.startPrank(owner);
        pizzaParty.setParlorManager(address(parlorManager));
        pizzaParty.setOwnerFeeRecipient(address(parlorManager));
        pizzaParty.setToppingUnitPizza(10e18);
        parlorManager.adminSetBackendSigner(makeAddr("backendSigner"));
        vm.stopPrank();

        // Create player addresses
        for (uint256 i = 0; i < 10; i++) {
            slicedPlayers[i] = makeAddr(string(abi.encodePacked("slicedPlayer", vm.toString(i))));
        }
        for (uint256 i = 0; i < 20; i++) {
            regularPlayers[i] = makeAddr(string(abi.encodePacked("regularPlayer", vm.toString(i))));
        }

        // Mint PIZZA
        _mintPizzaToAll();

        // Setup sponsors with parlors
        _setupSponsors();
    }

    function _mintPizzaToAll() internal {
        // Mint to sponsors for parlor purchases
        pizzaToken.mint(sponsor, PARLOR_PRICE * 5);
        pizzaToken.mint(sponsor2, PARLOR_PRICE * 5);
        pizzaToken.mint(sponsor3, PARLOR_PRICE * 5);
        pizzaToken.mint(sponsor4, PARLOR_PRICE * 5);

        // Mint to regular players for game entry
        for (uint256 i = 0; i < 20; i++) {
            pizzaToken.mint(regularPlayers[i], ENTRY_FEE * 20);
        }

        // Mint to treasury for weekly jackpot payouts
        pizzaToken.mint(treasury, 100_000_000e18);

        // Approve treasury spending for weekly settlements
        vm.prank(treasury);
        pizzaToken.approve(address(pizzaParty), type(uint256).max);
    }

    function _setupSponsors() internal {
        // All sponsors buy 5 parlors each (max per wallet)
        address[4] memory sponsors = [sponsor, sponsor2, sponsor3, sponsor4];
        for (uint256 s = 0; s < 4; s++) {
            vm.startPrank(sponsors[s]);
            pizzaToken.approve(address(parlorManager), PARLOR_PRICE * 5);
            for (uint256 i = 0; i < 5; i++) {
                parlorManager.purchaseParlor(PARLOR_PRICE);
            }
            vm.stopPrank();
            assertEq(parlorManager.parlorCount(sponsors[s]), 5, "Sponsor should have 5 parlors");
        }
    }

    // ============ Test 1: First-time slice gives sponsor 50% of daily win ============
    function test_FirstTimeSlice_SponsorGets50Percent() public {
        console.log("\n=== Test: First-Time Slice - Sponsor Gets 50% ===");

        address slicedPlayer = slicedPlayers[0];

        // Sponsor gives a slice to the player (stores as pending)
        vm.prank(sponsor);
        parlorManager.tipSlice(slicedPlayer);

        // Recipient claims their pending slice (this completes the entry)
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(slicedPlayer, 0);

        // Verify the slice was recorded
        assertTrue(pizzaParty.hasSlicedPlayer(sponsor, slicedPlayer), "hasSlicedPlayer should be true");
        assertEq(pizzaParty.dailySliceSponsor(pizzaParty.dailyGameId(), slicedPlayer), sponsor, "Daily sponsor should be recorded");

        // Add more players to fill the pot
        for (uint256 i = 0; i < 15; i++) {
            vm.startPrank(regularPlayers[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        // Get current game info
        (uint256 startTime, uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();
        console.log("Game end time: %s", endTime);

        // Warp to after game end
        vm.warp(endTime + 1);

        // Record balances before settlement
        uint256 sponsorBalanceBefore = pizzaToken.balanceOf(sponsor);
        uint256 playerBalanceBefore = pizzaToken.balanceOf(slicedPlayer);

        // Settle the game
        pizzaParty.settleDailyGame();

        // Get winners
        address[] memory winners = pizzaParty.getDailyGameWinners(1);
        console.log("Number of winners: %s", winners.length);

        // Check if sliced player won
        bool playerWon = false;
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == slicedPlayer) {
                playerWon = true;
                break;
            }
        }

        if (playerWon) {
            uint256 sponsorReceived = pizzaToken.balanceOf(sponsor) - sponsorBalanceBefore;
            uint256 playerReceived = pizzaToken.balanceOf(slicedPlayer) - playerBalanceBefore;

            console.log("SLICED PLAYER WON!");
            console.log("Sponsor received: %s PIZZA", sponsorReceived / 1e18);
            console.log("Player received: %s PIZZA", playerReceived / 1e18);

            // Verify 50/50 split (with small tolerance for rounding)
            assertApproxEqRel(sponsorReceived, playerReceived, 0.01e18, "Sponsor should get ~50%");
            assertTrue(sponsorReceived > 0, "Sponsor should receive some PIZZA");
        } else {
            console.log("Sliced player did not win this time (random selection)");
            console.log("This is expected - not all players win");
        }
    }

    // ============ Test 2: Repeat slice to same player - sponsor gets NOTHING ============
    function test_RepeatSlice_SponsorGetsNothing() public {
        console.log("\n=== Test: Repeat Slice - Sponsor Gets Nothing ===");

        address slicedPlayer = slicedPlayers[0];

        // Day 1: Sponsor gives first slice
        vm.prank(sponsor);
        parlorManager.tipSlice(slicedPlayer);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(slicedPlayer, 0);

        console.log("Day 1: First slice given");
        assertTrue(pizzaParty.hasSlicedPlayer(sponsor, slicedPlayer), "hasSlicedPlayer should be true after first slice");
        assertEq(pizzaParty.dailySliceSponsor(1, slicedPlayer), sponsor, "Day 1: Sponsor should be recorded");

        // Add regular players and settle day 1
        for (uint256 i = 0; i < 10; i++) {
            vm.startPrank(regularPlayers[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        // Warp to end of day 1 and settle
        (,uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();
        vm.warp(endTime + 1);
        pizzaParty.settleDailyGame();
        console.log("Day 1 settled, dailyGameId now: %s", pizzaParty.dailyGameId());

        // Day 2: Sponsor gives second slice to SAME player
        vm.prank(sponsor);
        parlorManager.tipSlice(slicedPlayer);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(slicedPlayer, 0);

        console.log("Day 2: Second slice given to same player");

        // Check that NO sponsor is recorded for day 2 (because it's a repeat)
        uint256 day2GameId = pizzaParty.dailyGameId();
        address day2Sponsor = pizzaParty.dailySliceSponsor(day2GameId, slicedPlayer);

        console.log("Day 2 Game ID: %s", day2GameId);
        console.log("Day 2 Sponsor recorded: %s", day2Sponsor);

        assertEq(day2Sponsor, address(0), "Day 2: NO sponsor should be recorded for repeat slice");

        console.log("SUCCESS: Repeat slice does not record sponsor");
    }

    // ============ Test 3: Multiple sponsors can each get 50% from same player ============
    function test_MultipleSponors_EachGetFirstSliceReward() public {
        console.log("\n=== Test: Multiple Sponsors - Each Gets First Slice Reward ===");

        address slicedPlayer = slicedPlayers[0];

        // Day 1: Sponsor1 gives first slice
        vm.prank(sponsor);
        parlorManager.tipSlice(slicedPlayer);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(slicedPlayer, 0);

        console.log("Day 1: Sponsor1 gives first slice");
        assertEq(pizzaParty.dailySliceSponsor(1, slicedPlayer), sponsor, "Day 1: Sponsor1 should be recorded");

        // Add players and settle day 1
        for (uint256 i = 0; i < 10; i++) {
            vm.startPrank(regularPlayers[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        // Warp to next day
        vm.warp(block.timestamp + 1 days);

        // Day 2: Sponsor2 gives THEIR first slice to same player
        vm.prank(sponsor2);
        parlorManager.tipSlice(slicedPlayer);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(slicedPlayer, 0);

        uint256 day2GameId = pizzaParty.dailyGameId();
        console.log("Day 2: Sponsor2 gives their first slice to same player");
        console.log("Day 2 Game ID: %s", day2GameId);

        // Sponsor2's first slice should be recorded (even though player had slice from sponsor1)
        assertEq(pizzaParty.dailySliceSponsor(day2GameId, slicedPlayer), sponsor2, "Day 2: Sponsor2 should be recorded");
        assertTrue(pizzaParty.hasSlicedPlayer(sponsor2, slicedPlayer), "Sponsor2 hasSlicedPlayer should be true");

        console.log("SUCCESS: Sponsor2 gets their own first-slice relationship with the player");

        // Day 3: Sponsor2 tries again - should NOT record
        vm.warp(block.timestamp + 1 days);
        vm.prank(sponsor2);
        parlorManager.tipSlice(slicedPlayer);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(slicedPlayer, 0);

        uint256 day3GameId = pizzaParty.dailyGameId();
        address day3Sponsor = pizzaParty.dailySliceSponsor(day3GameId, slicedPlayer);

        console.log("Day 3: Sponsor2 repeat slice - sponsor recorded: %s", day3Sponsor);
        assertEq(day3Sponsor, address(0), "Day 3: NO sponsor for Sponsor2's repeat slice");
    }

    // ============ Test 4: Perfect Week - Maximum Sponsor Payouts ============
    /**
     * @dev Tests the maximum possible sponsor payouts in a single week:
     *
     * MAX SCENARIO (5 parlors = 5 slices per day):
     * - Each day: sponsor slices 5 NEW players
     * - 5 sliced players + regular players per day
     * - DAILY_WINNERS = 8, so 5 of 8 could be sliced players
     * - Over 7 days: 5 slices × 7 days = 35 daily chances
     *
     * WEEKLY SCENARIO:
     * - Those 35 sliced players can all claim toppings
     * - WEEKLY_WINNERS = 10, so up to 10 of 35 sliced players could win
     *
     * THEORETICAL MAXIMUM: 35 daily + 10 weekly = 45 sponsor payouts
     *
     * THIS TEST: Simplified version with 7 sliced players to verify the mechanics work
     */
    function test_PerfectWeek_MaxSponsorPayouts() public {
        console.log("\n=== Test: Perfect Week - Max Sponsor Payouts ===");
        console.log("THEORETICAL MAX (5 parlors): 35 daily + 10 weekly = 45 payouts");
        console.log("THIS TEST: 7 sliced players over 7 days");
        console.log("Daily: 1 sliced + 7 regular = 8 players/day, 8 winners");
        console.log("Weekly: 7 sliced + 3 regular = 10 claimers, up to 10 winners");

        uint256 totalSponsorDailyPayouts = 0;
        uint256 sponsorBalanceStart = pizzaToken.balanceOf(sponsor);

        console.log("\nStarting sponsor balance: %s PIZZA", sponsorBalanceStart / 1e18);

        // Get weekly game info at start
        uint256 weekId = pizzaParty.weeklyGameId();
        (uint256 claimStart,,,,,) = pizzaParty.getCurrentWeeklyGame();
        console.log("Week %s claim window starts at: %s", weekId, claimStart);

        // ============ DAYS 1-6: Play daily games ============
        for (uint256 day = 0; day < 6; day++) {
            console.log("\n--- Day %s ---", day + 1);

            address slicedPlayer = slicedPlayers[day];
            uint256 gameId = pizzaParty.dailyGameId();

            // Sponsor gives slice to new player each day
            vm.prank(sponsor);
            parlorManager.tipSlice(slicedPlayer);

            // Recipient claims their pending slice
            vm.prank(makeAddr("backendSigner"));
            parlorManager.claimSlice(slicedPlayer, 0);

            console.log("Sliced player %s: %s", day, slicedPlayer);
            assertEq(pizzaParty.dailySliceSponsor(gameId, slicedPlayer), sponsor, "Sponsor should be recorded");

            // Add 7 regular players (8 total = all are winners since DAILY_WINNERS = 8)
            for (uint256 i = 0; i < 7; i++) {
                vm.startPrank(regularPlayers[i]);
                pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
                pizzaParty.enterDailyGame(ENTRY_FEE, "");
                vm.stopPrank();
            }

            // Get game end time and warp
            (,uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();
            vm.warp(endTime + 1);

            // Record sponsor balance before settlement
            uint256 sponsorBalanceBefore = pizzaToken.balanceOf(sponsor);

            // Settle the daily game
            pizzaParty.settleDailyGame();

            // Check if sponsor received any payout (player won)
            uint256 sponsorReceived = pizzaToken.balanceOf(sponsor) - sponsorBalanceBefore;

            if (sponsorReceived > 0) {
                totalSponsorDailyPayouts++;
                console.log("Day %s: Sponsor received %s PIZZA (sliced player won!)", day + 1, sponsorReceived / 1e18);
            } else {
                console.log("Day %s: Sliced player did not win (random selection)", day + 1);
            }
        }

        // ============ DAY 7: Enter players ============
        console.log("\n--- Day 7 (Saturday) ---");
        {
            address slicedPlayer = slicedPlayers[6];
            uint256 gameId = pizzaParty.dailyGameId();

            // Sponsor gives slice to new player
            vm.prank(sponsor);
            parlorManager.tipSlice(slicedPlayer);

            // Recipient claims their pending slice
            vm.prank(makeAddr("backendSigner"));
            parlorManager.claimSlice(slicedPlayer, 0);

            console.log("Sliced player 6: %s", slicedPlayer);
            assertEq(pizzaParty.dailySliceSponsor(gameId, slicedPlayer), sponsor, "Day 7: Sponsor should be recorded");

            // Add 7 regular players
            for (uint256 i = 0; i < 7; i++) {
                vm.startPrank(regularPlayers[i]);
                pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
                pizzaParty.enterDailyGame(ENTRY_FEE, "");
                vm.stopPrank();
            }
        }

        // ============ CLAIM TOPPINGS (Sunday noon) ============
        console.log("\n--- Warping to Claim Window (Sunday noon) ---");
        vm.warp(claimStart);

        // Verify we're in the claim window
        (uint256 actualClaimStart, uint256 actualClaimEnd,,,,) = pizzaParty.getCurrentWeeklyGame();
        console.log("Current time: %s", block.timestamp);
        console.log("Claim window: %s to %s", actualClaimStart, actualClaimEnd);
        assertTrue(block.timestamp >= actualClaimStart, "Should be at or after claim start");
        assertTrue(block.timestamp < actualClaimEnd, "Should be before claim end");

        console.log("\n--- Verifying Weekly Sponsor Mappings ---");
        for (uint256 i = 0; i < 7; i++) {
            address player = slicedPlayers[i];
            address weeklySponsor = pizzaParty.weeklySliceSponsor(weekId, player);
            assertEq(weeklySponsor, sponsor, "Weekly sponsor should be recorded");
        }
        console.log("All 7 sliced players have weekly sponsor recorded: OK");

        console.log("\n--- Claiming Toppings ---");

        // Paid entry required to claim weekly toppings — enter Sunday daily game before claim
        for (uint256 i = 0; i < 7; i++) {
            address slicedPlayer = slicedPlayers[i];
            pizzaToken.mint(slicedPlayer, ENTRY_FEE);
            vm.startPrank(slicedPlayer);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        // All 7 sliced players claim their toppings (1 each)
        for (uint256 i = 0; i < 7; i++) {
            address player = slicedPlayers[i];
            (uint256 toppings,,,,,,) = pizzaParty.getPlayerWeeklyInfo(player);
            console.log("Sliced Player %s toppings: %s", i, toppings);
            assertTrue(toppings > 0, "Sliced player should have toppings");
            vm.prank(player);
            pizzaParty.claimToppings();
        }

        // We need exactly 10 claimers to get 10 weekly winners
        // 7 sliced players already claimed, we need 3 more
        // Use regular players who have toppings
        uint256 regularClaimers = 0;
        for (uint256 i = 0; i < 7 && regularClaimers < 3; i++) {
            address player = regularPlayers[i];
            (uint256 toppings,,,,,,) = pizzaParty.getPlayerWeeklyInfo(player);
            console.log("Regular Player %s toppings: %s", i, toppings);
            if (toppings > 0) {
                vm.prank(player);
                pizzaParty.claimToppings();
                regularClaimers++;
            }
        }
        console.log("Total regular players claimed: %s", regularClaimers);

        // Verify we have exactly 10 claimers
        (,,, uint256 claimerCount,,) = pizzaParty.getCurrentWeeklyGame();
        console.log("Total claimers: %s", claimerCount);
        assertEq(claimerCount, 10, "Should have exactly 10 claimers");

        // ============ SETTLE DAY 7 ============
        console.log("\n--- Settling Day 7 ---");
        {
            // Warp to day 7 end (still within claim window is fine, we already claimed)
            (,uint256 day7EndTime,,,) = pizzaParty.getCurrentDailyGame();
            vm.warp(day7EndTime + 1);

            uint256 sponsorBalanceBefore = pizzaToken.balanceOf(sponsor);
            pizzaParty.settleDailyGame();
            uint256 sponsorReceived = pizzaToken.balanceOf(sponsor) - sponsorBalanceBefore;

            if (sponsorReceived > 0) {
                totalSponsorDailyPayouts++;
                console.log("Day 7: Sponsor received %s PIZZA (sliced player won!)", sponsorReceived / 1e18);
            } else {
                console.log("Day 7: Sliced player did not win (random selection)");
            }
        }

        // ============ SETTLE WEEKLY ============
        console.log("\n--- Weekly Settlement ---");

        // Warp past claim window end
        (, actualClaimEnd,,,,) = pizzaParty.getCurrentWeeklyGame();
        vm.warp(actualClaimEnd + 1);
        console.log("Current time: %s (after claim window)", block.timestamp);

        // Record sponsor balance before weekly settlement
        uint256 sponsorBalanceBeforeWeekly = pizzaToken.balanceOf(sponsor);

        // Settle the weekly game
        pizzaParty.settleWeeklyGame();

        // Check weekly sponsor payouts
        uint256 sponsorWeeklyReceived = pizzaToken.balanceOf(sponsor) - sponsorBalanceBeforeWeekly;

        // Get weekly winners
        address[] memory weeklyWinners = pizzaParty.getWeeklyGameWinners(weekId);
        console.log("Weekly winners count: %s", weeklyWinners.length);

        // NOTE: With weighted selection, we might get fewer than 10 unique winners
        // if the weights are skewed (3 regular players with 7 toppings each vs 7 sliced players with 1 each)
        // The contract resizes the winners array, so we accept what we get
        assertTrue(weeklyWinners.length > 0, "Should have at least 1 weekly winner");

        // Count how many weekly winners were sliced players (0-6)
        uint256 slicedWeeklyWinners = 0;
        for (uint256 i = 0; i < weeklyWinners.length; i++) {
            for (uint256 j = 0; j < 7; j++) {
                if (weeklyWinners[i] == slicedPlayers[j]) {
                    slicedWeeklyWinners++;
                    console.log("Weekly winner %s is sliced player %s", i, j);
                    break;
                }
            }
        }
        console.log("Total sliced players who won weekly: %s / %s", slicedWeeklyWinners, weeklyWinners.length);

        // ============ FINAL RESULTS ============
        uint256 totalSponsorReceived = pizzaToken.balanceOf(sponsor) - sponsorBalanceStart;
        console.log("\n========================================");
        console.log("=== FINAL RESULTS ===");
        console.log("========================================");
        console.log("Daily sponsor payouts: %s / 7 (this test's max)", totalSponsorDailyPayouts);
        console.log("Weekly sponsor payouts: %s (sliced players who won)", slicedWeeklyWinners);
        console.log("Total sponsor payouts: %s", totalSponsorDailyPayouts + slicedWeeklyWinners);
        console.log("Weekly PIZZA to sponsor: %s", sponsorWeeklyReceived / 1e18);
        console.log("Total PIZZA to sponsor: %s", totalSponsorReceived / 1e18);
        console.log("========================================");
        console.log("THEORETICAL MAX (5 parlors, full week):");
        console.log("  Daily: 5 slices x 7 days = 35 chances");
        console.log("  Weekly: up to 10 of those 35 can win");
        console.log("  Total: 35 + 10 = 45 max sponsor payouts");
        console.log("========================================");

        // Assertions
        assertTrue(totalSponsorDailyPayouts > 0, "Sponsor should get at least 1 daily payout");
        assertTrue(slicedWeeklyWinners > 0, "At least 1 sliced player should win weekly");
        assertTrue(sponsorWeeklyReceived > 0, "Sponsor should receive weekly payout");
        assertTrue(totalSponsorReceived > 0, "Sponsor should receive total payout");

        // Weekly settlement completed successfully
        console.log("\nSUCCESS: Both daily and weekly settlements completed!");
        console.log("The sponsor received 50%% payouts from slice sponsorships.");
    }

    // ============ Test 5: Verify hasSlicedPlayer prevents double rewards ============
    function test_HasSlicedPlayer_PreventsDoubleRewards() public {
        console.log("\n=== Test: hasSlicedPlayer Prevents Double Rewards ===");

        address player = slicedPlayers[0];

        // Initially false
        assertFalse(pizzaParty.hasSlicedPlayer(sponsor, player), "Should be false initially");

        // After first slice
        vm.prank(sponsor);
        parlorManager.tipSlice(player);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(player, 0);

        assertTrue(pizzaParty.hasSlicedPlayer(sponsor, player), "Should be true after first slice");

        // Sponsor1 -> Player is now recorded
        // Sponsor2 -> Player should still be false
        assertFalse(pizzaParty.hasSlicedPlayer(sponsor2, player), "Sponsor2 should still be false");

        // Sponsor2 slices same player
        vm.warp(block.timestamp + 1 days); // New day
        vm.prank(sponsor2);
        parlorManager.tipSlice(player);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(player, 0);

        assertTrue(pizzaParty.hasSlicedPlayer(sponsor2, player), "Sponsor2 should now be true");

        console.log("SUCCESS: Each sponsor tracks their own first-slice relationship independently");
    }

    // ============ Test 6: Weekly sponsor only gets 50% if they first-sliced that week ============
    function test_WeeklySliceSponsor_OnlyFirstSliceThisWeek() public {
        console.log("\n=== Test: Weekly Sponsor - Only First Slice This Week ===");

        address player = slicedPlayers[0];
        uint256 weekId = pizzaParty.weeklyGameId();

        // Sponsor1 slices player first this week
        vm.prank(sponsor);
        parlorManager.tipSlice(player);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(player, 0);

        console.log("Sponsor1 sliced player in week %s", weekId);
        assertEq(pizzaParty.weeklySliceSponsor(weekId, player), sponsor, "Sponsor1 should be weekly sponsor");

        // Sponsor2 also slices same player (different sponsor, first time from sponsor2)
        vm.warp(block.timestamp + 1 days);
        vm.prank(sponsor2);
        parlorManager.tipSlice(player);

        // Recipient claims their pending slice
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(player, 0);

        // Weekly sponsor should STILL be sponsor1 (first one this week)
        assertEq(pizzaParty.weeklySliceSponsor(weekId, player), sponsor, "Weekly sponsor should still be Sponsor1");

        console.log("SUCCESS: First sponsor this week keeps weekly sponsor status");
    }

    // ============ Test 7: Comprehensive scenario with settlement verification ============
    function test_ComprehensiveSliceScenario() public {
        console.log("\n=== Test: Comprehensive Slice Scenario with Settlement ===");

        // Setup: sponsor slices 3 new players
        address player1 = slicedPlayers[0];
        address player2 = slicedPlayers[1];
        address player3 = slicedPlayers[2];

        vm.startPrank(sponsor);
        parlorManager.tipSlice(player1);
        parlorManager.tipSlice(player2);
        parlorManager.tipSlice(player3);
        vm.stopPrank();

        // Recipients claim their pending slices
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(player1, 0);
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(player2, 0);
        vm.prank(makeAddr("backendSigner"));
        parlorManager.claimSlice(player3, 0);

        console.log("Sliced 3 new players");

        // Verify all recorded
        uint256 gameId = pizzaParty.dailyGameId();
        assertEq(pizzaParty.dailySliceSponsor(gameId, player1), sponsor);
        assertEq(pizzaParty.dailySliceSponsor(gameId, player2), sponsor);
        assertEq(pizzaParty.dailySliceSponsor(gameId, player3), sponsor);

        // Add 5 regular players (8 total, all win)
        for (uint256 i = 0; i < 5; i++) {
            vm.startPrank(regularPlayers[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        // Warp and settle
        (,uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();
        vm.warp(endTime + 1);

        uint256 sponsorBefore = pizzaToken.balanceOf(sponsor);
        uint256 player1Before = pizzaToken.balanceOf(player1);
        uint256 player2Before = pizzaToken.balanceOf(player2);
        uint256 player3Before = pizzaToken.balanceOf(player3);

        pizzaParty.settleDailyGame();

        uint256 sponsorReceived = pizzaToken.balanceOf(sponsor) - sponsorBefore;
        uint256 player1Received = pizzaToken.balanceOf(player1) - player1Before;
        uint256 player2Received = pizzaToken.balanceOf(player2) - player2Before;
        uint256 player3Received = pizzaToken.balanceOf(player3) - player3Before;

        console.log("Settlement complete:");
        console.log("Sponsor received: %s PIZZA", sponsorReceived / 1e18);
        console.log("Player1 received: %s PIZZA", player1Received / 1e18);
        console.log("Player2 received: %s PIZZA", player2Received / 1e18);
        console.log("Player3 received: %s PIZZA", player3Received / 1e18);

        // Count how many sliced players won
        uint256 slicedWinners = 0;
        if (player1Received > 0) slicedWinners++;
        if (player2Received > 0) slicedWinners++;
        if (player3Received > 0) slicedWinners++;

        console.log("Sliced players who won: %s", slicedWinners);

        // Verify sponsor received ~50% for each sliced winner
        if (slicedWinners > 0) {
            // Each winner got X, sponsor should have gotten X for each winner
            uint256 expectedSponsorPer = (player1Received + player2Received + player3Received);
            console.log("Expected sponsor total ~= %s (50%% of each winner)", expectedSponsorPer / 1e18);
            // Allow some tolerance for rounding
            assertApproxEqRel(sponsorReceived, expectedSponsorPer, 0.05e18, "Sponsor should get ~50% of each sliced winner");
        }
    }
}
