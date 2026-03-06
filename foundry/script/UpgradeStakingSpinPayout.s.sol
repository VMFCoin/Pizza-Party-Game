// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingSpinPayout
 * @notice Fixes claimAfterSpin() and restake() to honor the committed spin outcome
 * @dev Both functions were ignoring the spin multiplier and jackpot bonus:
 *      - claimAfterSpin() was calling _claimAllRewards(false) which skipped spin
 *      - restake() used _calculateTotalPendingRewards() which assumes 1x
 *
 * After this upgrade:
 *      - claimAfterSpin() calls _claimAllRewards(true) to apply spin outcome
 *      - restake() calculates rewards with spin multiplier + jackpot bonus
 *      - Both WALLET and STAKE buttons now pay the correct spin result
 */
contract UpgradeStakingSpinPayout is Script {
    // Base mainnet staking proxy
    address constant PIZZA_STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImpl));

        // Upgrade proxy to new implementation
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(PIZZA_STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded successfully");

        // Verify the upgrade
        console.log("Spin enabled:", proxy.spinEnabled());
        console.log("Total staked:", proxy.totalStaked());
        console.log("Staker count:", proxy.stakerCount());

        vm.stopBroadcast();

        console.log("\n=== UPGRADE COMPLETE ===");
        console.log("claimAfterSpin() and restake() now honor the committed spin outcome");
        console.log("Jackpot winners will receive 4x multiplier + 10M PIZZA bonus");
    }
}
