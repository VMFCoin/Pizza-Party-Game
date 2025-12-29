// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeParlorManagerCompensate
 * @dev Adds addClaimableBalance function and compensates owners for lost fees
 *
 * Owners owed PIZZA due to storage corruption:
 * - Owner 1 (0x5989...): Had 5.57, now has 3.76, owed 1.82 PIZZA
 * - Owner 3 (0x46e9...): Had 20.41, now has 9.39, owed 11.02 PIZZA
 *
 * Usage:
 * forge script script/UpgradeParlorManagerCompensate.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeParlorManagerCompensate is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    // Owners to compensate
    address constant OWNER1 = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765;
    address constant OWNER3 = 0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF;

    // Amounts owed (calculated from pre-corruption balances)
    // Owner 1: 5.572952801521663104 - 3.755437520099956262 = 1.817515281421706842
    uint256 constant OWNER1_OWED = 1817515281421706842;
    // Owner 3: 20.412290590999264925 - 9.388593800249890655 = 11.023696790749374270
    uint256 constant OWNER3_OWED = 11023696790749374270;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("COMPENSATING PARLOR OWNERS FOR LOST FEES");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Proxy:", PARLOR_MANAGER_PROXY);

        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        console.log("");
        console.log("=== BEFORE COMPENSATION ===");
        console.log("Owner 1 (0x5989) claimable:", manager.claimableBalance(OWNER1));
        console.log("Owner 3 (0x46e9) claimable:", manager.claimableBalance(OWNER3));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with addClaimableBalance
        console.log("");
        console.log("--- Deploying new implementation ---");
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation:", address(newImpl));

        // Upgrade
        console.log("");
        console.log("--- Upgrading proxy ---");
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // Compensate owners
        console.log("");
        console.log("--- Compensating owners ---");

        console.log("Adding", OWNER1_OWED, "to Owner 1");
        manager.addClaimableBalance(OWNER1, OWNER1_OWED);

        console.log("Adding", OWNER3_OWED, "to Owner 3");
        manager.addClaimableBalance(OWNER3, OWNER3_OWED);

        vm.stopBroadcast();

        // Verify
        console.log("");
        console.log("=== AFTER COMPENSATION ===");
        console.log("Owner 1 (0x5989) claimable:", manager.claimableBalance(OWNER1));
        console.log("Owner 3 (0x46e9) claimable:", manager.claimableBalance(OWNER3));

        console.log("");
        console.log("Compensation complete!");
    }
}
