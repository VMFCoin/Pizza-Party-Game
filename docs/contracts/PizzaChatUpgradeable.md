# PizzaChatUpgradeable

Paid in-app messaging with per-room cooldowns and bans. Each message costs PIZZA sent to treasury.

**Last verified on-chain: April 23, 2026**

## As Deployed (exact current state)

- Inherits: `OwnableUpgradeable`, `UUPSUpgradeable`
- No Pausable
- Owner: `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (1-step transfer)
- Constructor calls `_disableInitializers()`
- Solidity: 0.8.24

## Addresses (Base Mainnet)

| | Address |
|---|---|
| Proxy | Deployed — see `foundry/broadcast/DeployPizzaChat.s.sol/8453/run-latest.json` |
| Owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` |

## Purpose

Simple on-chain chat where:
- Users pay a `messageFee` in PIZZA per message (goes to `treasury`)
- Per-sender cooldown prevents spam
- Per-room ban list lets owner silence abusers
- Messages are emitted as events only (no storage — gas-efficient)

## Core Constants

```solidity
MAX_MESSAGE_LENGTH = 250   // characters
```

## Storage Layout (Append-Only — do not reorder)

- `treasury` (address)
- `messageFee` (uint256)
- `totalMessages` (uint256)
- `roomMessageCount[roomId]` (mapping)
- `cooldown` (uint256, seconds)
- `lastSentAt[sender]` (mapping)
- `isBanned[roomId][sender]` (nested mapping)

## Critical Functions

### User-facing

| Function | Caller | Purpose |
|---|---|---|
| `sendMessage(roomId, text)` | Anyone | Pay `messageFee` PIZZA, post message. Reverts if banned, on cooldown, empty, or too long. Uses `pizzaToken.transferFrom(sender, treasury, messageFee)`. |

### Views

- `getRoomMessageCount(roomId)` → total messages in a room
- `getTimeUntilCanSend(sender)` → remaining cooldown

### Admin

- `setMessageFee(newFee)` / `setCooldown(newCooldown)` / `setTreasury(newTreasury)`
- `banSender(roomId, sender)` / `unbanSender(roomId, sender)`

## Events

- `MessagePosted(roomId, sender, text, timestamp)` — primary message log (parse these for chat history)
- `SenderBanned(roomId, sender)` / `SenderUnbanned(roomId, sender)`
- `MessageFeeUpdated(newFee)` / `CooldownUpdated(newCooldown)` / `TreasuryUpdated(newTreasury)`

## Invariants

- `bytes(text).length > 0 && <= MAX_MESSAGE_LENGTH`
- `block.timestamp >= lastSentAt[sender] + cooldown` (unless cooldown is 0)
- `!isBanned[roomId][sender]`

## Integration Points

- **→ Treasury:** all `messageFee` payments go here
- **← Frontend:** chat UI reads `MessagePosted` events

## Files

- `foundry/src/PizzaChatUpgradeable.sol` (188 lines)
- Deploy script: `foundry/script/DeployPizzaChat.s.sol`
- Frontend: `app/api/chat/messages/` (API handlers exist)
