# Settle Bot for Daily & Weekly Games

Automated settlement bot that triggers at 12:00 PM PST:
- **Daily**: Settles every day at 12:00 PM PST
- **Weekly**: Settles only on Mondays at 12:00 PM PST
- **Mondays**: Both daily AND weekly games are settled

Polls every 30 seconds to check if it's settlement time.

## Quick Start

1. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the bot:
   ```bash
   npm start
   ```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GAME_CONTRACT_ADDRESS` | Your game contract address |
| `RPC_URL` | RPC endpoint (use a private RPC like Alchemy/QuickNode) |
| `PRIVATE_KEY` | Bot wallet private key (gas costs <$0.01 per settlement on Base) |

### Contract ABI

Update the `contractAbi` array in `settle-bot.cjs` to match your contract's function signatures:

```javascript
const contractAbi = [
  // Game ID getters
  "function dailyGameId() view returns (uint256)",
  "function weeklyGameId() view returns (uint256)",

  // Game state - adjust return values to match your struct
  "function games(uint256 gameId) view returns (uint256 gameId_, uint256 startTime, uint256 endTime, uint256 totalEntries, uint256 jackpotAmount, bool isSettled)",

  // Settlement functions - rename if yours are different (e.g., finalize vs settle)
  "function settleDaily(uint256 gameId) external",
  "function settleWeekly(uint256 gameId) external",

  // Events - update names to match your contract
  "event DailySettled(uint256 indexed gameId, ...)",
  "event WeeklySettled(uint256 indexed gameId, ...)"
];
```

## Running with PM2 (Production)

1. Update `cwd` path in `settle-bot.pm2.json` to your project directory

2. Start with PM2:
   ```bash
   npm run pm2:start
   ```

3. Monitor:
   ```bash
   npm run pm2:logs
   npm run pm2:status
   ```

## Bot Behavior

### Schedule
- Polls every **30 seconds** to check the time
- Triggers at **12:00:00 PM PST** (within a 30-second window)
- **Daily settlement**: Every day at 12:00 PM PST
- **Weekly settlement**: Only on Mondays at 12:00 PM PST
- **Mondays**: Both daily AND weekly games settle

### Safety Features
- Tracks last settlement date to prevent duplicate settlements
- Skips games that are already settled
- Skips daily games with no participants
- Logs all activity for debugging

## Customization

### Change Settlement Time

Edit the constants in `settle-bot.cjs`:
```javascript
const SETTLE_HOUR = 12;        // 12 = noon
const SETTLE_MINUTE = 0;       // 0 = on the hour
const SETTLE_SECOND_START = 0; // Start of trigger window
const SETTLE_SECOND_END = 30;  // End of trigger window
```

### Change Poll Interval

Edit `POLL_INTERVAL` in `settle-bot.cjs`:
```javascript
const POLL_INTERVAL = 30 * 1000; // 30 seconds
```

### Function Names

If your contract uses different function names (e.g., `finalize` instead of `settle`):

1. Update the ABI:
   ```javascript
   "function finalizeDaily(uint256 gameId) external",
   ```

2. Update the method calls in `settleDaily()` and `settleWeekly()`:
   ```javascript
   const tx = await this.contract.finalizeDaily(gameId, { ... });
   ```

### Game Struct

If your `games()` function returns different fields, update the destructuring:
```javascript
const [, , , , , isSettled] = game;
// Adjust indices based on your struct
```

## Logs

| File | Description |
|------|-------------|
| `logs/settle-bot.log` | All bot activity |
| `logs/settle-bot.err.log` | PM2 stderr |
| `logs/settle-bot.out.log` | PM2 stdout |
| `logs/settle-bot-results.json` | Settlement transaction history |

## Caller Reward

The bot wallet receives the 1% caller reward when it settles games. When the bot calls `settleDaily()` or `settleWeekly()`, the smart contract pays the 1% reward to `msg.sender` (the bot wallet).

This means the bot wallet (`0xBfCA21E41D397C8B6beF0c348D394DA2c4826292`) will accumulate rewards over time for settling games.

## Network

This bot is configured for **Base Mainnet**. Make sure to:
- Use a Base RPC endpoint (Alchemy, QuickNode, etc.)
- Fund the bot wallet with ETH on Base for gas

## Monitoring & Alerts

To receive notifications when settlements occur or fail, you can set up alerts to Farcaster:

**Farcaster Alert Setup (FID: 1013491)**

You can use a service like [Neynar](https://neynar.com) or a custom webhook to send direct casts when:
- A settlement succeeds
- A settlement fails
- The bot wallet is low on gas

Example integration point in `settle-bot.cjs` (add after successful settlement):
```javascript
// Send Farcaster notification via Neynar API
async function sendFarcasterAlert(message) {
  // POST to Neynar API to send a direct cast to FID 1013491
  // See: https://docs.neynar.com/reference/publish-cast
}
```

## Troubleshooting

### Bot not settling at 12:00 PM PST
- Check that your server's timezone is correct
- The bot uses `America/Los_Angeles` timezone for PST detection
- Check logs: `logs/settle-bot.log`

### "Missing required environment variables"
- Ensure `.env` file exists in the same directory as `settle-bot.cjs`
- Check all three variables are set: `GAME_CONTRACT_ADDRESS`, `RPC_URL`, `PRIVATE_KEY`

### "Transaction failed" or gas errors
- Ensure bot wallet has some Base ETH for gas (each settlement costs <$0.01)
- Check if RPC endpoint is rate-limiting (use a private RPC)
- Verify the contract address is correct

### "Already settled" every time
- This is normal if someone else (or the bot) already settled the game
- The bot tracks this to avoid duplicate attempts

### Game has no participants
- The bot skips daily games with 0 players
- This is logged as a warning, not an error

### PM2 keeps restarting
- Check error logs: `pm2 logs game-settle-bot --err`
- Common cause: missing `.env` file or invalid private key

### RPC connection errors
- Public RPC endpoints rate-limit bots
- Use a private RPC (Alchemy, QuickNode, Blast, etc.)
- Check your API key hasn't expired

## Security Notes

- Use a dedicated bot wallet with minimal funds
- Never commit your `.env` file
- Use a private RPC endpoint (public endpoints rate-limit bots)
- Bot wallet only needs Base ETH for gas (each settlement costs <$0.01)
