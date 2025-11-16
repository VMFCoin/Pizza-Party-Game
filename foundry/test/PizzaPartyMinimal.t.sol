// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../src/PizzaPartyMinimalEntry.sol";
import "../src/mocks/MockVMF.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
}

contract PizzaPartyMinimalTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockVMF private token;
    PizzaParty private pizza;
    address private treasury = address(0xBEEF);

    function setUp() public {
        token = new MockVMF();
        pizza = new PizzaParty(address(token), treasury);
    }

    function testDailyJackpotDistribution() public {
        setUp();
        uint256 entryFee = pizza.ENTRY_FEE();
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
            pizza.enterDailyGameNoRef();
            vm.stopPrank();
        }

        (, uint256 endTime, , , ) = pizza.getCurrentDailyGame();
        vm.warp(endTime + 1);

        uint256 beforeFirst = token.balanceOf(participants[0]);
        uint256 beforeSecond = token.balanceOf(participants[1]);

        pizza.settleDailyGame();

        uint256 pot = entryFee * participants.length;
        uint256 bonus = (pot * 100) / 10000;
        uint256 baseShare = (pot - bonus) / participants.length;
        uint256 expectedAfterEntry = entryFee * 9;

        require(token.balanceOf(address(pizza)) == 0, "Pot not cleared");
        require(
            token.balanceOf(participants[0]) == expectedAfterEntry + baseShare + bonus,
            "First player payout mismatch"
        );
        require(
            token.balanceOf(participants[1]) == expectedAfterEntry + baseShare,
            "Winner payout mismatch"
        );
        require(beforeFirst == expectedAfterEntry, "before state mismatch first");
        require(beforeSecond == expectedAfterEntry, "before state mismatch second");
    }

    function testWeeklyClaimAndSettlement() public {
        setUp();
        uint256 entryFee = pizza.ENTRY_FEE();
        address[3] memory claimants = [address(0x111), address(0x222), address(0x333)];

        for (uint256 i = 0; i < claimants.length; i++) {
            token.mint(claimants[i], entryFee * 10);
            vm.startPrank(claimants[i]);
            token.approve(address(pizza), type(uint256).max);
            pizza.enterDailyGameNoRef();
            vm.stopPrank();
        }

        (uint256 claimStart, uint256 claimEnd, , , , ) = pizza.getCurrentWeeklyGame();
        vm.warp(claimStart + 1);

        for (uint256 i = 0; i < claimants.length; i++) {
            vm.prank(claimants[i]);
            pizza.claimToppings();
        }

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
}
