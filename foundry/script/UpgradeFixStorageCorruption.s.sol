// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaParlorManagerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeFixStorageCorruption
 * @notice Fixes storage corruption from commit 8a76608 that broke claimableBalance
 *
 * BUG: Adding lastSliceSentDayId and slicesSentToday in the MIDDLE of storage layout
 *      shifted all subsequent storage slots, corrupting claimableBalance.
 *
 * FIX: Move new mappings to END of storage (before __gap) to restore correct layout.
 *      Reset all corrupted claimableBalance values to 0.
 *      Call allocateFees() to properly distribute any pending fees.
 *
 * Run: forge script script/UpgradeFixStorageCorruption.s.sol:UpgradeFixStorageCorruption --rpc-url base --broadcast
 */
contract UpgradeFixStorageCorruption is Script {
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        PizzaParlorManagerUpgradeable manager = PizzaParlorManagerUpgradeable(PARLOR_MANAGER_PROXY);

        // Get all parlor owners to reset their corrupted balances
        uint256 ownerCount = manager.parlorOwnersCount();
        console.log("=== STORAGE CORRUPTION FIX ===");
        console.log("Parlor owners count:", ownerCount);

        // Collect all owner addresses
        address[] memory owners = new address[](ownerCount);
        for (uint256 i = 0; i < ownerCount; i++) {
            owners[i] = manager.parlorOwnerAt(i);
            console.log("Owner", i, ":", owners[i]);
            console.log("  Corrupted balance:", manager.claimableBalance(owners[i]));
        }

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new implementation with fixed storage layout
        PizzaParlorManagerUpgradeable newImpl = new PizzaParlorManagerUpgradeable();
        console.log("");
        console.log("New implementation deployed at:", address(newImpl));

        // 2. Upgrade the proxy
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded to fixed implementation");

        // 3. Reset ALL corrupted claimable balances to 0
        console.log("");
        console.log("--- Resetting corrupted balances ---");
        for (uint256 i = 0; i < ownerCount; i++) {
            manager.resetClaimableBalance(owners[i]);
            console.log("Reset balance for:", owners[i]);
        }

        // 4. Allocate fees properly with the fixed contract
        console.log("");
        console.log("--- Allocating fees with fixed contract ---");
        manager.allocateFees();
        console.log("Fees allocated!");

        vm.stopBroadcast();

        // Verify the fix
        console.log("");
        console.log("=== VERIFICATION ===");
        for (uint256 i = 0; i < ownerCount; i++) {
            console.log("Owner", i, "new balance:", manager.claimableBalance(owners[i]));
        }

        console.log("");
        console.log("=== FIX COMPLETE ===");
        console.log("Storage layout restored. claimableBalance now reads from correct slot.");
    }
}
