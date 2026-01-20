// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ==================================================================================
 * PIZZA PARTY STAKING CONTRACT - PizzaStakingV1Upgradeable.sol
 * ==================================================================================
 *
 * PURPOSE:
 * This contract allows users to stake $PIZZA tokens to earn yield rewards.
 * Stakers receive a portion of the daily lottery pot (1%) distributed via
 * PizzaPartyV2Upgradeable, plus any bonus pool rewards from Spin the Pie.
 *
 * KEY FEATURES:
 * - 4 staking tiers based on amount staked (Slice Runner, Oven Operator, Pie Boss, Pizza Tycoon)
 * - 2 lock periods: No Lock (tier bonus only) or 7-day Lock (+5% bonus)
 * - Early staker boost (+30% for first 60 days)
 * - Spin the Pie mechanic for claiming (toggleable, disabled by default)
 * - EQUAL distribution: all stakers get same base reward regardless of stake amount
 *
 * REWARD CALCULATION FLOW:
 * Step 1: BASE REWARD - 1% daily pot split EQUALLY among all stakers
 * Step 2: SPIN THE PIE - multiplies base reward (ONLY multiplication in system)
 *         - Regular Slice: 1x (100% of base)
 *         - Loaded Slice: 1.1x (110% of base)
 *         - Hot Out Oven: 1.5x (150% of base)
 *         - Jackpot: 4x (400% of base)
 * Step 3: ADD BONUSES - added to spun result (NOT multiplied)
 *         - Tier bonus: +1.5% / +3% / +7% / +15%
 *         - Lock bonus: +5% (if has locked position)
 *         - Early bonus: +30% (first 60 days)
 *
 * EXAMPLE: 100 PIZZA base, Jackpot spin (4x), Tier1 (+3%), Lock (+5%), Early (+30%)
 * - Step 2: 100 × 4.0 = 400 PIZZA (after spin)
 * - Step 3: 400 + (400 × 38%) = 400 + 152 = 552 PIZZA final
 *
 * INTEGRATION:
 * - PizzaPartyV2Upgradeable calls notifyRewardAmount() when settling daily games
 * - PizzaPartyV2Upgradeable queries getTierLevel(), getTierYieldBoost(), getToppingBonus()
 * - Uses same UUPS upgradeable pattern as other Pizza Party contracts
 *
 * FUNDING:
 * - BASE rewards: from contract balance (1% daily pot transferred by PizzaPartyV2)
 * - EXTRAS (spin >100% + tier/lock/early bonuses): from stakingRewardsWallet
 * - stakingRewardsWallet must approve this contract to spend PIZZA
 * - Early unstake penalties go to bonusPool (legacy, not currently used)
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
    uint256 public constant MIN_STAKE_FALLBACK = 10_000 * 1e18;

    /// @notice Maximum stake per wallet: 1,000,000 PIZZA (10% of 10M supply)
    /// @dev For 10M supply testing. Change to 1_000_000_000 for 10B supply.
    uint256 public constant MAX_STAKE = 10_000_000_000 * 1e18;

    /// @notice Lock period duration: 7 days
    uint256 public constant LOCK_DURATION = 7 days;

    /// @notice Early unstake penalty: 15% (1500 BPS)
    uint256 public constant EARLY_UNSTAKE_PENALTY_BPS = 1500;

    /// @notice Lock bonus: +5% (500 BPS) added to rewards when locked
    uint256 public constant LOCK_BONUS_BPS = 500;

    /// @notice Early staker boost: 30% (3000 BPS)
    uint256 public constant EARLY_BOOST_BPS = 3000;

    /// @notice Locked staking APY: 20% (2000 BPS)
    uint256 public constant LOCKED_APY_BPS = 2000;

    /// @notice Days per year for APY calculation
    uint256 public constant DAYS_PER_YEAR = 365;

    // ==================================================================================
    // TIER THRESHOLDS (in tokens with 18 decimals)
    // @dev For 10M supply testing. Multiply by 1000 for 10B supply.
    // ==================================================================================

    /// @notice Tier 1 (Oven Operator) threshold: 50,000 PIZZA
    uint256 public constant TIER1_THRESHOLD = 500_000_000 * 1e18;

    /// @notice Tier 2 (Pie Boss) threshold: 200,000 PIZZA
    uint256 public constant TIER2_THRESHOLD = 2_000_000_000 * 1e18;

    /// @notice Tier 3 (Pizza Tycoon) threshold: 500,000 PIZZA
    uint256 public constant TIER3_THRESHOLD = 5_000_000_000 * 1e18;

    // ==================================================================================
    // TIER YIELD BONUSES (in BPS - additive, NOT multiplicative)
    // ==================================================================================

    /// @notice Tier 0 (Slice Runner) yield bonus: +1.5%
    uint256 public constant TIER0_BONUS_BPS = 150;

    /// @notice Tier 1 (Oven Operator) yield bonus: +3%
    uint256 public constant TIER1_BONUS_BPS = 300;

    /// @notice Tier 2 (Pie Boss) yield bonus: +7%
    uint256 public constant TIER2_BONUS_BPS = 700;

    /// @notice Tier 3 (Pizza Tycoon) yield bonus: +15%
    uint256 public constant TIER3_BONUS_BPS = 1500;

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

    /// @notice Hot Out the Oven: 5% chance, 150% payout (1.5x)
    uint256 public constant SPIN_HOT_WEIGHT = 5;
    uint256 public constant SPIN_HOT_MULTIPLIER_BPS = 15000;

    /// @notice Jackpot: 2% chance, 400% payout (4x)
    uint256 public constant SPIN_JACKPOT_WEIGHT = 2;
    uint256 public constant SPIN_JACKPOT_MULTIPLIER_BPS = 40000;

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
        OvenOperator,   // 1: 50K+ PIZZA, +3% yield, +1 topping/week
        PieBoss,        // 2: 200K+ PIZZA, +7% yield, +3 toppings/week
        PizzaTycoon     // 3: 500K+ PIZZA, +15% yield, +5 toppings/week
    }

    /**
     * @notice Lock period options
     * @dev No lock = tier bonus only; Locked = tier bonus + 5% lock bonus
     */
    enum LockType {
        Flexible,   // 0: No lock, no lock bonus, no penalty
        Locked      // 1: 7-day lock, +5% lock bonus, 15% early exit penalty
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

    /// @notice Number of unique stakers (for equal reward distribution)
    /// @dev Incremented on first stake, decremented on full unstake
    uint256 public stakerCount;

    /// @notice Accumulated rewards per staker (scaled by 1e18 for precision)
    /// @dev Used for EQUAL distribution: each staker gets same amount regardless of stake size
    uint256 public accRewardPerStaker;

    /// @notice Tracks reward debt per staker for equal distribution
    /// @dev Maps user address to their reward debt for the equal distribution system
    mapping(address => uint256) public stakerRewardDebt;

    /// @notice Tracks lifetime claimed rewards per user
    /// @dev Accumulated total of all rewards claimed (for UI display)
    mapping(address => uint256) public lifetimeClaimed;

    /// @notice Tracks the last gameId that had a jackpot spin (max 1 jackpot per game day)
    /// @dev If lastJackpotGameId == currentGameId, jackpot rolls are downgraded to HotOutTheOven
    uint256 public lastJackpotGameId;

    /// @notice Tracks the last timestamp when APY rewards were claimed for locked position
    /// @dev Used to calculate accumulated APY since last claim (20% annual on locked principal)
    mapping(address => uint256) public lastApyClaimTimestamp;

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

    /// @notice Emitted when a user records their spin (before animation)
    event SpinRecorded(address indexed user, uint256 gameId);

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

        // Check if user has fully unstaked all positions (decrement staker count)
        bool hasNoPositions = flexibleStakes[msg.sender].stakedAmount == 0 && lockedStakes[msg.sender].stakedAmount == 0;
        if (hasNoPositions && stakerCount > 0) {
            stakerCount--;
            stakerRewardDebt[msg.sender] = 0;
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
     * @notice Claim rewards after spin has already been recorded via recordSpin()
     * @dev This function does NOT spin - it just claims at 100% (regular slice).
     *      Use this after calling recordSpin() and showing the spin animation.
     *      The spin result was already determined by recordSpin().
     */
    function claimAfterSpin() external nonReentrant whenNotPaused tokenSet {
        _claimAllRewards(msg.sender, false);
    }

    /**
     * @notice Record that user has spun today (prevents multi-device exploit)
     * @dev Called by frontend BEFORE showing spin animation. This ensures:
     *      1. User can only spin once per game day across all devices
     *      2. Even if user has multiple tabs/devices, only first spin counts
     *      3. The claim() function will then use this recorded spin
     *
     * IMPORTANT: This is a WRITE operation that changes state on-chain.
     * The frontend should call this, wait for confirmation, then show animation.
     */
    function recordSpin() external nonReentrant whenNotPaused tokenSet {
        // Must have a staking position to spin
        uint256 userTotalStaked = flexibleStakes[msg.sender].stakedAmount + lockedStakes[msg.sender].stakedAmount;
        if (userTotalStaked == 0) revert NoStakePosition();

        // Must have spin enabled
        if (!spinEnabled) revert Unauthorized();

        // Check if user has already spun today
        uint256 currentGameId = _getCurrentGameId();
        if (lastSpinGameId[msg.sender] == currentGameId) {
            revert AlreadySpunToday();
        }

        // Record the spin - this prevents spinning on other devices
        lastSpinGameId[msg.sender] = currentGameId;

        emit SpinRecorded(msg.sender, currentGameId);
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
            // Track lifetime claimed for UI display (restaked rewards count as claimed)
            lifetimeClaimed[msg.sender] += pending;
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

        if (stakerCount == 0) {
            // No stakers, add to bonus pool
            bonusPool += amount;
            emit BonusPoolToppedUp(amount, bonusPool);
        } else {
            // EQUAL distribution: each staker gets same amount regardless of stake size
            accRewardPerStaker += (amount * 1e18) / stakerCount;
            emit RewardsNotified(amount, accRewardPerStaker);
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
     * @notice Initialize staker count after upgrade (one-time migration)
     * @dev Called once after upgrading to set stakerCount for existing stakers
     * @param _stakerCount Number of existing stakers
     * @param _stakers Array of existing staker addresses to set their reward debt
     */
    function adminInitializeStakerCount(uint256 _stakerCount, address[] calldata _stakers) external onlyOwner {
        require(stakerCount == 0, "Already initialized");
        stakerCount = _stakerCount;

        // Set reward debt for existing stakers so they don't get rewards from before they staked
        for (uint256 i = 0; i < _stakers.length; i++) {
            stakerRewardDebt[_stakers[i]] = accRewardPerStaker;
        }
    }

    /**
     * @notice Add missing stakers that weren't included in initial migration
     * @dev Used to fix staker count if some stakers were missed during adminInitializeStakerCount
     * @param _stakers Array of staker addresses to add (must have active stakes)
     */
    function adminAddMissingStakers(address[] calldata _stakers) external onlyOwner {
        for (uint256 i = 0; i < _stakers.length; i++) {
            address staker = _stakers[i];
            // Only add if they have an active stake and haven't been counted yet
            uint256 userStaked = flexibleStakes[staker].stakedAmount + lockedStakes[staker].stakedAmount;
            if (userStaked > 0 && stakerRewardDebt[staker] == 0) {
                stakerCount++;
                stakerRewardDebt[staker] = accRewardPerStaker;
            }
        }
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

    /**
     * @notice Emergency refund all staked tokens to specified users (bypasses all locks/penalties)
     * @dev Used for token migration - returns all staked tokens to users without any deductions
     *      Uses a specified token address to handle migration scenarios where pizzaToken has changed
     * @param _tokenAddress The token contract to transfer from (use old token address for migration)
     * @param _stakers Array of staker addresses to refund
     */
    function adminEmergencyRefund(address _tokenAddress, address[] calldata _stakers) external onlyOwner {
        require(_tokenAddress != address(0), "Invalid token address");
        IERC20 token = IERC20(_tokenAddress);

        for (uint256 i = 0; i < _stakers.length; i++) {
            address staker = _stakers[i];

            // Get total staked amount (flexible + locked)
            uint256 flexibleAmount = flexibleStakes[staker].stakedAmount;
            uint256 lockedAmount = lockedStakes[staker].stakedAmount;
            uint256 totalAmount = flexibleAmount + lockedAmount;

            if (totalAmount == 0) continue;

            // Clear their positions
            if (flexibleAmount > 0) {
                flexibleStakes[staker].stakedAmount = 0;
                flexibleStakes[staker].stakeTimestamp = 0;
                flexibleStakes[staker].lockEndTimestamp = 0;
                flexibleStakes[staker].lastClaimTimestamp = 0;
                flexibleStakes[staker].rewardDebt = 0;
            }

            if (lockedAmount > 0) {
                lockedStakes[staker].stakedAmount = 0;
                lockedStakes[staker].stakeTimestamp = 0;
                lockedStakes[staker].lockEndTimestamp = 0;
                lockedStakes[staker].lastClaimTimestamp = 0;
                lockedStakes[staker].rewardDebt = 0;
            }

            // Update global state
            totalStaked -= totalAmount;
            if (stakerCount > 0) {
                stakerCount--;
            }
            stakerRewardDebt[staker] = 0;

            // Transfer tokens back to staker
            token.safeTransfer(staker, totalAmount);

            emit Unstaked(staker, totalAmount, 0, false); // 0 penalty, not early unstake
        }
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
        // Check if this is user's first position (increment staker count)
        bool isFirstPosition = flexibleStakes[user].stakedAmount == 0 && lockedStakes[user].stakedAmount == 0;

        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[user]
            : flexibleStakes[user];

        position.stakedAmount = amount;
        position.stakeTimestamp = block.timestamp;
        position.lastClaimTimestamp = block.timestamp;
        position.lastToppingClaimWeek = 0;

        if (lockType == LockType.Locked) {
            position.lockEndTimestamp = block.timestamp + LOCK_DURATION;
            // Initialize APY timestamp for new locked positions
            lastApyClaimTimestamp[user] = block.timestamp;
        } else {
            position.lockEndTimestamp = 0;
        }

        // Set initial reward debt (for legacy proportional system)
        position.rewardDebt = (amount * accRewardPerShare) / 1e18;

        totalStaked += amount;

        // For EQUAL distribution: track staker count and set reward debt
        if (isFirstPosition) {
            stakerCount++;
            stakerRewardDebt[user] = accRewardPerStaker;
        }
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
     * CORRECT REWARD FLOW:
     * 1. Get BASE reward (1% daily pot / staker count)
     * 2. SPIN THE PIE - multiplies base reward (ONLY multiplication in system)
     *    - Regular: 1x (100% of base)
     *    - Loaded: 1.1x (110% of base)
     *    - Hot: 1.5x (150% of base)
     *    - Jackpot: 4x (400% of base)
     * 3. ADD BONUSES to spun result (tier + lock + early are ADDITIVE)
     *
     * Example: 100 PIZZA base, Jackpot spin (4x), Tier1 (+3%), Lock (+5%), Early (+30%)
     * Step 2: 100 × 4.0 = 400 PIZZA (after spin)
     * Step 3: 400 + (400 × 38%) = 400 + 152 = 552 PIZZA final
     *
     * ALL REWARDS ARE PAID FROM stakingRewardsWallet (not contract balance)
     */
    function _claimAllRewards(address user, bool applySpin) internal {
        // Step 1: Get BASE reward (before any modifiers)
        uint256 baseReward = _calculateBaseReward(user);

        // Step 1.5: Calculate APY reward for locked position (separate from base)
        uint256 apyReward = _calculateApyReward(user);

        // If both are zero, nothing to claim
        if (baseReward == 0 && apyReward == 0) return;

        SpinOutcome outcome = SpinOutcome.RegularSlice;
        uint256 spunReward = baseReward; // Default: 100% of base

        // Step 2: SPIN THE PIE - multiply base reward (only if there's base reward)
        if (baseReward > 0 && applySpin && spinEnabled) {
            // Check if user has already spun today (same gameId)
            uint256 currentGameId = _getCurrentGameId();
            if (lastSpinGameId[user] == currentGameId) {
                revert AlreadySpunToday();
            }

            // Record this spin
            lastSpinGameId[user] = currentGameId;

            outcome = _spin();
            uint256 multiplierBPS = _getSpinMultiplier(outcome);

            // Calculate spun reward (base × spin multiplier)
            spunReward = (baseReward * multiplierBPS) / BPS_DENOMINATOR;
        }

        // Step 3: ADD BONUSES to spun result (tier + lock + early)
        uint256 bonusAmount = baseReward > 0 ? _calculateBonusAmount(user, spunReward) : 0;

        // Step 4: Calculate final reward (spun + bonuses + APY)
        uint256 finalReward = spunReward + bonusAmount + apyReward;

        // Track lifetime claimed for UI display
        lifetimeClaimed[user] += finalReward;

        // Update reward debt for BOTH positions
        _updateAllRewardDebts(user);

        // Update APY claim timestamp for locked position
        if (lockedStakes[user].stakedAmount > 0) {
            lastApyClaimTimestamp[user] = block.timestamp;
        }

        // Calculate what comes from where:
        // - baseReward: from contract balance (1% daily pot transferred by PizzaPartyV2)
        // - extras (spin bonus + tier/lock/early + APY): from stakingRewardsWallet
        uint256 extrasFromWallet = finalReward - baseReward;

        // Transfer base reward from contract balance (funded by daily pot)
        if (baseReward > 0) {
            IERC20(pizzaToken).safeTransfer(user, baseReward);
        }

        // Transfer extras from staking wallet (spin bonus + tier/lock/early bonuses + APY)
        if (extrasFromWallet > 0 && stakingRewardsWallet != address(0)) {
            IERC20(pizzaToken).safeTransferFrom(stakingRewardsWallet, user, extrasFromWallet);
        }

        emit RewardsClaimed(user, baseReward, finalReward, outcome);
    }

    /**
     * @notice Internal claim logic for a SPECIFIC position
     * @param user Address claiming rewards
     * @param lockType Which position to claim from
     * @param applySpin Whether to apply spin mechanic
     *
     * CORRECT REWARD FLOW (same as _claimAllRewards):
     * 1. Get BASE reward for this position
     * 2. SPIN multiplies base (ONLY multiplication)
     * 3. ADD BONUSES to spun result
     * 4. ADD APY for locked position (separate calculation)
     *
     * ALL REWARDS ARE PAID FROM stakingRewardsWallet (not contract balance)
     */
    function _claimRewardsForPosition(address user, LockType lockType, bool applySpin) internal {
        // Step 1: Get BASE reward for this specific position
        // Calculate proportional share of base reward for this position type
        uint256 totalBaseReward = _calculateBaseReward(user);

        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[user]
            : flexibleStakes[user];

        if (position.stakedAmount == 0) return;

        // Step 1.5: Calculate APY reward if this is the locked position
        uint256 apyReward = 0;
        if (lockType == LockType.Locked) {
            apyReward = _calculateApyReward(user);
        }

        // If no base reward and no APY, nothing to claim
        if (totalBaseReward == 0 && apyReward == 0) return;

        // Calculate this position's share of the base reward
        uint256 userTotalStaked = flexibleStakes[user].stakedAmount + lockedStakes[user].stakedAmount;
        uint256 baseReward = totalBaseReward > 0 ? (totalBaseReward * position.stakedAmount) / userTotalStaked : 0;

        SpinOutcome outcome = SpinOutcome.RegularSlice;
        uint256 spunReward = baseReward; // Default: 100% of base

        // Step 2: SPIN THE PIE - multiply base reward (only if there's base reward)
        if (baseReward > 0 && applySpin && spinEnabled) {
            // Check if user has already spun today (same gameId)
            uint256 currentGameId = _getCurrentGameId();
            if (lastSpinGameId[user] == currentGameId) {
                revert AlreadySpunToday();
            }

            // Record this spin
            lastSpinGameId[user] = currentGameId;

            outcome = _spin();
            uint256 multiplierBPS = _getSpinMultiplier(outcome);

            // Calculate spun reward (base × spin multiplier)
            spunReward = (baseReward * multiplierBPS) / BPS_DENOMINATOR;
        }

        // Step 3: ADD BONUSES to spun result (tier + lock + early)
        uint256 bonusAmount = baseReward > 0 ? _calculateBonusAmount(user, spunReward) : 0;

        // Step 4: Calculate final reward (spun + bonuses + APY)
        uint256 finalReward = spunReward + bonusAmount + apyReward;

        // Track lifetime claimed for UI display
        lifetimeClaimed[user] += finalReward;

        // Update reward debt for this position
        position.lastClaimTimestamp = block.timestamp;
        position.rewardDebt = (position.stakedAmount * accRewardPerShare) / 1e18;

        // Update equal distribution reward debt
        stakerRewardDebt[user] = accRewardPerStaker;

        // Update APY claim timestamp if claiming from locked position
        if (lockType == LockType.Locked && lockedStakes[user].stakedAmount > 0) {
            lastApyClaimTimestamp[user] = block.timestamp;
        }

        // Calculate what comes from where:
        // - baseReward: from contract balance (1% daily pot transferred by PizzaPartyV2)
        // - extras (spin bonus + tier/lock/early + APY): from stakingRewardsWallet
        uint256 extrasFromWallet = finalReward - baseReward;

        // Transfer base reward from contract balance (funded by daily pot)
        if (baseReward > 0) {
            IERC20(pizzaToken).safeTransfer(user, baseReward);
        }

        // Transfer extras from staking wallet (spin bonus + tier/lock/early bonuses + APY)
        if (extrasFromWallet > 0 && stakingRewardsWallet != address(0)) {
            IERC20(pizzaToken).safeTransferFrom(stakingRewardsWallet, user, extrasFromWallet);
        }

        emit RewardsClaimed(user, baseReward, finalReward, outcome);
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

        // Update equal distribution reward debt
        stakerRewardDebt[user] = accRewardPerStaker;
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
     * @notice Calculate BASE pending rewards for a user (before spin & bonuses)
     * @param user Address to calculate for
     * @return Base reward amount (1% daily pot split equally, before any modifiers)
     *
     * EQUAL DISTRIBUTION: Rewards split equally among all stakers.
     * This returns the RAW base reward - spin and bonuses applied separately during claim.
     */
    function _calculateBaseReward(address user) internal view returns (uint256) {
        // User must have at least one position to receive rewards
        uint256 userTotalStaked = flexibleStakes[user].stakedAmount + lockedStakes[user].stakedAmount;
        if (userTotalStaked == 0) return 0;

        // Base reward from EQUAL distribution (same for all stakers)
        uint256 baseReward = accRewardPerStaker - stakerRewardDebt[user];
        // Convert from scaled to actual tokens
        return baseReward / 1e18;
    }

    /**
     * @notice Calculate bonus amount (tier + lock + early) to ADD to spun reward
     * @param user Address to calculate for
     * @param spunReward The reward amount AFTER spin is applied
     * @return Bonus amount to ADD to spun reward (NOT a multiplier)
     *
     * BONUS CALCULATION:
     * - Tier bonus: +1.5% / +3% / +7% / +15% of spun reward
     * - Lock bonus: +5% of spun reward (if has locked position)
     * - Early bonus: +30% of spun reward (if within boost period)
     *
     * These are ADDITIVE bonuses applied AFTER spin, not before.
     */
    function _calculateBonusAmount(address user, uint256 spunReward) internal view returns (uint256) {
        if (spunReward == 0) return 0;

        uint256 totalBonusBPS = 0;

        // Add tier bonus (based on TOTAL staked across both positions)
        totalBonusBPS += _getTierBonus(getTier(user));

        // Add lock bonus (+5% if user has ANY locked position)
        if (lockedStakes[user].stakedAmount > 0) {
            totalBonusBPS += LOCK_BONUS_BPS;
        }

        // Add early staker bonus (+30% if active)
        if (boostEndTime > 0 && block.timestamp < boostEndTime) {
            totalBonusBPS += EARLY_BOOST_BPS;
        }

        // Return bonus amount (bonuses are % of spun reward)
        return (spunReward * totalBonusBPS) / BPS_DENOMINATOR;
    }

    /**
     * @notice Calculate accumulated APY rewards for locked position
     * @param user Address to calculate for
     * @return APY reward amount based on locked principal and time since last claim
     *
     * APY CALCULATION:
     * - 20% annual on locked principal
     * - Daily rate = lockedAmount × 2000 / (365 × 10000)
     * - Accumulates based on seconds since last APY claim (or stake creation)
     *
     * Example: 100,000 PIZZA locked for 7 days
     * Daily = 100,000 × 2000 / (365 × 10000) = 54.79 PIZZA
     * 7 days = 54.79 × 7 = 383.56 PIZZA
     */
    function _calculateApyReward(address user) internal view returns (uint256) {
        StakePosition storage locked = lockedStakes[user];
        if (locked.stakedAmount == 0) return 0;

        // Get the start time for APY calculation
        // Use lastApyClaimTimestamp if set, otherwise use stake creation time
        uint256 apyStartTime = lastApyClaimTimestamp[user];
        if (apyStartTime == 0) {
            apyStartTime = locked.stakeTimestamp;
        }

        // Calculate seconds elapsed since last APY claim
        uint256 secondsElapsed = block.timestamp - apyStartTime;
        if (secondsElapsed == 0) return 0;

        // APY formula: (lockedAmount × APY_BPS × secondsElapsed) / (DAYS_PER_YEAR × 1 day × BPS_DENOMINATOR)
        // This gives us the proportional APY for the exact time elapsed
        return (locked.stakedAmount * LOCKED_APY_BPS * secondsElapsed) /
               (DAYS_PER_YEAR * 1 days * BPS_DENOMINATOR);
    }

    /**
     * @notice Get user's pending APY reward for locked position
     * @param user Address to check
     * @return Pending APY reward amount
     */
    function getPendingApyReward(address user) external view returns (uint256) {
        return _calculateApyReward(user);
    }

    /**
     * @notice Calculate total pending rewards for display (base + expected bonuses at 100% spin + APY)
     * @param user Address to calculate for
     * @return Total pending reward amount (what user would get with regular spin)
     *
     * For UI display: shows base reward + bonuses assuming 100% (regular) spin + APY.
     * Actual claim may be higher if spin outcome is > 100%.
     */
    function _calculateTotalPendingRewards(address user) internal view returns (uint256) {
        uint256 baseReward = _calculateBaseReward(user);
        uint256 apyReward = _calculateApyReward(user);

        // If no base reward and no APY, nothing pending
        if (baseReward == 0 && apyReward == 0) return 0;

        // For display purposes, assume 100% spin (regular slice)
        // Final = base + bonuses on base + APY
        uint256 bonusAmount = baseReward > 0 ? _calculateBonusAmount(user, baseReward) : 0;
        return baseReward + bonusAmount + apyReward;
    }

    /**
     * @notice Calculate pending rewards for a specific position (DEPRECATED - now uses equal distribution)
     * @dev Kept for compatibility but now just returns share of total
     * @param user Address to calculate for
     * @param lockType Which position: Flexible (0) or Locked (1)
     * @return Pending reward amount for that position
     */
    function _calculatePendingRewardsForPosition(address user, LockType lockType) internal view returns (uint256) {
        StakePosition storage position = lockType == LockType.Locked
            ? lockedStakes[user]
            : flexibleStakes[user];

        if (position.stakedAmount == 0) return 0;

        // For equal distribution, we calculate total rewards and split by position weight
        uint256 totalRewards = _calculateTotalPendingRewards(user);
        if (totalRewards == 0) return 0;

        // Split rewards proportionally between flexible and locked positions
        uint256 userTotalStaked = flexibleStakes[user].stakedAmount + lockedStakes[user].stakedAmount;
        return (totalRewards * position.stakedAmount) / userTotalStaked;
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
     * @dev Jackpot can only be hit once per game day. If already hit, jackpot slice is locked
     *      and the spin cannot land on it until the next daily game starts.
     */
    function _spin() internal returns (SpinOutcome) {
        // Check if jackpot is available today
        uint256 currentGameId = _getCurrentGameId();
        bool jackpotAvailable = (lastJackpotGameId != currentGameId);

        // Calculate effective total weight (exclude jackpot if already hit today)
        uint256 effectiveWeight = jackpotAvailable
            ? SPIN_TOTAL_WEIGHT
            : SPIN_TOTAL_WEIGHT - SPIN_JACKPOT_WEIGHT;

        // Generate pseudo-random number within effective range
        uint256 random = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            spinNonce++
        ))) % effectiveWeight;

        // Determine outcome based on weights
        // When jackpot available (100 total):  0-72: Regular, 73-92: Loaded, 93-97: Hot, 98-99: Jackpot
        // When jackpot locked (98 total):      0-72: Regular, 73-92: Loaded, 93-97: Hot (no jackpot possible)

        if (random < SPIN_REGULAR_WEIGHT) {
            return SpinOutcome.RegularSlice;
        } else if (random < SPIN_REGULAR_WEIGHT + SPIN_LOADED_WEIGHT) {
            return SpinOutcome.LoadedSlice;
        } else if (random < SPIN_REGULAR_WEIGHT + SPIN_LOADED_WEIGHT + SPIN_HOT_WEIGHT) {
            return SpinOutcome.HotOutTheOven;
        } else {
            // Jackpot! (only reachable if jackpotAvailable is true)
            lastJackpotGameId = currentGameId;
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
