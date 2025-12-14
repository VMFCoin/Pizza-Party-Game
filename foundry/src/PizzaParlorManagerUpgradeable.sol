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
    function enterDailyWithSlice(address player, address sponsor) external;
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

    uint256 public constant MAX_PARLORS = 100;
    uint256 public constant MAX_PARLORS_PER_WALLET = 5;
    uint256 public constant DAILY_FREE_ENTRIES_PER_PARLOR = 1;

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

    // Parlor pricing
    uint256 public parlorPrice;  // Price in PIZZA tokens (default: 50,000 PIZZA)

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

    // Upgrade safety gap - reserves storage slots for future upgrades
    uint256[50] private __gap;

    // ============ Events ============

    event ParlorPurchased(address indexed buyer, uint256 indexed globalSerial, uint256 buyerTotalOwned, uint256 price);
    event SliceTipped(address indexed sponsor, address indexed recipient, uint256 indexed dailyGameId);
    event SliceRedeemed(address indexed sponsor, address indexed recipient, uint256 indexed dailyGameId, uint256 nonce);
    event FranchiseFeesDistributed(uint256 totalFees, uint256 treasuryAmount, uint256 ownersAmount, uint256 opsAmount);
    event ParlorPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryWalletUpdated(address oldWallet, address newWallet);
    event OpsWalletUpdated(address oldWallet, address newWallet);

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
    error NoSelfSlice();

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
        parlorPrice = 50_000e18;  // 50,000 PIZZA (~$50 at $0.001/PIZZA)
    }

    // ============ Parlor Purchase ============

    /**
     * @dev Purchase a new parlor
     * Split: 50% burn, 30% treasury, 20% ops
     */
    function purchaseParlor() external nonReentrant {
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

    // ============ Direct Slice Tipping ============

    /**
     * @dev Tip a slice directly to a recipient (no signature required)
     * @param recipient The address to receive the free daily entry
     */
    function tipSlice(address recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient == msg.sender) revert NoSelfSlice();

        // Must own a parlor
        if (parlorCount[msg.sender] == 0) revert NoParlorOwned();

        // Enforce daily slice limit
        _enforceSliceLimit(msg.sender);

        // Enter daily game for recipient
        pizzaParty.enterDailyWithSlice(recipient, msg.sender);

        emit SliceTipped(msg.sender, recipient, pizzaParty.dailyGameId());
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
     */
    function redeemSlice(
        address sponsor,
        uint256 dailyGameId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
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

        // Enter daily game for redeemer
        pizzaParty.enterDailyWithSlice(msg.sender, sponsor);

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
     * @dev Distribute franchise fees (reads current PIZZA balance)
     * Split: 30% treasury, 50% parlor owners (proportional), 20% ops
     * Anyone can call this - uses balanceOf(address(this)) instead of accumulator
     */
    function distributeFranchiseFees() external nonReentrant {
        IERC20 token = pizzaToken;

        // Read current balance (no accumulator needed)
        uint256 fees = token.balanceOf(address(this));
        if (fees == 0) revert NoFeesToDistribute();

        // Calculate splits
        uint256 treasuryAmount = (fees * FRANCHISE_TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 ownersAmount = (fees * FRANCHISE_OWNERS_BPS) / BPS_DENOMINATOR;
        uint256 opsAmount = fees - treasuryAmount - ownersAmount;

        // Pay treasury
        token.safeTransfer(treasuryWallet, treasuryAmount);

        // Pay ops
        token.safeTransfer(opsWallet, opsAmount);

        // Distribute to parlor owners proportionally
        if (ownersAmount > 0 && totalParlors > 0) {
            uint256 amountPerParlor = ownersAmount / totalParlors;
            uint256 distributed = 0;

            for (uint256 i = 0; i < parlorOwners.length; i++) {
                address ownerAddr = parlorOwners[i];
                uint256 ownerParlors = parlorCount[ownerAddr];
                if (ownerParlors > 0) {
                    uint256 ownerShare = amountPerParlor * ownerParlors;
                    token.safeTransfer(ownerAddr, ownerShare);
                    distributed += ownerShare;
                }
            }

            // Send remainder dust to treasury
            uint256 dust = ownersAmount - distributed;
            if (dust > 0) {
                token.safeTransfer(treasuryWallet, dust);
            }
        } else if (ownersAmount > 0) {
            // No parlor owners yet, send to treasury
            token.safeTransfer(treasuryWallet, ownersAmount);
        }

        emit FranchiseFeesDistributed(fees, treasuryAmount, ownersAmount, opsAmount);
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
     * @dev Get pending fees ready for distribution (current PIZZA balance)
     */
    function pendingFees() external view returns (uint256) {
        return pizzaToken.balanceOf(address(this));
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

    // ============ UUPS Upgrade Authorization ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
