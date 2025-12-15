#!/usr/bin/env node

/**
 * Settle Bot for Daily & Weekly Games
 *
 * Time-based settlement at 12:00 PM PST:
 * - Daily: Settles every day at 12:00 PM PST
 * - Weekly: Settles only on Mondays at 12:00 PM PST
 * - On Mondays: Both daily AND weekly games are settled
 *
 * Polls every 30 seconds to check if it's settlement time.
 *
 * Requires: PRIVATE_KEY in .env (use a dedicated bot wallet)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load environment - check both local .env and parent project's .env
require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// =============================================================================
// CONFIGURATION - Update these for your project
// =============================================================================

const CONTRACT_ADDRESS = process.env.GAME_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS;
const RPC_URL = process.env.RPC_URL || process.env.RPC_BASE;
const PRIVATE_KEY = process.env.BOT_WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY; // Bot wallet private key

// Polling interval in milliseconds (30 seconds)
const POLL_INTERVAL = 30 * 1000;

// Settlement time: 12:00 PM PST (with 30 second window to catch it)
const SETTLE_HOUR = 12;
const SETTLE_MINUTE = 0;
const SETTLE_SECOND_START = 0;
const SETTLE_SECOND_END = 30;

// =============================================================================
// CONTRACT ABI - Update these function signatures for your contract
// =============================================================================

const contractAbi = [
  // Game ID getters
  "function dailyGameId() view returns (uint256)",
  "function weeklyGameId() view returns (uint256)",

  // Game state checkers
  "function isDailyGameReady() view returns (bool)",
  "function isWeeklyGameReady() view returns (bool)",

  // Get player count for daily game
  "function getDailyGamePlayers(uint256 gameId) view returns (address[])",

  // Settlement functions (no parameters - settles current game)
  "function settleDailyGame() external",
  "function settleWeeklyGame() external",

  // Events
  "event DailyGameSettled(uint256 indexed gameId, address[] winners, uint256 pot)",
  "event WeeklyGameSettled(uint256 indexed weekId, address[] winners, uint256 pot)"
];

// =============================================================================
// VALIDATION
// =============================================================================

if (!CONTRACT_ADDRESS || !RPC_URL || !PRIVATE_KEY) {
  console.error('Missing required environment variables:');
  if (!CONTRACT_ADDRESS) console.error('  - GAME_CONTRACT_ADDRESS or CONTRACT_ADDRESS');
  if (!RPC_URL) console.error('  - RPC_URL or RPC_BASE');
  if (!PRIVATE_KEY) console.error('  - PRIVATE_KEY');
  process.exit(1);
}

// =============================================================================
// LOGGING SETUP
// =============================================================================

const LOGS_DIR = path.join(__dirname, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// =============================================================================
// SETTLE BOT CLASS
// =============================================================================

class SettleBot {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.wallet = new ethers.Wallet(PRIVATE_KEY, this.provider);
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, this.wallet);
    this.isRunning = false;

    // Track which date we last settled to avoid duplicate settlements
    this.lastDailySettleDate = null;
    this.lastWeeklySettleDate = null;

    this.log(`Settle Bot initialized`);
    this.log(`  Wallet: ${this.wallet.address}`);
    this.log(`  Contract: ${CONTRACT_ADDRESS}`);
    this.log(`  Poll Interval: ${POLL_INTERVAL / 1000}s`);
    this.log(`  Settlement Time: ${SETTLE_HOUR}:${String(SETTLE_MINUTE).padStart(2, '0')} PST`);
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);

    // Also log to file
    const logFile = path.join(LOGS_DIR, 'settle-bot.log');
    fs.appendFileSync(logFile, logMessage + '\n');
  }

  // ---------------------------------------------------------------------------
  // TIME CHECKING
  // ---------------------------------------------------------------------------

  checkTime() {
    const now = new Date();
    const pstTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));

    const hour = pstTime.getHours();
    const minute = pstTime.getMinutes();
    const second = pstTime.getSeconds();
    const dayOfWeek = pstTime.getDay(); // 0 = Sunday, 1 = Monday

    // Check if it's within the settlement window (12:00:00 - 12:00:30 PST)
    const isSettleTime = hour === SETTLE_HOUR &&
                         minute === SETTLE_MINUTE &&
                         second >= SETTLE_SECOND_START &&
                         second <= SETTLE_SECOND_END;

    const isMonday = dayOfWeek === 1;

    // Get today's date string for tracking (YYYY-MM-DD in PST)
    const dateStr = pstTime.toISOString().split('T')[0];

    return { isSettleTime, isMonday, pstTime, dateStr };
  }

  // ---------------------------------------------------------------------------
  // DAILY GAME SETTLEMENT
  // ---------------------------------------------------------------------------

  async settleDaily() {
    try {
      const dailyId = await this.contract.dailyGameId();
      this.log(`Checking daily game ${dailyId}...`);

      // Check if game is ready to settle
      const isReady = await this.contract.isDailyGameReady();

      if (!isReady) {
        this.log(`Daily game ${dailyId} not ready (either not ended or already settled)`);
        return { success: false, reason: 'not_ready', gameId: dailyId.toString() };
      }

      // Check if there are participants
      const players = await this.contract.getDailyGamePlayers(dailyId);
      const playerCount = players.length;
      if (playerCount === 0) {
        this.log(`Daily game ${dailyId} has no participants - will settle to advance to next game`, 'WARN');
      } else {
        this.log(`Settling daily game ${dailyId} with ${playerCount} players...`);
      }

      // Estimate gas
      const gasEstimate = await this.contract.settleDailyGame.estimateGas();
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice;

      this.log(`Gas estimate: ${gasEstimate.toString()}, Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

      // Execute transaction
      const tx = await this.contract.settleDailyGame({
        gasLimit: gasEstimate * 120n / 100n, // 20% buffer
        gasPrice: gasPrice * 110n / 100n // 10% buffer
      });

      this.log(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        this.log(`Daily game ${dailyId} settled successfully! Gas used: ${receipt.gasUsed.toString()}`, 'SUCCESS');

        // Parse events to get pot info
        const settleEvent = receipt.logs.find(log => {
          try {
            const parsed = this.contract.interface.parseLog(log);
            return parsed.name === 'DailyGameSettled';
          } catch {
            return false;
          }
        });

        if (settleEvent) {
          const parsed = this.contract.interface.parseLog(settleEvent);
          const pot = ethers.formatEther(parsed.args.pot);
          const winnersCount = parsed.args.winners.length;
          this.log(`Pot: ${pot} PIZZA, Winners: ${winnersCount}`, 'SUCCESS');
        }

        return { success: true, txHash: tx.hash, gasUsed: receipt.gasUsed.toString(), gameId: dailyId.toString() };
      } else {
        this.log(`Transaction failed`, 'ERROR');
        return { success: false, reason: 'transaction_failed', gameId: dailyId.toString() };
      }

    } catch (e) {
      this.log(`Daily settle failed: ${e.message}`, 'ERROR');
      return { success: false, error: e.message };
    }
  }

  // ---------------------------------------------------------------------------
  // WEEKLY GAME SETTLEMENT
  // ---------------------------------------------------------------------------

  async settleWeekly() {
    try {
      const weeklyId = await this.contract.weeklyGameId();
      this.log(`Checking weekly game ${weeklyId}...`);

      // Check if game is ready to settle
      const isReady = await this.contract.isWeeklyGameReady();

      if (!isReady) {
        this.log(`Weekly game ${weeklyId} not ready (claim window not closed or already settled)`);
        return { success: false, reason: 'not_ready', gameId: weeklyId.toString() };
      }

      this.log(`Settling weekly game ${weeklyId}...`);

      // Estimate gas
      const gasEstimate = await this.contract.settleWeeklyGame.estimateGas();
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice;

      this.log(`Gas estimate: ${gasEstimate.toString()}, Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

      // Execute transaction
      const tx = await this.contract.settleWeeklyGame({
        gasLimit: gasEstimate * 120n / 100n, // 20% buffer
        gasPrice: gasPrice * 110n / 100n // 10% buffer
      });

      this.log(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        this.log(`Weekly game ${weeklyId} settled successfully! Gas used: ${receipt.gasUsed.toString()}`, 'SUCCESS');

        // Parse events to get pot info
        const settleEvent = receipt.logs.find(log => {
          try {
            const parsed = this.contract.interface.parseLog(log);
            return parsed.name === 'WeeklyGameSettled';
          } catch {
            return false;
          }
        });

        if (settleEvent) {
          const parsed = this.contract.interface.parseLog(settleEvent);
          const pot = ethers.formatEther(parsed.args.pot);
          const winnersCount = parsed.args.winners.length;
          this.log(`Pot: ${pot} PIZZA, Winners: ${winnersCount}`, 'SUCCESS');
        }

        return { success: true, txHash: tx.hash, gasUsed: receipt.gasUsed.toString(), gameId: weeklyId.toString() };
      } else {
        this.log(`Transaction failed`, 'ERROR');
        return { success: false, reason: 'transaction_failed', gameId: weeklyId.toString() };
      }

    } catch (e) {
      this.log(`Weekly settle failed: ${e.message}`, 'ERROR');
      return { success: false, error: e.message };
    }
  }

  // ---------------------------------------------------------------------------
  // MAIN POLLING LOOP
  // ---------------------------------------------------------------------------

  async poll() {
    const { isSettleTime, isMonday, pstTime, dateStr } = this.checkTime();

    // Not settlement time - just log occasionally
    if (!isSettleTime) {
      return { action: 'waiting', pstTime: pstTime.toISOString() };
    }

    this.log(`Settlement time detected! PST: ${pstTime.toLocaleTimeString()}, Monday: ${isMonday}`);

    const results = {
      timestamp: new Date().toISOString(),
      date: dateStr,
      daily: null,
      weekly: null
    };

    // DAILY: Settle every day (if not already settled today)
    if (this.lastDailySettleDate !== dateStr) {
      this.log(`Executing daily settlement for ${dateStr}...`);
      results.daily = await this.settleDaily();

      if (results.daily.success || results.daily.reason === 'already_settled') {
        this.lastDailySettleDate = dateStr;
      }
    } else {
      this.log(`Daily already settled today (${dateStr})`);
    }

    // WEEKLY: Only settle on Mondays (if not already settled this Monday)
    if (isMonday && this.lastWeeklySettleDate !== dateStr) {
      this.log(`Monday detected - executing weekly settlement for ${dateStr}...`);
      results.weekly = await this.settleWeekly();

      if (results.weekly.success || results.weekly.reason === 'already_settled') {
        this.lastWeeklySettleDate = dateStr;
      }
    } else if (isMonday) {
      this.log(`Weekly already settled this Monday (${dateStr})`);
    }

    // Save results
    if (results.daily || results.weekly) {
      this.saveResult(results);
    }

    return results;
  }

  saveResult(result) {
    const resultFile = path.join(LOGS_DIR, 'settle-bot-results.json');
    let results = [];

    try {
      if (fs.existsSync(resultFile)) {
        results = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      }
    } catch (e) {
      // Start fresh if file is corrupted
      results = [];
    }

    results.push(result);

    // Keep only last 100 results
    if (results.length > 100) {
      results.splice(0, results.length - 100);
    }

    const replacer = (_key, value) => (typeof value === 'bigint' ? value.toString() : value);
    fs.writeFileSync(resultFile, JSON.stringify(results, replacer, 2));
  }

  async start() {
    if (this.isRunning) {
      this.log('Bot is already running', 'WARN');
      return;
    }

    this.isRunning = true;
    this.log('Starting settle bot...');
    this.log(`Waiting for 12:00 PM PST to trigger settlements`);
    this.log(`  - Daily: Every day at 12:00 PM PST`);
    this.log(`  - Weekly: Mondays at 12:00 PM PST`);

    // Initial poll
    await this.poll();

    // Set up interval (every 30 seconds)
    this.pollInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.poll();
      }
    }, POLL_INTERVAL);

    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  stop() {
    this.log('Stopping settle bot...');
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    process.exit(0);
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  const bot = new SettleBot();
  await bot.start();
}

if (require.main === module) {
  main().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
  });
}

module.exports = { SettleBot };
