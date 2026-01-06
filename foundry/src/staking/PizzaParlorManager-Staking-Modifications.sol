// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ==================================================================================
 * PIZZA PARLOR MANAGER MODIFICATIONS - New Token Support
 * ==================================================================================
 *
 * PURPOSE:
 * This file documents all changes needed to upgrade PizzaParlorManagerUpgradeable
 * to work with the new PIZZA token address after Clanker launch.
 *
 * IMPORTANT:
 * This is NOT a complete contract - it shows ONLY the additions/changes.
 * Apply these modifications to your existing PizzaParlorManagerUpgradeable contract.
 *
 * WHY THIS IS NEEDED:
 * The Parlor Manager handles referral rewards in PIZZA tokens. When we launch
 * the new token on Clanker, we need to update the token address used for
 * parlor reward distributions.
 *
 * INSTRUCTIONS:
 * 1. Open your existing PizzaParlorManagerUpgradeable.sol
 * 2. Add the new state variable, event, and admin function
 * 3. Update all token references to use the new variable
 *
 * ==================================================================================
 */

// ==================================================================================
// STEP 1: ADD NEW STATE VARIABLE
// ==================================================================================

// Add this state variable (after existing state variables):

/**
 * @notice Address of the PIZZA token
 * @dev Set via adminSetPizzaToken() after Clanker launch
 */
// address public pizzaToken;


// ==================================================================================
// STEP 2: ADD NEW EVENT
// ==================================================================================

// Add this event:

// /// @notice Emitted when pizza token address is set
// event PizzaTokenSet(address indexed token);


// ==================================================================================
// STEP 3: ADD NEW ADMIN FUNCTION
// ==================================================================================

/**
 * @notice Set the PIZZA token address
 * @param _pizzaToken Address of the new PIZZA token
 */
// function adminSetPizzaToken(address _pizzaToken) external onlyOwner {
//     require(_pizzaToken != address(0), "Zero address");
//     pizzaToken = _pizzaToken;
//     emit PizzaTokenSet(_pizzaToken);
// }


// ==================================================================================
// STEP 4: UPDATE TOKEN REFERENCES
// ==================================================================================

/**
 * Search your contract for all references to the PIZZA token.
 * These need to be updated to use the new `pizzaToken` state variable.
 *
 * Common places to check:
 * - Parlor reward distributions
 * - Fee claims by parlor owners
 * - Any ERC20 balance checks
 *
 * Replace hardcoded token addresses with `pizzaToken` variable.
 */

// EXAMPLE: If you have code like this:
// IERC20(0xOldTokenAddress).safeTransfer(parlorOwner, rewardAmount);

// Change it to:
// IERC20(pizzaToken).safeTransfer(parlorOwner, rewardAmount);


// EXAMPLE 2: If you have a constant or immutable:
// address public constant PIZZA_TOKEN = 0xOldTokenAddress;

// Remove the constant and use the state variable instead.
// Make sure to add a check that pizzaToken is set before any transfer:
// require(pizzaToken != address(0), "Token not set");


// ==================================================================================
// STEP 5: ADD STORAGE GAP (if not already present)
// ==================================================================================

/**
 * If you don't already have a storage gap, add one at the end of your
 * state variables. This reserves space for future upgrades.
 *
 * If you already have a gap, reduce its size by 1 (for the new variable).
 */

// Add at end of state variables (or adjust existing gap):
// uint256[49] private __gap; // Reserve storage slots for future upgrades


// ==================================================================================
// STEP 6: UPDATE REWARD DISTRIBUTION (if applicable)
// ==================================================================================

/**
 * If your Parlor Manager has functions that distribute PIZZA rewards to parlors,
 * make sure they check that pizzaToken is set before attempting transfers.
 */

// EXAMPLE: Modified reward distribution function

/*
function distributeParlorsRewards() external {
    require(pizzaToken != address(0), "Token not set");

    // ... your existing distribution logic ...

    // Use pizzaToken for transfers
    IERC20(pizzaToken).safeTransfer(parlorOwner, amount);
}
*/


// ==================================================================================
// COMPLETE EXAMPLE: What a claim function might look like
// ==================================================================================

/**
 * This shows a simplified example of how a parlor claim function might look
 * with the token update. Your actual implementation will vary.
 */

/*
function claimParlorRewards(uint256 parlorId) external {
    require(pizzaToken != address(0), "Token not set");

    Parlor storage parlor = parlors[parlorId];
    require(msg.sender == parlor.owner, "Not parlor owner");

    uint256 pendingRewards = parlor.pendingRewards;
    require(pendingRewards > 0, "No rewards");

    parlor.pendingRewards = 0;

    // Transfer using the new token address
    IERC20(pizzaToken).safeTransfer(msg.sender, pendingRewards);

    emit ParlorRewardsClaimed(parlorId, msg.sender, pendingRewards);
}
*/


// ==================================================================================
// DEPLOYMENT NOTES
// ==================================================================================

/**
 * After upgrading PizzaParlorManager:
 *
 * 1. Deploy the upgrade using your proxy pattern
 * 2. After Clanker launch: call adminSetPizzaToken() with new token address
 *
 * The parlor system will continue working once the new token address is set.
 *
 * IMPORTANT: Make sure both PizzaPartyV2 and PizzaParlorManager use the
 * SAME new token address!
 */


// ==================================================================================
// TESTING CHECKLIST
// ==================================================================================

/**
 * Before deploying to mainnet, verify:
 *
 * [ ] adminSetPizzaToken() can only be called by owner
 * [ ] adminSetPizzaToken() rejects zero address
 * [ ] Reward distribution works with new token
 * [ ] Parlor owners can claim rewards with new token
 * [ ] Old token references are all updated
 * [ ] Storage gap is correctly sized
 */
