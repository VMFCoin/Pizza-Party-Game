// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// foundry/src/oz/utils/Context.sol

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// foundry/src/oz/utils/introspection/IERC165.sol

// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// foundry/src/oz/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// foundry/src/oz/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

// foundry/src/oz/access/Ownable.sol

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// foundry/src/oz/security/ReentrancyGuard.sol

// foundry/src/oz/interfaces/IERC1363.sol

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}

// foundry/src/oz/token/ERC20/utils/SafeERC20.sol

// OpenZeppelin Contracts (last updated v5.3.0) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Opposedly, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturnBool} that reverts if call fails to meet the requirements.
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            // bubble errors
            if iszero(success) {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
            returnSize := returndatasize()
            returnValue := mload(0)
        }

        if (returnSize == 0 ? address(token).code.length == 0 : returnValue != 1) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silently catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0)
        }
        return success && (returnSize == 0 ? address(token).code.length > 0 : returnValue == 1);
    }
}

// PizzaParty (1).sol

/**
 * @title PizzaParty
 * @dev Daily lottery + Weekly jackpot with topping-based tickets
 * 
 * Daily Game:
 * - Pay dynamic VMF amount ($1 worth at current market price) to enter, earn 1 topping, get 1 entry
 * - Entry fee adjusts based on VMF market price (frontend calculates amount for $1)
 * - Min: 1 VMF, Max: 1000 VMF (safety bounds)
 * - 8 winners split the daily pot
 * - First player each day gets 1% bonus from pot
 * - Games without entries either carry over or are skipped
 * 
 * Weekly Game:
 * - Claim window: Sunday 12pm PST → Monday 12pm PST (24 hours)
 * - VMF balance snapshot taken at claim time (not at window opening)
 * - Players claim toppings once per week during window
 * - 1 topping = 10 VMF in jackpot
 * - 10 winners, weighted by claimed toppings
 * - Paid from treasury wallet
 * 
 * Toppings earned:
 * - Daily play: 1 topping (max 7/week)
 * - Referrals: 2 toppings per successful referral (max 3/week)
 * - Holdings: 3 toppings per 1k VMF held (snapshot at claim time)
 */
contract PizzaParty is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // ============ Constants ============
    
    // ✅ Dynamic entry fee: Always $1 USD, but VMF amount varies with price
    // If VMF = $100: need 0.01 VMF for $1 entry
    // If VMF = $1: need 1 VMF for $1 entry
    // If VMF = $0.001: need 1000 VMF for $1 entry
    // So bounds are: minimum 0.01 VMF (when VMF is very expensive) to maximum 1000 VMF (when VMF is very cheap)
    uint256 public constant MIN_ENTRY_FEE = 1e16;      // 0.01 VMF minimum (covers VMF up to $100 per token)
    uint256 public constant MAX_ENTRY_FEE = 1000e18; // 1000 VMF maximum (when VMF = $0.001, need 1000 VMF for $1)
    uint256 public constant DAILY_WINNERS = 8;
    uint256 public constant WEEKLY_WINNERS = 10;
    // Daily pot split (100% total):
    // - 1%  → FIRST_PLAYER_BONUS_BPS (first player bonus)
    // - 5%  → CHARITY_TOTAL_BPS (charity distribution)
    // - 94% → PLAYERS_POOL_BPS (distributed equally among winners, minus owner fee if set)
    // - 0%-5% → OWNER_FEE_BPS (optional owner fee, subtracted from players pool)
    // NOTE: All percentages are expressed in basis points (BPS), where 10000 = 100%.
    uint256 public constant FIRST_PLAYER_BONUS_BPS = 100; // 1% = 100 basis points
    uint256 public constant CHARITY_TOTAL_BPS = 500; // 5% = 500 basis points
    uint256 public constant PLAYERS_POOL_BPS = 9400; // 94% = 9400 basis points
    uint256 public constant MAX_OWNER_FEE_BPS = 500; // Maximum 5% owner fee
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_CHARITIES = 20;
    uint256 public constant MAX_REFERRALS_PER_WEEK = 3;
    uint256 public constant HOLDINGS_UNIT = 1000e18; // 1k VMF
    uint256 public constant HOLDINGS_TOPPINGS = 3; // per unit
    uint256 public constant TOPPING_TO_VMF = 10e18; // 1 topping = 10 VMF
    
    // ============ State Variables ============
    
    IERC20 public immutable vmfToken;
    address public treasuryWallet;
    address[] public charityWallets;

    uint256 public ownerFeeBPS = 0; // Start at 0%, adjustable up to MAX_OWNER_FEE_BPS
    
    uint256 public dailyGameId = 1;
    uint256 public weeklyGameId = 1;
    uint256 public currentDailyPot;
    
    struct DailyGame {
        uint256 startTime;
        uint256 endTime;
        address firstPlayer;
        address[] players;
        address[] winners;
        uint256 potAmount;
        bool settled;
    }
    
    struct WeeklyGame {
        uint256 claimWindowStart; // Sunday 12pm PST
        uint256 claimWindowEnd;   // Monday 12pm PST
        uint256 totalClaimedToppings;
        address[] claimers;
        address[] winners;
        uint256 potAmount;
        bool settled;
    }
    
    struct PlayerWeekly {
        uint256 toppingsEarned;     // Earned but not claimed
        uint256 toppingsClaimed;    // Claimed during window
        uint256 dailyPlays;         // Games played this week (max 7)
        uint256 referralsUsed;      // Referrals used this week (max 3)
        bool hasClaimed;            // Claimed this week
    }

    struct PlayerLifetimeStats {
        uint256 totalDailyWins;
        uint256 totalWeeklyWins;
        uint256 totalVmfWon;
        uint256 lifetimeToppings;
        uint256 lifetimeReferrals;
    }
    
    // ============ Mappings ============
    
    mapping(uint256 => DailyGame) public dailyGames;
    mapping(uint256 => WeeklyGame) public weeklyGames;
    mapping(uint256 => mapping(address => bool)) public hasPlayedDaily;
    mapping(uint256 => mapping(address => PlayerWeekly)) public weeklyPlayers;
    mapping(address => PlayerLifetimeStats) public playerStats;
    
    // Referral system (lazy registration)
    mapping(address => string) public playerReferralCode;
    mapping(string => address) public codeToPlayer;
    mapping(address => bool) public hasUsedReferral; // Lifetime flag
    
    // ============ Events ============
    
    event DailyGameStarted(uint256 indexed gameId, uint256 startTime, uint256 endTime);
    event DailyGameEntered(uint256 indexed gameId, address indexed player, bool isFirst, uint256 amount);
    event DailyGameSettled(uint256 indexed gameId, address[] winners, uint256 pot);
    event WeeklyGameStarted(uint256 indexed gameId, uint256 claimStart, uint256 claimEnd);
    event ToppingsEarned(uint256 indexed weekId, address indexed player, uint256 amount, string reason);
    event ToppingsClaimed(uint256 indexed weekId, address indexed player, uint256 amount);
    event WeeklyGameSettled(uint256 indexed weekId, address[] winners, uint256 pot);
    event ReferralCodeCreated(address indexed player, string code);
    event ReferralUsed(address indexed referrer, address indexed referee);
    event CharityPayout(uint256 indexed gameId, address indexed charity, uint256 amount);
    event CharityWalletsUpdated(address[] oldCharities, address[] newCharities);
    event OwnerFeeUpdated(uint256 oldFeeBPS, uint256 newFeeBPS);
    event OwnerFeePayout(uint256 indexed gameId, address indexed owner, uint256 amount);
    
    // ============ Constructor ============

    constructor(
        address _vmfToken,
        address _treasury,
        address[] memory _charities,
        address _owner,
        uint256 _startingDailyGameId,
        uint256 _startingWeeklyGameId
    ) Ownable(_owner) {
        require(_vmfToken != address(0), "Invalid VMF");
        require(_treasury != address(0), "Invalid treasury");
        require(_owner != address(0), "Invalid owner");
        require(_charities.length <= MAX_CHARITIES, "Too many charities");
        require(_startingDailyGameId > 0, "Daily game ID must be > 0");
        require(_startingWeeklyGameId > 0, "Weekly game ID must be > 0");

        // Validate charity addresses and ensure uniqueness
        for (uint256 i = 0; i < _charities.length; i++) {
            require(_charities[i] != address(0), "Invalid charity");
            for (uint256 j = i + 1; j < _charities.length; j++) {
                require(_charities[i] != _charities[j], "Duplicate charity");
            }
        }

        vmfToken = IERC20(_vmfToken);
        treasuryWallet = _treasury;

        // If charities not provided in constructor, use the default list
        if (_charities.length == 0) {
            charityWallets.push(0x6456879a5073038b0E57ea8E498Cb0240e949fC3); // Patriots Promise
            charityWallets.push(0x700B53ff9a58Ee257F9A2EFda3a373D391028007); // Victory For Veterans
            charityWallets.push(0xB697C8b4bCaE454d9dee1E83f73327D7a63600a1); // Holy Family Village
            charityWallets.push(0x5951A4160F73b8798D68e7177dF8af6a7902e725); // Camp Cowboy
            charityWallets.push(0xfB0EF51792c36Ae1fE6636603be199788819b67D); // Veterans In Need Project
            charityWallets.push(0x10F01632DC709F7fA413A140739D8843b06235A1); // Honor HER Foundation
            charityWallets.push(0x0730d4dc43cf10A3Cd986FEE17f30cB0E75410e0); // Magicians On Mission
            charityWallets.push(0x043820C97771c570d830bB0e189778Fdef5E6EEb); // April Forces
            charityWallets.push(0x097701F99CC7b0Ff816C2355faC104ADdC6e27B9); // Little Patriots Embraced
        } else {
            charityWallets = _charities;
        }

        // Set game IDs to continue from previous deployment
        dailyGameId = _startingDailyGameId;
        weeklyGameId = _startingWeeklyGameId;

        _initializeDailyGame(dailyGameId);
        _initializeWeeklyGame(weeklyGameId);
    }
    
    // ============ Daily Game ============
    
    /**
     * @dev Enter daily game with dynamic amount
     * @param amountPaid VMF amount to pay (must be within MIN/MAX bounds)
     */
    function enterDailyGame(uint256 amountPaid) external nonReentrant {
        // Entry fee is always $1 USD, but VMF amount varies with VMF price
        // Minimum: 0.01 VMF (when VMF = $100 per token, entry = 0.01 VMF = $1)
        // Maximum: 1000 VMF (when VMF = $0.001 per token, entry = 1000 VMF = $1)
        require(amountPaid >= MIN_ENTRY_FEE, "Amount too low");   // Must be >= 0.01 VMF
        require(amountPaid <= MAX_ENTRY_FEE, "Amount too high"); // Must be <= 1000 VMF
        _enterDaily(msg.sender, amountPaid);
    }
    
    /**
     * @dev Use a referral code (separate from entry)
     * @param code Referral code to use
     */
    function useReferralCode(string memory code) external nonReentrant {
        require(!hasUsedReferral[msg.sender], "Already used referral");
        _processReferral(msg.sender, code);
    }
    
    function _enterDaily(address player, uint256 amount) internal {
        // Auto-settle weekly game if the claim window has ended
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        if (block.timestamp >= week.claimWindowEnd && !week.settled) {
            _settleWeeklyGame(weeklyGameId);
        }
        
        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];
        
        // Auto-settle previous game if needed
        if (block.timestamp >= game.endTime && !game.settled) {
            _settleDailyGame(gameId);
            gameId = dailyGameId;
            game = dailyGames[gameId];
        }
        
        require(block.timestamp < game.endTime, "Game ended");
        require(!hasPlayedDaily[gameId][player], "Already played");
        require(!game.settled, "Game settled");
        
        // Check weekly play limit
        PlayerWeekly storage weekly = weeklyPlayers[weeklyGameId][player];
        require(weekly.dailyPlays < 7, "Weekly limit reached");
        
        // ✅ Collect dynamic entry fee
        vmfToken.safeTransferFrom(player, address(this), amount);
        currentDailyPot += amount;
        
        // Track first player for bonus
        bool isFirst = (game.players.length == 0);
        if (isFirst) {
            game.firstPlayer = player;
        }
        
        // Update game state
        hasPlayedDaily[gameId][player] = true;
        game.players.push(player);
        
        // Award 1 topping
        weekly.toppingsEarned += 1;
        weekly.dailyPlays += 1;
        playerStats[player].lifetimeToppings += 1;

        // Auto-register referral code on first entry
        if (bytes(playerReferralCode[player]).length == 0) {
            string memory myCode = _generateCode(player);
            playerReferralCode[player] = myCode;
            codeToPlayer[myCode] = player;
            emit ReferralCodeCreated(player, myCode);
        }
        
        emit DailyGameEntered(gameId, player, isFirst, amount);
        emit ToppingsEarned(weeklyGameId, player, 1, "daily_play");
    }
    
    /**
     * @dev Settle daily game (anyone can call after end time)
     */
    function settleDailyGame() external nonReentrant {
        uint256 gameId = dailyGameId;
        DailyGame storage game = dailyGames[gameId];
        
        require(block.timestamp >= game.endTime, "Game not ended");
        require(!game.settled, "Already settled");
        
        _settleDailyGame(gameId);
    }
    
    function _settleDailyGame(uint256 gameId) internal {
        DailyGame storage game = dailyGames[gameId];

        // No players: skip this game, move to next day
        if (game.players.length == 0) {
            game.settled = true;
            dailyGameId++;
            _initializeDailyGame(dailyGameId);
            emit DailyGameSettled(gameId, new address[](0), 0);
            return;
        }

        // Auto-initialize charities on first settlement if not set
        if (charityWallets.length == 0) {
            charityWallets.push(0x6456879a5073038b0E57ea8E498Cb0240e949fC3); // Patriots Promise
            charityWallets.push(0x700B53ff9a58Ee257F9A2EFda3a373D391028007); // Victory For Veterans
            charityWallets.push(0xB697C8b4bCaE454d9dee1E83f73327D7a63600a1); // Holy Family Village
            charityWallets.push(0x5951A4160F73b8798D68e7177dF8af6a7902e725); // Camp Cowboy
            charityWallets.push(0xfB0EF51792c36Ae1fE6636603be199788819b67D); // Veterans In Need Project
            charityWallets.push(0x10F01632DC709F7fA413A140739D8843b06235A1); // Honor HER Foundation
            charityWallets.push(0x0730d4dc43cf10A3Cd986FEE17f30cB0E75410e0); // Magicians On Mission
            charityWallets.push(0x043820C97771c570d830bB0e189778Fdef5E6EEb); // April Forces
            charityWallets.push(0x097701F99CC7b0Ff816C2355faC104ADdC6e27B9); // Little Patriots Embraced
        }

        uint256 pot = currentDailyPot;
        uint256 winnerCount = game.players.length < DAILY_WINNERS ? game.players.length : DAILY_WINNERS;

        // Calculate allocations
        uint256 firstPlayerBonus = (pot * FIRST_PLAYER_BONUS_BPS) / BPS_DENOMINATOR;
        uint256 charityTotal = (pot * CHARITY_TOTAL_BPS) / BPS_DENOMINATOR;
        uint256 ownerFee = (pot * ownerFeeBPS) / BPS_DENOMINATOR;
        uint256 playersPool = (pot * PLAYERS_POOL_BPS) / BPS_DENOMINATOR - ownerFee;

        uint256 totalAllocated = firstPlayerBonus + charityTotal + ownerFee + playersPool;
        uint256 dust = pot > totalAllocated ? pot - totalAllocated : 0;

        // Select winners randomly
        address[] memory winners = _selectRandomWinners(game.players, winnerCount, gameId);

        // 1. Pay first player bonus
        if (firstPlayerBonus > 0 && game.firstPlayer != address(0)) {
            vmfToken.safeTransfer(game.firstPlayer, firstPlayerBonus);
            // Note: First player bonus does NOT count as a win for leaderboard purposes
            // Only actual daily winners (selected from the pool) go on the leaderboard
        }

        // 2. Pay owner fee (if set)
        if (ownerFee > 0) {
            vmfToken.safeTransfer(owner(), ownerFee);
            emit OwnerFeePayout(gameId, owner(), ownerFee);
        }

        // 3. Pay charities equally (first charity gets remainder)
        if (charityTotal > 0 && charityWallets.length > 0) {
            uint256 charityShare = charityTotal / charityWallets.length;
            uint256 charityRemainder = charityTotal - (charityShare * charityWallets.length);
            for (uint256 i = 0; i < charityWallets.length; i++) {
                uint256 payment = charityShare;
                if (i == 0) payment += charityRemainder;
                if (payment > 0) {
                    vmfToken.safeTransfer(charityWallets[i], payment);
                    emit CharityPayout(gameId, charityWallets[i], payment);
                }
            }
        }

        // 4. Pay winners from players pool (first winner gets remainder)
        uint256 winnerShare = playersPool / winnerCount;
        uint256 playersRemainder = playersPool - (winnerShare * winnerCount);
        uint256[] memory winnerPayouts = new uint256[](winnerCount);

        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 payout = winnerShare;
            if (i == 0) payout += playersRemainder;
            if (payout > 0) {
                vmfToken.safeTransfer(winners[i], payout);
                winnerPayouts[i] = payout;
            }
        }

        // 5. Send any remaining dust to first winner
        if (dust > 0 && winnerCount > 0) {
            vmfToken.safeTransfer(winners[0], dust);
            winnerPayouts[0] += dust;
        }

        game.winners = winners;
        game.potAmount = pot;
        game.settled = true;

        for (uint256 i = 0; i < winnerCount; i++) {
            PlayerLifetimeStats storage stats = playerStats[winners[i]];
            stats.totalDailyWins += 1;
            stats.totalVmfWon += winnerPayouts[i];
        }

        emit DailyGameSettled(gameId, winners, pot);
        
        // Reset and create next game
        currentDailyPot = 0;
        dailyGameId++;
        _initializeDailyGame(dailyGameId);
    }
    
    // ============ Weekly Game ============
    
    /**
     * @dev Claim toppings during claim window (once per week)
     * Automatically adds holdings bonus based on VMF balance snapshot
     */
    function claimToppings() external nonReentrant {
        uint256 weekId = weeklyGameId;
        WeeklyGame storage week = weeklyGames[weekId];
        PlayerWeekly storage player = weeklyPlayers[weekId][msg.sender];
        
        require(block.timestamp >= week.claimWindowStart, "Window not open");
        require(block.timestamp < week.claimWindowEnd, "Window closed");
        require(!player.hasClaimed, "Already claimed");
        require(player.toppingsEarned > 0, "No toppings");
        
        // Add holdings bonus (snapshot at claim time)
        uint256 holdingsBonus = _calculateHoldingsBonus(msg.sender);
        if (holdingsBonus > 0) {
            player.toppingsEarned += holdingsBonus;
            emit ToppingsEarned(weekId, msg.sender, holdingsBonus, "holdings_bonus");
        }
        
        // Claim all earned toppings
        uint256 claimed = player.toppingsEarned;
        player.toppingsClaimed = claimed;
        player.hasClaimed = true;
        
        week.totalClaimedToppings += claimed;
        week.claimers.push(msg.sender);
        
        emit ToppingsClaimed(weekId, msg.sender, claimed);
    }
    
    /**
     * @dev Calculate holdings bonus: 3 toppings per 1k VMF
     */
    function _calculateHoldingsBonus(address player) internal view returns (uint256) {
        uint256 balance = vmfToken.balanceOf(player);
        if (balance < HOLDINGS_UNIT) return 0;
        
        uint256 units = balance / HOLDINGS_UNIT;
        return units * HOLDINGS_TOPPINGS;
    }
    
    /**
     * @dev Settle weekly game (owner or after claim window)
     */
    function settleWeeklyGame() external nonReentrant {
        uint256 weekId = weeklyGameId;
        WeeklyGame storage week = weeklyGames[weekId];
        
        require(block.timestamp >= week.claimWindowEnd, "Window not closed");
        require(!week.settled, "Already settled");
        
        _settleWeeklyGame(weekId);
    }
    
    function _settleWeeklyGame(uint256 weekId) internal {
        WeeklyGame storage week = weeklyGames[weekId];
        
        // No claimers: no jackpot
        if (week.claimers.length == 0 || week.totalClaimedToppings == 0) {
            week.settled = true;
            weeklyGameId++;
            _initializeWeeklyGame(weeklyGameId);
            emit WeeklyGameSettled(weekId, new address[](0), 0);
            return;
        }
        
        // Jackpot = total claimed toppings × 10 VMF
        uint256 jackpot = week.totalClaimedToppings * TOPPING_TO_VMF;
        
        // Pull from treasury
        vmfToken.safeTransferFrom(treasuryWallet, address(this), jackpot);
        
        // Select winners weighted by claimed toppings
        uint256 winnerCount = week.claimers.length < WEEKLY_WINNERS ? week.claimers.length : WEEKLY_WINNERS;
        address[] memory winners = _selectWeightedWinners(week.claimers, weekId, winnerCount);
        
        // Pay winners equally
        uint256 payoutEach = jackpot / winnerCount;
        uint256 remainder = jackpot - (payoutEach * winnerCount);
        
        uint256[] memory winnerPayouts = new uint256[](winnerCount);
        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 payout = payoutEach;
            if (i == 0 && remainder > 0) {
                payout += remainder; // First winner gets dust
            }
            vmfToken.safeTransfer(winners[i], payout);
            winnerPayouts[i] = payout;
        }
        
        week.winners = winners;
        week.potAmount = jackpot;
        week.settled = true;

        for (uint256 i = 0; i < winnerCount; i++) {
            PlayerLifetimeStats storage stats = playerStats[winners[i]];
            stats.totalWeeklyWins += 1;
            stats.totalVmfWon += winnerPayouts[i];
        }
        
        emit WeeklyGameSettled(weekId, winners, jackpot);
        
        // Start next week
        weeklyGameId++;
        _initializeWeeklyGame(weeklyGameId);
    }
    
    // ============ Referral System ============
    
    /**
     * @dev Get referral code for a player (view function - no transaction needed!)
     * Code is deterministically generated from player address
     */
    function getReferralCode(address player) external view returns (string memory) {
        return _generateCode(player);
    }
    
    /**
     * @dev Get player address from a referral code (if registered)
     */
    function getPlayerFromCode(string memory code) external view returns (address) {
        return codeToPlayer[code];
    }

    function createReferralCode() external {
        require(bytes(playerReferralCode[msg.sender]).length == 0, "Code exists");
        
        string memory code = _generateCode(msg.sender);
        
        // Deterministic generation; collision check for safety
        require(codeToPlayer[code] == address(0), "Code collision");
        
        playerReferralCode[msg.sender] = code;
        codeToPlayer[code] = msg.sender;
        
        emit ReferralCodeCreated(msg.sender, code);
    }
    
    function _generateCode(address player) internal view returns (string memory) {
        // Deterministic hash based on player + contract address
        bytes32 h = keccak256(abi.encodePacked(player, address(this)));
        bytes memory alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 34 chars (no I/O)
        bytes memory out = new bytes(8);
        
        // Use both nibbles of each byte for better entropy
        for (uint256 i = 0; i < 4; i++) {
            uint8 highNibble = uint8(h[i]) >> 4;
            uint8 lowNibble = uint8(h[i]) & 0x0F;
            
            // Ensure we stay within alphabet bounds (0-33)
            out[i*2] = alphabet[highNibble % 34];
            out[i*2 + 1] = alphabet[lowNibble % 34];
        }
        
        return string(abi.encodePacked("PZ", out));
    }
    
    /**
     * @dev Validate and get referrer address from code
     */
    function _getReferrerFromCode(string memory code) internal view returns (address) {
        require(bytes(code).length == 10, "Invalid code length");
        require(bytes(code)[0] == 'P' && bytes(code)[1] == 'Z', "Invalid code prefix");
        
        // Check if it's registered in the mapping
        address registered = codeToPlayer[code];
        require(registered != address(0), "Code not found");

        // Ensure referrer has played at least once
        require(playerStats[registered].lifetimeToppings > 0, "Referrer must play first");

        return registered;
    }
    
    function _processReferral(address referee, string memory code) internal {
        require(!hasUsedReferral[referee], "Already used referral");
        
        address referrer = _getReferrerFromCode(code);
        require(referrer != referee, "Cannot refer self");
        
        uint256 weekId = weeklyGameId;
        PlayerWeekly storage referrerWeekly = weeklyPlayers[weekId][referrer];
        
        require(referrerWeekly.referralsUsed < MAX_REFERRALS_PER_WEEK, "Referral limit");
        
        // Mark as used (lifetime)
        hasUsedReferral[referee] = true;
        
        // Increment referral count
        referrerWeekly.referralsUsed++;

        // Award 2 toppings to referrer
        referrerWeekly.toppingsEarned += 2;
        playerStats[referrer].lifetimeReferrals += 1;

        emit ReferralUsed(referrer, referee);
        emit ToppingsEarned(weekId, referrer, 2, "referral");
    }
    
    // ============ Random Selection ============
    
    function _selectRandomWinners(
        address[] memory candidates,
        uint256 count,
        uint256 seed
    ) internal view returns (address[] memory) {
        uint256 n = candidates.length;
        address[] memory winners = new address[](count);
        bool[] memory selected = new bool[](n);
        
        uint256 randSeed = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            seed,
            currentDailyPot
        )));
        
        uint256 picked = 0;
        uint256 attempts = 0;
        uint256 maxAttempts = count * 10; // Prevent infinite loops
        
        while (picked < count && attempts < maxAttempts) {
            randSeed = uint256(keccak256(abi.encodePacked(randSeed, attempts)));
            uint256 idx = randSeed % n;
            
            if (!selected[idx]) {
                selected[idx] = true;
                winners[picked] = candidates[idx];
                picked++;
            }
            
            attempts++;
        }
        
        return winners;
    }
    
    function _selectWeightedWinners(
        address[] memory participants,
        uint256 weekId,
        uint256 count
    ) internal view returns (address[] memory) {
        uint256 n = participants.length;
        address[] memory winners = new address[](count);
        bool[] memory selected = new bool[](n);
        
        // Build prefix sums for weighted selection
        uint256[] memory prefixSums = new uint256[](n);
        uint256 totalWeight = 0;
        
        for (uint256 i = 0; i < n; i++) {
            uint256 weight = weeklyPlayers[weekId][participants[i]].toppingsClaimed;
            totalWeight += weight;
            prefixSums[i] = totalWeight;
        }
        
        require(totalWeight > 0, "No weight");
        
        bytes32 randSeed = keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            weekId,
            totalWeight
        ));
        
        uint256 picked = 0;
        uint256 attempts = 0;
        uint256 maxAttempts = count * 10; // Prevent infinite loops
        
        while (picked < count && attempts < maxAttempts) {
            uint256 draw = uint256(keccak256(abi.encodePacked(randSeed, attempts))) % totalWeight;
            
            // Binary search for winner
            uint256 lo = 0;
            uint256 hi = n;
            while (lo < hi) {
                uint256 mid = (lo + hi) / 2;
                if (draw < prefixSums[mid]) {
                    hi = mid;
                } else {
                    lo = mid + 1;
                }
            }
            
            uint256 idx = lo < n ? lo : n - 1;
            
            if (!selected[idx]) {
                selected[idx] = true;
                winners[picked] = participants[idx];
                picked++;
            }
            
            attempts++;
        }
        
        // Resize if needed
        if (picked < count) {
            address[] memory resized = new address[](picked);
            for (uint256 i = 0; i < picked; i++) {
                resized[i] = winners[i];
            }
            return resized;
        }
        
        return winners;
    }
    
    // ============ Time Helpers ============
    
    function _initializeDailyGame(uint256 gameId) internal {
        uint256 endTime = _nextNoonPT(block.timestamp);
        uint256 startTime = endTime - 1 days;
        
        dailyGames[gameId].startTime = startTime;
        dailyGames[gameId].endTime = endTime;
        
        emit DailyGameStarted(gameId, startTime, endTime);
    }
    
    function _initializeWeeklyGame(uint256 gameId) internal {
        uint256 claimStart = _nextSundayNoonPT(block.timestamp);
        uint256 claimEnd = claimStart + 24 hours;
        
        weeklyGames[gameId].claimWindowStart = claimStart;
        weeklyGames[gameId].claimWindowEnd = claimEnd;
        
        emit WeeklyGameStarted(gameId, claimStart, claimEnd);
    }
    
    function _nextNoonPT(uint256 timestamp) internal pure returns (uint256) {
        uint256 PT_OFFSET = 8 hours; // PST/PDT offset (PT = UTC-8)
        uint256 dayStart = (timestamp / 1 days) * 1 days;
        uint256 noonPT = dayStart + (12 hours + PT_OFFSET); // 12pm PT = 20:00 UTC
        
        if (timestamp >= noonPT) {
            return noonPT + 1 days;
        }
        return noonPT;
    }
    
    function _nextSundayNoonPT(uint256 timestamp) internal pure returns (uint256) {
        uint256 THURSDAY_EPOCH = 4 days;
        uint256 daysSinceEpoch = (timestamp + THURSDAY_EPOCH) / 1 days;
        uint256 dayOfWeek = daysSinceEpoch % 7;
        uint256 daysUntilSunday = (7 - dayOfWeek) % 7;
        
        if (daysUntilSunday == 0) {
            uint256 sundayNoon = (timestamp / 1 days) * 1 days + 20 hours;
            if (timestamp >= sundayNoon) {
                daysUntilSunday = 7;
            }
        }
        
        uint256 nextSundayMidnight = ((timestamp / 1 days) + daysUntilSunday) * 1 days;
        return nextSundayMidnight + 20 hours; // 12pm PT = 20:00 UTC
    }
    
    // ============ View Functions ============
    
    function getCurrentDailyGame() external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 playerCount,
        uint256 pot,
        bool settled
    ) {
        DailyGame storage game = dailyGames[dailyGameId];
        return (
            game.startTime,
            game.endTime,
            game.players.length,
            currentDailyPot,
            game.settled
        );
    }
    
    function getCurrentWeeklyGame() external view returns (
        uint256 claimStart,
        uint256 claimEnd,
        uint256 totalToppings,
        uint256 claimerCount,
        uint256 projectedJackpot,
        bool settled
    ) {
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        uint256 jackpot = week.totalClaimedToppings * TOPPING_TO_VMF;
        
        return (
            week.claimWindowStart,
            week.claimWindowEnd,
            week.totalClaimedToppings,
            week.claimers.length,
            jackpot,
            week.settled
        );
    }
    
    function getPlayerWeeklyInfo(address player) external view returns (
        uint256 toppingsEarned,
        uint256 toppingsClaimed,
        uint256 dailyPlays,
        uint256 referralsUsed,
        bool hasClaimed,
        uint256 projectedHoldingsBonus
    ) {
        PlayerWeekly storage p = weeklyPlayers[weeklyGameId][player];
        uint256 bonus = _calculateHoldingsBonus(player);

        return (
            p.toppingsEarned,
            p.toppingsClaimed,
            p.dailyPlays,
            p.referralsUsed,
            p.hasClaimed,
            bonus
        );
    }

    function getPlayerLifetimeStats(address player) external view returns (
        uint256 totalDailyWins,
        uint256 totalWeeklyWins,
        uint256 totalVmfWon,
        uint256 lifetimeToppings,
        uint256 lifetimeReferrals
    ) {
        PlayerLifetimeStats storage stats = playerStats[player];
        return (
            stats.totalDailyWins,
            stats.totalWeeklyWins,
            stats.totalVmfWon,
            stats.lifetimeToppings,
            stats.lifetimeReferrals
        );
    }
    
    function hasPlayedDailyGame(address player) external view returns (bool) {
        return hasPlayedDaily[dailyGameId][player];
    }
    
    function isDailyGameReady() external view returns (bool) {
        DailyGame storage game = dailyGames[dailyGameId];
        return block.timestamp >= game.endTime && !game.settled;
    }
    
    function isClaimWindowOpen() external view returns (bool) {
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        return block.timestamp >= week.claimWindowStart && block.timestamp < week.claimWindowEnd;
    }
    
    function isWeeklyGameReady() external view returns (bool) {
        WeeklyGame storage week = weeklyGames[weeklyGameId];
        return block.timestamp >= week.claimWindowEnd && !week.settled;
    }
    
    function getDailyGamePlayers(uint256 gameId) external view returns (address[] memory) {
        return dailyGames[gameId].players;
    }
    
    function getDailyGameWinners(uint256 gameId) external view returns (address[] memory) {
        return dailyGames[gameId].winners;
    }
    
    function getWeeklyGameClaimers(uint256 weekId) external view returns (address[] memory) {
        return weeklyGames[weekId].claimers;
    }
    
    function getWeeklyGameWinners(uint256 weekId) external view returns (address[] memory) {
        return weeklyGames[weekId].winners;
    }
    
    // ============ Admin Functions ============

    /**
     * @dev Migrate player stats from old contract to preserve history on redeployment
     * Call this after deploying new contract to import stats from previous deployment
     * @param players Array of player addresses
     * @param stats Array of PlayerLifetimeStats corresponding to each player
     */
    function migratePlayerStats(
        address[] calldata players,
        PlayerLifetimeStats[] calldata stats
    ) external onlyOwner {
        require(players.length == stats.length, "Length mismatch");
        require(players.length > 0, "Empty array");

        for (uint256 i = 0; i < players.length; i++) {
            require(players[i] != address(0), "Invalid player address");
            playerStats[players[i]] = stats[i];
        }
    }

    function setTreasuryWallet(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasuryWallet = _treasury;
    }

    function setOwnerFee(uint256 _bps) external onlyOwner {
        require(_bps <= MAX_OWNER_FEE_BPS, "Fee exceeds maximum");
        uint256 oldFee = ownerFeeBPS;
        ownerFeeBPS = _bps;
        emit OwnerFeeUpdated(oldFee, _bps);
    }

    function setCharityWallets(address[] memory _charities) external onlyOwner {
        require(_charities.length <= MAX_CHARITIES, "Too many charities");

        for (uint256 i = 0; i < _charities.length; i++) {
            require(_charities[i] != address(0), "Invalid charity address");
            for (uint256 j = i + 1; j < _charities.length; j++) {
                require(_charities[i] != _charities[j], "Duplicate charity");
            }
        }

        address[] memory oldCharities = new address[](charityWallets.length);
        for (uint256 i = 0; i < charityWallets.length; i++) {
            oldCharities[i] = charityWallets[i];
        }

        charityWallets = _charities;
        emit CharityWalletsUpdated(oldCharities, _charities);
    }

    function addCharityWallet(address _charity) external onlyOwner {
        require(_charity != address(0), "Invalid charity");
        require(charityWallets.length < MAX_CHARITIES, "Max charities reached");

        for (uint256 i = 0; i < charityWallets.length; i++) {
            require(charityWallets[i] != _charity, "Charity already exists");
        }

        address[] memory oldCharities = new address[](charityWallets.length);
        for (uint256 i = 0; i < charityWallets.length; i++) {
            oldCharities[i] = charityWallets[i];
        }

        charityWallets.push(_charity);
        emit CharityWalletsUpdated(oldCharities, charityWallets);
    }

    function removeCharityWallet(uint256 index) external onlyOwner {
        require(index < charityWallets.length, "Invalid index");

        address[] memory oldCharities = new address[](charityWallets.length);
        for (uint256 i = 0; i < charityWallets.length; i++) {
            oldCharities[i] = charityWallets[i];
        }

        charityWallets[index] = charityWallets[charityWallets.length - 1];
        charityWallets.pop();
        emit CharityWalletsUpdated(oldCharities, charityWallets);
    }
    
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = vmfToken.balanceOf(address(this));
        vmfToken.safeTransfer(owner(), balance);
    }
    
    function emergencySettleDaily() external onlyOwner {
        uint256 gameId = dailyGameId;
        require(!dailyGames[gameId].settled, "Already settled");
        _settleDailyGame(gameId);
    }
    
    function emergencySettleWeekly() external onlyOwner {
        uint256 weekId = weeklyGameId;
        require(!weeklyGames[weekId].settled, "Already settled");
        _settleWeeklyGame(weekId);
    }

    // ============ Stat Migration ============

    /**
     * @dev Migrate player stats from old contract to this new contract
     * Allows seamless redeployment without losing player history
     * @param oldContract Address of the previous PizzaParty contract
     * @param players Array of player addresses to migrate stats for
     */
    function migratePlayerStats(address oldContract, address[] calldata players) external onlyOwner {
        require(oldContract != address(0), "Invalid old contract");
        require(players.length > 0, "No players to migrate");

        // Call the old contract to fetch stats for each player
        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            require(player != address(0), "Invalid player address");

            // Call old contract's playerStats mapping (read-only via delegatecall simulation)
            // We use a low-level call to safely get the data
            (bool success, bytes memory result) = oldContract.staticcall(
                abi.encodeWithSignature("playerStats(address)", player)
            );

            if (success && result.length == 128) {
                // Decode: (uint256 totalDailyWins, uint256 totalWeeklyWins, uint256 totalVmfWon, uint256 lifetimeToppings, uint256 lifetimeReferrals)
                (uint256 dailyWins, uint256 weeklyWins, uint256 vmfWon, uint256 toppings, uint256 referrals) =
                    abi.decode(result, (uint256, uint256, uint256, uint256, uint256));

                playerStats[player] = PlayerLifetimeStats({
                    totalDailyWins: dailyWins,
                    totalWeeklyWins: weeklyWins,
                    totalVmfWon: vmfWon,
                    lifetimeToppings: toppings,
                    lifetimeReferrals: referrals
                });
            }
        }
    }
}

