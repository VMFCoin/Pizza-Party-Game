# Smart Contract Token Migration Guide

## Overview

This document details the smart contract changes required for the $PIZZA token migration.

**Good news:** All three main contracts have mechanisms to update the token address without redeployment!

---

## Contract Admin Functions

### 1. PizzaPartyV2Upgradeable
**Location:** `foundry/src/PizzaPartyV2Upgradeable.sol:1403`
```solidity
function adminSetPizzaToken(address newToken) external onlyOwner {
    // Updates pizzaToken state variable
}
```
**Action:** Call `adminSetPizzaToken(NEW_TOKEN_ADDRESS)` as contract owner

---

### 2. PizzaStakingV1Upgradeable
**Location:** `foundry/src/PizzaStakingV1Upgradeable.sol:823`
```solidity
function adminSetPizzaToken(address _pizzaToken) external onlyOwner {
    // Updates pizzaToken state variable
}
```
**Action:** Call `adminSetPizzaToken(NEW_TOKEN_ADDRESS)` as contract owner

---

### 3. PizzaParlorManagerUpgradeable
**Location:** `foundry/src/PizzaParlorManagerUpgradeable.sol:190`

This contract is **special** - it reads the token from the PizzaParty contract:
```solidity
IERC20 token = IPizzaParty(_pizzaParty).pizzaToken();
pizzaToken = token;
```

**IMPORTANT:** The PizzaParlorManager gets its token address from PizzaPartyV2!

If PizzaParlorManager caches the token at initialization, you may need to either:
1. Check if there's an admin function to refresh the token (there isn't currently)
2. Redeploy the PizzaParlorManager proxy implementation
3. Add an `adminSetPizzaToken()` function via upgrade

**Recommended:** Check if `pizzaToken` is read fresh from PizzaParty on each call, or if it's cached. If cached, an upgrade is needed.

Let me check the contract... Looking at the code:
- Line 190: `pizzaToken = token;` - Token IS cached at initialization
- Line 218, 259, 557, 640: Uses cached `pizzaToken` variable

**Conclusion:** PizzaParlorManager caches the token and needs either:
- A new admin function added via upgrade, OR
- A new implementation deployed

---

## Migration Script for Smart Contracts

Create a new deployment script at `foundry/script/MigratePizzaToken.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IAdminSetToken {
    function adminSetPizzaToken(address newToken) external;
    function pizzaToken() external view returns (address);
    function owner() external view returns (address);
}

contract MigratePizzaToken is Script {
    // UPDATE THIS WITH NEW TOKEN ADDRESS
    address constant NEW_PIZZA_TOKEN = address(0); // <-- SET THIS!

    // Current contract addresses (Base Mainnet)
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PARLOR_MANAGER_PROXY = 0x7acfaa1dadd836404a8d90b49581758c4fdc889b;

    function run() external {
        require(NEW_PIZZA_TOKEN != address(0), "Set NEW_PIZZA_TOKEN first!");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Update PizzaPartyV2
        console.log("Updating PizzaPartyV2...");
        IAdminSetToken pizzaParty = IAdminSetToken(PIZZA_PARTY_PROXY);
        console.log("  Current token:", pizzaParty.pizzaToken());
        pizzaParty.adminSetPizzaToken(NEW_PIZZA_TOKEN);
        console.log("  New token:", pizzaParty.pizzaToken());

        // 2. Update PizzaStaking
        console.log("Updating PizzaStaking...");
        IAdminSetToken staking = IAdminSetToken(PIZZA_STAKING_PROXY);
        console.log("  Current token:", staking.pizzaToken());
        staking.adminSetPizzaToken(NEW_PIZZA_TOKEN);
        console.log("  New token:", staking.pizzaToken());

        // 3. PizzaParlorManager - NEEDS MANUAL HANDLING
        console.log("\nWARNING: PizzaParlorManager needs separate upgrade!");
        console.log("  Current cached token:", IAdminSetToken(PARLOR_MANAGER_PROXY).pizzaToken());

        vm.stopBroadcast();

        console.log("\n=== MIGRATION COMPLETE (Partial) ===");
        console.log("PizzaPartyV2: UPDATED");
        console.log("PizzaStaking: UPDATED");
        console.log("PizzaParlorManager: NEEDS UPGRADE - see SMART_CONTRACT_MIGRATION.md");
    }
}
```

---

## PizzaParlorManager Upgrade Required

Since PizzaParlorManager caches the token address, you need to add an admin function.

### Option A: Add Admin Function (Recommended)

Add this to PizzaParlorManagerUpgradeable.sol:

```solidity
/**
 * @notice Admin function to update the PIZZA token address
 * @dev Required for token migration. Only callable by owner.
 * @param _pizzaToken The new PIZZA token address
 */
function adminSetPizzaToken(address _pizzaToken) external onlyOwner {
    require(_pizzaToken != address(0), "Invalid token address");
    pizzaToken = IERC20(_pizzaToken);
    emit PizzaTokenUpdated(_pizzaToken);
}

// Add event
event PizzaTokenUpdated(address indexed newToken);
```

Then:
1. Deploy new implementation
2. Upgrade proxy to new implementation
3. Call `adminSetPizzaToken(NEW_TOKEN_ADDRESS)`

### Option B: Reinitialize (If supported)

If the contract has a reinitializer pattern, you could add a migration function.

---

## Burn Function Verification

The current burn implementation in PizzaParlorManager:

```solidity
interface IBurnable {
    function burn(uint256 amount) external;
}

// In purchaseParlor:
IBurnable(address(token)).burn(burnAmount);
```

**Clanker Token Requirement:**
- New token MUST have `burn(uint256 amount) external` function
- The contract burns tokens from its own balance (not user's)
- Verify this matches Clanker's burn implementation

**Test Command (once you have the address):**
```bash
cast call NEW_TOKEN_ADDRESS "burn(uint256)" 0 --rpc-url https://mainnet.base.org
# Should NOT revert with "function not found"
```

---

## Execution Order

1. **Verify new token contract**
   - [ ] Confirm address
   - [ ] Verify burn() function exists
   - [ ] Verify 18 decimals
   - [ ] Verify 100B supply

2. **Fund wallets with new tokens**
   - [ ] Treasury wallet (for free slices)
   - [ ] Staking rewards wallet

3. **Update PizzaPartyV2**
   ```bash
   cast send $PIZZA_PARTY_PROXY "adminSetPizzaToken(address)" $NEW_TOKEN --private-key $PK
   ```

4. **Update PizzaStaking**
   ```bash
   cast send $STAKING_PROXY "adminSetPizzaToken(address)" $NEW_TOKEN --private-key $PK
   ```

5. **Upgrade PizzaParlorManager**
   - Deploy new implementation with `adminSetPizzaToken`
   - Upgrade proxy
   - Call `adminSetPizzaToken`

6. **Update frontend/backend code**
   ```bash
   ./migration/token-migration.sh --execute $NEW_TOKEN
   ```

7. **Deploy and verify**

---

## Rollback Procedure

If issues occur, you can roll back by calling `adminSetPizzaToken` with the OLD token address:
```
OLD_TOKEN: 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69
```

---

## Post-Migration Verification

```bash
# Verify all contracts point to new token
cast call $PIZZA_PARTY_PROXY "pizzaToken()(address)" --rpc-url https://mainnet.base.org
cast call $STAKING_PROXY "pizzaToken()(address)" --rpc-url https://mainnet.base.org
cast call $PARLOR_PROXY "pizzaToken()(address)" --rpc-url https://mainnet.base.org

# Test a small transaction
# (Use testnet or have someone make a small entry)
```
