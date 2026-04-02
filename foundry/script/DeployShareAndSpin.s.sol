// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DeployShareAndSpin
 * @notice Deploys ShareAndSpinUpgradeable as UUPS proxy and wires everything:
 *         1. Deploys implementation + proxy with initialize()
 *         2. Calls adminSetShareAndSpinContract() on PizzaParty
 *         3. Sets initial shareRewardAmount
 *
 * PREREQUISITES:
 *   - PizzaParty must already be upgraded with the bridge function
 *   - Run UpgradePizzaPartyShareAndSpin.s.sol first
 *
 * AFTER DEPLOY (manual, from treasury wallet):
 *   pizza.approve(shareAndSpinProxy, type(uint256).max)
 *
 * Usage:
 *   Dry run:  forge script script/DeployShareAndSpin.s.sol --rpc-url $BASE_RPC
 *   Deploy:   forge script script/DeployShareAndSpin.s.sol --rpc-url $BASE_RPC --broadcast --verify
 */
contract DeployShareAndSpin is Script {
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant OWNER_WALLET = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;
    address constant TREASURY_WALLET = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;

    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        PizzaPartyV2Upgradeable pizzaParty = PizzaPartyV2Upgradeable(PIZZA_PARTY_PROXY);

        console.log("=================================================");
        console.log("DEPLOY SHARE & SPIN CONTRACT");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("PIZZA Token:", PIZZA_TOKEN);
        console.log("PizzaParty:", PIZZA_PARTY_PROXY);
        console.log("Treasury:", TREASURY_WALLET);
        console.log("Owner:", OWNER_WALLET);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ============ Deploy ShareAndSpin ============

        ShareAndSpinUpgradeable snsImpl = new ShareAndSpinUpgradeable();
        console.log("ShareAndSpin Implementation:", address(snsImpl));

        bytes memory initData = abi.encodeWithSelector(
            ShareAndSpinUpgradeable.initialize.selector,
            PIZZA_TOKEN,
            PIZZA_PARTY_PROXY,
            TREASURY_WALLET,
            OWNER_WALLET
        );

        ERC1967Proxy snsProxy = new ERC1967Proxy(address(snsImpl), initData);
        console.log("ShareAndSpin Proxy:", address(snsProxy));

        ShareAndSpinUpgradeable sns = ShareAndSpinUpgradeable(address(snsProxy));

        // ============ Wire PizzaParty to accept calls from ShareAndSpin ============

        pizzaParty.adminSetShareAndSpinContract(address(snsProxy));
        console.log("");
        console.log("Wired PizzaParty.shareAndSpinContract:", pizzaParty.shareAndSpinContract());

        // ============ Set initial share reward (~$0.01 worth of PIZZA) ============
        // At $0.000001/PIZZA: $0.01 = 10,000 PIZZA = 10_000e18
        // Update this with your current price before deploying!
        uint256 initialReward = 10_000 * 1e18;
        sns.adminSetShareRewardAmount(initialReward);
        console.log("Initial shareRewardAmount:", initialReward / 1e18, "PIZZA");

        vm.stopBroadcast();

        // ============ Verify ============

        console.log("");
        console.log("=================================================");
        console.log("DEPLOY COMPLETE!");
        console.log("=================================================");
        console.log("");
        console.log("ShareAndSpin Proxy:", address(snsProxy));
        console.log("  owner:", sns.owner());
        console.log("  pizzaToken:", address(sns.pizzaToken()));
        console.log("  pizzaParty:", address(sns.pizzaParty()));
        console.log("  treasuryWallet:", sns.treasuryWallet());
        console.log("  shareRewardAmount:", sns.shareRewardAmount() / 1e18, "PIZZA");
        console.log("");
        console.log("PizzaParty.shareAndSpinContract:", pizzaParty.shareAndSpinContract());
        console.log("");
        console.log("=================================================");
        console.log("MANUAL STEP REQUIRED (from treasury wallet):");
        console.log("=================================================");
        console.log("  PIZZA token approve ShareAndSpin proxy:");
        console.log("  pizza.approve(", address(snsProxy), ", type(uint256).max)");
        console.log("");
        console.log("Update shareRewardAmount via price oracle after deploy.");
    }
}
