// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

interface IPizzaParty {
    function owner() external view returns (address);
    function upgradeToAndCall(address newImpl, bytes calldata data) external;
}

/**
 * @title UpgradePizzaPartySettlementAuth
 * @notice Adds onlyOwner to settleDailyGameWithUsd and settleWeeklyGameWithUsd
 *         to prevent front-running of USD value snapshots.
 *
 * Usage:
 *   Dry run:  forge script script/UpgradePizzaPartySettlementAuth.s.sol --rpc-url https://mainnet.base.org
 *   Deploy:   forge script script/UpgradePizzaPartySettlementAuth.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract UpgradePizzaPartySettlementAuth is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        IPizzaParty proxy = IPizzaParty(PIZZA_PARTY_PROXY);

        console.log("=================================================");
        console.log("UPGRADE PIZZA PARTY - SETTLEMENT AUTH");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Current owner:", proxy.owner());

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation with PizzaPartyV2Upgradeable
        // The contract is too large for inline deployment, use create
        address newImpl = _deployImpl();
        console.log("New implementation:", newImpl);
        proxy.upgradeToAndCall(newImpl, "");

        vm.stopBroadcast();

        console.log("");
        console.log("UPGRADE COMPLETE!");
        console.log("settleDailyGameWithUsd: now onlyOwner");
        console.log("settleWeeklyGameWithUsd: now onlyOwner");
    }

    function _deployImpl() internal returns (address) {
        bytes memory bytecode = vm.getCode("PizzaPartyV2Upgradeable.sol:PizzaPartyV2Upgradeable");
        address impl;
        assembly {
            impl := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(impl != address(0), "deploy failed");
        return impl;
    }
}
