// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaTippingVaultUpgradeable.sol";

/**
 * @title UpgradeTippingVaultLifetimeStats
 * @notice Upgrade the deployed PizzaTippingVault to add lifetime tip stats.
 *
 * Storage change: 4 NEW slots appended at end (slots 9-12).
 * - lifetimeTipsSent[user]
 * - lifetimeTipsReceived[user]
 * - lifetimeTipsSentCount[user]
 * - lifetimeTipsReceivedCount[user]
 *
 * Existing data (tipBalance, usedCastHashes, limits) preserved at slots 0-8.
 *
 * Run: forge script script/UpgradeTippingVaultLifetimeStats.s.sol:UpgradeTippingVaultLifetimeStats \
 *      --rpc-url https://mainnet.base.org --broadcast
 */
contract UpgradeTippingVaultLifetimeStats is Script {
    address constant VAULT_PROXY = 0x11Bd5Ed7f00cA0D2492F1b8B073d92F733676551;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // Deploy new implementation
        PizzaTippingVaultUpgradeable newImpl = new PizzaTippingVaultUpgradeable();
        console.log("New implementation:", address(newImpl));

        // Upgrade proxy
        PizzaTippingVaultUpgradeable proxy = PizzaTippingVaultUpgradeable(VAULT_PROXY);
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded.");

        // Sanity-check existing state preserved
        console.log("paused:           ", proxy.paused());
        console.log("backendSigner:    ", proxy.backendSigner());
        console.log("stakingContract:  ", proxy.stakingContract());
        console.log("treasury:         ", proxy.treasury());
        console.log("minTipAmount:     ", proxy.minTipAmount());
        console.log("maxTipPerCast:    ", proxy.maxTipPerCast());
        console.log("maxCreditPerTx:   ", proxy.maxCreditPerTx());

        // Sanity-check lifetime stats are now readable (should be 0 for any address pre-upgrade)
        address sample = 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66;
        console.log("sample lifetimeTipsSent (should be 0):", proxy.lifetimeTipsSent(sample));

        vm.stopBroadcast();

        console.log("\n=== UPGRADE COMPLETE ===");
        console.log("Lifetime tip stats now active. Existing tipBalances preserved.");
    }
}
