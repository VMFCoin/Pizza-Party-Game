// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaParlorManagerUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeSliceSentTracking
 * @notice Deploys new ParlorManager implementation with slice-sent tracking
 * @dev Fixes bug where sponsors could send multiple slices per day because
 *      the daily limit only checked CLAIMED slices, not SENT slices.
 *      New tracking: lastSliceSentDayId and slicesSentToday mappings.
 *
 * Run: forge script script/UpgradeSliceSentTracking.s.sol:UpgradeSliceSentTracking --rpc-url base --broadcast
 */
contract UpgradeSliceSentTracking is Script {
    // Proxy addresses on Base mainnet
    address constant PARLOR_MANAGER_PROXY = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new ParlorManager implementation
        PizzaParlorManagerUpgradeable newParlorManagerImpl = new PizzaParlorManagerUpgradeable();
        console.log("New ParlorManager implementation deployed at:", address(newParlorManagerImpl));

        // 2. Upgrade the proxy to the new implementation
        UUPSUpgradeable(PARLOR_MANAGER_PROXY).upgradeToAndCall(
            address(newParlorManagerImpl),
            "" // No initialization call needed
        );
        console.log("ParlorManager proxy upgraded to new implementation");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Upgrade Complete ===");
        console.log("ParlorManager proxy:", PARLOR_MANAGER_PROXY);
        console.log("New implementation:", address(newParlorManagerImpl));
        console.log("");
        console.log("FIX: Sponsors can now only SEND 1 slice per day (tracked at send time, not claim time)");
    }
}
