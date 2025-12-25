// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant MAX_PARLORS = 333;
    uint256 public constant MAX_PARLORS_PER_WALLET = 5;
    uint256 public constant DAILY_FREE_ENTRIES_PER_PARLOR = 1;

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

    // Slice tracking (aligned with dailyGameId)
    mapping(address => uint256) public lastSliceGameId;      // sponsor => last gameId they used slices
    mapping(address => uint256) public slicesUsedThisGame;   // sponsor => slices used in current game

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

    // Upgrade safety gap - reserves storage slots for future upgrades
    uint256[46] private __gap;  // Reduced by 2 for parlorName and pendingSlices

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
     * @param recipient The address to receive the pending slice
     */
    function sendSlice(address recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient == msg.sender) revert NoSelfSlice();

        // Must own a parlor
        if (parlorCount[msg.sender] == 0) revert NoParlorOwned();

        // Check if recipient already has a pending slice for TODAY's game
        uint256 currentGameId = pizzaParty.dailyGameId();
        PendingSlice storage existing = pendingSlices[recipient];
        if (existing.sponsor != address(0) && existing.dailyGameId == currentGameId) {
            revert AlreadyHasPendingSlice();
        }

        // Enforce daily slice limit for sender
        _enforceSliceLimit(msg.sender);

        // Store pending slice (overwrites any expired slice from previous games)
        pendingSlices[recipient] = PendingSlice({
            sponsor: msg.sender,
            dailyGameId: currentGameId
        });

        emit SliceSent(msg.sender, recipient, currentGameId);
    }

    /**
     * @dev Claim your pending slice and enter the daily game
     * Called by the recipient when they open Pizza Party
     * @param entryFeeAmount The $1 worth of PIZZA to pull from treasury (calculated by frontend)
     */
    function claimSlice(uint256 entryFeeAmount) external nonReentrant {
        PendingSlice storage pending = pendingSlices[msg.sender];

        // Must have a pending slice
        if (pending.sponsor == address(0)) revert NoPendingSlice();

        // Must be for today's game (slice expires when game changes)
        uint256 currentGameId = pizzaParty.dailyGameId();
        if (pending.dailyGameId != currentGameId) revert SliceExpiredWrongGame();

        address sponsor = pending.sponsor;

        // Clear pending slice before external call (reentrancy protection)
        delete pendingSlices[msg.sender];

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
     */
    function tipSlice(address recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient == msg.sender) revert NoSelfSlice();

        // Must own a parlor
        if (parlorCount[msg.sender] == 0) revert NoParlorOwned();

        // Check if recipient already has a pending slice for TODAY's game
        uint256 currentGameId = pizzaParty.dailyGameId();
        PendingSlice storage existing = pendingSlices[recipient];
        if (existing.sponsor != address(0) && existing.dailyGameId == currentGameId) {
            revert AlreadyHasPendingSlice();
        }

        // Enforce daily slice limit
        _enforceSliceLimit(msg.sender);

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
     * @dev Enforce daily slice limit (1 per parlor per day)
     * Resets when dailyGameId changes
     */
    function _enforceSliceLimit(address sponsor) internal {
        uint256 currentGameId = pizzaParty.dailyGameId();

        // Reset if new game day
        if (lastSliceGameId[sponsor] != currentGameId) {
            lastSliceGameId[sponsor] = currentGameId;
            slicesUsedThisGame[sponsor] = 0;
        }

        // Check limit
        uint256 maxSlices = parlorCount[sponsor] * DAILY_FREE_ENTRIES_PER_PARLOR;
        if (slicesUsedThisGame[sponsor] >= maxSlices) revert DailySliceLimitReached();

        // Increment usage
        slicesUsedThisGame[sponsor] += 1;
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

    function slicesRemainingToday(address sponsor) external view returns (uint256) {
        uint256 currentGameId = pizzaParty.dailyGameId();

        uint256 maxSlices = parlorCount[sponsor] * DAILY_FREE_ENTRIES_PER_PARLOR;

        if (lastSliceGameId[sponsor] != currentGameId) {
            return maxSlices;  // New day, full allowance
        }

        uint256 used = slicesUsedThisGame[sponsor];
        return maxSlices > used ? maxSlices - used : 0;
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
     * @dev Emergency withdraw of any stuck tokens
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
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
     * @param sponsors Array of sponsor addresses to reset
     */
    function resetSliceCounters(address[] calldata sponsors) external onlyOwner {
        for (uint256 i = 0; i < sponsors.length; i++) {
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
