// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PizzaPartyV2Upgradeable
 * @dev UUPS Upgradeable version of PizzaPartyV2
 * Daily lottery + Weekly jackpot with topping-based tickets using $PIZZA token
 *
 * This is a V2 of PizzaParty that:
 * - Uses $PIZZA token instead of VMF
 * - Adds support for free "slice" entries from PizzaParlorManager
 * - Keeps all public function signatures compatible with the original
 * - Uses UUPS upgradeable pattern
 *
 * Daily Game:
 * - Pay dynamic PIZZA amount ($1 worth at current market price) to enter, earn 1 topping, get 1 entry
 * - Entry fee adjusts based on PIZZA market price (frontend calculates amount for $1)
 * - Min: 0.01 PIZZA, Max: 1000 PIZZA (safety bounds)
 * - 8 winners split the daily pot
 * - First player each day gets 1% bonus from pot
 * - Games without entries either carry over or are skipped
 *
 * Weekly Game:
 * - Claim window: Sunday 12pm PST → Monday 12pm PST (24 hours)
 * - PIZZA balance snapshot taken at claim time (not at window opening)
 * - Players claim toppings once per week during window
 * - 1 topping = 100 PIZZA in jackpot
 * - 10 winners, weighted by claimed toppings
 * - Paid from treasury wallet
 *
 * Toppings earned:
 * - Daily play: 1 topping (max 7/week)
 * - Referrals: 2 toppings per successful referral (max 3/week)
 * - Holdings: 3 toppings per $10 worth of PIZZA held (snapshot at claim time), capped at 30
 * - Slice entries: 1 topping (from parlor owners)
 */
contract PizzaPartyV2Upgradeable is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    // Dynamic entry fee: Always $1 USD, but PIZZA amount varies with price
    // At $0.001/PIZZA, $1 = 1,000 PIZZA
    uint256 public constant MIN_ENTRY_FEE = 0.01e18;     // 0.01 PIZZA minimum
    uint256 public constant MAX_ENTRY_FEE = 1000e18;     // 1000 PIZZA maximum
    uint256 public constant DAILY_WINNERS = 8;
    uint256 public constant WEEKLY_WINNERS = 10;

    // Daily pot split (100% total):
    // - 0%  → FIRST_PLAYER_BONUS_BPS (disabled)
    // - 3%  → CHARITY_TOTAL_BPS (charity distribution)
    // - 97% → PLAYERS_POOL_BPS (distributed equally among winners, minus owner fee)
    // - 3%  → owner fee (default, subtracted from players pool)
    // Effective: 3% charity, 3% owner fee, 94% winners
    uint256 public constant FIRST_PLAYER_BONUS_BPS = 0;   // 0% (disabled)
    uint256 public constant CHARITY_TOTAL_BPS = 300;      // 3%
    uint256 public constant PLAYERS_POOL_BPS = 9700;      // 97% (winners get this minus owner fee)
    uint256 public constant MAX_OWNER_FEE_BPS = 300;      // Maximum 3%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_CHARITIES = 20;
    uint256 public constant MAX_REFERRALS_PER_WEEK = 3;

    // Holdings bonus: 3 toppings per $10 worth of PIZZA (10,000 PIZZA at $0.001)
    // Capped at $100 worth (100,000 PIZZA) = 30 toppings max
    uint256 public constant HOLDINGS_UNIT = 10000e18;     // $10 worth = 10,000 PIZZA
    uint256 public constant HOLDINGS_TOPPINGS = 3;        // 3 toppings per $10
    uint256 public constant HOLDINGS_MAX_TOPPINGS = 30;   // cap at 30 toppings ($100)

    // Weekly jackpot: 1 topping = 100 PIZZA (normalized for $0.001 price)
    uint256 public constant TOPPING_TO_PIZZA = 100e18;    // 1 topping = 100 PIZZA

    // ============ State Variables ============
    // NOTE: Storage layout must remain compatible with future upgrades

    IERC20 public pizzaToken;
    address public treasuryWallet;
    address[] public charityWallets;

    uint256 public ownerFeeBPS; // Default 3%, adjustable up to MAX_OWNER_FEE_BPS

    // Parlor Manager integration
    address public parlorManager;

    uint256 public dailyGameId;
    uint256 public weeklyGameId;
    uint256 public currentDailyPot;

    struct DailyGame {
        uint256 startTime;
        uint256 endTime;
        address firstPlayer;
        address[] players;
        address[] winners;
        uint256 potAmount;
        bool settled;
    }

    struct WeeklyGame {
        uint256 claimWindowStart; // Sunday 12pm PST
        uint256 claimWindowEnd;   // Monday 12pm PST
        uint256 totalClaimedToppings;
        address[] claimers;
        address[] winners;
        uint256 potAmount;
        bool settled;
    }

    struct PlayerWeekly {
        uint256 toppingsEarned;     // Earned but not claimed
        uint256 toppingsClaimed;    // Claimed during window
        uint256 dailyPlays;         // Games played this week (max 7)
        uint256 referralsUsed;      // Referrals used this week (max 3)
        bool hasClaimed;            // Claimed this week
    }

    struct PlayerLifetimeStats {
        uint256 totalDailyWins;
        uint256 totalWeeklyWins;
        uint256 totalPizzaWon;
        uint256 lifetimeToppings;
        uint256 lifetimeReferrals;
    }

    // ============ Mappings ============

    mapping(uint256 => DailyGame) public dailyGames;
    mapping(uint256 => WeeklyGame) public weeklyGames;
    mapping(uint256 => mapping(address => bool)) public hasPlayedDaily;
    mapping(uint256 => mapping(address => PlayerWeekly)) public weeklyPlayers;
    mapping(address => PlayerLifetimeStats) public playerStats;

    // Referral system (lazy registration)
    mapping(address => string) public playerReferralCode;
    mapping(string => address) public codeToPlayer;
    mapping(address => bool) public hasUsedReferral; // Lifetime flag

    // ============ Events ============

    event DailyGameStarted(uint256 indexed gameId, uint256 startTime, uint256 endTime);
    event DailyGameEntered(uint256 indexed gameId, address indexed player, bool isFirst, uint256 amount);
    event DailyGameSettled(uint256 indexed gameId, address[] winners, uint256 pot);
    event WeeklyGameStarted(uint256 indexed gameId, uint256 claimStart, uint256 claimEnd);
    event ToppingsEarned(uint256 indexed weekId, address indexed player, uint256 amount, string reason);
    event ToppingsClaimed(uint256 indexed weekId, address indexed player, uint256 amount);
    event WeeklyGameSettled(uint256 indexed weekId, address[] winners, uint256 pot);
    event ReferralCodeCreated(address indexed player, string code);
    event ReferralUsed(address indexed referrer, address indexed referee);
    event CharityPayout(uint256 indexed gameId, address indexed charity, uint256 amount);
    event CharityWalletsUpdated(address[] oldCharities, address[] newCharities);
    event OwnerFeeUpdated(uint256 oldFeeBPS, uint256 newFeeBPS);
    event OwnerFeePayout(uint256 indexed gameId, address indexed owner, uint256 amount);
    event PlayerStatsMigrated(uint256 playerCount);
    event ParlorManagerUpdated(address indexed oldManager, address indexed newManager);
    event SliceEntryGranted(uint256 indexed gameId, address indexed player, address indexed parlorManager);

    // ============ Modifiers ============

    modifier onlyParlorManager() {
        require(msg.sender == parlorManager, "Not parlor manager");
        _;
    }

    // ============ Initializer (replaces constructor) ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the contract (replaces constructor for upgradeable pattern)
     * @param _pizzaToken Address of the PIZZA token
     * @param _treasury Treasury wallet address
     * @param _charities Array of charity wallet addresses
     * @param _owner Initial owner address
     * @param _startingDailyGameId Starting daily game ID (for migration)
     * @param _startingWeeklyGameId Starting weekly game ID (for migration)
     */
    function initialize(
        address _pizzaToken,
        address _treasury,
        address[] memory _charities,
        address _owner,
        uint256 _startingDailyGameId,
        uint256 _startingWeeklyGameId
    ) external initializer {
        require(_pizzaToken != address(0), "Invalid PIZZA");
        require(_treasury != address(0), "Invalid treasury");
        require(_owner != address(0), "Invalid owner");
        require(_charities.length <= MAX_CHARITIES, "Too many charities");
        require(_startingDailyGameId > 0, "Daily game ID must be > 0");
        require(_startingWeeklyGameId > 0, "Weekly game ID must be > 0");

        // Initialize inherited contracts
        // Note: UUPSUpgradeable and ReentrancyGuard are stateless in OZ v5
        __Ownable_init(_owner);

        // Validate charity addresses and ensure uniqueness
        for (uint256 i = 0; i < _charities.length; i++) {
            require(_charities[i] != address(0), "Invalid charity");
            for (uint256 j = i + 1; j < _charities.length; j++) {
                require(_charities[i] != _charities[j], "Duplicate charity");
            }
        }

        pizzaToken = IERC20(_pizzaToken);
        treasuryWallet = _treasury;
        ownerFeeBPS = 300; // Default 3%

        // If charities not provided, use the default list
        if (_charities.length == 0) {
            charityWallets.push(0x6456879a5073038b0E57ea8E498Cb0240e949fC3); // Patriots Promise
            charityWallets.push(0x700B53ff9a58Ee257F9A2EFda3a373D391028007); // Victory For Veterans
            charityWallets.push(0xB697C8b4bCaE454d9dee1E83f73327D7a63600a1); // Holy Family Village
            charityWallets.push(0x5951A4160F73b8798D68e7177dF8af6a7902e725); // Camp Cowboy
            charityWallets.push(0xfB0EF51792c36Ae1fE6636603be199788819b67D); // Veterans In Need Project
            charityWallets.push(0x10F01632DC709F7fA413A140739D8843b06235A1); // Honor HER Foundation
            charityWallets.push(0x0730d4dc43cf10A3Cd986FEE17f30cB0E75410e0); // Magicians On Mission
            charityWallets.push(0x043820C97771c570d830bB0e189778Fdef5E6EEb); // April Forces
            charityWallets.push(0x097701F99CC7b0Ff816C2355faC104ADdC6e27B9); // Little Patriots Embraced
        } else {
            charityWallets = _charities;
        }

        // Set game IDs to continue from previous deployment
        dailyGameId = _startingDailyGameId;
        weeklyGameId = _startingWeeklyGameId;

        _initializeDailyGame(dailyGameId);
        _initializeWeeklyGame(weeklyGameId);
    }

    // ============ UUPS Upgrade Authorization ============

    /**
     * @dev Required override for UUPS pattern - only owner can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Daily Game ============

    /**
     * @dev Enter daily game with dynamic amount
     * @param amountPaid PIZZA amount to pay (must be within MIN/MAX bounds)
     */
    function enterDailyGame(uint256 amountPaid) external nonReentrant {
        require(amountPaid >= MIN_ENTRY_FEE, "Amount too low");
        require(amountPaid <= MAX_ENTRY_FEE, "Amount too high");
        _enterDaily(msg.sender, amountPaid);
    }

    /**
     * @dev Grant a free daily entry via slice (called by PizzaParlorManager)
     * @param player Address to grant the free entry to
     */
    function enterDailyWithSlice(address player) external nonReentrant onlyParlorManager {
        // This is a free entry – no transferFrom, no pot increase
        _enterDaily(player, 0);
        emit SliceEntryGranted(dailyGameId, player, msg.sender);
    }

    /**
     * @dev Use a referral code (separate from entry)
     * @param code Referral code to use
     */
    function useReferralCode(string memory code) external nonReentrant {
        require(!hasUsedReferral[msg.sender], "Already used referral");
        _processReferral(msg.sender, code);
    }

    function _enterDaily(address player, uint256 amount) internal {
        // Auto-settle weekly game if the claim window has ended
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        if (block.timestamp >= week.claimWindowEnd && !week.settled) {
            _settleWeeklyGame(weeklyGameId);
        }

        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];

        // Auto-settle previous game if needed
        if (block.timestamp >= game.endTime && !game.settled) {
            _settleDailyGame(gameId);
            gameId = dailyGameId;
            game = dailyGames[gameId];
        }

        require(block.timestamp < game.endTime, "Game ended");
        require(!hasPlayedDaily[gameId][player], "Already played");
        require(!game.settled, "Game settled");

        // Check weekly play limit
        PlayerWeekly storage weekly = weeklyPlayers[weeklyGameId][player];
        require(weekly.dailyPlays < 7, "Weekly limit reached");

        // Collect entry fee (if not a free slice entry)
        if (amount > 0) {
            pizzaToken.safeTransferFrom(player, address(this), amount);
            currentDailyPot += amount;
        }

        // Track first player for bonus
        bool isFirst = (game.players.length == 0);
        if (isFirst) {
            game.firstPlayer = player;
        }

        // Update game state
        hasPlayedDaily[gameId][player] = true;
        game.players.push(player);

        // Award 1 topping
        weekly.toppingsEarned += 1;
        weekly.dailyPlays += 1;
        playerStats[player].lifetimeToppings += 1;

        // Auto-register referral code on first entry
        if (bytes(playerReferralCode[player]).length == 0) {
            string memory myCode = _generateCode(player);
            playerReferralCode[player] = myCode;
            codeToPlayer[myCode] = player;
            emit ReferralCodeCreated(player, myCode);
        }

        emit DailyGameEntered(gameId, player, isFirst, amount);
        emit ToppingsEarned(weeklyGameId, player, 1, amount > 0 ? "daily_play" : "slice_entry");
    }

    /**
     * @dev Settle daily game (anyone can call after end time)
     */
    function settleDailyGame() external nonReentrant {
        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];

        require(block.timestamp >= game.endTime, "Game not ended");
        require(!game.settled, "Already settled");

        _settleDailyGame(gameId);
    }

    function _settleDailyGame(uint256 gameId) internal {
        DailyGame storage game = dailyGames[gameId];

        // No players: skip this game, move to next day
        if (game.players.length == 0) {
            game.settled = true;
            dailyGameId++;
            _initializeDailyGame(dailyGameId);
            emit DailyGameSettled(gameId, new address[](0), 0);
            return;
        }

        // Auto-initialize charities on first settlement if not set
        if (charityWallets.length == 0) {
            charityWallets.push(0x6456879a5073038b0E57ea8E498Cb0240e949fC3);
            charityWallets.push(0x700B53ff9a58Ee257F9A2EFda3a373D391028007);
            charityWallets.push(0xB697C8b4bCaE454d9dee1E83f73327D7a63600a1);
            charityWallets.push(0x5951A4160F73b8798D68e7177dF8af6a7902e725);
            charityWallets.push(0xfB0EF51792c36Ae1fE6636603be199788819b67D);
            charityWallets.push(0x10F01632DC709F7fA413A140739D8843b06235A1);
            charityWallets.push(0x0730d4dc43cf10A3Cd986FEE17f30cB0E75410e0);
            charityWallets.push(0x043820C97771c570d830bB0e189778Fdef5E6EEb);
            charityWallets.push(0x097701F99CC7b0Ff816C2355faC104ADdC6e27B9);
        }

        uint256 pot = currentDailyPot;
        uint256 winnerCount = game.players.length < DAILY_WINNERS ? game.players.length : DAILY_WINNERS;

        // Calculate allocations
        uint256 firstPlayerBonus = (pot * FIRST_PLAYER_BONUS_BPS) / BPS_DENOMINATOR;
        uint256 charityTotal = (pot * CHARITY_TOTAL_BPS) / BPS_DENOMINATOR;
        uint256 ownerFee = (pot * ownerFeeBPS) / BPS_DENOMINATOR;
        uint256 playersPool = (pot * PLAYERS_POOL_BPS) / BPS_DENOMINATOR - ownerFee;

        uint256 totalAllocated = firstPlayerBonus + charityTotal + ownerFee + playersPool;
        uint256 dust = pot > totalAllocated ? pot - totalAllocated : 0;

        // Select winners randomly
        address[] memory winners = _selectRandomWinners(game.players, winnerCount, gameId);

        // 1. Pay first player bonus
        if (firstPlayerBonus > 0 && game.firstPlayer != address(0)) {
            pizzaToken.safeTransfer(game.firstPlayer, firstPlayerBonus);
        }

        // 2. Pay owner fee (if set) - goes to owner() which will be PizzaParlorManager
        if (ownerFee > 0) {
            pizzaToken.safeTransfer(owner(), ownerFee);
            emit OwnerFeePayout(gameId, owner(), ownerFee);
        }

        // 3. Pay charities equally (first charity gets remainder)
        if (charityTotal > 0 && charityWallets.length > 0) {
            uint256 charityShare = charityTotal / charityWallets.length;
            uint256 charityRemainder = charityTotal - (charityShare * charityWallets.length);
            for (uint256 i = 0; i < charityWallets.length; i++) {
                uint256 payment = charityShare;
                if (i == 0) payment += charityRemainder;
                if (payment > 0) {
                    pizzaToken.safeTransfer(charityWallets[i], payment);
                    emit CharityPayout(gameId, charityWallets[i], payment);
                }
            }
        }

        // 4. Pay winners from players pool (first winner gets remainder)
        uint256 winnerShare = playersPool / winnerCount;
        uint256 playersRemainder = playersPool - (winnerShare * winnerCount);
        uint256[] memory winnerPayouts = new uint256[](winnerCount);

        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 payout = winnerShare;
            if (i == 0) payout += playersRemainder;
            if (payout > 0) {
                pizzaToken.safeTransfer(winners[i], payout);
                winnerPayouts[i] = payout;
            }
        }

        // 5. Send any remaining dust to first winner
        if (dust > 0 && winnerCount > 0) {
            pizzaToken.safeTransfer(winners[0], dust);
            winnerPayouts[0] += dust;
        }

        game.winners = winners;
        game.potAmount = pot;
        game.settled = true;

        for (uint256 i = 0; i < winnerCount; i++) {
            PlayerLifetimeStats storage stats = playerStats[winners[i]];
            stats.totalDailyWins += 1;
            stats.totalPizzaWon += winnerPayouts[i];
        }

        emit DailyGameSettled(gameId, winners, pot);

        // Reset and create next game
        currentDailyPot = 0;
        dailyGameId++;
        _initializeDailyGame(dailyGameId);
    }

    // ============ Weekly Game ============

    /**
     * @dev Claim toppings during claim window (once per week)
     * Automatically adds holdings bonus based on PIZZA balance snapshot
     */
    function claimToppings() external nonReentrant {
        uint256 weekId = weeklyGameId;
        WeeklyGame storage week = weeklyGames[weekId];
        PlayerWeekly storage player = weeklyPlayers[weekId][msg.sender];

        require(block.timestamp >= week.claimWindowStart, "Window not open");
        require(block.timestamp < week.claimWindowEnd, "Window closed");
        require(!player.hasClaimed, "Already claimed");
        require(player.toppingsEarned > 0, "No toppings");

        // Add holdings bonus (snapshot at claim time)
        uint256 holdingsBonus = _calculateHoldingsBonus(msg.sender);
        if (holdingsBonus > 0) {
            player.toppingsEarned += holdingsBonus;
            emit ToppingsEarned(weekId, msg.sender, holdingsBonus, "holdings_bonus");
        }

        // Claim all earned toppings
        uint256 claimed = player.toppingsEarned;
        player.toppingsClaimed = claimed;
        player.hasClaimed = true;

        week.totalClaimedToppings += claimed;
        week.claimers.push(msg.sender);

        emit ToppingsClaimed(weekId, msg.sender, claimed);
    }

    /**
     * @dev Calculate holdings bonus: 3 toppings per $10 worth of PIZZA (10,000 PIZZA)
     * Capped at 30 toppings ($100 worth = 100,000 PIZZA)
     */
    function _calculateHoldingsBonus(address player) internal view returns (uint256) {
        uint256 balance = pizzaToken.balanceOf(player);
        if (balance < HOLDINGS_UNIT) return 0;

        uint256 units = balance / HOLDINGS_UNIT;
        uint256 toppings = units * HOLDINGS_TOPPINGS;

        // Cap at HOLDINGS_MAX_TOPPINGS (30)
        if (toppings > HOLDINGS_MAX_TOPPINGS) {
            toppings = HOLDINGS_MAX_TOPPINGS;
        }

        return toppings;
    }

    /**
     * @dev Settle weekly game (owner or after claim window)
     */
    function settleWeeklyGame() external nonReentrant {
        uint256 weekId = weeklyGameId;
        WeeklyGame storage week = weeklyGames[weekId];

        require(block.timestamp >= week.claimWindowEnd, "Window not closed");
        require(!week.settled, "Already settled");

        _settleWeeklyGame(weekId);
    }

    function _settleWeeklyGame(uint256 weekId) internal {
        WeeklyGame storage week = weeklyGames[weekId];

        // No claimers: no jackpot
        if (week.claimers.length == 0 || week.totalClaimedToppings == 0) {
            week.settled = true;
            weeklyGameId++;
            _initializeWeeklyGame(weeklyGameId);
            emit WeeklyGameSettled(weekId, new address[](0), 0);
            return;
        }

        // Jackpot = total claimed toppings × 100 PIZZA
        uint256 jackpot = week.totalClaimedToppings * TOPPING_TO_PIZZA;

        // Pull from treasury
        pizzaToken.safeTransferFrom(treasuryWallet, address(this), jackpot);

        // Select winners weighted by claimed toppings
        uint256 requestedWinners = week.claimers.length < WEEKLY_WINNERS ? week.claimers.length : WEEKLY_WINNERS;
        address[] memory winners = _selectWeightedWinners(week.claimers, weekId, requestedWinners);

        uint256 actualWinnerCount = winners.length;

        // Edge case: no winners selected
        if (actualWinnerCount == 0) {
            week.settled = true;
            weeklyGameId++;
            _initializeWeeklyGame(weeklyGameId);
            emit WeeklyGameSettled(weekId, new address[](0), 0);
            return;
        }

        // Pay winners equally
        uint256 payoutEach = jackpot / actualWinnerCount;
        uint256 remainder = jackpot - (payoutEach * actualWinnerCount);

        uint256[] memory winnerPayouts = new uint256[](actualWinnerCount);
        for (uint256 i = 0; i < actualWinnerCount; i++) {
            uint256 payout = payoutEach;
            if (i == 0 && remainder > 0) {
                payout += remainder;
            }
            pizzaToken.safeTransfer(winners[i], payout);
            winnerPayouts[i] = payout;
        }

        week.winners = winners;
        week.potAmount = jackpot;
        week.settled = true;

        for (uint256 i = 0; i < actualWinnerCount; i++) {
            PlayerLifetimeStats storage stats = playerStats[winners[i]];
            stats.totalWeeklyWins += 1;
            stats.totalPizzaWon += winnerPayouts[i];
        }

        emit WeeklyGameSettled(weekId, winners, jackpot);

        // Start next week
        weeklyGameId++;
        _initializeWeeklyGame(weeklyGameId);
    }

    // ============ Referral System ============

    /**
     * @dev Get referral code for a player (view function)
     */
    function getReferralCode(address player) external view returns (string memory) {
        return _generateCode(player);
    }

    /**
     * @dev Get player address from a referral code (if registered)
     */
    function getPlayerFromCode(string memory code) external view returns (address) {
        return codeToPlayer[code];
    }

    function createReferralCode() external {
        require(bytes(playerReferralCode[msg.sender]).length == 0, "Code exists");

        string memory code = _generateCode(msg.sender);
        require(codeToPlayer[code] == address(0), "Code collision");

        playerReferralCode[msg.sender] = code;
        codeToPlayer[code] = msg.sender;

        emit ReferralCodeCreated(msg.sender, code);
    }

    function _generateCode(address player) internal view returns (string memory) {
        bytes32 h = keccak256(abi.encodePacked(player, address(this)));
        bytes memory alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        bytes memory out = new bytes(8);

        for (uint256 i = 0; i < 4; i++) {
            uint8 highNibble = uint8(h[i]) >> 4;
            uint8 lowNibble = uint8(h[i]) & 0x0F;
            out[i*2] = alphabet[highNibble % 34];
            out[i*2 + 1] = alphabet[lowNibble % 34];
        }

        return string(abi.encodePacked("PZ", out));
    }

    function _getReferrerFromCode(string memory code) internal view returns (address) {
        require(bytes(code).length == 10, "Invalid code length");
        require(bytes(code)[0] == 'P' && bytes(code)[1] == 'Z', "Invalid code prefix");

        address registered = codeToPlayer[code];
        require(registered != address(0), "Code not found");
        require(playerStats[registered].lifetimeToppings > 0, "Referrer must play first");

        return registered;
    }

    function _processReferral(address referee, string memory code) internal {
        require(!hasUsedReferral[referee], "Already used referral");

        address referrer = _getReferrerFromCode(code);
        require(referrer != referee, "Cannot refer self");

        uint256 weekId = weeklyGameId;
        PlayerWeekly storage referrerWeekly = weeklyPlayers[weekId][referrer];

        require(referrerWeekly.referralsUsed < MAX_REFERRALS_PER_WEEK, "Referral limit");

        hasUsedReferral[referee] = true;
        referrerWeekly.referralsUsed++;
        referrerWeekly.toppingsEarned += 2;
        playerStats[referrer].lifetimeReferrals += 1;

        emit ReferralUsed(referrer, referee);
        emit ToppingsEarned(weekId, referrer, 2, "referral");
    }

    // ============ Random Selection ============

    function _selectRandomWinners(
        address[] memory candidates,
        uint256 count,
        uint256 seed
    ) internal view returns (address[] memory) {
        uint256 n = candidates.length;
        address[] memory winners = new address[](count);
        bool[] memory selected = new bool[](n);

        uint256 randSeed = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            seed,
            currentDailyPot
        )));

        uint256 picked = 0;
        uint256 attempts = 0;
        uint256 maxAttempts = count * 10;

        while (picked < count && attempts < maxAttempts) {
            randSeed = uint256(keccak256(abi.encodePacked(randSeed, attempts)));
            uint256 idx = randSeed % n;

            if (!selected[idx]) {
                selected[idx] = true;
                winners[picked] = candidates[idx];
                picked++;
            }

            attempts++;
        }

        return winners;
    }

    function _selectWeightedWinners(
        address[] memory participants,
        uint256 weekId,
        uint256 count
    ) internal view returns (address[] memory) {
        uint256 n = participants.length;
        address[] memory winners = new address[](count);
        bool[] memory selected = new bool[](n);

        uint256[] memory prefixSums = new uint256[](n);
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < n; i++) {
            uint256 weight = weeklyPlayers[weekId][participants[i]].toppingsClaimed;
            totalWeight += weight;
            prefixSums[i] = totalWeight;
        }

        require(totalWeight > 0, "No weight");

        bytes32 randSeed = keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            weekId,
            totalWeight
        ));

        uint256 picked = 0;
        uint256 attempts = 0;
        uint256 maxAttempts = count * 10;

        while (picked < count && attempts < maxAttempts) {
            uint256 draw = uint256(keccak256(abi.encodePacked(randSeed, attempts))) % totalWeight;

            uint256 lo = 0;
            uint256 hi = n;
            while (lo < hi) {
                uint256 mid = (lo + hi) / 2;
                if (draw < prefixSums[mid]) {
                    hi = mid;
                } else {
                    lo = mid + 1;
                }
            }

            uint256 idx = lo < n ? lo : n - 1;

            if (!selected[idx]) {
                selected[idx] = true;
                winners[picked] = participants[idx];
                picked++;
            }

            attempts++;
        }

        if (picked < count) {
            address[] memory resized = new address[](picked);
            for (uint256 i = 0; i < picked; i++) {
                resized[i] = winners[i];
            }
            return resized;
        }

        return winners;
    }

    // ============ Time Helpers ============

    function _initializeDailyGame(uint256 gameId) internal {
        uint256 endTime = _nextNoonPT(block.timestamp);
        uint256 startTime = endTime - 1 days;

        dailyGames[gameId].startTime = startTime;
        dailyGames[gameId].endTime = endTime;

        emit DailyGameStarted(gameId, startTime, endTime);
    }

    function _initializeWeeklyGame(uint256 gameId) internal {
        uint256 claimStart = _nextSundayNoonPT(block.timestamp);
        uint256 claimEnd = claimStart + 24 hours;

        weeklyGames[gameId].claimWindowStart = claimStart;
        weeklyGames[gameId].claimWindowEnd = claimEnd;

        emit WeeklyGameStarted(gameId, claimStart, claimEnd);
    }

    function _nextNoonPT(uint256 timestamp) internal pure returns (uint256) {
        uint256 PT_OFFSET = 8 hours;
        uint256 dayStart = (timestamp / 1 days) * 1 days;
        uint256 noonPT = dayStart + (12 hours + PT_OFFSET);

        if (timestamp >= noonPT) {
            return noonPT + 1 days;
        }
        return noonPT;
    }

    function _nextSundayNoonPT(uint256 timestamp) internal pure returns (uint256) {
        uint256 THURSDAY_EPOCH = 4 days;
        uint256 daysSinceEpoch = (timestamp + THURSDAY_EPOCH) / 1 days;
        uint256 dayOfWeek = daysSinceEpoch % 7;
        uint256 daysUntilSunday = (7 - dayOfWeek) % 7;

        if (daysUntilSunday == 0) {
            uint256 sundayNoon = (timestamp / 1 days) * 1 days + 20 hours;
            if (timestamp >= sundayNoon) {
                daysUntilSunday = 7;
            }
        }

        uint256 nextSundayMidnight = ((timestamp / 1 days) + daysUntilSunday) * 1 days;
        return nextSundayMidnight + 20 hours;
    }

    // ============ View Functions ============

    function getCurrentDailyGame() external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 playerCount,
        uint256 pot,
        bool settled
    ) {
        DailyGame storage game = dailyGames[dailyGameId];
        return (
            game.startTime,
            game.endTime,
            game.players.length,
            currentDailyPot,
            game.settled
        );
    }

    function getCurrentWeeklyGame() external view returns (
        uint256 claimStart,
        uint256 claimEnd,
        uint256 totalToppings,
        uint256 claimerCount,
        uint256 projectedJackpot,
        bool settled
    ) {
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        uint256 jackpot = week.totalClaimedToppings * TOPPING_TO_PIZZA;

        return (
            week.claimWindowStart,
            week.claimWindowEnd,
            week.totalClaimedToppings,
            week.claimers.length,
            jackpot,
            week.settled
        );
    }

    function getPlayerWeeklyInfo(address player) external view returns (
        uint256 toppingsEarned,
        uint256 toppingsClaimed,
        uint256 dailyPlays,
        uint256 referralsUsed,
        bool hasClaimed,
        uint256 projectedHoldingsBonus
    ) {
        PlayerWeekly storage p = weeklyPlayers[weeklyGameId][player];
        uint256 bonus = _calculateHoldingsBonus(player);

        return (
            p.toppingsEarned,
            p.toppingsClaimed,
            p.dailyPlays,
            p.referralsUsed,
            p.hasClaimed,
            bonus
        );
    }

    function getPlayerLifetimeStats(address player) external view returns (
        uint256 totalDailyWins,
        uint256 totalWeeklyWins,
        uint256 totalPizzaWon,
        uint256 lifetimeToppings,
        uint256 lifetimeReferrals
    ) {
        PlayerLifetimeStats storage stats = playerStats[player];
        return (
            stats.totalDailyWins,
            stats.totalWeeklyWins,
            stats.totalPizzaWon,
            stats.lifetimeToppings,
            stats.lifetimeReferrals
        );
    }

    function hasPlayedDailyGame(address player) external view returns (bool) {
        return hasPlayedDaily[dailyGameId][player];
    }

    function isDailyGameReady() external view returns (bool) {
        DailyGame storage game = dailyGames[dailyGameId];
        return block.timestamp >= game.endTime && !game.settled;
    }

    function isClaimWindowOpen() external view returns (bool) {
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        return block.timestamp >= week.claimWindowStart && block.timestamp < week.claimWindowEnd;
    }

    function isWeeklyGameReady() external view returns (bool) {
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        return block.timestamp >= week.claimWindowEnd && !week.settled;
    }

    function getDailyGamePlayers(uint256 gameId) external view returns (address[] memory) {
        return dailyGames[gameId].players;
    }

    function getDailyGameWinners(uint256 gameId) external view returns (address[] memory) {
        return dailyGames[gameId].winners;
    }

    function getWeeklyGameClaimers(uint256 weekId) external view returns (address[] memory) {
        return weeklyGames[weekId].claimers;
    }

    function getWeeklyGameWinners(uint256 weekId) external view returns (address[] memory) {
        return weeklyGames[weekId].winners;
    }

    // ============ Admin Functions ============

    /**
     * @dev Set the parlor manager address (only owner)
     * @param _pm Address of the PizzaParlorManager contract
     */
    function setParlorManager(address _pm) external onlyOwner {
        require(_pm != address(0), "Invalid parlor manager");
        address oldManager = parlorManager;
        parlorManager = _pm;
        emit ParlorManagerUpdated(oldManager, _pm);
    }

    /**
     * @dev Migrate player stats from old contract
     */
    function migratePlayerStats(
        address[] calldata players,
        PlayerLifetimeStats[] calldata stats,
        string[] calldata referralCodes
    ) external onlyOwner {
        require(players.length == stats.length, "Stats length mismatch");
        require(players.length == referralCodes.length, "Codes length mismatch");
        require(players.length > 0, "Empty array");

        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            require(player != address(0), "Invalid player address");

            playerStats[player] = stats[i];

            if (bytes(referralCodes[i]).length > 0) {
                string memory code = referralCodes[i];
                if (codeToPlayer[code] == address(0)) {
                    playerReferralCode[player] = code;
                    codeToPlayer[code] = player;
                }
            }
        }

        emit PlayerStatsMigrated(players.length);
    }

    function setTreasuryWallet(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasuryWallet = _treasury;
    }

    function setOwnerFee(uint256 _bps) external onlyOwner {
        require(_bps <= MAX_OWNER_FEE_BPS, "Fee exceeds maximum");
        uint256 oldFee = ownerFeeBPS;
        ownerFeeBPS = _bps;
        emit OwnerFeeUpdated(oldFee, _bps);
    }

    function setCharityWallets(address[] memory _charities) external onlyOwner {
        require(_charities.length <= MAX_CHARITIES, "Too many charities");

        for (uint256 i = 0; i < _charities.length; i++) {
            require(_charities[i] != address(0), "Invalid charity address");
            for (uint256 j = i + 1; j < _charities.length; j++) {
                require(_charities[i] != _charities[j], "Duplicate charity");
            }
        }

        address[] memory oldCharities = new address[](charityWallets.length);
        for (uint256 i = 0; i < charityWallets.length; i++) {
            oldCharities[i] = charityWallets[i];
        }

        charityWallets = _charities;
        emit CharityWalletsUpdated(oldCharities, _charities);
    }

    function addCharityWallet(address _charity) external onlyOwner {
        require(_charity != address(0), "Invalid charity");
        require(charityWallets.length < MAX_CHARITIES, "Max charities reached");

        for (uint256 i = 0; i < charityWallets.length; i++) {
            require(charityWallets[i] != _charity, "Charity already exists");
        }

        address[] memory oldCharities = new address[](charityWallets.length);
        for (uint256 i = 0; i < charityWallets.length; i++) {
            oldCharities[i] = charityWallets[i];
        }

        charityWallets.push(_charity);
        emit CharityWalletsUpdated(oldCharities, charityWallets);
    }

    function removeCharityWallet(uint256 index) external onlyOwner {
        require(index < charityWallets.length, "Invalid index");

        address[] memory oldCharities = new address[](charityWallets.length);
        for (uint256 i = 0; i < charityWallets.length; i++) {
            oldCharities[i] = charityWallets[i];
        }

        charityWallets[index] = charityWallets[charityWallets.length - 1];
        charityWallets.pop();
        emit CharityWalletsUpdated(oldCharities, charityWallets);
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = pizzaToken.balanceOf(address(this));
        pizzaToken.safeTransfer(owner(), balance);
    }

    function emergencySettleDaily() external onlyOwner {
        uint256 gameId = dailyGameId;
        require(!dailyGames[gameId].settled, "Already settled");
        _settleDailyGame(gameId);
    }

    function emergencySettleWeekly() external onlyOwner {
        uint256 weekId = weeklyGameId;
        require(!weeklyGames[weekId].settled, "Already settled");
        _settleWeeklyGame(weekId);
    }
}
