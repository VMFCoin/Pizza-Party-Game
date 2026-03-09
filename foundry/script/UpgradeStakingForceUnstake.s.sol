// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingForceUnstake
 * @notice Upgrades staking contract to add adminForceUnstakeTo, then executes it
 *         to seize banned user's staked PIZZA and send to ParlorManager for fee distribution
 *
 * @dev Run with:
 *   forge script script/UpgradeStakingForceUnstake.s.sol --rpc-url base --broadcast --verify
 *
 * After this script runs, call allocateFees() on ParlorManager to distribute to parlor owners.
 */
contract UpgradeStakingForceUnstake is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant PARLOR_MANAGER = 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b;

    // @budinmyhat banned wallets (FID 1547858 + FID 1548166)
    address constant BUDINMYHAT_1 = 0x3dC73d745F75208cAEb61886D68Efef30CC22835;
    address constant BUDINMYHAT_2 = 0xF1FffB1f661803958ba7f656484Bd6f9294f64D6;
    address constant BUDINMYHAT_3 = 0x9A822ED47EA00D9487E63eD3FBE90D4cC45034E0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(STAKING_PROXY);

        // Step 1: Deploy new implementation with adminForceUnstakeTo
        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImpl));

        // Step 2: Upgrade proxy
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded successfully");

        // Step 3: Check balances before
        (uint256 totalBefore1,,,,,,) = proxy.getStakeInfo(BUDINMYHAT_1);
        (uint256 totalBefore2,,,,,,) = proxy.getStakeInfo(BUDINMYHAT_2);
        (uint256 totalBefore3,,,,,,) = proxy.getStakeInfo(BUDINMYHAT_3);
        console.log("Staked by wallet 1:", totalBefore1 / 1e18, "PIZZA");
        console.log("Staked by wallet 2:", totalBefore2 / 1e18, "PIZZA");
        console.log("Staked by wallet 3:", totalBefore3 / 1e18, "PIZZA");

        uint256 totalToSeize = totalBefore1 + totalBefore2 + totalBefore3;
        console.log("Total to seize:", totalToSeize / 1e18, "PIZZA");

        // Step 4: Force unstake all banned wallets, send to ParlorManager
        address[] memory bannedStakers = new address[](3);
        bannedStakers[0] = BUDINMYHAT_1;
        bannedStakers[1] = BUDINMYHAT_2;
        bannedStakers[2] = BUDINMYHAT_3;

        proxy.adminForceUnstakeTo(bannedStakers, PARLOR_MANAGER);
        console.log("Force unstake complete - tokens sent to ParlorManager");

        vm.stopBroadcast();

        console.log("");
        console.log("=== FORCE UNSTAKE COMPLETE ===");
        console.log("Seized PIZZA sent to ParlorManager:", PARLOR_MANAGER);
        console.log("");
        console.log("NEXT STEP: Call allocateFees() on ParlorManager to distribute to parlor owners");
        console.log("  cast send", PARLOR_MANAGER, '"allocateFees()" --private-key $PRIVATE_KEY --rpc-url base');
    }
}
