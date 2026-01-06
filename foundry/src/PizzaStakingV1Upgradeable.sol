// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
 * - 2 lock periods (Flexible at 0.5x, 7-day lock at 1.5x yield)
 * - Early staker boost (+30% for first 60 days)
 * - Spin the Pie mechanic for claiming (toggleable, disabled by default)
 * - Single position per wallet (simplifies accounting)
 *
 * INTEGRATION:
 * - PizzaPartyV2Upgradeable calls notifyRewardAmount() when settling daily games
 * - PizzaPartyV2Upgradeable queries getTier(), getToppingBonus(), getWeeklyWeightBoost()
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
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    // ==================================================================================
    // CONSTANTS
    // ==================================================================================

    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Minimum stake amount: 100,000 PIZZA (with 18 decimals)
    uint256 public constant MIN_STAKE = 100_000 * 1e18;

    /// @notice Maximum stake per wallet: 1,000,000,000 PIZZA (10% of supply)
    uint256 public constant MAX_STAKE = 1_000_000_000 * 1e18;

    /// @notice Lock period duration: 7 days
    uint256 public constant LOCK_DURATION = 7 days;

    /// @notice Early unstake penalty: 15% (1500 BPS)
    uint256 public constant EARLY_UNSTAKE_PENALTY_BPS = 1500;

    /// @notice Flexible lock yield multiplier: 0.5x (5000 BPS)
    uint256 public constant FLEXIBLE_YIELD_BPS = 5000;

    /// @notice Locked yield multiplier: 1.5x (15000 BPS)
    uint256 public constant LOCKED_YIELD_BPS = 15000;

    /// @notice Early staker boost: 30% (3000 BPS)
    uint256 public constant EARLY_BOOST_BPS = 3000;

    // ==================================================================================
    // TIER THRESHOLDS (in tokens with 18 decimals)
    // ==================================================================================

    /// @notice Tier 1 (Oven Operator) threshold: 50,000,000 PIZZA
    uint256 public constant TIER1_THRESHOLD = 50_000_000 * 1e18;

    /// @notice Tier 2 (Pie Boss) threshold: 200,000,000 PIZZA
    uint256 public constant TIER2_THRESHOLD = 200_000_000 * 1e18;

    /// @notice Tier 3 (Pizza Tycoon) threshold: 500,000,000 PIZZA
    uint256 public constant TIER3_THRESHOLD = 500_000_000 * 1e18;

    // ==================================================================================
    // TIER YIELD BOOSTS (in BPS - 10000 = 1x)
    // ==================================================================================

    /// @notice Tier 0 (Slice Runner) yield boost: 1.0x
    uint256 public constant TIER0_YIELD_BPS = 10000;

    /// @notice Tier 1 (Oven Operator) yield boost: 1.5x
    uint256 public constant TIER1_YIELD_BPS = 15000;

    /// @notice Tier 2 (Pie Boss) yield boost: 2.0x
    uint256 public constant TIER2_YIELD_BPS = 20000;

    /// @notice Tier 3 (Pizza Tycoon) yield boost: 3.0x
    uint256 public constant TIER3_YIELD_BPS = 30000;

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
    // TIER WEEKLY WEIGHT BOOSTS (for lottery selection, in BPS)
    // ==================================================================================

    /// @notice Tier 0 weekly weight: 1.0x
    uint256 public constant TIER0_WEIGHT_BPS = 10000;

    /// @notice Tier 1 weekly weight: 1.25x
    uint256 public constant TIER1_WEIGHT_BPS = 12500;

    /// @notice Tier 2 weekly weight: 1.5x
    uint256 public constant TIER2_WEIGHT_BPS = 15000;

    /// @notice Tier 3 weekly weight: 2.0x
    uint256 public constant TIER3_WEIGHT_BPS = 20000;

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
     * @dev Tier determines yield boost, topping bonus, and lottery weight
     */
    enum Tier {
        SliceRunner,    // 0: Any amount, 1x yield, +0 toppings, 1x weight
        OvenOperator,   // 1: 50M+ PIZZA, 1.5x yield, +1 topping/week, 1.25x weight
        PieBoss,        // 2: 200M+ PIZZA, 2x yield, +3 toppings/week, 1.5x weight
        PizzaTycoon     // 3: 500M+ PIZZA, 3x yield, +5 toppings/week, 2x weight
    }

    /**
     * @notice Lock period options
     * @dev Flexible has no lock but 0.5x yield; Locked has 7-day lock but 1.5x yield
     */
    enum LockType {
        Flexible,   // 0: No lock, 0.5x yield multiplier, no penalty
        Locked      // 1: 7-day lock, 1.5x yield multiplier, 15% early exit penalty
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
     * @notice Represents a user's staking position
     * @dev Each wallet can only have one position
     * @param stakedAmount Amount of PIZZA tokens staked
     * @param lockType Whether position is Flexible or Locked
     * @param stakeTimestamp When the stake was created (for early boost calculation)
     * @param lockEndTimestamp When the lock period ends (0 for Flexible)
     * @param lastClaimTimestamp Last time rewards were claimed
     * @param rewardDebt Used for reward calculation (standard staking math)
     * @param lastToppingClaimWeek Last week number when topping bonus was claimed
     */
    struct StakePosition {
        uint256 stakedAmount;
        LockType lockType;
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

    /// @notice Mapping of user address to their stake position
    mapping(address => StakePosition) public stakes;

    /// @notice Reference to PizzaPartyV2 contract (for integration)
    address public pizzaPartyContract;

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
        __ReentrancyGuard_init();
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
     * @dev Creates a new position or adds to existing. User must approve tokens first.
     * @param amount Amount of PIZZA to stake (must be >= MIN_STAKE for new positions)
     * @param lockType Whether to use Flexible (0) or Locked (1) staking
     */
    function stake(uint256 amount, LockType lockType) external nonReentrant whenNotPaused tokenSet {
        if (amount == 0) revert ZeroAmount();

        StakePosition storage position = stakes[msg.sender];

        // Check if user already has a position
        if (position.stakedAmount > 0) {
            // Adding to existing position - must use same lock type
            // Lock timer restarts on any addition to locked position
            _addToPosition(msg.sender, amount);
        } else {
            // New position
            if (amount < MIN_STAKE) revert BelowMinimumStake();
            if (amount > MAX_STAKE) revert ExceedsMaximumStake();
            _createPosition(msg.sender, amount, lockType);
        }

        // Transfer tokens from user to this contract
        IERC20(pizzaToken).safeTransferFrom(msg.sender, address(this), amount);

        // Emit event with new tier
        emit Staked(msg.sender, amount, lockType, getTier(msg.sender));
    }

    /**
     * @notice Unstake PIZZA tokens and withdraw
     * @dev Handles both normal and early unstaking with penalties
     * @param amount Amount of PIZZA to unstake
     */
    function unstake(uint256 amount) external nonReentrant whenNotPaused tokenSet {
        StakePosition storage position = stakes[msg.sender];

        if (position.stakedAmount == 0) revert NoStakePosition();
        if (amount == 0) revert ZeroAmount();
        if (amount > position.stakedAmount) {
            amount = position.stakedAmount; // Cap at max
        }

        // Claim pending rewards first
        _claimRewards(msg.sender, false);

        // Calculate penalty for early unstake from locked position
        uint256 penalty = 0;
        bool isEarlyUnstake = false;

        if (position.lockType == LockType.Locked && block.timestamp < position.lockEndTimestamp) {
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
            delete stakes[msg.sender];
        }

        // Transfer tokens (minus penalty) to user
        uint256 amountAfterPenalty = amount - penalty;
        IERC20(pizzaToken).safeTransfer(msg.sender, amountAfterPenalty);

        emit Unstaked(msg.sender, amount, penalty, isEarlyUnstake);
    }

    /**
     * @notice Claim pending staking rewards
     * @dev If spin enabled, determines payout multiplier via spin. Otherwise 100%.
     */
    function claim() external nonReentrant whenNotPaused tokenSet {
        _claimRewards(msg.sender, true);
    }

    /**
     * @notice Claim rewards and automatically restake them
     * @dev Same as claim() but tokens go back into stake instead of wallet
     */
    function restake() external nonReentrant whenNotPaused tokenSet {
        StakePosition storage position = stakes[msg.sender];
        if (position.stakedAmount == 0) revert NoStakePosition();

        // Calculate pending rewards (no spin - restake always at 100%)
        uint256 pending = _calculatePendingRewards(msg.sender);

        if (pending > 0) {
            // Check max stake limit
            uint256 newTotal = position.stakedAmount + pending;
            if (newTotal > MAX_STAKE) {
                // Only restake up to max, claim the rest
                uint256 restakeAmount = MAX_STAKE - position.stakedAmount;
                uint256 claimAmount = pending - restakeAmount;

                position.stakedAmount = MAX_STAKE;
                totalStaked += restakeAmount;

                // Transfer overflow to user
                IERC20(pizzaToken).safeTransfer(msg.sender, claimAmount);

                emit RewardsRestaked(msg.sender, restakeAmount);
                emit RewardsClaimed(msg.sender, claimAmount, claimAmount, SpinOutcome.RegularSlice);
            } else {
                // Restake full amount
                position.stakedAmount = newTotal;
                totalStaked += pending;

                emit RewardsRestaked(msg.sender, pending);
            }

            // If locked, restart lock timer
            if (position.lockType == LockType.Locked) {
                position.lockEndTimestamp = block.timestamp + LOCK_DURATION;
            }

            // Update reward tracking
            position.lastClaimTimestamp = block.timestamp;
            position.rewardDebt = (position.stakedAmount * accRewardPerShare) / 1e18;
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
     * @notice Get user's current staking tier
     * @param user Address to check
     * @return Tier enum value (0-3)
     */
    function getTier(address user) public view returns (Tier) {
        uint256 stakedAmount = stakes[user].stakedAmount;

        if (stakedAmount >= TIER3_THRESHOLD) return Tier.PizzaTycoon;
        if (stakedAmount >= TIER2_THRESHOLD) return Tier.PieBoss;
        if (stakedAmount >= TIER1_THRESHOLD) return Tier.OvenOperator;
        return Tier.SliceRunner;
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
     * @notice Get weekly weight boost for user's tier (in BPS)
     * @param user Address to check
     * @return Weight multiplier in basis points (10000 = 1x)
     */
    function getWeeklyWeightBoost(address user) external view returns (uint256) {
        Tier tier = getTier(user);

        if (tier == Tier.PizzaTycoon) return TIER3_WEIGHT_BPS;
        if (tier == Tier.PieBoss) return TIER2_WEIGHT_BPS;
        if (tier == Tier.OvenOperator) return TIER1_WEIGHT_BPS;
        return TIER0_WEIGHT_BPS;
    }

    /**
     * @notice Get user's pending rewards (before any multipliers from spin)
     * @param user Address to check
     * @return Pending reward amount
     */
    function getPendingRewards(address user) external view returns (uint256) {
        return _calculatePendingRewards(user);
    }

    /**
     * @notice Get user's full stake position details
     * @param user Address to check
     * @return stakedAmount Total staked
     * @return lockType Flexible (0) or Locked (1)
     * @return tier Current tier (0-3)
     * @return lockEndTimestamp When lock ends (0 if Flexible)
     * @return pendingRewards Claimable rewards
     * @return isEarlyBoostActive Whether early staker boost applies
     */
    function getStakeInfo(address user) external view returns (
        uint256 stakedAmount,
        LockType lockType,
        Tier tier,
        uint256 lockEndTimestamp,
        uint256 pendingRewards,
        bool isEarlyBoostActive
    ) {
        StakePosition storage position = stakes[user];

        stakedAmount = position.stakedAmount;
        lockType = position.lockType;
        tier = getTier(user);
        lockEndTimestamp = position.lockEndTimestamp;
        pendingRewards = _calculatePendingRewards(user);
        isEarlyBoostActive = (boostEndTime > 0 && block.timestamp < boostEndTime);
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
        StakePosition storage position = stakes[user];

        position.stakedAmount = amount;
        position.lockType = lockType;
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
     * @notice Add tokens to existing position
     * @param user Address adding to position
     * @param amount Amount to add
     */
    function _addToPosition(address user, uint256 amount) internal {
        StakePosition storage position = stakes[user];

        // Claim pending rewards first
        _claimRewards(user, false);

        // Check max stake
        uint256 newTotal = position.stakedAmount + amount;
        if (newTotal > MAX_STAKE) revert ExceedsMaximumStake();

        // Update position
        position.stakedAmount = newTotal;
        totalStaked += amount;

        // Restart lock timer if locked
        if (position.lockType == LockType.Locked) {
            position.lockEndTimestamp = block.timestamp + LOCK_DURATION;
        }

        // Update reward debt
        position.rewardDebt = (newTotal * accRewardPerShare) / 1e18;
    }

    /**
     * @notice Internal claim logic
     * @param user Address claiming rewards
     * @param applySpin Whether to apply spin mechanic (false for internal claims)
     */
    function _claimRewards(address user, bool applySpin) internal {
        StakePosition storage position = stakes[user];
        if (position.stakedAmount == 0) return;

        uint256 pending = _calculatePendingRewards(user);

        if (pending > 0) {
            SpinOutcome outcome = SpinOutcome.RegularSlice;
            uint256 finalReward = pending;

            // Apply spin if enabled and requested
            if (applySpin && spinEnabled) {
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

            // Update position
            position.lastClaimTimestamp = block.timestamp;
            position.rewardDebt = (position.stakedAmount * accRewardPerShare) / 1e18;

            // Transfer rewards
            IERC20(pizzaToken).safeTransfer(user, finalReward);

            emit RewardsClaimed(user, pending, finalReward, outcome);
        }
    }

    /**
     * @notice Calculate pending rewards for user
     * @param user Address to calculate for
     * @return Pending reward amount with all multipliers applied
     */
    function _calculatePendingRewards(address user) internal view returns (uint256) {
        StakePosition storage position = stakes[user];
        if (position.stakedAmount == 0) return 0;

        // Base reward from pool share
        uint256 baseReward = ((position.stakedAmount * accRewardPerShare) / 1e18) - position.rewardDebt;

        if (baseReward == 0) return 0;

        // Apply tier yield boost
        uint256 tierBoostBPS = _getTierYieldBoost(getTier(user));
        uint256 boostedReward = (baseReward * tierBoostBPS) / BPS_DENOMINATOR;

        // Apply lock type yield multiplier
        uint256 lockMultiplierBPS = position.lockType == LockType.Locked ? LOCKED_YIELD_BPS : FLEXIBLE_YIELD_BPS;
        boostedReward = (boostedReward * lockMultiplierBPS) / BPS_DENOMINATOR;

        // Apply early staker boost if active
        if (boostEndTime > 0 && block.timestamp < boostEndTime) {
            boostedReward = (boostedReward * (BPS_DENOMINATOR + EARLY_BOOST_BPS)) / BPS_DENOMINATOR;
        }

        return boostedReward;
    }

    /**
     * @notice Get yield boost for tier (in BPS)
     * @param tier Tier to get boost for
     * @return Yield boost in basis points
     */
    function _getTierYieldBoost(Tier tier) internal pure returns (uint256) {
        if (tier == Tier.PizzaTycoon) return TIER3_YIELD_BPS;
        if (tier == Tier.PieBoss) return TIER2_YIELD_BPS;
        if (tier == Tier.OvenOperator) return TIER1_YIELD_BPS;
        return TIER0_YIELD_BPS;
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
