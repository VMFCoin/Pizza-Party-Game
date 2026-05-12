// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPizzaPartyForShare {
    function dailyGameId() external view returns (uint256);
    function weeklyGameId() external view returns (uint256);
    function holdingsUnitPizza() external view returns (uint256);
    function addToppingsFromShareAndSpin(address player, uint256 amount) external;
    function enterDailyFromShareAndSpin(address player, uint256 entryFee) external;
}

/// @title ShareAndSpinUpgradeable — Share on Farcaster, earn PIZZA + spin for prizes
contract ShareAndSpinUpgradeable is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant MAX_SHARES_PER_WEEK = 3;
    uint256 public constant SHARE_SPIN_WEIGHT_TOTAL = 1000;
    uint256 public constant SHARE_SPIN_NOTHING_MAX = 939;
    uint256 public constant SHARE_SPIN_FREESLICE_MAX = 989;

    // ============ Enums ============

    enum ShareSpinOutcome {
        Nothing,    // 0 — roll 0-939    (94.0%)
        FreeSlice,  // 1 — roll 940-989  ( 5.0%)
        Gold        // 2 — roll 990-999  ( 1.0%)
    }

    // ============ State Variables ============

    IERC20 public pizzaToken;
    IPizzaPartyForShare public pizzaParty;
    address public treasuryWallet;

    mapping(address => uint256) public playerLastShareTimestamp;
    uint256 public shareRewardAmount;
    uint256 public shareSpinGoldAwardedWeekId;
    uint256 private shareSpinNonce;

    // Weekly share tracking (independent of PizzaParty)
    // weekId => player => shares used this week
    mapping(uint256 => mapping(address => uint256)) public weeklySharesUsed;

    // Tracks last daily gameId each player shared on — prevents double share same game
    mapping(address => uint256) public lastShareGameId;

    // Cast hash dedup — prevents same cast being used twice
    mapping(bytes32 => bool) public usedCastHashes;

    // Pending free slice — saved for next game when player already entered today
    mapping(address => bool) public pendingFreeSlice;

    // On-chain free slice eligibility — set by spin, consumed by claim
    mapping(address => bool) public hasFreeSlice;

    // DEPRECATED: maxEntryFee — replaced by dynamic check against holdingsUnitPizza
    uint256 public maxEntryFee;

    // Backend signer — dedicated EOA that calls reward functions on behalf of players
    address public backendSigner;

    // Free slice expiration — daily gameId at which the slice was earned
    // Valid for that game and the next game only (48 hr window)
    mapping(address => uint256) public freeSliceGameId;

    // ============ Events ============

    event ShareRecorded(
        address indexed player,
        uint256 indexed gameId,
        uint256 indexed weekId,
        uint256 sharesThisWeek,
        uint256 rewardPaid
    );

    event ShareSpinRecorded(
        address indexed player,
        uint256 indexed gameId,
        uint256 indexed weekId,
        uint8   outcome,
        bytes32 castHash
    );

    event FreeSliceSaved(
        address indexed player,
        uint256 timestamp
    );

    event FreeSliceGifted(
        address indexed sender,
        address indexed recipient,
        uint256 indexed gameId,
        uint256 entryFee
    );

    event PendingSliceClaimed(
        address indexed player,
        uint256 indexed gameId,
        uint256 entryFee
    );

    event ShareSpinGoldWinner(
        address indexed player,
        uint256 indexed gameId,
        uint256 timestamp
    );

    // ============ Initialize ============

    function initialize(
        address _pizzaToken,
        address _pizzaParty,
        address _treasury,
        address _owner
    ) public initializer {
        require(_pizzaToken != address(0), "0");
        require(_pizzaParty != address(0), "0");
        require(_treasury != address(0), "0");
        require(_owner != address(0), "0");

        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        __Pausable_init();

        pizzaToken = IERC20(_pizzaToken);
        pizzaParty = IPizzaPartyForShare(_pizzaParty);
        treasuryWallet = _treasury;
    }

    // ============ UUPS ============

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ============ Core Functions ============

    function recordShare(address player, uint256 claimedReward) external nonReentrant whenNotPaused {
        require(msg.sender == backendSigner, "unauthorized");
        require(player != address(0), "0");
        uint256 gameId = pizzaParty.dailyGameId();
        uint256 weekId = pizzaParty.weeklyGameId();

        // One share per daily game
        require(lastShareGameId[player] != gameId, "Share: already shared this game");

        // Weekly cap
        require(
            weeklySharesUsed[weekId][player] < MAX_SHARES_PER_WEEK,
            "Share: weekly limit"
        );

        lastShareGameId[player] = gameId;
        weeklySharesUsed[weekId][player] += 1;
        playerLastShareTimestamp[player] = block.timestamp;

        // Add 1 topping to PizzaParty (counts toward weekly jackpot)
        pizzaParty.addToppingsFromShareAndSpin(player, 1);

        // Pay ~$0.01 PIZZA from treasury
        // Frontend calculates: claimedReward = floor(0.01 / pizzaUsdPrice * 1e18)
        // Oracle sets shareRewardAmount as backup/ceiling reference
        // Validate: claimedReward must not exceed 2x the oracle-set amount
        uint256 oracleAmount = shareRewardAmount;
        if (claimedReward > 0 && treasuryWallet != address(0)) {
            require(oracleAmount > 0, "Share: reward not set");
            require(claimedReward <= oracleAmount * 2, "Share: reward too high");
            pizzaToken.safeTransferFrom(treasuryWallet, player, claimedReward);
        }

        emit ShareRecorded(player, gameId, weekId, weeklySharesUsed[weekId][player], claimedReward);
    }

    function recordShareSpin(address player, bytes32 castHashBytes32)
        external
        nonReentrant
        whenNotPaused
        returns (uint8 outcome)
    {
        require(msg.sender == backendSigner, "unauthorized");
        require(player != address(0), "0");

        require(
            block.timestamp < playerLastShareTimestamp[player] + 1 days + 1 hours,
            "Spin: share first"
        );

        // Prevent same cast hash from being used twice
        if (castHashBytes32 != bytes32(0)) {
            require(!usedCastHashes[castHashBytes32], "Spin: cast used");
            usedCastHashes[castHashBytes32] = true;
        }

        uint256 currentGameId = pizzaParty.dailyGameId();
        uint256 weekId = pizzaParty.weeklyGameId();

        uint256 rand = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            player,
            shareSpinNonce++
        ))) % SHARE_SPIN_WEIGHT_TOTAL;

        ShareSpinOutcome result;

        if (rand > SHARE_SPIN_FREESLICE_MAX) {
            // 990-999 = Gold (1%)
            if (shareSpinGoldAwardedWeekId == weekId) {
                result = ShareSpinOutcome.FreeSlice;
            } else {
                result = ShareSpinOutcome.Gold;
                shareSpinGoldAwardedWeekId = weekId;
                emit ShareSpinGoldWinner(player, currentGameId, block.timestamp);
            }
        } else if (rand > SHARE_SPIN_NOTHING_MAX) {
            // 940-989 = FreeSlice (5%)
            result = ShareSpinOutcome.FreeSlice;
        } else {
            // 0-939 = Nothing (94%)
            result = ShareSpinOutcome.Nothing;
        }

        outcome = uint8(result);

        if (result == ShareSpinOutcome.FreeSlice || result == ShareSpinOutcome.Gold) {
            hasFreeSlice[player] = true;
            freeSliceGameId[player] = currentGameId;
        }

        emit ShareSpinRecorded(player, currentGameId, weekId, outcome, castHashBytes32);
    }

    function claimFreeSlice(address player, uint256 entryFee) external nonReentrant whenNotPaused {
        require(msg.sender == backendSigner, "unauthorized");
        require(hasFreeSlice[player], "no free slice");
        _requireSliceNotExpired(player);
        _validateEntryFee(entryFee);
        hasFreeSlice[player] = false;
        freeSliceGameId[player] = 0;
        pizzaParty.enterDailyFromShareAndSpin(player, entryFee);
    }

    function saveFreeSlice(address player) external nonReentrant whenNotPaused {
        require(msg.sender == backendSigner, "unauthorized");
        require(hasFreeSlice[player], "no free slice");
        _requireSliceNotExpired(player);
        hasFreeSlice[player] = false;
        pendingFreeSlice[player] = true;
        // freeSliceGameId stays set so pending slice inherits the same expiry
        emit FreeSliceSaved(player, block.timestamp);
    }

    function claimPendingSlice(address player, uint256 entryFee) external nonReentrant whenNotPaused {
        require(msg.sender == backendSigner, "unauthorized");
        require(pendingFreeSlice[player], "No pending slice");
        _requireSliceNotExpired(player);
        _validateEntryFee(entryFee);
        pendingFreeSlice[player] = false;
        freeSliceGameId[player] = 0;
        pizzaParty.enterDailyFromShareAndSpin(player, entryFee);
        emit PendingSliceClaimed(player, pizzaParty.dailyGameId(), entryFee);
    }

    function giftFreeSlice(address player, address recipient, uint256 entryFee) external nonReentrant whenNotPaused {
        require(msg.sender == backendSigner, "unauthorized");
        require(recipient != address(0), "0");
        require(recipient != player, "self");
        require(hasFreeSlice[player], "no free slice");
        _requireSliceNotExpired(player);
        _validateEntryFee(entryFee);
        hasFreeSlice[player] = false;
        freeSliceGameId[player] = 0;
        pizzaParty.enterDailyFromShareAndSpin(recipient, entryFee);
        emit FreeSliceGifted(player, recipient, pizzaParty.dailyGameId(), entryFee);
    }

    // 48-hour window: slice valid for the gameId it was earned, plus the next game.
    // Once dailyGameId advances 2 past the earned gameId, the slice is expired.
    function _requireSliceNotExpired(address player) internal view {
        uint256 earnedAt = freeSliceGameId[player];
        require(earnedAt > 0, "no slice gameId");
        require(pizzaParty.dailyGameId() <= earnedAt + 1, "slice expired");
    }

    function _validateEntryFee(uint256 entryFee) internal view {
        uint256 oneDollarPizza = pizzaParty.holdingsUnitPizza();
        require(oneDollarPizza > 0, "price not set");
        require(entryFee <= oneDollarPizza * 2, "fee too high");
    }

    // ============ View Functions ============

    function getShareInfo(address player) external view returns (
        uint256 sharesUsed,
        bool    canShareNow,
        uint256 nextShareAt
    ) {
        uint256 gameId = pizzaParty.dailyGameId();
        uint256 weekId = pizzaParty.weeklyGameId();
        sharesUsed = weeklySharesUsed[weekId][player];
        nextShareAt = playerLastShareTimestamp[player] + 1 days;
        canShareNow = (
            lastShareGameId[player] != gameId &&
            sharesUsed < MAX_SHARES_PER_WEEK
        );
    }

    // ============ Admin Functions ============

    function adminSetShareRewardAmount(uint256 amount) external onlyOwner {
        shareRewardAmount = amount;
    }

    function adminSetTreasuryWallet(address _treasury) external onlyOwner {
        require(_treasury != address(0), "0");
        treasuryWallet = _treasury;
    }

    function adminSetPizzaParty(address _pizzaParty) external onlyOwner {
        require(_pizzaParty != address(0), "0");
        pizzaParty = IPizzaPartyForShare(_pizzaParty);
    }

    function adminSetBackendSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "0");
        backendSigner = _signer;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
