# Pizza Party — Light Paper
**Base Batches 003 Startup Track Submission**

---

## What We're Building

Pizza Party is a daily social lottery game built natively on Base, powered by the $PIZZA token. Players spend ~$1 in $PIZZA to enter a daily draw, and eight winners split 80% of the pot — every single day. The remaining 20% flows to stakers, parlor sponsors, and veteran-support charities, all executed automatically through verified smart contracts with zero manual intervention.

The game runs as a Farcaster MiniApp, embedding directly into the social layer where crypto-native users already spend their time.

## Why It Matters

On-chain gaming today faces two problems: games that feel extractive, and games nobody plays twice. Pizza Party solves both. The ~$1 entry keeps stakes low enough to play daily, while 80% winner payouts keep the thrill high. A 3% automatic charity allocation means every game contributes to veteran-support organizations — transparently verifiable on BaseScan, with nine registered charities receiving funds on-chain today.

We're proving that on-chain applications can be fun, fair, and socially impactful simultaneously.

## How It Works

**Daily Game:** Players enter with $PIZZA. At 12pm PST, eight winners are selected and rewards are distributed via smart contract. 80% to winners, 10% to stakers, 7% to parlor owners, 3% to charity.

**Staking & Spin the Pie:** Holders stake $PIZZA to earn a share of daily pots and spin a reward multiplier wheel (1x–4x). A four-tier system (Slice Runner → Pizza Tycoon) rewards increasing commitment with yield bonuses up to +15%. Locked positions earn 20% APY.

**Weekly Jackpot:** Players earn "toppings" (lottery tickets) through daily play, streaks, referrals, holdings, and staking. Ten winners are drawn weekly, weighted by topping count — creating layered engagement loops that drive daily retention.

**Pizza Parlors:** Users purchase virtual parlors ($50 in $PIZZA, 50% burned) to sponsor other players with free entries. Sponsored player wins split 50/50 with the sponsor. Parlor owners also earn from daily franchise fees, creating a self-sustaining sponsorship economy.

## Architecture

Three UUPS-upgradeable Solidity contracts (4,400+ lines) handle all game logic, staking, and sponsorship — fully verified on BaseScan. The frontend is a Next.js 15 + React 19 application with Wagmi/Viem for wallet interactions and EIP-2612 permit support for single-transaction gasless entries. PostgreSQL + Prisma handle off-chain caching, and Upstash Redis powers push notifications.

## Traction & Status

Pizza Party is **live and running daily games on Base mainnet today**. The $PIZZA token (100B fixed supply, no minting) has active liquidity, daily players, and stakers across all four tiers. Smart contracts are deployed, verified, and processing real value. We are pre-seed with no external funding raised.

## What's Next

The $10K grant and Base Batches program would accelerate: expanded game modes, mobile optimization, analytics dashboards, cross-chain distribution, and ecosystem partnerships. We're building the daily habit layer for on-chain entertainment — and we're doing it on Base.

---

*Token: [0xa821...fbdb07](https://basescan.org/token/0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07) | App: [pizza-party-game.vmfcoin.com](https://pizza-party-game.vmfcoin.com/) | [GitHub](https://github.com/VMFCoin/-PizzaToken)*
