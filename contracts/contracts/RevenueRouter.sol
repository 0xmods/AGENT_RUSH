// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueRouter
 * @dev Distributes paid mint revenue according to predefined percentages
 * 
 * Allocation:
 * - Treasury: 35%
 * - Season Reward Fund: 25%
 * - Liquidity/Reserve: 15%
 * - Development: 15%
 * - Community: 5%
 * - Security & Operations: 5%
 * Total: 100%
 * 
 * The router does NOT allow arbitrary redistribution of existing allocations.
 * Only the owner can update recipient addresses (not percentages).
 */
contract RevenueRouter is Ownable, ReentrancyGuard {
    // Allocation percentages (basis points = 1/100 of 1%)
    uint256 public constant TREASURY_BPS = 3500;      // 35%
    uint256 public constant REWARD_FUND_BPS = 2500;   // 25%
    uint256 public constant LIQUIDITY_BPS = 1500;     // 15%
    uint256 public constant DEVELOPMENT_BPS = 1500;   // 15%
    uint256 public constant COMMUNITY_BPS = 500;      // 5%
    uint256 public constant SECURITY_BPS = 500;       // 5%
    uint256 public constant TOTAL_BPS = 10000;        // 100%
    
    // Recipient addresses
    address payable public treasury;
    address payable public rewardFund;
    address payable public liquidityReserve;
    address payable public development;
    address payable public community;
    address payable public securityOperations;
    
    // Track allocated but unclaimed amounts
    mapping(address => uint256) public unclaimedAllocations;
    
    // Total received and distributed
    uint256 public totalReceived;
    uint256 public totalDistributed;
    
    // Events
    event RevenueDistributed(
        uint256 indexed amount,
        uint256 treasuryAmount,
        uint256 rewardFundAmount,
        uint256 liquidityAmount,
        uint256 developmentAmount,
        uint256 communityAmount,
        uint256 securityAmount
    );
    
    event AllocationClaimed(address indexed recipient, uint256 amount);
    
    event RecipientUpdated(
        string allocationName,
        address indexed oldRecipient,
        address indexed newRecipient
    );
    
    // Errors
    error ZeroAddress();
    error InvalidAllocation();
    error NothingToClaim();
    error AllocationMismatch();
    
    constructor(
        address _treasury,
        address _rewardFund,
        address _liquidityReserve,
        address _development,
        address _community,
        address _securityOperations
    ) Ownable(msg.sender) {
        require(_treasury != address(0), "Treasury required");
        require(_rewardFund != address(0), "Reward Fund required");
        require(_liquidityReserve != address(0), "Liquidity Reserve required");
        require(_development != address(0), "Development required");
        require(_community != address(0), "Community required");
        require(_securityOperations != address(0), "Security Operations required");
        
        treasury = payable(_treasury);
        rewardFund = payable(_rewardFund);
        liquidityReserve = payable(_liquidityReserve);
        development = payable(_development);
        community = payable(_community);
        securityOperations = payable(_securityOperations);
    }
    
    /**
     * @dev Receive and distribute revenue from paid mints
     * Called by AgentRush contract during paid mint
     */
    function distributeRevenue() external payable nonReentrant {
        require(msg.value > 0, "No value sent");
        
        uint256 amount = msg.value;
        totalReceived += amount;
        
        // Calculate allocations
        uint256 treasuryAmount = (amount * TREASURY_BPS) / TOTAL_BPS;
        uint256 rewardFundAmount = (amount * REWARD_FUND_BPS) / TOTAL_BPS;
        uint256 liquidityAmount = (amount * LIQUIDITY_BPS) / TOTAL_BPS;
        uint256 developmentAmount = (amount * DEVELOPMENT_BPS) / TOTAL_BPS;
        uint256 communityAmount = (amount * COMMUNITY_BPS) / TOTAL_BPS;
        uint256 securityAmount = (amount * SECURITY_BPS) / TOTAL_BPS;
        
        // Handle dust (rounding remainder goes to treasury)
        uint256 allocated = treasuryAmount + rewardFundAmount + liquidityAmount + 
                           developmentAmount + communityAmount + securityAmount;
        if (allocated < amount) {
            treasuryAmount += amount - allocated;
        }
        
        // Track unclaimed allocations
        unclaimedAllocations[treasury] += treasuryAmount;
        unclaimedAllocations[rewardFund] += rewardFundAmount;
        unclaimedAllocations[liquidityReserve] += liquidityAmount;
        unclaimedAllocations[development] += developmentAmount;
        unclaimedAllocations[community] += communityAmount;
        unclaimedAllocations[securityOperations] += securityAmount;
        
        totalDistributed += amount;
        
        emit RevenueDistributed(
            amount,
            treasuryAmount,
            rewardFundAmount,
            liquidityAmount,
            developmentAmount,
            communityAmount,
            securityAmount
        );
    }
    
    /**
     * @dev Claim allocated funds for a recipient
     * Only callable by the designated recipients
     */
    function claimAllocation() external nonReentrant {
        uint256 amount = unclaimedAllocations[msg.sender];
        if (amount == 0) {
            revert NothingToClaim();
        }
        
        unclaimedAllocations[msg.sender] = 0;
        
        // Send funds
        payable(msg.sender).transfer(amount);
        
        emit AllocationClaimed(msg.sender, amount);
    }
    
    /**
     * @dev Get unclaimed allocation for an address
     */
    function getAllocation(address recipient) external view returns (uint256) {
        return unclaimedAllocations[recipient];
    }
    
    /**
     * @dev Update recipient address for an allocation
     * Only owner can call, percentages cannot be changed
     */
    function updateRecipient(string calldata allocationName, address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Zero address");
        
        address oldRecipient;
        
        if (keccak256(bytes(allocationName)) == keccak256(bytes("treasury"))) {
            oldRecipient = treasury;
            treasury = payable(newRecipient);
        } else if (keccak256(bytes(allocationName)) == keccak256(bytes("rewardFund"))) {
            oldRecipient = rewardFund;
            rewardFund = payable(newRecipient);
        } else if (keccak256(bytes(allocationName)) == keccak256(bytes("liquidityReserve"))) {
            oldRecipient = liquidityReserve;
            liquidityReserve = payable(newRecipient);
        } else if (keccak256(bytes(allocationName)) == keccak256(bytes("development"))) {
            oldRecipient = development;
            development = payable(newRecipient);
        } else if (keccak256(bytes(allocationName)) == keccak256(bytes("community"))) {
            oldRecipient = community;
            community = payable(newRecipient);
        } else if (keccak256(bytes(allocationName)) == keccak256(bytes("securityOperations"))) {
            oldRecipient = securityOperations;
            securityOperations = payable(newRecipient);
        } else {
            revert InvalidAllocation();
        }
        
        emit RecipientUpdated(allocationName, oldRecipient, newRecipient);
    }
    
    /**
     * @dev Get all allocation percentages (for verification)
     */
    function getAllocationPercentages() external pure returns (
        uint256 treasuryBps,
        uint256 rewardFundBps,
        uint256 liquidityBps,
        uint256 developmentBps,
        uint256 communityBps,
        uint256 securityBps,
        uint256 totalBps
    ) {
        return (
            TREASURY_BPS,
            REWARD_FUND_BPS,
            LIQUIDITY_BPS,
            DEVELOPMENT_BPS,
            COMMUNITY_BPS,
            SECURITY_BPS,
            TOTAL_BPS
        );
    }
    
    /**
     * @dev Get all recipient addresses
     */
    function getAllRecipients() external view returns (
        address treasury_,
        address rewardFund_,
        address liquidityReserve_,
        address development_,
        address community_,
        address securityOperations_
    ) {
        return (
            treasury,
            rewardFund,
            liquidityReserve,
            development,
            community,
            securityOperations
        );
    }
    
    /**
     * @dev Emergency withdraw (if funds stuck)
     */
    function emergencyWithdraw(address payable to) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 balance = address(this).balance;
        if (balance > 0) {
            to.transfer(balance);
        }
    }
}