// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SeasonManager
 * @dev Manages seasons, missions, and achievements
 * 
 * TODO: Implement in Phase 6
 * - Season registration and lifecycle
 * - Mission configuration and verification
 * - Achievement tracking
 * - Reward claims coordination
 * 
 * This is a placeholder for the contract structure.
 */
contract SeasonManager is Ownable {
    uint256 public currentSeason;
    uint256 public seasonStartTime;
    uint256 public seasonDuration;
    
    struct Season {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        uint256 rewardPool;
        bool active;
    }
    
    mapping(uint256 => Season) public seasons;
    
    event SeasonCreated(uint256 indexed seasonId, uint256 startTime, uint256 duration);
    event SeasonEnded(uint256 indexed seasonId, uint256 endTime);
    event MissionAdded(uint256 indexed seasonId, uint256 missionId);
    event MissionCompleted(address indexed user, uint256 indexed seasonId, uint256 missionId);
    
    constructor(uint256 _seasonDuration) Ownable(msg.sender) {
        seasonDuration = _seasonDuration;
        currentSeason = 0;
    }
    
    function createSeason(uint256 rewardPool) external onlyOwner {
        currentSeason++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + seasonDuration;
        
        seasons[currentSeason] = Season({
            id: currentSeason,
            startTime: startTime,
            endTime: endTime,
            rewardPool: rewardPool,
            active: true
        });
        
        emit SeasonCreated(currentSeason, startTime, seasonDuration);
    }
    
    function endSeason() external onlyOwner {
        require(seasons[currentSeason].active, "Season not active");
        seasons[currentSeason].active = false;
        seasons[currentSeason].endTime = block.timestamp;
        emit SeasonEnded(currentSeason, block.timestamp);
    }
    
    function getCurrentSeason() external view returns (uint256) {
        return currentSeason;
    }
    
    function getSeasonInfo(uint256 seasonId) external view returns (Season memory) {
        return seasons[seasonId];
    }
}