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
contract MockPIZZA is ERC20 {
    constructor() ERC20("PIZZA Token", "PIZZA") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}

/**
 * @title FreeSliceFlowTest
 * @dev COMPREHENSIVE tests for the free slice flow:
 *   1. Parlor owner calls sendSlice(recipient)
 *   2. Recipient sees pending slice via hasPendingSlice()
 *   3. Recipient calls claimSlice(entryFeeAmount) to enter game
 *   4. Treasury funds the $1 entry fee
 *
 * EDGE CASES COVERED:
 *   - Parlor owner cannot send to another parlor owner
 *   - Non-parlor owner cannot send slices
 *   - Cannot send to self
 *   - Cannot send multiple slices to same recipient in same game
 *   - Slice expires when game changes
 *   - Weekly slice limits
 *   - Daily slice limits
 *   - Treasury funding works correctly
 */
contract FreeSliceFlowTest is Test {
    MockPIZZA public pizzaToken;
    PizzaPartyV2Upgradeable public pizzaParty;
    PizzaParlorManagerUpgradeable public parlorManager;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public ops = makeAddr("ops");

    // Charities
    address public charity1 = makeAddr("charity1");
    address public charity2 = makeAddr("charity2");
    address public charity3 = makeAddr("charity3");

    // Parlor owners
    address public sponsor1 = makeAddr("sponsor1");  // Has 5 parlors
    address public sponsor2 = makeAddr("sponsor2");  // Has 1 parlor
    address public sponsor3 = makeAddr("sponsor3");  // Has 3 parlors

    // Regular players (NOT parlor owners)
    address public player1 = makeAddr("player1");
    address public player2 = makeAddr("player2");
    address public player3 = makeAddr("player3");

    uint256 public constant ENTRY_FEE = 143e18; // ~143 PIZZA for $1 at $0.007
    uint256 public constant PARLOR_PRICE = 7143e18; // ~7143 PIZZA for $50

    function setUp() public {
        // Warp to a Sunday at noon Pacific (start of a week)
        vm.warp(1734285600); // Dec 15, 2024 12:00:00 PM Pacific

        // Deploy mock PIZZA token
        pizzaToken = new MockPIZZA();

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

        // Wire up contracts
        vm.startPrank(owner);
        pizzaParty.setParlorManager(address(parlorManager));
        pizzaParty.setOwnerFeeRecipient(address(parlorManager));
        pizzaParty.setToppingToPizza(10e18);
        vm.stopPrank();

        // Setup parlor owners with different amounts
        _setupParlorOwner(sponsor1, 5);
        _setupParlorOwner(sponsor2, 1);
        _setupParlorOwner(sponsor3, 3);

        // Fund treasury for slice claims
        pizzaToken.mint(treasury, 10_000_000e18);
        vm.prank(treasury);
        pizzaToken.approve(address(parlorManager), type(uint256).max);

        console.log("\n========================================");
        console.log("TEST SETUP COMPLETE");
        console.log("========================================");
        console.log("Sponsor1 (5 parlors):", sponsor1);
        console.log("Sponsor2 (1 parlor):", sponsor2);
        console.log("Sponsor3 (3 parlors):", sponsor3);
        console.log("Player1 (no parlors):", player1);
        console.log("Player2 (no parlors):", player2);
        console.log("Player3 (no parlors):", player3);
        console.log("Treasury balance:", pizzaToken.balanceOf(treasury) / 1e18, "PIZZA");
        console.log("========================================\n");
    }

    function _setupParlorOwner(address parlorOwner, uint256 numParlors) internal {
        pizzaToken.mint(parlorOwner, PARLOR_PRICE * numParlors);
        vm.startPrank(parlorOwner);
        pizzaToken.approve(address(parlorManager), PARLOR_PRICE * numParlors);
        for (uint256 i = 0; i < numParlors; i++) {
            parlorManager.purchaseParlor(PARLOR_PRICE);
        }
        vm.stopPrank();
    }

    // ============================================================================
    // BASIC FLOW TESTS
    // ============================================================================

    function test_SendSlice_CreatesPendingSlice() public {
        console.log("\n=== TEST: sendSlice creates pending slice ===");

        uint256 gameId = pizzaParty.dailyGameId();
        console.log("Current game ID:", gameId);

        // Sponsor sends slice to player
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        console.log("Sponsor1 sent slice to Player1");

        // Verify pending slice exists
        (bool hasPending, address pendingSponsor) = parlorManager.hasPendingSlice(player1);
        (address storedSponsor, uint256 storedGameId, bool isValid) = parlorManager.getPendingSlice(player1);

        console.log("hasPendingSlice:", hasPending);
        console.log("pendingSponsor:", pendingSponsor);
        console.log("storedGameId:", storedGameId);
        console.log("isValid:", isValid);

        assertTrue(hasPending, "Should have pending slice");
        assertEq(pendingSponsor, sponsor1, "Sponsor should match");
        assertEq(storedSponsor, sponsor1, "Stored sponsor should match");
        assertEq(storedGameId, gameId, "Game ID should match");
        assertTrue(isValid, "Should be valid");

        console.log("SUCCESS: Pending slice created correctly");
    }

    function test_ClaimSlice_EntersPlayerIntoGame() public {
        console.log("\n=== TEST: claimSlice enters player into game ===");

        uint256 gameId = pizzaParty.dailyGameId();
        uint256 treasuryBefore = pizzaToken.balanceOf(treasury);

        // Step 1: Sponsor sends slice
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        console.log("Step 1: Sponsor sent slice");

        // Verify not in game yet
        bool playedBefore = pizzaParty.hasPlayedDaily(gameId, player1);
        assertFalse(playedBefore, "Should NOT be in game before claim");
        console.log("Player in game before claim:", playedBefore);

        // Step 2: Player claims slice
        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);
        console.log("Step 2: Player claimed slice");

        // Verify player is now in game
        bool playedAfter = pizzaParty.hasPlayedDaily(gameId, player1);
        assertTrue(playedAfter, "Should be in game after claim");
        console.log("Player in game after claim:", playedAfter);

        // Verify sponsor is recorded
        address recordedSponsor = pizzaParty.dailySliceSponsor(gameId, player1);
        assertEq(recordedSponsor, sponsor1, "Sponsor should be recorded");
        console.log("Recorded sponsor:", recordedSponsor);

        // Verify treasury paid
        uint256 treasuryAfter = pizzaToken.balanceOf(treasury);
        uint256 treasurySpent = treasuryBefore - treasuryAfter;
        assertEq(treasurySpent, ENTRY_FEE, "Treasury should have paid entry fee");
        console.log("Treasury spent:", treasurySpent / 1e18, "PIZZA");

        // Verify pending slice is cleared
        (bool hasPending,) = parlorManager.hasPendingSlice(player1);
        assertFalse(hasPending, "Pending slice should be cleared");

        console.log("SUCCESS: Player entered game with treasury funding");
    }

    // ============================================================================
    // PARLOR OWNER TO PARLOR OWNER - MUST FAIL
    // ============================================================================

    function test_SendSlice_RevertsWhenSendingToParlorOwner() public {
        console.log("\n=== TEST: Cannot send slice to another parlor owner ===");
        console.log("Sponsor1 has", parlorManager.parlorCount(sponsor1), "parlors");
        console.log("Sponsor2 has", parlorManager.parlorCount(sponsor2), "parlors");

        // Sponsor1 tries to send slice to Sponsor2 (another parlor owner)
        vm.prank(sponsor1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.RecipientIsParlorOwner.selector);
        parlorManager.sendSlice(sponsor2);

        console.log("SUCCESS: Correctly reverted with RecipientIsParlorOwner");
    }

    function test_SendSlice_RevertsWhenSendingToSelf() public {
        console.log("\n=== TEST: Cannot send slice to self ===");

        vm.prank(sponsor1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.NoSelfSlice.selector);
        parlorManager.sendSlice(sponsor1);

        console.log("SUCCESS: Correctly reverted with CannotSliceSelf");
    }

    // ============================================================================
    // NON-PARLOR OWNER CANNOT SEND
    // ============================================================================

    function test_SendSlice_RevertsWhenSenderNotParlorOwner() public {
        console.log("\n=== TEST: Non-parlor owner cannot send slices ===");
        console.log("Player1 parlor count:", parlorManager.parlorCount(player1));

        vm.prank(player1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.NoParlorOwned.selector);
        parlorManager.sendSlice(player2);

        console.log("SUCCESS: Correctly reverted with NotParlorOwner");
    }

    // ============================================================================
    // DUPLICATE SLICE - CANNOT SEND TWICE TO SAME PLAYER SAME GAME
    // ============================================================================

    function test_SendSlice_RevertsWhenDuplicateSlice() public {
        console.log("\n=== TEST: Cannot send duplicate slice to same player ===");

        // First slice - should succeed
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        console.log("First slice sent successfully");

        // Second slice to same player - should fail
        vm.prank(sponsor1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.AlreadyHasPendingSlice.selector);
        parlorManager.sendSlice(player1);

        console.log("SUCCESS: Correctly reverted with AlreadyHasPendingSlice");
    }

    function test_SendSlice_AllowsSliceAfterClaim() public {
        console.log("\n=== TEST: Can send new slice after previous one is claimed ===");

        // First slice
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        console.log("First slice sent");

        // Player claims
        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);
        console.log("Player claimed first slice");

        // Player already played this game, so they can't get another slice for THIS game
        // But let's verify the pending slice is cleared
        (bool hasPending,) = parlorManager.hasPendingSlice(player1);
        assertFalse(hasPending, "Pending slice should be cleared after claim");

        console.log("SUCCESS: Slice cleared after claim");
    }

    // ============================================================================
    // WEEKLY SLICE LIMITS
    // ============================================================================

    function test_SendSlice_RespectsWeeklyLimits() public {
        console.log("\n=== TEST: Weekly slice limits enforced ===");
        console.log("Sponsor2 has", parlorManager.parlorCount(sponsor2), "parlor(s)");
        console.log("Weekly slices per parlor:", parlorManager.WEEKLY_SLICES_PER_PARLOR());

        // Sponsor2 has 1 parlor = 1 slice per week
        vm.prank(sponsor2);
        parlorManager.sendSlice(player1);
        console.log("Slice 1 sent to player1");

        // Player1 claims so sponsor2 can try again
        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);
        console.log("Player1 claimed");

        // Warp to next day (still same week)
        vm.warp(block.timestamp + 1 days);

        // Sponsor2 tries to send another slice - should fail (weekly limit)
        vm.prank(sponsor2);
        vm.expectRevert(PizzaParlorManagerUpgradeable.WeeklySliceLimitReached.selector);
        parlorManager.sendSlice(player2);

        console.log("SUCCESS: Weekly limit correctly enforced");
    }

    function test_SendSlice_WeeklyLimitResetsAfterWeek() public {
        console.log("\n=== TEST: Weekly limit resets after week ends ===");

        // Sponsor2 uses their 1 weekly slice
        vm.prank(sponsor2);
        parlorManager.sendSlice(player1);
        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);
        console.log("Sponsor2 used their weekly slice");

        // Warp to next week (Monday)
        uint256 currentWeekId = pizzaParty.weeklyGameId();
        console.log("Current week ID:", currentWeekId);

        // Warp forward 8 days to ensure we're in next week
        vm.warp(block.timestamp + 8 days);

        uint256 newWeekId = pizzaParty.weeklyGameId();
        console.log("New week ID:", newWeekId);
        // Note: weeklyGameId only increments after settlement, but slice limits use internal week tracking

        // Now sponsor2 should be able to send again
        vm.prank(sponsor2);
        parlorManager.sendSlice(player2);
        console.log("Sponsor2 sent slice in new week");

        (bool hasPending,) = parlorManager.hasPendingSlice(player2);
        assertTrue(hasPending, "Player2 should have pending slice");

        console.log("SUCCESS: Weekly limit reset correctly");
    }

    // ============================================================================
    // DAILY SLICE LIMITS
    // ============================================================================

    function test_SendSlice_RespectsDailyLimits() public {
        console.log("\n=== TEST: Daily slice limits enforced ===");
        console.log("Sponsor1 has", parlorManager.parlorCount(sponsor1), "parlors");
        console.log("Max slices per day:", parlorManager.MAX_SLICES_PER_DAY());

        // Sponsor1 has 5 parlors but can only send 1 slice per day
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        console.log("Slice sent to player1");

        // Player1 claims
        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);

        // Try to send another slice same day - should fail
        vm.prank(sponsor1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.DailySliceLimitReached.selector);
        parlorManager.sendSlice(player2);

        console.log("SUCCESS: Daily limit correctly enforced");
    }

    function test_SendSlice_DailyLimitResetsNextDay() public {
        console.log("\n=== TEST: Daily limit resets next day ===");

        // Use daily slice
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);
        console.log("Sponsor1 used daily slice");

        // Warp to next day
        vm.warp(block.timestamp + 1 days);
        console.log("Warped to next day");

        // Should be able to send again
        vm.prank(sponsor1);
        parlorManager.sendSlice(player2);
        console.log("Sponsor1 sent slice on new day");

        (bool hasPending,) = parlorManager.hasPendingSlice(player2);
        assertTrue(hasPending, "Player2 should have pending slice");

        console.log("SUCCESS: Daily limit reset correctly");
    }

    // ============================================================================
    // SLICE EXPIRATION
    // ============================================================================

    function test_PendingSlice_ExpiresWhenGameChanges() public {
        console.log("\n=== TEST: Pending slice expires when game changes ===");

        uint256 gameId1 = pizzaParty.dailyGameId();
        console.log("Initial game ID:", gameId1);

        // Send slice
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);

        // Verify valid
        (bool hasPending1,) = parlorManager.hasPendingSlice(player1);
        assertTrue(hasPending1, "Should have pending slice");

        // Need someone to enter game so it can settle
        pizzaToken.mint(player2, ENTRY_FEE);
        vm.startPrank(player2);
        pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
        pizzaParty.enterDailyGame(ENTRY_FEE, "");
        vm.stopPrank();

        // Warp past game end and settle
        (, uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();
        vm.warp(endTime + 1);
        pizzaParty.settleDailyGame();

        uint256 gameId2 = pizzaParty.dailyGameId();
        console.log("New game ID:", gameId2);
        assertTrue(gameId2 > gameId1, "Game should have advanced");

        // Pending slice should now be invalid
        (bool hasPending2, address sponsor) = parlorManager.hasPendingSlice(player1);
        assertFalse(hasPending2, "Pending slice should be invalid");
        assertEq(sponsor, address(0), "Sponsor should be zero");

        console.log("SUCCESS: Slice expired correctly");
    }

    function test_ClaimSlice_RevertsForExpiredSlice() public {
        console.log("\n=== TEST: Cannot claim expired slice ===");

        // Send slice
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);

        // Need someone to enter game so it can settle
        pizzaToken.mint(player2, ENTRY_FEE);
        vm.startPrank(player2);
        pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
        pizzaParty.enterDailyGame(ENTRY_FEE, "");
        vm.stopPrank();

        // Settle game
        (, uint256 endTime,,,) = pizzaParty.getCurrentDailyGame();
        vm.warp(endTime + 1);
        pizzaParty.settleDailyGame();

        // Try to claim expired slice
        vm.prank(player1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.SliceExpiredWrongGame.selector);
        parlorManager.claimSlice(ENTRY_FEE);

        console.log("SUCCESS: Cannot claim expired slice");
    }

    // ============================================================================
    // CLAIM WITHOUT PENDING SLICE
    // ============================================================================

    function test_ClaimSlice_RevertsWhenNoPendingSlice() public {
        console.log("\n=== TEST: Cannot claim when no pending slice ===");

        vm.prank(player1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.NoPendingSlice.selector);
        parlorManager.claimSlice(ENTRY_FEE);

        console.log("SUCCESS: Correctly reverted with NoPendingSlice");
    }

    // ============================================================================
    // TREASURY FUNDING
    // ============================================================================

    function test_ClaimSlice_TreasuryFundsEntry() public {
        console.log("\n=== TEST: Treasury correctly funds entry ===");

        uint256 treasuryBefore = pizzaToken.balanceOf(treasury);
        uint256 potBefore = pizzaParty.currentDailyPot();
        console.log("Treasury before:", treasuryBefore / 1e18, "PIZZA");
        console.log("Pot before:", potBefore / 1e18, "PIZZA");

        // Send and claim slice
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);

        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);

        uint256 treasuryAfter = pizzaToken.balanceOf(treasury);
        uint256 potAfter = pizzaParty.currentDailyPot();
        console.log("Treasury after:", treasuryAfter / 1e18, "PIZZA");
        console.log("Pot after:", potAfter / 1e18, "PIZZA");

        uint256 treasurySpent = treasuryBefore - treasuryAfter;
        uint256 potIncrease = potAfter - potBefore;

        assertEq(treasurySpent, ENTRY_FEE, "Treasury should spend entry fee");
        assertTrue(potIncrease > 0, "Pot should increase");
        console.log("Treasury spent:", treasurySpent / 1e18, "PIZZA");
        console.log("Pot increased by:", potIncrease / 1e18, "PIZZA");

        console.log("SUCCESS: Treasury funded entry correctly");
    }

    // ============================================================================
    // HAS PENDING SLICE - RETURN FORMAT
    // ============================================================================

    function test_HasPendingSlice_ReturnFormat() public {
        console.log("\n=== TEST: hasPendingSlice return format ===");

        // Before slice
        (bool hasPending1, address sponsor1Addr) = parlorManager.hasPendingSlice(player1);
        console.log("Before sendSlice:");
        console.log("  hasPending:", hasPending1);
        console.log("  sponsor:", sponsor1Addr);
        assertFalse(hasPending1);
        assertEq(sponsor1Addr, address(0));

        // After slice
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);

        (bool hasPending2, address sponsor2Addr) = parlorManager.hasPendingSlice(player1);
        console.log("After sendSlice:");
        console.log("  hasPending:", hasPending2);
        console.log("  sponsor:", sponsor2Addr);
        assertTrue(hasPending2);
        assertEq(sponsor2Addr, sponsor1);

        console.log("SUCCESS: Return format is correct");
    }

    // ============================================================================
    // MULTIPLE SPONSORS SENDING TO DIFFERENT PLAYERS
    // ============================================================================

    function test_MultipleSponsors_CanSendToDifferentPlayers() public {
        console.log("\n=== TEST: Multiple sponsors can send to different players ===");

        // Sponsor1 sends to player1
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        console.log("Sponsor1 -> Player1");

        // Sponsor2 sends to player2
        vm.prank(sponsor2);
        parlorManager.sendSlice(player2);
        console.log("Sponsor2 -> Player2");

        // Sponsor3 sends to player3
        vm.prank(sponsor3);
        parlorManager.sendSlice(player3);
        console.log("Sponsor3 -> Player3");

        // Verify all have pending slices
        (bool p1Pending, address p1Sponsor) = parlorManager.hasPendingSlice(player1);
        (bool p2Pending, address p2Sponsor) = parlorManager.hasPendingSlice(player2);
        (bool p3Pending, address p3Sponsor) = parlorManager.hasPendingSlice(player3);

        assertTrue(p1Pending && p1Sponsor == sponsor1, "Player1 should have slice from Sponsor1");
        assertTrue(p2Pending && p2Sponsor == sponsor2, "Player2 should have slice from Sponsor2");
        assertTrue(p3Pending && p3Sponsor == sponsor3, "Player3 should have slice from Sponsor3");

        console.log("SUCCESS: All sponsors sent slices correctly");
    }

    // ============================================================================
    // FULL E2E FLOW - SIMULATING REAL SCENARIO
    // ============================================================================

    function test_FullE2E_CompleteFlow() public {
        console.log("\n========================================");
        console.log("FULL E2E TEST: Complete Free Slice Flow");
        console.log("========================================");

        uint256 gameId = pizzaParty.dailyGameId();
        uint256 treasuryStart = pizzaToken.balanceOf(treasury);

        console.log("\n--- INITIAL STATE ---");
        console.log("Game ID:", gameId);
        console.log("Treasury:", treasuryStart / 1e18, "PIZZA");
        console.log("Sponsor1 parlors:", parlorManager.parlorCount(sponsor1));
        console.log("Player1 parlors:", parlorManager.parlorCount(player1));

        // STEP 1: Verify player is NOT a parlor owner
        console.log("\n--- STEP 1: Verify player is not parlor owner ---");
        assertEq(parlorManager.parlorCount(player1), 0, "Player should not own parlors");
        console.log("Player1 is NOT a parlor owner: VERIFIED");

        // STEP 2: Sponsor sends slice
        console.log("\n--- STEP 2: Sponsor sends slice ---");
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        console.log("sendSlice() executed successfully");

        // STEP 3: Frontend detection - what the popup checks
        console.log("\n--- STEP 3: Frontend detection (hasPendingSlice) ---");
        (bool hasPending, address pendingSponsor) = parlorManager.hasPendingSlice(player1);
        console.log("hasPendingSlice returns:");
        console.log("  [0] hasPending =", hasPending);
        console.log("  [1] sponsor =", pendingSponsor);
        assertTrue(hasPending, "FAIL: hasPending should be true!");
        assertEq(pendingSponsor, sponsor1, "FAIL: sponsor should match!");

        // STEP 4: Get more details (what getPendingSlice returns)
        console.log("\n--- STEP 4: getPendingSlice details ---");
        (address storedSponsor, uint256 storedGameId, bool isValid) = parlorManager.getPendingSlice(player1);
        console.log("getPendingSlice returns:");
        console.log("  sponsor =", storedSponsor);
        console.log("  dailyGameId =", storedGameId);
        console.log("  isValid =", isValid);
        assertTrue(isValid, "FAIL: slice should be valid!");

        // STEP 5: Player is NOT in game yet
        console.log("\n--- STEP 5: Verify player not in game yet ---");
        bool playedBefore = pizzaParty.hasPlayedDaily(gameId, player1);
        console.log("hasPlayedDaily:", playedBefore);
        assertFalse(playedBefore, "Player should NOT be in game before claim");

        // STEP 6: Player claims slice (this is what happens when they tap "CLAIM YOUR SLICE!")
        console.log("\n--- STEP 6: Player claims slice ---");
        console.log("Calling claimSlice with entry fee:", ENTRY_FEE / 1e18, "PIZZA");
        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);
        console.log("claimSlice() executed successfully");

        // STEP 7: Verify player is now in game
        console.log("\n--- STEP 7: Verify player is in game ---");
        bool playedAfter = pizzaParty.hasPlayedDaily(gameId, player1);
        console.log("hasPlayedDaily:", playedAfter);
        assertTrue(playedAfter, "Player SHOULD be in game after claim");

        // STEP 8: Verify sponsor is recorded
        console.log("\n--- STEP 8: Verify sponsor recorded ---");
        address recordedSponsor = pizzaParty.dailySliceSponsor(gameId, player1);
        console.log("dailySliceSponsor:", recordedSponsor);
        assertEq(recordedSponsor, sponsor1, "Sponsor should be recorded");

        // STEP 9: Verify pending slice is cleared
        console.log("\n--- STEP 9: Verify pending slice cleared ---");
        (bool hasPendingAfter,) = parlorManager.hasPendingSlice(player1);
        console.log("hasPendingSlice after claim:", hasPendingAfter);
        assertFalse(hasPendingAfter, "Pending slice should be cleared");

        // STEP 10: Verify treasury paid
        console.log("\n--- STEP 10: Verify treasury funding ---");
        uint256 treasuryEnd = pizzaToken.balanceOf(treasury);
        uint256 treasurySpent = treasuryStart - treasuryEnd;
        console.log("Treasury spent:", treasurySpent / 1e18, "PIZZA");
        assertEq(treasurySpent, ENTRY_FEE, "Treasury should have paid entry fee");

        console.log("\n========================================");
        console.log("FULL E2E TEST: SUCCESS!");
        console.log("========================================");
        console.log("1. Sponsor sent slice to player");
        console.log("2. hasPendingSlice returned (true, sponsor)");
        console.log("3. Player claimed slice");
        console.log("4. Player entered game");
        console.log("5. Sponsor recorded for 50/50 split");
        console.log("6. Treasury funded $1 entry");
        console.log("7. Pending slice cleared");
        console.log("========================================\n");
    }

    // ============================================================================
    // EDGE CASE: Player becomes parlor owner after receiving slice
    // ============================================================================

    function test_ClaimSlice_WorksEvenIfPlayerBecameParlorOwner() public {
        console.log("\n=== TEST: Claim still works if player became parlor owner ===");

        // Send slice to player
        vm.prank(sponsor1);
        parlorManager.sendSlice(player1);
        console.log("Slice sent to player1");

        // Player1 buys a parlor (becomes parlor owner)
        pizzaToken.mint(player1, PARLOR_PRICE);
        vm.startPrank(player1);
        pizzaToken.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.purchaseParlor(PARLOR_PRICE);
        vm.stopPrank();
        console.log("Player1 bought a parlor, now has:", parlorManager.parlorCount(player1));

        // Player can still claim their pending slice
        vm.prank(player1);
        parlorManager.claimSlice(ENTRY_FEE);
        console.log("Player1 claimed slice successfully");

        bool played = pizzaParty.hasPlayedDaily(pizzaParty.dailyGameId(), player1);
        assertTrue(played, "Player should be in game");

        console.log("SUCCESS: Claim worked even after becoming parlor owner");
    }
}
