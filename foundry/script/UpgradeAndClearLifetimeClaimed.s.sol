// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeAndClearLifetimeClaimed
 * @notice Upgrades the staking contract and clears lifetimeClaimed for old token stakers
 * @dev Run with: forge script script/UpgradeAndClearLifetimeClaimed.s.sol --rpc-url base --broadcast --verify
 */
contract UpgradeAndClearLifetimeClaimed is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Old stakers who were refunded and need lifetimeClaimed cleared
        address[] memory oldStakers = new address[](3);
        oldStakers[0] = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765;
        oldStakers[1] = 0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF;
        oldStakers[2] = 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66;

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaStakingV1Upgradeable newImplementation = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImplementation));

        // Upgrade proxy to new implementation
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImplementation), "");
        console.log("Proxy upgraded successfully");

        // Log old lifetimeClaimed values
        console.log("");
        console.log("=== BEFORE CLEARING ===");
        for (uint256 i = 0; i < oldStakers.length; i++) {
            uint256 claimed = proxy.lifetimeClaimed(oldStakers[i]);
            console.log("Staker", i, ":", oldStakers[i]);
            console.log("  lifetimeClaimed:", claimed / 1e18, "PIZZA");
        }

        // Clear lifetimeClaimed for old stakers
        console.log("");
        console.log("Clearing lifetimeClaimed...");
        proxy.adminClearLifetimeClaimed(oldStakers);

        // Verify cleared
        console.log("");
        console.log("=== AFTER CLEARING ===");
        for (uint256 i = 0; i < oldStakers.length; i++) {
            uint256 claimed = proxy.lifetimeClaimed(oldStakers[i]);
            console.log("Staker", i, ":", oldStakers[i]);
            console.log("  lifetimeClaimed:", claimed, "(should be 0)");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== UPGRADE AND CLEAR COMPLETE ===");
        console.log("Proxy address:", STAKING_PROXY);
        console.log("New implementation:", address(newImplementation));
    }
}
