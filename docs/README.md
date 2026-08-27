# Pizza Party — Docs Index

**If you're touching any contract, read the relevant files below before writing code.**

## Read First

- **[`SECURITY.md`](./SECURITY.md)** — master security rulebook (the 10 critical rules, backend signer pattern, approval caps, known attack vectors, pre-deploy checklist)

## Per-Contract Specs

| Contract | Spec | Proxy | Current Implementation |
|---|---|---|---|
| PizzaPartyV2 | [contracts/PizzaPartyV2Upgradeable.md](./contracts/PizzaPartyV2Upgradeable.md) | `0xA1C31c3eF1448351da0b1D430148660982B6f3dD` | `0xB3bd0e87A8c4Dcb066BE24F3305ea5485c007E86` |
| PizzaStakingV1 | [contracts/PizzaStakingV1Upgradeable.md](./contracts/PizzaStakingV1Upgradeable.md) | `0xCbAf5bACe5419710C3852653d3DdEB831d7415be` | `0xe26142D4f6c87FD7d3925A85F08028FFd339F1B1` |
| PizzaParlorManager | [contracts/PizzaParlorManagerUpgradeable.md](./contracts/PizzaParlorManagerUpgradeable.md) | `0x7acfaa1dadd836404a8d90b49581758c4fdc889b` | `0x204268a7252c616300326f6126c729421c4cefbf` |
| ShareAndSpin | [contracts/ShareAndSpinUpgradeable.md](./contracts/ShareAndSpinUpgradeable.md) | `0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C` | `0x0cd17b5adc63d013ef1b2b1f4e72219636c91e95` |
| PizzaChat | [contracts/PizzaChatUpgradeable.md](./contracts/PizzaChatUpgradeable.md) | see broadcast artifact | — |
| StickerRegistry | [contracts/StickerRegistryUpgradeable.md](./contracts/StickerRegistryUpgradeable.md) | see broadcast artifact | — |
| PIZZA Token (Clanker) | [contracts/PIZZA_Token.md](./contracts/PIZZA_Token.md) | `0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07` | NOT our contract |

## Shared Wallets

| Wallet | Address | Purpose |
|---|---|---|
| Owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` | Admin of all proxies |
| Treasury | `0xBfCA21E41D397C8B6beF0c348D394DA2c4826292` | Funds share rewards, free slices, weekly bonuses |
| Staking rewards wallet | `0x0b30b1D9327979D290b49BbfEF92f783fdE81c56` | Pays staking extras (APY, bonuses, jackpot) |
| Backend signer | `0x528952ae107198011C2a1df8c05A82702D5778D6` | EOA for backend-signer-gated functions |

## Other Docs

- `PIZZA_WHITEPAPER.md` — full game whitepaper
- `BASE_BATCHES_LIGHTPAPER.md` — Base Batches lightpaper
- `staking-reward-flow.md` — legacy deep-dive on staking reward math (see per-contract spec for current truth)
- `share-and-spin-implementation.md` — early ShareAndSpin design notes

## Update Discipline (non-negotiable)

- When a contract changes → update its `contracts/<Name>.md` in the **same commit**
- When a new implementation is deployed → update the address table above + in the contract's spec
- When an exploit or bug happens → add entry to `SECURITY.md` "Known Attack Vectors"
- Last-verified-on-chain timestamps in each contract spec — re-run `forge inspect` / `cast call` before relying on them
