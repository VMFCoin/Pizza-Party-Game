// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PizzaStakingV1Upgradeable} from "../src/PizzaStakingV1Upgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployPizzaStaking
 * @dev Deploys PizzaStakingV1Upgradeable as UUPS proxy
 *
 * Usage:
 * - Dry run: forge script script/DeployPizzaStaking.s.sol --rpc-url $BASE_RPC
 * - Deploy: forge script script/DeployPizzaStaking.s.sol --rpc-url $BASE_RPC --broadcast --verify
 *
 * POST-DEPLOY WIRING:
 * 1. adminSetPizzaToken(PIZZA_TOKEN) - set the token address
 * 2. adminSetPizzaPartyContract(PIZZA_PARTY_PROXY) - for gameId tracking
 * 3. adminSetBoostEndTime(block.timestamp + 60 days) - enable early staker boost
 * 4. adminSetSpinEnabled(true) - enable Spin the Pie mechanic
 * 5. On PizzaPartyV2: adminSetStakingContract(stakingProxy) - route 1% rewards
 */
contract DeployPizzaStaking is Script {
    // Base mainnet addresses
    address constant PIZZA_TOKEN = 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69;
    address constant PIZZA_PARTY_PROXY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;
    address constant OWNER_WALLET = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;
    address constant TREASURY_WALLET = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;

    function run() external {
        // Load environment
        string memory keyStr = vm.envString("PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "PRIVATE_KEY not set");
        uint256 deployerPrivateKey = vm.parseUint(keyStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("DEPLOYING PIZZA STAKING CONTRACT");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("PIZZA Token:", PIZZA_TOKEN);
        console.log("PizzaParty Proxy:", PIZZA_PARTY_PROXY);
        console.log("Owner:", OWNER_WALLET);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ============ Deploy PizzaStakingV1Upgradeable ============
        console.log("--- Deploying PizzaStakingV1Upgradeable ---");

        PizzaStakingV1Upgradeable stakingImpl = new PizzaStakingV1Upgradeable();
        console.log("Staking Implementation:", address(stakingImpl));

        bytes memory stakingInitData = abi.encodeWithSelector(
            PizzaStakingV1Upgradeable.initialize.selector,
            OWNER_WALLET
        );

        ERC1967Proxy stakingProxy = new ERC1967Proxy(address(stakingImpl), stakingInitData);
        console.log("Staking Proxy:", address(stakingProxy));

        // ============ Configure Staking Contract ============
        console.log("");
        console.log("--- Configuring Staking Contract ---");

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(address(stakingProxy));

        // Set PIZZA token
        staking.adminSetPizzaToken(PIZZA_TOKEN);
        console.log("Set PIZZA token:", PIZZA_TOKEN);

        // Set PizzaParty contract (for gameId tracking)
        staking.adminSetPizzaPartyContract(PIZZA_PARTY_PROXY);
        console.log("Set PizzaParty contract:", PIZZA_PARTY_PROXY);

        // Set 60-day early staker boost
        uint256 boostEndTime = block.timestamp + 60 days;
        staking.adminSetBoostEndTime(boostEndTime);
        console.log("Set boost end time:", boostEndTime);

        // Enable spin mechanic
        staking.adminSetSpinEnabled(true);
        console.log("Spin enabled: true");

        // Set staking rewards wallet (treasury)
        staking.adminSetStakingRewardsWallet(TREASURY_WALLET);
        console.log("Set staking rewards wallet:", TREASURY_WALLET);

        vm.stopBroadcast();

        // ============ Verification ============
        console.log("");
        console.log("===========================================");
        console.log("DEPLOYMENT COMPLETE - VERIFY:");
        console.log("===========================================");
        console.log("");
        console.log("Staking Contract:");
        console.log("  Proxy:", address(stakingProxy));
        console.log("  Owner:", staking.owner());
        console.log("  PIZZA Token:", staking.pizzaToken());
        console.log("  PizzaParty:", staking.pizzaPartyContract());
        console.log("  Boost End Time:", staking.boostEndTime());
        console.log("  Spin Enabled:", staking.spinEnabled());

        // ============ Post-Deploy Wiring Instructions ============
        console.log("");
        console.log("===========================================");
        console.log("POST-DEPLOY WIRING:");
        console.log("===========================================");
        console.log("");
        console.log("On PizzaPartyV2 (%s):", PIZZA_PARTY_PROXY);
        console.log("  1. adminSetStakingContract(%s)", address(stakingProxy));
        console.log("");
        console.log("This routes 1%% of daily pot to staking rewards.");
        console.log("");
        console.log("UPDATE FRONTEND:");
        console.log("  Add to app/lib/constants/index.tsx:");
        console.log("  export const PIZZA_STAKING_ADDRESS = '%s'", address(stakingProxy));
    }
}
