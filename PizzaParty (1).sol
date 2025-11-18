// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


/**
 * @title PizzaParty
 * @dev Daily lottery + Weekly jackpot with topping-based tickets
 * 
 * Daily Game:
 * - Pay 100 VMF ($1) to enter, earn 1 topping, get 1 entry
 * - 8 winners split the daily pot
 * - First player each day gets 1% bonus from pot
 * - Games without entries either carry over or are skipped
 * 
 * Weekly Game:
 * - Claim window: Sunday 12pm PST → Monday 12pm PST (24 hours)
 * - VMF balance snapshot taken at claim time (not at window opening)
 * - Players claim toppings once per week during window
 * - 1 topping = 1 VMF in jackpot
 * - 10 winners, weighted by claimed toppings
 * - Paid from treasury wallet
 * 
 * Toppings earned:
 * - Daily play: 1 topping (max 7/week)
 * - Referrals: 2 toppings per successful referral (max 3/week)
 * - Holdings: 3 toppings per 10k VMF held (snapshot at claim time)
 */
contract PizzaParty is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // ============ Constants ============
    
    uint256 public constant ENTRY_FEE = 100e18; // 100 VMF = $1
    uint256 public constant DAILY_WINNERS = 8;
    uint256 public constant WEEKLY_WINNERS = 10;
    uint256 public constant FIRST_PLAYER_BONUS_BPS = 100; // 1% = 100 basis points
    uint256 public constant MAX_REFERRALS_PER_WEEK = 3;
    uint256 public constant HOLDINGS_UNIT = 10000e18; // 10k VMF
    uint256 public constant HOLDINGS_TOPPINGS = 3; // per unit
    uint256 public constant TOPPING_TO_VMF = 1e18; // 1 topping = 1 VMF
    
    // ============ State Variables ============
    
    IERC20 public immutable vmfToken;
    address public treasuryWallet;
    
    uint256 public dailyGameId = 1;
    uint256 public weeklyGameId = 1;
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
    
    // ============ Mappings ============
    
    mapping(uint256 => DailyGame) public dailyGames;
    mapping(uint256 => WeeklyGame) public weeklyGames;
    mapping(uint256 => mapping(address => bool)) public hasPlayedDaily;
    mapping(uint256 => mapping(address => PlayerWeekly)) public weeklyPlayers;
    
    // Referral system (lazy registration)
    mapping(address => string) public playerReferralCode;
    mapping(string => address) public codeToPlayer;
    mapping(address => bool) public hasUsedReferral; // Lifetime flag
    
    // ============ Events ============
    
    event DailyGameStarted(uint256 indexed gameId, uint256 startTime, uint256 endTime);
    event DailyGameEntered(uint256 indexed gameId, address indexed player, bool isFirst);
    event DailyGameSettled(uint256 indexed gameId, address[] winners, uint256 pot);
    event WeeklyGameStarted(uint256 indexed gameId, uint256 claimStart, uint256 claimEnd);
    event ToppingsEarned(uint256 indexed weekId, address indexed player, uint256 amount, string reason);
    event ToppingsClaimed(uint256 indexed weekId, address indexed player, uint256 amount);
    event WeeklyGameSettled(uint256 indexed weekId, address[] winners, uint256 pot);
    event ReferralCodeCreated(address indexed player, string code);
    event ReferralUsed(address indexed referrer, address indexed referee);
    
    // ============ Constructor ============
    
    constructor(address _vmfToken, address _treasury) Ownable(msg.sender) {
        require(_vmfToken != address(0), "Invalid VMF");
        require(_treasury != address(0), "Invalid treasury");
        
        vmfToken = IERC20(_vmfToken);
        treasuryWallet = _treasury;
        
        _initializeDailyGame(dailyGameId);
        _initializeWeeklyGame(weeklyGameId);
    }
    
    // ============ Daily Game ============
    
    /**
     * @dev Enter daily game with optional referral code (first-time only)
     */
    function enterDailyGame(string memory referralCode) external nonReentrant {
        _enterDaily(msg.sender, referralCode);
    }
    
    /**
     * @dev Enter daily game without referral
     */
    function enterDailyGameNoRef() external nonReentrant {
        _enterDaily(msg.sender, "");
    }
    
    function _enterDaily(address player, string memory referralCode) internal {
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
        
        // Collect entry fee
        vmfToken.safeTransferFrom(player, address(this), ENTRY_FEE);
        currentDailyPot += ENTRY_FEE;
        
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
        
        emit DailyGameEntered(gameId, player, isFirst);
        emit ToppingsEarned(weeklyGameId, player, 1, "daily_play");
        
        // Process referral if first time
        if (bytes(referralCode).length > 0 && !hasUsedReferral[player]) {
            _processReferral(player, referralCode);
        }
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
        
        uint256 pot = currentDailyPot;
        uint256 winnerCount = game.players.length < DAILY_WINNERS ? game.players.length : DAILY_WINNERS;
        
        // Calculate first player bonus (1% of pot)
        uint256 firstPlayerBonus = (pot * FIRST_PLAYER_BONUS_BPS) / 10000;
        uint256 remainingPot = pot - firstPlayerBonus;
        
        // Select winners randomly
        address[] memory winners = _selectRandomWinners(game.players, winnerCount, gameId);
        
        // Calculate payouts
        uint256 baseShare = remainingPot / winnerCount;
        
        // Pay first player bonus
        if (firstPlayerBonus > 0 && game.firstPlayer != address(0)) {
            vmfToken.safeTransfer(game.firstPlayer, firstPlayerBonus);
        }
        
        // Pay winners
        for (uint256 i = 0; i < winnerCount; i++) {
            if (baseShare > 0) {
                vmfToken.safeTransfer(winners[i], baseShare);
            }
        }
        
        // Handle remainder (dust)
        uint256 totalPaid = firstPlayerBonus + (baseShare * winnerCount);
        if (pot > totalPaid) {
            vmfToken.safeTransfer(winners[0], pot - totalPaid);
        }
        
        game.winners = winners;
        game.potAmount = pot;
        game.settled = true;
        
        emit DailyGameSettled(gameId, winners, pot);
        
        // Reset and create next game
        currentDailyPot = 0;
        dailyGameId++;
        _initializeDailyGame(dailyGameId);
    }
    
    // ============ Weekly Game ============
    
    /**
     * @dev Claim toppings during claim window (once per week)
     * Automatically adds holdings bonus based on VMF balance snapshot
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
     * @dev Calculate holdings bonus: 3 toppings per 10k VMF
     */
    function _calculateHoldingsBonus(address player) internal view returns (uint256) {
        uint256 balance = vmfToken.balanceOf(player);
        if (balance < HOLDINGS_UNIT) return 0;
        
        uint256 units = balance / HOLDINGS_UNIT;
        return units * HOLDINGS_TOPPINGS;
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
        
        // Jackpot = total claimed toppings × 1 VMF
        uint256 jackpot = week.totalClaimedToppings * TOPPING_TO_VMF;
        
        // Pull from treasury
        vmfToken.safeTransferFrom(treasuryWallet, address(this), jackpot);
        
        // Select winners weighted by claimed toppings
        uint256 winnerCount = week.claimers.length < WEEKLY_WINNERS ? week.claimers.length : WEEKLY_WINNERS;
        address[] memory winners = _selectWeightedWinners(week.claimers, weekId, winnerCount);
        
        // Pay winners equally
        uint256 payoutEach = jackpot / winnerCount;
        uint256 remainder = jackpot - (payoutEach * winnerCount);
        
        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 payout = payoutEach;
            if (i == 0 && remainder > 0) {
                payout += remainder; // First winner gets dust
            }
            vmfToken.safeTransfer(winners[i], payout);
        }
        
        week.winners = winners;
        week.potAmount = jackpot;
        week.settled = true;
        
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
    
    function _generateCode(address player) internal view returns (string memory) {
        // Deterministic hash based on player address + contract address
        // Ensures each player always gets the same unique code
        bytes32 h = keccak256(abi.encodePacked(player, address(this)));
        
        bytes memory alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 34 chars (no I/O for clarity)
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
        
        // Lazy registration: register code on first use
        if (bytes(playerReferralCode[referrer]).length == 0) {
            playerReferralCode[referrer] = code;
            codeToPlayer[code] = referrer;
            emit ReferralCodeCreated(referrer, code);
        }
        
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
        uint256 jackpot = week.totalClaimedToppings * TOPPING_TO_VMF;
        
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
    
    function setTreasuryWallet(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasuryWallet = _treasury;
    }
    
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = vmfToken.balanceOf(address(this));
        vmfToken.safeTransfer(owner(), balance);
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
