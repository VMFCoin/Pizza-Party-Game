// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PizzaParlorManagerUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Mock PIZZA token for testing
contract MockPizzaToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function burn(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
    }
}

// Mock PizzaParty for testing
contract MockPizzaParty {
    MockPizzaToken public pizzaToken;
    uint256 public dailyGameId = 1;

    constructor(address _token) {
        pizzaToken = MockPizzaToken(_token);
    }

    function enterDailyWithSlice(address, address) external {}
}

contract ParlorNamingTest is Test {
    PizzaParlorManagerUpgradeable public manager;
    MockPizzaToken public token;
    MockPizzaParty public pizzaParty;

    address public owner = address(0x1);
    address public treasury = address(0x2);
    address public ops = address(0x3);
    address public user1 = address(0x4);
    address public user2 = address(0x5);

    uint256 constant PARLOR_PRICE = 5000e18; // 5000 PIZZA

    function setUp() public {
        // Deploy mock token
        token = new MockPizzaToken();

        // Deploy mock PizzaParty
        pizzaParty = new MockPizzaParty(address(token));

        // Deploy ParlorManager implementation
        PizzaParlorManagerUpgradeable impl = new PizzaParlorManagerUpgradeable();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(
            PizzaParlorManagerUpgradeable.initialize.selector,
            address(pizzaParty),
            treasury,
            ops,
            owner
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        manager = PizzaParlorManagerUpgradeable(address(proxy));

        // Setup: mint tokens to users
        token.mint(user1, 100_000e18);
        token.mint(user2, 100_000e18);

        // Approve manager to spend tokens
        vm.prank(user1);
        token.approve(address(manager), type(uint256).max);

        vm.prank(user2);
        token.approve(address(manager), type(uint256).max);
    }

    function test_SetParlorName_Success() public {
        // User1 buys a parlor
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        // User1 sets their parlor name
        vm.prank(user1);
        manager.setParlorName("Mike's Pizza");

        // Verify name was set
        assertEq(manager.parlorName(user1), "Mike's Pizza");
        assertTrue(manager.hasParlorName(user1));
    }

    function test_SetParlorName_EmitsEvent() public {
        // User1 buys a parlor
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        // Expect event
        vm.expectEmit(true, false, false, true);
        emit PizzaParlorManagerUpgradeable.ParlorNamed(user1, "Best Pizza");

        vm.prank(user1);
        manager.setParlorName("Best Pizza");
    }

    function test_SetParlorName_RevertIfNoParlorOwned() public {
        // User1 tries to name without owning a parlor
        vm.prank(user1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.NoParlorOwned.selector);
        manager.setParlorName("No Parlor Pizza");
    }

    function test_SetParlorName_RevertIfAlreadyNamed() public {
        // User1 buys a parlor and names it
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        vm.prank(user1);
        manager.setParlorName("First Name");

        // Try to rename - should fail
        vm.prank(user1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.ParlorAlreadyNamed.selector);
        manager.setParlorName("Second Name");
    }

    function test_SetParlorName_RevertIfEmpty() public {
        // User1 buys a parlor
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        // Try empty name
        vm.prank(user1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.NameEmpty.selector);
        manager.setParlorName("");
    }

    function test_SetParlorName_RevertIfTooLong() public {
        // User1 buys a parlor
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        // Try name that's too long (21 characters)
        vm.prank(user1);
        vm.expectRevert(PizzaParlorManagerUpgradeable.NameTooLong.selector);
        manager.setParlorName("This name is too long");
    }

    function test_SetParlorName_MaxLength() public {
        // User1 buys a parlor
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        // Set name at exactly 20 characters (should work)
        string memory maxName = "12345678901234567890"; // 20 chars
        vm.prank(user1);
        manager.setParlorName(maxName);

        assertEq(manager.parlorName(user1), maxName);
    }

    function test_HasParlorName_FalseIfNotSet() public {
        // User1 buys a parlor but doesn't name it
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        // Should return false
        assertFalse(manager.hasParlorName(user1));
        assertEq(manager.parlorName(user1), "");
    }

    function test_MultipleUsersCanNameParlors() public {
        // Both users buy parlors
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        vm.prank(user2);
        manager.purchaseParlor(PARLOR_PRICE);

        // Both name their parlors
        vm.prank(user1);
        manager.setParlorName("User1 Pizza");

        vm.prank(user2);
        manager.setParlorName("User2 Pizza");

        // Verify both names are set correctly
        assertEq(manager.parlorName(user1), "User1 Pizza");
        assertEq(manager.parlorName(user2), "User2 Pizza");
    }

    // ============ Admin Naming Tests ============

    function test_AdminSetParlorName_Success() public {
        // User1 buys a parlor
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        // Owner (admin) sets their name
        vm.prank(owner);
        manager.adminSetParlorName(user1, "Admin Set Name");

        assertEq(manager.parlorName(user1), "Admin Set Name");
    }

    function test_AdminSetParlorName_CanOverwrite() public {
        // User1 buys a parlor and names it
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        vm.prank(user1);
        manager.setParlorName("Original Name");

        // Admin can overwrite/rename
        vm.prank(owner);
        manager.adminSetParlorName(user1, "New Admin Name");

        assertEq(manager.parlorName(user1), "New Admin Name");
    }

    function test_AdminSetParlorName_RevertIfNotOwner() public {
        // User1 buys a parlor
        vm.prank(user1);
        manager.purchaseParlor(PARLOR_PRICE);

        // Non-owner tries to use admin function
        vm.prank(user2);
        vm.expectRevert();
        manager.adminSetParlorName(user1, "Hacker Name");
    }

    function test_AdminSetParlorName_RevertIfNoParlorOwned() public {
        // Admin tries to name for user who doesn't own a parlor
        vm.prank(owner);
        vm.expectRevert(PizzaParlorManagerUpgradeable.NoParlorOwned.selector);
        manager.adminSetParlorName(user1, "No Parlor");
    }
}
