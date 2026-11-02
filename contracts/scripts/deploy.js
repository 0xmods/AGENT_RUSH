// scripts/deploy.js
// AGENT RUSH Deployment Script
// Run with: npx hardhat run scripts/deploy.js --network bscTestnet

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 AGENT RUSH Deployment Starting...\n");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "BNB\n");
  
  const network = hre.network.name;
  console.log("Network:", network);
  
  // ===========================================
  // Configuration
  // ===========================================
  const CONFIG = {
    // NFT Contract
    nftName: "Agent Rush",
    nftSymbol: "AGENT",
    paidMintPrice: hre.ethers.parseEther("0.001"), // 0.001 BNB
    
    // Revenue Router recipients (CHANGE THESE FOR MAINNET!)
    // For testnet, we'll use the deployer address for all
    treasury: deployer.address,
    rewardFund: deployer.address,
    liquidityReserve: deployer.address,
    development: deployer.address,
    community: deployer.address,
    securityOperations: deployer.address,
    
    // Agent ID Registry (MOCK for testnet, OFFICIAL for mainnet)
    // TODO: Replace with official Binance Agent ID Registry address on mainnet
    agentIdRegistry: "", // Will be set after mock deployment
  };
  
  // ===========================================
  // 1. Deploy Mock Agent ID Registry (Testnet only)
  // ===========================================
  console.log("📋 1. Deploying MockAgentIdRegistry...");
  const MockAgentIdRegistry = await hre.ethers.getContractFactory("MockAgentIdRegistry");
  const mockRegistry = await MockAgentIdRegistry.deploy();
  await mockRegistry.waitForDeployment();
  const mockRegistryAddress = await mockRegistry.getAddress();
  console.log("✅ MockAgentIdRegistry deployed to:", mockRegistryAddress);
  
  // Register deployer's test Agent ID
  const testAgentId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("TEST_AGENT_ID_001"));
  await mockRegistry.registerAgentId(deployer.address, testAgentId, "testagent.ai");
  console.log("✅ Registered test Agent ID for deployer:", testAgentId);
  
  CONFIG.agentIdRegistry = mockRegistryAddress;
  
  // ===========================================
  // 2. Deploy Revenue Router
  // ===========================================
  console.log("\n📋 2. Deploying RevenueRouter...");
  const RevenueRouter = await hre.ethers.getContractFactory("RevenueRouter");
  const revenueRouter = await RevenueRouter.deploy(
    CONFIG.treasury,
    CONFIG.rewardFund,
    CONFIG.liquidityReserve,
    CONFIG.development,
    CONFIG.community,
    CONFIG.securityOperations
  );
  await revenueRouter.waitForDeployment();
  const revenueRouterAddress = await revenueRouter.getAddress();
  console.log("✅ RevenueRouter deployed to:", revenueRouterAddress);
  
  // ===========================================
  // 3. Deploy AgentRush NFT
  // ===========================================
  console.log("\n📋 3. Deploying AgentRush NFT...");
  const AgentRush = await hre.ethers.getContractFactory("AgentRush");
  const agentRush = await AgentRush.deploy(
    CONFIG.nftName,
    CONFIG.nftSymbol,
    CONFIG.paidMintPrice,
    CONFIG.agentIdRegistry,
    revenueRouterAddress
  );
  await agentRush.waitForDeployment();
  const agentRushAddress = await agentRush.getAddress();
  console.log("✅ AgentRush deployed to:", agentRushAddress);
  
  // ===========================================
  // 4. Verify Contracts (if not localhost/hardhat)
  // ===========================================
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\n📋 4. Waiting for block confirmations before verification...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    
    console.log("Verifying MockAgentIdRegistry...");
    try {
      await hre.run("verify:verify", {
        address: mockRegistryAddress,
        constructorArguments: [],
      });
      console.log("✅ MockAgentIdRegistry verified");
    } catch (e) {
      console.log("⚠️ Verification failed:", e.message);
    }
    
    console.log("Verifying RevenueRouter...");
    try {
      await hre.run("verify:verify", {
        address: revenueRouterAddress,
        constructorArguments: [
          CONFIG.treasury,
          CONFIG.rewardFund,
          CONFIG.liquidityReserve,
          CONFIG.development,
          CONFIG.community,
          CONFIG.securityOperations,
        ],
      });
      console.log("✅ RevenueRouter verified");
    } catch (e) {
      console.log("⚠️ Verification failed:", e.message);
    }
    
    console.log("Verifying AgentRush...");
    try {
      await hre.run("verify:verify", {
        address: agentRushAddress,
        constructorArguments: [
          CONFIG.nftName,
          CONFIG.nftSymbol,
          CONFIG.paidMintPrice,
          CONFIG.agentIdRegistry,
          revenueRouterAddress,
        ],
      });
      console.log("✅ AgentRush verified");
    } catch (e) {
      console.log("⚠️ Verification failed:", e.message);
    }
  }
  
  // ===========================================
  // 5. Save Deployment Info
  // ===========================================
  const deploymentInfo = {
    network: network,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MockAgentIdRegistry: mockRegistryAddress,
      RevenueRouter: revenueRouterAddress,
      AgentRush: agentRushAddress,
    },
    config: {
      nftName: CONFIG.nftName,
      nftSymbol: CONFIG.nftSymbol,
      paidMintPrice: CONFIG.paidMintPrice.toString(),
      maxGenesisSupply: 10000,
      maxMintPerAgentPerSeason: 10,
      freeMintEnabled: true,
    },
    revenueAllocation: {
      treasury: "35%",
      rewardFund: "25%",
      liquidityReserve: "15%",
      development: "15%",
      community: "5%",
      securityOperations: "5%",
    },
    recipients: {
      treasury: CONFIG.treasury,
      rewardFund: CONFIG.rewardFund,
      liquidityReserve: CONFIG.liquidityReserve,
      development: CONFIG.development,
      community: CONFIG.community,
      securityOperations: CONFIG.securityOperations,
    },
  };
  
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentsDir, `${network}-${Date.now()}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 Deployment info saved to:", deploymentFile);
  
  // ===========================================
  // 6. Summary
  // ===========================================
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log(`Network: ${network}`);
  console.log(`MockAgentIdRegistry: ${mockRegistryAddress}`);
  console.log(`RevenueRouter: ${revenueRouterAddress}`);
  console.log(`AgentRush NFT: ${agentRushAddress}`);
  console.log("\n📝 Next Steps:");
  console.log("1. Copy contract addresses to frontend/.env.local");
  console.log("2. Run tests: npx hardhat test");
  console.log("3. Test minting on testnet");
  console.log("4. When ready for mainnet, replace MockAgentIdRegistry with official registry");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });