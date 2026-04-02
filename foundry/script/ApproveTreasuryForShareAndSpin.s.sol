// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ApproveTreasuryForShareAndSpin
 * @notice Treasury wallet approves ShareAndSpin proxy to pull PIZZA for share rewards.
 *         One-time operation. Uses TREASURY_WALLET_PRIVATE_KEY from .env.
 *
 * Usage:
 *   Dry run:  forge script script/ApproveTreasuryForShareAndSpin.s.sol --rpc-url https://mainnet.base.org
 *   Execute:  forge script script/ApproveTreasuryForShareAndSpin.s.sol --rpc-url https://mainnet.base.org --broadcast
 */
contract ApproveTreasuryForShareAndSpin is Script {
    address constant PIZZA_TOKEN = 0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07;
    address constant SHARE_AND_SPIN_PROXY = 0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C;

    function run() external {
        string memory keyStr = vm.envString("TREASURY_WALLET_PRIVATE_KEY");
        require(bytes(keyStr).length > 0, "TREASURY_WALLET_PRIVATE_KEY not set");
        uint256 treasuryKey = vm.parseUint(keyStr);
        address treasury = vm.addr(treasuryKey);

        IERC20 pizza = IERC20(PIZZA_TOKEN);
        uint256 currentAllowance = pizza.allowance(treasury, SHARE_AND_SPIN_PROXY);

        console.log("=================================================");
        console.log("TREASURY APPROVE - SHARE & SPIN");
        console.log("=================================================");
        console.log("Treasury:", treasury);
        console.log("Spender (ShareAndSpin):", SHARE_AND_SPIN_PROXY);
        console.log("Current allowance:", currentAllowance / 1e18, "PIZZA");

        vm.startBroadcast(treasuryKey);

        pizza.approve(SHARE_AND_SPIN_PROXY, type(uint256).max);

        vm.stopBroadcast();

        uint256 newAllowance = pizza.allowance(treasury, SHARE_AND_SPIN_PROXY);
        console.log("New allowance: max (uint256.max)");
        console.log("");
        console.log("=================================================");
        console.log("APPROVAL COMPLETE!");
        console.log("=================================================");
    }
}
