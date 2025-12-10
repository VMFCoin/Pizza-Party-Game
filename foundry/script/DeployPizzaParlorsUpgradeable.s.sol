// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PizzaPartyV2Upgradeable.sol";
import "../src/PizzaParlorManagerUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployPizzaParlorsUpgradeable
 * @dev Deployment script for upgradeable PizzaPartyV2 and PizzaParlorManager using UUPS pattern
 *
 * Deployment Steps:
 * 1. Deploy PizzaPartyV2Upgradeable implementation
 * 2. Deploy ERC1967Proxy pointing to implementation, with initialize() call
 * 3. Deploy PizzaParlorManagerUpgradeable implementation
 * 4. Deploy ERC1967Proxy pointing to implementation, with initialize() call
 * 5. Set PizzaParlorManager as the parlorManager in PizzaPartyV2
 * 6. Transfer ownership of PizzaPartyV2 to PizzaParlorManager (for owner fee routing)
 *
 * Usage:
 * forge script script/DeployPizzaParlorsUpgradeable.s.sol:DeployPizzaParlorsUpgradeable \
 *   --rpc-url $BASE_RPC_URL \
 *   --broadcast \
 *   --verify \
 *   -vvvv
 */
contract DeployPizzaParlorsUpgradeable is Script {
    // $PIZZA token on Base mainnet
    address constant PIZZA_TOKEN = 0xCdcb34E2a296DdeBfb6675185BdC26B5bb4FADE6;

    // Treasury wallet (receives charity funds, weekly jackpot source)
    address constant TREASURY = 0x828F516b379A2532bB33a00d34125560BF4c1853;

    // Ops wallet (receives portion of parlor sales and owner fees)
    address constant OPS = 0x828F516b379A2532bB33a00d34125560BF4c1853; // Update this

    // Initial owner (admin who can configure contracts and authorize upgrades)
    address constant INITIAL_OWNER = 0x828F516b379A2532bB33a00d34125560BF4c1853;

    // Starting game IDs (continue from existing contract)
    // Check current values from existing PizzaParty contract before deploying
    uint256 constant STARTING_DAILY_GAME_ID = 1;  // Update based on current state
    uint256 constant STARTING_WEEKLY_GAME_ID = 1; // Update based on current state

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // ============ Deploy PizzaPartyV2 ============

        // 1. Deploy implementation contract
        PizzaPartyV2Upgradeable pizzaPartyImpl = new PizzaPartyV2Upgradeable();
        console.log("PizzaPartyV2Upgradeable Implementation:", address(pizzaPartyImpl));

        // 2. Deploy proxy with initialization
        address[] memory charities = new address[](0); // Use default charities
        bytes memory pizzaPartyData = abi.encodeWithSelector(
            PizzaPartyV2Upgradeable.initialize.selector,
            PIZZA_TOKEN,
            TREASURY,
            charities,
            INITIAL_OWNER,
            STARTING_DAILY_GAME_ID,
            STARTING_WEEKLY_GAME_ID
        );

        ERC1967Proxy pizzaPartyProxy = new ERC1967Proxy(
            address(pizzaPartyImpl),
            pizzaPartyData
        );
        console.log("PizzaPartyV2 Proxy:", address(pizzaPartyProxy));

        PizzaPartyV2Upgradeable pizzaParty = PizzaPartyV2Upgradeable(address(pizzaPartyProxy));

        // ============ Deploy PizzaParlorManager ============

        // 3. Deploy implementation contract
        PizzaParlorManagerUpgradeable parlorManagerImpl = new PizzaParlorManagerUpgradeable();
        console.log("PizzaParlorManagerUpgradeable Implementation:", address(parlorManagerImpl));

        // 4. Deploy proxy with initialization
        bytes memory parlorManagerData = abi.encodeWithSelector(
            PizzaParlorManagerUpgradeable.initialize.selector,
            PIZZA_TOKEN,
            address(pizzaPartyProxy), // Use proxy address
            TREASURY,
            OPS,
            INITIAL_OWNER
        );

        ERC1967Proxy parlorManagerProxy = new ERC1967Proxy(
            address(parlorManagerImpl),
            parlorManagerData
        );
        console.log("PizzaParlorManager Proxy:", address(parlorManagerProxy));

        PizzaParlorManagerUpgradeable parlorManager = PizzaParlorManagerUpgradeable(address(parlorManagerProxy));

        // ============ Configure Contracts ============

        // 5. Set PizzaParlorManager as parlorManager in PizzaPartyV2
        pizzaParty.setParlorManager(address(parlorManagerProxy));
        console.log("ParlorManager set in PizzaPartyV2");

        // 6. Transfer ownership of PizzaPartyV2 to PizzaParlorManager
        // This routes owner fees to the parlor manager for distribution
        pizzaParty.transferOwnership(address(parlorManagerProxy));
        console.log("Ownership of PizzaPartyV2 transferred to PizzaParlorManager");

        vm.stopBroadcast();

        // Log summary
        console.log("\n=== Deployment Summary (Upgradeable) ===");
        console.log("PIZZA Token:", PIZZA_TOKEN);
        console.log("\n--- PizzaPartyV2 ---");
        console.log("  Implementation:", address(pizzaPartyImpl));
        console.log("  Proxy:", address(pizzaPartyProxy));
        console.log("\n--- PizzaParlorManager ---");
        console.log("  Implementation:", address(parlorManagerImpl));
        console.log("  Proxy:", address(parlorManagerProxy));
        console.log("\n--- Addresses ---");
        console.log("Treasury:", TREASURY);
        console.log("Ops:", OPS);
        console.log("Initial Owner:", INITIAL_OWNER);
        console.log("\n=== Next Steps ===");
        console.log("1. Update frontend config with PROXY addresses (not implementation)");
        console.log("2. Update frontend to use PIZZA token instead of VMF");
        console.log("3. Migrate player stats using migratePlayerStats()");
        console.log("4. Owner fee is already set to 3% (300 BPS)");
        console.log("5. Treasury needs to approve PizzaPartyV2 Proxy for weekly jackpot");
        console.log("\n=== Upgrade Instructions ===");
        console.log("To upgrade PizzaPartyV2:");
        console.log("  1. Deploy new implementation");
        console.log("  2. Call pizzaParty.upgradeToAndCall(newImpl, data)");
        console.log("To upgrade PizzaParlorManager:");
        console.log("  1. Deploy new implementation");
        console.log("  2. Call parlorManager.upgradeToAndCall(newImpl, data)");
    }
}

/**
 * @title UpgradePizzaPartyV2
 * @dev Script to upgrade PizzaPartyV2 to a new implementation
 *
 * Usage:
 * PIZZA_PARTY_PROXY=0x... forge script script/DeployPizzaParlorsUpgradeable.s.sol:UpgradePizzaPartyV2 \
 *   --rpc-url $BASE_RPC_URL \
 *   --broadcast \
 *   --verify \
 *   -vvvv
 */
contract UpgradePizzaPartyV2 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PIZZA_PARTY_PROXY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("New PizzaPartyV2 Implementation:", address(newImpl));

        // Upgrade proxy to new implementation
        PizzaPartyV2Upgradeable proxy = PizzaPartyV2Upgradeable(proxyAddress);
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("PizzaPartyV2 upgraded to new implementation");

        vm.stopBroadcast();
    }
}

/**
 * @title UpgradePizzaParlorManager
 * @dev Script to upgrade PizzaParlorManager to a new implementation
 *
 * Usage:
 * PARLOR_MANAGER_PROXY=0x... forge script script/DeployPizzaParlorsUpgradeable.s.sol:UpgradePizzaParlorManager \
 *   --rpc-url $BASE_RPC_URL \
 *   --broadcast \
 *   --verify \
 *   -vvvv
 */
contract UpgradePizzaParlorManager is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PARLOR_MANAGER_PROXY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New PizzaParlorManager Implementation:", address(newImpl));

        // Upgrade proxy to new implementation
        PizzaParlorManagerUpgradeable proxy = PizzaParlorManagerUpgradeable(proxyAddress);
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("PizzaParlorManager upgraded to new implementation");

        vm.stopBroadcast();
    }
}
