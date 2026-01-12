// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ==================================================================================
 * PIZZA PARTY STAKING CONTRACT - PizzaStakingV1Upgradeable.sol
 * ==================================================================================
 *
 * PURPOSE:
 * This contract allows users to stake $PIZZA tokens to earn yield rewards.
 * Stakers receive a portion of the daily lottery pot (4%) distributed via
 * PizzaPartyV2Upgradeable, plus any bonus pool rewards from Spin the Pie.
 *
 * KEY FEATURES:
 * - 4 staking tiers based on amount staked (Slice Runner, Oven Operator, Pie Boss, Pizza Tycoon)
 * - 2 lock periods: No Lock (tier bonus only) or 7-day Lock (+50% bonus)
 * - Early staker boost (+30% for first 60 days)
 * - Spin the Pie mechanic for claiming (toggleable, disabled by default)
 * - Single position per wallet (simplifies accounting)
 *
 * YIELD FORMULA (additive bonuses):
 * finalReward = baseReward × (1 + tierBonus + lockBonus + earlyBonus)
 * - Tier bonuses: +0% / +50% / +100% / +200%
 * - Lock bonus: +0% (no lock) or +50% (7-day lock)
 * - Early bonus: +30% (first 60 days)
 *
 * INTEGRATION:
 * - PizzaPartyV2Upgradeable calls notifyRewardAmount() when settling daily games
 * - PizzaPartyV2Upgradeable queries getTierLevel(), getTierYieldBoost(), getToppingBonus()
 * - Uses same UUPS upgradeable pattern as other Pizza Party contracts
 *
 * FUNDING:
 * - 4% of daily pot comes from PizzaPartyV2 settlement
 * - Bonus pool for Spin the Pie funded by early unstake penalties
 * - Bonus pool can be topped up from Staking Wallet (NOT Treasury)
 *
 * ==================================================================================
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice Interface to get current game ID from PizzaParty
 */
interface IPizzaPartyV2 {
    function dailyGameId() external view returns (uint256);
}

/**
 * @title PizzaStakingV1Upgradeable
 * @author Pizza Party Team
 * @notice Staking contract for $PIZZA token with tiered rewards and Spin the Pie mechanic
 * @dev Upgradeable using UUPS proxy pattern. Integrates with PizzaPartyV2Upgradeable for reward distribution.
 */
contract PizzaStakingV1Upgradeable is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    // ==================================================================================
    // CONSTANTS
    // ==================================================================================

    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Minimum stake value in micro-dollars (1e6 = $1)
    /// @dev Used with pizzaPriceMicroUsd to calculate dynamic MIN_STAKE
    uint256 public constant MIN_STAKE_MICRO_USD = 1_000_000; // $1.00

    /// @notice Fallback minimum stake if price not set: 100 PIZZA
    uint256 public constant MIN_STAKE_FALLBACK = 100 * 1e18;

    /// @notice Maximum stake per wallet: 1,000,000 PIZZA (10% of 10M supply)
    /// @dev For 10M supply testing. Change to 1_000_000_000 for 10B supply.
    uint256 public constant MAX_STAKE = 1_000_000 * 1e18;

    /// @notice Lock period duration: 7 days
    uint256 public constant LOCK_DURATION = 7 days;

    /// @notice Early unstake penalty: 15% (1500 BPS)
    uint256 public constant EARLY_UNSTAKE_PENALTY_BPS = 1500;

    /// @notice Lock bonus: +10% (1000 BPS) added to rewards when locked
    uint256 public constant LOCK_BONUS_BPS = 1000;

    /// @notice Early staker boost: 30% (3000 BPS)
    uint256 public constant EARLY_BOOST_BPS = 3000;

    // ==================================================================================
    // TIER THRESHOLDS (in tokens with 18 decimals)
    // @dev For 10M supply testing. Multiply by 1000 for 10B supply.
    // ==================================================================================

    /// @notice Tier 1 (Oven Operator) threshold: 50,000 PIZZA
    uint256 public constant TIER1_THRESHOLD = 50_000 * 1e18;

    /// @notice Tier 2 (Pie Boss) threshold: 200,000 PIZZA
    uint256 public constant TIER2_THRESHOLD = 200_000 * 1e18;

    /// @notice Tier 3 (Pizza Tycoon) threshold: 500,000 PIZZA
    uint256 public constant TIER3_THRESHOLD = 500_000 * 1e18;

    // ==================================================================================
    // TIER YIELD BONUSES (in BPS - additive, NOT multiplicative)
    // ==================================================================================

    /// @notice Tier 0 (Slice Runner) yield bonus: +1.5%
    uint256 public constant TIER0_BONUS_BPS = 150;

    /// @notice Tier 1 (Oven Operator) yield bonus: +5%
    uint256 public constant TIER1_BONUS_BPS = 500;

    /// @notice Tier 2 (Pie Boss) yield bonus: +10%
    uint256 public constant TIER2_BONUS_BPS = 1000;

    /// @notice Tier 3 (Pizza Tycoon) yield bonus: +20%
    uint256 public constant TIER3_BONUS_BPS = 2000;

    // ==================================================================================
    // TIER TOPPING BONUSES (weekly bonus toppings for lottery)
    // ==================================================================================

    /// @notice Tier 0 topping bonus: +0 per week
    uint256 public constant TIER0_TOPPING_BONUS = 0;

    /// @notice Tier 1 topping bonus: +1 per week
    uint256 public constant TIER1_TOPPING_BONUS = 1;

    /// @notice Tier 2 topping bonus: +3 per week
    uint256 public constant TIER2_TOPPING_BONUS = 3;

    /// @notice Tier 3 topping bonus: +5 per week
    uint256 public constant TIER3_TOPPING_BONUS = 5;

    // ==================================================================================
    // SPIN THE PIE CONSTANTS
    // ==================================================================================

    /// @notice Regular Slice: 73% chance, 100% payout
    uint256 public constant SPIN_REGULAR_WEIGHT = 73;
    uint256 public constant SPIN_REGULAR_MULTIPLIER_BPS = 10000;

    /// @notice Loaded Slice: 20% chance, 110% payout
    uint256 public constant SPIN_LOADED_WEIGHT = 20;
    uint256 public constant SPIN_LOADED_MULTIPLIER_BPS = 11000;

    /// @notice Hot Out the Oven: 5% chance, 125% payout
    uint256 public constant SPIN_HOT_WEIGHT = 5;
    uint256 public constant SPIN_HOT_MULTIPLIER_BPS = 12500;

    /// @notice Jackpot: 2% chance, 200% payout
    uint256 public constant SPIN_JACKPOT_WEIGHT = 2;
    uint256 public constant SPIN_JACKPOT_MULTIPLIER_BPS = 20000;

    /// @notice Total spin weight (must equal sum of all weights)
    uint256 public constant SPIN_TOTAL_WEIGHT = 100;

    // ==================================================================================
    // ENUMS
    // ==================================================================================

    /**
     * @notice Staking tiers based on amount staked
     * @dev Tier determines yield bonus (additive) and topping bonus
     */
    enum Tier {
        SliceRunner,    // 0: Any amount, +1.5% yield, +0 toppings
        OvenOperator,   // 1: 50M+ PIZZA, +5% yield, +1 topping/week
        PieBoss,        // 2: 200M+ PIZZA, +10% yield, +3 toppings/week
        PizzaTycoon     // 3: 500M+ PIZZA, +20% yield, +5 toppings/week
    }

    /**
     * @notice Lock period options
     * @dev No lock = tier bonus only; Locked = tier bonus + 10% lock bonus
     */
    enum LockType {
        Flexible,   // 0: No lock, no lock bonus, no penalty
        Locked      // 1: 7-day lock, +10% lock bonus, 15% early exit penalty
    }

    /**
     * @notice Spin the Pie outcomes
     * @dev Used when spinEnabled is true for claiming rewards
     */
    enum SpinOutcome {
        RegularSlice,   // 0: 73% chance, 100% of rewards
        LoadedSlice,    // 1: 20% chance, 110% of rewards
        HotOutTheOven,  // 2: 5% chance, 125% of rewards
        Jackpot         // 3: 2% chance, 200% of rewards
    }

    // ==================================================================================
    // STRUCTS
    // ==================================================================================

    /**
     * @notice Represents a user's staking position (one per lock type)
     * @dev Each wallet can have TWO positions: one Flexible and one Locked
     * @param stakedAmount Amount of PIZZA tokens staked in this position
     * @param stakeTimestamp When the stake was created (for early boost calculation)
     * @param lockEndTimestamp When the lock period ends (0 for Flexible)
     * @param lastClaimTimestamp Last time rewards were claimed
     * @param rewardDebt Used for reward calculation (standard staking math)
     * @param lastToppingClaimWeek Last week number when topping bonus was claimed
     */
    struct StakePosition {
        uint256 stakedAmount;
        uint256 stakeTimestamp;
        uint256 lockEndTimestamp;
        uint256 lastClaimTimestamp;
        uint256 rewardDebt;
        uint256 lastToppingClaimWeek;
    }

    // ==================================================================================
    // STATE VARIABLES
    // ==================================================================================

    /// @notice The PIZZA token contract address (set via admin function)
    address public pizzaToken;

    /// @notice The staking rewards wallet address (where bonus pool top-ups come from)
    address public stakingRewardsWallet;

    /// @notice Total amount of PIZZA staked across all users
    uint256 public totalStaked;

    /// @notice Accumulated rewards per share (scaled by 1e18 for precision)
    uint256 public accRewardPerShare;

    /// @notice Timestamp when early staker boost ends
    uint256 public boostEndTime;

    /// @notice Whether Spin the Pie mechanic is enabled
    bool public spinEnabled;

    /// @notice Bonus pool for Spin the Pie payouts above 100%
    uint256 public bonusPool;

    /// @notice Nonce for pseudo-random spin calculation
    uint256 private spinNonce;

    /// @notice Mapping of user address to their flexible (unlocked) stake position
    mapping(address => StakePosition) public flexibleStakes;

    /// @notice Mapping of user address to their locked stake position
    mapping(address => StakePosition) public lockedStakes;

    /// @notice DEPRECATED: Old single-position mapping, kept for storage layout compatibility
    mapping(address => StakePosition) private _legacyStakes;

    /// @notice Reference to PizzaPartyV2 contract (for integration)
    address public pizzaPartyContract;

    /// @notice Tracks the last gameId a user spun on (one spin per game day)
    mapping(address => uint256) public lastSpinGameId;

    /// @notice PIZZA price in micro-dollars (e.g., 10000 = $0.01, 1000000 = $1.00)
    /// @dev Updated by admin from DexScreener price feed. Used to calculate dynamic MIN_STAKE.
    ///      Micro-dollars provide 6 decimal precision which is sufficient for crypto prices.
    uint256 public pizzaPriceMicroUsd;

    // ==================================================================================
    // EVENTS
    // ==================================================================================

    /// @notice Emitted when a user stakes tokens
    event Staked(
        address indexed user,
        uint256 amount,
        LockType lockType,
        Tier tier
    );

    /// @notice Emitted when a user unstakes tokens
    event Unstaked(
        address indexed user,
        uint256 amount,
        uint256 penalty,
        bool earlyUnstake
    );

    /// @notice Emitted when a user claims rewards
    event RewardsClaimed(
        address indexed user,
        uint256 baseReward,
        uint256 finalReward,
        SpinOutcome outcome
    );

    /// @notice Emitted when a user restakes their rewards
    event RewardsRestaked(
        address indexed user,
        uint256 amount
    );

    /// @notice Emitted when rewards are added to the pool (from PizzaPartyV2)
    event RewardsNotified(
        uint256 amount,
        uint256 newAccRewardPerShare
    );

    /// @notice Emitted when bonus pool is topped up
    event BonusPoolToppedUp(
        uint256 amount,
        uint256 newTotal
    );

    /// @notice Emitted when spin is enabled/disabled
    event SpinToggled(bool enabled);

    /// @notice Emitted when pizza token address is set
    event PizzaTokenSet(address indexed token);

    /// @notice Emitted when staking rewards wallet is set
    event StakingRewardsWalletSet(address indexed wallet);

    /// @notice Emitted when pizza party contract is set
    event PizzaPartyContractSet(address indexed contractAddress);

    /// @notice Emitted when early staker boost time is set
    event BoostEndTimeSet(uint256 endTime);

    /// @notice Emitted when PIZZA price is updated
    event PizzaPriceUpdated(uint256 priceMicroUsd, uint256 newMinStake);

    // ==================================================================================
    // ERRORS
    // ==================================================================================

    error ZeroAddress();
    error ZeroAmount();
    error BelowMinimumStake();
    error ExceedsMaximumStake();
    error NoStakePosition();
    error AlreadyHasPosition();
    error StillLocked();
    error InsufficientBonusPool();
    error TokenNotSet();
    error Unauthorized();
    error AlreadySpunToday();

    // ==================================================================================
    // MODIFIERS
    // ==================================================================================

    /**
     * @notice Ensures pizza token has been set before operations
     */
    modifier tokenSet() {
        if (pizzaToken == address(0)) revert TokenNotSet();
        _;
    }

    // ==================================================================================
    // INITIALIZER
    // ==================================================================================

    /**
     * @notice Initializes the staking contract
     * @dev Called once during proxy deployment. Sets owner and initial state.
     * @param _owner Address that will own the contract
     */
    function initialize(address _owner) external initializer {
        if (_owner == address(0)) revert ZeroAddress();

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        // Note: ReentrancyGuard in OZ v5 uses transient storage, no init needed
        __Pausable_init();

        // Initialize state
        spinEnabled = false;  // Spin disabled by default
        spinNonce = 0;
        accRewardPerShare = 0;
        totalStaked = 0;
        bonusPool = 0;
    }

    // ==================================================================================
    // EXTERNAL FUNCTIONS - USER ACTIONS
    // ==================================================================================

    /**
     * @notice Stake PIZZA tokens to earn rewards
     * @dev User can have TWO positions: one Flexible and one Locked (separately)
     * @param amount Amount of PIZZA to stake (must be >= MIN_STAKE for new positions)
     * @param lockType Whether to use Flexible (0) or Locked (1) staking
     *
     * Example flow:
     * - Day 1: User stakes 10M PIZZA locked (7 day lock)
     * - Day 2: User claims rewards, stakes them as Flexible (no lock, instant access)
     * - Both positions earn rewards independently
     */
    function stake(uint256 amount, LockType lockType) external nonReentrant whenNotPaused tokenSet {
        if (amount == 0) revert ZeroAmount();

        // Get the appropriate position based on lock type
        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[msg.sender]
            : flexibleStakes[msg.sender];

        uint256 totalUserStaked = flexibleStakes[msg.sender].stakedAmount + lockedStakes[msg.sender].stakedAmount;

        // Check if creating new position or adding to existing
        if (position.stakedAmount > 0) {
            // Adding to existing position of this lock type
            if (totalUserStaked + amount > MAX_STAKE) revert ExceedsMaximumStake();
            _addToPosition(msg.sender, amount, lockType);
        } else {
            // New position of this lock type - use dynamic minimum based on price
            if (amount < getMinStake()) revert BelowMinimumStake();
            if (totalUserStaked + amount > MAX_STAKE) revert ExceedsMaximumStake();
            _createPosition(msg.sender, amount, lockType);
        }

        // Transfer tokens from user to this contract
        IERC20(pizzaToken).safeTransferFrom(msg.sender, address(this), amount);

        // Emit event with new tier (based on total staked)
        emit Staked(msg.sender, amount, lockType, getTier(msg.sender));
    }

    /**
     * @notice Unstake PIZZA tokens and withdraw from a specific position type
     * @dev Handles both normal and early unstaking with penalties
     * @param amount Amount of PIZZA to unstake
     * @param lockType Which position to unstake from: Flexible (0) or Locked (1)
     */
    function unstake(uint256 amount, LockType lockType) external nonReentrant whenNotPaused tokenSet {
        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[msg.sender]
            : flexibleStakes[msg.sender];

        if (position.stakedAmount == 0) revert NoStakePosition();
        if (amount == 0) revert ZeroAmount();
        if (amount > position.stakedAmount) {
            amount = position.stakedAmount; // Cap at max
        }

        // Claim pending rewards first (for this position type)
        _claimRewardsForPosition(msg.sender, lockType, false);

        // Calculate penalty for early unstake from locked position
        uint256 penalty = 0;
        bool isEarlyUnstake = false;

        if (lockType == LockType.Locked && block.timestamp < position.lockEndTimestamp) {
            isEarlyUnstake = true;
            penalty = (amount * EARLY_UNSTAKE_PENALTY_BPS) / BPS_DENOMINATOR;

            // Penalty goes to bonus pool
            bonusPool += penalty;
        }

        // Update position
        position.stakedAmount -= amount;
        totalStaked -= amount;

        // Update reward debt
        position.rewardDebt = (position.stakedAmount * accRewardPerShare) / 1e18;

        // If fully unstaked, clean up position
        if (position.stakedAmount == 0) {
            if (lockType == LockType.Locked) {
                delete lockedStakes[msg.sender];
            } else {
                delete flexibleStakes[msg.sender];
            }
        }

        // Transfer tokens (minus penalty) to user
        uint256 amountAfterPenalty = amount - penalty;
        IERC20(pizzaToken).safeTransfer(msg.sender, amountAfterPenalty);

        emit Unstaked(msg.sender, amount, penalty, isEarlyUnstake);
    }

    /**
     * @notice Claim pending staking rewards from BOTH positions (flexible + locked)
     * @dev If spin enabled, determines payout multiplier via spin. Otherwise 100%.
     *      One spin applies to total rewards from both positions.
     */
    function claim() external nonReentrant whenNotPaused tokenSet {
        _claimAllRewards(msg.sender, true);
    }

    /**
     * @notice Claim pending staking rewards from a specific position type
     * @dev Useful when you only want to claim from one position
     * @param lockType Which position to claim from: Flexible (0) or Locked (1)
     */
    function claimFromPosition(LockType lockType) external nonReentrant whenNotPaused tokenSet {
        _claimRewardsForPosition(msg.sender, lockType, true);
    }

    /**
     * @notice Claim rewards and automatically restake them into flexible position
     * @dev Restakes to flexible position since locked rewards shouldn't auto-lock
     * @param lockType Which position to restake INTO: Flexible (0) or Locked (1)
     */
    function restake(LockType lockType) external nonReentrant whenNotPaused tokenSet {
        uint256 totalUserStaked = flexibleStakes[msg.sender].stakedAmount + lockedStakes[msg.sender].stakedAmount;
        if (totalUserStaked == 0) revert NoStakePosition();

        // Calculate pending rewards from BOTH positions (no spin - restake always at 100%)
        uint256 pending = _calculateTotalPendingRewards(msg.sender);

        if (pending > 0) {
            // Get target position
            StakePosition storage targetPosition = lockType == LockType.Locked
                ? lockedStakes[msg.sender]
                : flexibleStakes[msg.sender];

            // Check max stake limit
            uint256 newTotalUserStaked = totalUserStaked + pending;
            if (newTotalUserStaked > MAX_STAKE) {
                // Only restake up to max, claim the rest
                uint256 restakeAmount = MAX_STAKE - totalUserStaked;
                uint256 claimAmount = pending - restakeAmount;

                // Add to target position
                if (targetPosition.stakedAmount == 0) {
                    targetPosition.stakeTimestamp = block.timestamp;
                }
                targetPosition.stakedAmount += restakeAmount;
                totalStaked += restakeAmount;

                if (lockType == LockType.Locked) {
                    targetPosition.lockEndTimestamp = block.timestamp + LOCK_DURATION;
                }

                // Transfer overflow to user
                IERC20(pizzaToken).safeTransfer(msg.sender, claimAmount);

                emit RewardsRestaked(msg.sender, restakeAmount);
                emit RewardsClaimed(msg.sender, claimAmount, claimAmount, SpinOutcome.RegularSlice);
            } else {
                // Restake full amount
                if (targetPosition.stakedAmount == 0) {
                    targetPosition.stakeTimestamp = block.timestamp;
                }
                targetPosition.stakedAmount += pending;
                totalStaked += pending;

                if (lockType == LockType.Locked) {
                    targetPosition.lockEndTimestamp = block.timestamp + LOCK_DURATION;
                }

                emit RewardsRestaked(msg.sender, pending);
            }

            // Update reward debt for BOTH positions
            _updateAllRewardDebts(msg.sender);
        }
    }

    // ==================================================================================
    // EXTERNAL FUNCTIONS - INTEGRATION (Called by PizzaPartyV2Upgradeable)
    // ==================================================================================

    /**
     * @notice Called by PizzaPartyV2 to distribute pot rewards to stakers
     * @dev Updates accRewardPerShare so all stakers can claim their portion
     * @param amount Amount of PIZZA being distributed (4% of daily pot)
     */
    function notifyRewardAmount(uint256 amount) external tokenSet {
        // Allow PizzaPartyV2 contract or owner to call
        if (msg.sender != pizzaPartyContract && msg.sender != owner()) revert Unauthorized();

        if (amount == 0) return;

        if (totalStaked == 0) {
            // No stakers, add to bonus pool
            bonusPool += amount;
            emit BonusPoolToppedUp(amount, bonusPool);
        } else {
            // Distribute to stakers
            accRewardPerShare += (amount * 1e18) / totalStaked;
            emit RewardsNotified(amount, accRewardPerShare);
        }
    }

    // ==================================================================================
    // EXTERNAL VIEW FUNCTIONS - INTEGRATION (Called by PizzaPartyV2Upgradeable)
    // ==================================================================================

    /**
     * @notice Get user's current staking tier (based on TOTAL staked across both positions)
     * @param user Address to check
     * @return Tier enum value (0-3)
     */
    function getTier(address user) public view returns (Tier) {
        uint256 stakedAmount = flexibleStakes[user].stakedAmount + lockedStakes[user].stakedAmount;

        if (stakedAmount >= TIER3_THRESHOLD) return Tier.PizzaTycoon;
        if (stakedAmount >= TIER2_THRESHOLD) return Tier.PieBoss;
        if (stakedAmount >= TIER1_THRESHOLD) return Tier.OvenOperator;
        return Tier.SliceRunner;
    }

    /**
     * @notice Get user's total staked amount across both positions
     * @param user Address to check
     * @return Total staked amount
     */
    function getTotalStaked(address user) public view returns (uint256) {
        return flexibleStakes[user].stakedAmount + lockedStakes[user].stakedAmount;
    }

    /**
     * @notice Get user's tier as uint8 for interface compatibility
     * @param user Address to check
     * @return Tier as uint8 (0-3)
     */
    function getTierLevel(address user) external view returns (uint8) {
        return uint8(getTier(user));
    }

    /**
     * @notice Get weekly topping bonus for user's tier
     * @param user Address to check
     * @return Number of bonus toppings per week
     */
    function getToppingBonus(address user) external view returns (uint256) {
        Tier tier = getTier(user);

        if (tier == Tier.PizzaTycoon) return TIER3_TOPPING_BONUS;
        if (tier == Tier.PieBoss) return TIER2_TOPPING_BONUS;
        if (tier == Tier.OvenOperator) return TIER1_TOPPING_BONUS;
        return TIER0_TOPPING_BONUS;
    }

    /**
     * @notice Get tier yield bonus for user (in BPS, additive)
     * @param user Address to check
     * @return Yield bonus in basis points (0 = +0%, 5000 = +50%, 10000 = +100%, 20000 = +200%)
     */
    function getTierYieldBoost(address user) external view returns (uint256) {
        return _getTierBonus(getTier(user));
    }

    /**
     * @notice Get user's total pending rewards from BOTH positions
     * @param user Address to check
     * @return Total pending reward amount from flexible + locked positions
     */
    function getPendingRewards(address user) external view returns (uint256) {
        return _calculateTotalPendingRewards(user);
    }

    /**
     * @notice Get user's pending rewards for a specific position
     * @param user Address to check
     * @param lockType Which position: Flexible (0) or Locked (1)
     * @return Pending reward amount for that position
     */
    function getPendingRewardsForPosition(address user, LockType lockType) external view returns (uint256) {
        return _calculatePendingRewardsForPosition(user, lockType);
    }

    /**
     * @notice Get user's combined stake info from BOTH positions
     * @param user Address to check
     * @return totalStakedAmount Total staked across both positions
     * @return flexibleAmount Amount in flexible position
     * @return lockedAmount Amount in locked position
     * @return tier Current tier (0-3) based on total
     * @return lockEndTimestamp When locked position unlocks (0 if no locked position)
     * @return totalPendingRewards Total claimable rewards from both positions
     * @return isEarlyBoostActive Whether early staker boost applies
     */
    function getStakeInfo(address user) external view returns (
        uint256 totalStakedAmount,
        uint256 flexibleAmount,
        uint256 lockedAmount,
        Tier tier,
        uint256 lockEndTimestamp,
        uint256 totalPendingRewards,
        bool isEarlyBoostActive
    ) {
        StakePosition storage flexible = flexibleStakes[user];
        StakePosition storage locked = lockedStakes[user];

        totalStakedAmount = flexible.stakedAmount + locked.stakedAmount;
        flexibleAmount = flexible.stakedAmount;
        lockedAmount = locked.stakedAmount;
        tier = getTier(user);
        lockEndTimestamp = locked.lockEndTimestamp;
        totalPendingRewards = _calculateTotalPendingRewards(user);
        isEarlyBoostActive = (boostEndTime > 0 && block.timestamp < boostEndTime);
    }

    /**
     * @notice Get detailed info for a specific position
     * @param user Address to check
     * @param lockType Which position: Flexible (0) or Locked (1)
     * @return stakedAmount Amount staked in this position
     * @return stakeTimestamp When this position was created
     * @return lockEndTimestamp When lock ends (0 for flexible)
     * @return pendingRewards Rewards for this position
     */
    function getPositionInfo(address user, LockType lockType) external view returns (
        uint256 stakedAmount,
        uint256 stakeTimestamp,
        uint256 lockEndTimestamp,
        uint256 pendingRewards
    ) {
        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[user]
            : flexibleStakes[user];

        stakedAmount = position.stakedAmount;
        stakeTimestamp = position.stakeTimestamp;
        lockEndTimestamp = position.lockEndTimestamp;
        pendingRewards = _calculatePendingRewardsForPosition(user, lockType);
    }

    // ==================================================================================
    // ADMIN FUNCTIONS
    // ==================================================================================

    /**
     * @notice Set the PIZZA token address
     * @dev Called after Clanker token launch
     * @param _pizzaToken Address of the PIZZA token contract
     */
    function adminSetPizzaToken(address _pizzaToken) external onlyOwner {
        if (_pizzaToken == address(0)) revert ZeroAddress();
        pizzaToken = _pizzaToken;
        emit PizzaTokenSet(_pizzaToken);
    }

    /**
     * @notice Set the staking rewards wallet address
     * @dev This wallet holds the 3.5B allocation for staking rewards (NOT Treasury)
     * @param _wallet Address of the staking rewards wallet
     */
    function adminSetStakingRewardsWallet(address _wallet) external onlyOwner {
        if (_wallet == address(0)) revert ZeroAddress();
        stakingRewardsWallet = _wallet;
        emit StakingRewardsWalletSet(_wallet);
    }

    /**
     * @notice Set the PizzaPartyV2 contract address
     * @dev Needed for notifyRewardAmount authorization
     * @param _pizzaParty Address of PizzaPartyV2Upgradeable contract
     */
    function adminSetPizzaPartyContract(address _pizzaParty) external onlyOwner {
        if (_pizzaParty == address(0)) revert ZeroAddress();
        pizzaPartyContract = _pizzaParty;
        emit PizzaPartyContractSet(_pizzaParty);
    }

    /**
     * @notice Set the early staker boost end time
     * @dev Should be set to ~60 days after staking launch
     * @param _endTime Unix timestamp when boost ends
     */
    function adminSetBoostEndTime(uint256 _endTime) external onlyOwner {
        boostEndTime = _endTime;
        emit BoostEndTimeSet(_endTime);
    }

    /**
     * @notice Enable or disable Spin the Pie mechanic
     * @dev When disabled, claims pay out at 100%
     * @param _enabled Whether spin should be enabled
     */
    function adminSetSpinEnabled(bool _enabled) external onlyOwner {
        spinEnabled = _enabled;
        emit SpinToggled(_enabled);
    }

    /**
     * @notice Top up the bonus pool from staking rewards wallet
     * @dev Used when bonus pool is low and needs refilling
     * @param amount Amount to add to bonus pool
     */
    function adminTopUpBonusPool(uint256 amount) external onlyOwner tokenSet {
        if (amount == 0) revert ZeroAmount();
        if (stakingRewardsWallet == address(0)) revert ZeroAddress();

        IERC20(pizzaToken).safeTransferFrom(stakingRewardsWallet, address(this), amount);
        bonusPool += amount;

        emit BonusPoolToppedUp(amount, bonusPool);
    }

    /**
     * @notice Update the PIZZA price in micro-dollars (6 decimal precision)
     * @dev Called periodically by admin/bot to sync with DexScreener price.
     *      Price is stored in micro-dollars for precision:
     *      - $1.00 = 1,000,000 micro-USD
     *      - $0.01 = 10,000 micro-USD
     *      - $0.001 = 1,000 micro-USD
     *      - $0.0001 = 100 micro-USD
     *
     *      To convert from USD: priceMicroUsd = priceUsd * 1e6
     *      Example: $0.0123 → 0.0123 * 1000000 = 12300 micro-USD
     * @param _priceMicroUsd Price of 1 PIZZA in micro-dollars
     */
    function adminSetPizzaPrice(uint256 _priceMicroUsd) external onlyOwner {
        pizzaPriceMicroUsd = _priceMicroUsd;
        emit PizzaPriceUpdated(_priceMicroUsd, getMinStake());
    }

    /**
     * @notice Pause the contract in case of emergency
     */
    function adminPause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function adminUnpause() external onlyOwner {
        _unpause();
    }

    // ==================================================================================
    // INTERNAL FUNCTIONS
    // ==================================================================================

    /**
     * @notice Create a new staking position for user
     * @param user Address creating the position
     * @param amount Amount to stake
     * @param lockType Lock type (Flexible or Locked)
     */
    function _createPosition(address user, uint256 amount, LockType lockType) internal {
        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[user]
            : flexibleStakes[user];

        position.stakedAmount = amount;
        position.stakeTimestamp = block.timestamp;
        position.lastClaimTimestamp = block.timestamp;
        position.lastToppingClaimWeek = 0;

        if (lockType == LockType.Locked) {
            position.lockEndTimestamp = block.timestamp + LOCK_DURATION;
        } else {
            position.lockEndTimestamp = 0;
        }

        // Set initial reward debt
        position.rewardDebt = (amount * accRewardPerShare) / 1e18;

        totalStaked += amount;
    }

    /**
     * @notice Add tokens to existing position of a specific lock type
     * @param user Address adding to position
     * @param amount Amount to add
     * @param lockType Which position to add to
     */
    function _addToPosition(address user, uint256 amount, LockType lockType) internal {
        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[user]
            : flexibleStakes[user];

        // Claim pending rewards first (for this position)
        _claimRewardsForPosition(user, lockType, false);

        // Update position
        position.stakedAmount += amount;
        totalStaked += amount;

        // Restart lock timer if locked
        if (lockType == LockType.Locked) {
            position.lockEndTimestamp = block.timestamp + LOCK_DURATION;
        }

        // Update reward debt
        position.rewardDebt = (position.stakedAmount * accRewardPerShare) / 1e18;
    }

    /**
     * @notice Internal claim logic for ALL positions (flexible + locked)
     * @param user Address claiming rewards
     * @param applySpin Whether to apply spin mechanic (false for internal claims)
     *
     * SPIN FLOW (when spinEnabled):
     * - User can spin once per game day (tracked by lastSpinGameId)
     * - Spin determines multiplier: 73% (1x), 20% (1.1x), 5% (1.25x), 2% (2x)
     * - One spin applies to total rewards from both positions
     * - Rewards accumulate until claimed - skipping days doesn't lose rewards
     */
    function _claimAllRewards(address user, bool applySpin) internal {
        uint256 pending = _calculateTotalPendingRewards(user);
        if (pending == 0) return;

        SpinOutcome outcome = SpinOutcome.RegularSlice;
        uint256 finalReward = pending;

        // Apply spin if enabled and requested
        if (applySpin && spinEnabled) {
            // Check if user has already spun today (same gameId)
            uint256 currentGameId = _getCurrentGameId();
            if (lastSpinGameId[user] == currentGameId) {
                revert AlreadySpunToday();
            }

            // Record this spin
            lastSpinGameId[user] = currentGameId;

            outcome = _spin();
            uint256 multiplierBPS = _getSpinMultiplier(outcome);

            if (multiplierBPS > BPS_DENOMINATOR) {
                // Payout is above 100%, need bonus pool
                uint256 extraNeeded = (pending * (multiplierBPS - BPS_DENOMINATOR)) / BPS_DENOMINATOR;

                // Check bonus pool and top up from staking wallet if needed
                if (bonusPool < extraNeeded) {
                    _autoTopUpBonusPool(extraNeeded - bonusPool);
                }

                if (bonusPool >= extraNeeded) {
                    bonusPool -= extraNeeded;
                    finalReward = pending + extraNeeded;
                }
                // If still not enough, just pay base reward
            }
        }

        // Update reward debt for BOTH positions
        _updateAllRewardDebts(user);

        // Transfer rewards
        IERC20(pizzaToken).safeTransfer(user, finalReward);

        emit RewardsClaimed(user, pending, finalReward, outcome);
    }

    /**
     * @notice Internal claim logic for a SPECIFIC position
     * @param user Address claiming rewards
     * @param lockType Which position to claim from
     * @param applySpin Whether to apply spin mechanic
     */
    function _claimRewardsForPosition(address user, LockType lockType, bool applySpin) internal {
        uint256 pending = _calculatePendingRewardsForPosition(user, lockType);
        if (pending == 0) return;

        SpinOutcome outcome = SpinOutcome.RegularSlice;
        uint256 finalReward = pending;

        // Apply spin if enabled and requested
        if (applySpin && spinEnabled) {
            // Check if user has already spun today (same gameId)
            uint256 currentGameId = _getCurrentGameId();
            if (lastSpinGameId[user] == currentGameId) {
                revert AlreadySpunToday();
            }

            // Record this spin
            lastSpinGameId[user] = currentGameId;

            outcome = _spin();
            uint256 multiplierBPS = _getSpinMultiplier(outcome);

            if (multiplierBPS > BPS_DENOMINATOR) {
                uint256 extraNeeded = (pending * (multiplierBPS - BPS_DENOMINATOR)) / BPS_DENOMINATOR;

                if (bonusPool < extraNeeded) {
                    _autoTopUpBonusPool(extraNeeded - bonusPool);
                }

                if (bonusPool >= extraNeeded) {
                    bonusPool -= extraNeeded;
                    finalReward = pending + extraNeeded;
                }
            }
        }

        // Update reward debt for this position only
        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[user]
            : flexibleStakes[user];

        position.lastClaimTimestamp = block.timestamp;
        position.rewardDebt = (position.stakedAmount * accRewardPerShare) / 1e18;

        // Transfer rewards
        IERC20(pizzaToken).safeTransfer(user, finalReward);

        emit RewardsClaimed(user, pending, finalReward, outcome);
    }

    /**
     * @notice Update reward debt for both positions
     */
    function _updateAllRewardDebts(address user) internal {
        StakePosition storage flexible = flexibleStakes[user];
        StakePosition storage locked = lockedStakes[user];

        if (flexible.stakedAmount > 0) {
            flexible.lastClaimTimestamp = block.timestamp;
            flexible.rewardDebt = (flexible.stakedAmount * accRewardPerShare) / 1e18;
        }

        if (locked.stakedAmount > 0) {
            locked.lastClaimTimestamp = block.timestamp;
            locked.rewardDebt = (locked.stakedAmount * accRewardPerShare) / 1e18;
        }
    }

    /**
     * @notice Get current game ID from PizzaParty contract
     * @return Current daily game ID (0 if contract not set)
     */
    function _getCurrentGameId() internal view returns (uint256) {
        if (pizzaPartyContract == address(0)) return 0;
        return IPizzaPartyV2(pizzaPartyContract).dailyGameId();
    }

    /**
     * @notice Check if user can spin today
     * @param user Address to check
     * @return true if user hasn't spun today, false otherwise
     */
    function canSpinToday(address user) external view returns (bool) {
        if (!spinEnabled) return false;
        uint256 currentGameId = _getCurrentGameId();
        return lastSpinGameId[user] != currentGameId;
    }

    /**
     * @notice Get the current minimum stake amount based on PIZZA price
     * @dev Calculates $1 worth of PIZZA. Falls back to MIN_STAKE_FALLBACK if price not set.
     * @return Minimum stake amount in PIZZA (with 18 decimals)
     *
     * Formula: minStake = ($1.00 / pricePerPizza) * 1e18
     *        = (MIN_STAKE_MICRO_USD / pizzaPriceMicroUsd) * 1e18
     *        = (1_000_000 / priceMicroUsd) * 1e18
     *
     * Example: If PIZZA = $0.01 (10000 micro-USD), then minStake = 1000000/10000 * 1e18 = 100 PIZZA
     * Example: If PIZZA = $0.001 (1000 micro-USD), then minStake = 1000000/1000 * 1e18 = 1000 PIZZA
     * Example: If PIZZA = $0.0001 (100 micro-USD), then minStake = 1000000/100 * 1e18 = 10000 PIZZA
     */
    function getMinStake() public view returns (uint256) {
        if (pizzaPriceMicroUsd == 0) {
            return MIN_STAKE_FALLBACK;
        }
        // Calculate: $1 worth of PIZZA = (1_000_000 micro-USD / price in micro-USD) * 1e18
        return (MIN_STAKE_MICRO_USD * 1e18) / pizzaPriceMicroUsd;
    }

    /**
     * @notice Calculate total pending rewards from BOTH positions
     * @param user Address to calculate for
     * @return Total pending reward amount with all bonuses applied
     */
    function _calculateTotalPendingRewards(address user) internal view returns (uint256) {
        uint256 flexibleRewards = _calculatePendingRewardsForPosition(user, LockType.Flexible);
        uint256 lockedRewards = _calculatePendingRewardsForPosition(user, LockType.Locked);
        return flexibleRewards + lockedRewards;
    }

    /**
     * @notice Calculate pending rewards for a specific position
     * @param user Address to calculate for
     * @param lockType Which position: Flexible (0) or Locked (1)
     * @return Pending reward amount with all bonuses applied (additive)
     *
     * FORMULA: finalReward = baseReward × (1 + tierBonus + lockBonus + earlyBonus)
     *
     * Example for Pizza Tycoon with lock and early boost:
     * - Base: 100 PIZZA
     * - Tier bonus: +20% (Pizza Tycoon) - based on TOTAL staked
     * - Lock bonus: +10% (if locked position)
     * - Early bonus: +30% (if boost active)
     * - Total multiplier: 1 + 0.2 + 0.1 + 0.3 = 1.6x
     * - Final: 100 × 1.6 = 160 PIZZA
     */
    function _calculatePendingRewardsForPosition(address user, LockType lockType) internal view returns (uint256) {
        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[user]
            : flexibleStakes[user];

        if (position.stakedAmount == 0) return 0;

        // Base reward from pool share
        uint256 baseReward = ((position.stakedAmount * accRewardPerShare) / 1e18) - position.rewardDebt;

        if (baseReward == 0) return 0;

        // Start with base (10000 BPS = 1x = 100%)
        uint256 totalBonusBPS = BPS_DENOMINATOR;

        // Add tier bonus (based on TOTAL staked across both positions)
        totalBonusBPS += _getTierBonus(getTier(user));

        // Add lock bonus (+10% if this is the locked position)
        if (lockType == LockType.Locked) {
            totalBonusBPS += LOCK_BONUS_BPS;
        }

        // Add early staker bonus (+30% if active)
        if (boostEndTime > 0 && block.timestamp < boostEndTime) {
            totalBonusBPS += EARLY_BOOST_BPS;
        }

        // Apply total bonus to base reward
        return (baseReward * totalBonusBPS) / BPS_DENOMINATOR;
    }

    /**
     * @notice Get yield bonus for tier (in BPS, additive)
     * @param tier Tier to get bonus for
     * @return Yield bonus in basis points (0, 5000, 10000, or 20000)
     */
    function _getTierBonus(Tier tier) internal pure returns (uint256) {
        if (tier == Tier.PizzaTycoon) return TIER3_BONUS_BPS;
        if (tier == Tier.PieBoss) return TIER2_BONUS_BPS;
        if (tier == Tier.OvenOperator) return TIER1_BONUS_BPS;
        return TIER0_BONUS_BPS;
    }

    /**
     * @notice Perform spin to determine payout multiplier
     * @return SpinOutcome enum value
     */
    function _spin() internal returns (SpinOutcome) {
        // Generate pseudo-random number
        uint256 random = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            spinNonce++
        ))) % SPIN_TOTAL_WEIGHT;

        // Determine outcome based on weights
        // 0-72: Regular (73%)
        // 73-92: Loaded (20%)
        // 93-97: Hot (5%)
        // 98-99: Jackpot (2%)

        if (random < SPIN_REGULAR_WEIGHT) {
            return SpinOutcome.RegularSlice;
        } else if (random < SPIN_REGULAR_WEIGHT + SPIN_LOADED_WEIGHT) {
            return SpinOutcome.LoadedSlice;
        } else if (random < SPIN_REGULAR_WEIGHT + SPIN_LOADED_WEIGHT + SPIN_HOT_WEIGHT) {
            return SpinOutcome.HotOutTheOven;
        } else {
            return SpinOutcome.Jackpot;
        }
    }

    /**
     * @notice Get payout multiplier for spin outcome (in BPS)
     * @param outcome Spin outcome
     * @return Multiplier in basis points (10000 = 100%)
     */
    function _getSpinMultiplier(SpinOutcome outcome) internal pure returns (uint256) {
        if (outcome == SpinOutcome.Jackpot) return SPIN_JACKPOT_MULTIPLIER_BPS;
        if (outcome == SpinOutcome.HotOutTheOven) return SPIN_HOT_MULTIPLIER_BPS;
        if (outcome == SpinOutcome.LoadedSlice) return SPIN_LOADED_MULTIPLIER_BPS;
        return SPIN_REGULAR_MULTIPLIER_BPS;
    }

    /**
     * @notice Auto top up bonus pool from staking rewards wallet
     * @param amountNeeded Amount needed to cover spin bonus
     */
    function _autoTopUpBonusPool(uint256 amountNeeded) internal {
        if (stakingRewardsWallet == address(0)) return;

        // Check allowance
        uint256 allowance = IERC20(pizzaToken).allowance(stakingRewardsWallet, address(this));
        if (allowance < amountNeeded) return;

        // Check balance
        uint256 balance = IERC20(pizzaToken).balanceOf(stakingRewardsWallet);
        if (balance < amountNeeded) return;

        // Transfer (will fail silently if conditions not met)
        try IERC20(pizzaToken).transferFrom(stakingRewardsWallet, address(this), amountNeeded) {
            bonusPool += amountNeeded;
            emit BonusPoolToppedUp(amountNeeded, bonusPool);
        } catch {
            // Failed to top up, spin will just pay base reward
        }
    }

    // ==================================================================================
    // UUPS UPGRADE AUTHORIZATION
    // ==================================================================================

    /**
     * @notice Authorize contract upgrades (UUPS pattern)
     * @dev Only owner can upgrade
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
