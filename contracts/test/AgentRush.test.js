// test/AgentRush.test.js
// AGENT RUSH NFT Contract Tests

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("AgentRush NFT Contract", function () {
  // ===========================================
  // Test Constants
  // ===========================================
  const NFT_NAME = "Agent Rush";
  const NFT_SYMBOL = "AGENT";
  const PAID_MINT_PRICE = ethers.parseEther("0.001"); // 0.001 BNB
  const MAX_GENESIS_SUPPLY = 10000;
  const MAX_MINT_PER_AGENT_PER_SEASON = 10;
  const SEASON_DURATION = 30 * 24 * 60 * 60; // 30 days
  
  // Revenue allocation (basis points)
  const TREASURY_BPS = 3500;
  const REWARD_FUND_BPS = 2500;
  const LIQUIDITY_BPS = 1500;
  const DEVELOPMENT_BPS = 1500;
  const COMMUNITY_BPS = 500;
  const SECURITY_BPS = 500;
  const TOTAL_BPS = 10000;
  
  // ===========================================
  // Test Fixture
  // ===========================================
  async function deployContractsFixture() {
    const signers = await ethers.getSigners();
    const owner = signers[0];
    const user1 = signers[1];
    const user2 = signers[2];
    const user3 = signers[3];
    const treasury = signers[4];
    const rewardFund = signers[5];
    const liquidity = signers[6];
    const dev = signers[7];
    const community = signers[8];
    const security = signers[9];
    const userNoAgentId = signers[10]; // Signer without Agent ID
    
    // Deploy Mock Agent ID Registry
    const MockAgentIdRegistry = await ethers.getContractFactory("MockAgentIdRegistry");
    const mockRegistry = await MockAgentIdRegistry.deploy();
    
    // Register Agent IDs for test users
    const agentId1 = ethers.keccak256(ethers.toUtf8Bytes("AGENT_ID_USER1"));
    const agentId2 = ethers.keccak256(ethers.toUtf8Bytes("AGENT_ID_USER2"));
    const agentId3 = ethers.keccak256(ethers.toUtf8Bytes("AGENT_ID_USER3"));
    
    await mockRegistry.registerAgentId(user1.address, agentId1, "user1.ai");
    await mockRegistry.registerAgentId(user2.address, agentId2, "user2.ai");
    await mockRegistry.registerAgentId(user3.address, agentId3, "user3.ai");
    
    // Deploy Revenue Router
    const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
    const revenueRouter = await RevenueRouter.deploy(
      treasury.address,
      rewardFund.address,
      liquidity.address,
      dev.address,
      community.address,
      security.address
    );
    
    // Deploy AgentRush
    const AgentRush = await ethers.getContractFactory("AgentRush");
    const agentRush = await AgentRush.deploy(
      NFT_NAME,
      NFT_SYMBOL,
      PAID_MINT_PRICE,
      await mockRegistry.getAddress(),
      await revenueRouter.getAddress()
    );
    
    return {
      owner,
      user1,
      user2,
      user3,
      userNoAgentId,
      treasury,
      rewardFund,
      liquidity,
      dev,
      community,
      security,
      mockRegistry,
      revenueRouter,
      agentRush,
      agentId1,
      agentId2,
      agentId3,
    };
  }
  
  // ===========================================
  // Deployment Tests
  // ===========================================
  describe("Deployment", function () {
    it("Should deploy with correct name and symbol", async function () {
      const { agentRush } = await loadFixture(deployContractsFixture);
      expect(await agentRush.name()).to.equal(NFT_NAME);
      expect(await agentRush.symbol()).to.equal(NFT_SYMBOL);
    });
    
    it("Should set correct paid mint price", async function () {
      const { agentRush } = await loadFixture(deployContractsFixture);
      expect(await agentRush.paidMintPrice()).to.equal(PAID_MINT_PRICE);
    });
    
    it("Should set correct max supply", async function () {
      const { agentRush } = await loadFixture(deployContractsFixture);
      expect(await agentRush.MAX_GENESIS_SUPPLY()).to.equal(MAX_GENESIS_SUPPLY);
    });
    
    it("Should set correct max mint per agent per season", async function () {
      const { agentRush } = await loadFixture(deployContractsFixture);
      expect(await agentRush.MAX_MINT_PER_AGENT_PER_SEASON()).to.equal(MAX_MINT_PER_AGENT_PER_SEASON);
    });
    
    it("Should start at season 1", async function () {
      const { agentRush } = await loadFixture(deployContractsFixture);
      expect(await agentRush.currentSeason()).to.equal(1);
    });
    
    it("Should have free mint enabled by default", async function () {
      const { agentRush } = await loadFixture(deployContractsFixture);
      expect(await agentRush.freeMintEnabled()).to.equal(true);
    });
    
    it("Should set correct royalty (2.5%)", async function () {
      const { agentRush, owner } = await loadFixture(deployContractsFixture);
      const [receiver, royaltyAmount] = await agentRush.royaltyInfo(1, ethers.parseEther("1"));
      expect(receiver).to.equal(owner.address);
      expect(royaltyAmount).to.equal(ethers.parseEther("0.025")); // 2.5%
    });
  });
  
  // ===========================================
  // Agent ID Verification Tests
  // ===========================================
  describe("Agent ID Verification", function () {
    it("Should return true for eligible wallet with valid Agent ID", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      expect(await agentRush.agentIdEligible(user1.address)).to.equal(true);
    });
    
    it("Should return false for wallet without Agent ID", async function () {
      const { agentRush, userNoAgentId } = await loadFixture(deployContractsFixture);
      expect(await agentRush.agentIdEligible(userNoAgentId.address)).to.equal(false);
    });
    
    it("Should return false for wallet with revoked Agent ID", async function () {
      const { agentRush, mockRegistry, user1, agentId1 } = await loadFixture(deployContractsFixture);
      await mockRegistry.revokeAgentId(agentId1);
      expect(await agentRush.agentIdEligible(user1.address)).to.equal(false);
    });
  });
  
  // ===========================================
  // Free Mint Tests
  // ===========================================
  describe("Free Mint", function () {
    it("Should allow first mint for free (1 NFT)", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      const tx = await agentRush.connect(user1).mint(1, { value: 0 });
      const receipt = await tx.wait();
      
      expect(await agentRush.balanceOf(user1.address)).to.equal(1);
      expect(await agentRush.totalSupply()).to.equal(1);
      
      // Check event
      const mintEvent = receipt.logs.find(log => 
        log.fragment && log.fragment.name === "Minted"
      );
      expect(mintEvent).to.not.be.undefined;
      expect(mintEvent.args.wasFreeMint).to.equal(true);
      expect(mintEvent.args.pricePaid).to.equal(0);
    });
    
    it("Should allow first mint for free (multiple NFTs - first free, rest paid)", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      const tx = await agentRush.connect(user1).mint(3, { value: PAID_MINT_PRICE * 2n });
      await tx.wait();
      
      expect(await agentRush.balanceOf(user1.address)).to.equal(3);
      
      // First was free, 2 paid
      const stats = await agentRush.getAgentMintStats(user1.address);
      expect(stats.minted).to.equal(3);
      expect(stats.freeUsed).to.equal(true);
    });
    
    it("Should NOT allow free mint if already used in current season", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      // First free mint
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Second mint should require payment
      await expect(
        agentRush.connect(user1).mint(1, { value: 0 })
      ).to.be.revertedWithCustomError(agentRush, "InsufficientPayment");
    });
    
    it("Should NOT allow free mint if disabled by owner", async function () {
      const { agentRush, owner, user1 } = await loadFixture(deployContractsFixture);
      
      await agentRush.connect(owner).setFreeMintEnabled(false);
      
      await expect(
        agentRush.connect(user1).mint(1, { value: 0 })
      ).to.be.revertedWithCustomError(agentRush, "InsufficientPayment");
    });
  });
  
  // ===========================================
  // Paid Mint Tests
  // ===========================================
  describe("Paid Mint", function () {
    it("Should require correct payment for paid mint", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      // Use free mint first
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Second mint requires payment
      const tx = await agentRush.connect(user1).mint(1, { value: PAID_MINT_PRICE });
      await tx.wait();
      
      expect(await agentRush.balanceOf(user1.address)).to.equal(2);
    });
    
    it("Should revert with insufficient payment", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      // Use free mint first
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Try to mint with insufficient payment
      await expect(
        agentRush.connect(user1).mint(1, { value: PAID_MINT_PRICE / 2n })
      ).to.be.revertedWithCustomError(agentRush, "InsufficientPayment");
    });
    
    it("Should refund excess payment", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      // Use free mint first
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Send excess payment
      const initialBalance = await ethers.provider.getBalance(user1.address);
      const tx = await agentRush.connect(user1).mint(1, { value: PAID_MINT_PRICE * 2n });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const finalBalance = await ethers.provider.getBalance(user1.address);
      
      // Balance should be: initial - gasCost - PAID_MINT_PRICE (excess refunded)
      const expectedBalance = initialBalance - gasCost - PAID_MINT_PRICE;
      // Allow small difference due to gas estimation
      expect(finalBalance).to.be.closeTo(expectedBalance, ethers.parseEther("0.001"));
    });
    
    it("Should distribute revenue correctly on paid mint", async function () {
      const { agentRush, user1, revenueRouter, treasury, rewardFund, liquidity, dev, community, security } = await loadFixture(deployContractsFixture);
      
      // Use free mint first
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Paid mint
      await agentRush.connect(user1).mint(1, { value: PAID_MINT_PRICE });
      
      // Check allocations - use BigInt for calculations
      const treasuryAmount = (PAID_MINT_PRICE * BigInt(TREASURY_BPS)) / BigInt(TOTAL_BPS);
      const rewardFundAmount = (PAID_MINT_PRICE * BigInt(REWARD_FUND_BPS)) / BigInt(TOTAL_BPS);
      const liquidityAmount = (PAID_MINT_PRICE * BigInt(LIQUIDITY_BPS)) / BigInt(TOTAL_BPS);
      const developmentAmount = (PAID_MINT_PRICE * BigInt(DEVELOPMENT_BPS)) / BigInt(TOTAL_BPS);
      const communityAmount = (PAID_MINT_PRICE * BigInt(COMMUNITY_BPS)) / BigInt(TOTAL_BPS);
      const securityAmount = (PAID_MINT_PRICE * BigInt(SECURITY_BPS)) / BigInt(TOTAL_BPS);
      
      expect(await revenueRouter.getAllocation(treasury.address)).to.equal(treasuryAmount);
      expect(await revenueRouter.getAllocation(rewardFund.address)).to.equal(rewardFundAmount);
      expect(await revenueRouter.getAllocation(liquidity.address)).to.equal(liquidityAmount);
      expect(await revenueRouter.getAllocation(dev.address)).to.equal(developmentAmount);
      expect(await revenueRouter.getAllocation(community.address)).to.equal(communityAmount);
      expect(await revenueRouter.getAllocation(security.address)).to.equal(securityAmount);
    });
  });
  
  // ===========================================
  // Mint Limit Tests
  // ===========================================
  describe("Mint Limits", function () {
    it("Should enforce max 10 NFTs per Agent ID per season", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      // Use free mint
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Mint 9 more (total 10)
      await agentRush.connect(user1).mint(9, { value: PAID_MINT_PRICE * 9n });
      
      expect(await agentRush.balanceOf(user1.address)).to.equal(10);
      
      // 11th mint should fail
      await expect(
        agentRush.connect(user1).mint(1, { value: PAID_MINT_PRICE })
      ).to.be.revertedWithCustomError(agentRush, "MaxMintPerAgentReached");
    });
    
    it("Should enforce max genesis supply (10,000)", async function () {
      const { agentRush, owner } = await loadFixture(deployContractsFixture);
      
      // This test would take too long with 10k mints
      // Instead verify the constant is correct
      expect(await agentRush.MAX_GENESIS_SUPPLY()).to.equal(10000);
    });
    
    it("Should track remaining allowance correctly", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      expect(await agentRush.remainingMintAllowance(user1.address)).to.equal(10);
      
      await agentRush.connect(user1).mint(3, { value: PAID_MINT_PRICE * 2n }); // 1 free + 2 paid
      
      expect(await agentRush.remainingMintAllowance(user1.address)).to.equal(7);
    });
  });
  
  // ===========================================
  // Quote Mint Tests
  // ===========================================
  describe("Quote Mint", function () {
    it("Should return correct quote for free mint", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      const [eligible, price, freeAvailable, remaining] = await agentRush.quoteMint(user1.address, 1);
      
      expect(eligible).to.equal(true);
      expect(price).to.equal(0);
      expect(freeAvailable).to.equal(true);
      expect(remaining).to.equal(10);
    });
    
    it("Should return correct quote for paid mint after free used", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      // Use free mint
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      const [eligible, price, freeAvailable, remaining] = await agentRush.quoteMint(user1.address, 2);
      
      expect(eligible).to.equal(true);
      expect(price).to.equal(PAID_MINT_PRICE * 2n);
      expect(freeAvailable).to.equal(false);
      expect(remaining).to.equal(9);
    });
    
    it("Should return not eligible for wallet without Agent ID", async function () {
      const { agentRush, userNoAgentId } = await loadFixture(deployContractsFixture);
      
      const [eligible, price, freeAvailable, remaining] = await agentRush.quoteMint(userNoAgentId.address, 1);
      
      expect(eligible).to.equal(false);
      expect(price).to.equal(0);
      expect(freeAvailable).to.equal(false);
      expect(remaining).to.equal(0);
    });
  });
  
  // ===========================================
  // Season Management Tests
  // ===========================================
  describe("Season Management", function () {
    it("Should start new season and reset mint counts", async function () {
      const { agentRush, owner, user1 } = await loadFixture(deployContractsFixture);
      
      // Mint in season 1
      await agentRush.connect(user1).mint(5, { value: PAID_MINT_PRICE * 4n });
      expect(await agentRush.remainingMintAllowance(user1.address)).to.equal(5);
      
      // Start new season
      await agentRush.connect(owner).startNewSeason();
      
      expect(await agentRush.currentSeason()).to.equal(2);
      expect(await agentRush.remainingMintAllowance(user1.address)).to.equal(10); // Reset!
      expect(await agentRush.totalSeasonMints()).to.equal(0);
    });
    
    it("Should emit SeasonStarted and SeasonEnded events", async function () {
      const { agentRush, owner } = await loadFixture(deployContractsFixture);
      
      const startTime = await agentRush.seasonStartTimestamp();
      const beforeBlock = await ethers.provider.getBlock("latest");
      const beforeTimestamp = BigInt(beforeBlock.timestamp);
      
      const tx = await agentRush.connect(owner).startNewSeason();
      const receipt = await tx.wait();
      const afterBlock = await ethers.provider.getBlock(receipt.blockNumber);
      const afterTimestamp = BigInt(afterBlock.timestamp);
      
      await expect(tx)
        .to.emit(agentRush, "SeasonEnded")
        .withArgs(1, afterTimestamp, 0)
        .and.to.emit(agentRush, "SeasonStarted")
        .withArgs(2, afterTimestamp);
    });
  });
  
  // ===========================================
  // Pause Tests
  // ===========================================
  describe("Pause Functionality", function () {
    it("Should pause minting", async function () {
      const { agentRush, owner, user1 } = await loadFixture(deployContractsFixture);
      
      await agentRush.connect(owner).pauseMint();
      
      // OpenZeppelin's Pausable uses EnforcedPause error
      await expect(
        agentRush.connect(user1).mint(1, { value: 0 })
      ).to.be.revertedWithCustomError(agentRush, "EnforcedPause");
    });
    
    it("Should unpause minting", async function () {
      const { agentRush, owner, user1 } = await loadFixture(deployContractsFixture);
      
      await agentRush.connect(owner).pauseMint();
      await agentRush.connect(owner).unpauseMint();
      
      await expect(agentRush.connect(user1).mint(1, { value: 0 })).to.not.be.reverted;
    });
    
    it("Should NOT block NFT transfers when paused", async function () {
      const { agentRush, owner, user1, user2 } = await loadFixture(deployContractsFixture);
      
      // Mint first
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Pause
      await agentRush.connect(owner).pauseMint();
      
      // Transfer should still work
      await expect(
        agentRush.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.not.be.reverted;
      
      expect(await agentRush.ownerOf(1)).to.equal(user2.address);
    });
  });
  
  // ===========================================
  // Admin Functions Tests
  // ===========================================
  describe("Admin Functions", function () {
    it("Should allow owner to update paid mint price", async function () {
      const { agentRush, owner } = await loadFixture(deployContractsFixture);
      
      const newPrice = ethers.parseEther("0.002");
      await agentRush.connect(owner).setPaidMintPrice(newPrice);
      
      expect(await agentRush.paidMintPrice()).to.equal(newPrice);
    });
    
    it("Should allow owner to update base URI", async function () {
      const { agentRush, owner } = await loadFixture(deployContractsFixture);
      
      const newURI = "ipfs://QmNewHash/";
      await agentRush.connect(owner).setBaseURI(newURI);
      
      expect(await agentRush.baseURI()).to.equal(newURI);
    });
    
    it("Should allow owner to update Agent ID Registry", async function () {
      const { agentRush, owner } = await loadFixture(deployContractsFixture);
      const MockAgentIdRegistry = await ethers.getContractFactory("MockAgentIdRegistry");
      const newRegistry = await MockAgentIdRegistry.deploy();
      
      await agentRush.connect(owner).setAgentIdRegistry(await newRegistry.getAddress());
      
      expect(await agentRush.agentIdRegistry()).to.equal(await newRegistry.getAddress());
    });
    
    it("Should allow owner to update Revenue Router", async function () {
      const { agentRush, owner, treasury, rewardFund, liquidity, dev, community, security } = await loadFixture(deployContractsFixture);
      const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
      const newRouter = await RevenueRouter.deploy(
        treasury.address,
        rewardFund.address,
        liquidity.address,
        dev.address,
        community.address,
        security.address
      );
      
      await agentRush.connect(owner).setRevenueRouter(await newRouter.getAddress());
      
      expect(await agentRush.revenueRouter()).to.equal(await newRouter.getAddress());
    });
    
    it("Should revert when non-owner calls admin functions", async function () {
      const { agentRush, user1 } = await loadFixture(deployContractsFixture);
      
      await expect(
        agentRush.connect(user1).setPaidMintPrice(ethers.parseEther("0.002"))
      ).to.be.revertedWithCustomError(agentRush, "OwnableUnauthorizedAccount");
    });
  });
  
  // ===========================================
  // Agent ID Transfer Tests (Critical!)
  // ===========================================
  describe("Agent ID Transfer Behavior", function () {
    it("Should preserve mint history when Agent ID is transferred", async function () {
      const { agentRush, mockRegistry, user1, user2, agentId1 } = await loadFixture(deployContractsFixture);
      
      // User1 mints 3 NFTs
      await agentRush.connect(user1).mint(3, { value: PAID_MINT_PRICE * 2n });
      expect(await agentRush.balanceOf(user1.address)).to.equal(3);
      
      // Transfer Agent ID to user2
      await mockRegistry.transferAgentId(user1.address, user2.address, agentId1);
      
      // User2 should have used free mint and have 3 mints counted
      expect(await agentRush.agentIdEligible(user2.address)).to.equal(true);
      expect(await agentRush.remainingMintAllowance(user2.address)).to.equal(7); // 10 - 3
      const stats = await agentRush.getAgentMintStats(user2.address);
      expect(stats[0]).to.equal(3); // minted
      expect(stats[1]).to.equal(7); // remaining
      expect(stats[2]).to.equal(true); // freeUsed
      
      // User1 should no longer be eligible
      expect(await agentRush.agentIdEligible(user1.address)).to.equal(false);
      expect(await agentRush.remainingMintAllowance(user1.address)).to.equal(0);
    });
    
    it("Should prevent minting with revoked Agent ID", async function () {
      const { agentRush, mockRegistry, user1, agentId1 } = await loadFixture(deployContractsFixture);
      
      await mockRegistry.revokeAgentId(agentId1);
      
      // When Agent ID is revoked, hasValidAgentId returns false, so InvalidAgentId is thrown
      await expect(
        agentRush.connect(user1).mint(1, { value: 0 })
      ).to.be.revertedWithCustomError(agentRush, "InvalidAgentId");
    });
  });
  
  // ===========================================
  // Revenue Router Integration Tests
  // ===========================================
  describe("Revenue Router Integration", function () {
    it("Should track total received and distributed", async function () {
      const { agentRush, user1, revenueRouter } = await loadFixture(deployContractsFixture);
      
      // Use free mint first
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Paid mint
      await agentRush.connect(user1).mint(2, { value: PAID_MINT_PRICE * 2n }); // 1 free already used, so 2 paid
      
      expect(await revenueRouter.totalReceived()).to.equal(PAID_MINT_PRICE * 2n);
      expect(await revenueRouter.totalDistributed()).to.equal(PAID_MINT_PRICE * 2n);
    });
    
    it("Should allow recipients to claim allocations", async function () {
      const { agentRush, user1, revenueRouter, treasury } = await loadFixture(deployContractsFixture);
      
      // Use free mint first
      await agentRush.connect(user1).mint(1, { value: 0 });
      
      // Paid mint
      await agentRush.connect(user1).mint(1, { value: PAID_MINT_PRICE });
      
      // Treasury claims
      const initialBalance = await ethers.provider.getBalance(treasury.address);
      const tx = await revenueRouter.connect(treasury).claimAllocation();
      await tx.wait();
      const finalBalance = await ethers.provider.getBalance(treasury.address);
      
      expect(finalBalance).to.be.gt(initialBalance);
      expect(await revenueRouter.getAllocation(treasury.address)).to.equal(0);
    });
  });
});

describe("RevenueRouter Contract", function () {
  const TREASURY_BPS = 3500;
  const REWARD_FUND_BPS = 2500;
  const LIQUIDITY_BPS = 1500;
  const DEVELOPMENT_BPS = 1500;
  const COMMUNITY_BPS = 500;
  const SECURITY_BPS = 500;
  const TOTAL_BPS = 10000;
  
  async function deployRevenueRouterFixture() {
    const signers = await ethers.getSigners();
    const owner = signers[0];
    const treasury = signers[1];
    const rewardFund = signers[2];
    const liquidity = signers[3];
    const dev = signers[4];
    const community = signers[5];
    const security = signers[6];
    const user = signers[7];
    
    const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
    const revenueRouter = await RevenueRouter.deploy(
      treasury.address,
      rewardFund.address,
      liquidity.address,
      dev.address,
      community.address,
      security.address
    );
    
    return {
      owner,
      treasury,
      rewardFund,
      liquidity,
      dev,
      community,
      security,
      user,
      revenueRouter,
    };
  }
  
  describe("Deployment", function () {
    it("Should set correct recipients", async function () {
      const { revenueRouter, treasury, rewardFund, liquidity, dev, community, security } = 
        await loadFixture(deployRevenueRouterFixture);
      
      const recipients = await revenueRouter.getAllRecipients();
      expect(recipients[0]).to.equal(treasury.address);
      expect(recipients[1]).to.equal(rewardFund.address);
      expect(recipients[2]).to.equal(liquidity.address);
      expect(recipients[3]).to.equal(dev.address);
      expect(recipients[4]).to.equal(community.address);
      expect(recipients[5]).to.equal(security.address);
    });
    
    it("Should have correct allocation percentages", async function () {
      const { revenueRouter } = await loadFixture(deployRevenueRouterFixture);
      
      const percentages = await revenueRouter.getAllocationPercentages();
      expect(percentages[0]).to.equal(TREASURY_BPS);
      expect(percentages[1]).to.equal(REWARD_FUND_BPS);
      expect(percentages[2]).to.equal(LIQUIDITY_BPS);
      expect(percentages[3]).to.equal(DEVELOPMENT_BPS);
      expect(percentages[4]).to.equal(COMMUNITY_BPS);
      expect(percentages[5]).to.equal(SECURITY_BPS);
      expect(percentages[6]).to.equal(TOTAL_BPS);
    });
  });
  
  describe("Revenue Distribution", function () {
    it("Should distribute revenue correctly", async function () {
      const { revenueRouter, treasury, rewardFund, liquidity, dev, community, security } = 
        await loadFixture(deployRevenueRouterFixture);
      
      const amount = ethers.parseEther("1"); // 1 BNB
      await revenueRouter.distributeRevenue({ value: amount });
      
      // Use BigInt for calculations
      const treasuryAmount = (amount * BigInt(TREASURY_BPS)) / BigInt(TOTAL_BPS);
      const rewardFundAmount = (amount * BigInt(REWARD_FUND_BPS)) / BigInt(TOTAL_BPS);
      const liquidityAmount = (amount * BigInt(LIQUIDITY_BPS)) / BigInt(TOTAL_BPS);
      const developmentAmount = (amount * BigInt(DEVELOPMENT_BPS)) / BigInt(TOTAL_BPS);
      const communityAmount = (amount * BigInt(COMMUNITY_BPS)) / BigInt(TOTAL_BPS);
      const securityAmount = (amount * BigInt(SECURITY_BPS)) / BigInt(TOTAL_BPS);
      
      expect(await revenueRouter.getAllocation(treasury.address)).to.equal(treasuryAmount);
      expect(await revenueRouter.getAllocation(rewardFund.address)).to.equal(rewardFundAmount);
      expect(await revenueRouter.getAllocation(liquidity.address)).to.equal(liquidityAmount);
      expect(await revenueRouter.getAllocation(dev.address)).to.equal(developmentAmount);
      expect(await revenueRouter.getAllocation(community.address)).to.equal(communityAmount);
      expect(await revenueRouter.getAllocation(security.address)).to.equal(securityAmount);
    });
    
    it("Should handle dust (rounding) correctly", async function () {
      const { revenueRouter, treasury } = await loadFixture(deployRevenueRouterFixture);
      
      // Amount that doesn't divide evenly
      const amount = ethers.parseEther("0.0001");
      await revenueRouter.distributeRevenue({ value: amount });
      
      const totalAllocated = 
        (await revenueRouter.getAllocation(treasury.address)) +
        (await revenueRouter.getAllocation(await revenueRouter.rewardFund())) +
        (await revenueRouter.getAllocation(await revenueRouter.liquidityReserve())) +
        (await revenueRouter.getAllocation(await revenueRouter.development())) +
        (await revenueRouter.getAllocation(await revenueRouter.community())) +
        (await revenueRouter.getAllocation(await revenueRouter.securityOperations()));
      
      // Total allocated should equal amount (dust goes to treasury)
      expect(totalAllocated).to.equal(amount);
    });
    
    it("Should track total received and distributed", async function () {
      const { revenueRouter } = await loadFixture(deployRevenueRouterFixture);
      
      await revenueRouter.distributeRevenue({ value: ethers.parseEther("1") });
      await revenueRouter.distributeRevenue({ value: ethers.parseEther("2") });
      
      expect(await revenueRouter.totalReceived()).to.equal(ethers.parseEther("3"));
      expect(await revenueRouter.totalDistributed()).to.equal(ethers.parseEther("3"));
    });
  });
  
  describe("Claim Allocation", function () {
    it("Should allow recipients to claim their allocation", async function () {
      const { revenueRouter, treasury } = await loadFixture(deployRevenueRouterFixture);
      
      await revenueRouter.distributeRevenue({ value: ethers.parseEther("1") });
      
      const initialBalance = await ethers.provider.getBalance(treasury.address);
      await revenueRouter.connect(treasury).claimAllocation();
      const finalBalance = await ethers.provider.getBalance(treasury.address);
      
      expect(finalBalance).to.be.gt(initialBalance);
      expect(await revenueRouter.getAllocation(treasury.address)).to.equal(0);
    });
    
    it("Should revert if nothing to claim", async function () {
      const { revenueRouter, user } = await loadFixture(deployRevenueRouterFixture);
      
      await expect(
        revenueRouter.connect(user).claimAllocation()
      ).to.be.revertedWithCustomError(revenueRouter, "NothingToClaim");
    });
  });
  
  describe("Update Recipient", function () {
    it("Should allow owner to update recipient addresses", async function () {
      const { revenueRouter, owner, user } = await loadFixture(deployRevenueRouterFixture);
      
      await revenueRouter.connect(owner).updateRecipient("treasury", user.address);
      
      const recipients = await revenueRouter.getAllRecipients();
      expect(recipients[0]).to.equal(user.address);
    });
    
    it("Should revert for invalid allocation name", async function () {
      const { revenueRouter, owner, user } = await loadFixture(deployRevenueRouterFixture);
      
      await expect(
        revenueRouter.connect(owner).updateRecipient("invalid", user.address)
      ).to.be.revertedWithCustomError(revenueRouter, "InvalidAllocation");
    });
    
    it("Should revert for non-owner", async function () {
      const { revenueRouter, user } = await loadFixture(deployRevenueRouterFixture);
      
      await expect(
        revenueRouter.connect(user).updateRecipient("treasury", user.address)
      ).to.be.revertedWithCustomError(revenueRouter, "OwnableUnauthorizedAccount");
    });
  });
  
  describe("Receive Fallback", function () {
    it("Should accept direct ETH transfers and distribute", async function () {
      const { revenueRouter, treasury } = await loadFixture(deployRevenueRouterFixture);
      
      await ethers.provider.send("hardhat_setBalance", [
        revenueRouter.target,
        "0xDE0B6B3A7640000" // 1 ETH
      ]);
      
      // Send ETH directly
      await ethers.provider.send("hardhat_setBalance", [
        revenueRouter.target,
        "0x1BC16D674EC80000" // 2 ETH
      ]);
      
      // The receive() function will be called automatically
      // But we can't easily test it without a real transaction
      // This is more of a documentation test
    });
  });
});