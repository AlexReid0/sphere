import { create } from 'zustand'
import { NodeData, Connection, NodeType, AsteroidEvent, SwapData, WalletData, DistributeData, YieldData, AgentData } from '../types'
import * as walletService from '../services/wallet'

export interface HistoryEntry {
  id: string
  timestamp: number
  kind:
    | 'connection_added'
    | 'connection_removed'
    | 'node_added'
    | 'node_removed'
    | 'yield_harvested'
    | 'params_updated'
    | 'distribution_sent'
    | 'swap_executed'
    | 'yield_deployed'
    | 'yield_deployed_usdc'
    | 'usyc_redeemed'
    | 'wallet_created'
    | 'agent_started'
    | 'agent_stopped'
    | 'agent_completed'
  label: string
  detail?: string
  amount?: string
  status?: 'loading' | 'confirmed'
  addresses?: string[]
  txHash?: string
}

let nodeIdCounter = 100
const genId = () => `node_${++nodeIdCounter}`
const genConnId = () => `conn_${Date.now()}_${Math.random().toString(36).slice(2)}`

function makeDefaultData(type: NodeType): NodeData['data'] {
  switch (type) {
    case 'swap':
      return {
        mode: 'crypto',
        fromToken: 'USDC', toToken: 'ETH',
        amount: '50,000', rate: '0.000267',
        timeLocked: false, slippage: '0.5',
        fromStable: 'USDC', toStable: 'USDT', spread: '0.02',
        schedule: 'One-time',
      } as SwapData
    case 'yield':
      return {
        mode: 'defi',
        apy: '4.2', accruedYield: '1,847', autoCompound: false,
        idleAsset: 'USDC', amount: '200,000', currentYield: '5.1',
        maturityDate: '2025-12-31', conversionProgress: 68,
        whitelistGranted: true,
        redemptionFlow: 'portal',
        redemptionSourceChain: 'Arc',
        redemptionDestinationChain: 'Arc',
      } as YieldData
    case 'distribute':
      return {
        mode: 'payroll',
        totalAmount: '85,000', currency: 'USDC', schedule: 'Monthly',
        executionDay: '1',
        recipients: [
          { name: 'Engineering', amount: '45,000', address: '0xabc…', pct: '53' },
          { name: 'Design', amount: '25,000', address: '0xdef…', pct: '29' },
          { name: 'Ops', amount: '15,000', address: '0x789…', pct: '18' },
        ],
      } as DistributeData
    case 'wallet':
      return {
        address: `0x${Math.random().toString(16).slice(2, 6)}…${Math.random().toString(16).slice(2, 6)}`,
        balance: '0',
        currency: 'USDC', totalYieldReceived: '0',
      } as WalletData
    case 'agent':
      return {
        instructions: '',
        status: 'idle',
        maxBudget: '1,000',
        usedBudget: '0',
        model: 'openclaw-1',
        lastOutput: undefined,
        logs: [],
      } as AgentData
  }
}

const INITIAL_NODES: NodeData[] = [
  {
    id: 'wallet_anchor',
    type: 'wallet',
    position: { x: 40, y: 270 },
    label: 'Main Wallet',
    value: '500,000 USDC',
    size: 84,
    data: { address: '0x7f3a…d92b', balance: '500,000', currency: 'USDC', totalYieldReceived: '6,340' } as WalletData,
    isSelected: false,
    isHovered: false,
  },
  {
    id: 'swap_main',
    type: 'swap',
    position: { x: 280, y: 290 },
    label: 'ETH Swap',
    value: '50K USDC → ETH',
    size: 72,
    data: makeDefaultData('swap'),
    isSelected: false,
    isHovered: false,
  },
  {
    id: 'yield_defi',
    type: 'yield',
    position: { x: 530, y: 150 },
    label: 'DeFi Yield',
    value: '4.2% APY',
    size: 72,
    data: makeDefaultData('yield'),
    isSelected: false,
    isHovered: false,
  },
  {
    id: 'yield_rwa',
    type: 'yield',
    position: { x: 530, y: 430 },
    label: 'USYC Yield',
    value: '5.1% RWA',
    size: 72,
    data: { ...(makeDefaultData('yield') as YieldData), mode: 'rwa' },
    isSelected: false,
    isHovered: false,
  },
  {
    id: 'distribute_main',
    type: 'distribute',
    position: { x: 810, y: 150 },
    label: 'Team Payroll',
    value: '85K / mo',
    size: 72,
    data: makeDefaultData('distribute'),
    isSelected: false,
    isHovered: false,
  },
  {
    id: 'wallet_main',
    type: 'wallet',
    position: { x: 810, y: 430 },
    label: 'Treasury Wallet',
    value: '34,210 USDC',
    size: 80,
    data: { address: '0x7f3a…d92b', balance: '34,210', currency: 'USDC', totalYieldReceived: '6,340' } as WalletData,
    isSelected: false,
    isHovered: false,
  },
]

const INITIAL_CONNECTIONS: Connection[] = [
  { id: 'c0', fromNodeId: 'wallet_anchor', toNodeId: 'swap_main', fromPort: 'output', toPort: 'input', assetType: 'USDC', flowAmount: '500K', isActive: true },
  { id: 'c1', fromNodeId: 'swap_main', toNodeId: 'yield_defi', fromPort: 'output', toPort: 'input', assetType: 'ETH', flowAmount: '~$50K', isActive: true },
  { id: 'c2', fromNodeId: 'swap_main', toNodeId: 'yield_rwa', fromPort: 'output', toPort: 'input', assetType: 'USDC', flowAmount: '200K', isActive: true },
  { id: 'c3', fromNodeId: 'yield_defi', toNodeId: 'distribute_main', fromPort: 'output', toPort: 'input', assetType: 'USDC', flowAmount: '2.1K', isActive: true },
  { id: 'c4', fromNodeId: 'yield_rwa', toNodeId: 'wallet_main', fromPort: 'output', toPort: 'input', assetType: 'USDC', flowAmount: '10.2K', isActive: true },
]

interface GraphState {
  nodes: NodeData[]
  connections: Connection[]
  selectedNodeId: string | null
  draggingNodeId: string | null
  dragOffset: { x: number; y: number }
  connectingFrom: { nodeId: string; portX: number; portY: number } | null
  cursorPos: { x: number; y: number }
  asteroids: AsteroidEvent[]
  canvasOffset: { x: number; y: number }
  zoom: number

  selectNode: (id: string | null) => void
  hoverNode: (id: string | null) => void
  startDragging: (id: string, offsetX: number, offsetY: number) => void
  dragNode: (x: number, y: number) => void
  stopDragging: () => void
  startConnecting: (nodeId: string, portX: number, portY: number) => void
  finishConnecting: (toNodeId: string) => void
  cancelConnecting: () => void
  setCursorPos: (x: number, y: number) => void
  addNode: (type: NodeType, position: { x: number; y: number }) => string
  removeNode: (id: string) => void
  addConnection: (fromNodeId: string, toNodeId: string) => void
  removeConnection: (id: string) => void
  updateNodeSize: (id: string, newSize: number) => void
  updateNodeData: (id: string, patch: Record<string, unknown>) => void
  updateNodeLabel: (id: string, label: string) => void
  updateNodeValue: (id: string, value: string) => void
  pendingDeleteConnId: string | null
  setPendingDeleteConn: (id: string | null) => void
  history: HistoryEntry[]
  logHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => string
  confirmHistoryEntry: (id: string) => void
  clearHistory: () => void
  spawnAsteroid: (fromNodeId: string, toNodeId: string, amount: string) => void
  removeAsteroid: (id: string) => void
  panCanvas: (dx: number, dy: number) => void
  setZoom: (z: number) => void
  zoomToward: (newZoom: number, screenX: number, screenY: number) => void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: INITIAL_NODES,
  connections: INITIAL_CONNECTIONS,
  selectedNodeId: null,
  draggingNodeId: null,
  dragOffset: { x: 0, y: 0 },
  connectingFrom: null,
  cursorPos: { x: 0, y: 0 },
  pendingDeleteConnId: null,
  history: [],
  asteroids: [],
  canvasOffset: { x: 0, y: 0 },
  zoom: 1,

  selectNode: (id) => set((s) => ({
    nodes: s.nodes.map(n => ({ ...n, isSelected: n.id === id })),
    selectedNodeId: id,
  })),

  hoverNode: (id) => set((s) => ({
    nodes: s.nodes.map(n => ({ ...n, isHovered: n.id === id })),
  })),

  startDragging: (id, ox, oy) => set({ draggingNodeId: id, dragOffset: { x: ox, y: oy } }),

  dragNode: (x, y) => {
    const { draggingNodeId, dragOffset, zoom, canvasOffset } = get()
    if (!draggingNodeId) return
    const nx = (x - canvasOffset.x) / zoom - dragOffset.x
    const ny = (y - canvasOffset.y) / zoom - dragOffset.y
    set((s) => ({
      nodes: s.nodes.map(n => n.id === draggingNodeId ? { ...n, position: { x: nx, y: ny } } : n),
    }))
  },

  stopDragging: () => set({ draggingNodeId: null }),

  startConnecting: (nodeId, portX, portY) => set({ connectingFrom: { nodeId, portX, portY } }),

  finishConnecting: (toNodeId) => {
    const { connectingFrom } = get()
    if (!connectingFrom || connectingFrom.nodeId === toNodeId) {
      set({ connectingFrom: null })
      return
    }
    const existing = get().connections.find(
      c => c.fromNodeId === connectingFrom.nodeId && c.toNodeId === toNodeId
    )
    if (!existing) {
      get().addConnection(connectingFrom.nodeId, toNodeId)
    }
    set({ connectingFrom: null })
  },

  cancelConnecting: () => set({ connectingFrom: null }),

  setCursorPos: (x, y) => set({ cursorPos: { x, y } }),

  addNode: (type, position) => {
    const id = genId()
    const defaults: Record<NodeType, string> = {
      swap: '0 USDC', yield: '0% APY', distribute: '0 USDC', wallet: '0 USDC', agent: 'Idle',
    }
    const label = `${NODE_TYPE_LABELS[type]} ${nodeIdCounter}`
    const nodeData = makeDefaultData(type)
    const node: NodeData = {
      id, type, position, label,
      value: defaults[type],
      size: 72,
      data: nodeData,
      isSelected: false,
      isHovered: false,
    }
    set(s => ({ nodes: [...s.nodes, node] }))

    if (type === 'wallet') {
      const histId = get().logHistory({
        kind: 'wallet_created',
        label: `Creating ${label}…`,
        status: 'loading',
        detail: (nodeData as WalletData).address,
      })
      // Create real Circle Programmable Wallet
      walletService.createWallet(label).then(result => {
        // Update node with real wallet address
        get().updateNodeData(id, { address: result.address, circleWalletId: result.circleWalletId } as Record<string, unknown>)
        get().confirmHistoryEntry(histId)
      }).catch(() => {
        // Fallback: just confirm with mock address
        get().confirmHistoryEntry(histId)
      })
    } else {
      get().logHistory({ kind: 'node_added', label: `Added ${label}` })
    }
    return id
  },

  removeNode: (id) => {
    if (id === 'wallet_anchor') return
    const node = get().nodes.find(n => n.id === id)
    set(s => ({
      nodes: s.nodes.filter(n => n.id !== id),
      connections: s.connections.filter(c => c.fromNodeId !== id && c.toNodeId !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }))
    if (node) get().logHistory({ kind: 'node_removed', label: `Removed ${node.label}` })
  },

  addConnection: (fromNodeId, toNodeId) => {
    const from = get().nodes.find(n => n.id === fromNodeId)
    const to = get().nodes.find(n => n.id === toNodeId)
    set(s => ({
      connections: [...s.connections, {
        id: genConnId(), fromNodeId, toNodeId,
        fromPort: 'output', toPort: 'input',
        assetType: 'USDC', isActive: true,
      }],
    }))
    if (from && to) get().logHistory({ kind: 'connection_added', label: `Connected ${from.label} → ${to.label}` })
  },

  removeConnection: (id) => {
    const conn = get().connections.find(c => c.id === id)
    const from = conn ? get().nodes.find(n => n.id === conn.fromNodeId) : null
    const to = conn ? get().nodes.find(n => n.id === conn.toNodeId) : null
    set(s => ({ connections: s.connections.filter(c => c.id !== id) }))
    if (from && to) get().logHistory({ kind: 'connection_removed', label: `Disconnected ${from.label} → ${to.label}` })
  },

  updateNodeSize: (id, newSize) => set(s => ({
    nodes: s.nodes.map(n => n.id === id ? { ...n, size: newSize } : n),
  })),

  updateNodeValue: (id, value) => set(s => ({
    nodes: s.nodes.map(n => n.id === id ? { ...n, value } : n),
  })),

  spawnAsteroid: (fromNodeId, toNodeId, amount) => {
    const id = `ast_${Date.now()}`
    set(s => ({ asteroids: [...s.asteroids, { id, fromNodeId, toNodeId, amount, startTime: Date.now() }] }))
    // Animation completes after 2s, then update UI
    setTimeout(() => {
      const toNode = get().nodes.find(n => n.id === toNodeId)
      if (toNode) get().updateNodeSize(toNodeId, Math.min(toNode.size + 5, 140))
      get().removeAsteroid(id)
      get().logHistory({ kind: 'yield_harvested', label: `Yield harvested`, amount, detail: `+${amount} → ${toNode?.label ?? 'Wallet'}` })
    }, 2000)
  },

  removeAsteroid: (id) => set(s => ({ asteroids: s.asteroids.filter(a => a.id !== id) })),

  setPendingDeleteConn: (id) => set({ pendingDeleteConnId: id }),

  logHistory: (entry) => {
    const id = `h_${Date.now()}_${Math.random().toString(36).slice(2)}`
    set(s => ({
      history: [
        { ...entry, id, timestamp: Date.now() },
        ...s.history,
      ].slice(0, 100),
    }))
    return id
  },

  confirmHistoryEntry: (id) => set(s => ({
    history: s.history.map(h => h.id === id ? { ...h, status: 'confirmed' as const } : h),
  })),

  clearHistory: () => set({ history: [] }),

  updateNodeData: (id, patch) => set(s => ({
    nodes: s.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } as NodeData['data'] } : n),
  })),

  updateNodeLabel: (id, label) => set(s => ({
    nodes: s.nodes.map(n => n.id === id ? { ...n, label } : n),
  })),

  panCanvas: (dx, dy) => set(s => ({ canvasOffset: { x: s.canvasOffset.x + dx, y: s.canvasOffset.y + dy } })),

  setZoom: (z) => set({ zoom: Math.max(0.3, Math.min(2, z)) }),

  zoomToward: (newZoom, screenX, screenY) => set(s => {
    const clamped = Math.max(0.3, Math.min(2, newZoom))
    const factor = clamped / s.zoom
    return {
      zoom: clamped,
      canvasOffset: {
        x: screenX - (screenX - s.canvasOffset.x) * factor,
        y: screenY - (screenY - s.canvasOffset.y) * factor,
      },
    }
  }),
}))

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  swap: 'Swap', yield: 'Yield', distribute: 'Distribute', wallet: 'Wallet', agent: 'Agent',
}
