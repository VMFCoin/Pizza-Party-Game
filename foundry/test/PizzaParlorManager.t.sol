// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PizzaPartyV2.sol";
import "../src/PizzaParlorManager.sol";
import "../src/mocks/MockPizza.sol";

contract PizzaParlorManagerTest is Test {
    MockPizza public pizza;
    PizzaPartyV2 public pizzaParty;
    PizzaParlorManager public parlorManager;

    address public owner = address(0x1);
    address public treasury = address(0x2);
    address public ops = address(0x3);
    address public alice = address(0x4);
    address public bob = address(0x5);
    address public charlie = address(0x6);
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;

    uint256 public constant PARLOR_PRICE = 50000e18; // 50,000 PIZZA
    uint256 public constant ENTRY_AMOUNT = 100e18;   // 100 PIZZA entry

    function setUp() public {
        // Warp to a reasonable timestamp (Dec 2024)
        vm.warp(1733788800);

        // Deploy mock PIZZA token
        pizza = new MockPizza();

        // Deploy PizzaPartyV2
        address[] memory charities = new address[](0);
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

        // Setup: Transfer ownership of pizzaParty to parlorManager
        vm.prank(owner);
        pizzaParty.transferOwnership(address(parlorManager));

        // Fund test accounts
        pizza.mint(alice, 1_000_000e18);
        pizza.mint(bob, 1_000_000e18);
        pizza.mint(charlie, 1_000_000e18);
        pizza.mint(treasury, 10_000_000e18);

        // Approve pizzaParty for treasury (for weekly jackpot)
        vm.prank(treasury);
        pizza.approve(address(pizzaParty), type(uint256).max);
    }

    // ============ buyParlor Tests ============

    function test_buyParlor_Success() public {
        // Approve and buy
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.buyParlor();
        vm.stopPrank();

        // Check state
        assertEq(parlorManager.parlorCount(alice), 1);
        assertEq(parlorManager.totalParlors(), 1);
        assertEq(parlorManager.isParlorOwner(alice), true);
    }

    function test_buyParlor_PaymentSplit() public {
        uint256 burnBefore = pizza.balanceOf(burnAddress);
        uint256 treasuryBefore = pizza.balanceOf(treasury);
        uint256 opsBefore = pizza.balanceOf(ops);

        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.buyParlor();
        vm.stopPrank();

        // 50% burn, 30% treasury, 20% ops
        uint256 expectedBurn = (PARLOR_PRICE * 5000) / 10000;
        uint256 expectedTreasury = (PARLOR_PRICE * 3000) / 10000;
        uint256 expectedOps = PARLOR_PRICE - expectedBurn - expectedTreasury;

        assertEq(pizza.balanceOf(burnAddress) - burnBefore, expectedBurn);
        assertEq(pizza.balanceOf(treasury) - treasuryBefore, expectedTreasury);
        assertEq(pizza.balanceOf(ops) - opsBefore, expectedOps);
    }

    function test_buyParlor_MultipleParlors() public {
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE * 3);

        parlorManager.buyParlor();
        assertEq(parlorManager.parlorCount(alice), 1);

        parlorManager.buyParlor();
        assertEq(parlorManager.parlorCount(alice), 2);

        parlorManager.buyParlor();
        assertEq(parlorManager.parlorCount(alice), 3);

        vm.stopPrank();

        assertEq(parlorManager.totalParlors(), 3);
        // Should still only be counted as one owner
        assertEq(parlorManager.getParlorOwnerCount(), 1);
    }

    function test_buyParlor_FailsWhenMaxReached() public {
        // Buy 100 parlors
        for (uint256 i = 0; i < 100; i++) {
            address buyer = address(uint160(100 + i));
            pizza.mint(buyer, PARLOR_PRICE);

            vm.startPrank(buyer);
            pizza.approve(address(parlorManager), PARLOR_PRICE);
            parlorManager.buyParlor();
            vm.stopPrank();
        }

        assertEq(parlorManager.totalParlors(), 100);

        // 101st should fail
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        vm.expectRevert("Max parlors reached");
        parlorManager.buyParlor();
        vm.stopPrank();
    }

    function test_buyParlor_FailsWithoutAllowance() public {
        vm.prank(alice);
        vm.expectRevert(); // SafeERC20 will revert
        parlorManager.buyParlor();
    }

    function test_buyParlor_FailsWithInsufficientBalance() public {
        address poor = address(0x999);
        // No balance, but has approval
        vm.startPrank(poor);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        vm.expectRevert();
        parlorManager.buyParlor();
        vm.stopPrank();
    }

    // ============ tipSlice Tests ============

    function test_tipSlice_Success() public {
        // Alice buys a parlor
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.buyParlor();
        vm.stopPrank();

        // Alice tips a slice to Bob
        vm.prank(alice);
        parlorManager.tipSlice(bob);

        // Bob should now be in the daily game
        assertTrue(pizzaParty.hasPlayedDailyGame(bob));
    }

    function test_tipSlice_FailsWithoutParlor() public {
        vm.prank(alice);
        vm.expectRevert("No parlor owned");
        parlorManager.tipSlice(bob);
    }

    function test_tipSlice_DailyLimit() public {
        // Alice buys 2 parlors
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE * 2);
        parlorManager.buyParlor();
        parlorManager.buyParlor();
        vm.stopPrank();

        // Can tip 2 slices per day (1 per parlor)
        vm.startPrank(alice);
        parlorManager.tipSlice(bob);
        parlorManager.tipSlice(charlie);

        // 3rd should fail
        address david = address(0x7);
        vm.expectRevert("Daily slice limit reached");
        parlorManager.tipSlice(david);
        vm.stopPrank();
    }

    function test_tipSlice_ResetsNextDay() public {
        // Alice buys a parlor
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.buyParlor();
        vm.stopPrank();

        // Tip today
        vm.prank(alice);
        parlorManager.tipSlice(bob);

        // Can't tip again today
        vm.prank(alice);
        vm.expectRevert("Daily slice limit reached");
        parlorManager.tipSlice(charlie);

        // Warp to next day
        vm.warp(block.timestamp + 1 days);

        // Need to settle game first (game ended)
        vm.prank(alice);
        pizzaParty.settleDailyGame();

        // Now can tip again
        vm.prank(alice);
        parlorManager.tipSlice(charlie);
        assertTrue(pizzaParty.hasPlayedDailyGame(charlie));
    }

    function test_tipSlice_ResetsAt12pmPST() public {
        // This test verifies that slices reset at 12pm PST (20:00 UTC), NOT at UTC midnight
        // Start at 1 hour AFTER 12pm PST (21:00 UTC) on Dec 10, 2024
        // This ensures we're solidly within a game day
        uint256 noonPST_Dec10 = 1733860800; // Dec 10, 2024 20:00:00 UTC
        uint256 startTime = noonPST_Dec10 + 1 hours; // 21:00 UTC
        vm.warp(startTime);

        // Alice buys a parlor
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.buyParlor();
        vm.stopPrank();

        // Tip a slice
        vm.prank(alice);
        parlorManager.tipSlice(bob);

        // Verify slice used
        assertEq(parlorManager.getRemainingSlices(alice), 0);

        // Warp to 1 second before the NEXT 12pm PST (almost 23 hours later)
        // This is 19:59:59 UTC on Dec 11 - still the same game day
        uint256 oneSecondBeforeNextNoon = noonPST_Dec10 + 24 hours - 1;
        vm.warp(oneSecondBeforeNextNoon);

        // Still can't tip - same game day (slices haven't reset yet)
        vm.prank(alice);
        vm.expectRevert("Daily slice limit reached");
        parlorManager.tipSlice(charlie);

        // Verify remaining slices is still 0
        assertEq(parlorManager.getRemainingSlices(alice), 0);

        // Warp to exactly 12pm PST next day (20:00 UTC Dec 11)
        vm.warp(noonPST_Dec10 + 24 hours);

        // Now remaining slices should show 1 (new game day!)
        assertEq(parlorManager.getRemainingSlices(alice), 1);

        // Settle the old game first so we can enter the new one
        pizzaParty.settleDailyGame();

        // Now we can tip again - new game day!
        vm.prank(alice);
        parlorManager.tipSlice(charlie);
        assertTrue(pizzaParty.hasPlayedDailyGame(charlie));
    }

    function test_getRemainingSlices() public {
        // No parlor = 0 slices
        assertEq(parlorManager.getRemainingSlices(alice), 0);

        // Buy 3 parlors
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE * 3);
        parlorManager.buyParlor();
        parlorManager.buyParlor();
        parlorManager.buyParlor();
        vm.stopPrank();

        // Should have 3 slices
        assertEq(parlorManager.getRemainingSlices(alice), 3);

        // Use one
        vm.prank(alice);
        parlorManager.tipSlice(bob);
        assertEq(parlorManager.getRemainingSlices(alice), 2);

        // Use another
        vm.prank(alice);
        parlorManager.tipSlice(charlie);
        assertEq(parlorManager.getRemainingSlices(alice), 1);
    }

    // ============ Slice Entry in PizzaPartyV2 Tests ============

    function test_sliceEntry_NoTokenTransfer() public {
        // Alice buys a parlor
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.buyParlor();
        vm.stopPrank();

        uint256 potBefore = pizzaParty.currentDailyPot();
        uint256 bobBalanceBefore = pizza.balanceOf(bob);

        // Alice tips Bob a slice
        vm.prank(alice);
        parlorManager.tipSlice(bob);

        // Pot should not increase (free entry)
        assertEq(pizzaParty.currentDailyPot(), potBefore);
        // Bob's balance unchanged
        assertEq(pizza.balanceOf(bob), bobBalanceBefore);
        // But Bob is in the game
        assertTrue(pizzaParty.hasPlayedDailyGame(bob));
    }

    function test_sliceEntry_EarnsToppings() public {
        // Alice buys a parlor
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.buyParlor();
        vm.stopPrank();

        // Alice tips Bob a slice
        vm.prank(alice);
        parlorManager.tipSlice(bob);

        // Bob should have earned 1 topping
        (uint256 toppingsEarned,,,,,) = pizzaParty.getPlayerWeeklyInfo(bob);
        assertEq(toppingsEarned, 1);
    }

    // ============ Owner Fee Distribution Tests ============

    function test_distributeFranchiseFees_NoFees() public {
        vm.expectRevert("No fees to distribute");
        parlorManager.distributeFranchiseFees();
    }

    function test_distributeFranchiseFees_Success() public {
        // First, need to generate owner fees by having games with players and owner fee set
        // This is complex because parlorManager is now the owner, need to simulate

        // Manually send some PIZZA to parlorManager to simulate accumulated fees
        pizza.mint(address(parlorManager), 10000e18);

        // Alice buys a parlor
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE);
        parlorManager.buyParlor();
        vm.stopPrank();

        // Bob buys 2 parlors
        vm.startPrank(bob);
        pizza.approve(address(parlorManager), PARLOR_PRICE * 2);
        parlorManager.buyParlor();
        parlorManager.buyParlor();
        vm.stopPrank();

        uint256 balance = 10000e18;
        uint256 expectedTreasury = (balance * 3000) / 10000; // 30%
        uint256 expectedParlors = (balance * 5000) / 10000;  // 50%
        uint256 expectedOps = balance - expectedTreasury - expectedParlors; // 20%

        uint256 treasuryBefore = pizza.balanceOf(treasury);
        uint256 opsBefore = pizza.balanceOf(ops);
        uint256 aliceBefore = pizza.balanceOf(alice);
        uint256 bobBefore = pizza.balanceOf(bob);

        // Distribute
        parlorManager.distributeFranchiseFees();

        // Check distributions
        // Note: Treasury receives dust from rounding, so use assertGe
        assertGe(pizza.balanceOf(treasury) - treasuryBefore, expectedTreasury);
        assertEq(pizza.balanceOf(ops) - opsBefore, expectedOps);

        // Alice has 1 parlor, Bob has 2, total 3
        uint256 perParlor = expectedParlors / 3;
        assertEq(pizza.balanceOf(alice) - aliceBefore, perParlor);
        assertEq(pizza.balanceOf(bob) - bobBefore, perParlor * 2);
    }

    // ============ Admin Function Tests ============

    function test_setParlorPrice() public {
        uint256 newPrice = 100000e18;

        vm.prank(owner);
        parlorManager.setParlorPrice(newPrice);

        assertEq(parlorManager.parlorPricePizza(), newPrice);
    }

    function test_setParlorPrice_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        parlorManager.setParlorPrice(100000e18);
    }

    function test_setDailyFreeEntriesPerParlor() public {
        vm.prank(owner);
        parlorManager.setDailyFreeEntriesPerParlor(5);

        assertEq(parlorManager.dailyFreeEntriesPerParlor(), 5);
    }

    function test_emergencyWithdraw() public {
        // Send some tokens to manager
        pizza.mint(address(parlorManager), 1000e18);

        uint256 treasuryBefore = pizza.balanceOf(treasury);

        vm.prank(owner);
        parlorManager.emergencyWithdraw();

        assertEq(pizza.balanceOf(address(parlorManager)), 0);
        assertEq(pizza.balanceOf(treasury), treasuryBefore + 1000e18);
    }

    // ============ View Function Tests ============

    function test_getParlorInfo() public {
        // Buy 2 parlors
        vm.startPrank(alice);
        pizza.approve(address(parlorManager), PARLOR_PRICE * 2);
        parlorManager.buyParlor();
        parlorManager.buyParlor();
        vm.stopPrank();

        (
            uint256 parlorsOwned,
            uint256 slicesRemaining,
            uint256 slicesUsed,
            uint256 maxSlices
        ) = parlorManager.getParlorInfo(alice);

        assertEq(parlorsOwned, 2);
        assertEq(slicesRemaining, 2);
        assertEq(slicesUsed, 0);
        assertEq(maxSlices, 2);

        // Use a slice
        vm.prank(alice);
        parlorManager.tipSlice(bob);

        (parlorsOwned, slicesRemaining, slicesUsed, maxSlices) = parlorManager.getParlorInfo(alice);
        assertEq(slicesRemaining, 1);
        assertEq(slicesUsed, 1);
    }
}
