// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PizzaPartyV2Upgradeable} from "../src/PizzaPartyV2Upgradeable.sol";
import {ShareAndSpinUpgradeable} from "../src/ShareAndSpinUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockPIZZAWeekly is ERC20 {
    constructor() ERC20("PIZZA Token", "PIZZA") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract WeeklyPaidEntryClaimTest is Test {
    MockPIZZAWeekly public pizzaToken;
    PizzaPartyV2Upgradeable public pizzaParty;
    ShareAndSpinUpgradeable public sns;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public backendSigner = makeAddr("backendSigner");
    address public player = makeAddr("player");

    address public charity1 = makeAddr("charity1");
    address public charity2 = makeAddr("charity2");
    address public charity3 = makeAddr("charity3");

    uint256 public constant ENTRY_FEE = 143e18;
    uint256 public constant REWARD = 100_000 * 1e18;

    function setUp() public {
        vm.warp(1734285600); // Sunday noon Pacific

        pizzaToken = new MockPIZZAWeekly();

        PizzaPartyV2Upgradeable impl = new PizzaPartyV2Upgradeable();
        address[] memory charities = new address[](3);
        charities[0] = charity1;
        charities[1] = charity2;
        charities[2] = charity3;

        bytes memory initData = abi.encodeWithSelector(
            PizzaPartyV2Upgradeable.initialize.selector,
            address(pizzaToken),
            treasury,
            charities,
            owner
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        pizzaParty = PizzaPartyV2Upgradeable(address(proxy));

        ShareAndSpinUpgradeable snsImpl = new ShareAndSpinUpgradeable();
        bytes memory snsInit = abi.encodeWithSelector(
            ShareAndSpinUpgradeable.initialize.selector,
            address(pizzaToken),
            address(pizzaParty),
            treasury,
            owner
        );
        ERC1967Proxy snsProxy = new ERC1967Proxy(address(snsImpl), snsInit);
        sns = ShareAndSpinUpgradeable(address(snsProxy));

        vm.startPrank(owner);
        pizzaParty.adminSetShareAndSpinContract(address(sns));
        pizzaParty.setToppingUnitPizza(10e18);
        pizzaParty.setHoldingsUnitPizza(1000e18);
        sns.adminSetShareRewardAmount(REWARD);
        sns.adminSetBackendSigner(backendSigner);
        vm.stopPrank();

        vm.prank(treasury);
        pizzaToken.approve(address(sns), type(uint256).max);
        vm.prank(treasury);
        pizzaToken.approve(address(pizzaParty), type(uint256).max);

        pizzaToken.mint(treasury, 1_000_000e18);
        pizzaToken.mint(player, 1000e18);
        vm.prank(player);
        pizzaToken.approve(address(pizzaParty), type(uint256).max);
    }

    function _warpToClaimWindow() internal {
        (uint256 claimStart,,,,,) = pizzaParty.getCurrentWeeklyGame();
        vm.warp(claimStart + 1);
    }

    function test_ShareOnlyToppings_CannotClaimWithoutPaidEntry() public {
        vm.prank(backendSigner);
        sns.recordShare(player, REWARD);

        (uint256 toppings,,,,,, bool paid) = pizzaParty.getPlayerWeeklyInfo(player);
        assertEq(toppings, 1, "share earns topping");
        assertFalse(paid, "share alone does not count as paid entry");

        _warpToClaimWindow();

        vm.prank(player);
        vm.expectRevert(bytes("!paid"));
        pizzaParty.claimToppings();
    }

    function test_PaidEntry_AllowsClaimWithShareToppings() public {
        vm.prank(player);
        pizzaParty.enterDailyGame(ENTRY_FEE, "");

        vm.prank(backendSigner);
        sns.recordShare(player, REWARD);

        (uint256 toppings,,,,,, bool paid) = pizzaParty.getPlayerWeeklyInfo(player);
        assertTrue(toppings >= 2, "daily + share toppings");
        assertTrue(paid, "paid entry recorded");

        _warpToClaimWindow();

        vm.prank(player);
        pizzaParty.claimToppings();

        (uint256 earned, uint256 claimed,,, bool didClaim,,) = pizzaParty.getPlayerWeeklyInfo(player);
        assertTrue(didClaim, "has claimed flag set");
        assertEq(claimed, earned, "claimed all earned toppings");
        assertTrue(claimed >= 2, "claimed toppings");
    }

    function test_FreeSliceEntry_DoesNotSatisfyPaidRequirement() public {
        uint256 weekId = pizzaParty.weeklyGameId();

        vm.prank(address(sns));
        pizzaParty.enterDailyFromShareAndSpin(player, ENTRY_FEE);

        assertFalse(pizzaParty.hasPaidWeeklyEntry(weekId, player), "free slice is not paid entry");

        _warpToClaimWindow();

        vm.prank(player);
        vm.expectRevert(bytes("!paid"));
        pizzaParty.claimToppings();
    }
}
