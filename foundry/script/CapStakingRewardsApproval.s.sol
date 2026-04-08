// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CapStakingRewardsApproval
 * @notice Revokes unlimited approval from staking rewards wallet to staking contract,
 *         replaces with a capped 500M PIZZA approval (~6 months of rewards).
 *         Re-run periodically to top up as allowance depletes.
 *
 * Usage:
 *   Dry run:  forge script script/CapStakingRewardsApproval.s.sol --rpc-url https://mainnet.base.org
 *   Execute:  forge script script/CapStakingRewardsApproval.s.sol --rpc-url https://mainnet.base.org --broadcast
 */
contract CapStakingRewardsApproval is Script {
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;
    address constant STAKING_PROXY = 0xCbAf5bACe5419710C3852653d3DdEB831d7415be;

    uint256 constant APPROVAL_CAP = 500_000_000 ether;

    function run() external {
        // This script must be run with the STAKING REWARDS WALLET key
        // (0x0b30b1D9327979D290b49BbfEF92f783fdE81c56)
        string memory keyStr = vm.envString("STAKING_WALLET_PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "STAKING_WALLET_PRIVATE_KEY not set");
        uint256 walletKey = vm.parseUint(keyStr);
        address wallet = vm.addr(walletKey);

        IERC20 pizza = IERC20(PIZZA_TOKEN);
        uint256 currentAllowance = pizza.allowance(wallet, STAKING_PROXY);

        console.log("=================================================");
        console.log("CAP STAKING REWARDS APPROVAL");
        console.log("=================================================");
        console.log("Rewards wallet:", wallet);
        console.log("Staking contract:", STAKING_PROXY);
        console.log("Current allowance: UNLIMITED");
        console.log("New cap:", APPROVAL_CAP / 1e18, "PIZZA");

        vm.startBroadcast(walletKey);

        // First set to 0 (some tokens require this before changing a non-zero allowance)
        pizza.approve(STAKING_PROXY, 0);
        // Then set the capped amount
        pizza.approve(STAKING_PROXY, APPROVAL_CAP);

        vm.stopBroadcast();

        uint256 newAllowance = pizza.allowance(wallet, STAKING_PROXY);
        console.log("New allowance:", newAllowance / 1e18, "PIZZA");
        console.log("=================================================");
        console.log("APPROVAL CAPPED! Re-run when allowance depletes.");
        console.log("=================================================");
    }
}
