// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * ==================================================================================
 * PIZZA TIPPING VAULT - PizzaTippingVaultUpgradeable.sol
 * ==================================================================================
 *
 * PURPOSE:
 * A staking-backed, on-chain-controlled tipping wallet system for Farcaster social
 * payments. Players who earn staking rewards can route them into a personal tip jar
 * inside this vault. They tip other Farcaster users by replying to casts with
 * `1000 🍕` or `1000 $pizza` — backend verifies the cast, vault transfers PIZZA
 * to the recipient.
 *
 * TRUST MODEL:
 * - Only the staking contract can credit balances (push-then-credit pattern)
 * - Only the backend signer can execute tips (after off-chain Neynar verification)
 * - Users can always withdraw their own balance (works even when paused)
 * - Owner can forfeit a banned user's balance to treasury (manual emergency only)
 *
 * SECURITY:
 * - Per-tip cap (maxTipPerCast = 10M PIZZA) bounds backend-signer compromise blast radius
 * - Per-credit cap (maxCreditPerTx = 100M PIZZA) bounds staking-bug cascade
 * - Cast hash dedup prevents replay
 * - require(from != to) blocks self-tip
 * - require(recipientFid > 0) blocks tipping to ghost wallets
 * - withdraw() works when paused so users can never be locked out
 * - _disableInitializers() in constructor closes implementation-init footgun
 * - uint256[50] __gap reserves slots for safe future appends
 * ==================================================================================
 */
contract PizzaTippingVaultUpgradeable is
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    // ==================================================================================
    // STATE VARIABLES (APPEND-ONLY FOREVER)
    // ==================================================================================

    address public pizzaToken;
    address public stakingContract;
    address public backendSigner;
    address public treasury;

    mapping(address => uint256) public tipBalance;
    mapping(bytes32 => bool) public usedCastHashes;

    uint256 public minTipAmount;
    uint256 public maxTipPerCast;
    uint256 public maxCreditPerTx;

    // ====== LIFETIME TIP STATS (appended slots — APPEND ONLY) ======
    /// @notice Total PIZZA this user has ever sent as tips (sender side)
    mapping(address => uint256) public lifetimeTipsSent;
    /// @notice Total PIZZA this user has ever received as tips (recipient side)
    mapping(address => uint256) public lifetimeTipsReceived;
    /// @notice Total count of tips this user has sent
    mapping(address => uint256) public lifetimeTipsSentCount;
    /// @notice Total count of tips this user has received
    mapping(address => uint256) public lifetimeTipsReceivedCount;

    // ==================================================================================
    // EVENTS
    // ==================================================================================

    event Credited(address indexed user, uint256 amount);
    event Tipped(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 recipientFid,
        bytes32 castHash
    );
    event Withdrawn(address indexed user, uint256 amount);
    event Forfeited(address indexed user, uint256 amount);
    event BackendSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event StakingContractUpdated(address indexed oldStaking, address indexed newStaking);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event LimitsUpdated(uint256 minTipAmount, uint256 maxTipPerCast, uint256 maxCreditPerTx);

    // ==================================================================================
    // ERRORS
    // ==================================================================================

    error ZeroAddress();
    error ZeroAmount();
    error NotStakingContract();
    error NotBackendSigner();
    error SelfTipNotAllowed();
    error InvalidRecipientFid();
    error AmountBelowMin();
    error AmountAboveMax();
    error AmountAboveCreditCap();
    error CastAlreadyUsed();
    error InsufficientBalance();
    error NoBalanceToForfeit();

    // ==================================================================================
    // CONSTRUCTOR / INITIALIZER
    // ==================================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the vault
     * @param _pizzaToken PIZZA ERC20 address
     * @param _stakingContract Staking proxy address (only it can credit)
     * @param _backendSigner Dedicated EOA that executes tips
     * @param _treasury Destination for forfeitTips
     * @param _owner Owner address (admin)
     */
    function initialize(
        address _pizzaToken,
        address _stakingContract,
        address _backendSigner,
        address _treasury,
        address _owner
    ) external initializer {
        if (_pizzaToken == address(0)) revert ZeroAddress();
        if (_stakingContract == address(0)) revert ZeroAddress();
        if (_backendSigner == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_owner == address(0)) revert ZeroAddress();

        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        pizzaToken = _pizzaToken;
        stakingContract = _stakingContract;
        backendSigner = _backendSigner;
        treasury = _treasury;

        minTipAmount = 1_000 * 1e18;          // 1,000 PIZZA
        maxTipPerCast = 10_000_000 * 1e18;    // 10M PIZZA
        maxCreditPerTx = 100_000_000 * 1e18;  // 100M PIZZA
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ==================================================================================
    // CORE FUNCTIONS
    // ==================================================================================

    /**
     * @notice Credit a user's tip balance (called by staking contract)
     * @dev Tokens must already be in the vault when this is called (push-then-credit).
     *      Staking transfers PIZZA via safeTransfer, then calls this in same tx.
     */
    function credit(address user, uint256 amount)
        external
        whenNotPaused
        nonReentrant
    {
        if (msg.sender != stakingContract) revert NotStakingContract();
        if (amount == 0) revert ZeroAmount();
        if (amount > maxCreditPerTx) revert AmountAboveCreditCap();

        tipBalance[user] += amount;
        emit Credited(user, amount);
    }

    /**
     * @notice Execute a tip from `from` to `to` (called by backend signer)
     * @param from Sender wallet (must have tip balance)
     * @param to Recipient wallet (must have valid Farcaster FID)
     * @param recipientFid Recipient's Farcaster FID (must be > 0)
     * @param amount PIZZA amount (must be in [minTipAmount, maxTipPerCast])
     * @param castHash Farcaster cast hash (replay protection)
     */
    function spendTip(
        address from,
        address to,
        uint256 recipientFid,
        uint256 amount,
        bytes32 castHash
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (msg.sender != backendSigner) revert NotBackendSigner();
        if (from == to) revert SelfTipNotAllowed();
        if (recipientFid == 0) revert InvalidRecipientFid();
        if (amount < minTipAmount) revert AmountBelowMin();
        if (amount > maxTipPerCast) revert AmountAboveMax();
        if (usedCastHashes[castHash]) revert CastAlreadyUsed();
        if (tipBalance[from] < amount) revert InsufficientBalance();

        // Checks-Effects-Interactions
        usedCastHashes[castHash] = true;
        tipBalance[from] -= amount;

        // Lifetime stats (append-only, never decremented)
        lifetimeTipsSent[from] += amount;
        lifetimeTipsReceived[to] += amount;
        lifetimeTipsSentCount[from] += 1;
        lifetimeTipsReceivedCount[to] += 1;

        IERC20(pizzaToken).safeTransfer(to, amount);

        emit Tipped(from, to, amount, recipientFid, castHash);
    }

    /**
     * @notice Withdraw your own tip balance back to your wallet
     * @dev Works EVEN WHEN PAUSED — this is the user safety valve
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (tipBalance[msg.sender] < amount) revert InsufficientBalance();

        tipBalance[msg.sender] -= amount;
        IERC20(pizzaToken).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Forfeit a banned user's full tip balance to the treasury
     * @dev EMERGENCY ONLY — owner-triggered, manual. Used only for confirmed cheaters/hackers.
     */
    function forfeitTips(address user) external onlyOwner nonReentrant {
        uint256 bal = tipBalance[user];
        if (bal == 0) revert NoBalanceToForfeit();

        tipBalance[user] = 0;
        IERC20(pizzaToken).safeTransfer(treasury, bal);

        emit Forfeited(user, bal);
    }

    // ==================================================================================
    // ADMIN FUNCTIONS (onlyOwner)
    // ==================================================================================

    function setBackendSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address old = backendSigner;
        backendSigner = newSigner;
        emit BackendSignerUpdated(old, newSigner);
    }

    function setStakingContract(address newStaking) external onlyOwner {
        if (newStaking == address(0)) revert ZeroAddress();
        address old = stakingContract;
        stakingContract = newStaking;
        emit StakingContractUpdated(old, newStaking);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setLimits(
        uint256 newMin,
        uint256 newMaxTipPerCast,
        uint256 newMaxCreditPerTx
    ) external onlyOwner {
        minTipAmount = newMin;
        maxTipPerCast = newMaxTipPerCast;
        maxCreditPerTx = newMaxCreditPerTx;
        emit LimitsUpdated(newMin, newMaxTipPerCast, newMaxCreditPerTx);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ==================================================================================
    // STORAGE GAP (for future appends — DO NOT TOUCH)
    // ==================================================================================

    uint256[50] private __gap;
}
