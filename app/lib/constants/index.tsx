// constants.ts
import type { Abi } from 'viem'

// ==============================
// Contract addresses (Base mainnet)
// ==============================
export const PIZZA_PARTY_ADDRESS = "0xAa5d96A3A462DC0EC0bc2Cbd3a3aB94Cd46CB57f" // Unified PizzaParty contract
export const VMF_TOKEN_ADDRESS = "0x2213414893259b0C48066Acd1763e7fbA97859E5"

// SushiSwap V2 pair for VMF/USDC on Base (used for price oracle)
// NOTE: This must match the pair set in the contract via setSushiswapPair()
export const SUSHISWAP_VMF_USDC_PAIR = "0x9C83A203133B65982F35D1B00E8283C9fb518cb1"

// ==============================
// VMF Token ABI (ERC20)
// ==============================
export const VMF_TOKEN_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "spender" },
      { type: "uint256", name: "amount" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { type: "address", name: "owner" },
      { type: "address", name: "spender" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "uint256" }]
  }
] as const

// ==============================
// PizzaParty ABI (Unified Contract)
// ==============================
export const PIZZA_PARTY_ABI = [
  // --- Daily Game Entry ---
  { type: 'function', name: 'enterDailyGame', stateMutability: 'nonpayable', inputs: [{ type: 'string', name: 'referralCode' }], outputs: [] },
  { type: 'function', name: 'enterDailyGameNoRef', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'settleDailyGame', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  
  // --- Weekly Game ---
  { type: 'function', name: 'settleWeeklyGame', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  
  // --- Referral System ---
  { type: 'function', name: 'createReferralCode', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  
  // --- Holdings Bonus ---
  { type: 'function', name: 'claimHoldings', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'previewHoldingsTickets', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256', name: 'tickets' }] },
  { type: 'function', name: 'lastHoldingsClaimWeek', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },
  
  // --- View Functions - Game State ---
  { type: 'function', name: 'dailyGameId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'weeklyGameId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'currentDailyJackpot', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getDailyJackpot', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getWeeklyJackpot', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  
  // --- View Functions - Entry Fee & Pricing ---
  { type: 'function', name: 'getEntryFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getCurrentVMFPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  
  // --- View Functions - Game Info ---
  { type: 'function', name: 'getCurrentDailyGame', stateMutability: 'view', inputs: [], outputs: [{ 
    type: 'tuple', 
    components: [
      { type: 'uint256', name: 'gameId' },
      { type: 'uint256', name: 'startTime' },
      { type: 'uint256', name: 'endTime' },
      { type: 'uint256', name: 'totalEntries' },
      { type: 'uint256', name: 'jackpotAmount' },
      { type: 'address[]', name: 'winners' },
      { type: 'bool', name: 'isCompleted' }
    ]
  }] },
  { type: 'function', name: 'getCurrentWeeklyGame', stateMutability: 'view', inputs: [], outputs: [{ 
    type: 'tuple', 
    components: [
      { type: 'uint256', name: 'gameId' },
      { type: 'uint256', name: 'startTime' },
      { type: 'uint256', name: 'endTime' },
      { type: 'uint256', name: 'totalEntries' },
      { type: 'uint256', name: 'jackpotAmount' },
      { type: 'address[]', name: 'winners' },
      { type: 'bool', name: 'isCompleted' }
    ]
  }] },
  { type: 'function', name: 'getDailyGame', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'gameId' }], outputs: [{ 
    type: 'tuple', 
    components: [
      { type: 'uint256', name: 'gameId' },
      { type: 'uint256', name: 'startTime' },
      { type: 'uint256', name: 'endTime' },
      { type: 'uint256', name: 'totalEntries' },
      { type: 'uint256', name: 'jackpotAmount' },
      { type: 'address[]', name: 'winners' },
      { type: 'bool', name: 'isCompleted' }
    ]
  }] },
  { type: 'function', name: 'getWeeklyGame', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'gameId' }], outputs: [{ 
    type: 'tuple', 
    components: [
      { type: 'uint256', name: 'gameId' },
      { type: 'uint256', name: 'startTime' },
      { type: 'uint256', name: 'endTime' },
      { type: 'uint256', name: 'totalEntries' },
      { type: 'uint256', name: 'jackpotAmount' },
      { type: 'address[]', name: 'winners' },
      { type: 'bool', name: 'isCompleted' }
    ]
  }] },
  
  // --- View Functions - Player Info ---
  { type: 'function', name: 'getPlayerInfo', stateMutability: 'view', inputs: [{ type: 'address', name: 'player' }], outputs: [{ 
    type: 'tuple',
    components: [
      { type: 'uint256', name: 'totalToppings' },
      { type: 'uint256', name: 'dailyEntries' },
      { type: 'uint256', name: 'lastEntryTime' }
    ]
  }] },
  { type: 'function', name: 'hasEnteredToday', stateMutability: 'view', inputs: [{ type: 'address', name: 'player' }], outputs: [{ type: 'bool' }] },
  
  // --- View Functions - Referral Info ---
  { type: 'function', name: 'getReferralInfo', stateMutability: 'view', inputs: [{ type: 'address', name: 'player' }], outputs: [{ 
    type: 'tuple',
    components: [
      { type: 'string', name: 'referralCode' },
      { type: 'address', name: 'referrer' },
      { type: 'uint256', name: 'totalReferrals' },
      { type: 'uint256', name: 'lifetimeReferrals' },
      { type: 'bool', name: 'isActive' }
    ]
  }] },
  { type: 'function', name: 'getWeeklyInviteCount', stateMutability: 'view', inputs: [{ type: 'address', name: 'inviter' }], outputs: [{ type: 'uint256' }] },
  
  // --- View Functions - Weekly Tickets ---
  { type: 'function', name: 'getWeeklyTickets', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },
  
  // --- View Functions - Game Status ---
  { type: 'function', name: 'isDailyDrawReady', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isWeeklyDrawReady', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  
  // --- Constants ---
  { type: 'function', name: 'DAILY_WINNERS_COUNT', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'WEEKLY_WINNERS_COUNT', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_INVITES_PER_WEEK', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'HOLDINGS_UNIT', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'HOLDINGS_TICKETS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'TARGET_ENTRY_FEE_USD', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'TOPPING_TO_VMF_RATE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  
  // --- Admin Functions ---
  { type: 'function', name: 'setSushiswapPair', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: '_pair' }], outputs: [] },
  { type: 'function', name: 'setDailyWinnersCount', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'count' }], outputs: [] },
  { type: 'function', name: 'configureWeeklyFunding', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: 'treasury' }, { type: 'bool', name: 'enabled' }], outputs: [] },
  
  // --- Events ---
  { type: 'event', name: 'DailyGameEntered', inputs: [
    { indexed: true, name: 'gameId', type: 'uint256' },
    { indexed: true, name: 'player', type: 'address' },
    { indexed: false, name: 'toppings', type: 'uint256' },
    { indexed: false, name: 'amountPaid', type: 'uint256' }
  ] },
  { type: 'event', name: 'DailyWinnersSelected', inputs: [
    { indexed: true, name: 'gameId', type: 'uint256' },
    { indexed: false, name: 'winners', type: 'address[]' },
    { indexed: false, name: 'jackpot', type: 'uint256' }
  ] },
  { type: 'event', name: 'WeeklyWinnersSelected', inputs: [
    { indexed: true, name: 'gameId', type: 'uint256' },
    { indexed: false, name: 'winners', type: 'address[]' },
    { indexed: false, name: 'jackpot', type: 'uint256' }
  ] },
  { type: 'event', name: 'WeeklyTicketsAdded', inputs: [
    { indexed: true, name: 'gameId', type: 'uint256' },
    { indexed: true, name: 'user', type: 'address' },
    { indexed: false, name: 'tickets', type: 'uint256' },
    { indexed: false, name: 'totalUserTickets', type: 'uint256' }
  ] },
  { type: 'event', name: 'ReferralCodeCreated', inputs: [
    { indexed: true, name: 'player', type: 'address' },
    { indexed: false, name: 'referralCode', type: 'string' }
  ] },
  { type: 'event', name: 'ReferralUsed', inputs: [
    { indexed: true, name: 'weekId', type: 'uint256' },
    { indexed: true, name: 'inviter', type: 'address' },
    { indexed: true, name: 'invitee', type: 'address' },
    { indexed: false, name: 'inviterToppings', type: 'uint256' },
    { indexed: false, name: 'inviteeToppings', type: 'uint256' }
  ] },
  { type: 'event', name: 'HoldingsClaimed', inputs: [
    { indexed: true, name: 'weekId', type: 'uint256' },
    { indexed: true, name: 'user', type: 'address' },
    { indexed: false, name: 'balance', type: 'uint256' },
    { indexed: false, name: 'tickets', type: 'uint256' }
  ] },
  { type: 'event', name: 'NewDailyGame', inputs: [
    { indexed: true, name: 'gameId', type: 'uint256' },
    { indexed: false, name: 'startTime', type: 'uint256' },
    { indexed: false, name: 'endTime', type: 'uint256' }
  ] },
  { type: 'event', name: 'NewWeeklyGame', inputs: [
    { indexed: true, name: 'gameId', type: 'uint256' },
    { indexed: false, name: 'startTime', type: 'uint256' },
    { indexed: false, name: 'endTime', type: 'uint256' }
  ] },
  { type: 'event', name: 'WeeklyTreasuryFunded', inputs: [
    { indexed: true, name: 'weekId', type: 'uint256' },
    { indexed: false, name: 'amount', type: 'uint256' }
  ] },
  { type: 'event', name: 'SushiswapPairUpdated', inputs: [
    { indexed: true, name: 'newPair', type: 'address' }
  ] }
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
export const GAME_CONSTANTS = {
  HOLDINGS_UNIT: BigInt(1000e18), // 1000 VMF required per holdings unit
  HOLDINGS_TICKETS: 3, // 3 tickets per holdings unit
  MAX_INVITES_PER_WEEK: 3, // Max referrals per week
  TOPPING_TO_VMF_RATE: BigInt(10e18), // 1 topping = 10 VMF for weekly jackpot
  TARGET_ENTRY_FEE_USD: BigInt(1e18), // $1 target entry fee
  WEEKLY_WINNERS_COUNT: 10,
  DEFAULT_DAILY_WINNERS_COUNT: 8,
} as const