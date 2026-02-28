import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, SphereSwapRouter, SphereDistributor, SphereYieldVault, SphereAgentWallet } from "../typechain-types";

describe("Sphere Contracts", function () {
  let usdc: MockERC20;
  let weth: MockERC20;
  let swapRouter: SphereSwapRouter;
  let distributor: SphereDistributor;
  let yieldVault: SphereYieldVault;
  let agentWallet: SphereAgentWallet;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);

    const SwapRouter = await ethers.getContractFactory("SphereSwapRouter");
    swapRouter = await SwapRouter.deploy();

    const Distributor = await ethers.getContractFactory("SphereDistributor");
    distributor = await Distributor.deploy();

    const YieldVault = await ethers.getContractFactory("SphereYieldVault");
    yieldVault = await YieldVault.deploy(await usdc.getAddress());

    const AgentWallet = await ethers.getContractFactory("SphereAgentWallet");
    agentWallet = await AgentWallet.deploy(owner.address);
  });

  describe("MockERC20", function () {
    it("should mint tokens", async function () {
      await usdc.mint(user1.address, ethers.parseUnits("1000", 6));
      expect(await usdc.balanceOf(user1.address)).to.equal(ethers.parseUnits("1000", 6));
    });

    it("should have correct decimals", async function () {
      expect(await usdc.decimals()).to.equal(6);
      expect(await weth.decimals()).to.equal(18);
    });
  });

  describe("SphereSwapRouter", function () {
    beforeEach(async function () {
      // Seed pool: 1M USDC / 500 WETH (2000 USDC per WETH)
      await usdc.mint(owner.address, ethers.parseUnits("1000000", 6));
      await weth.mint(owner.address, ethers.parseUnits("500", 18));
      await usdc.approve(await swapRouter.getAddress(), ethers.MaxUint256);
      await weth.approve(await swapRouter.getAddress(), ethers.MaxUint256);
      await swapRouter.addLiquidity(
        await usdc.getAddress(), await weth.getAddress(),
        ethers.parseUnits("1000000", 6), ethers.parseUnits("500", 18)
      );
    });

    it("should return correct quote", async function () {
      const amountOut = await swapRouter.getAmountOut(
        await usdc.getAddress(), await weth.getAddress(),
        ethers.parseUnits("2000", 6)
      );
      // ~0.997 WETH (with 0.3% fee and price impact)
      expect(amountOut).to.be.gt(0);
    });

    it("should execute swap", async function () {
      await usdc.mint(user1.address, ethers.parseUnits("2000", 6));
      await usdc.connect(user1).approve(await swapRouter.getAddress(), ethers.MaxUint256);

      const amountOut = await swapRouter.getAmountOut(
        await usdc.getAddress(), await weth.getAddress(),
        ethers.parseUnits("2000", 6)
      );

      await swapRouter.connect(user1).swap(
        await usdc.getAddress(), await weth.getAddress(),
        ethers.parseUnits("2000", 6), 0
      );

      expect(await weth.balanceOf(user1.address)).to.equal(amountOut);
    });

    it("should revert on slippage exceeded", async function () {
      await usdc.mint(user1.address, ethers.parseUnits("2000", 6));
      await usdc.connect(user1).approve(await swapRouter.getAddress(), ethers.MaxUint256);

      await expect(
        swapRouter.connect(user1).swap(
          await usdc.getAddress(), await weth.getAddress(),
          ethers.parseUnits("2000", 6),
          ethers.parseUnits("2", 18) // way too high
        )
      ).to.be.revertedWith("Slippage exceeded");
    });
  });

  describe("SphereDistributor", function () {
    it("should distribute to multiple recipients", async function () {
      await usdc.mint(owner.address, ethers.parseUnits("10000", 6));
      await usdc.approve(await distributor.getAddress(), ethers.MaxUint256);

      await distributor.distribute(
        await usdc.getAddress(),
        [user1.address, user2.address, user3.address],
        [
          ethers.parseUnits("5000", 6),
          ethers.parseUnits("3000", 6),
          ethers.parseUnits("2000", 6),
        ]
      );

      expect(await usdc.balanceOf(user1.address)).to.equal(ethers.parseUnits("5000", 6));
      expect(await usdc.balanceOf(user2.address)).to.equal(ethers.parseUnits("3000", 6));
      expect(await usdc.balanceOf(user3.address)).to.equal(ethers.parseUnits("2000", 6));
    });

    it("should revert on length mismatch", async function () {
      await expect(
        distributor.distribute(await usdc.getAddress(), [user1.address], [])
      ).to.be.revertedWith("Length mismatch");
    });
  });

  describe("SphereYieldVault", function () {
    it("should accept deposits", async function () {
      await usdc.mint(user1.address, ethers.parseUnits("10000", 6));
      await usdc.connect(user1).approve(await yieldVault.getAddress(), ethers.MaxUint256);

      await yieldVault.connect(user1).deposit(ethers.parseUnits("10000", 6));

      const deposit = await yieldVault.getDeposit(user1.address);
      expect(deposit.amount).to.equal(ethers.parseUnits("10000", 6));
      expect(deposit.active).to.be.true;
    });

    it("should accrue yield over blocks", async function () {
      await usdc.mint(user1.address, ethers.parseUnits("10000", 6));
      await usdc.connect(user1).approve(await yieldVault.getAddress(), ethers.MaxUint256);
      await yieldVault.connect(user1).deposit(ethers.parseUnits("10000", 6));

      // Mine some blocks
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const yield_ = await yieldVault.accruedYield(user1.address);
      expect(yield_).to.be.gt(0);
    });
  });

  describe("SphereAgentWallet", function () {
    it("should fund and track budget", async function () {
      await usdc.mint(owner.address, ethers.parseUnits("5000", 6));
      await usdc.approve(await agentWallet.getAddress(), ethers.MaxUint256);

      await agentWallet.fund(await usdc.getAddress(), ethers.parseUnits("5000", 6));

      expect(await agentWallet.budgets(await usdc.getAddress())).to.equal(
        ethers.parseUnits("5000", 6)
      );
    });

    it("should allow agent to spend within budget", async function () {
      await usdc.mint(owner.address, ethers.parseUnits("5000", 6));
      await usdc.approve(await agentWallet.getAddress(), ethers.MaxUint256);
      await agentWallet.fund(await usdc.getAddress(), ethers.parseUnits("5000", 6));

      await agentWallet.setAgent(user1.address);
      await agentWallet.startSession();

      await agentWallet.connect(user1).spend(
        await usdc.getAddress(), ethers.parseUnits("1000", 6), user2.address
      );

      expect(await usdc.balanceOf(user2.address)).to.equal(ethers.parseUnits("1000", 6));
      expect(await agentWallet.remainingBudget(await usdc.getAddress())).to.equal(
        ethers.parseUnits("4000", 6)
      );
    });

    it("should revert if non-agent tries to spend", async function () {
      await usdc.mint(owner.address, ethers.parseUnits("5000", 6));
      await usdc.approve(await agentWallet.getAddress(), ethers.MaxUint256);
      await agentWallet.fund(await usdc.getAddress(), ethers.parseUnits("5000", 6));
      await agentWallet.setAgent(user1.address);
      await agentWallet.startSession();

      await expect(
        agentWallet.connect(user2).spend(
          await usdc.getAddress(), ethers.parseUnits("100", 6), user3.address
        )
      ).to.be.revertedWith("Not agent");
    });
  });
});
