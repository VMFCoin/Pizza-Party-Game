// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title UpgradeStakingEmergencyRefund
 * @notice Upgrades the staking contract to add adminEmergencyRefund function
 * @dev Run with: forge script script/UpgradeStakingEmergencyRefund.s.sol --rpc-url base --broadcast --verify
 */
contract UpgradeStakingEmergencyRefund is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaStakingV1Upgradeable newImplementation = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImplementation));

        // Upgrade proxy to new implementation
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImplementation), "");
        console.log("Proxy upgraded successfully");

        vm.stopBroadcast();

        console.log("");
        console.log("=== UPGRADE COMPLETE ===");
        console.log("Proxy address:", STAKING_PROXY);
        console.log("New implementation:", address(newImplementation));
        console.log("");
        console.log("Next step: Call adminEmergencyRefund with staker addresses to refund");
    }
}
