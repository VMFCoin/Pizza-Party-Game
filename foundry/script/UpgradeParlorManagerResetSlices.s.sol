// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaParlorManagerUpgradeable} from "../src/PizzaParlorManagerUpgradeable.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

/**
 * @title UpgradeParlorManagerResetSlices
 * @dev Upgrade ParlorManager to add resetSliceCounters admin function, then reset slice counters for testing
 *
 * Run commands:
 * - Dry run: forge script script/UpgradeParlorManagerResetSlices.s.sol --rpc-url https://mainnet.base.org
 * - Deploy: PRIVATE_KEY="0x..." BASESCAN_API_KEY="..." forge script script/UpgradeParlorManagerResetSlices.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeParlorManagerResetSlices is Script {
    // Proxy address for ParlorManager
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    // Sponsors who need slice counters reset
    address[] public sponsors;

    function setUp() public {
        sponsors.push(0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765); // WE-TODD-DID PIZZA
        sponsors.push(0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF); // Amici
        sponsors.push(0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66); // Backdoor Delivery
        sponsors.push(0xC77dA8cB158BA77BaC765625745a766Af3111A69); // 4th sponsor
    }

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        PizzaParlorManagerUpgradeable proxy = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        console.log("=== BEFORE UPGRADE ===");
        console.log("ParlorManager proxy:", PARLOR_MANAGER_PROXY);

        // Log current slice usage
        for (uint256 i = 0; i < sponsors.length; i++) {
            uint256 used = proxy.slicesUsedThisGame(sponsors[i]);
            string memory name = proxy.parlorName(sponsors[i]);
            console.log("Sponsor:", sponsors[i]);
            console.log("  Name:", name);
            console.log("  Slices used:", used);
        }

        // Step 1: Deploy new implementation
        console.log("\n=== DEPLOYING NEW IMPLEMENTATION ===");
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New implementation:", address(newImpl));

        // Step 2: Upgrade proxy to new implementation
        console.log("\n=== UPGRADING PROXY ===");
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade complete!");

        // Step 3: Reset slice counters for all sponsors
        console.log("\n=== RESETTING SLICE COUNTERS ===");
        proxy.resetSliceCounters(sponsors);
        console.log("Slice counters reset for", sponsors.length, "sponsors");

        // Verify the reset worked
        console.log("\n=== AFTER RESET ===");
        for (uint256 i = 0; i < sponsors.length; i++) {
            uint256 used = proxy.slicesUsedThisGame(sponsors[i]);
            uint256 remaining = proxy.slicesRemainingToday(sponsors[i]);
            string memory name = proxy.parlorName(sponsors[i]);
            console.log("Sponsor:", sponsors[i]);
            console.log("  Name:", name);
            console.log("  Slices used:", used);
            console.log("  Slices remaining:", remaining);
        }

        vm.stopBroadcast();
    }
}
