// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title PizzaParlorManagerUpgradeable
 * @dev Manages Pizza Parlors - franchise ownership, slice distribution, and fee management
 *
 * Features:
 * - Parlor purchase with PIZZA tokens (50% burn, 30% treasury, 20% ops)
 * - Daily slice allowance (1 free entry per parlor per day)
 * - EIP-712 signed slice vouchers for shareable links
 * - Direct slice tipping to addresses
 * - Franchise fee distribution (from PizzaParty owner fees)
 *
 * UUPS Upgradeable with standard storage layout
 */

interface IPizzaParty {
    function dailyGameId() external view returns (uint256);
    function weeklyGameId() external view returns (uint256);
    function enterDailyWithSlice(address player, address sponsor, uint256 amount) external;
    function pizzaToken() external view returns (IERC20);
}

interface IBurnable {
    function burn(uint256 amount) external;
}

contract PizzaParlorManagerUpgradeable is
    OwnableUpgradeable,
    UUPSUpgradeable,
    EIP712Upgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant MAX_PARLORS = 100;
    uint256 public constant MAX_PARLORS_PER_WALLET = 5;
    uint256 public constant WEEKLY_SLICES_PER_PARLOR = 1;  // 1 slice per parlor per week (for 1-4 parlors)
    uint256 public constant MAX_SLICES_PER_DAY = 1;        // Max 1 slice per day regardless of parlors
    uint256 public constant MAX_OWNER_WEEKLY_SLICES = 7;   // Owners with 5 parlors get 7 slices/week (1 per day)

    // ✅ Dynamic parlor price: Always $50 USD worth of PIZZA
    // Frontend calculates: $50 / currentPizzaPrice = PIZZA amount needed
    // Safety bounds prevent manipulation at extreme price levels
    uint256 public constant MIN_PARLOR_PRICE = 500e18;      // 500 PIZZA minimum (safety floor)
    uint256 public constant MAX_PARLOR_PRICE = 500_000e18;  // 500,000 PIZZA maximum (safety ceiling)

    // Parlor purchase split (basis points)
    uint256 public constant BURN_BPS = 5000;      // 50% burned
    uint256 public constant TREASURY_BPS = 3000;  // 30% to treasury
    uint256 public constant OPS_BPS = 2000;       // 20% to ops/marketing
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Franchise fee distribution (from owner fees received)
    uint256 public constant FRANCHISE_TREASURY_BPS = 3000;  // 30% to treasury
    uint256 public constant FRANCHISE_OWNERS_BPS = 5000;    // 50% to parlor owners
    uint256 public constant FRANCHISE_OPS_BPS = 2000;       // 20% to ops

    // EIP-712 typehash for slice vouchers
    bytes32 public constant SLICE_VOUCHER_TYPEHASH =
        keccak256("SliceVoucher(address sponsor,uint256 dailyGameId,uint256 nonce,uint256 deadline)");

    // ============ Storage (Standard Upgradeable Layout) ============

    // Core references
    IPizzaParty public pizzaParty;
    IERC20 public pizzaToken;
    address public treasuryWallet;
    address public opsWallet;

    // Parlor pricing (LEGACY - not used by purchaseParlor, only purchaseParlorLegacy)
    uint256 public parlorPrice;  // Legacy fixed price - actual pricing is $50 USD calculated dynamically

    // Parlor ownership
    uint256 public totalParlors;
    mapping(address => uint256) public parlorCount;  // owner => number of parlors owned
    address[] public parlorOwners;  // list of all parlor owners (for fee distribution)
    mapping(address => bool) public isParlorOwner;  // quick lookup

    // Slice tracking - WEEKLY limit (resets when weeklyGameId changes)
    mapping(address => uint256) public lastSliceWeekId;      // sponsor => last weeklyGameId they used slices
    mapping(address => uint256) public slicesUsedThisWeek;   // sponsor => slices used in current week

    // Slice tracking - DAILY limit (max 1 per day, resets when dailyGameId changes)
    mapping(address => uint256) public lastSliceDayId;       // sponsor => last dailyGameId a slice was CLAIMED
    // NOTE: DO NOT add new storage variables here - add them at the end before __gap

    // LEGACY - keep for storage layout compatibility (no longer used)
    mapping(address => uint256) public lastSliceGameId;      // LEGACY: was daily tracking
    mapping(address => uint256) public slicesUsedThisGame;   // LEGACY: was daily tracking

    // Nonce tracking for signed vouchers (one-time use)
    mapping(address => mapping(uint256 => bool)) public usedSliceNonce;  // sponsor => nonce => used?

    // Individual fee claiming - tracks claimable balance per owner
    mapping(address => uint256) public claimableBalance;  // owner => unclaimed PIZZA
    uint256 public lastProcessedBalance;  // Track fees already allocated

    // Parlor naming - franchise brand name (one name per owner, set once)
    mapping(address => string) public parlorName;  // owner => franchise name

    // Pending slices - slices that have been sent but not yet claimed
    // When a parlor owner sends a slice, it's stored here until the recipient opens the app and claims it
    struct PendingSlice {
        address sponsor;       // The parlor owner who sent the slice
        uint256 dailyGameId;   // The game this slice is valid for (expires when game changes)
    }
    mapping(address => PendingSlice) public pendingSlices;  // recipient => pending slice info

    // ===== NEW STORAGE VARIABLES - Added at end to preserve slot layout =====
    // Slice tracking for SENT slices (prevents multiple sends per day)
    mapping(address => uint256) public lastSliceSentDayId;   // sponsor => last dailyGameId a slice was SENT
    mapping(address => uint256) public slicesSentToday;      // sponsor => count of slices sent today (resets on new day)

    // Upgrade safety gap - reserves storage slots for future upgrades
    uint256[41] private __gap;  // Reduced by 2 for sent tracking (lastSliceSentDayId + slicesSentToday)

    // ============ Events ============

    event ParlorPurchased(address indexed buyer, uint256 indexed globalSerial, uint256 buyerTotalOwned, uint256 price);
    event SliceSent(address indexed sponsor, address indexed recipient, uint256 indexed dailyGameId);
    event SliceClaimed(address indexed recipient, address indexed sponsor, uint256 indexed dailyGameId);
    event SliceTipped(address indexed sponsor, address indexed recipient, uint256 indexed dailyGameId);  // Legacy
    event SliceRedeemed(address indexed sponsor, address indexed recipient, uint256 indexed dailyGameId, uint256 nonce);
    event FranchiseFeesDistributed(uint256 totalFees, uint256 treasuryAmount, uint256 ownersAmount, uint256 opsAmount);
    event FranchiseFeesAllocated(uint256 newFees, uint256 treasuryAmount, uint256 opsAmount, uint256 ownersAmount);
    event OwnerFeesClaimed(address indexed owner, uint256 amount);
    event ParlorPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryWalletUpdated(address oldWallet, address newWallet);
    event OpsWalletUpdated(address oldWallet, address newWallet);
    event EmergencyParlorTransfer(address indexed from, address indexed to, uint256 amount);
    event ParlorNamed(address indexed owner, string name);

    // ============ Errors ============

    error InvalidAddress();
    error MaxParlorsReached();
    error MaxParlorsPerWalletReached();
    error InsufficientBalance();
    error NoParlorOwned();
    error WeeklySliceLimitReached();
    error DailySliceLimitReached();
    error SliceExpired();
    error WrongDailyGameId();
    error SliceAlreadyUsed();
    error InvalidSignature();
    error NoFeesToDistribute();
    error NoFeesClaimed();
    error NoSelfSlice();
    error PriceTooLow();
    error PriceTooHigh();
    error ParlorAlreadyNamed();
    error NameTooLong();
    error NameEmpty();
    error NoPendingSlice();
    error SliceExpiredWrongGame();
    error AlreadyHasPendingSlice();
    error RecipientIsParlorOwner();

    // ============ Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _pizzaParty,
        address _treasuryWallet,
        address _opsWallet,
        address _owner
    ) public initializer {
        if (_pizzaParty == address(0) || _treasuryWallet == address(0) ||
            _opsWallet == address(0) || _owner == address(0)) {
            revert InvalidAddress();
        }

        __Ownable_init(_owner);
        __EIP712_init("PizzaParlorManager", "1");
        // Note: UUPSUpgradeable and ReentrancyGuard in OZ v5 are stateless (no init needed)

        pizzaParty = IPizzaParty(_pizzaParty);

        // Safety check: ensure pizzaToken is valid
        IERC20 token = IPizzaParty(_pizzaParty).pizzaToken();
        require(address(token) != address(0), "pizzaToken=0");
        pizzaToken = token;

        treasuryWallet = _treasuryWallet;
        opsWallet = _opsWallet;
        parlorPrice = 50_000e18;  // Legacy fallback only - purchaseParlor() uses dynamic $50 USD pricing
    }

    // ============ Parlor Purchase ============

    /**
     * @dev Purchase a new parlor with dynamic pricing
     * Frontend calculates $50 USD worth of PIZZA at current DEX price
     * Split: 50% burn, 30% treasury, 20% ops
     * @param amountPaid The amount of PIZZA tokens to pay (should equal $50 USD worth)
     */
    function purchaseParlor(uint256 amountPaid) external nonReentrant {
        // Check global supply limit
        if (totalParlors >= MAX_PARLORS) revert MaxParlorsReached();

        // Check per-wallet limit
        if (parlorCount[msg.sender] >= MAX_PARLORS_PER_WALLET) revert MaxParlorsPerWalletReached();

        // Validate price bounds (prevents manipulation)
        if (amountPaid < MIN_PARLOR_PRICE) revert PriceTooLow();
        if (amountPaid > MAX_PARLOR_PRICE) revert PriceTooHigh();

        IERC20 token = pizzaToken;

        // Transfer tokens from buyer
        token.safeTransferFrom(msg.sender, address(this), amountPaid);

        // Calculate splits
        uint256 burnAmount = (amountPaid * BURN_BPS) / BPS_DENOMINATOR;
        uint256 treasuryAmount = (amountPaid * TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 opsAmount = amountPaid - burnAmount - treasuryAmount;  // Remainder to ops

        // Execute splits
        IBurnable(address(token)).burn(burnAmount);
        token.safeTransfer(treasuryWallet, treasuryAmount);
        token.safeTransfer(opsWallet, opsAmount);

        // Update ownership
        totalParlors += 1;
        parlorCount[msg.sender] += 1;

        // Track as parlor owner if first parlor
        if (!isParlorOwner[msg.sender]) {
            isParlorOwner[msg.sender] = true;
            parlorOwners.push(msg.sender);
        }

        // Emit with both global serial and buyer's total owned
        emit ParlorPurchased(msg.sender, totalParlors, parlorCount[msg.sender], amountPaid);
    }

    /**
     * @dev Legacy function for backwards compatibility - uses stored parlorPrice
     * @notice Prefer purchaseParlor(uint256) for dynamic pricing
     */
    function purchaseParlorLegacy() external nonReentrant {
        // Check global supply limit
        if (totalParlors >= MAX_PARLORS) revert MaxParlorsReached();

        // Check per-wallet limit
        if (parlorCount[msg.sender] >= MAX_PARLORS_PER_WALLET) revert MaxParlorsPerWalletReached();

        uint256 price = parlorPrice;
        IERC20 token = pizzaToken;

        // Transfer tokens from buyer
        token.safeTransferFrom(msg.sender, address(this), price);

        // Calculate splits
        uint256 burnAmount = (price * BURN_BPS) / BPS_DENOMINATOR;
        uint256 treasuryAmount = (price * TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 opsAmount = price - burnAmount - treasuryAmount;  // Remainder to ops

        // Execute splits
        IBurnable(address(token)).burn(burnAmount);
        token.safeTransfer(treasuryWallet, treasuryAmount);
        token.safeTransfer(opsWallet, opsAmount);

        // Update ownership
        totalParlors += 1;
        parlorCount[msg.sender] += 1;

        // Track as parlor owner if first parlor
        if (!isParlorOwner[msg.sender]) {
            isParlorOwner[msg.sender] = true;
            parlorOwners.push(msg.sender);
        }

        // Emit with both global serial and buyer's total owned
        emit ParlorPurchased(msg.sender, totalParlors, parlorCount[msg.sender], price);
    }

    // ============ Slice Sending (Pending) ============

    /**
     * @dev Send a slice to a recipient - slice is stored as pending until recipient claims it
     * The recipient must open Pizza Party and call claimSlice() to enter the daily game
     * IMPORTANT: Slice only counts against weekly/daily limit when CLAIMED, not when sent
     * If unclaimed, the slice expires and sponsor can send again next game
     * @param recipient The address to receive the pending slice
     */
    function sendSlice(address recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient == msg.sender) revert NoSelfSlice();

        // Must own a parlor
        if (parlorCount[msg.sender] == 0) revert NoParlorOwned();

        // Cannot send slices to other parlor owners (prevents gaming the system)
        if (parlorCount[recipient] > 0) revert RecipientIsParlorOwner();

        // Check if recipient already has a pending slice for TODAY's game
        uint256 currentGameId = pizzaParty.dailyGameId();
        PendingSlice storage existing = pendingSlices[recipient];
        if (existing.sponsor != address(0) && existing.dailyGameId == currentGameId) {
            revert AlreadyHasPendingSlice();
        }

        // Check slice limits (does NOT consume - only validates sponsor can send)
        _checkSliceLimit(msg.sender);

        // Record slice as sent (increments daily sent counter)
        _recordSliceSent(msg.sender);

        // Store pending slice for recipient (overwrites any expired slice from previous games)
        pendingSlices[recipient] = PendingSlice({
            sponsor: msg.sender,
            dailyGameId: currentGameId
        });

        emit SliceSent(msg.sender, recipient, currentGameId);
    }

    /**
     * @dev Claim your pending slice and enter the daily game
     * Called by the recipient when they open Pizza Party
     * THIS is when the slice counts against the sponsor's weekly/daily limit
     * @param entryFeeAmount The $1 worth of PIZZA to pull from treasury (calculated by frontend)
     */
    function claimSlice(uint256 entryFeeAmount) external nonReentrant {
        // Cannot claim slices if you're a parlor owner (prevents gaming the system)
        if (parlorCount[msg.sender] > 0) revert RecipientIsParlorOwner();

        PendingSlice storage pending = pendingSlices[msg.sender];

        // Must have a pending slice
        if (pending.sponsor == address(0)) revert NoPendingSlice();

        // Must be for today's game (slice expires when game changes)
        uint256 currentGameId = pizzaParty.dailyGameId();
        if (pending.dailyGameId != currentGameId) revert SliceExpiredWrongGame();

        address sponsor = pending.sponsor;

        // Clear pending slice before external call (reentrancy protection)
        delete pendingSlices[msg.sender];

        // NOW consume the slice - counts against sponsor's daily/weekly limit
        _consumeSlice(sponsor);

        // Pull $1 worth of PIZZA from treasury to fund this entry
        if (entryFeeAmount > 0) {
            pizzaToken.safeTransferFrom(treasuryWallet, address(this), entryFeeAmount);
            // Approve PizzaParty to pull the tokens
            pizzaToken.approve(address(pizzaParty), entryFeeAmount);
        }

        // Enter daily game for recipient with sponsor (treasury-funded)
        pizzaParty.enterDailyWithSlice(msg.sender, sponsor, entryFeeAmount);

        emit SliceClaimed(msg.sender, sponsor, currentGameId);
    }

    /**
     * @dev Legacy function - now stores pending slice instead of immediate entry
     * @notice Deprecated: Use sendSlice() for new integrations
     * IMPORTANT: Slice only counts against weekly/daily limit when CLAIMED, not when sent
     */
    function tipSlice(address recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient == msg.sender) revert NoSelfSlice();

        // Must own a parlor
        if (parlorCount[msg.sender] == 0) revert NoParlorOwned();

        // Cannot send slices to other parlor owners (prevents gaming the system)
        if (parlorCount[recipient] > 0) revert RecipientIsParlorOwner();

        // Check if recipient already has a pending slice for TODAY's game
        uint256 currentGameId = pizzaParty.dailyGameId();
        PendingSlice storage existing = pendingSlices[recipient];
        if (existing.sponsor != address(0) && existing.dailyGameId == currentGameId) {
            revert AlreadyHasPendingSlice();
        }

        // Check slice limits (does NOT consume - only validates sponsor can send)
        _checkSliceLimit(msg.sender);

        // Record slice as sent (increments daily sent counter)
        _recordSliceSent(msg.sender);

        // Store pending slice (same behavior as sendSlice)
        pendingSlices[recipient] = PendingSlice({
            sponsor: msg.sender,
            dailyGameId: currentGameId
        });

        emit SliceSent(msg.sender, recipient, currentGameId);
        emit SliceTipped(msg.sender, recipient, currentGameId);  // Legacy event for compatibility
    }

    // ============ Signed Slice Redemption (EIP-712) ============

    /**
     * @dev Redeem a signed slice voucher
     * Anyone with a valid signed voucher can redeem it for themselves
     *
     * @param sponsor The parlor owner who signed the voucher
     * @param dailyGameId Must match current PizzaParty.dailyGameId()
     * @param nonce One-time nonce to prevent reuse
     * @param deadline Unix timestamp expiry
     * @param signature EIP-712 signature from sponsor
     * @param entryFeeAmount The $1 worth of PIZZA to pull from treasury (calculated by frontend)
     */
    function redeemSlice(
        address sponsor,
        uint256 dailyGameId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        uint256 entryFeeAmount
    ) external nonReentrant {
        if (sponsor == address(0)) revert InvalidAddress();
        if (msg.sender == sponsor) revert NoSelfSlice();

        // Cannot redeem slices if recipient is a parlor owner (prevents gaming the system)
        if (parlorCount[msg.sender] > 0) revert RecipientIsParlorOwner();

        // Check deadline
        if (block.timestamp > deadline) revert SliceExpired();

        // Must be redeemable only for today's daily game
        uint256 currentGameId = pizzaParty.dailyGameId();
        if (dailyGameId != currentGameId) revert WrongDailyGameId();

        // Nonce must not be used
        if (usedSliceNonce[sponsor][nonce]) revert SliceAlreadyUsed();

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            SLICE_VOUCHER_TYPEHASH,
            sponsor,
            dailyGameId,
            nonce,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != sponsor) revert InvalidSignature();

        // Sponsor must own a parlor
        if (parlorCount[sponsor] == 0) revert NoParlorOwned();

        // Enforce daily slice limit for sponsor
        _enforceSliceLimit(sponsor);

        // Mark nonce as used
        usedSliceNonce[sponsor][nonce] = true;

        // Pull $1 worth of PIZZA from treasury to fund this entry
        if (entryFeeAmount > 0) {
            pizzaToken.safeTransferFrom(treasuryWallet, address(this), entryFeeAmount);
            pizzaToken.approve(address(pizzaParty), entryFeeAmount);
        }

        // Enter daily game for redeemer (treasury-funded)
        pizzaParty.enterDailyWithSlice(msg.sender, sponsor, entryFeeAmount);

        emit SliceRedeemed(sponsor, msg.sender, currentGameId, nonce);
    }

    // ============ Slice Limit Enforcement ============

    /**
     * @dev Calculate weekly slice allowance for a sponsor
     * - Owners with 5 parlors (max) get 7 slices per week (1 per day of the week)
     * - Owners with 1-4 parlors get 1 slice per parlor per week
     */
    function _getWeeklySliceAllowance(address sponsor) internal view returns (uint256) {
        uint256 parlors = parlorCount[sponsor];
        if (parlors >= MAX_PARLORS_PER_WALLET) {
            // Max parlor owners get 7 slices (1 per day)
            return MAX_OWNER_WEEKLY_SLICES;
        }
        // Others get 1 slice per parlor
        return parlors * WEEKLY_SLICES_PER_PARLOR;
    }

    /**
     * @dev Check slice limits WITHOUT consuming - only validates sponsor can send
     * Slices are counted when SENT (not when claimed) to prevent multiple sends per day
     * - WEEKLY: 1 slice per parlor per week, OR 7 slices if owner has 5 parlors (counted at claim)
     * - DAILY: Max 1 slice SENT per day regardless of parlors owned (resets when dailyGameId changes)
     */
    function _checkSliceLimit(address sponsor) internal view {
        uint256 currentWeekId = pizzaParty.weeklyGameId();
        uint256 currentDayId = pizzaParty.dailyGameId();

        // ===== DAILY LIMIT CHECK (max 1 SENT per day) =====
        // Check slices SENT today (not claimed) to prevent multiple sends
        if (lastSliceSentDayId[sponsor] == currentDayId && slicesSentToday[sponsor] >= 1) {
            revert DailySliceLimitReached();
        }

        // ===== WEEKLY LIMIT CHECK =====
        // Get current weekly usage (account for week reset)
        uint256 currentWeeklyUsage = slicesUsedThisWeek[sponsor];
        if (lastSliceWeekId[sponsor] != currentWeekId) {
            currentWeeklyUsage = 0;  // Would be reset on claim
        }

        // Check weekly limit (5 parlor owners get 7, others get 1 per parlor)
        uint256 maxWeeklySlices = _getWeeklySliceAllowance(sponsor);
        if (currentWeeklyUsage >= maxWeeklySlices) {
            revert WeeklySliceLimitReached();
        }
    }

    /**
     * @dev Record a slice as SENT - called when slice is sent (before claim)
     * Updates daily sent tracking for the sponsor
     */
    function _recordSliceSent(address sponsor) internal {
        uint256 currentDayId = pizzaParty.dailyGameId();

        // Reset daily sent counter if new day
        if (lastSliceSentDayId[sponsor] != currentDayId) {
            lastSliceSentDayId[sponsor] = currentDayId;
            slicesSentToday[sponsor] = 0;
        }

        // Increment daily sent count
        slicesSentToday[sponsor] += 1;
    }

    /**
     * @dev Consume a slice - called when slice is CLAIMED (not when sent)
     * Updates daily and weekly tracking for the sponsor
     */
    function _consumeSlice(address sponsor) internal {
        uint256 currentWeekId = pizzaParty.weeklyGameId();
        uint256 currentDayId = pizzaParty.dailyGameId();

        // Reset weekly counter if new week
        if (lastSliceWeekId[sponsor] != currentWeekId) {
            lastSliceWeekId[sponsor] = currentWeekId;
            slicesUsedThisWeek[sponsor] = 0;
        }

        // Mark today as used (for daily limit)
        lastSliceDayId[sponsor] = currentDayId;
        // Increment weekly usage
        slicesUsedThisWeek[sponsor] += 1;
    }

    /**
     * @dev Enforce slice limits - for immediate redemption (redeemSlice)
     * Checks limits AND consumes the slice in one call
     * For pending slice flows, use _checkSliceLimit (send) + _consumeSlice (claim) separately
     */
    function _enforceSliceLimit(address sponsor) internal {
        _checkSliceLimit(sponsor);
        _consumeSlice(sponsor);
    }

    // ============ Franchise Fee Distribution ============

    /**
     * @dev Allocate new fees to treasury, ops, and owner claimable balances
     * Split: 30% treasury, 50% parlor owners (proportional), 20% ops
     * Anyone can call this to process new incoming fees
     * Treasury and ops are paid immediately, owner shares are stored for claiming
     */
    function allocateFees() external nonReentrant {
        IERC20 token = pizzaToken;

        // Calculate new fees since last allocation
        uint256 currentBalance = token.balanceOf(address(this));

        // Account for unclaimed owner balances still in contract
        uint256 totalUnclaimed = _getTotalUnclaimedBalance();
        uint256 availableForAllocation = currentBalance > totalUnclaimed ? currentBalance - totalUnclaimed : 0;

        // Early return if no fees to distribute (don't revert - allows safe calling from settlement)
        if (availableForAllocation == 0) return;

        // Calculate splits
        uint256 treasuryAmount = (availableForAllocation * FRANCHISE_TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 ownersAmount = (availableForAllocation * FRANCHISE_OWNERS_BPS) / BPS_DENOMINATOR;
        uint256 opsAmount = availableForAllocation - treasuryAmount - ownersAmount;

        // Pay treasury immediately
        token.safeTransfer(treasuryWallet, treasuryAmount);

        // Pay ops immediately
        token.safeTransfer(opsWallet, opsAmount);

        // Allocate owner shares to claimable balances (proportional to parlors owned)
        if (ownersAmount > 0 && totalParlors > 0) {
            uint256 amountPerParlor = ownersAmount / totalParlors;
            uint256 allocated = 0;

            for (uint256 i = 0; i < parlorOwners.length; i++) {
                address ownerAddr = parlorOwners[i];
                uint256 ownerParlors = parlorCount[ownerAddr];
                if (ownerParlors > 0) {
                    uint256 ownerShare = amountPerParlor * ownerParlors;
                    claimableBalance[ownerAddr] += ownerShare;
                    allocated += ownerShare;
                }
            }

            // Send remainder dust to treasury
            uint256 dust = ownersAmount - allocated;
            if (dust > 0) {
                token.safeTransfer(treasuryWallet, dust);
            }
        } else if (ownersAmount > 0) {
            // No parlor owners yet, send to treasury
            token.safeTransfer(treasuryWallet, ownersAmount);
        }

        emit FranchiseFeesAllocated(availableForAllocation, treasuryAmount, opsAmount, ownersAmount);
    }

    /**
     * @dev Claim your own accumulated fees
     * Only parlor owners can claim their own share
     */
    function claimMyFees() external nonReentrant {
        uint256 amount = claimableBalance[msg.sender];
        if (amount == 0) revert NoFeesClaimed();

        // Clear balance before transfer (reentrancy protection)
        claimableBalance[msg.sender] = 0;

        // Transfer to owner
        pizzaToken.safeTransfer(msg.sender, amount);

        emit OwnerFeesClaimed(msg.sender, amount);
    }

    /**
     * @dev Get total unclaimed balance across all owners
     */
    function _getTotalUnclaimedBalance() internal view returns (uint256 total) {
        for (uint256 i = 0; i < parlorOwners.length; i++) {
            total += claimableBalance[parlorOwners[i]];
        }
    }

    /**
     * @dev Legacy function - now just calls allocateFees()
     * @notice Deprecated: Use allocateFees() instead
     */
    function distributeFranchiseFees() external nonReentrant {
        // For backwards compatibility, redirect to allocateFees logic
        IERC20 token = pizzaToken;

        uint256 currentBalance = token.balanceOf(address(this));
        uint256 totalUnclaimed = _getTotalUnclaimedBalance();
        uint256 availableForAllocation = currentBalance > totalUnclaimed ? currentBalance - totalUnclaimed : 0;

        // Early return if no fees to distribute (don't revert - allows safe calling)
        if (availableForAllocation == 0) return;

        uint256 treasuryAmount = (availableForAllocation * FRANCHISE_TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 ownersAmount = (availableForAllocation * FRANCHISE_OWNERS_BPS) / BPS_DENOMINATOR;
        uint256 opsAmount = availableForAllocation - treasuryAmount - ownersAmount;

        token.safeTransfer(treasuryWallet, treasuryAmount);
        token.safeTransfer(opsWallet, opsAmount);

        if (ownersAmount > 0 && totalParlors > 0) {
            uint256 amountPerParlor = ownersAmount / totalParlors;
            uint256 allocated = 0;

            for (uint256 i = 0; i < parlorOwners.length; i++) {
                address ownerAddr = parlorOwners[i];
                uint256 ownerParlors = parlorCount[ownerAddr];
                if (ownerParlors > 0) {
                    uint256 ownerShare = amountPerParlor * ownerParlors;
                    claimableBalance[ownerAddr] += ownerShare;
                    allocated += ownerShare;
                }
            }

            uint256 dust = ownersAmount - allocated;
            if (dust > 0) {
                token.safeTransfer(treasuryWallet, dust);
            }
        } else if (ownersAmount > 0) {
            token.safeTransfer(treasuryWallet, ownersAmount);
        }

        emit FranchiseFeesAllocated(availableForAllocation, treasuryAmount, opsAmount, ownersAmount);
    }

    // ============ Parlor Naming ============

    /**
     * @dev Set your franchise name (can only be set once, max 20 characters)
     * @param name The franchise name to set
     */
    function setParlorName(string calldata name) external {
        // Must own a parlor
        if (parlorCount[msg.sender] == 0) revert NoParlorOwned();

        // Can only set name once
        if (bytes(parlorName[msg.sender]).length > 0) revert ParlorAlreadyNamed();

        // Validate name length
        if (bytes(name).length == 0) revert NameEmpty();
        if (bytes(name).length > 20) revert NameTooLong();

        parlorName[msg.sender] = name;

        emit ParlorNamed(msg.sender, name);
    }

    /**
     * @dev Check if an owner has named their parlor
     * @param owner Address to check
     */
    function hasParlorName(address owner) external view returns (bool) {
        return bytes(parlorName[owner]).length > 0;
    }

    /**
     * @dev Admin function to set or change a parlor name (owner only)
     * @param owner The parlor owner's address
     * @param name The franchise name to set
     */
    function adminSetParlorName(address owner, string calldata name) external onlyOwner {
        // Must own a parlor
        if (parlorCount[owner] == 0) revert NoParlorOwned();

        // Validate name length
        if (bytes(name).length == 0) revert NameEmpty();
        if (bytes(name).length > 20) revert NameTooLong();

        parlorName[owner] = name;

        emit ParlorNamed(owner, name);
    }

    // ============ View Functions ============

    function parlorOwnersCount() external view returns (uint256) {
        return parlorOwners.length;
    }

    function parlorOwnerAt(uint256 index) external view returns (address) {
        return parlorOwners[index];
    }

    function parlorsRemaining() external view returns (uint256) {
        return MAX_PARLORS - totalParlors;
    }

    /**
     * @dev Returns how many slices the sponsor can still send TODAY
     * With new limits: max 1 per day, so returns 0 or 1
     * Also checks weekly limit - returns 0 if weekly limit reached
     */
    function slicesRemainingToday(address sponsor) external view returns (uint256) {
        uint256 currentDayId = pizzaParty.dailyGameId();
        uint256 currentWeekId = pizzaParty.weeklyGameId();

        // Check daily limit first - already sent today?
        if (lastSliceDayId[sponsor] == currentDayId) {
            return 0;  // Already sent 1 today
        }

        // Check weekly limit
        uint256 weeklyUsed = slicesUsedThisWeek[sponsor];
        // Reset if new week
        if (lastSliceWeekId[sponsor] != currentWeekId) {
            weeklyUsed = 0;
        }

        uint256 maxWeeklySlices = _getWeeklySliceAllowance(sponsor);
        if (weeklyUsed >= maxWeeklySlices) {
            return 0;  // Weekly limit reached
        }

        // Can send 1 today (daily limit not reached, weekly limit not reached)
        return 1;
    }

    /**
     * @dev Returns how many slices remaining this WEEK
     * Resets on Monday when weekly game settles
     * Note: 5-parlor owners get 7 slices, others get 1 per parlor
     */
    function slicesRemainingThisWeek(address sponsor) external view returns (uint256) {
        uint256 currentWeekId = pizzaParty.weeklyGameId();

        uint256 maxWeeklySlices = _getWeeklySliceAllowance(sponsor);

        // Reset if new week
        if (lastSliceWeekId[sponsor] != currentWeekId) {
            return maxWeeklySlices;  // New week, full allowance
        }

        uint256 used = slicesUsedThisWeek[sponsor];
        return maxWeeklySlices > used ? maxWeeklySlices - used : 0;
    }

    /**
     * @dev Returns the weekly slice allowance for a sponsor (public view version)
     * - Owners with 5 parlors get 7 slices per week
     * - Owners with 1-4 parlors get 1 slice per parlor per week
     */
    function weeklySliceAllowance(address sponsor) external view returns (uint256) {
        return _getWeeklySliceAllowance(sponsor);
    }

    /**
     * @dev Check if sponsor has already sent a slice today
     */
    function hasSentSliceToday(address sponsor) external view returns (bool) {
        return lastSliceDayId[sponsor] == pizzaParty.dailyGameId();
    }

    function isNonceUsed(address sponsor, uint256 nonce) external view returns (bool) {
        return usedSliceNonce[sponsor][nonce];
    }

    /**
     * @dev Check if an address has a pending (claimable) slice for today's game
     * @param recipient The address to check
     * @return hasPending True if there's a valid pending slice
     * @return sponsor The sponsor who sent the slice (address(0) if none)
     */
    function hasPendingSlice(address recipient) external view returns (bool hasPending, address sponsor) {
        PendingSlice storage pending = pendingSlices[recipient];
        uint256 currentGameId = pizzaParty.dailyGameId();

        if (pending.sponsor != address(0) && pending.dailyGameId == currentGameId) {
            return (true, pending.sponsor);
        }
        return (false, address(0));
    }

    /**
     * @dev Get full details of a pending slice
     * @param recipient The address to check
     * @return sponsor The sponsor address (address(0) if none)
     * @return dailyGameId The game ID the slice is for
     * @return isValid True if the slice is valid for today's game
     */
    function getPendingSlice(address recipient) external view returns (
        address sponsor,
        uint256 dailyGameId,
        bool isValid
    ) {
        PendingSlice storage pending = pendingSlices[recipient];
        uint256 currentGameId = pizzaParty.dailyGameId();

        return (
            pending.sponsor,
            pending.dailyGameId,
            pending.sponsor != address(0) && pending.dailyGameId == currentGameId
        );
    }

    /**
     * @dev Get pending fees ready for allocation (excludes already-allocated owner balances)
     */
    function pendingFees() external view returns (uint256) {
        uint256 currentBalance = pizzaToken.balanceOf(address(this));
        uint256 totalUnclaimed = _getTotalUnclaimedBalance();
        return currentBalance > totalUnclaimed ? currentBalance - totalUnclaimed : 0;
    }

    /**
     * @dev Get total unclaimed owner balances (read-only version)
     */
    function totalUnclaimedOwnerFees() external view returns (uint256) {
        return _getTotalUnclaimedBalance();
    }

    /**
     * @dev Get your estimated share of pending fees (before allocation)
     * @param owner Address to check
     */
    function estimatedPendingShare(address owner) external view returns (uint256) {
        if (totalParlors == 0 || parlorCount[owner] == 0) return 0;

        uint256 currentBalance = pizzaToken.balanceOf(address(this));
        uint256 totalUnclaimed = _getTotalUnclaimedBalance();
        uint256 availableForAllocation = currentBalance > totalUnclaimed ? currentBalance - totalUnclaimed : 0;

        if (availableForAllocation == 0) return 0;

        uint256 ownersAmount = (availableForAllocation * FRANCHISE_OWNERS_BPS) / BPS_DENOMINATOR;
        uint256 amountPerParlor = ownersAmount / totalParlors;
        return amountPerParlor * parlorCount[owner];
    }

    /**
     * @dev Get the EIP-712 domain separator
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ============ Admin Functions ============

    function setParlorPrice(uint256 newPrice) external onlyOwner {
        uint256 oldPrice = parlorPrice;
        parlorPrice = newPrice;
        emit ParlorPriceUpdated(oldPrice, newPrice);
    }

    function setTreasuryWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert InvalidAddress();
        address oldWallet = treasuryWallet;
        treasuryWallet = newWallet;
        emit TreasuryWalletUpdated(oldWallet, newWallet);
    }

    function setOpsWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert InvalidAddress();
        address oldWallet = opsWallet;
        opsWallet = newWallet;
        emit OpsWalletUpdated(oldWallet, newWallet);
    }

    /**
     * @dev Admin function to update the PIZZA token address (for token migration)
     */
    function adminSetPizzaToken(address newToken) external onlyOwner {
        if (newToken == address(0)) revert InvalidAddress();
        pizzaToken = IERC20(newToken);
    }

    /**
     * @dev Emergency withdraw of any stuck tokens
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @dev Reset claimable balance for an address (admin only)
     * Use case: Fix corrupted storage from upgrade issues
     * @param owner Address to reset
     */
    function resetClaimableBalance(address owner) external onlyOwner {
        claimableBalance[owner] = 0;
    }

    /**
     * @dev Add to claimable balance for an address (admin only)
     * Use case: Compensate owners for lost fees due to storage corruption
     * @param owner Address to credit
     * @param amount PIZZA amount to add (18 decimals)
     */
    function addClaimableBalance(address owner, uint256 amount) external onlyOwner {
        claimableBalance[owner] += amount;
    }

    /**
     * @dev Emergency transfer parlors between wallets (admin only)
     * Use case: User lost access to wallet, needs parlors moved to new wallet
     * @param from Source wallet address
     * @param to Destination wallet address
     * @param amount Number of parlors to transfer
     */
    function emergencyTransferParlors(
        address from,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (from == address(0) || to == address(0)) revert InvalidAddress();
        require(parlorCount[from] >= amount, "Insufficient parlors");
        require(parlorCount[to] + amount <= MAX_PARLORS_PER_WALLET, "Exceeds max per wallet");

        parlorCount[from] -= amount;
        parlorCount[to] += amount;

        // Track as parlor owner if first parlor for destination
        if (!isParlorOwner[to] && parlorCount[to] > 0) {
            isParlorOwner[to] = true;
            parlorOwners.push(to);
        }

        emit EmergencyParlorTransfer(from, to, amount);
    }

    /**
     * @dev Admin function to reset slice counters for sponsors (one-time testing)
     * Resets both weekly and daily tracking
     * @param sponsors Array of sponsor addresses to reset
     */
    function resetSliceCounters(address[] calldata sponsors) external onlyOwner {
        for (uint256 i = 0; i < sponsors.length; i++) {
            slicesUsedThisWeek[sponsors[i]] = 0;
            lastSliceDayId[sponsors[i]] = 0;
            // Legacy fields (for completeness)
            slicesUsedThisGame[sponsors[i]] = 0;
        }
    }

    /**
     * @dev Admin function to send a slice on behalf of a sponsor
     * Allows admin to manually create pending slices for testing/support
     * @param sponsor The parlor owner to record as the sponsor (does NOT need to own a parlor)
     * @param recipient The address to receive the pending slice
     */
    function adminSendSlice(address sponsor, address recipient) external onlyOwner {
        if (recipient == address(0) || sponsor == address(0)) revert InvalidAddress();
        if (recipient == sponsor) revert NoSelfSlice();

        uint256 currentGameId = pizzaParty.dailyGameId();

        // Store pending slice (overwrites any existing)
        pendingSlices[recipient] = PendingSlice({
            sponsor: sponsor,
            dailyGameId: currentGameId
        });

        emit SliceSent(sponsor, recipient, currentGameId);
    }

    // ============ UUPS Upgrade Authorization ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
