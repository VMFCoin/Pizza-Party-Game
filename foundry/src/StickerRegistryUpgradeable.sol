// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title StickerRegistryUpgradeable
 * @dev On-chain registry for Pizza Party QR sticker finds around the world.
 *      Records finder, location, and timestamp as permanent proof.
 *      UUPS upgradeable for future gamification (rewards, badges, etc.)
 */
contract StickerRegistryUpgradeable is
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // ============ Events ============

    event StickerFound(
        uint256 indexed findId,
        address indexed finder,
        int256 latitude,
        int256 longitude,
        string city,
        uint256 timestamp
    );

    // ============ Errors ============

    error InvalidCoordinates();

    // ============ Storage ============

    struct StickerFindRecord {
        address finder;
        int256 latitude;     // Scaled by 1e6 (e.g., 40.7128 = 40712800)
        int256 longitude;    // Scaled by 1e6 (e.g., -74.0060 = -74006000)
        string city;
        uint256 timestamp;
    }

    // All finds
    StickerFindRecord[] public finds;

    // Finder address => array of find IDs
    mapping(address => uint256[]) public finderFinds;

    // Total finds counter
    uint256 public totalFinds;

    // Stats
    uint256 public uniqueFinders;
    mapping(address => bool) public hasFound;

    // Upgrade safety gap
    uint256[43] private __gap;

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ Initializer ============

    function initialize(address _owner) public initializer {
        if (_owner == address(0)) revert InvalidCoordinates();

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
    }

    // ============ Core Functions ============

    /**
     * @dev Record a sticker find on-chain
     * @param _latitude Latitude scaled by 1e6 (e.g., 40712800 for 40.7128)
     * @param _longitude Longitude scaled by 1e6 (e.g., -74006000 for -74.0060)
     * @param _city Nearest city name
     */
    function recordFind(
        int256 _latitude,
        int256 _longitude,
        string calldata _city
    ) external {
        // Validate coordinates (latitude: -90 to 90, longitude: -180 to 180, scaled by 1e6)
        if (_latitude < -90_000_000 || _latitude > 90_000_000) revert InvalidCoordinates();
        if (_longitude < -180_000_000 || _longitude > 180_000_000) revert InvalidCoordinates();

        uint256 findId = finds.length;

        finds.push(StickerFindRecord({
            finder: msg.sender,
            latitude: _latitude,
            longitude: _longitude,
            city: _city,
            timestamp: block.timestamp
        }));

        finderFinds[msg.sender].push(findId);
        totalFinds++;

        if (!hasFound[msg.sender]) {
            hasFound[msg.sender] = true;
            uniqueFinders++;
        }

        emit StickerFound(findId, msg.sender, _latitude, _longitude, _city, block.timestamp);
    }

    // ============ View Functions ============

    /**
     * @dev Get total finds by a specific finder
     */
    function getFinderFindCount(address _finder) external view returns (uint256) {
        return finderFinds[_finder].length;
    }

    /**
     * @dev Get find IDs for a specific finder
     */
    function getFinderFindIds(address _finder) external view returns (uint256[] memory) {
        return finderFinds[_finder];
    }

    /**
     * @dev Get a specific find record
     */
    function getFindById(uint256 _findId) external view returns (
        address finder,
        int256 latitude,
        int256 longitude,
        string memory city,
        uint256 timestamp
    ) {
        StickerFindRecord storage find = finds[_findId];
        return (find.finder, find.latitude, find.longitude, find.city, find.timestamp);
    }

    /**
     * @dev Get recent finds (paginated)
     */
    function getRecentFinds(uint256 _offset, uint256 _limit) external view returns (
        StickerFindRecord[] memory records
    ) {
        uint256 total = finds.length;
        if (_offset >= total) {
            return new StickerFindRecord[](0);
        }

        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 count = end - _offset;

        records = new StickerFindRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            // Return newest first
            records[i] = finds[total - 1 - _offset - i];
        }
    }

    // ============ Upgrade Authorization ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
