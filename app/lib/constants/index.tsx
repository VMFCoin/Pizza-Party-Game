// constants.ts
import type { Abi } from 'viem'

// ==============================
// Contract addresses (Base mainnet)
// ==============================
// PizzaParty contract address - UPDATE THIS after deploying new contract with PIZZA token
export const PIZZA_PARTY_ADDRESS = "0xA1C31c3eF1448351da0b1D430148660982B6f3dD" // PizzaParty v2 Proxy (deployed Dec 15, 2024)

// PIZZA Token (proxy with EIP-2612 permit support)
// NEW TOKEN: Migrated to 100B supply on Jan 20, 2026
export const PIZZA_TOKEN_ADDRESS = "0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07"

// Pizza Staking Contract (UUPS proxy)
export const PIZZA_STAKING_ADDRESS = "0xCbAf5bACe5419710C3852653d3DdEB831d7415be"

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
// Pizza Staking ABI
// ==============================
export const PIZZA_STAKING_ABI = [
  // --- Constants ---
  { type: 'function', name: 'MIN_STAKE_MICRO_USD', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MIN_STAKE_FALLBACK', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_STAKE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'LOCK_DURATION', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'EARLY_UNSTAKE_PENALTY_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'LOCK_BONUS_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'EARLY_BOOST_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'LOCKED_APY_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'DAYS_PER_YEAR', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'TIER1_THRESHOLD', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'TIER2_THRESHOLD', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'TIER3_THRESHOLD', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },

  // --- State Variables ---
  { type: 'function', name: 'totalStaked', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'stakerCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'boostEndTime', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'spinEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'bonusPool', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'pizzaToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pizzaPartyContract', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'stakingRewardsWallet', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pizzaPriceMicroUsd', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'lifetimeClaimed', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },

  // --- Position Mappings ---
  {
    type: 'function',
    name: 'flexibleStakes',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'user' }],
    outputs: [
      { type: 'uint256', name: 'stakedAmount' },
      { type: 'uint256', name: 'stakeTimestamp' },
      { type: 'uint256', name: 'lockEndTimestamp' },
      { type: 'uint256', name: 'lastClaimTimestamp' },
      { type: 'uint256', name: 'rewardDebt' },
      { type: 'uint256', name: 'lastToppingClaimWeek' }
    ]
  },
  {
    type: 'function',
    name: 'lockedStakes',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'user' }],
    outputs: [
      { type: 'uint256', name: 'stakedAmount' },
      { type: 'uint256', name: 'stakeTimestamp' },
      { type: 'uint256', name: 'lockEndTimestamp' },
      { type: 'uint256', name: 'lastClaimTimestamp' },
      { type: 'uint256', name: 'rewardDebt' },
      { type: 'uint256', name: 'lastToppingClaimWeek' }
    ]
  },
  { type: 'function', name: 'lastSpinGameId', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'lastApyClaimTimestamp', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },

  // --- View Functions ---
  { type: 'function', name: 'getTier', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'getTotalStaked', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getTierLevel', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'getToppingBonus', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getTierYieldBoost', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getPendingRewards', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getPendingRewardsForPosition', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }, { type: 'uint8', name: 'lockType' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'canSpinToday', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'getMinStake', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getPendingApyReward', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'getStakeInfo',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'user' }],
    outputs: [
      { type: 'uint256', name: 'totalStakedAmount' },
      { type: 'uint256', name: 'flexibleAmount' },
      { type: 'uint256', name: 'lockedAmount' },
      { type: 'uint8', name: 'tier' },
      { type: 'uint256', name: 'lockEndTimestamp' },
      { type: 'uint256', name: 'totalPendingRewards' },
      { type: 'bool', name: 'isEarlyBoostActive' }
    ]
  },
  {
    type: 'function',
    name: 'getPositionInfo',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'user' }, { type: 'uint8', name: 'lockType' }],
    outputs: [
      { type: 'uint256', name: 'stakedAmount' },
      { type: 'uint256', name: 'stakeTimestamp' },
      { type: 'uint256', name: 'lockEndTimestamp' },
      { type: 'uint256', name: 'pendingRewards' }
    ]
  },

  // --- Write Functions ---
  { type: 'function', name: 'stake', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'amount' }, { type: 'uint8', name: 'lockType' }], outputs: [] },
  { type: 'function', name: 'unstake', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'amount' }, { type: 'uint8', name: 'lockType' }], outputs: [] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimAfterSpin', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimFromPosition', stateMutability: 'nonpayable', inputs: [{ type: 'uint8', name: 'lockType' }], outputs: [] },
  { type: 'function', name: 'restake', stateMutability: 'nonpayable', inputs: [{ type: 'uint8', name: 'lockType' }], outputs: [] },
  { type: 'function', name: 'recordSpin', stateMutability: 'nonpayable', inputs: [], outputs: [] },

  // --- Events ---
  {
    type: 'event',
    name: 'Staked',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'lockType', type: 'uint8' },
      { indexed: false, name: 'tier', type: 'uint8' }
    ]
  },
  {
    type: 'event',
    name: 'Unstaked',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'penalty', type: 'uint256' },
      { indexed: false, name: 'earlyUnstake', type: 'bool' }
    ]
  },
  {
    type: 'event',
    name: 'RewardsClaimed',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'baseReward', type: 'uint256' },
      { indexed: false, name: 'finalReward', type: 'uint256' },
      { indexed: false, name: 'outcome', type: 'uint8' }
    ]
  },
  {
    type: 'event',
    name: 'RewardsRestaked',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ]
  }
] as const

// ==============================
// PizzaParty ABI (Dynamic Pricing Version with Permit)
// Entry fee adjusts based on PIZZA market price (frontend calculates amount for $1)
// Uses EIP-2612 permit for single-transaction approval + entry
// ==============================
export const PIZZA_PARTY_ABI = [
  // --- Core Gameplay ---
  { type: 'function', name: 'enterDailyGame', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'amountPaid' }, { type: 'string', name: 'referralCode' }], outputs: [] },
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
  // Slice sponsor tracking - returns the sponsor who gave a player a free slice for a specific game
  {
    type: 'function',
    name: 'dailySliceSponsor',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256', name: 'gameId' },
      { type: 'address', name: 'player' }
    ],
    outputs: [{ type: 'address' }]
  },
  // Weekly slice sponsor tracking - returns the sponsor who gave a player a free slice for a specific week
  {
    type: 'function',
    name: 'weeklySliceSponsor',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256', name: 'weekId' },
      { type: 'address', name: 'player' }
    ],
    outputs: [{ type: 'address' }]
  },
  // USD value per winner (locked at settlement time, in cents)
  { type: 'function', name: 'getDailyGameUsdValue', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'gameId' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getWeeklyGameUsdValue', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'weekId' }], outputs: [{ type: 'uint256' }] },
  // Settlement with USD snapshot
  { type: 'function', name: 'settleDailyGameWithUsd', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'usdCentsPerWinner' }], outputs: [] },
  { type: 'function', name: 'settleWeeklyGameWithUsd', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'usdCentsPerWinner' }], outputs: [] },
  // Weekly treasury bonus (fixed PIZZA amount added to weekly jackpot)
  { type: 'function', name: 'weeklyTreasuryBonus', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // toppingUnitPizza: dynamic value representing $0.10 worth of PIZZA per topping
  { type: 'function', name: 'toppingUnitPizza', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },

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
  { type: 'function', name: 'slicesRemainingThisWeek', stateMutability: 'view', inputs: [{ type: 'address', name: 'sponsor' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'weeklySliceAllowance', stateMutability: 'view', inputs: [{ type: 'address', name: 'sponsor' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'hasSentSliceToday', stateMutability: 'view', inputs: [{ type: 'address', name: 'sponsor' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'pendingFees', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'parlorOwnersCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isParlorOwner', stateMutability: 'view', inputs: [{ type: 'address', name: '' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'claimableBalance', stateMutability: 'view', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalUnclaimedOwnerFees', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'estimatedPendingShare', stateMutability: 'view', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }] },
  // --- Parlor Naming ---
  { type: 'function', name: 'parlorName', stateMutability: 'view', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'hasParlorName', stateMutability: 'view', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'bool' }] },
  // --- Constants ---
  { type: 'function', name: 'MAX_PARLORS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_PARLORS_PER_WALLET', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'WEEKLY_SLICES_PER_PARLOR', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_SLICES_PER_DAY', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MIN_PARLOR_PRICE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_PARLOR_PRICE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // --- Write Functions ---
  { type: 'function', name: 'purchaseParlor', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'amountPaid' }], outputs: [] },
  { type: 'function', name: 'allocateFees', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimMyFees', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'distributeFranchiseFees', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'tipSlice', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: 'recipient' }], outputs: [] },
  { type: 'function', name: 'sendSlice', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: 'recipient' }], outputs: [] },
  { type: 'function', name: 'claimSlice', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'entryFeeAmount' }], outputs: [] },
  { type: 'function', name: 'setParlorName', stateMutability: 'nonpayable', inputs: [{ type: 'string', name: 'name' }], outputs: [] },
  // --- Pending Slice View Functions ---
  {
    type: 'function',
    name: 'hasPendingSlice',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'recipient' }],
    outputs: [
      { type: 'bool', name: 'hasPending' },
      { type: 'address', name: 'sponsor' }
    ]
  },
  {
    type: 'function',
    name: 'getPendingSlice',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'recipient' }],
    outputs: [
      { type: 'address', name: 'sponsor' },
      { type: 'uint256', name: 'dailyGameId' },
      { type: 'bool', name: 'isValid' }
    ]
  },
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
    name: 'SliceSent',
    inputs: [
      { indexed: true, name: 'sponsor', type: 'address' },
      { indexed: true, name: 'recipient', type: 'address' },
      { indexed: true, name: 'dailyGameId', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'SliceClaimed',
    inputs: [
      { indexed: true, name: 'recipient', type: 'address' },
      { indexed: true, name: 'sponsor', type: 'address' },
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
  },
  {
    type: 'event',
    name: 'ParlorNamed',
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: false, name: 'name', type: 'string' }
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
  pizzaStaking: {
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI as unknown as Abi,
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
  TOPPING_TO_PIZZA_RATE: 1n * ONE_ETHER,  // 1 topping = 1 PIZZA in weekly jackpot
  WEEKLY_WINNERS_COUNT: 10,
  DEFAULT_DAILY_WINNERS_COUNT: 8,
  // EIP-712 Permit Domain for PIZZA token
  PERMIT_DOMAIN: {
    name: 'Pizza',           // Must match token's name() exactly
    version: '1',
    chainId: 8453,           // Base mainnet
  },
} as const
