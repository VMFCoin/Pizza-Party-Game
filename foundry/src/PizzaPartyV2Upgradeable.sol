// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";


/**
 * @title PizzaPartyV2Upgradeable
 * @dev Daily lottery + Weekly jackpot with topping-based tickets (UUPS Upgradeable)
 *
 * Daily Game:
 * - Pay dynamic PIZZA amount ($1 worth at current market price) to enter, earn 1 topping, get 1 entry
 * - Entry fee adjusts based on PIZZA market price (frontend calculates amount for $1)
 * - 8 winners split the daily pot (94% to winners, 3% charity, 3% owner fee)
 * - Games without entries are skipped
 *
 * Weekly Game:
 * - Claim window: Sunday 12pm PT → Monday 12pm PT (24 hours)
 * - PIZZA balance snapshot taken at claim time
 * - Players claim toppings once per week during window
 * - 1 topping = 100 PIZZA in jackpot
 * - 10 winners, weighted by claimed toppings
 * - Paid from treasury wallet
 *
 * Toppings earned:
 * - Daily play: 1 topping (max 7/week)
 * - Referrals: 2 toppings per successful referral (max 3/week)
 * - Holdings: 3 toppings per $10 worth of PIZZA held (max 30 toppings)
 *
 * Parlor System:
 * - Parlor owners can tip slices (free entries) to new players
 * - If new player wins, sponsor gets 50% split (daily: same day, weekly: first claim week only)
 * - Dust and remainder also split 50/50 with sponsor
 */
contract PizzaPartyV2Upgradeable is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    // ✅ Dynamic entry fee: Always $1 USD, but PIZZA amount varies with price
    // At $0.001/PIZZA: need 1000 PIZZA for $1 entry
    // Safety bounds prevent extreme prices
    uint256 public constant MIN_ENTRY_FEE = 1e16;     // 0.01 PIZZA minimum
    uint256 public constant MAX_ENTRY_FEE = 1000e18;  // 1000 PIZZA maximum
    uint256 public constant DAILY_WINNERS = 8;
    uint256 public constant WEEKLY_WINNERS = 10;

    // Daily pot split (100% total):
    // - 94% → PLAYERS_POOL_BPS (distributed equally among winners)
    // - 3%  → CHARITY_TOTAL_BPS (charity distribution)
    // - 3%  → Owner fee (flows to PizzaParlorManager)
    // NOTE: All percentages are expressed in basis points (BPS), where 10000 = 100%.
    uint256 public constant FIRST_PLAYER_BONUS_BPS = 0;   // No first player bonus
    uint256 public constant CHARITY_TOTAL_BPS = 300;      // 3% = 300 basis points
    uint256 public constant PLAYERS_POOL_BPS = 9400;      // 94% = 9400 basis points
    uint256 public constant MAX_OWNER_FEE_BPS = 300;      // Maximum 3% owner fee
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_CHARITIES = 20;
    uint256 public constant MAX_REFERRALS_PER_WEEK = 3;

    // Holdings bonus constants (toppings per unit)
    uint256 public constant HOLDINGS_TOPPINGS = 3;        // 3 toppings per $10 unit
    uint256 public constant HOLDINGS_MAX_TOPPINGS = 30;   // cap at $100 worth (30 toppings)

    // Weekly jackpot: 1 topping = 100 PIZZA (at $0.001/PIZZA = $0.10 per topping)
    uint256 public constant TOPPING_TO_PIZZA = 100e18;    // 1 topping = 100 PIZZA

    // ============ State Variables ============

    IERC20 public pizzaToken;
    address public treasuryWallet;
    address[] public charityWallets;

    uint256 public ownerFeeBPS; // Default 3%, flows to PizzaParlorManager

    uint256 public dailyGameId;
    uint256 public weeklyGameId;
    uint256 public currentDailyPot;

    // Holdings unit: how many PIZZA tokens equal $10 (set by owner based on market price)
    // Default: 10,000 PIZZA at $0.001/PIZZA = $10
    uint256 public holdingsUnitPizza;

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

    // USD value per winner (in cents) for leaderboard display
    mapping(uint256 => uint256) public dailyGameUsdValue;  // gameId => USD cents per winner
    mapping(uint256 => uint256) public weeklyGameUsdValue; // gameId => USD cents per winner

    // ============ Slice Sponsor Tracking ============

    // Parlor manager address (authorized to call enterDailyWithSlice)
    address public parlorManager;

    // Daily sponsor tracking: only applies for the specific day/gameId
    mapping(uint256 => mapping(address => address)) public dailySliceSponsor; // gameId => player => sponsor

    // First-week sponsor tracking: only applies for the first claim week
    mapping(address => address) public firstSliceSponsor;   // player => sponsor (set once if brand-new and sliced)
    mapping(address => uint256) public firstClaimWeekId;    // player => first weekId they ever claimed toppings (set once)

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
    event SliceEntryGranted(uint256 indexed gameId, address indexed player, address indexed parlorManager);
    event SliceSponsored(uint256 indexed gameId, address indexed player, address indexed sponsor);
    event SponsoredDailyPayout(uint256 indexed gameId, address indexed player, address indexed sponsor, uint256 playerAmount, uint256 sponsorAmount);
    event SponsoredWeeklyPayout(uint256 indexed weekId, address indexed player, address indexed sponsor, uint256 playerAmount, uint256 sponsorAmount);
    event ParlorManagerUpdated(address oldManager, address newManager);
    event HoldingsUnitPizzaUpdated(uint256 oldUnit, uint256 newUnit);

    // ============ Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _pizzaToken,
        address _treasury,
        address[] memory _charities,
        address _owner
    ) public initializer {
        require(_pizzaToken != address(0), "Invalid PIZZA token");
        require(_treasury != address(0), "Invalid treasury");
        require(_owner != address(0), "Invalid owner");
        require(_charities.length <= MAX_CHARITIES, "Too many charities");

        // Validate charity addresses and ensure uniqueness
        for (uint256 i = 0; i < _charities.length; i++) {
            require(_charities[i] != address(0), "Invalid charity");
            for (uint256 j = i + 1; j < _charities.length; j++) {
                require(_charities[i] != _charities[j], "Duplicate charity");
            }
        }

        __Ownable_init(_owner);
        // Note: UUPSUpgradeable in OZ v5 is stateless (no init needed)

        pizzaToken = IERC20(_pizzaToken);
        treasuryWallet = _treasury;
        charityWallets = _charities;
        ownerFeeBPS = 300; // Default 3%
        dailyGameId = 1;
        weeklyGameId = 1;

        // Default holdings unit: 10,000 PIZZA = $10 at $0.001/PIZZA
        holdingsUnitPizza = 10_000e18;

        _initializeDailyGame(dailyGameId);
        _initializeWeeklyGame(weeklyGameId);
    }

    // ============ UUPS Upgrade Authorization ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Modifiers ============

    modifier onlyParlorManager() {
        require(msg.sender == parlorManager, "Not parlor manager");
        _;
    }

    // ============ Internal Helpers ============

    /**
     * @dev Check if a player is brand-new (has never played before)
     * Uses lifetimeToppings as proxy since any entry earns at least 1 topping
     */
    function _isNewPlayer(address player) internal view returns (bool) {
        return playerStats[player].lifetimeToppings == 0;
    }

    // ============ Daily Game ============

    /**
     * @dev Enter daily game with dynamic amount
     * @param amountPaid PIZZA amount to pay (must be within MIN/MAX bounds)
     */
    function enterDailyGame(uint256 amountPaid) external nonReentrant {
        // Entry fee is always $1 USD, but PIZZA amount varies with PIZZA price
        // Minimum: 0.01 PIZZA (when PIZZA = $100 per token, entry = 0.01 PIZZA = $1)
        // Maximum: 1000 PIZZA (when PIZZA = $0.001 per token, entry = 1000 PIZZA = $1)
        require(amountPaid >= MIN_ENTRY_FEE, "Amount too low");   // Must be >= 0.01 PIZZA
        require(amountPaid <= MAX_ENTRY_FEE, "Amount too high"); // Must be <= 1000 PIZZA
        _enterDaily(msg.sender, amountPaid);
    }

    /**
     * @dev Enter daily game with permit (single transaction - no prior approval needed)
     * Uses EIP-2612 permit to approve and enter in one transaction
     * @param amountPaid PIZZA amount to pay (must be within MIN/MAX bounds)
     * @param deadline Timestamp after which the permit is no longer valid
     * @param v Recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     */
    function enterDailyGameWithPermit(
        uint256 amountPaid,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        require(amountPaid >= MIN_ENTRY_FEE, "Amount too low");
        require(amountPaid <= MAX_ENTRY_FEE, "Amount too high");

        // Use try/catch for permit as recommended by OpenZeppelin
        // This handles cases where:
        // 1. User already has sufficient allowance (permit would fail)
        // 2. Permit was frontrun (someone else submitted it first)
        // 3. Smart contract wallets that can't sign permits
        try IERC20Permit(address(pizzaToken)).permit(
            msg.sender,
            address(this),
            amountPaid,
            deadline,
            v,
            r,
            s
        ) {} catch {}

        _enterDaily(msg.sender, amountPaid);
    }

    /**
     * @dev Use a referral code (separate from entry)
     * @param code Referral code to use
     */
    function useReferralCode(string memory code) external nonReentrant {
        require(!hasUsedReferral[msg.sender], "Already used referral");
        _processReferral(msg.sender, code);
    }

    /**
     * @dev Enter daily game with a slice (free entry) - called by PizzaParlorManager
     * @param player The player receiving the free entry
     * @param sponsor The parlor owner who is sponsoring this slice
     */
    function enterDailyWithSlice(address player, address sponsor) external nonReentrant onlyParlorManager {
        require(player != address(0) && sponsor != address(0), "Invalid addr");
        require(player != sponsor, "No self slice");

        // Anti-abuse guard: ONLY record sponsor if player is brand-new
        if (_isNewPlayer(player)) {
            // Record daily sponsor for THIS gameId
            dailySliceSponsor[dailyGameId][player] = sponsor;

            // Record first sponsor once (used later for first weekly claim split)
            if (firstSliceSponsor[player] == address(0)) {
                firstSliceSponsor[player] = sponsor;
            }

            emit SliceSponsored(dailyGameId, player, sponsor);
        }

        // Free entry – no transferFrom, no pot increase
        _enterDaily(player, 0);

        emit SliceEntryGranted(dailyGameId, player, msg.sender);
    }

    function _enterDaily(address player, uint256 amount) internal {
        // Auto-settle weekly game if the claim window has ended (pass 0 for usdCents - should be set via explicit settleWeeklyGame call)
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        if (block.timestamp >= week.claimWindowEnd && !week.settled) {
            _settleWeeklyGame(weeklyGameId, 0);
        }

        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];

        // Auto-settle previous game if needed (pass 0 for usdCents - should be set via explicit settleDailyGame call)
        if (block.timestamp >= game.endTime && !game.settled) {
            _settleDailyGame(gameId, 0);
            gameId = dailyGameId;
            game = dailyGames[gameId];
        }

        require(block.timestamp < game.endTime, "Game ended");
        require(!hasPlayedDaily[gameId][player], "Already played");
        require(!game.settled, "Game settled");

        // Check weekly play limit
        PlayerWeekly storage weekly = weeklyPlayers[weeklyGameId][player];
        require(weekly.dailyPlays < 7, "Weekly limit reached");

        // ✅ Collect dynamic entry fee (skip for free slice entries where amount = 0)
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
        emit ToppingsEarned(weeklyGameId, player, 1, "daily_play");
    }

    /**
     * @dev Settle daily game (anyone can call after end time)
     * @param usdCentsPerWinner USD value per winner in cents (e.g., 324 = $3.24). Pass 0 to skip storing.
     */
    function settleDailyGame(uint256 usdCentsPerWinner) external nonReentrant {
        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];

        require(block.timestamp >= game.endTime, "Game not ended");
        require(!game.settled, "Already settled");

        _settleDailyGame(gameId, usdCentsPerWinner);
    }

    function _settleDailyGame(uint256 gameId, uint256 usdCentsPerWinner) internal {
        DailyGame storage game = dailyGames[gameId];

        // No players: skip this game, move to next day
        if (game.players.length == 0) {
            game.settled = true;
            dailyGameId++;
            _initializeDailyGame(dailyGameId);
            emit DailyGameSettled(gameId, new address[](0), 0);
            return;
        }

        // Store USD value per winner if provided (locked at settlement time)
        if (usdCentsPerWinner > 0) {
            dailyGameUsdValue[gameId] = usdCentsPerWinner;
        }

        // Auto-initialize charities on first settlement if not set
        if (charityWallets.length == 0) {
            charityWallets.push(0x6456879a5073038b0E57ea8E498Cb0240e949fC3); // Patriots Promise
            charityWallets.push(0x700B53ff9a58Ee257F9A2EFda3a373D391028007); // Victory For Veterans
            charityWallets.push(0xB697C8b4bCaE454d9dee1E83f73327D7a63600a1); // Holy Family Village
            charityWallets.push(0x5951A4160F73b8798D68e7177dF8af6a7902e725); // Camp Cowboy
            charityWallets.push(0xfB0EF51792c36Ae1fE6636603be199788819b67D); // Veterans In Need Project
            charityWallets.push(0x10F01632DC709F7fA413A140739D8843b06235A1); // Honor HER Foundation
            charityWallets.push(0x0730d4dc43cf10A3Cd986FEE17f30cB0E75410e0); // Magicians On Mission
            charityWallets.push(0x043820C97771c570d830bB0e189778Fdef5E6EEb); // April Forces
            charityWallets.push(0x097701F99CC7b0Ff816C2355faC104ADdC6e27B9); // Little Patriots Embraced
        }

        uint256 pot = currentDailyPot;
        uint256 winnerCount = game.players.length < DAILY_WINNERS ? game.players.length : DAILY_WINNERS;

        // Calculate allocations (94% winners, 3% charity, 3% owner fee)
        uint256 charityTotal = (pot * CHARITY_TOTAL_BPS) / BPS_DENOMINATOR;
        uint256 ownerFee = (pot * ownerFeeBPS) / BPS_DENOMINATOR;
        uint256 playersPool = (pot * PLAYERS_POOL_BPS) / BPS_DENOMINATOR;

        uint256 totalAllocated = charityTotal + ownerFee + playersPool;
        uint256 dust = pot > totalAllocated ? pot - totalAllocated : 0;

        // Select winners randomly
        address[] memory winners = _selectRandomWinners(game.players, winnerCount, gameId);

        // 1. Pay owner fee (flows to PizzaParlorManager via owner())
        if (ownerFee > 0) {
            pizzaToken.safeTransfer(owner(), ownerFee);
            emit OwnerFeePayout(gameId, owner(), ownerFee);
        }

        // 2. Pay charities equally (first charity gets remainder)
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

        // 3. Pay winners from players pool
        // DUST RULE: remainder + dust are added to winner[0] payout BEFORE sponsor split
        uint256 baseShare = playersPool / winnerCount;
        uint256 playersRemainder = playersPool - (baseShare * winnerCount);
        uint256[] memory winnerPayouts = new uint256[](winnerCount);

        for (uint256 i = 0; i < winnerCount; i++) {
            // Calculate payout: base share + remainder/dust for first winner
            uint256 payout = baseShare;
            if (i == 0) {
                payout += playersRemainder + dust; // First winner gets remainder AND dust
            }

            if (payout > 0) {
                address sponsor = dailySliceSponsor[gameId][winners[i]];

                if (sponsor != address(0)) {
                    // 50/50 split applies to ENTIRE payout (including remainder + dust)
                    uint256 sponsorCut = payout / 2;
                    uint256 playerCut = payout - sponsorCut;

                    pizzaToken.safeTransfer(winners[i], playerCut);
                    pizzaToken.safeTransfer(sponsor, sponsorCut);

                    winnerPayouts[i] = playerCut;
                    // Track sponsor's PIZZA won as well
                    playerStats[sponsor].totalPizzaWon += sponsorCut;

                    emit SponsoredDailyPayout(gameId, winners[i], sponsor, playerCut, sponsorCut);
                } else {
                    pizzaToken.safeTransfer(winners[i], payout);
                    winnerPayouts[i] = payout;
                }
            }
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

        // Record first claim week for sponsor split eligibility
        if (firstClaimWeekId[msg.sender] == 0) {
            firstClaimWeekId[msg.sender] = weekId;
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
     * @dev Calculate holdings bonus: 3 toppings per $10 worth of PIZZA, max 30 toppings
     * Uses holdingsUnitPizza (set by owner based on market price from Dexscreener)
     */
    function _calculateHoldingsBonus(address player) internal view returns (uint256) {
        uint256 unit = holdingsUnitPizza;
        require(unit > 0, "holdingsUnitPizza=0");

        uint256 balance = pizzaToken.balanceOf(player);
        if (balance < unit) return 0;

        uint256 units = balance / unit;
        uint256 bonus = units * HOLDINGS_TOPPINGS; // 3 per $10-unit

        // Cap at max toppings (30 = $100 worth)
        if (bonus > HOLDINGS_MAX_TOPPINGS) {
            bonus = HOLDINGS_MAX_TOPPINGS;
        }
        return bonus;
    }

    /**
     * @dev Settle weekly game (owner or after claim window)
     * @param usdCentsPerWinner USD value per winner in cents (e.g., 652 = $6.52). Pass 0 to skip storing.
     */
    function settleWeeklyGame(uint256 usdCentsPerWinner) external nonReentrant {
        uint256 weekId = weeklyGameId;
        WeeklyGame storage week = weeklyGames[weekId];

        require(block.timestamp >= week.claimWindowEnd, "Window not closed");
        require(!week.settled, "Already settled");

        _settleWeeklyGame(weekId, usdCentsPerWinner);
    }

    function _settleWeeklyGame(uint256 weekId, uint256 usdCentsPerWinner) internal {
        WeeklyGame storage week = weeklyGames[weekId];

        // No claimers: no jackpot
        if (week.claimers.length == 0 || week.totalClaimedToppings == 0) {
            week.settled = true;
            weeklyGameId++;
            _initializeWeeklyGame(weeklyGameId);
            emit WeeklyGameSettled(weekId, new address[](0), 0);
            return;
        }

        // Store USD value per winner if provided (locked at settlement time)
        if (usdCentsPerWinner > 0) {
            weeklyGameUsdValue[weekId] = usdCentsPerWinner;
        }

        // Jackpot = total claimed toppings × 100 PIZZA
        uint256 jackpot = week.totalClaimedToppings * TOPPING_TO_PIZZA;

        // Pull from treasury
        pizzaToken.safeTransferFrom(treasuryWallet, address(this), jackpot);

        // Select winners weighted by claimed toppings
        uint256 winnerCount = week.claimers.length < WEEKLY_WINNERS ? week.claimers.length : WEEKLY_WINNERS;
        address[] memory winners = _selectWeightedWinners(week.claimers, weekId, winnerCount);

        // Pay winners equally
        // DUST RULE: remainder is added to winner[0] payout BEFORE sponsor split
        uint256 basePayoutEach = jackpot / winnerCount;
        uint256 remainder = jackpot - (basePayoutEach * winnerCount);

        uint256[] memory winnerPayouts = new uint256[](winnerCount);
        for (uint256 i = 0; i < winnerCount; i++) {
            // Calculate payout: base + remainder for first winner
            uint256 payout = basePayoutEach;
            if (i == 0) {
                payout += remainder; // First winner gets remainder
            }

            address winner = winners[i];
            address sponsor = firstSliceSponsor[winner];
            bool isFirstClaimWeek = (firstClaimWeekId[winner] == weekId);

            if (sponsor != address(0) && isFirstClaimWeek) {
                // 50/50 split applies to ENTIRE payout (including remainder)
                uint256 sponsorCut = payout / 2;
                uint256 playerCut = payout - sponsorCut;

                pizzaToken.safeTransfer(winner, playerCut);
                pizzaToken.safeTransfer(sponsor, sponsorCut);

                winnerPayouts[i] = playerCut;
                // Track sponsor's PIZZA won as well
                playerStats[sponsor].totalPizzaWon += sponsorCut;

                emit SponsoredWeeklyPayout(weekId, winner, sponsor, playerCut, sponsorCut);
            } else {
                pizzaToken.safeTransfer(winner, payout);
                winnerPayouts[i] = payout;
            }
        }

        week.winners = winners;
        week.potAmount = jackpot;
        week.settled = true;

        for (uint256 i = 0; i < winnerCount; i++) {
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
     * @dev Get referral code for a player (view function - no transaction needed!)
     * Code is deterministically generated from player address
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

        // Deterministic generation; collision check for safety
        require(codeToPlayer[code] == address(0), "Code collision");

        playerReferralCode[msg.sender] = code;
        codeToPlayer[code] = msg.sender;

        emit ReferralCodeCreated(msg.sender, code);
    }

    function _generateCode(address player) internal view returns (string memory) {
        // Deterministic hash based on player + contract address
        bytes32 h = keccak256(abi.encodePacked(player, address(this)));
        bytes memory alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 34 chars (no I/O)
        bytes memory out = new bytes(8);

        // Use both nibbles of each byte for better entropy
        for (uint256 i = 0; i < 4; i++) {
            uint8 highNibble = uint8(h[i]) >> 4;
            uint8 lowNibble = uint8(h[i]) & 0x0F;

            // Ensure we stay within alphabet bounds (0-33)
            out[i*2] = alphabet[highNibble % 34];
            out[i*2 + 1] = alphabet[lowNibble % 34];
        }

        return string(abi.encodePacked("PZ", out));
    }

    /**
     * @dev Validate and get referrer address from code
     */
    function _getReferrerFromCode(string memory code) internal view returns (address) {
        require(bytes(code).length == 10, "Invalid code length");
        require(bytes(code)[0] == 'P' && bytes(code)[1] == 'Z', "Invalid code prefix");

        // Check if it's registered in the mapping
        address registered = codeToPlayer[code];
        require(registered != address(0), "Code not found");

        // Ensure referrer has played at least once
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

        // Mark as used (lifetime)
        hasUsedReferral[referee] = true;

        // Increment referral count
        referrerWeekly.referralsUsed++;

        // Award 2 toppings to referrer
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
        uint256 maxAttempts = count * 10; // Prevent infinite loops

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

        // Build prefix sums for weighted selection
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
        uint256 maxAttempts = count * 10; // Prevent infinite loops

        while (picked < count && attempts < maxAttempts) {
            uint256 draw = uint256(keccak256(abi.encodePacked(randSeed, attempts))) % totalWeight;

            // Binary search for winner
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

        // Resize if needed
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
        uint256 PT_OFFSET = 8 hours; // PST/PDT offset (PT = UTC-8)
        uint256 dayStart = (timestamp / 1 days) * 1 days;
        uint256 noonPT = dayStart + (12 hours + PT_OFFSET); // 12pm PT = 20:00 UTC

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
        return nextSundayMidnight + 20 hours; // 12pm PT = 20:00 UTC
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
        uint256 bonus = holdingsUnitPizza > 0 ? _calculateHoldingsBonus(player) : 0;

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
     * @dev Migrate player stats from old contract to preserve history on redeployment
     * Call this after deploying new contract to import stats from previous deployment
     * @param players Array of player addresses
     * @param stats Array of PlayerLifetimeStats corresponding to each player
     */
    function migratePlayerStats(
        address[] calldata players,
        PlayerLifetimeStats[] calldata stats
    ) external onlyOwner {
        require(players.length == stats.length, "Length mismatch");
        require(players.length > 0, "Empty array");

        for (uint256 i = 0; i < players.length; i++) {
            require(players[i] != address(0), "Invalid player address");
            playerStats[players[i]] = stats[i];
        }
    }

    function setTreasuryWallet(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasuryWallet = _treasury;
    }

    /**
     * @dev Set the parlor manager address (authorized to call enterDailyWithSlice)
     * @param _manager The new parlor manager address (can be address(0) to disable)
     */
    function setParlorManager(address _manager) external onlyOwner {
        address oldManager = parlorManager;
        parlorManager = _manager;
        emit ParlorManagerUpdated(oldManager, _manager);
    }

    function setOwnerFee(uint256 _bps) external onlyOwner {
        require(_bps <= MAX_OWNER_FEE_BPS, "Fee exceeds maximum");
        uint256 oldFee = ownerFeeBPS;
        ownerFeeBPS = _bps;
        emit OwnerFeeUpdated(oldFee, _bps);
    }

    /**
     * @dev Set the holdings unit in PIZZA tokens (how many PIZZA = $10)
     * Owner updates this based on market price from Dexscreener
     * @param newUnit Number of PIZZA tokens that equal $10 (18 decimals)
     */
    function setHoldingsUnitPizza(uint256 newUnit) external onlyOwner {
        require(newUnit > 0, "holdingsUnitPizza=0");
        uint256 old = holdingsUnitPizza;
        holdingsUnitPizza = newUnit;
        emit HoldingsUnitPizzaUpdated(old, newUnit);
    }

    /**
     * @dev Set USD value per winner for a daily game (for leaderboard display)
     * @param gameId The daily game ID
     * @param usdCents USD value in cents (e.g., 188 = $1.88)
     */
    function setDailyGameUsdValue(uint256 gameId, uint256 usdCents) external onlyOwner {
        dailyGameUsdValue[gameId] = usdCents;
    }

    /**
     * @dev Set USD value per winner for a weekly game (for leaderboard display)
     * @param gameId The weekly game ID
     * @param usdCents USD value in cents (e.g., 652 = $6.52)
     */
    function setWeeklyGameUsdValue(uint256 gameId, uint256 usdCents) external onlyOwner {
        weeklyGameUsdValue[gameId] = usdCents;
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

    function emergencySettleDaily(uint256 usdCentsPerWinner) external onlyOwner {
        uint256 gameId = dailyGameId;
        require(!dailyGames[gameId].settled, "Already settled");
        _settleDailyGame(gameId, usdCentsPerWinner);
    }

    function emergencySettleWeekly(uint256 usdCentsPerWinner) external onlyOwner {
        uint256 weekId = weeklyGameId;
        require(!weeklyGames[weekId].settled, "Already settled");
        _settleWeeklyGame(weekId, usdCentsPerWinner);
    }
}
