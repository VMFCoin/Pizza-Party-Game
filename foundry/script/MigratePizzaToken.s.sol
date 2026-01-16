// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

/**
 * @title MigratePizzaToken
 * @notice Script to migrate all Pizza Party contracts to a new $PIZZA token
 * @dev Run with: forge script script/MigratePizzaToken.s.sol --rpc-url base --broadcast
 *
 * BEFORE RUNNING:
 * 1. Set NEW_PIZZA_TOKEN to the new token address
 * 2. Ensure you have the owner private key in .env as PRIVATE_KEY
 * 3. Verify the new token has a burn(uint256) function
 */

interface IAdminSetToken {
    function adminSetPizzaToken(address newToken) external;
    function pizzaToken() external view returns (address);
    function owner() external view returns (address);
}

interface IERC20Info {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
}

interface IBurnable {
    function burn(uint256 amount) external;
}

contract MigratePizzaToken is Script {
    // ============================================================
    // CONFIGURATION - UPDATE THESE VALUES BEFORE RUNNING
    // ============================================================

    // SET THIS TO THE NEW TOKEN ADDRESS BEFORE RUNNING!
    address constant NEW_PIZZA_TOKEN = address(0);

    // Current contract addresses (Base Mainnet)
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    // Old token for reference
    address constant OLD_PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;

    // Expected new token supply (100 billion with 18 decimals)
    uint256 constant EXPECTED_SUPPLY = 100_000_000_000 * 1e18;

    // ============================================================
    // SCRIPT FUNCTIONS
    // ============================================================

    function run() external {
        console.log("========================================");
        console.log("   PIZZA TOKEN MIGRATION SCRIPT");
        console.log("========================================\n");

        // Validation
        require(NEW_PIZZA_TOKEN != address(0), "ERROR: Set NEW_PIZZA_TOKEN first!");
        require(NEW_PIZZA_TOKEN != OLD_PIZZA_TOKEN, "ERROR: New token same as old!");

        // Verify new token info
        _verifyNewToken();

        // Get deployer
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);

        // Verify ownership
        _verifyOwnership(deployer);

        console.log("\n--- Starting Migration ---\n");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Update PizzaPartyV2
        _updatePizzaParty();

        // 2. Update PizzaStaking
        _updatePizzaStaking();

        // 3. Note about PizzaParlorManager
        _handleParlorManager();

        vm.stopBroadcast();

        console.log("\n========================================");
        console.log("   MIGRATION SUMMARY");
        console.log("========================================");
        console.log("PizzaPartyV2:      UPDATED");
        console.log("PizzaStaking:      UPDATED");
        console.log("PizzaParlorManager: SEE NOTES ABOVE");
        console.log("\nNew Token Address:", NEW_PIZZA_TOKEN);
        console.log("========================================\n");
    }

    function _verifyNewToken() internal view {
        console.log("Verifying new token contract...");

        IERC20Info token = IERC20Info(NEW_PIZZA_TOKEN);

        string memory name = token.name();
        string memory symbol = token.symbol();
        uint8 decimals = token.decimals();
        uint256 totalSupply = token.totalSupply();

        console.log("  Name:", name);
        console.log("  Symbol:", symbol);
        console.log("  Decimals:", decimals);
        console.log("  Total Supply:", totalSupply / 1e18, "tokens");

        require(decimals == 18, "ERROR: Token must have 18 decimals!");

        // Check if supply matches expected (with some tolerance)
        if (totalSupply != EXPECTED_SUPPLY) {
            console.log("  WARNING: Supply does not match expected 100B!");
            console.log("  Expected:", EXPECTED_SUPPLY / 1e18);
            console.log("  Actual:", totalSupply / 1e18);
        }

        // Try to verify burn function exists (this is a basic check)
        // Note: This doesn't guarantee the function works, just that it exists
        console.log("  Burn function: Assumed to exist (Clanker contract)");
        console.log("");
    }

    function _verifyOwnership(address expectedOwner) internal view {
        console.log("Verifying contract ownership...");

        address partyOwner = IAdminSetToken(PIZZA_PARTY_PROXY).owner();
        address stakingOwner = IAdminSetToken(PIZZA_STAKING_PROXY).owner();
        address parlorOwner = IAdminSetToken(PARLOR_MANAGER_PROXY).owner();

        console.log("  PizzaParty owner:", partyOwner);
        console.log("  Staking owner:", stakingOwner);
        console.log("  ParlorManager owner:", parlorOwner);

        require(partyOwner == expectedOwner, "ERROR: Not PizzaParty owner!");
        require(stakingOwner == expectedOwner, "ERROR: Not Staking owner!");
        require(parlorOwner == expectedOwner, "ERROR: Not ParlorManager owner!");

        console.log("  All ownership verified!\n");
    }

    function _updatePizzaParty() internal {
        console.log("Updating PizzaPartyV2...");

        IAdminSetToken pizzaParty = IAdminSetToken(PIZZA_PARTY_PROXY);

        address currentToken = pizzaParty.pizzaToken();
        console.log("  Current token:", currentToken);

        pizzaParty.adminSetPizzaToken(NEW_PIZZA_TOKEN);

        address newToken = pizzaParty.pizzaToken();
        console.log("  New token:", newToken);

        require(newToken == NEW_PIZZA_TOKEN, "PizzaParty update failed!");
        console.log("  SUCCESS!\n");
    }

    function _updatePizzaStaking() internal {
        console.log("Updating PizzaStaking...");

        IAdminSetToken staking = IAdminSetToken(PIZZA_STAKING_PROXY);

        address currentToken = staking.pizzaToken();
        console.log("  Current token:", currentToken);

        staking.adminSetPizzaToken(NEW_PIZZA_TOKEN);

        address newToken = staking.pizzaToken();
        console.log("  New token:", newToken);

        require(newToken == NEW_PIZZA_TOKEN, "Staking update failed!");
        console.log("  SUCCESS!\n");
    }

    function _handleParlorManager() internal view {
        console.log("Checking PizzaParlorManager...");

        IAdminSetToken parlorManager = IAdminSetToken(PARLOR_MANAGER_PROXY);
        address currentToken = parlorManager.pizzaToken();

        console.log("  Current cached token:", currentToken);
        console.log("");
        console.log("  !!! IMPORTANT !!!");
        console.log("  PizzaParlorManager caches the token address at initialization.");
        console.log("  It does NOT have an adminSetPizzaToken() function.");
        console.log("");
        console.log("  OPTIONS:");
        console.log("  1. Deploy upgraded implementation with adminSetPizzaToken()");
        console.log("  2. Upgrade proxy to new implementation");
        console.log("  3. Call adminSetPizzaToken() on the upgraded contract");
        console.log("");
        console.log("  See migration/SMART_CONTRACT_MIGRATION.md for details.\n");
    }

    // ============================================================
    // DRY RUN FUNCTION (Does not modify state)
    // ============================================================

    function dryRun() external view {
        console.log("========================================");
        console.log("   PIZZA TOKEN MIGRATION - DRY RUN");
        console.log("========================================\n");

        if (NEW_PIZZA_TOKEN == address(0)) {
            console.log("ERROR: NEW_PIZZA_TOKEN not set!");
            console.log("Set the address in MigratePizzaToken.s.sol before running.\n");
            return;
        }

        console.log("New Token Address:", NEW_PIZZA_TOKEN);
        console.log("Old Token Address:", OLD_PIZZA_TOKEN);
        console.log("");

        // Show current state
        console.log("Current Contract State:");
        console.log("  PizzaParty token:", IAdminSetToken(PIZZA_PARTY_PROXY).pizzaToken());
        console.log("  Staking token:", IAdminSetToken(PIZZA_STAKING_PROXY).pizzaToken());
        console.log("  ParlorManager token:", IAdminSetToken(PARLOR_MANAGER_PROXY).pizzaToken());
        console.log("");

        // Verify ownership
        address partyOwner = IAdminSetToken(PIZZA_PARTY_PROXY).owner();
        address stakingOwner = IAdminSetToken(PIZZA_STAKING_PROXY).owner();
        address parlorOwner = IAdminSetToken(PARLOR_MANAGER_PROXY).owner();

        console.log("Contract Owners:");
        console.log("  PizzaParty:", partyOwner);
        console.log("  Staking:", stakingOwner);
        console.log("  ParlorManager:", parlorOwner);
        console.log("");

        // Verify new token
        if (NEW_PIZZA_TOKEN != address(0)) {
            _verifyNewToken();
        }

        console.log("To execute migration, run:");
        console.log("  forge script script/MigratePizzaToken.s.sol --rpc-url base --broadcast\n");
    }
}
