// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ==================================================================================
 * PIZZA STAKING INTERFACE - IPizzaStaking.sol
 * ==================================================================================
 *
 * PURPOSE:
 * This interface defines the functions that PizzaPartyV2Upgradeable needs to call
 * on the staking contract. Using an interface instead of importing the full contract
 * keeps bytecode size small and creates clean separation between contracts.
 *
 * USAGE:
 * In PizzaPartyV2Upgradeable, import this interface and cast the staking contract address:
 *
 *   import "./IPizzaStaking.sol";
 *
 *   IPizzaStaking stakingContract = IPizzaStaking(stakingContractAddress);
 *   uint8 tier = stakingContract.getTierLevel(userAddress);
 *
 * ==================================================================================
 */

/**
 * @title IPizzaStaking
 * @notice Interface for Pizza Party staking contract
 * @dev Used by PizzaPartyV2Upgradeable to interact with staking system
 */
interface IPizzaStaking {

    // ==================================================================================
    // ENUMS (must match PizzaStakingV1Upgradeable)
    // ==================================================================================

    /**
     * @notice Staking tiers
     */
    enum Tier {
        SliceRunner,    // 0: Any amount
        OvenOperator,   // 1: 50M+ PIZZA
        PieBoss,        // 2: 200M+ PIZZA
        PizzaTycoon     // 3: 500M+ PIZZA
    }

    // ==================================================================================
    // VIEW FUNCTIONS - Called by PizzaPartyV2Upgradeable
    // ==================================================================================

    /**
     * @notice Get user's staking tier as uint8
     * @param user Address to check
     * @return Tier level (0 = SliceRunner, 1 = OvenOperator, 2 = PieBoss, 3 = PizzaTycoon)
     */
    function getTierLevel(address user) external view returns (uint8);

    /**
     * @notice Get weekly topping bonus for user's tier
     * @param user Address to check
     * @return Number of bonus toppings per week (0, 1, 3, or 5)
     */
    function getToppingBonus(address user) external view returns (uint256);

    /**
     * @notice Get weekly weight boost for lottery selection
     * @param user Address to check
     * @return Weight multiplier in BPS (10000 = 1x, 12500 = 1.25x, etc.)
     */
    function getWeeklyWeightBoost(address user) external view returns (uint256);

    /**
     * @notice Get user's total staked amount
     * @param user Address to check
     * @return stakedAmount Amount of PIZZA staked
     * @return lockType 0 = Flexible, 1 = Locked
     * @return stakeTimestamp When stake was created
     * @return lockEndTimestamp When lock ends (0 if Flexible)
     * @return lastClaimTimestamp Last reward claim time
     * @return rewardDebt For reward calculations
     * @return lastToppingClaimWeek Last week toppings were claimed
     */
    function stakes(address user) external view returns (
        uint256 stakedAmount,
        uint8 lockType,
        uint256 stakeTimestamp,
        uint256 lockEndTimestamp,
        uint256 lastClaimTimestamp,
        uint256 rewardDebt,
        uint256 lastToppingClaimWeek
    );

    // ==================================================================================
    // EXTERNAL FUNCTIONS - Called by PizzaPartyV2Upgradeable
    // ==================================================================================

    /**
     * @notice Notify staking contract of reward distribution
     * @param amount Amount of PIZZA being distributed to stakers (4% of daily pot)
     */
    function notifyRewardAmount(uint256 amount) external;
}
