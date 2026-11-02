// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RewardVault
 * @dev Holds and distributes pre-funded rewards for seasons
 * 
 * TODO: Implement in Phase 6
 * - Reward deposits (BNB or tokens)
 * - Eligibility verification
 * - Claim limits per user
 * - Season-specific accounting
 * - Reward history
 * 
 * This is a placeholder for the contract structure.
 */
contract RewardVault is Ownable, ReentrancyGuard {
    struct RewardPool {
        uint256 seasonId;
        address token; // address(0) = BNB
        uint256 totalAmount;
        uint256 claimedAmount;
        bool active;
    }
    
    struct UserClaim {
        uint256 seasonId;
        address user;
        uint256 claimedAmount;
        uint256 timestamp;
    }
    
    mapping(uint256 => RewardPool) public rewardPools;
    mapping(uint256 => mapping(address => uint256)) public userClaims;
    mapping(uint256 => uint256) public poolClaimCount;
    
    uint256 public poolCount;
    
    event RewardPoolCreated(uint256 indexed seasonId, address indexed token, uint256 amount);
    event RewardDeposited(uint256 indexed seasonId, uint256 amount);
    event RewardClaimed(uint256 indexed seasonId, address indexed user, uint256 amount);
    event RewardPoolClosed(uint256 indexed seasonId);
    
    constructor() Ownable(msg.sender) {}
    
    function createRewardPool(uint256 seasonId, address token) external onlyOwner {
        require(rewardPools[seasonId].totalAmount == 0, "Pool exists");
        rewardPools[seasonId] = RewardPool({
            seasonId: seasonId,
            token: token,
            totalAmount: 0,
            claimedAmount: 0,
            active: true
        });
        poolCount++;
        emit RewardPoolCreated(seasonId, token, 0);
    }
    
    function depositReward(uint256 seasonId) external payable onlyOwner {
        RewardPool storage pool = rewardPools[seasonId];
        require(pool.active, "Pool not active");
        require(msg.value > 0 || pool.token != address(0), "No value");
        
        pool.totalAmount += msg.value;
        emit RewardDeposited(seasonId, msg.value);
    }
    
    function claimReward(uint256 seasonId, uint256 amount) external nonReentrant {
        RewardPool storage pool = rewardPools[seasonId];
        require(pool.active, "Pool not active");
        require(amount > 0, "Amount must be > 0");
        
        uint256 userClaimed = userClaims[seasonId][msg.sender];
        uint256 available = pool.totalAmount - pool.claimedAmount;
        
        require(userClaimed + amount <= available, "Insufficient pool balance");
        
        userClaims[seasonId][msg.sender] = userClaimed + amount;
        pool.claimedAmount += amount;
        poolClaimCount[seasonId]++;
        
        if (pool.token == address(0)) {
            payable(msg.sender).transfer(amount);
        } else {
            // ERC20 transfer would go here
        }
        
        emit RewardClaimed(seasonId, msg.sender, amount);
    }
    
    function closeRewardPool(uint256 seasonId) external onlyOwner {
        RewardPool storage pool = rewardPools[seasonId];
        require(pool.active, "Already closed");
        pool.active = false;
        emit RewardPoolClosed(seasonId);
    }
    
    function getPoolInfo(uint256 seasonId) external view returns (RewardPool memory) {
        return rewardPools[seasonId];
    }
    
    function getUserClaim(uint256 seasonId, address user) external view returns (uint256) {
        return userClaims[seasonId][user];
    }
}