export type NodeType = 'swap' | 'yield' | 'distribute' | 'wallet' | 'agent'

export interface NodePosition {
  x: number
  y: number
}

export interface NodeData {
  id: string
  type: NodeType
  position: NodePosition
  label: string
  value?: string
  size: number
  data: SwapData | YieldData | DistributeData | WalletData | AgentData
  isSelected: boolean
  isHovered: boolean
}

// Swap: handles both crypto swaps and stablecoin FX
export interface SwapData {
  mode: 'crypto' | 'stableFX'
  // Crypto swap
  fromToken: string
  toToken: string
  amount: string
  rate: string
  timeLocked?: boolean
  lockTime?: string
  slippage: string
  // StableFX (Circle StableFX API)
  fromStable: string
  toStable: string
  spread: string
  // StableFX tenor (Circle API: instant | hourly | daily)
  tenor?: 'instant' | 'hourly' | 'daily'
  // Scheduling (shared for crypto and stableFX)
  schedule?: string       // 'One-time' | 'Daily' | 'Weekly' | 'Biweekly' | 'Monthly' | 'Quarterly'
  executionDay?: string   // weekday name for weekly, day-of-month for monthly
  trigger?: 'date' | 'after_parent'  // one-time execution trigger mode
  // Quote state (Circle quote response)
  quoteId?: string
  quoteExpiry?: string     // ISO timestamp
  quotedRate?: string      // rate string from quote
  quotedFee?: string       // fee % string
  quotedReceive?: string   // computed receive amount
  // Backend tracking
  txHash?: string
}

// Yield: handles both DeFi yield routing and RWA (USYC)
export interface YieldData {
  mode: 'defi' | 'rwa'
  // DeFi
  apy: string
  accruedYield: string
  autoCompound: boolean
  // RWA (USYC)
  idleAsset: string
  amount: string
  currentYield: string
  maturityDate: string
  conversionProgress: number
  whitelistGranted?: boolean
  redemptionFlow?: 'portal' | 'contracts'
  redemptionAmount?: string
  redemptionSourceChain?: string
  redemptionDestinationChain?: string
  redemptionFeeBps?: string
  // Deploy trigger: after parent task completes → deploy to USDC
  trigger?: 'date' | 'after_parent'
  // Backend tracking
  txHash?: string
  vaultShares?: string
}

export interface DistributeData {
  mode: 'payroll' | 'transfer' | 'split'
  totalAmount: string
  currency: string
  schedule: string
  // Exact scheduling
  executionDay?: string    // day-of-month "1"-"28" for monthly, weekday name for weekly
  // One-time trigger options
  trigger?: 'date' | 'after_parent'   // how to trigger a one-time distribution
  oneTimeDate?: string                 // ISO date string when trigger = 'date'
  recipients: Array<{ name: string; amount: string; address: string; pct?: string }>
  // Backend tracking
  txHash?: string
  scheduledJobId?: string
}

export interface WalletData {
  address: string
  balance: string
  currency: string
  totalYieldReceived: string
  tokenBalances?: Record<string, string>
  circleWalletId?: string
}

// Agent: AI agent powered by Openclaw
export interface AgentData {
  instructions: string
  status: 'idle' | 'running' | 'stopped' | 'completed'
  maxBudget: string        // max budget allocated from parent node
  usedBudget: string       // amount consumed so far (UI only)
  model: string            // e.g. 'openclaw-1'
  lastOutput?: string      // last output message from agent
  logs?: string[]          // running log entries
  openclawSessionId?: string
}

export interface Connection {
  id: string
  fromNodeId: string
  toNodeId: string
  fromPort: 'output'
  toPort: 'input'
  assetType: string
  flowAmount?: string
  isActive: boolean
  isPending?: boolean
}

export interface SuggestedNode {
  type: NodeType
  angle: number
  label: string
}

export interface AsteroidEvent {
  id: string
  fromNodeId: string
  toNodeId: string
  amount: string
  startTime: number
}

export const NODE_TYPE_META: Record<NodeType, {
  label: string
  color1: string   // dark shade
  color2: string   // main color
  color3: string   // light shade
  glow: string     // accent color
  icon: string
  description: string
}> = {
  swap: {
    label: 'Swap',
    color1: '#9A3412',
    color2: '#EA580C',
    color3: '#FED7AA',
    glow: '#EA580C',
    icon: '⇄',
    description: 'Token swap — crypto or stablecoin FX',
  },
  yield: {
    label: 'Yield',
    color1: '#0F766E',
    color2: '#14B8A6',
    color3: '#CCFBF1',
    glow: '#0D9488',
    icon: '↗',
    description: 'Yield routing — DeFi or RWA via USYC',
  },
  distribute: {
    label: 'Distribute',
    color1: '#92400E',
    color2: '#F59E0B',
    color3: '#FDE68A',
    glow: '#D97706',
    icon: '⊕',
    description: 'Distribute funds — payroll, transfer, or split',
  },
  wallet: {
    label: 'Wallet',
    color1: '#1E3A8A',
    color2: '#2563EB',
    color3: '#BFDBFE',
    glow: '#1D4ED8',
    icon: '◉',
    description: 'Wallet balance destination',
  },
  agent: {
    label: 'Agent',
    color1: '#3730A3',
    color2: '#6366F1',
    color3: '#E0E7FF',
    glow: '#6366F1',
    icon: '◈',
    description: 'AI agent — powered by Openclaw',
  },
}

export const SUGGESTIONS: Record<NodeType, NodeType[]> = {
  swap: ['distribute'],
  yield: ['distribute', 'swap'],
  distribute: [],
  wallet: ['swap', 'yield', 'agent'],
  agent: [],
}
