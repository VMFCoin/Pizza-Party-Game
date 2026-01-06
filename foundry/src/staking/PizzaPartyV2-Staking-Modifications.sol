// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ==================================================================================
 * PIZZA PARTY V2 MODIFICATIONS - Staking Integration
 * ==================================================================================
 *
 * PURPOSE:
 * This file documents all changes needed to add staking integration
 * to PizzaPartyV2Upgradeable.
 *
 * IMPORTANT:
 * This is NOT a complete contract - it shows ONLY the additions/changes.
 * Apply these modifications to your existing PizzaPartyV2Upgradeable contract.
 *
 * INSTRUCTIONS:
 * 1. Open your existing PizzaPartyV2Upgradeable.sol
 * 2. Add the new imports, state variables, events, and functions shown below
 * 3. Modify the existing functions as indicated
 * 4. DO NOT remove any existing functionality unless explicitly stated
 *
 * ==================================================================================
 */

// ==================================================================================
// STEP 1: ADD NEW IMPORT
// ==================================================================================

// Add this import at the top of the file with other imports:
// import "./IPizzaStaking.sol";


// ==================================================================================
// STEP 2: ADD NEW STATE VARIABLES
// ==================================================================================

// Add these state variables in the contract (after existing state variables):

/**
 * @notice Address of the staking contract
 * @dev Set via adminSetStakingContract()
 */
// address public stakingContract;

/**
 * @notice Fee sent to stakers from each pot (in BPS)
 * @dev 400 = 4%. Set via adminSetStakingFeeBPS()
 */
// uint256 public stakingFeeBPS;


// ==================================================================================
// STEP 3: ADD NEW EVENTS
// ==================================================================================

// Add these events:

// /// @notice Emitted when staking contract is set
// event StakingContractSet(address indexed stakingContract);

// /// @notice Emitted when staking fee is set
// event StakingFeeBPSSet(uint256 feeBPS);

// /// @notice Emitted when staking rewards are distributed from daily pot
// event StakingRewardsDistributed(uint256 amount);


// ==================================================================================
// STEP 4: ADD NEW ADMIN FUNCTIONS
// ==================================================================================

/**
 * @notice Set the staking contract address
 * @param _stakingContract Address of PizzaStakingV1Upgradeable
 */
// function adminSetStakingContract(address _stakingContract) external onlyOwner {
//     require(_stakingContract != address(0), "Zero address");
//     stakingContract = _stakingContract;
//     emit StakingContractSet(_stakingContract);
// }

/**
 * @notice Set the staking fee percentage
 * @param _feeBPS Fee in basis points (400 = 4%)
 */
// function adminSetStakingFeeBPS(uint256 _feeBPS) external onlyOwner {
//     require(_feeBPS <= 1000, "Fee too high"); // Max 10%
//     stakingFeeBPS = _feeBPS;
//     emit StakingFeeBPSSet(_feeBPS);
// }


// ==================================================================================
// STEP 5: MODIFY _settleDailyGame() FUNCTION
// ==================================================================================

/**
 * Find your existing _settleDailyGame() function and add the staking fee
 * distribution logic. Insert this code AFTER calculating the pot and
 * BEFORE distributing to winners.
 *
 * The staking fee (4%) comes directly from the daily pot, just like
 * charity (3%) and parlors (3%).
 */

// ADD THIS CODE BLOCK inside _settleDailyGame():
// (Insert after pot is calculated, before winner distribution)

// --- START OF NEW CODE TO ADD ---

// Distribute staking fee if configured (4% of pot goes to stakers)
// if (stakingFeeBPS > 0 && stakingContract != address(0)) {
//     uint256 stakingFee = (pot * stakingFeeBPS) / BPS_DENOMINATOR;
//
//     if (stakingFee > 0) {
//         // Transfer tokens to staking contract
//         IERC20(pizzaToken).safeTransfer(stakingContract, stakingFee);
//
//         // Notify staking contract of the reward so stakers can claim
//         IPizzaStaking(stakingContract).notifyRewardAmount(stakingFee);
//
//         // Reduce pot by staking fee
//         pot -= stakingFee;
//
//         emit StakingRewardsDistributed(stakingFee);
//     }
// }

// --- END OF NEW CODE TO ADD ---


// ==================================================================================
// STEP 6: MODIFY claimToppings() FUNCTION (if it exists)
// ==================================================================================

/**
 * If your contract has a claimToppings() function where players claim their
 * bonus toppings, add the staking tier bonus here.
 *
 * Find where toppingsEarned is calculated/added and include the staking bonus.
 */

// ADD THIS CODE where toppings are calculated:

// --- START OF NEW CODE TO ADD ---

// Add staking tier topping bonus
// if (stakingContract != address(0)) {
//     uint256 stakingBonus = IPizzaStaking(stakingContract).getToppingBonus(msg.sender);
//     if (stakingBonus > 0) {
//         player.toppingsEarned += stakingBonus;
//     }
// }

// --- END OF NEW CODE TO ADD ---


// ==================================================================================
// STEP 7: MODIFY _selectWeightedWinners() FUNCTION (if applicable)
// ==================================================================================

/**
 * If your contract has weighted winner selection, apply the staking weight boost.
 * Find where player weights are calculated and multiply by the staking boost.
 */

// MODIFY the weight calculation to include staking boost:

// --- EXAMPLE OF MODIFIED CODE ---

// Original code might look like:
// uint256 weight = player.entries + player.toppingsEarned;

// Modified code with staking boost:
// uint256 weight = player.entries + player.toppingsEarned;

// Apply staking weight boost
// if (stakingContract != address(0)) {
//     uint256 boostBPS = IPizzaStaking(stakingContract).getWeeklyWeightBoost(playerAddress);
//     weight = (weight * boostBPS) / BPS_DENOMINATOR;
// }

// --- END OF MODIFIED CODE ---


// ==================================================================================
// STEP 8: ADD STORAGE GAP FOR UPGRADEABILITY
// ==================================================================================

/**
 * If you don't already have a storage gap, add one at the end of your
 * state variables. This reserves space for future upgrades.
 *
 * If you already have a gap, reduce its size by 2 (for the 2 new variables).
 */

// Add at end of state variables (or adjust existing gap):
// uint256[48] private __gap; // Reserve storage slots for future upgrades


// ==================================================================================
// COMPLETE EXAMPLE: What the integration looks like in _settleDailyGame()
// ==================================================================================

/**
 * This shows a simplified example of how _settleDailyGame might look with
 * staking integration. Your actual implementation will vary based on
 * existing code.
 *
 * POT DISTRIBUTION ORDER:
 * 1. Stakers: 4%
 * 2. Charity: 3%
 * 3. Parlors: 3%
 * 4. Winners: 90%
 */

/*
function _settleDailyGame(uint256 gameDay) internal {
    GameData storage game = games[gameDay];
    require(!game.settled, "Already settled");
    require(block.timestamp >= game.endTime, "Game not ended");

    uint256 pot = game.totalPot;

    // ===== STAKING FEE DISTRIBUTION (4% of pot) =====
    if (stakingFeeBPS > 0 && stakingContract != address(0)) {
        uint256 stakingFee = (pot * stakingFeeBPS) / BPS_DENOMINATOR;

        if (stakingFee > 0) {
            IERC20(pizzaToken).safeTransfer(stakingContract, stakingFee);
            IPizzaStaking(stakingContract).notifyRewardAmount(stakingFee);
            pot -= stakingFee;
            emit StakingRewardsDistributed(stakingFee);
        }
    }
    // ===== END STAKING FEE DISTRIBUTION =====

    // ===== CHARITY FEE (3% of pot) =====
    uint256 charityFee = (pot * charityFeeBPS) / BPS_DENOMINATOR;
    if (charityFee > 0 && charityWallet != address(0)) {
        IERC20(pizzaToken).safeTransfer(charityWallet, charityFee);
    }

    // ===== PARLOR FEE (3% of pot) =====
    uint256 parlorFee = (pot * parlorFeeBPS) / BPS_DENOMINATOR;
    if (parlorFee > 0 && parlorManager != address(0)) {
        IERC20(pizzaToken).safeTransfer(parlorManager, parlorFee);
    }

    // ===== WINNER POT (90% of pot) =====
    uint256 winnerPot = pot - charityFee - parlorFee;

    // Select and pay winners
    // ... existing winner selection and payment logic ...

    game.settled = true;
    emit GameSettled(gameDay, winnerPot);
}
*/


// ==================================================================================
// DEPLOYMENT NOTES
// ==================================================================================

/**
 * After upgrading PizzaPartyV2:
 *
 * 1. Deploy the upgrade using your proxy pattern
 * 2. Call adminSetStakingContract() with staking contract address
 * 3. Call adminSetStakingFeeBPS(400) to set 4% staking fee
 *
 * The staking integration will automatically activate once the staking
 * contract address is set and stakingFeeBPS > 0.
 */
