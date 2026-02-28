import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ─── ARC Testnet Config ───
export const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
export const ARC_CHAIN_ID = parseInt(process.env.ARC_CHAIN_ID || '5042002');
export const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '';
export const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
export const STABLEFX_TEST_API_KEY = process.env.STABLEFX_TEST_API_KEY || '';
export const PORT = parseInt(process.env.PORT || '3001');
export const DATABASE_PATH = process.env.DATABASE_PATH || path.resolve(__dirname, '../data/sphere.db');
export const ARC_EXPLORER = 'https://testnet.arcscan.app';

// ─── Ethers Provider & Signer ───
export const provider = new ethers.JsonRpcProvider(ARC_RPC_URL, {
  chainId: ARC_CHAIN_ID,
  name: 'arc-testnet',
});

export const signer = DEPLOYER_PRIVATE_KEY
  ? new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider)
  : null;

// ─── Contract Addresses (from deployment) ───
export interface DeployedContracts {
  MockUSDC: string;
  MockUSDT: string;
  MockDAI: string;
  MockWETH: string;
  SphereSwapRouter: string;
  SphereDistributor: string;
  SphereYieldVault: string;
  SphereAgentWallet: string;
}

let _contracts: DeployedContracts | null = null;

export function getContractAddresses(): DeployedContracts {
  if (_contracts) return _contracts;

  // Try loading from deployment JSON
  const deploymentsPath = path.resolve(__dirname, '../../contracts/deployments/arc-testnet.json');
  if (fs.existsSync(deploymentsPath)) {
    const data = JSON.parse(fs.readFileSync(deploymentsPath, 'utf-8'));
    _contracts = data.contracts as DeployedContracts;
    return _contracts;
  }

  // Fallback to env vars
  _contracts = {
    MockUSDC: process.env.MOCK_USDC_ADDRESS || '',
    MockUSDT: process.env.MOCK_USDT_ADDRESS || '',
    MockDAI: process.env.MOCK_DAI_ADDRESS || '',
    MockWETH: process.env.MOCK_WETH_ADDRESS || '',
    SphereSwapRouter: process.env.SWAP_ROUTER_ADDRESS || '',
    SphereDistributor: process.env.DISTRIBUTOR_ADDRESS || '',
    SphereYieldVault: process.env.YIELD_VAULT_ADDRESS || '',
    SphereAgentWallet: process.env.AGENT_WALLET_ADDRESS || '',
  };
  return _contracts;
}

// ─── Token metadata ───
export const TOKEN_META: Record<string, { symbol: string; decimals: number; addressKey: keyof DeployedContracts }> = {
  USDC: { symbol: 'USDC', decimals: 6, addressKey: 'MockUSDC' },
  USDT: { symbol: 'USDT', decimals: 6, addressKey: 'MockUSDT' },
  DAI:  { symbol: 'DAI',  decimals: 18, addressKey: 'MockDAI' },
  WETH: { symbol: 'WETH', decimals: 18, addressKey: 'MockWETH' },
};

export function getTokenAddress(symbol: string): string {
  const meta = TOKEN_META[symbol.toUpperCase()];
  if (!meta) throw new Error(`Unknown token: ${symbol}`);
  return getContractAddresses()[meta.addressKey];
}

export function getTokenDecimals(symbol: string): number {
  const meta = TOKEN_META[symbol.toUpperCase()];
  if (!meta) throw new Error(`Unknown token: ${symbol}`);
  return meta.decimals;
}
