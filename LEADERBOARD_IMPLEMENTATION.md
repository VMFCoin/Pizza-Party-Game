# Leaderboard Implementation - Locked Configuration

## Critical ABI Configuration

**DO NOT MODIFY** the following ABI structures in `app/lib/constants/index.tsx`:

### dailyGames Mapping
```typescript
{
  type: 'function',
  name: 'dailyGames',
  stateMutability: 'view',
  inputs: [{ type: 'uint256', name: 'gameId' }],
  outputs: [{
    type: 'tuple',
    components: [
      { type: 'uint256', name: 'startTime' },
      { type: 'uint256', name: 'endTime' },
      { type: 'address', name: 'firstPlayer' },
      { type: 'uint256', name: 'potAmount' },  // INDEX 3
      { type: 'bool', name: 'settled' }
    ]
  }]
}
```

### weeklyGames Mapping
```typescript
{
  type: 'function',
  name: 'weeklyGames',
  stateMutability: 'view',
  inputs: [{ type: 'uint256', name: 'weekId' }],
  outputs: [{
    type: 'tuple',
    components: [
      { type: 'uint256', name: 'claimWindowStart' },
      { type: 'uint256', name: 'claimWindowEnd' },
      { type: 'uint256', name: 'totalClaimedToppings' },
      { type: 'uint256', name: 'potAmount' },  // INDEX 3
      { type: 'bool', name: 'settled' }
    ]
  }]
}
```

## Key Implementation Details

### Contract Address
- **Address**: `0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7`
- **Chain**: Base (8453)

### Data Structure
The contract's public mappings return **simple tuples WITHOUT player/winner arrays**:
- Daily: `[startTime, endTime, firstPlayer, potAmount, settled]`
- Weekly: `[claimWindowStart, claimWindowEnd, totalClaimedToppings, potAmount, settled]`

### Important Notes
1. **potAmount is at index 3**, not index 5
2. The ABI must use `type: 'tuple'` wrapping for wagmi to decode correctly as objects
3. Wagmi returns these as objects with named properties (e.g., `gameData.potAmount`)
4. Only settled games should display non-zero pot amounts

### Pot Amount Extraction (LeaderboardPage.tsx)
```typescript
const dailyPotAmount = (() => {
  if (!dailyGameDataRaw) return 0n

  const gameData = dailyGameDataRaw as {
    startTime: bigint
    endTime: bigint
    firstPlayer: string
    potAmount: bigint
    settled: boolean
  }

  if (!gameData.settled) return 0n
  return gameData.potAmount || 0n
})()
```

### Game Fetching Logic
- Always fetch **previous game ID** (currentId - 1) when currentId > 1
- Daily: Show winners from the last settled daily game
- Weekly: Show winners from the last settled weekly game

## Farcaster Profile Integration

### API Configuration
- **Provider**: Neynar API v2
- **Endpoint**: `https://api.neynar.com/v2/farcaster/user/bulk-by-address`
- **Rate Limit**: ~10 requests/minute (free tier)
- **Batch Size**: 50 addresses per request
- **Delay**: 500ms between batches

### Cache Strategy
- **Duration**: 5 minutes
- **Storage**: In-memory Map with timestamps
- **Key**: Lowercase wallet address

### Profile Enrichment Flow
1. Fetch winner addresses from contract
2. Check cache for existing profiles
3. Batch fetch uncached addresses from Neynar
4. Merge profiles with winner data
5. Display with fallback to wallet address

## Troubleshooting

### If pot amounts show 0:
1. Check that you're fetching a **settled game** (gameId - 1)
2. Verify ABI matches the structure above (tuple with 5 components)
3. Ensure `potAmount` is at index 3 in the tuple

### If profiles don't load:
1. Check Neynar rate limit (429 errors)
2. Wait 1-2 minutes and refresh
3. Check NEXT_PUBLIC_NEYNAR_API_KEY is set
4. Verify cache is working (check browser memory)

### If data is null:
1. Check contract address is correct
2. Verify Base network is being used (chainId: 8453)
3. Check RPC connection in wagmiConfig

## Version History
- **Last Updated**: 2025-01-29
- **Working Commit**: Current (pot amounts and profiles displaying correctly)
- **Contract Version**: PizzaParty at 0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7
