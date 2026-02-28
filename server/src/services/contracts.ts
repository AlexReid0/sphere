import { ethers } from 'ethers';
import { getERC20, getSwapRouter, getDistributor, getYieldVault, getAgentWallet } from '../contracts/index.js';
import { getTokenAddress, getTokenDecimals, getContractAddresses, provider } from '../config.js';

// ─── Token Operations ───

export async function mintTestTokens(to: string, symbol: string, amount: string) {
  const tokenAddr = getTokenAddress(symbol);
  const decimals = getTokenDecimals(symbol);
  const erc20 = getERC20(tokenAddr);
  const parsedAmount = ethers.parseUnits(amount, decimals);
  const tx = await erc20.mint(to, parsedAmount);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, amount, symbol };
}

export async function getTokenBalance(address: string, symbol: string): Promise<string> {
  const tokenAddr = getTokenAddress(symbol);
  const decimals = getTokenDecimals(symbol);
  const erc20 = getERC20(tokenAddr);
  const balance = await erc20.balanceOf(address);
  return ethers.formatUnits(balance, decimals);
}

export async function getAllBalances(address: string): Promise<Record<string, string>> {
  const balances: Record<string, string> = {};
  const tokens = ['USDC', 'USDT', 'DAI', 'WETH'];

  await Promise.all(tokens.map(async (symbol) => {
    try {
      balances[symbol] = await getTokenBalance(address, symbol);
    } catch {
      balances[symbol] = '0';
    }
  }));

  return balances;
}

// ─── Swap Operations ───

export async function getSwapQuote(tokenIn: string, tokenOut: string, amountIn: string) {
  const router = getSwapRouter();
  const inAddr = getTokenAddress(tokenIn);
  const outAddr = getTokenAddress(tokenOut);
  const inDecimals = getTokenDecimals(tokenIn);
  const outDecimals = getTokenDecimals(tokenOut);
  const parsedIn = ethers.parseUnits(amountIn, inDecimals);

  const amountOut = await router.getAmountOut(inAddr, outAddr, parsedIn);
  const [reserveIn, reserveOut] = await router.getReserves(inAddr, outAddr);

  return {
    amountIn,
    amountOut: ethers.formatUnits(amountOut, outDecimals),
    tokenIn,
    tokenOut,
    rate: (parseFloat(ethers.formatUnits(amountOut, outDecimals)) / parseFloat(amountIn)).toString(),
    priceImpact: ((parseFloat(amountIn) / parseFloat(ethers.formatUnits(reserveIn, inDecimals))) * 100).toFixed(4),
    fee: '0.3%',
  };
}

export async function executeSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  minAmountOut: string,
  fromAddress?: string,
) {
  const router = getSwapRouter();
  const inAddr = getTokenAddress(tokenIn);
  const outAddr = getTokenAddress(tokenOut);
  const inDecimals = getTokenDecimals(tokenIn);
  const outDecimals = getTokenDecimals(tokenOut);
  const parsedIn = ethers.parseUnits(amountIn, inDecimals);
  const parsedMinOut = ethers.parseUnits(minAmountOut, outDecimals);

  // Approve router to spend tokens
  const erc20In = getERC20(inAddr);
  const routerAddr = getContractAddresses().SphereSwapRouter;
  const approveTx = await erc20In.approve(routerAddr, parsedIn);
  await approveTx.wait();

  // Execute swap
  const tx = await router.swap(inAddr, outAddr, parsedIn, parsedMinOut);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    tokenIn,
    tokenOut,
    amountIn,
    blockNumber: receipt.blockNumber,
  };
}

// ─── Distribution Operations ───

export async function executeDistribution(
  token: string,
  recipients: string[],
  amounts: string[],
) {
  const distributor = getDistributor();
  const tokenAddr = getTokenAddress(token);
  const decimals = getTokenDecimals(token);
  const parsedAmounts = amounts.map(a => ethers.parseUnits(a, decimals));
  const totalAmount = parsedAmounts.reduce((sum, a) => sum + a, 0n);

  // Approve distributor
  const erc20 = getERC20(tokenAddr);
  const distributorAddr = getContractAddresses().SphereDistributor;
  const approveTx = await erc20.approve(distributorAddr, totalAmount);
  await approveTx.wait();

  // Execute distribution
  const tx = await distributor.distribute(tokenAddr, recipients, parsedAmounts);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    token,
    recipients: recipients.length,
    totalAmount: ethers.formatUnits(totalAmount, decimals),
    blockNumber: receipt.blockNumber,
  };
}

// ─── Yield Vault Operations ───

export async function depositToYieldVault(amount: string) {
  const vault = getYieldVault();
  const vaultAddr = getContractAddresses().SphereYieldVault;
  const assetAddr = await vault.asset();
  const erc20 = getERC20(assetAddr);
  const decimals = Number(await erc20.decimals());
  const parsedAmount = ethers.parseUnits(amount, decimals);

  // Approve vault
  const approveTx = await erc20.approve(vaultAddr, parsedAmount);
  await approveTx.wait();

  // Deposit
  const tx = await vault.deposit(parsedAmount);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    amount,
    blockNumber: receipt.blockNumber,
  };
}

export async function harvestYield(toAddress: string) {
  const vault = getYieldVault();
  const tx = await vault.harvest(toAddress);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    to: toAddress,
    blockNumber: receipt.blockNumber,
  };
}

export async function getAccruedYield(userAddress: string): Promise<string> {
  const vault = getYieldVault();
  const assetAddr = await vault.asset();
  const erc20 = getERC20(assetAddr);
  const decimals = Number(await erc20.decimals());
  const yield_ = await vault.accruedYield(userAddress);
  return ethers.formatUnits(yield_, decimals);
}

export async function getVaultDeposit(userAddress: string) {
  const vault = getYieldVault();
  const assetAddr = await vault.asset();
  const erc20 = getERC20(assetAddr);
  const decimals = Number(await erc20.decimals());
  const [amount, shares, depositBlock, active] = await vault.getDeposit(userAddress);

  return {
    amount: ethers.formatUnits(amount, decimals),
    shares: ethers.formatUnits(shares, decimals),
    depositBlock: Number(depositBlock),
    active,
  };
}

// ─── Agent Wallet Operations ───

export async function fundAgentWallet(token: string, amount: string) {
  const agentWallet = getAgentWallet();
  const agentAddr = getContractAddresses().SphereAgentWallet;
  const tokenAddr = getTokenAddress(token);
  const decimals = getTokenDecimals(token);
  const parsedAmount = ethers.parseUnits(amount, decimals);

  // Approve agent wallet
  const erc20 = getERC20(tokenAddr);
  const approveTx = await erc20.approve(agentAddr, parsedAmount);
  await approveTx.wait();

  // Fund
  const tx = await agentWallet.fund(tokenAddr, parsedAmount);
  const receipt = await tx.wait();

  return { txHash: receipt.hash, token, amount };
}

export async function stopAgentAndRefund(token: string) {
  const agentWallet = getAgentWallet();
  const tokenAddr = getTokenAddress(token);

  const stopTx = await agentWallet.stopAndRefund();
  await stopTx.wait();

  const refundTx = await agentWallet.refund(tokenAddr);
  const receipt = await refundTx.wait();

  return { txHash: receipt.hash };
}

export async function getAgentBudgetStatus(token: string) {
  const agentWallet = getAgentWallet();
  const tokenAddr = getTokenAddress(token);
  const decimals = getTokenDecimals(token);

  const [budget, spent, remaining, isActive] = await Promise.all([
    agentWallet.budgets(tokenAddr),
    agentWallet.totalSpent(tokenAddr),
    agentWallet.remainingBudget(tokenAddr),
    agentWallet.isActive(),
  ]);

  return {
    budget: ethers.formatUnits(budget, decimals),
    spent: ethers.formatUnits(spent, decimals),
    remaining: ethers.formatUnits(remaining, decimals),
    isActive,
  };
}
