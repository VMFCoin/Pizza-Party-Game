// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SendJackpotBonus
 * @notice Manually sends 10M PIZZA jackpot bonus to a user who won before the fix was deployed
 * @dev The user 0xffde42d40175b3b9349Dfb384439dCB811691E09 won jackpot visually in UI
 *      but the old contract rolled its own outcome during claim, so they didn't receive the 10M bonus.
 *      This script compensates them by sending from the staking rewards wallet.
 */
contract SendJackpotBonus is Script {
    // Base mainnet PIZZA token
    address constant PIZZA_TOKEN = 0x08904A677AdB0AC2E12E3C2F2F6fba363635DB46;

    // Jackpot winner who needs compensation
    address constant JACKPOT_WINNER = 0xffde42d40175b3b9349Dfb384439dCB811691E09;

    // 10M PIZZA jackpot bonus
    uint256 constant JACKPOT_BONUS = 10_000_000 * 1e18;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address sender = vm.addr(deployerPrivateKey);

        console.log("=== JACKPOT BONUS COMPENSATION ===");
        console.log("Sender wallet:", sender);
        console.log("Recipient:", JACKPOT_WINNER);
        console.log("Amount: 10,000,000 PIZZA");

        // Check sender balance
        uint256 senderBalance = IERC20(PIZZA_TOKEN).balanceOf(sender);
        console.log("Sender PIZZA balance:", senderBalance / 1e18);

        require(senderBalance >= JACKPOT_BONUS, "Insufficient PIZZA balance");

        vm.startBroadcast(deployerPrivateKey);

        // Transfer 10M PIZZA to the jackpot winner
        IERC20(PIZZA_TOKEN).transfer(JACKPOT_WINNER, JACKPOT_BONUS);

        vm.stopBroadcast();

        // Verify transfer
        uint256 recipientBalance = IERC20(PIZZA_TOKEN).balanceOf(JACKPOT_WINNER);
        console.log("\n=== TRANSFER COMPLETE ===");
        console.log("Recipient new balance:", recipientBalance / 1e18, "PIZZA");
        console.log("10M PIZZA jackpot bonus has been sent to compensate for the pre-fix spin");
    }
}
