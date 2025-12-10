// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./PizzaPartyV2Upgradeable.sol";

/**
 * @title PizzaParlorManagerUpgradeable
 * @dev UUPS Upgradeable version of PizzaParlorManager
 * Manages Pizza Parlor franchises for the Pizza Party ecosystem
 *
 * Features:
 * - Sell parlors (franchises) to users, with payment split into burn/treasury/ops
 * - Track parlor ownership (up to 100 parlors total)
 * - Grant daily free "slice" entries to recipients (1 per parlor per day)
 * - Receive and redistribute owner fees from PizzaPartyV2
 *
 * Revenue Flow:
 * - Parlor purchases: 50% burned, 30% treasury, 20% ops
 * - Owner fees from daily pot: 30% treasury, 50% parlor owners, 20% ops
 */
contract PizzaParlorManagerUpgradeable is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant MAX_PARLORS = 100;
    uint256 public constant BURN_BPS = 5000;      // 50%
    uint256 public constant TREASURY_BPS = 3000;  // 30%
    uint256 public constant OPS_BPS = 2000;       // 20%
    uint256 public constant BPS_DENOMINATOR = 10000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // Fee distribution splits (for accumulated owner fees from PizzaPartyV2)
    // 30% treasury, 50% parlor owners, 20% ops/marketing
    uint256 public constant FEE_TREASURY_BPS = 3000;  // 30%
    uint256 public constant FEE_PARLORS_BPS = 5000;   // 50%
    uint256 public constant FEE_OPS_BPS = 2000;       // 20%

    // ============ State Variables ============
    // NOTE: Storage layout must remain compatible with future upgrades

    IERC20 public pizzaToken;
    PizzaPartyV2Upgradeable public pizzaParty;
    address public treasury;
    address public ops;

    // Parlor price: $50 at $0.001/PIZZA = 50,000 PIZZA
    uint256 public parlorPricePizza;

    // Free entries per parlor per day
    uint256 public dailyFreeEntriesPerParlor;

    // Parlor ownership tracking
    mapping(address => uint256) public parlorCount;
    uint256 public totalParlors;

    // Track all parlor owners for iteration
    address[] public parlorOwners;
    mapping(address => bool) public isParlorOwner;

    // Slice usage tracking (resets daily)
    mapping(address => uint256) public lastSliceDay;
    mapping(address => uint256) public slicesUsedToday;

    // Owner fee tracking (from PizzaPartyV2)
    uint256 public totalOwnerFeesReceived;

    // ============ Events ============

    event ParlorPurchased(address indexed owner, uint256 totalParlorsOwned, uint256 price);
    event SliceTipped(address indexed fromParlorOwner, address indexed toPlayer, uint256 gameId);
    event ParlorPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event DailyEntriesPerParlorUpdated(uint256 oldValue, uint256 newValue);
    event OwnerFeesDistributed(uint256 totalAmount, uint256 toTreasury, uint256 toOps, uint256 toParlors);
    event ParlorRewardClaimed(address indexed owner, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event OpsUpdated(address indexed oldOps, address indexed newOps);
    event PizzaPartyUpdated(address indexed oldPizzaParty, address indexed newPizzaParty);

    // ============ Initializer (replaces constructor) ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the contract (replaces constructor for upgradeable pattern)
     * @param _pizzaToken Address of the PIZZA token
     * @param _pizzaParty Address of the PizzaPartyV2Upgradeable contract
     * @param _treasury Treasury wallet address
     * @param _ops Operations wallet address
     * @param _owner Initial owner address
     */
    function initialize(
        address _pizzaToken,
        address _pizzaParty,
        address _treasury,
        address _ops,
        address _owner
    ) external initializer {
        require(_pizzaToken != address(0), "Invalid pizza token");
        require(_pizzaParty != address(0), "Invalid pizza party");
        require(_treasury != address(0), "Invalid treasury");
        require(_ops != address(0), "Invalid ops");
        require(_owner != address(0), "Invalid owner");

        // Initialize inherited contracts
        // Note: UUPSUpgradeable and ReentrancyGuard are stateless in OZ v5
        __Ownable_init(_owner);

        pizzaToken = IERC20(_pizzaToken);
        pizzaParty = PizzaPartyV2Upgradeable(_pizzaParty);
        treasury = _treasury;
        ops = _ops;

        // Set default values
        parlorPricePizza = 50000e18;     // $50 at $0.001/PIZZA = 50,000 PIZZA
        dailyFreeEntriesPerParlor = 1;
    }

    // ============ UUPS Upgrade Authorization ============

    /**
     * @dev Required override for UUPS pattern - only owner can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Parlor Purchase ============

    /**
     * @dev Purchase a parlor franchise
     * - Requires approval for parlorPricePizza amount
     * - Splits payment: 50% burn, 30% treasury, 20% ops
     */
    function buyParlor() external nonReentrant {
        require(totalParlors < MAX_PARLORS, "Max parlors reached");

        uint256 price = parlorPricePizza;

        // Transfer payment from buyer
        pizzaToken.safeTransferFrom(msg.sender, address(this), price);

        // Calculate splits
        uint256 burnAmount = (price * BURN_BPS) / BPS_DENOMINATOR;
        uint256 treasuryAmount = (price * TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 opsAmount = price - burnAmount - treasuryAmount;

        // Execute transfers
        if (burnAmount > 0) {
            pizzaToken.safeTransfer(BURN_ADDRESS, burnAmount);
        }
        if (treasuryAmount > 0) {
            pizzaToken.safeTransfer(treasury, treasuryAmount);
        }
        if (opsAmount > 0) {
            pizzaToken.safeTransfer(ops, opsAmount);
        }

        // Track new owner if first parlor
        if (!isParlorOwner[msg.sender]) {
            isParlorOwner[msg.sender] = true;
            parlorOwners.push(msg.sender);
        }

        // Update counts
        parlorCount[msg.sender] += 1;
        totalParlors += 1;

        emit ParlorPurchased(msg.sender, parlorCount[msg.sender], price);
    }

    // ============ Slice (Free Entry) System ============

    /**
     * @dev Tip a free daily entry (slice) to a recipient
     * - Caller must own at least 1 parlor
     * - Daily limit: 1 slice per parlor owned
     * - Recipient gets free entry to current daily game
     * - Slice day resets at 12pm PST (20:00 UTC) to align with game day
     *
     * @param recipient Address to receive the free entry
     */
    function tipSlice(address recipient) external nonReentrant {
        require(parlorCount[msg.sender] > 0, "No parlor owned");
        require(recipient != address(0), "Invalid recipient");

        // Calculate current game day (resets at 12pm PST / 20:00 UTC)
        uint256 currentGameDay = _getCurrentGameDay();

        // Reset daily counter if new game day
        if (currentGameDay > lastSliceDay[msg.sender]) {
            slicesUsedToday[msg.sender] = 0;
            lastSliceDay[msg.sender] = currentGameDay;
        }

        // Check daily limit
        uint256 maxToday = parlorCount[msg.sender] * dailyFreeEntriesPerParlor;
        require(slicesUsedToday[msg.sender] < maxToday, "Daily slice limit reached");

        // Increment usage
        slicesUsedToday[msg.sender] += 1;

        // Grant free entry via PizzaPartyV2
        pizzaParty.enterDailyWithSlice(recipient);

        emit SliceTipped(msg.sender, recipient, pizzaParty.dailyGameId());
    }

    /**
     * @dev Get remaining slices for today (game day, resets at 12pm PST)
     * @param owner Address to check
     * @return remaining Number of slices remaining today
     */
    function getRemainingSlices(address owner) external view returns (uint256 remaining) {
        if (parlorCount[owner] == 0) return 0;

        uint256 currentGameDay = _getCurrentGameDay();
        uint256 maxToday = parlorCount[owner] * dailyFreeEntriesPerParlor;

        if (currentGameDay > lastSliceDay[owner]) {
            // New game day, all slices available
            return maxToday;
        }

        if (slicesUsedToday[owner] >= maxToday) {
            return 0;
        }

        return maxToday - slicesUsedToday[owner];
    }

    // ============ Owner Fee Distribution ============

    /**
     * @dev Distribute accumulated owner fees
     * - Anyone can call this to trigger distribution
     * - Splits: 30% treasury, 50% parlor owners (weighted by # of parlors), 20% ops/marketing
     *
     * Note: For V1, the parlor owner share is kept simple - equal split per parlor unit.
     * Future versions may implement more sophisticated reward tracking.
     */
    function distributeFranchiseFees() external nonReentrant {
        uint256 balance = pizzaToken.balanceOf(address(this));
        require(balance > 0, "No fees to distribute");

        // Calculate splits: 30% treasury, 50% parlors, 20% ops
        uint256 toTreasury = (balance * FEE_TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 toParlors = (balance * FEE_PARLORS_BPS) / BPS_DENOMINATOR;
        uint256 toOps = balance - toTreasury - toParlors;

        // Transfer to treasury and ops
        if (toTreasury > 0) {
            pizzaToken.safeTransfer(treasury, toTreasury);
        }
        if (toOps > 0) {
            pizzaToken.safeTransfer(ops, toOps);
        }

        // Distribute to parlor owners
        if (toParlors > 0 && totalParlors > 0) {
            uint256 perParlor = toParlors / totalParlors;

            if (perParlor > 0) {
                // Iterate through all parlor owners and pay based on their parlor count
                for (uint256 i = 0; i < parlorOwners.length; i++) {
                    address ownerAddr = parlorOwners[i];
                    uint256 ownerParlors = parlorCount[ownerAddr];

                    if (ownerParlors > 0) {
                        uint256 ownerShare = perParlor * ownerParlors;
                        pizzaToken.safeTransfer(ownerAddr, ownerShare);
                        emit ParlorRewardClaimed(ownerAddr, ownerShare);
                    }
                }
            }

            // Any dust from rounding goes to treasury
            uint256 remaining = pizzaToken.balanceOf(address(this));
            if (remaining > 0) {
                pizzaToken.safeTransfer(treasury, remaining);
            }
        }

        totalOwnerFeesReceived += balance;
        emit OwnerFeesDistributed(balance, toTreasury, toOps, toParlors);
    }

    // ============ View Functions ============

    /**
     * @dev Get parlor info for an owner (game day resets at 12pm PST)
     */
    function getParlorInfo(address owner) external view returns (
        uint256 parlorsOwned,
        uint256 slicesRemainingToday,
        uint256 slicesUsed,
        uint256 maxSlicesToday
    ) {
        uint256 currentGameDay = _getCurrentGameDay();
        uint256 maxToday = parlorCount[owner] * dailyFreeEntriesPerParlor;
        uint256 used = (currentGameDay > lastSliceDay[owner]) ? 0 : slicesUsedToday[owner];
        uint256 remaining = (used >= maxToday) ? 0 : maxToday - used;

        return (
            parlorCount[owner],
            remaining,
            used,
            maxToday
        );
    }

    /**
     * @dev Get total number of parlor owners
     */
    function getParlorOwnerCount() external view returns (uint256) {
        return parlorOwners.length;
    }

    /**
     * @dev Get parlor owner at index
     */
    function getParlorOwnerAtIndex(uint256 index) external view returns (address) {
        require(index < parlorOwners.length, "Index out of bounds");
        return parlorOwners[index];
    }

    /**
     * @dev Get current contract balance (accumulated fees)
     * Note: Assumes all PIZZA in this contract are owner fees / franchise revenues
     */
    function getAccumulatedFees() external view returns (uint256) {
        return pizzaToken.balanceOf(address(this));
    }

    // ============ Internal Helpers ============

    /**
     * @dev Calculate the current "game day" index based on 12pm PST (20:00 UTC) boundaries
     * This aligns slice resets with the daily game schedule in PizzaPartyV2
     *
     * Game day boundaries:
     * - Day N starts at 12pm PST (20:00 UTC) on calendar day N-1
     * - Day N ends at 12pm PST (20:00 UTC) on calendar day N
     *
     * @return gameDay A monotonically increasing day index that changes at 12pm PST
     */
    function _getCurrentGameDay() internal view returns (uint256) {
        // 12pm PST = 20:00 UTC = 20 hours after UTC midnight
        // To get the game day, we shift the timestamp back by 20 hours,
        // then divide by 1 day to get the day index.
        // This effectively makes 20:00 UTC the start of each new day.
        uint256 PT_OFFSET = 20 hours; // 12pm PST = 20:00 UTC
        return (block.timestamp - PT_OFFSET) / 1 days;
    }

    // ============ Admin Functions ============

    /**
     * @dev Update parlor price (owner only)
     * @param _newPrice New price in PIZZA tokens (18 decimals)
     */
    function setParlorPrice(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "Price must be > 0");
        uint256 oldPrice = parlorPricePizza;
        parlorPricePizza = _newPrice;
        emit ParlorPriceUpdated(oldPrice, _newPrice);
    }

    /**
     * @dev Update daily free entries per parlor (owner only)
     * @param _entries Number of free entries per parlor per day
     */
    function setDailyFreeEntriesPerParlor(uint256 _entries) external onlyOwner {
        uint256 oldValue = dailyFreeEntriesPerParlor;
        dailyFreeEntriesPerParlor = _entries;
        emit DailyEntriesPerParlorUpdated(oldValue, _entries);
    }

    /**
     * @dev Update treasury address (owner only)
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @dev Update ops address (owner only)
     * @param _ops New ops address
     */
    function setOps(address _ops) external onlyOwner {
        require(_ops != address(0), "Invalid ops");
        address oldOps = ops;
        ops = _ops;
        emit OpsUpdated(oldOps, _ops);
    }

    /**
     * @dev Update PizzaParty address (owner only, for upgrades)
     * @param _pizzaParty New PizzaPartyV2Upgradeable address
     */
    function setPizzaParty(address _pizzaParty) external onlyOwner {
        require(_pizzaParty != address(0), "Invalid pizza party");
        address oldPizzaParty = address(pizzaParty);
        pizzaParty = PizzaPartyV2Upgradeable(_pizzaParty);
        emit PizzaPartyUpdated(oldPizzaParty, _pizzaParty);
    }

    /**
     * @dev Emergency withdraw (owner only)
     * Sends all tokens to treasury
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = pizzaToken.balanceOf(address(this));
        if (balance > 0) {
            pizzaToken.safeTransfer(treasury, balance);
        }
    }
}
