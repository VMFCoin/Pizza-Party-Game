// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PizzaParty
 * @dev Unified game contract with daily and weekly draws using topping-based tickets
 * 
 * Key Features:
 * - Daily game: Pay $1 worth of VMF to enter, earn 1 topping, get 1 entry
 * - Weekly game: Weighted by toppings (more toppings = more chances)
 * - Automatic settlement when entering next day/week
 * - Referral system: Inviter gets 2 toppings, invitee gets 1 topping (3 per week limit)
 * - Holdings bonus (1000 VMF = 3 weekly tickets, once per week)
 */

// Uniswap V3 Pool Interface
interface IUniswapV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    );
}

contract PizzaParty is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // ============ State Variables ============
    
    IERC20 public immutable vmfToken;
    address public immutable usdcToken;
    
    // V3 Pool configuration
    IUniswapV3Pool public v3Pool;
    bool public isVMFToken0; // Cache token ordering
    
    // Game IDs
    uint256 public dailyGameId = 1;
    uint256 public weeklyGameId = 1;
    
    // Jackpots
    uint256 public currentDailyJackpot;
    
    // Game structure
    struct Game {
        uint256 gameId;
        uint256 startTime;
        uint256 endTime;
        uint256 totalEntries;
        uint256 jackpotAmount;
        address[] winners;
        bool isCompleted;
    }
    
    // Player structure
    struct Player {
        uint256 totalToppings;
        uint256 dailyEntries;
        uint256 lastEntryTime;
    }
    
    // Referral structure
    struct Referral {
        string referralCode;
        address referrer;
        uint256 totalReferrals;
        uint256 lifetimeReferrals;
        bool isActive;
    }
    
    // ============ Mappings ============
    
    mapping(uint256 => Game) public dailyGames;
    mapping(uint256 => Game) public weeklyGames;
    mapping(address => Player) public players;
    mapping(uint256 => mapping(address => bool)) public dailyPlayers;
    mapping(uint256 => address[]) public dailyEntrants;
    mapping(uint256 => mapping(address => uint256)) public weeklyTickets;
    mapping(uint256 => address[]) public weeklyParticipants;
    mapping(uint256 => uint256) public weeklyTotalTickets;
    mapping(address => Referral) public referrals;
    mapping(string => address) public referralCodeToAddress;
    mapping(address => address) public inviteeToInviter;
    mapping(address => bool) public hasUsedReferral;
    mapping(uint256 => mapping(address => uint256)) public weeklyInviteCount;
    uint256 public constant MAX_INVITES_PER_WEEK = 3;
    mapping(address => uint256) public lastHoldingsClaimWeek;
    
    // Holdings bonus
    uint256 public constant HOLDINGS_UNIT = 1000e18;
    uint256 public constant HOLDINGS_TICKETS = 3;
    
    // Weekly treasury funding
    address public weeklyTreasuryWallet;
    bool public weeklyAutoFundingEnabled;
    
    // Price configuration
    uint256 public constant TARGET_ENTRY_FEE_USD = 1e18; // $1 in 18 decimals
    uint256 public constant TOPPING_TO_VMF_RATE = 10e18; // 1 topping = 10 VMF
    
    // Configuration
    uint256 public DAILY_WINNERS_COUNT = 8;
    uint256 public constant WEEKLY_WINNERS_COUNT = 10;
    
    // ============ Events ============
    
    event DailyGameEntered(uint256 indexed gameId, address indexed player, uint256 toppings, uint256 amountPaid);
    event DailyWinnersSelected(uint256 indexed gameId, address[] winners, uint256 jackpot);
    event WeeklyWinnersSelected(uint256 indexed gameId, address[] winners, uint256 jackpot);
    event WeeklyTicketsAdded(uint256 indexed gameId, address indexed user, uint256 tickets, uint256 totalUserTickets);
    event ReferralCodeCreated(address indexed player, string referralCode);
    event ReferralUsed(uint256 indexed weekId, address indexed inviter, address indexed invitee, uint256 inviterToppings, uint256 inviteeToppings);
    event HoldingsClaimed(uint256 indexed weekId, address indexed user, uint256 balance, uint256 tickets);
    event NewDailyGame(uint256 indexed gameId, uint256 startTime, uint256 endTime);
    event NewWeeklyGame(uint256 indexed gameId, uint256 startTime, uint256 endTime);
    event WeeklyTreasuryFunded(uint256 indexed weekId, uint256 amount);
    event V3PoolUpdated(address indexed newPool);
    
    // ============ Constructor ============
    
    constructor(
        address _vmfToken,
        address _usdcToken,
        address _v3Pool
    ) Ownable(msg.sender) {
        require(_vmfToken != address(0), "Invalid VMF token");
        require(_usdcToken != address(0), "Invalid USDC");
        require(_v3Pool != address(0), "Invalid V3 pool");
        
        vmfToken = IERC20(_vmfToken);
        usdcToken = _usdcToken;
        v3Pool = IUniswapV3Pool(_v3Pool);
        
        // Validate pool tokens and cache ordering
        address token0 = v3Pool.token0();
        address token1 = v3Pool.token1();
        
        if (token0 == _vmfToken && token1 == _usdcToken) {
            isVMFToken0 = true;
        } else if (token1 == _vmfToken && token0 == _usdcToken) {
            isVMFToken0 = false;
        } else {
            revert("Invalid pool tokens");
        }
        
        // Initialize first games
        _createNewDailyGame(dailyGameId);
        _createNewWeeklyGame(weeklyGameId);
    }
    
    // ============ Price Functions ============
    
    /**
     * @dev Get current entry fee in VMF (calculated from V3 pool)
     */
    function getEntryFee() public view returns (uint256) {
        return _calculateEntryFee();
    }
    
    /**
     * @dev Calculate entry fee based on current VMF price from V3 pool
     * Returns: VMF needed for $1 USD entry
     */
    function _calculateEntryFee() internal view returns (uint256) {
        uint256 vmfPriceUSD = _getVMFPriceFromV3();
        require(vmfPriceUSD > 0, "Invalid VMF price");
        
        // Calculate: $1 / price per VMF
        // Both are in 18 decimals, so: (1e18 * 1e18) / price
        return (TARGET_ENTRY_FEE_USD * 1e18) / vmfPriceUSD;
    }
    
    /**
     * @dev Get VMF price from Uniswap V3 pool
     * Returns price in 18 decimals (USD per VMF)
     * 
     * Since USDC = $1, we just need the USDC/VMF ratio
     * Uniswap V3: sqrtPriceX96 = sqrt(token1/token0) * 2^96
     * 
     * Example with sqrtPriceX96 = 7900005959680669484523:
     * 1. Square: 62,410,094,103,451,780,143,733,729,617,529
     * 2. Multiply by 1e12: for USDC decimal adjustment (6 -> 18 decimals)
     * 3. Divide by 2^192: to remove the Q96 fixed-point encoding
     * Result: 9,944,627,911,061,120 wei = $0.00994 per VMF
     */
    function _getVMFPriceFromV3() internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = v3Pool.slot0();
        require(sqrtPriceX96 > 0, "Invalid price");
        
        if (isVMFToken0) {
            // VMF is token0, USDC is token1
            // sqrtPriceX96 = sqrt(USDC/VMF) * 2^96
            
            // Step 1: Convert sqrtPriceX96 to actual sqrt(price) by dividing by 2^96
            // We scale by 1e18 to maintain precision
            uint256 sqrtPrice = (uint256(sqrtPriceX96) * 1e18) >> 96;
            
            // Step 2: Square it to get the price
            uint256 price = (sqrtPrice * sqrtPrice) / 1e18;
            
            // Step 3: Adjust for decimal difference (USDC 6 decimals -> 18 decimals)
            // price is USDC/VMF in native decimals, multiply by 1e12 to scale USDC to 18 decimals
            return price * 1e12;
            
        } else {
            // USDC is token0, VMF is token1
            // sqrtPriceX96 = sqrt(VMF/USDC) * 2^96
            // We need to invert to get USDC/VMF
            
            // Step 1: Get sqrt(price) by dividing by 2^96
            uint256 sqrtPrice = (uint256(sqrtPriceX96) * 1e18) >> 96;
            
            // Step 2: Square it to get VMF/USDC
            uint256 vmfPerUsdc = (sqrtPrice * sqrtPrice) / 1e18;
            
            // Step 3: Invert to get USDC/VMF
            require(vmfPerUsdc > 0, "Zero price");
            uint256 usdcPerVmf = (1e18 * 1e18) / vmfPerUsdc;
            
            // Step 4: Adjust decimals
            return usdcPerVmf * 1e12;
        }
    }
    
    /**
     * @dev Get current VMF price (view function for frontend)
     * Returns: USD price per VMF in 18 decimals
     */
    function getCurrentVMFPrice() public view returns (uint256) {
        return _getVMFPriceFromV3();
    }
    
    // ============ Referral System ============
    
    function createReferralCode() external {
        require(bytes(referrals[msg.sender].referralCode).length == 0, "Code already exists");
        
        string memory code = _generateReferralCode(msg.sender);
        require(referralCodeToAddress[code] == address(0), "Code collision");
        
        referrals[msg.sender] = Referral({
            referralCode: code,
            referrer: address(0),
            totalReferrals: 0,
            lifetimeReferrals: 0,
            isActive: true
        });
        
        referralCodeToAddress[code] = msg.sender;
        
        emit ReferralCodeCreated(msg.sender, code);
    }
    
    function _generateReferralCode(address player) internal view returns (string memory) {
        bytes32 h = keccak256(abi.encodePacked(player, block.chainid, block.timestamp, address(this)));
        bytes16 alphabet = "0123456789ABCDEF";
        bytes memory out = new bytes(8);
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = alphabet[uint8(h[i]) >> 4];
        }
        return string(abi.encodePacked("PZ", out));
    }
    
    // ============ Daily Game Functions ============
    
    function enterDailyGame(string memory referralCode) external nonReentrant {
        uint256 gameId = dailyGameId;
        Game storage currentGame = dailyGames[gameId];
        
        if (block.timestamp >= currentGame.endTime && !currentGame.isCompleted) {
            _settleDailyGame(gameId);
            gameId = dailyGameId;
            currentGame = dailyGames[gameId];
        }
        
        require(!currentGame.isCompleted, "Game completed");
        require(block.timestamp < currentGame.endTime, "Game ended");
        require(!dailyPlayers[gameId][msg.sender], "Already entered today");
        
        uint256 entryFee = getEntryFee();
        
        vmfToken.safeTransferFrom(msg.sender, address(this), entryFee);
        
        dailyPlayers[gameId][msg.sender] = true;
        dailyEntrants[gameId].push(msg.sender);
        currentGame.totalEntries++;
        currentDailyJackpot += entryFee;
        
        bool isFirstEntry = (players[msg.sender].dailyEntries == 0);
        
        players[msg.sender].dailyEntries++;
        players[msg.sender].totalToppings++;
        players[msg.sender].lastEntryTime = block.timestamp;
        
        _addWeeklyTickets(msg.sender, 1);
        
        if (isFirstEntry && bytes(referralCode).length > 0) {
            _processReferral(msg.sender, referralCode);
        }
        
        emit DailyGameEntered(gameId, msg.sender, 1, entryFee);
    }
    
    function enterDailyGameNoRef() external nonReentrant {
        uint256 gameId = dailyGameId;
        Game storage currentGame = dailyGames[gameId];
        
        if (block.timestamp >= currentGame.endTime && !currentGame.isCompleted) {
            _settleDailyGame(gameId);
            gameId = dailyGameId;
            currentGame = dailyGames[gameId];
        }
        
        require(!currentGame.isCompleted, "Game completed");
        require(block.timestamp < currentGame.endTime, "Game ended");
        require(!dailyPlayers[gameId][msg.sender], "Already entered today");
        
        uint256 entryFee = getEntryFee();
        
        vmfToken.safeTransferFrom(msg.sender, address(this), entryFee);
        
        dailyPlayers[gameId][msg.sender] = true;
        dailyEntrants[gameId].push(msg.sender);
        currentGame.totalEntries++;
        currentDailyJackpot += entryFee;
        
        players[msg.sender].dailyEntries++;
        players[msg.sender].totalToppings++;
        players[msg.sender].lastEntryTime = block.timestamp;
        
        _addWeeklyTickets(msg.sender, 1);
        
        emit DailyGameEntered(gameId, msg.sender, 1, entryFee);
    }
    
    function _processReferral(address invitee, string memory referralCode) internal {
        require(!hasUsedReferral[invitee], "Already used referral");
        require(referralCodeToAddress[referralCode] != address(0), "Invalid code");
        
        address inviter = referralCodeToAddress[referralCode];
        require(inviter != invitee, "Cannot invite yourself");
        
        uint256 weekId = weeklyGameId;
        require(weeklyInviteCount[weekId][inviter] < MAX_INVITES_PER_WEEK, "Invite limit reached");
        
        hasUsedReferral[invitee] = true;
        inviteeToInviter[invitee] = inviter;
        
        weeklyInviteCount[weekId][inviter]++;
        
        referrals[inviter].totalReferrals++;
        referrals[inviter].lifetimeReferrals++;
        
        players[inviter].totalToppings += 2;
        players[invitee].totalToppings += 1;
        
        _addWeeklyTickets(inviter, 2);
        _addWeeklyTickets(invitee, 1);
        
        emit ReferralUsed(weekId, inviter, invitee, 2, 1);
    }
    
    function settleDailyGame() external nonReentrant {
        uint256 gameId = dailyGameId;
        Game storage g = dailyGames[gameId];
        require(block.timestamp >= g.endTime, "Game not ended");
        require(!g.isCompleted, "Already completed");
        
        _settleDailyGame(gameId);
    }
    
    function _settleDailyGame(uint256 gameId) internal {
        Game storage g = dailyGames[gameId];
        address[] memory entrants = dailyEntrants[gameId];
        uint256 N = entrants.length;
        
        if (N == 0) {
            g.isCompleted = true;
            currentDailyJackpot = 0;
            emit DailyWinnersSelected(gameId, new address[](0), 0);
            dailyGameId++;
            _createNewDailyGame(dailyGameId);
            return;
        }
        
        uint256 winnerCount = N < DAILY_WINNERS_COUNT ? N : DAILY_WINNERS_COUNT;
        uint256 payoutEach = currentDailyJackpot / winnerCount;
        
        while (winnerCount > 1 && payoutEach == 0) {
            winnerCount--;
            payoutEach = currentDailyJackpot / winnerCount;
        }
        require(payoutEach > 0, "Payout too small");
        
        address[] memory winners = _selectRandomWinners(entrants, winnerCount, gameId);
        
        uint256 remainder = currentDailyJackpot - (payoutEach * winnerCount);
        
        g.winners = winners;
        g.isCompleted = true;
        g.jackpotAmount = currentDailyJackpot;
        
        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 payout = payoutEach;
            if (i == 0 && remainder > 0) {
                payout += remainder;
            }
            vmfToken.safeTransfer(winners[i], payout);
        }
        
        emit DailyWinnersSelected(gameId, winners, currentDailyJackpot);
        
        currentDailyJackpot = 0;
        dailyGameId++;
        _createNewDailyGame(dailyGameId);
    }
    
    // ============ Weekly Game Functions ============
    
    function settleWeeklyGame() external nonReentrant {
        uint256 gameId = weeklyGameId;
        Game storage g = weeklyGames[gameId];
        require(block.timestamp >= g.endTime, "Week not ended");
        require(!g.isCompleted, "Already completed");
        
        _settleWeeklyGame(gameId);
    }
    
    function _settleWeeklyGame(uint256 gameId) internal {
        Game storage g = weeklyGames[gameId];
        
        uint256 totalTickets = weeklyTotalTickets[gameId];
        address[] memory participants = weeklyParticipants[gameId];
        
        if (participants.length == 0 || totalTickets == 0) {
            g.isCompleted = true;
            emit WeeklyWinnersSelected(gameId, new address[](0), 0);
            weeklyGameId++;
            _createNewWeeklyGame(weeklyGameId);
            return;
        }
        
        uint256 jackpotAmount = totalTickets * TOPPING_TO_VMF_RATE;
        
        if (weeklyAutoFundingEnabled && weeklyTreasuryWallet != address(0) && jackpotAmount > 0) {
            vmfToken.safeTransferFrom(weeklyTreasuryWallet, address(this), jackpotAmount);
            emit WeeklyTreasuryFunded(gameId, jackpotAmount);
        }
        
        uint256 balance = vmfToken.balanceOf(address(this));
        uint256 jackpot = balance > currentDailyJackpot ? balance - currentDailyJackpot : 0;
        require(jackpot > 0, "No jackpot");
        
        uint256 winnerCount = participants.length < WEEKLY_WINNERS_COUNT ? 
            participants.length : WEEKLY_WINNERS_COUNT;
        
        address[] memory winners = _selectWeightedWinners(
            participants,
            gameId,
            winnerCount,
            totalTickets
        );
        
        uint256 payoutEach = jackpot / winnerCount;
        uint256 remainder = jackpot - (payoutEach * winnerCount);
        
        g.winners = winners;
        g.isCompleted = true;
        g.jackpotAmount = jackpot;
        
        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 payout = payoutEach;
            if (i == 0 && remainder > 0) {
                payout += remainder;
            }
            vmfToken.safeTransfer(winners[i], payout);
        }
        
        emit WeeklyWinnersSelected(gameId, winners, jackpot);
        
        weeklyGameId++;
        _createNewWeeklyGame(weeklyGameId);
    }
    
    // ============ Holdings Bonus ============
    
    function claimHoldings() external nonReentrant {
        uint256 weekId = weeklyGameId;
        require(lastHoldingsClaimWeek[msg.sender] != weekId, "Already claimed");
        
        uint256 balance = vmfToken.balanceOf(msg.sender);
        require(balance >= HOLDINGS_UNIT, "Below threshold");
        
        uint256 units = balance / HOLDINGS_UNIT;
        uint256 tickets = units * HOLDINGS_TICKETS;
        
        _addWeeklyTickets(msg.sender, tickets);
        lastHoldingsClaimWeek[msg.sender] = weekId;
        
        emit HoldingsClaimed(weekId, msg.sender, balance, tickets);
    }
    
    // ============ Internal Helper Functions ============
    
    function _addWeeklyTickets(address user, uint256 tickets) internal {
        uint256 weekId = weeklyGameId;
        require(!weeklyGames[weekId].isCompleted, "Week completed");
        
        if (weeklyTickets[weekId][user] == 0) {
            weeklyParticipants[weekId].push(user);
        }
        
        weeklyTickets[weekId][user] += tickets;
        weeklyTotalTickets[weekId] += tickets;
        
        emit WeeklyTicketsAdded(weekId, user, tickets, weeklyTickets[weekId][user]);
    }
    
    function _createNewDailyGame(uint256 gameId) internal {
        uint256 endTime = _nextNoonPT(block.timestamp);
        uint256 startTime = endTime - 1 days;
        
        dailyGames[gameId] = Game({
            gameId: gameId,
            startTime: startTime,
            endTime: endTime,
            totalEntries: 0,
            jackpotAmount: 0,
            winners: new address[](0),
            isCompleted: false
        });
        
        emit NewDailyGame(gameId, startTime, endTime);
    }
    
    function _createNewWeeklyGame(uint256 gameId) internal {
        uint256 endTime = _nextMondayNoonPT(block.timestamp);
        uint256 startTime = endTime - 7 days;
        
        weeklyGames[gameId] = Game({
            gameId: gameId,
            startTime: startTime,
            endTime: endTime,
            totalEntries: 0,
            jackpotAmount: 0,
            winners: new address[](0),
            isCompleted: false
        });
        
        emit NewWeeklyGame(gameId, startTime, endTime);
    }
    
    function _selectRandomWinners(
        address[] memory candidates,
        uint256 count,
        uint256 gameId
    ) internal view returns (address[] memory) {
        uint256 n = candidates.length;
        address[] memory winners = new address[](count);
        bool[] memory selected = new bool[](n);
        
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            gameId,
            currentDailyJackpot
        )));
        
        uint256 picked = 0;
        while (picked < count) {
            seed = uint256(keccak256(abi.encodePacked(seed, picked)));
            uint256 idx = seed % n;
            
            if (!selected[idx]) {
                selected[idx] = true;
                winners[picked] = candidates[idx];
                picked++;
            }
        }
        
        return winners;
    }
    
    function _selectWeightedWinners(
        address[] memory participants,
        uint256 weekId,
        uint256 count,
        uint256 totalTickets
    ) internal view returns (address[] memory) {
        uint256 n = participants.length;
        address[] memory winners = new address[](count);
        bool[] memory selected = new bool[](n);

        uint256[] memory prefixSums = _buildPrefixSums(participants, weekId, n);

        _selectWinnersWithPrefixSums(
            winners,
            selected,
            participants,
            prefixSums,
            weekId,
            count,
            totalTickets,
            n
        );

        return winners;
    }

    function _buildPrefixSums(
        address[] memory participants,
        uint256 weekId,
        uint256 n
    ) internal view returns (uint256[] memory) {
        uint256[] memory prefixSums = new uint256[](n);
        uint256 sum = 0;
        for (uint256 i = 0; i < n; i++) {
            sum += weeklyTickets[weekId][participants[i]];
            prefixSums[i] = sum;
        }
        return prefixSums;
    }

    function _selectWinnersWithPrefixSums(
        address[] memory winners,
        bool[] memory selected,
        address[] memory participants,
        uint256[] memory prefixSums,
        uint256 weekId,
        uint256 count,
        uint256 totalTickets,
        uint256 n
    ) internal view {
        bytes32 seed = keccak256(abi.encodePacked(
            block.prevrandao,
            blockhash(block.number - 1),
            weekId,
            totalTickets
        ));

        uint256 picked = 0;
        uint256 attempts = 0;
        uint256 maxAttempts = count * 3;

        while (picked < count && attempts < maxAttempts) {
            uint256 draw = uint256(keccak256(abi.encodePacked(seed, attempts))) % totalTickets;
            uint256 idx = _binarySearch(prefixSums, draw, n);

            if (!selected[idx]) {
                selected[idx] = true;
                winners[picked] = participants[idx];
                picked++;
            }
            attempts++;
        }
    }

    function _binarySearch(
        uint256[] memory prefixSums,
        uint256 target,
        uint256 n
    ) internal pure returns (uint256) {
        uint256 lo = 0;
        uint256 hi = n;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (target < prefixSums[mid]) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo < n ? lo : n - 1;
    }
    
    function _nextNoonPT(uint256 timestamp) internal pure returns (uint256) {
        uint256 PT_OFFSET = 8 hours;
        uint256 TARGET_HOUR = 12;
        
        uint256 utcTarget = (TARGET_HOUR + PT_OFFSET) % 24;
        uint256 dayStart = (timestamp / 1 days) * 1 days;
        uint256 todayTarget = dayStart + (utcTarget * 1 hours);
        
        if (timestamp >= todayTarget) {
            return todayTarget + 1 days;
        }
        return todayTarget;
    }
    
    function _nextMondayNoonPT(uint256 timestamp) internal pure returns (uint256) {
        uint256 THURSDAY_EPOCH = 4 days;
        uint256 PT_OFFSET = 8 hours;
        uint256 TARGET_HOUR = 12;
        
        uint256 daysSinceEpoch = (timestamp + THURSDAY_EPOCH) / 1 days;
        uint256 currentDayOfWeek = daysSinceEpoch % 7;
        uint256 daysUntilMonday = (7 - currentDayOfWeek) % 7;
        
        if (daysUntilMonday == 0) {
            uint256 todayNoonPT = (timestamp / 1 days) * 1 days + ((TARGET_HOUR + PT_OFFSET) % 24) * 1 hours;
            if (timestamp >= todayNoonPT) {
                daysUntilMonday = 7;
            }
        }
        
        uint256 nextMondayMidnight = ((timestamp / 1 days) + daysUntilMonday) * 1 days;
        return nextMondayMidnight + ((TARGET_HOUR + PT_OFFSET) % 24) * 1 hours;
    }
    
    // ============ View Functions ============
    
    function getCurrentDailyGame() external view returns (Game memory) {
        return dailyGames[dailyGameId];
    }
    
    function getCurrentWeeklyGame() external view returns (Game memory) {
        return weeklyGames[weeklyGameId];
    }
    
    function getDailyGame(uint256 gameId) external view returns (Game memory) {
        return dailyGames[gameId];
    }
    
    function getWeeklyGame(uint256 gameId) external view returns (Game memory) {
        return weeklyGames[gameId];
    }
    
    function getPlayerInfo(address player) external view returns (Player memory) {
        return players[player];
    }
    
    function getReferralInfo(address player) external view returns (Referral memory) {
        return referrals[player];
    }
    
    function hasEnteredToday(address player) external view returns (bool) {
        return dailyPlayers[dailyGameId][player];
    }
    
    function getDailyJackpot() external view returns (uint256) {
        return currentDailyJackpot;
    }
    
    function getWeeklyJackpot() external view returns (uint256) {
        return weeklyTotalTickets[weeklyGameId] * TOPPING_TO_VMF_RATE;
    }
    
    function getWeeklyTickets(address user) external view returns (uint256) {
        return weeklyTickets[weeklyGameId][user];
    }
    
    function getWeeklyInviteCount(address inviter) external view returns (uint256) {
        return weeklyInviteCount[weeklyGameId][inviter];
    }
    
    function isDailyDrawReady() external view returns (bool) {
        Game storage g = dailyGames[dailyGameId];
        return block.timestamp >= g.endTime && !g.isCompleted;
    }
    
    function isWeeklyDrawReady() external view returns (bool) {
        Game storage g = weeklyGames[weeklyGameId];
        return block.timestamp >= g.endTime && !g.isCompleted;
    }
    
    function previewHoldingsTickets(address user) external view returns (uint256 tickets) {
        uint256 balance = vmfToken.balanceOf(user);
        if (balance >= HOLDINGS_UNIT) {
            tickets = (balance / HOLDINGS_UNIT) * HOLDINGS_TICKETS;
        }
    }
    
    // ============ Admin Functions ============
    
    function setV3Pool(address _v3Pool) external onlyOwner {
        require(_v3Pool != address(0), "Invalid pool");
        
        IUniswapV3Pool pool = IUniswapV3Pool(_v3Pool);
        address token0 = pool.token0();
        address token1 = pool.token1();
        
        if (token0 == address(vmfToken) && token1 == usdcToken) {
            isVMFToken0 = true;
        } else if (token1 == address(vmfToken) && token0 == usdcToken) {
            isVMFToken0 = false;
        } else {
            revert("Invalid pool tokens");
        }
        
        v3Pool = pool;
        emit V3PoolUpdated(_v3Pool);
    }
    
    function setDailyWinnersCount(uint256 count) external onlyOwner {
        require(count >= 1 && count <= 32, "Invalid count");
        DAILY_WINNERS_COUNT = count;
    }
    
    function configureWeeklyFunding(address treasury, bool enabled) external onlyOwner {
        require(treasury != address(0), "Invalid treasury");
        weeklyTreasuryWallet = treasury;
        weeklyAutoFundingEnabled = enabled;
    }
    
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = vmfToken.balanceOf(address(this));
        vmfToken.safeTransfer(owner(), balance);
    }
}