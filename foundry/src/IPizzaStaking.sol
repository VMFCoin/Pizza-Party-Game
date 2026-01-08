// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPizzaStaking
 * @notice Interface for Pizza Party staking contract
 * @dev Used by PizzaPartyV2Upgradeable to interact with staking system
 */
interface IPizzaStaking {
    /**
     * @notice Get user's staking tier as uint8
     * @param user Address to check
     * @return Tier level (0 = SliceRunner, 1 = OvenOperator, 2 = PieBoss, 3 = PizzaTycoon)
     */
    function getTierLevel(address user) external view returns (uint8);

    /**
     * @notice Get yield boost multiplier for user's tier
     * @param user Address to check
     * @return Yield boost in BPS (10000 = 1x, 15000 = 1.5x, 20000 = 2x, 30000 = 3x)
     */
    function getTierYieldBoost(address user) external view returns (uint256);

    /**
     * @notice Get weekly topping bonus for user's tier
     * @param user Address to check
     * @return Number of bonus toppings per week (0, 1, 3, or 5)
     */
    function getToppingBonus(address user) external view returns (uint256);

    /**
     * @notice Notify staking contract of reward distribution
     * @param amount Amount of PIZZA being distributed to stakers (10% of daily pot)
     */
    function notifyRewardAmount(uint256 amount) external;
}
