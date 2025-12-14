// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployV2System
 * @dev Deploys the complete V2 system: PizzaPartyV2 + PizzaParlorManager (both UUPS proxies)
 *
 * IMPORTANT: This script does NOT broadcast by default.
 * - Dry run: forge script script/DeployV2System.s.sol --fork-url $BASE_RPC
 * - Deploy: forge script script/DeployV2System.s.sol --fork-url $BASE_RPC --broadcast
 *
 * POST-DEPLOY WIRING (manual steps after deployment):
 * 1. PizzaPartyV2.setParlorManager(parlorManagerProxy)
 * 2. PizzaPartyV2.transferOwnership(parlorManagerProxy)
 *    - This routes owner fees (3%) to the ParlorManager for franchise distribution
 * 3. Treasury wallet must approve PizzaPartyV2 proxy for weekly jackpot pulls
 *    - PIZZA.approve(pizzaPartyProxy, type(uint256).max)
 */
contract DeployV2System is Script {
    // Base mainnet addresses
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;
    address constant TREASURY_WALLET = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;
    address constant OPS_WALLET = 0x828F516b379A2532bB33a00d34125560BF4c1853;
    address constant OWNER_WALLET = 0x29F817c9931B98Ae84C9e0FF0426971BdC8bB2B6;

    function run() external {
        // Load environment
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        address treasuryWallet = TREASURY_WALLET;
        address opsWallet = OPS_WALLET;
        address ownerWallet = OWNER_WALLET;

        console.log("===========================================");
        console.log("DEPLOYING V2 SYSTEM (DRY RUN by default)");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("PIZZA Token:", PIZZA_TOKEN);
        console.log("Treasury:", treasuryWallet);
        console.log("Ops:", opsWallet);
        console.log("Owner:", ownerWallet);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ============ Deploy PizzaPartyV2Upgradeable ============
        console.log("--- Deploying PizzaPartyV2Upgradeable ---");

        PizzaPartyV2Upgradeable partyImpl = new PizzaPartyV2Upgradeable();
        console.log("PizzaParty Implementation:", address(partyImpl));

        bytes memory partyInitData = abi.encodeWithSelector(
            PizzaPartyV2Upgradeable.initialize.selector,
            PIZZA_TOKEN,
            treasuryWallet,
            new address[](0), // No charities initially
            ownerWallet       // Initial owner (will transfer to ParlorManager later)
        );

        ERC1967Proxy partyProxy = new ERC1967Proxy(address(partyImpl), partyInitData);
        console.log("PizzaParty Proxy:", address(partyProxy));

        // ============ Deploy PizzaParlorManagerUpgradeable ============
        console.log("");
        console.log("--- Deploying PizzaParlorManagerUpgradeable ---");

        PizzaParlorManagerUpgradeable managerImpl = new PizzaParlorManagerUpgradeable();
        console.log("ParlorManager Implementation:", address(managerImpl));

        bytes memory managerInitData = abi.encodeWithSelector(
            PizzaParlorManagerUpgradeable.initialize.selector,
            address(partyProxy), // PizzaParty proxy address
            treasuryWallet,
            opsWallet,
            ownerWallet          // Owner of the manager
        );

        ERC1967Proxy managerProxy = new ERC1967Proxy(address(managerImpl), managerInitData);
        console.log("ParlorManager Proxy:", address(managerProxy));

        vm.stopBroadcast();

        // ============ Verification ============
        console.log("");
        console.log("===========================================");
        console.log("DEPLOYMENT COMPLETE - VERIFY:");
        console.log("===========================================");

        PizzaPartyV2Upgradeable party = PizzaPartyV2Upgradeable(address(partyProxy));
        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(address(managerProxy));

        console.log("");
        console.log("PizzaPartyV2:");
        console.log("  Proxy:", address(partyProxy));
        console.log("  Owner:", party.owner());
        console.log("  Treasury:", party.treasuryWallet());
        console.log("  HoldingsUnitPizza:", party.holdingsUnitPizza());
        console.log("  OwnerFeeBPS:", party.ownerFeeBPS());

        console.log("");
        console.log("ParlorManager:");
        console.log("  Proxy:", address(managerProxy));
        console.log("  Owner:", manager.owner());
        console.log("  PizzaParty:", manager.pizzaParty());
        console.log("  Treasury:", manager.treasuryWallet());
        console.log("  OpsWallet:", manager.opsWallet());
        console.log("  ParlorPrice:", manager.parlorPrice());

        // ============ Post-Deploy Wiring Instructions ============
        console.log("");
        console.log("===========================================");
        console.log("POST-DEPLOY WIRING (run manually):");
        console.log("===========================================");
        console.log("");
        console.log("1. Set ParlorManager on PizzaParty:");
        console.log("   PizzaPartyV2(%s).setParlorManager(%s)", address(partyProxy), address(managerProxy));
        console.log("");
        console.log("2. Transfer PizzaParty ownership to ParlorManager:");
        console.log("   PizzaPartyV2(%s).transferOwnership(%s)", address(partyProxy), address(managerProxy));
        console.log("   (This routes owner fees to ParlorManager for franchise distribution)");
        console.log("");
        console.log("3. Treasury must approve PizzaParty for weekly jackpot:");
        console.log("   From treasury wallet, call:");
        console.log("   PIZZA(%s).approve(%s, type(uint256).max)", PIZZA_TOKEN, address(partyProxy));
        console.log("");
        console.log("4. (Optional) Update holdingsUnitPizza if PIZZA price changed:");
        console.log("   PizzaPartyV2(%s).setHoldingsUnitPizza(newUnit)", address(partyProxy));
        console.log("   Formula: newUnit = (10 USD / pricePerPizza) * 1e18");
    }
}
