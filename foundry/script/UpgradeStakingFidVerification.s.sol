// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaStakingV1Upgradeable.sol";

/**
 * @title UpgradeStakingFidVerification
 * @notice Upgrades the staking contract to add FID-to-wallet verification (anti-sybil protection)
 * @dev This upgrade adds:
 *      - fidVerificationRequired: bool to toggle FID verification
 *      - fidToWallet: mapping(uint256 => address) - FID to authorized wallet
 *      - walletToFid: mapping(address => uint256) - reverse lookup
 *      - adminRegisterFidWallet() - register a single FID-wallet pair
 *      - adminBatchRegisterFidWallets() - batch register FID-wallet pairs
 *      - adminRemoveFidWallet() - remove a FID-wallet mapping
 *      - adminSetFidVerificationRequired() - toggle requirement
 *      - stake() now checks if wallet is registered when fidVerificationRequired=true
 *
 * Run with: forge script script/UpgradeStakingFidVerification.s.sol --rpc-url base --broadcast --verify
 */
contract UpgradeStakingFidVerification is Script {
    // Staking proxy address on Base mainnet
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        PizzaStakingV1Upgradeable newImplementation = new PizzaStakingV1Upgradeable();
        console.log("New implementation deployed at:", address(newImplementation));

        // Log the upgrade details
        console.log("");
        console.log("=== FID VERIFICATION UPGRADE ===");
        console.log("This upgrade adds anti-sybil protection:");
        console.log("- One Farcaster FID = One staking wallet");
        console.log("- Admin must register FID-wallet pairs before users can stake");
        console.log("- Toggle fidVerificationRequired to enable/disable");
        console.log("");
        console.log("New admin functions:");
        console.log("- adminSetFidVerificationRequired(bool)");
        console.log("- adminRegisterFidWallet(uint256 fid, address wallet)");
        console.log("- adminBatchRegisterFidWallets(uint256[] fids, address[] wallets)");
        console.log("- adminRemoveFidWallet(uint256 fid)");
        console.log("");
        console.log("New view functions:");
        console.log("- getWalletFid(address wallet) returns uint256");
        console.log("- getFidWallet(uint256 fid) returns address");
        console.log("");

        // Upgrade the proxy to the new implementation
        PizzaStakingV1Upgradeable proxy = PizzaStakingV1Upgradeable(STAKING_PROXY);
        proxy.upgradeToAndCall(address(newImplementation), "");
        console.log("Proxy upgraded successfully!");

        // NOTE: FID verification is DISABLED by default (fidVerificationRequired = false)
        // Run RegisterFidWalletPairs.s.sol to enable and register pairs

        vm.stopBroadcast();
    }
}
