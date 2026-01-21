// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaParlorManagerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title ResetAllSliceHistory
 * @notice Upgrades ParlorManager and resets ALL slice history for a clean slate
 * @dev This wipes all slice tracking so everyone can send slices fresh
 *
 * Run: forge script script/ResetAllSliceHistory.s.sol:ResetAllSliceHistory --rpc-url base --broadcast
 */
contract ResetAllSliceHistory is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new ParlorManager implementation with updated resetSliceCounters
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("New ParlorManager implementation:", address(newImpl));

        // 2. Upgrade the proxy
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(
            address(newImpl),
            ""
        );
        console.log("Proxy upgraded");

        // 3. Get all parlor owners and reset their slice history
        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);
        uint256 ownerCount = manager.parlorOwnersCount();
        console.log("Total parlor owners:", ownerCount);

        // Build array of all parlor owners
        address[] memory allOwners = new address[](ownerCount);
        for (uint256 i = 0; i < ownerCount; i++) {
            allOwners[i] = manager.parlorOwnerAt(i);
        }

        // Reset all slice counters
        manager.resetSliceCounters(allOwners);
        console.log("Reset slice history for all", ownerCount, "parlor owners");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Clean Slate Complete ===");
        console.log("All parlor owners can now send slices fresh!");
        console.log("50/50 split rules still apply for first slice only.");
    }
}
