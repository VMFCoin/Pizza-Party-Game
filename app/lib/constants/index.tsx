// constants.ts
import type { Abi } from 'viem'

// ==============================
// Contract addresses (Base mainnet)
// ==============================
export const PIZZA_PARTY_ADDRESS = "0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7" // PizzaParty contract (latest deployment)
export const VMF_TOKEN_ADDRESS = "0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776" // Fixed checksum

// SushiSwap pair kept for legacy tooling (not used in minimal contract)
export const SUSHISWAP_VMF_USDC_PAIR = "0x9C83A203133B65982F35D1B00E8283C9fb518cb1"

// ==============================
// VMF Token ABI (ERC20)
// ==============================
export const VMF_TOKEN_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'spender' },
      { type: 'uint256', name: 'amount' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { type: 'address', name: 'owner' },
      { type: 'address', name: 'spender' }
    ],
    outputs: [{ type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'account' }],
    outputs: [{ type: 'uint256' }]
  }
] as const

// ==============================
// PizzaParty ABI (Dynamic Pricing Version)
// Entry fee adjusts based on VMF market price (frontend calculates amount for $1)
// ==============================
export const PIZZA_PARTY_ABI = [
  // --- Core Gameplay ---
  { type: 'function', name: 'enterDailyGame', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'amountPaid' }], outputs: [] },
  { type: 'function', name: 'useReferralCode', stateMutability: 'nonpayable', inputs: [{ type: 'string', name: 'code' }], outputs: [] },
  { type: 'function', name: 'settleDailyGame', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimToppings', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'settleWeeklyGame', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'createReferralCode', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'setTreasuryWallet', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: '_treasury' }], outputs: [] },
  { type: 'function', name: 'emergencyWithdraw', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'emergencySettleDaily', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'emergencySettleWeekly', stateMutability: 'nonpayable', inputs: [], outputs: [] },

  // --- View Functions ---
  { type: 'function', name: 'dailyGameId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'weeklyGameId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'currentDailyPot', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'treasuryWallet', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'getCurrentDailyGame',
    stateMutability: 'view',
    inputs: [],
    outputs: [{
      type: 'tuple',
      components: [
        { type: 'uint256', name: 'startTime' },
        { type: 'uint256', name: 'endTime' },
        { type: 'uint256', name: 'playerCount' },
        { type: 'uint256', name: 'pot' },
        { type: 'bool', name: 'settled' }
      ]
    }]
  },
  {
    type: 'function',
    name: 'getCurrentWeeklyGame',
    stateMutability: 'view',
    inputs: [],
    outputs: [{
      type: 'tuple',
      components: [
        { type: 'uint256', name: 'claimStart' },
        { type: 'uint256', name: 'claimEnd' },
        { type: 'uint256', name: 'totalToppings' },
        { type: 'uint256', name: 'claimerCount' },
        { type: 'uint256', name: 'projectedJackpot' },
        { type: 'bool', name: 'settled' }
      ]
    }]
  },
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
        { type: 'uint256', name: 'potAmount' },
        { type: 'bool', name: 'settled' }
      ]
    }]
  },
  {
    type: 'function',
    name: 'getPlayerWeeklyInfo',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'player' }],
    outputs: [{
      type: 'tuple',
      components: [
        { type: 'uint256', name: 'toppingsEarned' },
        { type: 'uint256', name: 'toppingsClaimed' },
        { type: 'uint256', name: 'dailyPlays' },
        { type: 'uint256', name: 'referralsUsed' },
        { type: 'bool', name: 'hasClaimed' },
        { type: 'uint256', name: 'projectedHoldingsBonus' }
      ]
    }]
  },
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
        { type: 'uint256', name: 'potAmount' },
        { type: 'bool', name: 'settled' }
      ]
    }]
  },
  {
    type: 'function',
    name: 'hasPlayedDaily',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256', name: 'gameId' },
      { type: 'address', name: 'player' }
    ],
    outputs: [{ type: 'bool' }]
  },
  { type: 'function', name: 'hasPlayedDailyGame', stateMutability: 'view', inputs: [{ type: 'address', name: 'player' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isDailyGameReady', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isClaimWindowOpen', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isWeeklyGameReady', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'getReferralCode', stateMutability: 'view', inputs: [{ type: 'address', name: 'player' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'getPlayerFromCode', stateMutability: 'view', inputs: [{ type: 'string', name: 'code' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'isValidEntryAmount', stateMutability: 'pure', inputs: [{ type: 'uint256', name: 'amount' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'getPlayerLifetimeStats',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'player' }],
    outputs: [{
      type: 'tuple',
      components: [
        { type: 'uint256', name: 'totalDailyWins' },
        { type: 'uint256', name: 'totalWeeklyWins' },
        { type: 'uint256', name: 'totalVmfWon' },
        { type: 'uint256', name: 'lifetimeToppings' },
        { type: 'uint256', name: 'lifetimeReferrals' }
      ]
    }]
  },
  { type: 'function', name: 'getDailyGameWinners', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'gameId' }], outputs: [{ type: 'address[]' }] },
  { type: 'function', name: 'getWeeklyGameWinners', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'weekId' }], outputs: [{ type: 'address[]' }] },
  { type: 'function', name: 'hasUsedReferral', stateMutability: 'view', inputs: [{ type: 'address', name: 'player' }], outputs: [{ type: 'bool' }] },

  // --- Events ---
  {
    type: 'event',
    name: 'DailyGameStarted',
    inputs: [
      { indexed: true, name: 'gameId', type: 'uint256' },
      { indexed: false, name: 'startTime', type: 'uint256' },
      { indexed: false, name: 'endTime', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'DailyGameEntered',
    inputs: [
      { indexed: true, name: 'gameId', type: 'uint256' },
      { indexed: true, name: 'player', type: 'address' },
      { indexed: false, name: 'isFirst', type: 'bool' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'DailyGameSettled',
    inputs: [
      { indexed: true, name: 'gameId', type: 'uint256' },
      { indexed: false, name: 'winners', type: 'address[]' },
      { indexed: false, name: 'pot', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'WeeklyGameStarted',
    inputs: [
      { indexed: true, name: 'gameId', type: 'uint256' },
      { indexed: false, name: 'claimStart', type: 'uint256' },
      { indexed: false, name: 'claimEnd', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'ToppingsEarned',
    inputs: [
      { indexed: true, name: 'weekId', type: 'uint256' },
      { indexed: true, name: 'player', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'reason', type: 'string' }
    ]
  },
  {
    type: 'event',
    name: 'ToppingsClaimed',
    inputs: [
      { indexed: true, name: 'weekId', type: 'uint256' },
      { indexed: true, name: 'player', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'WeeklyGameSettled',
    inputs: [
      { indexed: true, name: 'weekId', type: 'uint256' },
      { indexed: false, name: 'winners', type: 'address[]' },
      { indexed: false, name: 'pot', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'ReferralCodeCreated',
    inputs: [
      { indexed: true, name: 'player', type: 'address' },
      { indexed: false, name: 'code', type: 'string' }
    ]
  },
  {
    type: 'event',
    name: 'ReferralUsed',
    inputs: [
      { indexed: true, name: 'referrer', type: 'address' },
      { indexed: true, name: 'referee', type: 'address' }
    ]
  }
] as const

// ==============================
// Contract Registry
// ==============================
const BASE_CHAIN_ID = 8453

type ContractRegistryEntry = {
  address: `0x${string}`
  abi: Abi
  chainId: number
}

export const CONTRACT_REGISTRY = {
  pizzaParty: {
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI as Abi,
    chainId: BASE_CHAIN_ID,
  },
  vmf: {
    address: VMF_TOKEN_ADDRESS as `0x${string}`,
    abi: VMF_TOKEN_ABI as unknown as Abi,
    chainId: BASE_CHAIN_ID,
  },
} as const satisfies Record<string, ContractRegistryEntry>

export type ContractRegistryKey = keyof typeof CONTRACT_REGISTRY

// ==============================
// Game Constants (from contract)
// ==============================
const ONE_ETHER = 10n ** 18n

export const GAME_CONSTANTS = {
  MIN_ENTRY_FEE_WEI: 1n * ONE_ETHER,        // 1 VMF min
  MAX_ENTRY_FEE_WEI: 1000n * ONE_ETHER,    // 1000 VMF max
  TARGET_ENTRY_FEE_USD: 1n * ONE_ETHER,     // $1 target
  HOLDINGS_UNIT: 10000n * ONE_ETHER,
  HOLDINGS_TICKETS: 3,
  MAX_INVITES_PER_WEEK: 3,
  TOPPING_TO_VMF_RATE: 1n * ONE_ETHER,
  WEEKLY_WINNERS_COUNT: 10,
  DEFAULT_DAILY_WINNERS_COUNT: 8,
  // Legacy constant for backward compatibility (deprecated - use dynamic calculation)
  ENTRY_FEE_WEI: 100n * ONE_ETHER,
} as const
