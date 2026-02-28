import { ethers } from 'ethers';
import { signer, provider, getContractAddresses } from '../config.js';

// ─── ABIs (minimal interfaces for our contracts) ───

const MOCK_ERC20_ABI = [
  'function mint(address to, uint256 amount) external',
  'function faucet(uint256 amount) external',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

const SWAP_ROUTER_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut)',
  'function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut)',
  'function getReserves(address tokenA, address tokenB) external view returns (uint256 reserveA, uint256 reserveB)',
  'function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) external',
  'event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
];

const DISTRIBUTOR_ABI = [
  'function distribute(address token, address[] calldata recipients, uint256[] calldata amounts) external',
  'function transfer(address token, address recipient, uint256 amount) external',
  'event Distribution(address indexed sender, address indexed token, uint256 totalAmount, uint256 recipientCount)',
];

const YIELD_VAULT_ABI = [
  'function deposit(uint256 amount) external returns (uint256 shares)',
  'function withdraw() external returns (uint256 totalReturn)',
  'function harvest(address to) external returns (uint256 yield_)',
  'function accruedYield(address user) external view returns (uint256)',
  'function getDeposit(address user) external view returns (uint256 amount, uint256 shares, uint256 depositBlock, bool active)',
  'function asset() external view returns (address)',
  'event Deposited(address indexed user, uint256 amount, uint256 shares)',
  'event Harvested(address indexed user, address indexed to, uint256 yield_)',
];

const AGENT_WALLET_ABI = [
  'function fund(address token, uint256 amount) external',
  'function spend(address token, uint256 amount, address to) external',
  'function stopAndRefund() external',
  'function refund(address token) external',
  'function setAgent(address _agent) external',
  'function startSession() external',
  'function remainingBudget(address token) external view returns (uint256)',
  'function totalSpent(address token) external view returns (uint256)',
  'function budgets(address token) external view returns (uint256)',
  'function isActive() external view returns (bool)',
  'event Funded(address indexed token, uint256 amount)',
  'event Spent(address indexed token, address indexed to, uint256 amount)',
];

// ─── Contract Instances ───

export function getERC20(address: string) {
  return new ethers.Contract(address, MOCK_ERC20_ABI, signer || provider);
}

export function getSwapRouter() {
  const addr = getContractAddresses().SphereSwapRouter;
  return new ethers.Contract(addr, SWAP_ROUTER_ABI, signer || provider);
}

export function getDistributor() {
  const addr = getContractAddresses().SphereDistributor;
  return new ethers.Contract(addr, DISTRIBUTOR_ABI, signer || provider);
}

export function getYieldVault() {
  const addr = getContractAddresses().SphereYieldVault;
  return new ethers.Contract(addr, YIELD_VAULT_ABI, signer || provider);
}

export function getAgentWallet() {
  const addr = getContractAddresses().SphereAgentWallet;
  return new ethers.Contract(addr, AGENT_WALLET_ABI, signer || provider);
}

export {
  MOCK_ERC20_ABI,
  SWAP_ROUTER_ABI,
  DISTRIBUTOR_ABI,
  YIELD_VAULT_ABI,
  AGENT_WALLET_ABI,
};
