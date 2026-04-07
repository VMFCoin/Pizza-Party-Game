// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingSecurity
 * @notice Post-exploit hardening:
 *         - EOA check on recordSpin (prevents contract selective-revert attacks)
 *
 * Usage:
 *   Dry run:  forge script script/UpgradeStakingSecurity.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradeStakingSecurity.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradeStakingSecurity is Script {
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(STAKING_PROXY);

        console.log("=================================================");
        console.log("UPGRADE STAKING - SECURITY HARDENING");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Current owner:", proxy.owner());

        vm.startBroadcast(deployerPrivateKey);

        PizzaStakingV1Upgradeable newImpl = new PizzaStakingV1Upgradeable();
        console.log("New implementation:", address(newImpl));
        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("recordSpin() now requires tx.origin == msg.sender");
    }
}
