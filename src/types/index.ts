export type NodeType = 'swap' | 'yield' | 'distribute' | 'wallet'

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
  data: SwapData | YieldData | DistributeData | WalletData
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
  // Quote state (simulated Circle quote response)
  quoteId?: string
  quoteExpiry?: string     // ISO timestamp
  quotedRate?: string      // rate string from quote
  quotedFee?: string       // fee % string
  quotedReceive?: string   // computed receive amount
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
}

export interface DistributeData {
  mode: 'payroll' | 'transfer' | 'split'
  totalAmount: string
  currency: string
  schedule: string
  // Exact scheduling
  executionDay?: string    // day-of-month "1"-"28" for monthly, weekday name for weekly
  recipients: Array<{ name: string; amount: string; address: string; pct?: string }>
}

export interface WalletData {
  address: string
  balance: string
  currency: string
  totalYieldReceived: string
  tokenBalances?: Record<string, string>
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
}

export const SUGGESTIONS: Record<NodeType, NodeType[]> = {
  swap: ['wallet', 'distribute'],
  yield: ['wallet', 'distribute', 'swap'],
  distribute: [],
  wallet: ['swap', 'yield'],
}
