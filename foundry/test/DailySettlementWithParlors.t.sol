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
 * @title DailySettlementWithParlorsTest
 * @dev Tests daily settlement scenario:
 *   - 20 daily players
 *   - 5 parlor owners (1 owns 3 parlors, 4 own 1 each = 7 total parlors)
 *   - All paid $1 of PIZZA to enter (at $0.007/PIZZA = ~142.857 PIZZA)
 *   - 8 random winners
 *   - Verify winner payouts, owner fee distribution, and claimable balances
 */
contract DailySettlementWithParlorsTest is Test {
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

    // Parlor owners (5 total)
    address public parlorOwner1 = makeAddr("parlorOwner1"); // Owns 3 parlors
    address public parlorOwner2 = makeAddr("parlorOwner2"); // Owns 1 parlor
    address public parlorOwner3 = makeAddr("parlorOwner3"); // Owns 1 parlor
    address public parlorOwner4 = makeAddr("parlorOwner4"); // Owns 1 parlor
    address public parlorOwner5 = makeAddr("parlorOwner5"); // Owns 1 parlor

    // Regular players (15 more to make 20 total, parlor owners can also play)
    address[20] public players;

    // PIZZA price: $0.007
    // $1 entry = 1 / 0.007 = ~142.857142857 PIZZA
    // Using round numbers for cleaner math
    uint256 public constant PIZZA_PRICE_CENTS = 7; // 0.7 cents = $0.007 (scaled by 1000)
    uint256 public constant ENTRY_FEE = 143e18; // ~143 PIZZA for $1 at $0.007

    // For parlor purchase: $50 = 50 / 0.007 = ~7142.857 PIZZA
    uint256 public constant PARLOR_PRICE = 7143e18; // ~7143 PIZZA for $50

    function setUp() public {
        // Warp to a reasonable timestamp (avoid underflow in game initialization)
        // Use a timestamp in December 2024
        vm.warp(1734480000); // Dec 18, 2024 00:00:00 UTC

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

        // Wire up: Set parlor manager in PizzaParty and set fee recipient
        vm.startPrank(owner);
        pizzaParty.setParlorManager(address(parlorManager));
        pizzaParty.setOwnerFeeRecipient(address(parlorManager));
        vm.stopPrank();

        // Create player addresses
        for (uint256 i = 0; i < 20; i++) {
            players[i] = makeAddr(string(abi.encodePacked("player", vm.toString(i))));
        }

        // Mint PIZZA to all addresses
        _mintPizzaToAll();

        // Setup parlor owners (purchase parlors)
        _setupParlorOwners();
    }

    function _mintPizzaToAll() internal {
        // Mint to parlor owners for parlor purchases and game entry
        uint256 parlorOwnerAmount = PARLOR_PRICE * 5 + ENTRY_FEE * 10; // Enough for multiple parlors + entries
        pizzaToken.mint(parlorOwner1, parlorOwnerAmount);
        pizzaToken.mint(parlorOwner2, parlorOwnerAmount);
        pizzaToken.mint(parlorOwner3, parlorOwnerAmount);
        pizzaToken.mint(parlorOwner4, parlorOwnerAmount);
        pizzaToken.mint(parlorOwner5, parlorOwnerAmount);

        // Mint to regular players for game entry
        for (uint256 i = 0; i < 20; i++) {
            pizzaToken.mint(players[i], ENTRY_FEE * 10);
        }

        // Mint to treasury for any needs
        pizzaToken.mint(treasury, 1_000_000e18);
    }

    function _setupParlorOwners() internal {
        // parlorOwner1 buys 3 parlors
        vm.startPrank(parlorOwner1);
        pizzaToken.approve(address(parlorManager), PARLOR_PRICE * 3);
        parlorManager.purchaseParlor(PARLOR_PRICE);
        parlorManager.purchaseParlor(PARLOR_PRICE);
        parlorManager.purchaseParlor(PARLOR_PRICE);
        vm.stopPrank();

        // parlorOwner2-5 each buy 1 parlor
        address[4] memory singleOwners = [parlorOwner2, parlorOwner3, parlorOwner4, parlorOwner5];
        for (uint256 i = 0; i < 4; i++) {
            vm.startPrank(singleOwners[i]);
            pizzaToken.approve(address(parlorManager), PARLOR_PRICE);
            parlorManager.purchaseParlor(PARLOR_PRICE);
            vm.stopPrank();
        }

        // Verify total parlors
        assertEq(parlorManager.totalParlors(), 7, "Should have 7 total parlors");
        assertEq(parlorManager.parlorCount(parlorOwner1), 3, "Owner1 should have 3 parlors");
        assertEq(parlorManager.parlorCount(parlorOwner2), 1, "Owner2 should have 1 parlor");
    }

    function test_DailySettlementWith20PlayersAnd8Winners() public {
        console.log("\n=== Daily Settlement Test ===");
        console.log("PIZZA Price: $0.007");
        console.log("Entry Fee: ~142.857 PIZZA ($1)");
        console.log("Total Players: 20");
        console.log("Parlor Owners: 5 (with 7 total parlors)");

        // Enter 20 players into the daily game
        for (uint256 i = 0; i < 20; i++) {
            vm.startPrank(players[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        // Verify pot amount
        uint256 expectedPot = ENTRY_FEE * 20;
        (,,,uint256 pot,) = pizzaParty.getCurrentDailyGame();
        assertEq(pot, expectedPot, "Pot should equal 20 * entry fee");

        console.log("\nTotal Pot: %s PIZZA", pot / 1e18);
        console.log("Pot in USD: $%s", (pot * 7) / 1e18 / 1000); // pot * 0.007

        // Calculate expected allocations
        uint256 charityTotal = (pot * 300) / 10000; // 3%
        uint256 ownerFee = (pot * 300) / 10000;     // 3%
        uint256 playersPool = (pot * 9400) / 10000; // 94%

        console.log("\n--- Expected Allocations ---");
        console.log("Charity (3%%): %s PIZZA", charityTotal / 1e18);
        console.log("Owner Fee (3%%): %s PIZZA", ownerFee / 1e18);
        console.log("Players Pool (94%%): %s PIZZA", playersPool / 1e18);

        // Warp to after game end
        DailyGame memory game = _getDailyGame(1);
        vm.warp(game.endTime + 1);

        // Record pre-settlement balances
        uint256[] memory playerBalancesBefore = new uint256[](20);
        for (uint256 i = 0; i < 20; i++) {
            playerBalancesBefore[i] = pizzaToken.balanceOf(players[i]);
        }

        // Settle the game
        pizzaParty.settleDailyGame();

        // Verify game was settled
        game = _getDailyGame(1);
        assertTrue(game.settled, "Game should be settled");

        // Get winners
        address[] memory winners = pizzaParty.getDailyGameWinners(1);
        assertEq(winners.length, 8, "Should have 8 winners");

        console.log("\n--- 8 Winners ---");
        uint256 perWinnerPayout = playersPool / 8;
        uint256 perWinnerUsd = (perWinnerPayout * 7) / 1e15; // Convert to cents (USD * 1000 for display)
        console.log("Per Winner Payout: %s PIZZA", perWinnerPayout / 1e18);
        console.log("Per Winner USD: $%s.%s", perWinnerUsd / 1000, perWinnerUsd % 1000);

        for (uint256 i = 0; i < 8; i++) {
            console.log("Winner %s: %s", i + 1, winners[i]);
        }

        // Verify winner payouts
        uint256 totalWinnerPayouts = 0;
        for (uint256 i = 0; i < 8; i++) {
            address winner = winners[i];
            // Find the player index
            for (uint256 j = 0; j < 20; j++) {
                if (players[j] == winner) {
                    uint256 received = pizzaToken.balanceOf(winner) - playerBalancesBefore[j];
                    totalWinnerPayouts += received;
                    console.log("Winner %s received: %s PIZZA", j, received / 1e18);
                    break;
                }
            }
        }

        // Verify charity payments
        uint256 charityPerWallet = charityTotal / 3;
        uint256 charityRemainder = charityTotal - (charityPerWallet * 3);
        assertEq(pizzaToken.balanceOf(charity1), charityPerWallet + charityRemainder, "Charity1 should get share + remainder");
        assertEq(pizzaToken.balanceOf(charity2), charityPerWallet, "Charity2 should get equal share");
        assertEq(pizzaToken.balanceOf(charity3), charityPerWallet, "Charity3 should get equal share");

        console.log("\n--- Charity Payouts ---");
        console.log("Charity1: %s PIZZA", pizzaToken.balanceOf(charity1) / 1e18);
        console.log("Charity2: %s PIZZA", pizzaToken.balanceOf(charity2) / 1e18);
        console.log("Charity3: %s PIZZA", pizzaToken.balanceOf(charity3) / 1e18);
    }

    function test_OwnerFeeDistributionToParlorOwners() public {
        console.log("\n=== Owner Fee Distribution Test ===");

        // Enter 20 players
        for (uint256 i = 0; i < 20; i++) {
            vm.startPrank(players[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        uint256 pot = ENTRY_FEE * 20;
        uint256 ownerFee = (pot * 300) / 10000; // 3% owner fee

        console.log("Total Pot: %s PIZZA", pot / 1e18);
        console.log("Owner Fee (3%%): %s PIZZA", ownerFee / 1e18);

        // Warp and settle
        DailyGame memory game = _getDailyGame(1);
        vm.warp(game.endTime + 1);

        // Record balances before settlement
        uint256 treasuryBefore = pizzaToken.balanceOf(treasury);
        uint256 opsBefore = pizzaToken.balanceOf(ops);

        pizzaParty.settleDailyGame();

        // Verify owner fee was sent to ParlorManager
        // The allocateFees() should have been auto-called

        // Check franchise fee split (30% treasury, 50% owners, 20% ops)
        uint256 franchiseTreasury = (ownerFee * 3000) / 10000; // 30%
        uint256 franchiseOwners = (ownerFee * 5000) / 10000;   // 50%
        uint256 franchiseOps = ownerFee - franchiseTreasury - franchiseOwners; // Remainder (~20%)

        console.log("\n--- Franchise Fee Split ---");
        console.log("To Treasury (30%%): %s PIZZA", franchiseTreasury / 1e18);
        console.log("To Parlor Owners (50%%): %s PIZZA", franchiseOwners / 1e18);
        console.log("To Ops (20%%): %s PIZZA", franchiseOps / 1e18);

        // Verify treasury and ops received their cut
        uint256 treasuryReceived = pizzaToken.balanceOf(treasury) - treasuryBefore;
        uint256 opsReceived = pizzaToken.balanceOf(ops) - opsBefore;

        console.log("\n--- Actual Payouts ---");
        console.log("Treasury received: %s PIZZA", treasuryReceived / 1e18);
        console.log("Ops received: %s PIZZA", opsReceived / 1e18);

        // Check owner allocations (proportional to parlors owned)
        // Total parlors = 7
        // Owner1 has 3 (3/7 of owner pool)
        // Owners 2-5 have 1 each (1/7 each of owner pool)
        uint256 amountPerParlor = franchiseOwners / 7; // 7 total parlors

        uint256 owner1Expected = amountPerParlor * 3;
        uint256 owner2Expected = amountPerParlor * 1;

        console.log("\n--- Claimable Balances ---");
        console.log("Per Parlor: %s PIZZA", amountPerParlor / 1e18);

        uint256 owner1Claimable = parlorManager.claimableBalance(parlorOwner1);
        uint256 owner2Claimable = parlorManager.claimableBalance(parlorOwner2);
        uint256 owner3Claimable = parlorManager.claimableBalance(parlorOwner3);
        uint256 owner4Claimable = parlorManager.claimableBalance(parlorOwner4);
        uint256 owner5Claimable = parlorManager.claimableBalance(parlorOwner5);

        console.log("Owner1 (3 parlors): %s PIZZA", owner1Claimable / 1e18);
        console.log("Owner2 (1 parlor): %s PIZZA", owner2Claimable / 1e18);
        console.log("Owner3 (1 parlor): %s PIZZA", owner3Claimable / 1e18);
        console.log("Owner4 (1 parlor): %s PIZZA", owner4Claimable / 1e18);
        console.log("Owner5 (1 parlor): %s PIZZA", owner5Claimable / 1e18);

        // Verify proportional distribution
        assertEq(owner1Claimable, owner1Expected, "Owner1 should have 3x per-parlor amount");
        assertEq(owner2Claimable, owner2Expected, "Owner2 should have 1x per-parlor amount");
        assertEq(owner3Claimable, owner2Expected, "Owner3 should have 1x per-parlor amount");
        assertEq(owner4Claimable, owner2Expected, "Owner4 should have 1x per-parlor amount");
        assertEq(owner5Claimable, owner2Expected, "Owner5 should have 1x per-parlor amount");

        // Verify owner1 has 3x the amount of others
        assertEq(owner1Claimable, owner2Claimable * 3, "Owner1 should have exactly 3x of Owner2");
    }

    function test_ParlorOwnersCanClaimFees() public {
        console.log("\n=== Parlor Owners Claim Fees Test ===");

        // Enter 20 players and settle
        for (uint256 i = 0; i < 20; i++) {
            vm.startPrank(players[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        DailyGame memory game = _getDailyGame(1);
        vm.warp(game.endTime + 1);
        pizzaParty.settleDailyGame();

        // Get claimable amounts
        uint256 owner1Claimable = parlorManager.claimableBalance(parlorOwner1);
        uint256 owner2Claimable = parlorManager.claimableBalance(parlorOwner2);

        console.log("Owner1 claimable: %s PIZZA", owner1Claimable / 1e18);
        console.log("Owner2 claimable: %s PIZZA", owner2Claimable / 1e18);

        assertTrue(owner1Claimable > 0, "Owner1 should have claimable balance");
        assertTrue(owner2Claimable > 0, "Owner2 should have claimable balance");

        // Record balances before claim
        uint256 owner1Before = pizzaToken.balanceOf(parlorOwner1);
        uint256 owner2Before = pizzaToken.balanceOf(parlorOwner2);

        // Owner1 claims fees
        vm.prank(parlorOwner1);
        parlorManager.claimMyFees();

        // Owner2 claims fees
        vm.prank(parlorOwner2);
        parlorManager.claimMyFees();

        // Verify tokens were transferred
        uint256 owner1After = pizzaToken.balanceOf(parlorOwner1);
        uint256 owner2After = pizzaToken.balanceOf(parlorOwner2);

        assertEq(owner1After - owner1Before, owner1Claimable, "Owner1 should receive claimed amount");
        assertEq(owner2After - owner2Before, owner2Claimable, "Owner2 should receive claimed amount");

        console.log("\n--- After Claiming ---");
        console.log("Owner1 received: %s PIZZA", (owner1After - owner1Before) / 1e18);
        console.log("Owner2 received: %s PIZZA", (owner2After - owner2Before) / 1e18);

        // Verify claimable balances are now 0
        assertEq(parlorManager.claimableBalance(parlorOwner1), 0, "Owner1 claimable should be 0");
        assertEq(parlorManager.claimableBalance(parlorOwner2), 0, "Owner2 claimable should be 0");
    }

    function test_CompleteScenarioWithUsdValues() public {
        console.log("\n=== Complete Settlement Scenario ===");
        console.log("PIZZA Price: $0.007");
        console.log("Players: 20 (all paying $1)");
        console.log("Parlor Owners: 5 (with 7 parlors total)");
        console.log("  - Owner1: 3 parlors");
        console.log("  - Owner2-5: 1 parlor each");

        // Enter 20 players
        for (uint256 i = 0; i < 20; i++) {
            vm.startPrank(players[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        // Calculate values
        uint256 pot = ENTRY_FEE * 20; // Total pot
        console.log("\n--- Pot Details ---");
        console.log("Total Pot: %s PIZZA (~$20)", pot / 1e18);

        uint256 charityTotal = (pot * 300) / 10000; // 3%
        uint256 ownerFee = (pot * 300) / 10000;     // 3%
        uint256 playersPool = (pot * 9400) / 10000; // 94%

        uint256 perWinner = playersPool / 8;

        console.log("\n--- Allocations ---");
        console.log("Charity (3%%): %s PIZZA (~$0.60)", charityTotal / 1e18);
        console.log("Owner Fee (3%%): %s PIZZA (~$0.60)", ownerFee / 1e18);
        console.log("Players Pool (94%%): %s PIZZA (~$18.80)", playersPool / 1e18);
        console.log("Per Winner (94%%/8): %s PIZZA (~$2.35)", perWinner / 1e18);

        // Settlement
        DailyGame memory game = _getDailyGame(1);
        vm.warp(game.endTime + 1);

        // Use settleDailyGameWithUsd for proper USD tracking
        uint256 usdCentsPerWinner = 235; // $2.35
        pizzaParty.settleDailyGameWithUsd(usdCentsPerWinner);

        // Verify USD value stored
        uint256 storedUsd = pizzaParty.getDailyGameUsdValue(1);
        assertEq(storedUsd, usdCentsPerWinner, "USD value should be stored");
        console.log("\nStored USD cents per winner: %s ($%s.%s)", storedUsd, storedUsd / 100, storedUsd % 100);

        // Verify winners
        address[] memory winners = pizzaParty.getDailyGameWinners(1);
        assertEq(winners.length, 8, "Should have 8 winners");

        console.log("\n--- Winners ---");
        for (uint256 i = 0; i < winners.length; i++) {
            console.log("Winner %s: %s", i + 1, winners[i]);
        }

        // Verify parlor owner fee distribution
        uint256 franchiseOwnerPool = (ownerFee * 5000) / 10000; // 50% to owners
        uint256 perParlor = franchiseOwnerPool / 7;

        console.log("\n--- Parlor Owner Fees ---");
        console.log("Total to Owners: %s PIZZA", franchiseOwnerPool / 1e18);
        console.log("Per Parlor: %s PIZZA", perParlor / 1e18);

        uint256 owner1Fees = parlorManager.claimableBalance(parlorOwner1);
        uint256 owner2Fees = parlorManager.claimableBalance(parlorOwner2);
        uint256 owner3Fees = parlorManager.claimableBalance(parlorOwner3);
        uint256 owner4Fees = parlorManager.claimableBalance(parlorOwner4);
        uint256 owner5Fees = parlorManager.claimableBalance(parlorOwner5);

        console.log("\n--- Claimable Fees ---");
        console.log("Owner1 (3 parlors): %s PIZZA (~$%s)", owner1Fees / 1e18, (owner1Fees * 7) / 1e18 / 1000);
        console.log("Owner2 (1 parlor): %s PIZZA (~$%s)", owner2Fees / 1e18, (owner2Fees * 7) / 1e18 / 1000);
        console.log("Owner3 (1 parlor): %s PIZZA (~$%s)", owner3Fees / 1e18, (owner3Fees * 7) / 1e18 / 1000);
        console.log("Owner4 (1 parlor): %s PIZZA (~$%s)", owner4Fees / 1e18, (owner4Fees * 7) / 1e18 / 1000);
        console.log("Owner5 (1 parlor): %s PIZZA (~$%s)", owner5Fees / 1e18, (owner5Fees * 7) / 1e18 / 1000);

        // Verify proportional distribution
        assertEq(owner1Fees, perParlor * 3, "Owner1 should get 3x per-parlor");
        assertEq(owner2Fees, perParlor, "Owner2 should get 1x per-parlor");
        assertEq(owner1Fees, owner2Fees * 3, "Owner1 should have 3x Owner2's fees");

        // All owners claim their fees
        console.log("\n--- Claiming Fees ---");

        vm.prank(parlorOwner1);
        parlorManager.claimMyFees();
        console.log("Owner1 claimed successfully");

        vm.prank(parlorOwner2);
        parlorManager.claimMyFees();
        console.log("Owner2 claimed successfully");

        vm.prank(parlorOwner3);
        parlorManager.claimMyFees();
        console.log("Owner3 claimed successfully");

        vm.prank(parlorOwner4);
        parlorManager.claimMyFees();
        console.log("Owner4 claimed successfully");

        vm.prank(parlorOwner5);
        parlorManager.claimMyFees();
        console.log("Owner5 claimed successfully");

        // Verify all balances are now 0
        assertEq(parlorManager.claimableBalance(parlorOwner1), 0, "Owner1 should have 0 claimable");
        assertEq(parlorManager.claimableBalance(parlorOwner2), 0, "Owner2 should have 0 claimable");
        assertEq(parlorManager.claimableBalance(parlorOwner3), 0, "Owner3 should have 0 claimable");
        assertEq(parlorManager.claimableBalance(parlorOwner4), 0, "Owner4 should have 0 claimable");
        assertEq(parlorManager.claimableBalance(parlorOwner5), 0, "Owner5 should have 0 claimable");

        console.log("\nAll parlor owners successfully claimed their fees!");
    }

    function test_ExactMathVerification() public {
        console.log("\n=== Exact Math Verification ===");

        // Enter 20 players
        for (uint256 i = 0; i < 20; i++) {
            vm.startPrank(players[i]);
            pizzaToken.approve(address(pizzaParty), ENTRY_FEE);
            pizzaParty.enterDailyGame(ENTRY_FEE, "");
            vm.stopPrank();
        }

        // Exact calculations
        uint256 pot = ENTRY_FEE * 20;
        console.log("Pot (wei): %s", pot);
        console.log("Pot (PIZZA): %s.%s", pot / 1e18, (pot % 1e18) / 1e14); // Show decimals

        uint256 charityTotal = (pot * 300) / 10000;
        uint256 ownerFee = (pot * 300) / 10000;
        uint256 playersPool = (pot * 9400) / 10000;

        console.log("\nCharity (3%%): %s wei", charityTotal);
        console.log("Owner Fee (3%%): %s wei", ownerFee);
        console.log("Players Pool (94%%): %s wei", playersPool);

        // Verify rounding doesn't lose funds
        uint256 totalAllocated = charityTotal + ownerFee + playersPool;
        uint256 dust = pot - totalAllocated;
        console.log("Total Allocated: %s wei", totalAllocated);
        console.log("Dust (remainder): %s wei", dust);

        // Per winner
        uint256 perWinner = playersPool / 8;
        uint256 winnerRemainder = playersPool - (perWinner * 8);
        console.log("\nPer Winner: %s wei", perWinner);
        console.log("Winner Remainder: %s wei", winnerRemainder);

        // Franchise fee breakdown
        uint256 franchiseTreasury = (ownerFee * 3000) / 10000;
        uint256 franchiseOwners = (ownerFee * 5000) / 10000;
        uint256 franchiseOps = ownerFee - franchiseTreasury - franchiseOwners;

        console.log("\nFranchise Treasury (30%%): %s wei", franchiseTreasury);
        console.log("Franchise Owners (50%%): %s wei", franchiseOwners);
        console.log("Franchise Ops (20%%): %s wei", franchiseOps);

        // Per parlor
        uint256 perParlor = franchiseOwners / 7;
        uint256 parlorDust = franchiseOwners - (perParlor * 7);
        console.log("\nPer Parlor: %s wei", perParlor);
        console.log("Parlor Dust: %s wei", parlorDust);

        // Owner allocations
        uint256 owner1Share = perParlor * 3;
        uint256 owner2Share = perParlor * 1;

        console.log("\nOwner1 (3 parlors): %s wei", owner1Share);
        console.log("Owner2-5 (1 parlor each): %s wei each", owner2Share);

        // Convert to USD at $0.007
        console.log("\n--- USD Values at $0.007/PIZZA ---");
        console.log("Pot: $%s.%s", (pot * 7 / 1e18) / 1000, (pot * 7 / 1e18) % 1000);
        console.log("Per Winner: $%s.%s", (perWinner * 7 / 1e18) / 1000, (perWinner * 7 / 1e18) % 1000);
        console.log("Owner1 Fees: $%s.%s", (owner1Share * 7 / 1e18) / 1000, (owner1Share * 7 / 1e18) % 1000);
        console.log("Owner2 Fees: $%s.%s", (owner2Share * 7 / 1e18) / 1000, (owner2Share * 7 / 1e18) % 1000);

        // Settle and verify
        DailyGame memory game = _getDailyGame(1);
        vm.warp(game.endTime + 1);
        pizzaParty.settleDailyGame();

        // Verify claimable balances match calculated amounts
        assertEq(parlorManager.claimableBalance(parlorOwner1), owner1Share, "Owner1 claimable should match");
        assertEq(parlorManager.claimableBalance(parlorOwner2), owner2Share, "Owner2 claimable should match");
    }

    // Helper struct to match DailyGame storage
    struct DailyGame {
        uint256 startTime;
        uint256 endTime;
        address firstPlayer;
        uint256 potAmount;
        bool settled;
    }

    function _getDailyGame(uint256 gameId) internal view returns (DailyGame memory) {
        (uint256 startTime, uint256 endTime, address firstPlayer, uint256 potAmount, bool settled) = pizzaParty.dailyGames(gameId);
        return DailyGame(startTime, endTime, firstPlayer, potAmount, settled);
    }
}
