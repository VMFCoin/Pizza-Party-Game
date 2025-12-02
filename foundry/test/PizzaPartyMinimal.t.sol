// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "../src/PizzaParty.sol";
import "../src/mocks/MockVMF.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes calldata) external;
}

contract PizzaPartyMinimalTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockVMF private token;
    PizzaParty private pizza;
    address private treasury = address(0xBEEF);
    
    // ✅ Define test entry fee (simulating 100 VMF for $1 at $0.01 price)
    uint256 private constant TEST_ENTRY_FEE = 100e18;

    function setUp() public {
        // ✅ Warp to a reasonable timestamp to avoid underflow in time calculations
        // Use a timestamp that's well after the epoch (e.g., Jan 1, 2024)
        vm.warp(1704067200); // 2024-01-01 00:00:00 UTC
        
        token = new MockVMF();
        
        // ✅ Contract constructor takes (vmfToken, treasury) - no charities in current version
        pizza = new PizzaParty(address(token), treasury);
    }

    function testDailyJackpotDistribution() public {
        setUp();
        
        // ✅ Use TEST_ENTRY_FEE instead of pizza.ENTRY_FEE()
        uint256 entryFee = TEST_ENTRY_FEE;
        
        address[5] memory participants = [
            address(0x100),
            address(0x200),
            address(0x300),
            address(0x400),
            address(0x500)
        ];

        for (uint256 i = 0; i < participants.length; i++) {
            token.mint(participants[i], entryFee * 10);
            vm.startPrank(participants[i]);
            token.approve(address(pizza), type(uint256).max);
            
            // ✅ Pass amount parameter
            pizza.enterDailyGameNoRef(entryFee);
            vm.stopPrank();
        }

        (, uint256 endTime, , , ) = pizza.getCurrentDailyGame();
        vm.warp(endTime + 1);

        uint256 beforeFirst = token.balanceOf(participants[0]);
        uint256 beforeSecond = token.balanceOf(participants[1]);

        pizza.settleDailyGame();

        uint256 pot = entryFee * participants.length;
        
        // ✅ UPDATED: Current payout structure (no charities in contract)
        // 1% first player bonus
        // 99% to players (divided by 5 participants = 19.8% each)
        
        uint256 firstPlayerBonus = (pot * 100) / 10000; // 1%
        uint256 playersPool = pot - firstPlayerBonus;   // 99%
        uint256 perWinner = playersPool / participants.length;
        
        uint256 expectedAfterEntry = entryFee * 9; // Started with 10x, spent 1x

        require(token.balanceOf(address(pizza)) == 0, "Pot not cleared");
        
        // First player gets: per-winner share + first player bonus
        require(
            token.balanceOf(participants[0]) == expectedAfterEntry + perWinner + firstPlayerBonus,
            "First player payout mismatch"
        );
        
        // Other winners get: per-winner share only
        require(
            token.balanceOf(participants[1]) == expectedAfterEntry + perWinner,
            "Winner payout mismatch"
        );
        
        require(beforeFirst == expectedAfterEntry, "before state mismatch first");
        require(beforeSecond == expectedAfterEntry, "before state mismatch second");
    }

    function testWeeklyClaimAndSettlement() public {
        setUp();
        
        // ✅ Use TEST_ENTRY_FEE
        uint256 entryFee = TEST_ENTRY_FEE;
        
        address[3] memory claimants = [address(0x111), address(0x222), address(0x333)];

        for (uint256 i = 0; i < claimants.length; i++) {
            token.mint(claimants[i], entryFee * 10);
            vm.startPrank(claimants[i]);
            token.approve(address(pizza), type(uint256).max);
            
            // ✅ Pass amount parameter
            pizza.enterDailyGameNoRef(entryFee);
            vm.stopPrank();
        }

        (uint256 claimStart, uint256 claimEnd, , , , ) = pizza.getCurrentWeeklyGame();
        vm.warp(claimStart + 1);

        for (uint256 i = 0; i < claimants.length; i++) {
            vm.prank(claimants[i]);
            pizza.claimToppings();
        }

        // Each player earned 1 topping, so 3 toppings total
        // 1 topping = 1 VMF (TOPPING_TO_VMF = 1e18), so jackpot = 3 * 1 = 3 VMF
        uint256 jackpot = claimants.length * 1e18;
        
        token.mint(treasury, jackpot);
        vm.startPrank(treasury);
        token.approve(address(pizza), jackpot);
        vm.stopPrank();

        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256[3] memory beforeBalances;
        for (uint256 i = 0; i < claimants.length; i++) {
            beforeBalances[i] = token.balanceOf(claimants[i]);
        }

        vm.warp(claimEnd + 1);
        pizza.settleWeeklyGame();

        uint256 totalPaid;
        for (uint256 i = 0; i < claimants.length; i++) {
            uint256 afterBal = token.balanceOf(claimants[i]);
            require(afterBal > beforeBalances[i], "No payout received");
            totalPaid += afterBal - beforeBalances[i];
        }

        require(totalPaid == jackpot, "Jackpot mismatch");
        uint256 treasuryAfter = token.balanceOf(treasury);
        require(treasuryBefore - treasuryAfter == jackpot, "Treasury delta mismatch");
    }
    
    // ✅ NEW: Test dynamic entry amounts
    function testDynamicEntryAmounts() public {
        setUp();
        
        address player1 = address(0x100);
        address player2 = address(0x200);
        
        // Simulate different VMF prices
        uint256 amount1 = 50e18;  // Simulating $0.02 price ($1 / $0.02 = 50 VMF)
        uint256 amount2 = 200e18; // Simulating $0.005 price ($1 / $0.005 = 200 VMF)
        
        token.mint(player1, amount1 * 10);
        token.mint(player2, amount2 * 10);
        
        vm.startPrank(player1);
        token.approve(address(pizza), type(uint256).max);
        pizza.enterDailyGameNoRef(amount1);
        vm.stopPrank();
        
        // Check pot increased by first amount
        require(pizza.currentDailyPot() == amount1, "Pot should equal first entry");
        
        // Move to next day
        (, uint256 endTime, , , ) = pizza.getCurrentDailyGame();
        vm.warp(endTime + 1);
        
        vm.startPrank(player2);
        token.approve(address(pizza), type(uint256).max);
        pizza.enterDailyGameNoRef(amount2);
        vm.stopPrank();
        
        // Check pot increased by second amount
        require(pizza.currentDailyPot() == amount2, "Pot should equal second entry");
    }
    
    // ✅ NEW: Test minimum and maximum bounds
    function testEntryFeeBounds() public {
        setUp();
        
        address player = address(0x100);
        
        // Test minimum (1 VMF)
        uint256 minAmount = pizza.MIN_ENTRY_FEE();
        token.mint(player, minAmount * 10);
        
        vm.startPrank(player);
        token.approve(address(pizza), type(uint256).max);
        pizza.enterDailyGameNoRef(minAmount);
        vm.stopPrank();
        
        require(pizza.currentDailyPot() == minAmount, "Should accept minimum amount");
        
        // Move to next day
        (, uint256 endTime, , , ) = pizza.getCurrentDailyGame();
        vm.warp(endTime + 1);
        
        // Test maximum (1000 VMF)
        uint256 maxAmount = pizza.MAX_ENTRY_FEE();
        token.mint(player, maxAmount * 10);
        
        vm.startPrank(player);
        token.approve(address(pizza), type(uint256).max);
        pizza.enterDailyGameNoRef(maxAmount);
        vm.stopPrank();
        
        require(pizza.currentDailyPot() == maxAmount, "Should accept maximum amount");
    }
    
    // ✅ NEW: Test validation helper
    function testIsValidEntryAmount() public {
        setUp();
        
        require(pizza.isValidEntryAmount(1e18), "1 VMF should be valid");
        require(pizza.isValidEntryAmount(100e18), "100 VMF should be valid");
        require(pizza.isValidEntryAmount(1000e18), "1000 VMF should be valid");
        require(!pizza.isValidEntryAmount(0.5e18), "0.5 VMF should be invalid");
        require(!pizza.isValidEntryAmount(1001e18), "1001 VMF should be invalid");
    }
    
    // ✅ NEW: Test amount validation on entry
    function testEntryAmountValidation() public {
        setUp();
        
        address player = address(0x100);
        token.mint(player, 10000e18);
        
        vm.startPrank(player);
        token.approve(address(pizza), type(uint256).max);
        
        // Should fail with amount too low
        vm.expectRevert("Amount too low");
        pizza.enterDailyGameNoRef(0.5e18);
        
        // Should fail with amount too high
        vm.expectRevert("Amount too high");
        pizza.enterDailyGameNoRef(1001e18);
        
        // Should succeed with valid amount
        pizza.enterDailyGameNoRef(100e18);
        
        vm.stopPrank();
        
        require(pizza.currentDailyPot() == 100e18, "Pot should equal entry");
    }
}
