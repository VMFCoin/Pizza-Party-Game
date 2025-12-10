// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PizzaPartyV2.sol";
import "../src/PizzaParlorManager.sol";

/**
 * @title DeployPizzaParlors
 * @dev Deployment script for PizzaPartyV2 and PizzaParlorManager
 *
 * Deployment Steps:
 * 1. Deploy PizzaPartyV2 with $PIZZA token
 * 2. Deploy PizzaParlorManager
 * 3. Set PizzaParlorManager as the parlorManager in PizzaPartyV2
 * 4. Transfer ownership of PizzaPartyV2 to PizzaParlorManager (for owner fee routing)
 * 5. Set owner fee on PizzaPartyV2 (optional, can be done later)
 *
 * Usage:
 * forge script script/DeployPizzaParlors.s.sol:DeployPizzaParlors \
 *   --rpc-url $BASE_RPC_URL \
 *   --broadcast \
 *   --verify \
 *   -vvvv
 */
contract DeployPizzaParlors is Script {
    // $PIZZA token on Base mainnet
    address constant PIZZA_TOKEN = 0xCdcb34E2a296DdeBfb6675185BdC26B5bb4FADE6;

    // Treasury wallet (receives charity funds, weekly jackpot source)
    address constant TREASURY = 0x828F516b379A2532bB33a00d34125560BF4c1853;

    // Ops wallet (receives portion of parlor sales and owner fees)
    address constant OPS = 0x828F516b379A2532bB33a00d34125560BF4c1853; // Update this

    // Initial owner (admin who can configure contracts)
    address constant INITIAL_OWNER = 0x828F516b379A2532bB33a00d34125560BF4c1853;

    // Starting game IDs (continue from existing contract)
    // Check current values from existing PizzaParty contract before deploying
    uint256 constant STARTING_DAILY_GAME_ID = 1;  // Update based on current state
    uint256 constant STARTING_WEEKLY_GAME_ID = 1; // Update based on current state

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy PizzaPartyV2
        address[] memory charities = new address[](0); // Use default charities
        PizzaPartyV2 pizzaParty = new PizzaPartyV2(
            PIZZA_TOKEN,
            TREASURY,
            charities,
            INITIAL_OWNER,
            STARTING_DAILY_GAME_ID,
            STARTING_WEEKLY_GAME_ID
        );
        console.log("PizzaPartyV2 deployed at:", address(pizzaParty));

        // 2. Deploy PizzaParlorManager
        PizzaParlorManager parlorManager = new PizzaParlorManager(
            PIZZA_TOKEN,
            address(pizzaParty),
            TREASURY,
            OPS,
            INITIAL_OWNER
        );
        console.log("PizzaParlorManager deployed at:", address(parlorManager));

        // 3. Set PizzaParlorManager as parlorManager in PizzaPartyV2
        pizzaParty.setParlorManager(address(parlorManager));
        console.log("ParlorManager set in PizzaPartyV2");

        // 4. Transfer ownership of PizzaPartyV2 to PizzaParlorManager
        // This routes owner fees to the parlor manager for distribution
        pizzaParty.transferOwnership(address(parlorManager));
        console.log("Ownership of PizzaPartyV2 transferred to PizzaParlorManager");

        // 5. Optionally set owner fee (0-5%)
        // Uncomment to enable owner fee (in basis points, e.g., 200 = 2%)
        // pizzaParty.setOwnerFee(200);
        // console.log("Owner fee set to 2%");

        vm.stopBroadcast();

        // Log summary
        console.log("\n=== Deployment Summary ===");
        console.log("PIZZA Token:", PIZZA_TOKEN);
        console.log("PizzaPartyV2:", address(pizzaParty));
        console.log("PizzaParlorManager:", address(parlorManager));
        console.log("Treasury:", TREASURY);
        console.log("Ops:", OPS);
        console.log("\n=== Next Steps ===");
        console.log("1. Update frontend config with new contract addresses");
        console.log("2. Update frontend to use PIZZA token instead of VMF");
        console.log("3. Migrate player stats using migratePlayerStats()");
        console.log("4. Set owner fee using setOwnerFee() if desired");
        console.log("5. Treasury needs to approve PizzaPartyV2 for weekly jackpot");
    }
}

/**
 * @title SetOwnerFee
 * @dev Script to set owner fee after deployment
 *
 * Usage:
 * forge script script/DeployPizzaParlors.s.sol:SetOwnerFee \
 *   --rpc-url $BASE_RPC_URL \
 *   --broadcast \
 *   -vvvv
 */
contract SetOwnerFee is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address pizzaPartyAddress = vm.envAddress("PIZZA_PARTY_ADDRESS");
        uint256 feeBPS = vm.envUint("OWNER_FEE_BPS"); // e.g., 200 for 2%

        vm.startBroadcast(deployerPrivateKey);

        PizzaPartyV2 pizzaParty = PizzaPartyV2(pizzaPartyAddress);
        pizzaParty.setOwnerFee(feeBPS);

        console.log("Owner fee set to", feeBPS, "BPS");

        vm.stopBroadcast();
    }
}
