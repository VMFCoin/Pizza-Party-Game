# 🍕 Pizza Party

> *Where every slice is a chance to win!*

A blockchain-based dual-lottery game built on **Base** where players collect toppings (weighted lottery tickets) for a shot at daily prizes and weekly jackpots. Built as a **Farcaster MiniApp** for the social gaming community.

**Live Game**: [pizza-party-game.vmfcoin.com](https://pizza-party-game.vmfcoin.com)

---

## What's Cooking?

Pizza Party serves up two delicious ways to win:

### 🌞 Daily Game
- Pay ~$1 USD worth of VMF tokens to enter
- **8 winners** split the daily pot
- First player of the day gets a 1% bonus (*the early bird gets the pepperoni*)
- New game every 24 hours (12pm PST)

### 🏆 Weekly Jackpot
- Collect **toppings** throughout the week
- Claim your toppings during the Sunday-Monday window
- **10 winners** selected, weighted by topping count
- Jackpot = claimed toppings × 10 VMF

### 🧀 Earning Toppings

| Action | Toppings | Limit |
|--------|----------|-------|
| Daily play | 1 | 7/week |
| Referrals | 2 each | 3/week |
| VMF holdings | 3 per 1,000 VMF | No limit |

---

## Tech Stack

This pizza was baked with:

- **Next.js 15** + **React 19** + **TypeScript**
- **Tailwind CSS** + **Radix UI** for that crispy UI
- **Wagmi** + **Viem** for blockchain interactions
- **Farcaster MiniApp SDK** for social integration
- **Prisma** + **PostgreSQL** for data
- **Upstash Redis** for notifications
- **Foundry** for Solidity contracts

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Base network wallet with ETH
- API keys (Neynar, Reown, OnchainKit)

### Installation

```bash
# Clone the repo
git clone <repository-url>
cd pizzaApp

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your keys
```

### Environment Variables

```env
# Public
NEXT_PUBLIC_ONCHAINKIT_API_KEY=
NEXT_PUBLIC_REOWN_PROJECT_ID=
NEXT_PUBLIC_NEYNAR_API_KEY=
NEXT_PUBLIC_BASE_URL=

# Blockchain
BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=

# Wallets
PRIVATE_KEY=
OWNER_WALLET=
TREASURY_WALLET=

# Database & Services
DATABASE_URL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=
```

### Development

```bash
# Start the dev server
npm run dev

# Open http://localhost:3000
```

### Production

```bash
npm run build
npm start
```

---

## Spin the Pie - Staking System

Stake $PIZZA tokens to earn a share of every daily pot!

### Pot Distribution (when staking is active)

| Recipient | Share |
|-----------|-------|
| Winners | 80% |
| Stakers | 10% |
| Parlors | 7% |
| Charity | 3% |

### Staking Tiers

| Tier | Min Stake | Yield Boost | Toppings/Week |
|------|-----------|-------------|---------------|
| Slice Runner | 0 | 1x | +0 |
| Oven Operator | 50M | 1.5x | +1 |
| Pie Boss | 200M | 2x | +3 |
| Pizza Tycoon | 500M | 3x | +5 |

### Lock Options

| Option | Yield Multiplier | Early Exit Penalty |
|--------|------------------|-------------------|
| No Lock | 1x | None |
| 7-Day Lock | 1.5x | 15% |

### Yield Formula

```
Final Reward = Base Share × Tier Boost × Lock Boost × Early Boost
```

### Early Staker Boost
- **+30%** for the first 60 days after launch

### Spin the Pie (optional claiming mechanic)

When enabled, claiming rewards triggers a spin:

| Outcome | Chance | Payout |
|---------|--------|--------|
| Regular Slice | 73% | 100% |
| Loaded Slice | 20% | 110% |
| Hot Out the Oven | 5% | 125% |
| JACKPOT | 2% | 200% |

### Staking Parameters

| Parameter | Value |
|-----------|-------|
| Min Stake | 100,000 PIZZA |
| Max Stake | 1,000,000,000 PIZZA |
| Lock Duration | 7 days |
| Early Exit Penalty | 15% |
| Positions per Wallet | 1 |

---

## Smart Contracts

The game runs on a verified contract deployed to Base mainnet.

| Contract | Address |
|----------|---------|
| Pizza Party V2 | `0x5c3aaD450F0014292Ff363b2147e6571b16c8035` |
| Pizza Parlor Manager | TBD |
| Pizza Staking V1 | TBD |
| $PIZZA Token | TBD (Clanker launch) |

### Contract Development

```bash
cd foundry

# Build
forge build

# Deploy
forge script script/DeployPizzaParty.s.sol:DeployPizzaParty \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify
```

---

## Project Structure

```
pizzaApp/
├── app/
│   ├── api/              # Backend routes (auth, price, cron)
│   ├── components/       # React components
│   │   ├── game/         # Main game logic
│   │   └── ui/           # Radix UI components
│   ├── lib/              # Hooks, utils, constants
│   └── context/          # Wagmi providers
├── foundry/              # Solidity contracts
├── prisma/               # Database schema
└── public/               # Static assets
```

---

## Key Features

- **Dynamic pricing** - Entry fee adjusts with VMF market price
- **Referral system** - Share codes, earn toppings
- **Push notifications** - Never miss a game
- **Leaderboards** - Track daily/weekly/lifetime stats
- **Farcaster profiles** - Social identity integration
- **Real-time updates** - Block listener for instant state changes

---

## Game Schedule

All times in **Pacific Standard Time (PST)**:

| Event | Time |
|-------|------|
| Daily game reset | 12:00 PM |
| Weekly claim window opens | Sunday 12:00 PM |
| Weekly claim window closes | Monday 12:00 PM |

---

## Contributing

Found a bug? Got a feature idea? PRs welcome!

1. Fork the repo
2. Create your branch (`git checkout -b feature/extra-cheese`)
3. Commit changes (`git commit -m 'Add extra cheese'`)
4. Push (`git push origin feature/extra-cheese`)
5. Open a PR

---

## License

This project is proprietary to VMF Coin.

---

*In pizza we crust.* 🍕
