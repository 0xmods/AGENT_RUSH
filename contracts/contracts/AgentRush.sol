// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

// ===========================================
// Interfaces (must be outside contract)
// ===========================================

/**
 * @title IAgentIdRegistry
 * @dev Interface for Binance Agent ID Registry
 * 
 * IMPORTANT: The official Binance Agent ID Registry must implement these methods.
 * For testnet, use MockAgentIdRegistry. For mainnet, replace with official contract address.
 */
interface IAgentIdRegistry {
    function hasValidAgentId(address wallet) external view returns (bool);
    function getAgentId(address wallet) external view returns (bytes32);
    function isAgentIdRevoked(bytes32 agentId) external view returns (bool);
}

/**
 * @title IRevenueRouter
 * @dev Interface for Revenue Router
 */
interface IRevenueRouter {
    function distributeRevenue() external payable;
    function getAllocation(address recipient) external view returns (uint256);
}

/**
 * @title AgentRush
 * @dev Main NFT contract for AGENT RUSH - Mint-to-Play ecosystem on BNB Smart Chain
 * 
 * Features:
 * - ERC-721 NFT with metadata storage
 * - Binance Agent ID verification for eligibility
 * - Free first mint per Agent ID per season
 * - Paid subsequent mints (configurable price)
 * - Maximum 10 NFTs per Agent ID per season
 * - Maximum 10,000 Genesis supply
 * - Revenue allocation to Treasury, Rewards, Liquidity, Dev, Community, Security
 * - Pausable minting (transfers still work)
 * - ERC-2981 royalty support
 * - Season management
 */
contract AgentRush is ERC721, ERC721URIStorage, ERC721Royalty, Ownable, Pausable, ReentrancyGuard {
    
    // ===========================================
    // State Variables
    // ===========================================
    uint256 private _tokenIdCounter;
    
    // Season tracking
    uint256 public currentSeason;
    uint256 public seasonStartTimestamp;
    uint256 public constant SEASON_DURATION = 30 days; // 30 days per season
    
    // Genesis supply limit
    uint256 public constant MAX_GENESIS_SUPPLY = 10000;
    
    // Mint limits per Agent ID per season
    uint256 public constant MAX_MINT_PER_AGENT_PER_SEASON = 10;
    
    // Mint pricing
    uint256 public paidMintPrice; // in wei (0.001 BNB default)
    bool public freeMintEnabled;
    
    // Base URI for token metadata
    string public baseURI;
    string public baseExtension = ".json";
    
    // Agent ID Registry (set to official registry on mainnet)
    IAgentIdRegistry public agentIdRegistry;
    
    // Revenue Router for payment distribution
    IRevenueRouter public revenueRouter;
    
    // Mint tracking: agentId -> season -> mint count
    mapping(bytes32 => mapping(uint256 => uint256)) public agentSeasonMintCount;
    
    // Track if an agent has used their free mint in current season
    mapping(bytes32 => mapping(uint256 => bool)) public agentFreeMintUsed;
    
    // Total mints in current season (for analytics)
    uint256 public totalSeasonMints;
    
    // Events
    event Minted(
        address indexed minter,
        bytes32 indexed agentId,
        uint256 indexed tokenId,
        uint256 quantity,
        uint256 pricePaid,
        bool wasFreeMint
    );
    
    event PaidMintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event FreeMintToggled(bool enabled);
    event BaseURIUpdated(string oldURI, string newURI);
    event AgentIdRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event RevenueRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event SeasonStarted(uint256 indexed season, uint256 startTimestamp);
    event SeasonEnded(uint256 indexed season, uint256 endTimestamp, uint256 totalMints);
    event MintPaused(address indexed by);
    event MintUnpaused(address indexed by);
    
    // Errors
    error InvalidAgentId();
    error AgentIdRevoked();
    error MaxSupplyReached();
    error MaxMintPerAgentReached();
    error InsufficientPayment();
    error MintingPaused();
    error FreeMintNotEnabled();
    error FreeMintAlreadyUsed();
    error InvalidQuantity();
    error ZeroAddress();
    error NotOwner();
    error SeasonNotActive();
    
    // ===========================================
    // Constructor
    // ===========================================
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 _paidMintPrice,
        address _agentIdRegistry,
        address _revenueRouter
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        require(_paidMintPrice > 0, "Paid mint price must be > 0");
        require(_agentIdRegistry != address(0), "Agent ID Registry required");
        require(_revenueRouter != address(0), "Revenue Router required");
        
        paidMintPrice = _paidMintPrice;
        freeMintEnabled = true;
        currentSeason = 1;
        seasonStartTimestamp = block.timestamp;
        _tokenIdCounter = 0;
        
        agentIdRegistry = IAgentIdRegistry(_agentIdRegistry);
        revenueRouter = IRevenueRouter(_revenueRouter);
        
        // Set default royalty to 2.5% (250 basis points)
        _setDefaultRoyalty(msg.sender, 250);
    }
    
    // ===========================================
    // ERC721 Required Overrides
    // ===========================================
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    
    // ===========================================
    // Mint Functions
    // ===========================================
    
    /**
     * @dev Mint NFTs - main entry point
     * @param quantity Number of NFTs to mint (1-10)
     */
    function mint(uint256 quantity) external payable nonReentrant whenNotPaused {
        _mintInternal(msg.sender, quantity, msg.value);
    }
    
    /**
     * @dev Internal mint logic
     * @param minter The address minting
     * @param quantity Number of NFTs to mint
     * @param value ETH/BNB sent with transaction
     */
    function _mintInternal(address minter, uint256 quantity, uint256 value) internal {
        // Validate quantity
        if (quantity == 0 || quantity > MAX_MINT_PER_AGENT_PER_SEASON) {
            revert InvalidQuantity();
        }
        
        // Check max supply
        uint256 nextTokenId = _tokenIdCounter + quantity;
        if (nextTokenId > MAX_GENESIS_SUPPLY) {
            revert MaxSupplyReached();
        }
        
        // Verify Agent ID eligibility
        if (!agentIdRegistry.hasValidAgentId(minter)) {
            revert InvalidAgentId();
        }
        
        bytes32 agentId = agentIdRegistry.getAgentId(minter);
        if (agentIdRegistry.isAgentIdRevoked(agentId)) {
            revert AgentIdRevoked();
        }
        
        // Check current season mint count for this agent
        uint256 currentMintCount = agentSeasonMintCount[agentId][currentSeason];
        if (currentMintCount + quantity > MAX_MINT_PER_AGENT_PER_SEASON) {
            revert MaxMintPerAgentReached();
        }
        
        // Determine if free mint applies
        bool isFreeMint = false;
        uint256 requiredPayment = 0;
        
        if (!agentFreeMintUsed[agentId][currentSeason] && freeMintEnabled) {
            // First mint in season - free for 1 NFT
            if (quantity == 1) {
                isFreeMint = true;
                agentFreeMintUsed[agentId][currentSeason] = true;
            } else {
                // Multiple NFTs - first is free, rest are paid
                isFreeMint = true;
                agentFreeMintUsed[agentId][currentSeason] = true;
                requiredPayment = paidMintPrice * (quantity - 1);
            }
        } else {
            // All paid mints
            requiredPayment = paidMintPrice * quantity;
        }
        
        // Validate payment
        if (value < requiredPayment) {
            revert InsufficientPayment();
        }
        
        // Refund excess payment
        if (value > requiredPayment) {
            payable(minter).transfer(value - requiredPayment);
        }
        
        // Distribute revenue if paid mint
        if (requiredPayment > 0) {
            revenueRouter.distributeRevenue{value: requiredPayment}();
        }
        
        // Mint NFTs
        uint256 startTokenId = _tokenIdCounter + 1;
        for (uint256 i = 0; i < quantity; i++) {
            _tokenIdCounter++;
            uint256 newTokenId = _tokenIdCounter;
            
            _safeMint(minter, newTokenId);
            
            // Set token URI (will be updated via setBaseURI or individually)
            _setTokenURI(newTokenId, string(abi.encodePacked(baseURI, Strings.toString(newTokenId), baseExtension)));
        }
        
        // Update tracking
        agentSeasonMintCount[agentId][currentSeason] = currentMintCount + quantity;
        totalSeasonMints += quantity;
        
        emit Minted(minter, agentId, startTokenId, quantity, requiredPayment, isFreeMint);
    }
    
    /**
     * @dev Quote mint price for a wallet
     * @param wallet The wallet to check
     * @param quantity Number of NFTs to mint
     * @return isEligible Whether wallet can mint
     * @return price Required payment in wei
     * @return freeMintAvailable Whether free mint is available
     * @return remainingAllowance Remaining mints in season
     */
    function quoteMint(address wallet, uint256 quantity)
        external
        view
        returns (bool isEligible, uint256 price, bool freeMintAvailable, uint256 remainingAllowance)
    {
        if (quantity == 0 || quantity > MAX_MINT_PER_AGENT_PER_SEASON) {
            return (false, 0, false, 0);
        }
        
        // Check supply
        if (_tokenIdCounter + quantity > MAX_GENESIS_SUPPLY) {
            return (false, 0, false, 0);
        }
        
        // Check Agent ID
        if (!agentIdRegistry.hasValidAgentId(wallet)) {
            return (false, 0, false, 0);
        }
        
        bytes32 agentId = agentIdRegistry.getAgentId(wallet);
        if (agentIdRegistry.isAgentIdRevoked(agentId)) {
            return (false, 0, false, 0);
        }
        
        uint256 currentMintCount = agentSeasonMintCount[agentId][currentSeason];
        if (currentMintCount >= MAX_MINT_PER_AGENT_PER_SEASON) {
            return (true, 0, false, 0);
        }
        
        uint256 remaining = MAX_MINT_PER_AGENT_PER_SEASON - currentMintCount;
        if (quantity > remaining) {
            quantity = remaining; // Cap to remaining allowance
        }
        
        bool freeUsed = agentFreeMintUsed[agentId][currentSeason];
        bool freeAvailable = !freeUsed && freeMintEnabled;
        
        uint256 totalPrice = 0;
        if (freeAvailable) {
            if (quantity == 1) {
                totalPrice = 0;
            } else {
                totalPrice = paidMintPrice * (quantity - 1);
            }
        } else {
            totalPrice = paidMintPrice * quantity;
        }
        
        return (true, totalPrice, freeAvailable, remaining);
    }
    
    /**
     * @dev Get remaining mint allowance for a wallet in current season
     * @param wallet The wallet to check
     * @return Remaining mints allowed
     */
    function remainingMintAllowance(address wallet) external view returns (uint256) {
        if (!agentIdRegistry.hasValidAgentId(wallet)) {
            return 0;
        }
        
        bytes32 agentId = agentIdRegistry.getAgentId(wallet);
        if (agentIdRegistry.isAgentIdRevoked(agentId)) {
            return 0;
        }
        
        uint256 currentMintCount = agentSeasonMintCount[agentId][currentSeason];
        if (currentMintCount >= MAX_MINT_PER_AGENT_PER_SEASON) {
            return 0;
        }
        
        return MAX_MINT_PER_AGENT_PER_SEASON - currentMintCount;
    }
    
    /**
     * @dev Check if a wallet is eligible to mint (has valid Agent ID)
     * @param wallet The wallet to check
     * @return True if eligible
     */
    function agentIdEligible(address wallet) external view returns (bool) {
        if (!agentIdRegistry.hasValidAgentId(wallet)) {
            return false;
        }
        
        bytes32 agentId = agentIdRegistry.getAgentId(wallet);
        return !agentIdRegistry.isAgentIdRevoked(agentId);
    }
    
    // ===========================================
    // Admin Functions
    // ===========================================
    
    /**
     * @dev Set base URI for token metadata
     * @param newURI New base URI (e.g., "ipfs://QmHash/")
     */
    function setBaseURI(string calldata newURI) external onlyOwner {
        require(bytes(newURI).length > 0, "URI cannot be empty");
        string memory oldURI = baseURI;
        baseURI = newURI;
        emit BaseURIUpdated(oldURI, newURI);
    }
    
    /**
     * @dev Update paid mint price
     * @param newPrice New price in wei
     */
    function setPaidMintPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be > 0");
        uint256 oldPrice = paidMintPrice;
        paidMintPrice = newPrice;
        emit PaidMintPriceUpdated(oldPrice, newPrice);
    }
    
    /**
     * @dev Enable/disable free mint
     * @param enabled True to enable free mint
     */
    function setFreeMintEnabled(bool enabled) external onlyOwner {
        freeMintEnabled = enabled;
        emit FreeMintToggled(enabled);
    }
    
    /**
     * @dev Update Agent ID Registry (for mainnet migration)
     * @param newRegistry New registry address
     */
    function setAgentIdRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "Zero address");
        address oldRegistry = address(agentIdRegistry);
        agentIdRegistry = IAgentIdRegistry(newRegistry);
        emit AgentIdRegistryUpdated(oldRegistry, newRegistry);
    }
    
    /**
     * @dev Update Revenue Router
     * @param newRouter New router address
     */
    function setRevenueRouter(address newRouter) external onlyOwner {
        require(newRouter != address(0), "Zero address");
        address oldRouter = address(revenueRouter);
        revenueRouter = IRevenueRouter(newRouter);
        emit RevenueRouterUpdated(oldRouter, newRouter);
    }
    
    /**
     * @dev Pause minting (transfers still work)
     */
    function pauseMint() external onlyOwner {
        _pause();
        emit MintPaused(msg.sender);
    }
    
    /**
     * @dev Unpause minting
     */
    function unpauseMint() external onlyOwner {
        _unpause();
        emit MintUnpaused(msg.sender);
    }
    
    /**
     * @dev Start a new season
     * Resets per-agent mint counts for the new season
     */
    function startNewSeason() external onlyOwner {
        // End current season
        emit SeasonEnded(currentSeason, block.timestamp, totalSeasonMints);
        
        // Start new season
        currentSeason++;
        seasonStartTimestamp = block.timestamp;
        totalSeasonMints = 0;
        
        emit SeasonStarted(currentSeason, seasonStartTimestamp);
    }
    
    /**
     * @dev Withdraw contract BNB balance (emergency)
     */
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    // ===========================================
    // View Functions
    // ===========================================
    
    /**
     * @dev Get total supply minted
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }
    
    /**
     * @dev Get current season info
     */
    function getSeasonInfo() external view returns (uint256 season, uint256 startTime, uint256 duration, uint256 totalMints) {
        return (currentSeason, seasonStartTimestamp, SEASON_DURATION, totalSeasonMints);
    }
    
    /**
     * @dev Get mint stats for an agent in current season
     */
    function getAgentMintStats(address wallet) external view returns (uint256 minted, uint256 remaining, bool freeUsed) {
        if (!agentIdRegistry.hasValidAgentId(wallet)) {
            return (0, 0, true);
        }
        
        bytes32 agentId = agentIdRegistry.getAgentId(wallet);
        if (agentIdRegistry.isAgentIdRevoked(agentId)) {
            return (0, 0, true);
        }
        
        uint256 minted_ = agentSeasonMintCount[agentId][currentSeason];
        uint256 remaining_ = 0;
        if (minted_ < MAX_MINT_PER_AGENT_PER_SEASON) {
            remaining_ = MAX_MINT_PER_AGENT_PER_SEASON - minted_;
        }
        bool freeUsed_ = agentFreeMintUsed[agentId][currentSeason];
        
        return (minted_, remaining_, freeUsed_);
    }
}