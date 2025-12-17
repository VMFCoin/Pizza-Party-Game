// constants.ts
import type { Abi } from 'viem'

// ==============================
// Contract addresses (Base mainnet)
// ==============================
// PizzaParty contract address - UPDATE THIS after deploying new contract with PIZZA token
export const PIZZA_PARTY_ADDRESS = "0xA1C31c3eF1448351da0b1D430148660982B6f3dD" // PizzaParty v2 Proxy (deployed Dec 15, 2024)

// PIZZA Token (proxy with EIP-2612 permit support)
export const PIZZA_TOKEN_ADDRESS = "0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69"

// ==============================
// PIZZA Token ABI (ERC20 with EIP-2612 Permit)
// ==============================
export const PIZZA_TOKEN_ABI = [
  // Standard ERC20
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
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }]
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }]
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }]
  },
  // EIP-2612 Permit
  {
    type: 'function',
    name: 'permit',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'owner' },
      { type: 'address', name: 'spender' },
      { type: 'uint256', name: 'value' },
      { type: 'uint256', name: 'deadline' },
      { type: 'uint8', name: 'v' },
      { type: 'bytes32', name: 'r' },
      { type: 'bytes32', name: 's' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'owner' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }]
  }
] as const

// ==============================
// PizzaParty ABI (Dynamic Pricing Version with Permit)
// Entry fee adjusts based on PIZZA market price (frontend calculates amount for $1)
// Uses EIP-2612 permit for single-transaction approval + entry
// ==============================
export const PIZZA_PARTY_ABI = [
  // --- Core Gameplay ---
  { type: 'function', name: 'enterDailyGame', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'amountPaid' }], outputs: [] },
  // Single-transaction entry with EIP-2612 permit (no prior approval needed)
  {
    type: 'function',
    name: 'enterDailyGameWithPermit',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'uint256', name: 'amountPaid' },
      { type: 'string', name: 'referralCode' },
      { type: 'uint256', name: 'deadline' },
      { type: 'uint8', name: 'v' },
      { type: 'bytes32', name: 'r' },
      { type: 'bytes32', name: 's' }
    ],
    outputs: []
  },
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
        { type: 'uint256', name: 'totalPizzaWon' },
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

// ==============================
// ParlorManager Contract (Pizza Parlors)
// ==============================
export const PARLOR_MANAGER_ADDRESS = "0x7acfaa1dadd836404a8d90b49581758c4fdc889b" // ParlorManager Proxy

export const PARLOR_MANAGER_ABI = [
  // --- View Functions ---
  { type: 'function', name: 'parlorPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalParlors', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'parlorsRemaining', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'parlorCount', stateMutability: 'view', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'slicesRemainingToday', stateMutability: 'view', inputs: [{ type: 'address', name: 'sponsor' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'pendingFees', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'parlorOwnersCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isParlorOwner', stateMutability: 'view', inputs: [{ type: 'address', name: '' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'claimableBalance', stateMutability: 'view', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalUnclaimedOwnerFees', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'estimatedPendingShare', stateMutability: 'view', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }] },
  // --- Constants ---
  { type: 'function', name: 'MAX_PARLORS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_PARLORS_PER_WALLET', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'DAILY_FREE_ENTRIES_PER_PARLOR', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MIN_PARLOR_PRICE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_PARLOR_PRICE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // --- Write Functions ---
  { type: 'function', name: 'purchaseParlor', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'amountPaid' }], outputs: [] },
  { type: 'function', name: 'allocateFees', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimMyFees', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'distributeFranchiseFees', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'tipSlice', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: 'recipient' }], outputs: [] },
  // --- Events ---
  {
    type: 'event',
    name: 'ParlorPurchased',
    inputs: [
      { indexed: true, name: 'buyer', type: 'address' },
      { indexed: true, name: 'globalSerial', type: 'uint256' },
      { indexed: false, name: 'buyerTotalOwned', type: 'uint256' },
      { indexed: false, name: 'price', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'SliceTipped',
    inputs: [
      { indexed: true, name: 'sponsor', type: 'address' },
      { indexed: true, name: 'recipient', type: 'address' },
      { indexed: true, name: 'dailyGameId', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'FranchiseFeesAllocated',
    inputs: [
      { indexed: false, name: 'newFees', type: 'uint256' },
      { indexed: false, name: 'treasuryAmount', type: 'uint256' },
      { indexed: false, name: 'opsAmount', type: 'uint256' },
      { indexed: false, name: 'ownersAmount', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'OwnerFeesClaimed',
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ]
  }
] as const

export const CONTRACT_REGISTRY = {
  pizzaParty: {
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI as Abi,
    chainId: BASE_CHAIN_ID,
  },
  pizzaToken: {
    address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
    abi: PIZZA_TOKEN_ABI as unknown as Abi,
    chainId: BASE_CHAIN_ID,
  },
  parlorManager: {
    address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
    abi: PARLOR_MANAGER_ABI as unknown as Abi,
    chainId: BASE_CHAIN_ID,
  },
} as const satisfies Record<string, ContractRegistryEntry>

export type ContractRegistryKey = keyof typeof CONTRACT_REGISTRY

// ==============================
// Game Constants (from contract)
// ==============================
const ONE_ETHER = 10n ** 18n

export const GAME_CONSTANTS = {
  MIN_ENTRY_FEE_WEI: 1n * (ONE_ETHER / 100n),  // 0.01 PIZZA minimum (when PIZZA = $100, entry = 0.01 PIZZA for $1)
  MAX_ENTRY_FEE_WEI: 1000n * ONE_ETHER,        // 1000 PIZZA maximum (when PIZZA = $0.001, entry = 1000 PIZZA for $1)
  TARGET_ENTRY_FEE_USD: 1n * ONE_ETHER,        // $1 target
  HOLDINGS_UNIT: 10000n * ONE_ETHER,
  HOLDINGS_TICKETS: 3,
  MAX_INVITES_PER_WEEK: 3,
  TOPPING_TO_PIZZA_RATE: 10n * ONE_ETHER,  // 1 topping = 10 PIZZA in weekly jackpot
  WEEKLY_WINNERS_COUNT: 10,
  DEFAULT_DAILY_WINNERS_COUNT: 8,
  // EIP-712 Permit Domain for PIZZA token
  PERMIT_DOMAIN: {
    name: 'Pizza',           // Must match token's name() exactly
    version: '1',
    chainId: 8453,           // Base mainnet
  },
} as const
