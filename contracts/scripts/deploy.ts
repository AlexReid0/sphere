import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // ─── Deploy Mock ERC20 Tokens ───
  const MockERC20 = await ethers.getContractFactory("MockERC20");

  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  console.log("MockUSDC deployed to:", await usdc.getAddress());

  const usdt = await MockERC20.deploy("Tether USD", "USDT", 6);
  await usdt.waitForDeployment();
  console.log("MockUSDT deployed to:", await usdt.getAddress());

  const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18);
  await dai.waitForDeployment();
  console.log("MockDAI deployed to:", await dai.getAddress());

  const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  await weth.waitForDeployment();
  console.log("MockWETH deployed to:", await weth.getAddress());

  // ─── Deploy SphereSwapRouter ───
  const SphereSwapRouter = await ethers.getContractFactory("SphereSwapRouter");
  const swapRouter = await SphereSwapRouter.deploy();
  await swapRouter.waitForDeployment();
  console.log("SphereSwapRouter deployed to:", await swapRouter.getAddress());

  // ─── Seed Swap Pools with Liquidity ───
  const USDC_LIQUIDITY = ethers.parseUnits("1000000", 6);   // 1M USDC
  const WETH_LIQUIDITY = ethers.parseUnits("500", 18);       // 500 WETH
  const USDT_LIQUIDITY = ethers.parseUnits("1000000", 6);    // 1M USDT
  const DAI_LIQUIDITY = ethers.parseUnits("1000000", 18);    // 1M DAI

  // Mint tokens for liquidity
  await (await usdc.mint(deployer.address, USDC_LIQUIDITY * 3n)).wait();
  await (await weth.mint(deployer.address, WETH_LIQUIDITY * 2n)).wait();
  await (await usdt.mint(deployer.address, USDT_LIQUIDITY * 2n)).wait();
  await (await dai.mint(deployer.address, DAI_LIQUIDITY * 2n)).wait();

  const swapRouterAddr = await swapRouter.getAddress();

  // Approve router
  await (await usdc.approve(swapRouterAddr, ethers.MaxUint256)).wait();
  await (await weth.approve(swapRouterAddr, ethers.MaxUint256)).wait();
  await (await usdt.approve(swapRouterAddr, ethers.MaxUint256)).wait();
  await (await dai.approve(swapRouterAddr, ethers.MaxUint256)).wait();

  // USDC/WETH pool (price: ~2000 USDC per WETH)
  await (await swapRouter.addLiquidity(
    await usdc.getAddress(), await weth.getAddress(),
    USDC_LIQUIDITY, WETH_LIQUIDITY
  )).wait();
  console.log("USDC/WETH pool seeded");

  // USDC/USDT pool (1:1)
  await (await swapRouter.addLiquidity(
    await usdc.getAddress(), await usdt.getAddress(),
    USDC_LIQUIDITY, USDT_LIQUIDITY
  )).wait();
  console.log("USDC/USDT pool seeded");

  // USDC/DAI pool (1:1 accounting for decimals)
  await (await swapRouter.addLiquidity(
    await usdc.getAddress(), await dai.getAddress(),
    USDC_LIQUIDITY, DAI_LIQUIDITY
  )).wait();
  console.log("USDC/DAI pool seeded");

  // ─── Deploy SphereDistributor ───
  const SphereDistributor = await ethers.getContractFactory("SphereDistributor");
  const distributor = await SphereDistributor.deploy();
  await distributor.waitForDeployment();
  console.log("SphereDistributor deployed to:", await distributor.getAddress());

  // ─── Deploy SphereYieldVault (USDC vault) ───
  const SphereYieldVault = await ethers.getContractFactory("SphereYieldVault");
  const yieldVault = await SphereYieldVault.deploy(await usdc.getAddress());
  await yieldVault.waitForDeployment();
  console.log("SphereYieldVault deployed to:", await yieldVault.getAddress());

  // Seed vault with some USDC for yield payouts
  const VAULT_SEED = ethers.parseUnits("100000", 6);
  await (await usdc.mint(await yieldVault.getAddress(), VAULT_SEED)).wait();
  console.log("YieldVault seeded with 100K USDC for yield payouts");

  // ─── Deploy SphereAgentWallet ───
  const SphereAgentWallet = await ethers.getContractFactory("SphereAgentWallet");
  const agentWallet = await SphereAgentWallet.deploy(deployer.address);
  await agentWallet.waitForDeployment();
  console.log("SphereAgentWallet deployed to:", await agentWallet.getAddress());

  // ─── Write Deployment Addresses ───
  const deployments = {
    network: "arcTestnet",
    chainId: 5042002,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MockUSDC: await usdc.getAddress(),
      MockUSDT: await usdt.getAddress(),
      MockDAI: await dai.getAddress(),
      MockWETH: await weth.getAddress(),
      SphereSwapRouter: await swapRouter.getAddress(),
      SphereDistributor: await distributor.getAddress(),
      SphereYieldVault: await yieldVault.getAddress(),
      SphereAgentWallet: await agentWallet.getAddress(),
    },
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outPath = path.join(deploymentsDir, "arc-testnet.json");
  fs.writeFileSync(outPath, JSON.stringify(deployments, null, 2));
  console.log("\nDeployment addresses written to:", outPath);
  console.log(JSON.stringify(deployments.contracts, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
