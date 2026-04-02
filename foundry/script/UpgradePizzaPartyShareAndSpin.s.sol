// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";

/**
 * @title UpgradePizzaPartyShareAndSpin
 * @notice Upgrades PizzaParty with:
 *         - Referral system disabled (_processReferral removed from both entry functions)
 *         - shareAndSpinContract storage var added (slot 31)
 *         - addToppingsFromShareAndSpin() bridge function
 *         - adminSetShareAndSpinContract() admin setter
 *
 * BEFORE RUNNING:
 *   forge inspect PizzaPartyV2Upgradeable storage-layout > before.json
 *
 * AFTER RUNNING:
 *   forge inspect PizzaPartyV2Upgradeable storage-layout > after.json
 *   diff before.json after.json
 *   Only slot 31 (shareAndSpinContract) should be new.
 *
 * Usage:
 *   Dry run:  forge script script/UpgradePizzaPartyShareAndSpin.s.sol --rpc-url $BASE_RPC
 *   Deploy:   forge script script/UpgradePizzaPartyShareAndSpin.s.sol --rpc-url $BASE_RPC --broadcast --verify
 */
contract UpgradePizzaPartyShareAndSpin is Script {
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaPartyV2Upgradeable proxy = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        console.log("=================================================");
        console.log("UPGRADE PIZZA PARTY - SHARE & SPIN BRIDGE");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("");
        console.log("BEFORE UPGRADE:");
        console.log("  dailyGameId:", proxy.dailyGameId());
        console.log("  weeklyGameId:", proxy.weeklyGameId());
        console.log("  treasuryWallet:", proxy.treasuryWallet());

        vm.startBroadcast(deployerPrivateKey);

        PizzaPartyV2Upgradeable newImpl = new PizzaPartyV2Upgradeable();
        console.log("");
        console.log("New implementation:", address(newImpl));

        proxy.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("");
        console.log("AFTER UPGRADE:");
        console.log("  shareAndSpinContract:", proxy.shareAndSpinContract());
        console.log("  dailyGameId:", proxy.dailyGameId());
        console.log("  weeklyGameId:", proxy.weeklyGameId());
        console.log("");
        console.log("=================================================");
        console.log("UPGRADE COMPLETE!");
        console.log("=================================================");
        console.log("");
        console.log("Next: Deploy ShareAndSpin contract, then call:");
        console.log("  adminSetShareAndSpinContract(shareAndSpinProxy)");
    }
}
