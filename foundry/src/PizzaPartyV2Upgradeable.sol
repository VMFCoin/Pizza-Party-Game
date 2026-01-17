// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "./IPizzaStaking.sol";

interface IPizzaParlorManager {
    function allocateFees() external;
}

/// @title PizzaPartyV2Upgradeable - Daily lottery + Weekly jackpot (UUPS)
contract PizzaPartyV2Upgradeable is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_ENTRY_FEE = 1e16;
    uint256 public constant MAX_ENTRY_FEE = 1000e18;
    uint256 public constant DAILY_WINNERS = 8;
    uint256 public constant WEEKLY_WINNERS = 10;
    uint256 public constant FIRST_PLAYER_BONUS_BPS = 0;
    uint256 public constant CHARITY_TOTAL_BPS = 300;
    uint256 public constant PLAYERS_POOL_BPS = 9300;
    uint256 public constant MAX_OWNER_FEE_BPS = 300;
    uint256 public constant STAKING_POOL_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_CHARITIES = 20;
    uint256 public constant MAX_REFERRALS_PER_WEEK = 3;
    uint256 public constant HOLDINGS_TOPPINGS = 1;
    uint256 public constant HOLDINGS_MAX_TOPPINGS = 5;

    IERC20 public pizzaToken;
    address public treasuryWallet;
    address[] public charityWallets;
    uint256 public ownerFeeBPS;
    address public ownerFeeRecipient;
    uint256 public noonPacificUtcHour;
    uint256 public dailyGameId;
    uint256 public weeklyGameId;
    uint256 public currentDailyPot;
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
    mapping(address => address) public firstSliceSponsor;   // player => sponsor (set once if brand-new and sliced) - DEPRECATED
    mapping(address => uint256) public firstClaimWeekId;    // player => first weekId they ever claimed toppings (set once) - DEPRECATED

    // NEW: Track if a sponsor has ever sliced a player (sponsor => player => hasSliced)
    // Each sponsor can only get 50% reward from a player ONCE (first slice ever)
    mapping(address => mapping(address => bool)) public hasSlicedPlayer;

    // NEW: Track which sponsor gets 50% of a player's weekly win for a given week
    // When sponsor first slices a player, they get 50% of that player's weekly win for that week only
    // weekId => player => sponsor (the sponsor who first sliced them in that week)
    mapping(uint256 => mapping(address => address)) public weeklySliceSponsor;

    // Weekly jackpot: 1 topping = $0.10 USD worth of PIZZA
    // Value = how many PIZZA tokens equal $0.10 (set by owner based on market price)
    // Example: at $0.001/PIZZA, $0.10 = 100 PIZZA, so toppingUnitPizza = 100e18
    // IMPORTANT: Added at end of storage to avoid slot collision on upgrade
    uint256 public toppingUnitPizza;

    // Weekly treasury bonus: fixed PIZZA amount added to weekly jackpot from treasury
    // IMPORTANT: Added at end of storage to avoid slot collision on upgrade
    uint256 public weeklyTreasuryBonus;

    // ============ Staking Integration (DORMANT - not active yet) ============

    /// @notice Staking contract address
    address public stakingContract;

    /// @notice Fee to stakers in BPS (1000 = 10%) - DORMANT until activated
    uint256 public stakingFeeBPS;

    /// @notice Fee to parlors in BPS (700 = 7%) - DORMANT until activated
    /// @dev When activated, this will replace the current ownerFeeBPS for parlor distribution
    uint256 public parlorFeeBPS;

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
    event ToppingToPizzaUpdated(uint256 oldAmount, uint256 newAmount);
    event WeeklyTreasuryBonusUpdated(uint256 oldAmount, uint256 newAmount);
    event ParlorFeesAllocated(uint256 indexed gameId);
    event ParlorFeesAllocationFailed(uint256 indexed gameId);
    event StakingContractSet(address indexed stakingContract);
    event StakingFeeBPSSet(uint256 feeBPS);
    event ParlorFeeBPSSet(uint256 feeBPS);
    event StakingRewardsDistributed(uint256 indexed gameId, uint256 amount);

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
        require(_pizzaToken != address(0), "0");
        require(_treasury != address(0), "0");
        require(_owner != address(0), "0");
        require(_charities.length <= MAX_CHARITIES, "max");

        // Validate charity addresses and ensure uniqueness
        for (uint256 i = 0; i < _charities.length; i++) {
            require(_charities[i] != address(0), "0");
            for (uint256 j = i + 1; j < _charities.length; j++) {
                require(_charities[i] != _charities[j], "dup");
            }
        }

        __Ownable_init(_owner);
        // Note: UUPSUpgradeable in OZ v5 is stateless (no init needed)

        pizzaToken = IERC20(_pizzaToken);
        treasuryWallet = _treasury;
        charityWallets = _charities;
        ownerFeeBPS = 300; // Default 3%
        noonPacificUtcHour = 20; // PST: 12pm Pacific = 20:00 UTC
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
        require(msg.sender == parlorManager, "!mgr");
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
     * @param referralCode Optional referral code (empty string if none)
     */
    function enterDailyGame(uint256 amountPaid, string calldata referralCode) external nonReentrant {
        require(amountPaid >= MIN_ENTRY_FEE, "<");
        require(amountPaid <= MAX_ENTRY_FEE, ">");

        // Process referral if provided (only for new players)
        if (bytes(referralCode).length > 0) {
            require(_isNewPlayer(msg.sender), "1st");
            require(!hasUsedReferral[msg.sender], "used");
            _processReferral(msg.sender, referralCode);
        }

        _enterDaily(msg.sender, amountPaid);
    }

    /**
     * @dev Enter daily game with permit (single transaction - no prior approval needed)
     * Uses EIP-2612 permit to approve and enter in one transaction
     * @param amountPaid PIZZA amount to pay (must be within MIN/MAX bounds)
     * @param referralCode Optional referral code (empty string if none)
     * @param deadline Timestamp after which the permit is no longer valid
     * @param v Recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     */
    function enterDailyGameWithPermit(
        uint256 amountPaid,
        string calldata referralCode,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        require(amountPaid >= MIN_ENTRY_FEE, "<");
        require(amountPaid <= MAX_ENTRY_FEE, ">");

        // Process referral if provided (only for new players)
        if (bytes(referralCode).length > 0) {
            require(_isNewPlayer(msg.sender), "1st");
            require(!hasUsedReferral[msg.sender], "used");
            _processReferral(msg.sender, referralCode);
        }

        // Use try/catch for permit as recommended by OpenZeppelin
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
     * @dev Enter daily game with a slice - called by PizzaParlorManager
     * @param player The player receiving the entry
     * @param sponsor The parlor owner who is sponsoring this slice
     * @param amount The PIZZA amount to add to pot (0 for free, or treasury-funded amount)
     */
    function enterDailyWithSlice(address player, address sponsor, uint256 amount) external nonReentrant onlyParlorManager {
        require(player != address(0) && sponsor != address(0), "0");
        require(player != sponsor, "self");

        // If amount > 0, transfer PIZZA from ParlorManager to this contract
        if (amount > 0) {
            pizzaToken.safeTransferFrom(msg.sender, address(this), amount);
        }

        // Enter the daily game (adds amount to pot)
        _enterDailySponsored(player, amount);

        // Now check if this sponsor has EVER sliced this player before
        // Sponsor only gets 50% reward on their FIRST slice to this player
        if (!hasSlicedPlayer[sponsor][player]) {
            // First time this sponsor is slicing this player
            hasSlicedPlayer[sponsor][player] = true;

            // Record daily sponsor for THIS gameId (for daily 50% split)
            // Use the current dailyGameId (which is correct after auto-settlement)
            dailySliceSponsor[dailyGameId][player] = sponsor;

            // Record weekly sponsor for THIS weekId (for weekly 50% split)
            // Only record if no sponsor already recorded for this player this week
            // (first sponsor to slice them this week gets the weekly 50%)
            if (weeklySliceSponsor[weeklyGameId][player] == address(0)) {
                weeklySliceSponsor[weeklyGameId][player] = sponsor;
            }

            emit SliceSponsored(dailyGameId, player, sponsor);
        }
        // If sponsor has sliced this player before, no sponsor is recorded
        // Player still gets free entry, but sponsor gets no 50% reward

        emit SliceEntryGranted(dailyGameId, player, msg.sender);
    }

    /**
     * @dev Internal entry for sponsored slices - tokens already transferred to contract
     */
    function _enterDailySponsored(address player, uint256 amount) internal {
        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];

        // Auto-settle previous game if needed
        if (block.timestamp >= game.endTime && !game.settled) {
            _settleDailyGame(gameId);
            gameId = dailyGameId;
            game = dailyGames[gameId];
        }

        require(block.timestamp < game.endTime, "end");
        require(!hasPlayedDaily[gameId][player], "ply");
        require(!game.settled, "set");

        // Check weekly play limit
        PlayerWeekly storage weekly = weeklyPlayers[weeklyGameId][player];
        require(weekly.dailyPlays < 7, "7");

        // Add to pot (tokens already in contract if amount > 0)
        if (amount > 0) {
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

        // Award 1 topping + 3 bonus on 7th day (full week = 10 total)
        weekly.toppingsEarned += 1;
        weekly.dailyPlays += 1;
        playerStats[player].lifetimeToppings += 1;
        emit ToppingsEarned(weeklyGameId, player, 1, "daily_play");

        // 7-day streak bonus: +3 toppings for completing full week
        if (weekly.dailyPlays == 7) {
            weekly.toppingsEarned += 3;
            playerStats[player].lifetimeToppings += 3;
            emit ToppingsEarned(weeklyGameId, player, 3, "weekly_streak_bonus");
        }

        // Auto-register referral code on first entry
        if (bytes(playerReferralCode[player]).length == 0) {
            string memory myCode = _generateCode(player);
            playerReferralCode[player] = myCode;
            codeToPlayer[myCode] = player;
            emit ReferralCodeCreated(player, myCode);
        }

        emit DailyGameEntered(gameId, player, isFirst, amount);
    }

    function _enterDaily(address player, uint256 amount) internal {
        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];

        // Auto-settle previous game if needed
        if (block.timestamp >= game.endTime && !game.settled) {
            _settleDailyGame(gameId);
            gameId = dailyGameId;
            game = dailyGames[gameId];
        }

        require(block.timestamp < game.endTime, "end");
        require(!hasPlayedDaily[gameId][player], "ply");
        require(!game.settled, "set");

        // Check weekly play limit
        PlayerWeekly storage weekly = weeklyPlayers[weeklyGameId][player];
        require(weekly.dailyPlays < 7, "7");

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

        // Award 1 topping + 3 bonus on 7th day
        weekly.toppingsEarned += 1;
        weekly.dailyPlays += 1;
        playerStats[player].lifetimeToppings += 1;
        emit ToppingsEarned(weeklyGameId, player, 1, "daily_play");

        if (weekly.dailyPlays == 7) {
            weekly.toppingsEarned += 3;
            playerStats[player].lifetimeToppings += 3;
            emit ToppingsEarned(weeklyGameId, player, 3, "weekly_streak_bonus");
        }

        if (bytes(playerReferralCode[player]).length == 0) {
            string memory myCode = _generateCode(player);
            playerReferralCode[player] = myCode;
            codeToPlayer[myCode] = player;
            emit ReferralCodeCreated(player, myCode);
        }

        emit DailyGameEntered(gameId, player, isFirst, amount);
    }

    /**
     * @dev Settle daily game
     * No parameters needed - USD value is calculated on frontend from pot and PIZZA price
     */
    function settleDailyGame() external nonReentrant {
        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];

        require(block.timestamp >= game.endTime, "!end");
        require(!game.settled, "set");

        _settleDailyGame(gameId);
    }

    /**
     * @dev Settle daily game with USD value snapshot (preferred method)
     * Locks the USD value at settlement time so it doesn't change with price
     * @param usdCentsPerWinner USD value per winner in cents (e.g., 591 = $5.91)
     */
    function settleDailyGameWithUsd(uint256 usdCentsPerWinner) external nonReentrant {
        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];

        require(block.timestamp >= game.endTime, "!end");
        require(!game.settled, "set");
        require(usdCentsPerWinner > 0, "usd");

        // Store USD value BEFORE settlement
        dailyGameUsdValue[gameId] = usdCentsPerWinner;

        _settleDailyGame(gameId);
    }

    function _settleDailyGame(uint256 gameId) internal {
        DailyGame storage game = dailyGames[gameId];

        // Require at least one player to settle (prevents accidental empty game settlements)
        require(game.players.length > 0, "0ply");

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

        // Calculate allocations (93% winners, 3% charity, 3% owner fee, 1% staking)
        uint256 charityTotal = (pot * CHARITY_TOTAL_BPS) / BPS_DENOMINATOR;
        uint256 ownerFee = (pot * ownerFeeBPS) / BPS_DENOMINATOR;
        uint256 playersPool = (pot * PLAYERS_POOL_BPS) / BPS_DENOMINATOR;
        uint256 stakingFee = (pot * STAKING_POOL_BPS) / BPS_DENOMINATOR;

        uint256 totalAllocated = charityTotal + ownerFee + playersPool + stakingFee;
        uint256 dust = pot > totalAllocated ? pot - totalAllocated : 0;

        // Distribute staking fee to staking contract
        if (stakingFee > 0 && stakingContract != address(0)) {
            pizzaToken.safeTransfer(stakingContract, stakingFee);
            IPizzaStaking(stakingContract).notifyRewardAmount(stakingFee);
            emit StakingRewardsDistributed(gameId, stakingFee);
        } else if (stakingFee > 0) {
            // No staking contract set, add to treasury
            pizzaToken.safeTransfer(treasuryWallet, stakingFee);
        }

        // Select winners randomly
        address[] memory winners = _selectRandomWinners(game.players, winnerCount, gameId);

        // 1. Pay owner fee (flows to ownerFeeRecipient, defaults to owner())
        if (ownerFee > 0) {
            address feeRecipient = ownerFeeRecipient != address(0) ? ownerFeeRecipient : owner();
            pizzaToken.safeTransfer(feeRecipient, ownerFee);
            emit OwnerFeePayout(gameId, feeRecipient, ownerFee);

            // Auto-allocate fees for parlor owners when funds land in the manager
            if (feeRecipient == parlorManager && parlorManager != address(0)) {
                try IPizzaParlorManager(parlorManager).allocateFees() {
                    emit ParlorFeesAllocated(gameId);
                } catch {
                    emit ParlorFeesAllocationFailed(gameId);
                }
            }
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
        uint256 baseShare = playersPool / winnerCount;
        uint256 playersRemainder = playersPool - (baseShare * winnerCount);
        uint256[] memory winnerPayouts = new uint256[](winnerCount);

        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 payout = baseShare;

            if (payout > 0) {
                address sponsor = dailySliceSponsor[gameId][winners[i]];

                if (sponsor != address(0)) {
                    // 50/50 split
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

        // Send remainder + dust to treasury
        if (playersRemainder + dust > 0) {
            pizzaToken.safeTransfer(treasuryWallet, playersRemainder + dust);
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

        require(block.timestamp >= week.claimWindowStart, "!open");
        require(block.timestamp < week.claimWindowEnd, "cls");
        require(!player.hasClaimed, "clm");
        require(player.toppingsEarned > 0, "0top");

        // Add holdings bonus (snapshot at claim time)
        uint256 holdingsBonus = _calculateHoldingsBonus(msg.sender);
        if (holdingsBonus > 0) {
            player.toppingsEarned += holdingsBonus;
            playerStats[msg.sender].lifetimeToppings += holdingsBonus;
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
     * @dev Calculate holdings bonus: 1 topping per $10 worth of PIZZA, max 5 toppings
     * Uses holdingsUnitPizza (set by owner based on market price from Dexscreener)
     */
    function _calculateHoldingsBonus(address player) internal view returns (uint256) {
        uint256 unit = holdingsUnitPizza;
        require(unit > 0, "h0");

        uint256 balance = pizzaToken.balanceOf(player);
        if (balance < unit) return 0;

        uint256 units = balance / unit;
        uint256 bonus = units * HOLDINGS_TOPPINGS; // 1 per $10-unit

        // Cap at max toppings (5 = $50 worth)
        if (bonus > HOLDINGS_MAX_TOPPINGS) {
            bonus = HOLDINGS_MAX_TOPPINGS;
        }
        return bonus;
    }

    /**
     * @dev Settle weekly game (anyone can call after claim window ends)
     * No parameters needed - USD value is calculated on frontend from jackpot and PIZZA price
     */
    function settleWeeklyGame() external nonReentrant {
        uint256 weekId = weeklyGameId;
        WeeklyGame storage week = weeklyGames[weekId];

        require(block.timestamp >= week.claimWindowEnd, "!cls");
        require(!week.settled, "set");

        _settleWeeklyGame(weekId);
    }

    /**
     * @dev Settle weekly game with USD value snapshot (preferred method)
     * Locks the USD value at settlement time so it doesn't change with price
     * @param usdCentsPerWinner USD value per winner in cents (e.g., 652 = $6.52)
     */
    function settleWeeklyGameWithUsd(uint256 usdCentsPerWinner) external nonReentrant {
        uint256 weekId = weeklyGameId;
        WeeklyGame storage week = weeklyGames[weekId];

        require(block.timestamp >= week.claimWindowEnd, "!cls");
        require(!week.settled, "set");
        require(usdCentsPerWinner > 0, "usd");

        // Store USD value BEFORE settlement
        weeklyGameUsdValue[weekId] = usdCentsPerWinner;

        _settleWeeklyGame(weekId);
    }

    function _settleWeeklyGame(uint256 weekId) internal {
        WeeklyGame storage week = weeklyGames[weekId];

        // Require at least one claimer to settle
        require(week.claimers.length > 0 && week.totalClaimedToppings > 0, "0clm");

        // Jackpot = total claimed toppings × toppingUnitPizza ($0.10 per topping) + treasury bonus
        uint256 jackpot = week.totalClaimedToppings * toppingUnitPizza + weeklyTreasuryBonus;

        // Pull from treasury
        pizzaToken.safeTransferFrom(treasuryWallet, address(this), jackpot);

        // Select winners weighted by claimed toppings
        uint256 requestedWinners = week.claimers.length < WEEKLY_WINNERS ? week.claimers.length : WEEKLY_WINNERS;
        address[] memory winners = _selectWeightedWinners(week.claimers, weekId, requestedWinners);

        // Use actual winner count (may be less if weighted selection couldn't find enough unique winners)
        uint256 winnerCount = winners.length;

        // Pay winners equally
        uint256 basePayoutEach = jackpot / winnerCount;
        uint256 remainder = jackpot - (basePayoutEach * winnerCount);

        uint256[] memory winnerPayouts = new uint256[](winnerCount);
        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 payout = basePayoutEach;

            address winner = winners[i];
            // Use the new per-week sponsor mapping
            // This is the sponsor who first-sliced this player during this specific week
            address sponsor = weeklySliceSponsor[weekId][winner];

            if (sponsor != address(0)) {
                // 50/50 split - sponsor gets 50% of this player's weekly win
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

        // Send remainder to treasury
        if (remainder > 0) {
            pizzaToken.safeTransfer(treasuryWallet, remainder);
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
        require(bytes(playerReferralCode[msg.sender]).length == 0, "ex");
        require(!_isNewPlayer(msg.sender), "1st");

        string memory code = _generateCode(msg.sender);

        // Deterministic generation; collision check for safety
        require(codeToPlayer[code] == address(0), "col");

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
        require(bytes(code).length == 10, "len");
        require(bytes(code)[0] == 'P' && bytes(code)[1] == 'Z', "pfx");

        // Check if it's registered in the mapping
        address registered = codeToPlayer[code];
        require(registered != address(0), "!cod");

        // Ensure referrer has played at least once
        require(playerStats[registered].lifetimeToppings > 0, "rfr");

        return registered;
    }

    function _processReferral(address referee, string memory code) internal {
        require(!hasUsedReferral[referee], "used");

        address referrer = _getReferrerFromCode(code);
        require(referrer != referee, "self");

        uint256 weekId = weeklyGameId;
        PlayerWeekly storage referrerWeekly = weeklyPlayers[weekId][referrer];

        require(referrerWeekly.referralsUsed < MAX_REFERRALS_PER_WEEK, "lim");

        // Mark as used (lifetime)
        hasUsedReferral[referee] = true;

        // Increment referral count
        referrerWeekly.referralsUsed++;

        // Award 2 toppings to referrer
        referrerWeekly.toppingsEarned += 2;
        playerStats[referrer].lifetimeToppings += 2;
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

        require(totalWeight > 0, "w");

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

        // Clear players array to prevent leftover data from previous game slot
        delete dailyGames[gameId].players;

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

    function _nextNoonPT(uint256 timestamp) internal view returns (uint256) {
        uint256 dayStart = (timestamp / 1 days) * 1 days;
        uint256 noonPT = dayStart + (noonPacificUtcHour * 1 hours);

        if (timestamp >= noonPT) {
            return noonPT + 1 days;
        }
        return noonPT;
    }

    function _nextSundayNoonPT(uint256 timestamp) internal view returns (uint256) {
        uint256 THURSDAY_EPOCH = 4 days;
        uint256 daysSinceEpoch = (timestamp + THURSDAY_EPOCH) / 1 days;
        uint256 dayOfWeek = daysSinceEpoch % 7;
        uint256 daysUntilSunday = (7 - dayOfWeek) % 7;

        if (daysUntilSunday == 0) {
            uint256 sundayNoon = (timestamp / 1 days) * 1 days + (noonPacificUtcHour * 1 hours);
            if (timestamp >= sundayNoon) {
                daysUntilSunday = 7;
            }
        }

        uint256 nextSundayMidnight = ((timestamp / 1 days) + daysUntilSunday) * 1 days;
        return nextSundayMidnight + (noonPacificUtcHour * 1 hours);
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
        // Include treasury bonus in projected jackpot so UI shows full amount from week start
        // Each topping = $0.10 worth of PIZZA (toppingUnitPizza)
        uint256 jackpot = week.totalClaimedToppings * toppingUnitPizza + weeklyTreasuryBonus;

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

    /**
     * @dev Get stored USD value per winner for a daily game (in cents)
     * Returns 0 if not set (use dynamic calculation for older games)
     */
    function getDailyGameUsdValue(uint256 gameId) external view returns (uint256) {
        return dailyGameUsdValue[gameId];
    }

    /**
     * @dev Get stored USD value per winner for a weekly game (in cents)
     * Returns 0 if not set (use dynamic calculation for older games)
     */
    function getWeeklyGameUsdValue(uint256 weekId) external view returns (uint256) {
        return weeklyGameUsdValue[weekId];
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
        require(players.length == stats.length, "len");
        require(players.length > 0, "[]");

        for (uint256 i = 0; i < players.length; i++) {
            require(players[i] != address(0), "0");
            playerStats[players[i]] = stats[i];
        }
    }

    function setTreasuryWallet(address _treasury) external onlyOwner {
        require(_treasury != address(0), "0");
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
        require(_bps <= MAX_OWNER_FEE_BPS, "fee");
        uint256 oldFee = ownerFeeBPS;
        ownerFeeBPS = _bps;
        emit OwnerFeeUpdated(oldFee, _bps);
    }

    /**
     * @dev Set the owner fee recipient address
     * @param _recipient New fee recipient (address(0) to use owner())
     */
    function setOwnerFeeRecipient(address _recipient) external onlyOwner {
        ownerFeeRecipient = _recipient;
    }

    /**
     * @dev Set the UTC hour for 12pm Pacific (DST handling)
     * @param _hour 19 for PDT (March-November), 20 for PST (November-March)
     */
    function setNoonPacificUtcHour(uint256 _hour) external onlyOwner {
        require(_hour == 19 || _hour == 20, "hr");
        noonPacificUtcHour = _hour;
    }

    /**
     * @dev Set the holdings unit in PIZZA tokens (how many PIZZA = $10)
     * Owner updates this based on market price from Dexscreener
     * @param newUnit Number of PIZZA tokens that equal $10 (18 decimals)
     */
    function setHoldingsUnitPizza(uint256 newUnit) external onlyOwner {
        require(newUnit > 0, "h0");
        uint256 old = holdingsUnitPizza;
        holdingsUnitPizza = newUnit;
        emit HoldingsUnitPizzaUpdated(old, newUnit);
    }

    /**
     * @notice Set the PIZZA amount per topping for weekly jackpot (1 topping = $0.10 USD)
     * @param newUnit Number of PIZZA tokens that equal $0.10 (18 decimals)
     * Example: at $0.001/PIZZA, $0.10 = 100 PIZZA, so newUnit = 100e18
     */
    function setToppingUnitPizza(uint256 newUnit) external onlyOwner {
        require(newUnit > 0, "t0");
        uint256 old = toppingUnitPizza;
        toppingUnitPizza = newUnit;
        emit ToppingToPizzaUpdated(old, newUnit);
    }

    /**
     * @notice Set the fixed PIZZA bonus added to weekly jackpot from treasury
     * @param newAmount PIZZA tokens to add to weekly jackpot (18 decimals)
     */
    function setWeeklyTreasuryBonus(uint256 newAmount) external onlyOwner {
        uint256 old = weeklyTreasuryBonus;
        weeklyTreasuryBonus = newAmount;
        emit WeeklyTreasuryBonusUpdated(old, newAmount);
    }

    function setCharityWallets(address[] memory _charities) external onlyOwner {
        require(_charities.length <= MAX_CHARITIES, "max");

        for (uint256 i = 0; i < _charities.length; i++) {
            require(_charities[i] != address(0), "0");
            for (uint256 j = i + 1; j < _charities.length; j++) {
                require(_charities[i] != _charities[j], "dup");
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
        require(_charity != address(0), "0");
        require(charityWallets.length < MAX_CHARITIES, "max");

        for (uint256 i = 0; i < charityWallets.length; i++) {
            require(charityWallets[i] != _charity, "dup");
        }

        address[] memory oldCharities = new address[](charityWallets.length);
        for (uint256 i = 0; i < charityWallets.length; i++) {
            oldCharities[i] = charityWallets[i];
        }

        charityWallets.push(_charity);
        emit CharityWalletsUpdated(oldCharities, charityWallets);
    }

    function removeCharityWallet(uint256 index) external onlyOwner {
        require(index < charityWallets.length, "idx");

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
        require(!dailyGames[gameId].settled, "set");
        _settleDailyGame(gameId);
    }

    function emergencySettleWeekly() external onlyOwner {
        uint256 weekId = weeklyGameId;
        require(!weeklyGames[weekId].settled, "set");
        _settleWeeklyGame(weekId);
    }

    /**
     * @dev Admin function to correct game ID after skipped empty games
     * Use this to reset the game counter to the correct value
     * @param newDailyGameId The correct daily game ID to set
     */
    function adminSetDailyGameId(uint256 newDailyGameId) external onlyOwner {
        require(newDailyGameId > 0, "gid");
        dailyGameId = newDailyGameId;
        // Re-initialize the game with correct times and reset settled flag
        _initializeDailyGame(newDailyGameId);
        dailyGames[newDailyGameId].settled = false;
    }

    /**
     * @dev Admin function to correct weekly game ID after skipped empty weeks
     * @param newWeeklyGameId The correct weekly game ID to set
     */
    function adminSetWeeklyGameId(uint256 newWeeklyGameId) external onlyOwner {
        require(newWeeklyGameId > 0, "wid");
        weeklyGameId = newWeeklyGameId;
        // Re-initialize the week with correct times and reset settled flag
        _initializeWeeklyGame(newWeeklyGameId);
        weeklyGames[newWeeklyGameId].settled = false;
    }

    /**
     * @dev Admin function to reset a daily game to unsettled state
     * Use this to make a game the active current game
     * @param gameId The game ID to reset
     */
    function adminResetDailyGameSettled(uint256 gameId) external onlyOwner {
        require(gameId > 0, "gid");
        dailyGames[gameId].settled = false;
    }

    /**
     * @dev Admin function to mark a daily game as settled WITHOUT re-processing
     * Use this when winners are already stored but settled flag is wrong
     * @param gameId The game ID to mark as settled
     */
    function adminMarkDailyGameSettled(uint256 gameId) external onlyOwner {
        require(gameId > 0, "gid");
        dailyGames[gameId].settled = true;
    }

    /**
     * @dev Admin function to ONLY change the dailyGameId counter without re-initializing
     * Use this when players have already entered a game but the ID counter is wrong
     * This preserves all existing game data and players
     * @param newDailyGameId The correct daily game ID to set
     */
    function adminSetDailyGameIdOnly(uint256 newDailyGameId) external onlyOwner {
        require(newDailyGameId > 0, "gid");
        dailyGameId = newDailyGameId;
    }

    /**
     * @dev Admin function to reset currentDailyPot (emergency fix for storage corruption)
     * @param newPot The value to set currentDailyPot to (usually 0)
     */
    function adminSetCurrentDailyPot(uint256 newPot) external onlyOwner {
        currentDailyPot = newPot;
    }

    /**
     * @dev Emergency function to fix corrupted pizzaToken address
     * Only needed if storage slot corruption occurs during upgrade
     * @param newToken The correct PIZZA token address
     */
    function adminSetPizzaToken(address newToken) external onlyOwner {
        require(newToken != address(0), "0");
        pizzaToken = IERC20(newToken);
    }

    /**
     * @dev Admin function to migrate specific players from one game to another
     * Used to fix state when players entered the wrong game due to settlement bugs
     * @param fromGameId The source game ID
     * @param toGameId The destination game ID
     * @param playersToMigrate Array of player addresses to move
     * @param pizzaPerPlayer Amount of PIZZA each player contributed (for pot calculation)
     */
    function adminMigratePlayers(
        uint256 fromGameId,
        uint256 toGameId,
        address[] calldata playersToMigrate,
        uint256 pizzaPerPlayer
    ) external onlyOwner {
        require(fromGameId > 0 && toGameId > 0, "gids");
        require(playersToMigrate.length > 0, "[]");

        DailyGame storage fromGame = dailyGames[fromGameId];
        DailyGame storage toGame = dailyGames[toGameId];

        // Calculate total PIZZA to move
        uint256 totalPizzaToMove = pizzaPerPlayer * playersToMigrate.length;

        // Move pot amount
        require(fromGame.potAmount >= totalPizzaToMove, "pot");
        fromGame.potAmount -= totalPizzaToMove;
        toGame.potAmount += totalPizzaToMove;

        // Add players to destination game
        for (uint256 i = 0; i < playersToMigrate.length; i++) {
            address player = playersToMigrate[i];

            // Add to destination game players array
            toGame.players.push(player);
            hasPlayedDaily[toGameId][player] = true;

            // Mark as first player if destination is empty
            if (toGame.players.length == 1) {
                toGame.firstPlayer = player;
            }

            // Remove from source game's hasPlayedDaily mapping
            // (we can't easily remove from array, but hasPlayedDaily is what matters for re-entry check)
            hasPlayedDaily[fromGameId][player] = false;
        }
    }

    /**
     * @dev Admin function to initialize a new daily game with specific times
     * @param gameId The game ID to initialize
     * @param startTime The start timestamp
     * @param endTime The end timestamp
     */
    function adminInitializeDailyGame(
        uint256 gameId,
        uint256 startTime,
        uint256 endTime
    ) external onlyOwner {
        require(gameId > 0, "gid");
        DailyGame storage game = dailyGames[gameId];
        game.startTime = startTime;
        game.endTime = endTime;
        game.settled = false;
    }

    /**
     * @dev Admin function to set USD value for a historical daily game
     * Use this to backfill USD values for games settled before this feature
     * @param gameId The game ID to set USD for
     * @param usdCentsPerWinner USD value per winner in cents (e.g., 591 = $5.91)
     */
    function adminSetDailyGameUsdValue(uint256 gameId, uint256 usdCentsPerWinner) external onlyOwner {
        require(gameId > 0, "gid");
        dailyGameUsdValue[gameId] = usdCentsPerWinner;
    }

    /**
     * @dev Admin function to set USD value for a historical weekly game
     * Use this to backfill USD values for games settled before this feature
     * @param weekId The week ID to set USD for
     * @param usdCentsPerWinner USD value per winner in cents (e.g., 652 = $6.52)
     */
    function adminSetWeeklyGameUsdValue(uint256 weekId, uint256 usdCentsPerWinner) external onlyOwner {
        require(weekId > 0, "wid");
        weeklyGameUsdValue[weekId] = usdCentsPerWinner;
    }

    /**
     * @dev Admin function to fix corrupted daily game players array
     * Clears existing players and sets new correct list
     * @param gameId The game ID to fix
     * @param correctPlayers The correct list of players
     * @param firstPlayer The first player address
     */
    function adminFixDailyGamePlayers(uint256 gameId, address[] calldata correctPlayers, address firstPlayer) external onlyOwner {
        require(gameId > 0, "gid");
        delete dailyGames[gameId].players;
        for (uint256 i = 0; i < correctPlayers.length; i++) {
            dailyGames[gameId].players.push(correctPlayers[i]);
        }
        dailyGames[gameId].firstPlayer = firstPlayer;
    }

    function adminSetDailyGamePotAmount(uint256 gameId, uint256 pot) external onlyOwner {
        dailyGames[gameId].potAmount = pot;
    }

    function adminAddToDailyPotFromTreasury(uint256 amount) external onlyOwner {
        pizzaToken.safeTransferFrom(treasuryWallet, address(this), amount);
        currentDailyPot += amount;
    }

    // ============ Staking Admin Functions ============

    /**
     * @notice Set staking contract address
     * @param _stakingContract Address of PizzaStakingV1Upgradeable
     */
    function adminSetStakingContract(address _stakingContract) external onlyOwner {
        require(_stakingContract != address(0), "0");
        stakingContract = _stakingContract;
        emit StakingContractSet(_stakingContract);
    }

    /**
     * @notice Set staking fee in BPS (10% = 1000 BPS)
     * @param _feeBPS Fee in basis points
     */
    function adminSetStakingFeeBPS(uint256 _feeBPS) external onlyOwner {
        require(_feeBPS <= 2000, "20");
        stakingFeeBPS = _feeBPS;
        emit StakingFeeBPSSet(_feeBPS);
    }

    /**
     * @notice Set parlor fee in BPS (7% = 700 BPS) - DORMANT until staking activated
     * @dev When activated, this will be used instead of ownerFeeBPS for parlor distribution
     * @param _feeBPS Fee in basis points
     */
    function adminSetParlorFeeBPS(uint256 _feeBPS) external onlyOwner {
        require(_feeBPS <= 1500, "15");
        parlorFeeBPS = _feeBPS;
        emit ParlorFeeBPSSet(_feeBPS);
    }

}
