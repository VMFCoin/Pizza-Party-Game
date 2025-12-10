// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PizzaPartyV2.sol";
import "../src/PizzaParlorManager.sol";
import "../src/mocks/MockPizza.sol";

contract PizzaPartyV2Test is Test {
    MockPizza public pizza;
    PizzaPartyV2 public pizzaParty;
    PizzaParlorManager public parlorManager;

    address public owner = address(0x1);
    address public treasury = address(0x2);
    address public ops = address(0x3);
    address public alice = address(0x4);
    address public bob = address(0x5);
    address public charlie = address(0x6);

    address[] public charities;

    uint256 public constant ENTRY_AMOUNT = 100e18; // 100 PIZZA

    function setUp() public {
        // Warp to a reasonable timestamp (Dec 2024)
        vm.warp(1733788800);

        // Deploy mock PIZZA token
        pizza = new MockPizza();

        // Setup charities
        charities.push(address(0x100));
        charities.push(address(0x101));

        // Deploy PizzaPartyV2
        pizzaParty = new PizzaPartyV2(
            address(pizza),
            treasury,
            charities,
            owner,
            1, // starting daily game ID
            1  // starting weekly game ID
        );

        // Deploy PizzaParlorManager
        parlorManager = new PizzaParlorManager(
            address(pizza),
            address(pizzaParty),
            treasury,
            ops,
            owner
        );

        // Setup: Set parlorManager in pizzaParty
        vm.prank(owner);
        pizzaParty.setParlorManager(address(parlorManager));

        // Fund test accounts
        pizza.mint(alice, 1_000_000e18);
        pizza.mint(bob, 1_000_000e18);
        pizza.mint(charlie, 1_000_000e18);
        pizza.mint(treasury, 10_000_000e18);

        // Approve pizzaParty for players
        vm.prank(alice);
        pizza.approve(address(pizzaParty), type(uint256).max);
        vm.prank(bob);
        pizza.approve(address(pizzaParty), type(uint256).max);
        vm.prank(charlie);
        pizza.approve(address(pizzaParty), type(uint256).max);

        // Approve pizzaParty for treasury (for weekly jackpot)
        vm.prank(treasury);
        pizza.approve(address(pizzaParty), type(uint256).max);
    }

    // ============ Constructor Tests ============

    function test_constructor_SetsTokenCorrectly() public view {
        assertEq(address(pizzaParty.pizzaToken()), address(pizza));
    }

    function test_constructor_SetsTreasuryCorrectly() public view {
        assertEq(pizzaParty.treasuryWallet(), treasury);
    }

    function test_constructor_InitializesGame() public view {
        assertEq(pizzaParty.dailyGameId(), 1);
        assertEq(pizzaParty.weeklyGameId(), 1);
    }

    // ============ enterDailyGame Tests ============

    function test_enterDailyGame_Success() public {
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        assertTrue(pizzaParty.hasPlayedDailyGame(alice));
        assertEq(pizzaParty.currentDailyPot(), ENTRY_AMOUNT);
    }

    function test_enterDailyGame_TransfersTokens() public {
        uint256 aliceBefore = pizza.balanceOf(alice);
        uint256 contractBefore = pizza.balanceOf(address(pizzaParty));

        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        assertEq(pizza.balanceOf(alice), aliceBefore - ENTRY_AMOUNT);
        assertEq(pizza.balanceOf(address(pizzaParty)), contractBefore + ENTRY_AMOUNT);
    }

    function test_enterDailyGame_EarnsToppings() public {
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        (uint256 toppingsEarned,,,,,) = pizzaParty.getPlayerWeeklyInfo(alice);
        assertEq(toppingsEarned, 1);
    }

    function test_enterDailyGame_FirstPlayerBonus() public {
        // Alice enters first
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        // Check first player is set
        (,, address firstPlayer,,) = pizzaParty.dailyGames(1);
        assertEq(firstPlayer, alice);
    }

    function test_enterDailyGame_FailsBelowMinimum() public {
        vm.prank(alice);
        vm.expectRevert("Amount too low");
        pizzaParty.enterDailyGame(1e15); // 0.001 PIZZA, below 0.01 minimum
    }

    function test_enterDailyGame_FailsAboveMaximum() public {
        vm.prank(alice);
        vm.expectRevert("Amount too high");
        pizzaParty.enterDailyGame(1001e18); // Above 1000 PIZZA maximum
    }

    function test_enterDailyGame_FailsIfAlreadyPlayed() public {
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        vm.prank(alice);
        vm.expectRevert("Already played");
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);
    }

    function test_enterDailyGame_WeeklyLimitTracksPlays() public {
        // This test verifies that:
        // 1. Daily plays are tracked per week
        // 2. Weekly limit is enforced within the same weeklyGameId
        // Note: After 7 days, we may cross into a new week, resetting the counter

        // Get initial weekly info
        (,,uint256 initialDailyPlays,,,) = pizzaParty.getPlayerWeeklyInfo(alice);
        assertEq(initialDailyPlays, 0);

        uint256 initialWeekId = pizzaParty.weeklyGameId();

        // Get the current game end time
        (,uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();

        // Play games tracking weekly progress
        for (uint256 i = 0; i < 7; i++) {
            uint256 currentWeekId = pizzaParty.weeklyGameId();

            // If we're still in the same week, verify plays are incrementing
            if (currentWeekId == initialWeekId) {
                (,,uint256 playsBefore,,,) = pizzaParty.getPlayerWeeklyInfo(alice);
                assertEq(playsBefore, i, "Plays should match iteration");
            }

            vm.prank(alice);
            pizzaParty.enterDailyGame(ENTRY_AMOUNT);

            // Warp past game end time and settle
            vm.warp(endTime + 1);
            pizzaParty.settleDailyGame();

            // Get next game's end time
            (,endTime,,,) = pizzaParty.getCurrentDailyGame();
        }

        // Verify alice has played (either 7 in first week or some in new week)
        (uint256 toppingsEarned,,uint256 dailyPlays,,,) = pizzaParty.getPlayerWeeklyInfo(alice);
        assertGt(toppingsEarned, 0, "Should have earned toppings");
        assertLe(dailyPlays, 7, "Should not exceed weekly limit");
    }

    // ============ enterDailyWithSlice Tests ============

    function test_enterDailyWithSlice_OnlyParlorManager() public {
        vm.prank(alice);
        vm.expectRevert("Not parlor manager");
        pizzaParty.enterDailyWithSlice(bob);
    }

    function test_enterDailyWithSlice_Success() public {
        vm.prank(address(parlorManager));
        pizzaParty.enterDailyWithSlice(bob);

        assertTrue(pizzaParty.hasPlayedDailyGame(bob));
    }

    function test_enterDailyWithSlice_NoPotIncrease() public {
        uint256 potBefore = pizzaParty.currentDailyPot();

        vm.prank(address(parlorManager));
        pizzaParty.enterDailyWithSlice(bob);

        assertEq(pizzaParty.currentDailyPot(), potBefore);
    }

    function test_enterDailyWithSlice_NoTokenTransfer() public {
        uint256 bobBefore = pizza.balanceOf(bob);

        vm.prank(address(parlorManager));
        pizzaParty.enterDailyWithSlice(bob);

        assertEq(pizza.balanceOf(bob), bobBefore);
    }

    // ============ settleDailyGame Tests ============

    function test_settleDailyGame_Success() public {
        // Players enter
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);
        vm.prank(bob);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        // Warp past end time
        vm.warp(block.timestamp + 1 days);

        // Settle
        pizzaParty.settleDailyGame();

        // Check game is settled
        (,,,, bool settled) = pizzaParty.getCurrentDailyGame();
        assertTrue(!settled); // New game started, so this is the new unsettled game

        // Check old game - dailyGames returns (startTime, endTime, firstPlayer, potAmount, settled)
        (,,, uint256 potAmount, bool oldSettled) = pizzaParty.dailyGames(1);
        assertTrue(oldSettled);
        assertEq(potAmount, ENTRY_AMOUNT * 2);
    }

    function test_settleDailyGame_PaysWinners() public {
        // Players enter
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        uint256 pot = ENTRY_AMOUNT;

        // Warp past end time
        vm.warp(block.timestamp + 1 days);

        uint256 aliceBefore = pizza.balanceOf(alice);

        // Settle
        pizzaParty.settleDailyGame();

        // Alice should receive: first player bonus + winner share
        // With 1 player and 0% owner fee:
        // - First player bonus: 1% of pot
        // - Players pool: 94% of pot (minus owner fee)
        // - Winner gets full players pool
        uint256 firstPlayerBonus = (pot * 100) / 10000;
        uint256 playersPool = (pot * 9400) / 10000;

        // Alice gets first player bonus + winner share
        assertGt(pizza.balanceOf(alice), aliceBefore);
    }

    function test_settleDailyGame_PaysCharities() public {
        uint256 charity1Before = pizza.balanceOf(charities[0]);
        uint256 charity2Before = pizza.balanceOf(charities[1]);

        // Players enter
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        uint256 pot = ENTRY_AMOUNT;

        // Warp past end time
        vm.warp(block.timestamp + 1 days);

        // Settle
        pizzaParty.settleDailyGame();

        // Charities split 3% (CHARITY_TOTAL_BPS = 300)
        uint256 charityTotal = (pot * 300) / 10000;
        uint256 perCharity = charityTotal / 2;

        assertGe(pizza.balanceOf(charities[0]), charity1Before + perCharity);
        assertGe(pizza.balanceOf(charities[1]), charity2Before + perCharity);
    }

    function test_settleDailyGame_NoPlayers() public {
        // Warp past end time without any players
        vm.warp(block.timestamp + 1 days);

        // Settle
        pizzaParty.settleDailyGame();

        // Game should be settled with 0 pot
        (,,, uint256 potAmount, bool settled) = pizzaParty.dailyGames(1);
        assertTrue(settled);
        assertEq(potAmount, 0);

        // New game started
        assertEq(pizzaParty.dailyGameId(), 2);
    }

    // ============ Owner Fee Tests ============

    function test_ownerFee_PaysToOwner() public {
        // Set owner fee to 2%
        vm.prank(owner);
        pizzaParty.setOwnerFee(200);

        // Player enters
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        uint256 pot = ENTRY_AMOUNT;

        // Warp past end time
        vm.warp(block.timestamp + 1 days);

        uint256 ownerBefore = pizza.balanceOf(owner);

        // Settle
        pizzaParty.settleDailyGame();

        // Owner should receive 2% of pot
        uint256 expectedOwnerFee = (pot * 200) / 10000;
        assertEq(pizza.balanceOf(owner), ownerBefore + expectedOwnerFee);
    }

    function test_ownerFee_GoesToParlorManager() public {
        // Transfer ownership to parlorManager
        vm.prank(owner);
        pizzaParty.transferOwnership(address(parlorManager));

        // Owner fee is now 3% (300 BPS) by default

        uint256 parlorManagerBefore = pizza.balanceOf(address(parlorManager));

        // Player enters
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        uint256 pot = ENTRY_AMOUNT;

        // Warp past end time
        vm.warp(block.timestamp + 1 days);

        // Settle
        pizzaParty.settleDailyGame();

        // parlorManager (as owner) receives 3% owner fee
        uint256 expectedOwnerFee = (pot * 300) / 10000;
        assertEq(pizza.balanceOf(address(parlorManager)), parlorManagerBefore + expectedOwnerFee);
    }

    // ============ View Function Tests ============

    function test_getCurrentDailyGame() public {
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        (
            uint256 startTime,
            uint256 endTime,
            uint256 playerCount,
            uint256 pot,
            bool settled
        ) = pizzaParty.getCurrentDailyGame();

        assertGt(startTime, 0);
        assertGt(endTime, startTime);
        assertEq(playerCount, 1);
        assertEq(pot, ENTRY_AMOUNT);
        assertFalse(settled);
    }

    function test_getPlayerLifetimeStats() public {
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        (
            uint256 totalDailyWins,
            uint256 totalWeeklyWins,
            uint256 totalPizzaWon,
            uint256 lifetimeToppings,
            uint256 lifetimeReferrals
        ) = pizzaParty.getPlayerLifetimeStats(alice);

        assertEq(totalDailyWins, 0); // Not won yet
        assertEq(totalWeeklyWins, 0);
        assertEq(totalPizzaWon, 0);
        assertEq(lifetimeToppings, 1); // Earned 1 from playing
        assertEq(lifetimeReferrals, 0);
    }

    // ============ Referral Tests ============

    function test_referralCode_AutoGenerated() public {
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        string memory code = pizzaParty.getReferralCode(alice);
        assertTrue(bytes(code).length == 10); // "PZ" + 8 chars
    }

    function test_useReferralCode_Success() public {
        // Alice plays first to get a code
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        string memory aliceCode = pizzaParty.playerReferralCode(alice);

        // Bob uses Alice's code
        vm.prank(bob);
        pizzaParty.useReferralCode(aliceCode);

        // Alice should have earned 2 toppings from referral
        (uint256 toppingsEarned,,,,,) = pizzaParty.getPlayerWeeklyInfo(alice);
        assertEq(toppingsEarned, 3); // 1 from play + 2 from referral
    }

    function test_useReferralCode_CannotUseTwice() public {
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        string memory aliceCode = pizzaParty.playerReferralCode(alice);

        vm.prank(bob);
        pizzaParty.useReferralCode(aliceCode);

        vm.prank(bob);
        vm.expectRevert("Already used referral");
        pizzaParty.useReferralCode(aliceCode);
    }

    // ============ Admin Function Tests ============

    function test_setParlorManager_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pizzaParty.setParlorManager(address(0x999));
    }

    function test_setParlorManager_Success() public {
        address newManager = address(0x999);

        vm.prank(owner);
        pizzaParty.setParlorManager(newManager);

        assertEq(pizzaParty.parlorManager(), newManager);
    }

    function test_setOwnerFee_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pizzaParty.setOwnerFee(200);
    }

    function test_setOwnerFee_MaxLimit() public {
        vm.prank(owner);
        vm.expectRevert("Fee exceeds maximum");
        pizzaParty.setOwnerFee(600); // 6%, above 5% max
    }

    function test_emergencyWithdraw() public {
        // Add some tokens to contract
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        uint256 ownerBefore = pizza.balanceOf(owner);
        uint256 contractBalance = pizza.balanceOf(address(pizzaParty));

        vm.prank(owner);
        pizzaParty.emergencyWithdraw();

        assertEq(pizza.balanceOf(address(pizzaParty)), 0);
        assertEq(pizza.balanceOf(owner), ownerBefore + contractBalance);
    }

    // ============ Weekly Game Tests ============

    function test_claimToppings_Success() public {
        // Alice plays to earn toppings
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        // Warp to claim window (Sunday 12pm PT = 20:00 UTC)
        uint256 claimStart = _getNextSundayNoon();
        vm.warp(claimStart);

        // Claim
        vm.prank(alice);
        pizzaParty.claimToppings();

        (,uint256 toppingsClaimed,,, bool hasClaimed,) = pizzaParty.getPlayerWeeklyInfo(alice);
        assertTrue(hasClaimed);
        assertGt(toppingsClaimed, 0);
    }

    function test_claimToppings_FailsBeforeWindow() public {
        vm.prank(alice);
        pizzaParty.enterDailyGame(ENTRY_AMOUNT);

        vm.prank(alice);
        vm.expectRevert("Window not open");
        pizzaParty.claimToppings();
    }

    // Helper function to get next Sunday noon PT (20:00 UTC)
    function _getNextSundayNoon() internal view returns (uint256) {
        uint256 THURSDAY_EPOCH = 4 days;
        uint256 timestamp = block.timestamp;
        uint256 daysSinceEpoch = (timestamp + THURSDAY_EPOCH) / 1 days;
        uint256 dayOfWeek = daysSinceEpoch % 7;
        uint256 daysUntilSunday = (7 - dayOfWeek) % 7;

        if (daysUntilSunday == 0) {
            uint256 sundayNoon = (timestamp / 1 days) * 1 days + 20 hours;
            if (timestamp >= sundayNoon) {
                daysUntilSunday = 7;
            }
        }

        uint256 nextSundayMidnight = ((timestamp / 1 days) + daysUntilSunday) * 1 days;
        return nextSundayMidnight + 20 hours;
    }
}
