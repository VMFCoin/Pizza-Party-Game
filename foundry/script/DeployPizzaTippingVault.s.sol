// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PizzaTippingVaultUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployPizzaTippingVault
 * @notice Deploys PizzaTippingVaultUpgradeable as a UUPS proxy on Base mainnet.
 *
 * Required env vars:
 *   PRIVATE_KEY                       — deployer key (must be funded with ETH)
 *   BACKEND_TIPPING_SIGNER_ADDRESS    — dedicated EOA for backend tip signing
 */
contract DeployPizzaTippingVault is Script {
    // Base mainnet — verified live
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;
    address constant TREASURY = 0xBfCA21E41D397C8B6beF0c348D394DA2c4826292;
    address constant OWNER = 0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address backendSigner = vm.envAddress("BACKEND_TIPPING_SIGNER_ADDRESS");
        require(backendSigner != address(0), "backend signer not set");

        vm.startBroadcast(deployerKey);

        // 1) Deploy implementation
        PizzaTippingVaultUpgradeable impl = new PizzaTippingVaultUpgradeable();
        console.log("Implementation deployed at:", address(impl));

        // 2) Deploy proxy
        bytes memory initData = abi.encodeCall(
            PizzaTippingVaultUpgradeable.initialize,
            (PIZZA_TOKEN, STAKING_PROXY, backendSigner, TREASURY, OWNER)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        console.log("Proxy deployed at:", address(proxy));

        // 3) Verify
        PizzaTippingVaultUpgradeable vault = PizzaTippingVaultUpgradeable(address(proxy));
        require(vault.pizzaToken() == PIZZA_TOKEN, "pizza token mismatch");
        require(vault.stakingContract() == STAKING_PROXY, "staking mismatch");
        require(vault.backendSigner() == backendSigner, "signer mismatch");
        require(vault.treasury() == TREASURY, "treasury mismatch");
        require(vault.owner() == OWNER, "owner mismatch");
        require(vault.minTipAmount() == 1_000 * 1e18, "min mismatch");
        require(vault.maxTipPerCast() == 10_000_000 * 1e18, "maxTip mismatch");
        require(vault.maxCreditPerTx() == 100_000_000 * 1e18, "maxCredit mismatch");

        vm.stopBroadcast();

        console.log("\n=== DEPLOY COMPLETE ===");
        console.log("Vault proxy:         ", address(proxy));
        console.log("Vault implementation:", address(impl));
        console.log("Backend signer:      ", backendSigner);
        console.log("\nNEXT STEPS:");
        console.log("1. Run UpgradeStakingClaimToTip.s.sol (upgrade staking impl)");
        console.log("2. Call staking.adminSetTippingVault(", address(proxy), ")");
    }
}
