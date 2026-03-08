// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IPizzaParty {
    function setNoonPacificUtcHour(uint256 _hour) external;
    function noonPacificUtcHour() external view returns (uint256);
}

/**
 * @title SetNoonPacificHour
 * @notice Updates noonPacificUtcHour from 20 (PST) to 19 (PDT) for daylight saving time
 * @dev Run after DST starts (March) to keep game end at noon Pacific
 *      Revert to 20 when DST ends (November)
 *
 * Usage:
 *   forge script foundry/script/SetNoonPacificHour.s.sol:SetNoonPacificHour \
 *     --rpc-url https://mainnet.base.org --broadcast
 */
contract SetNoonPacificHour is Script {
    address constant PIZZA_PARTY = 0xA1C31c3eF1448351da0b1D430148660982B6f3dD;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address sender = vm.addr(deployerPrivateKey);

        IPizzaParty pp = IPizzaParty(PIZZA_PARTY);

        uint256 currentHour = pp.noonPacificUtcHour();
        console.log("=== SET NOON PACIFIC HOUR ===");
        console.log("Owner wallet:", sender);
        console.log("Current noonPacificUtcHour:", currentHour);
        console.log("Setting to: 19 (PDT / daylight saving)");

        vm.startBroadcast(deployerPrivateKey);
        pp.setNoonPacificUtcHour(19);
        vm.stopBroadcast();

        uint256 newHour = pp.noonPacificUtcHour();
        console.log("New noonPacificUtcHour:", newHour);
        console.log("Done! Games will now end at 19:00 UTC (noon PDT)");
    }
}
