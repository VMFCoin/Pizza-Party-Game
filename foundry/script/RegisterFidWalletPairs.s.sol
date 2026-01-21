// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title RegisterFidWalletPairs
 * @notice Registers FID-to-wallet pairs for whitelisted users and enables FID verification
 * @dev This script:
 *      1. Batch registers all whitelisted FID-wallet pairs
 *      2. Enables FID verification requirement
 *
 * Run with: forge script script/RegisterFidWalletPairs.s.sol --rpc-url base --broadcast
 */
contract RegisterFidWalletPairs is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        PizzaStakingV1Upgradeable staking = PizzaStakingV1Upgradeable(STAKING_PROXY);

        // ============================================================
        // FID-WALLET PAIRS (from Staker cache in database)
        // ============================================================

        uint256[] memory fids = new uint256[](5);
        address[] memory wallets = new address[](5);

        // FID 1013491 (@vmfcoin)
        fids[0] = 1013491;
        wallets[0] = 0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66;

        // FID 1060809 (@tiredgirl)
        fids[1] = 1060809;
        wallets[1] = 0x9157Feb12812b253e84447C6B52C38651fd67FcA;

        // FID 963422 (@wonka-fungi)
        fids[2] = 963422;
        wallets[2] = 0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765;

        // FID 392134 (@donaldtrap)
        fids[3] = 392134;
        wallets[3] = 0xffde42d40175b3b9349Dfb384439dCB811691E09;

        // FID 200506 (@stemo.eth)
        fids[4] = 200506;
        wallets[4] = 0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF;

        console.log("");
        console.log("=== REGISTERING FID-WALLET PAIRS ===");
        console.log("");

        for (uint256 i = 0; i < fids.length; i++) {
            console.log("Registering FID", fids[i], "->", wallets[i]);
        }

        console.log("");
        console.log("Batch registering 5 FID-wallet pairs...");

        // Batch register all pairs
        staking.adminBatchRegisterFidWallets(fids, wallets);
        console.log("FID-wallet pairs registered successfully!");

        // NOTE: FID verification is LEFT DISABLED for public launch
        // This means anyone can stake - the off-chain API handles anti-sybil
        // To enable on-chain FID verification later, call:
        // staking.adminSetFidVerificationRequired(true);

        console.log("");
        console.log("=== REGISTRATION COMPLETE ===");
        console.log("Existing whitelisted users are registered on-chain.");
        console.log("FID verification is DISABLED - anyone can stake.");
        console.log("Anti-sybil protection is handled by the off-chain API.");

        vm.stopBroadcast();
    }
}
