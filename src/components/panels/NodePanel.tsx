import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphStore } from '../../store/graphStore'
import { NODE_TYPE_META, NodeData } from '../../types'
import type { Connection, SwapData, YieldData, DistributeData, WalletData, AgentData } from '../../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAmount(v: string): string {
  const n = parseFloat(v.replace(/,/g, ''))
  if (isNaN(n)) return v
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return v
}

function parseNumericInput(v: string): number {
  const n = parseFloat((v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function formatNumericInput(v: number): string {
  const safe = Number.isFinite(v) ? Math.max(0, v) : 0
  return safe.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

function getWalletBalances(wallet: WalletData): Record<string, number> {
  const balances: Record<string, number> = {}
  if (wallet.tokenBalances) {
    Object.entries(wallet.tokenBalances).forEach(([asset, amount]) => {
      balances[asset] = parseNumericInput(amount)
    })
  }
  if (!Object.keys(balances).length) {
    balances[wallet.currency] = parseNumericInput(wallet.balance)
  }
  if (!(wallet.currency in balances)) {
    balances[wallet.currency] = parseNumericInput(wallet.balance)
  }
  return balances
}

function buildWalletPatch(
  balances: Record<string, number>,
  preferredCurrency: string,
): Pick<WalletData, 'balance' | 'currency' | 'tokenBalances'> {
  const tokenBalances: Record<string, string> = {}
  Object.entries(balances).forEach(([asset, amount]) => {
    if (amount > 0 || asset === preferredCurrency) {
      tokenBalances[asset] = formatNumericInput(amount)
    }
  })
  if (!(preferredCurrency in tokenBalances)) {
    tokenBalances[preferredCurrency] = '0'
  }
  return {
    balance: tokenBalances[preferredCurrency],
    currency: preferredCurrency,
    tokenBalances,
  }
}

function applyWalletBalances(
  walletNode: NodeData,
  balances: Record<string, number>,
  updateNodeData: (id: string, patch: Record<string, unknown>) => void,
  updateNodeValue: (id: string, value: string) => void,
  preferredCurrency?: string,
) {
  if (walletNode.type !== 'wallet') return null
  const current = walletNode.data as WalletData
  const nextCurrency = preferredCurrency ?? current.currency
  const patch = buildWalletPatch(balances, nextCurrency)
  updateNodeData(walletNode.id, patch as Record<string, unknown>)
  const nextNode = { ...walletNode, data: { ...current, ...patch } as WalletData }
  updateNodeValue(walletNode.id, computeNodeValue(nextNode))
  return patch
}

function applyWalletDeltas(
  walletNode: NodeData,
  deltas: Record<string, number>,
  updateNodeData: (id: string, patch: Record<string, unknown>) => void,
  updateNodeValue: (id: string, value: string) => void,
  preferredCurrency?: string,
) {
  if (walletNode.type !== 'wallet') return null
  const walletData = walletNode.data as WalletData
  const balances = getWalletBalances(walletData)
  Object.entries(deltas).forEach(([asset, delta]) => {
    const next = (balances[asset] ?? 0) + delta
    balances[asset] = Math.max(0, next)
  })
  return applyWalletBalances(walletNode, balances, updateNodeData, updateNodeValue, preferredCurrency ?? walletData.currency)
}

function findFundingWallet(nodeId: string, nodes: NodeData[], connections: Connection[]): NodeData | null {
  const visited = new Set<string>([nodeId])
  const queue = [nodeId]
  while (queue.length) {
    const current = queue.shift()!
    const incoming = connections.filter(c => c.toNodeId === current)
    for (const conn of incoming) {
      if (visited.has(conn.fromNodeId)) continue
      visited.add(conn.fromNodeId)
      const source = nodes.find(n => n.id === conn.fromNodeId)
      if (!source) continue
      if (source.type === 'wallet') return source
      queue.push(source.id)
    }
  }
  return null
}

/** Get the max available amount from the immediate upstream (parent) node for a given asset. */
function getUpstreamMax(nodeId: string, asset: string, nodes: NodeData[], connections: Connection[]): number | null {
  const incoming = connections.find(c => c.toNodeId === nodeId)
  if (!incoming) return null
  const parent = nodes.find(n => n.id === incoming.fromNodeId)
  if (!parent) return null

  switch (parent.type) {
    case 'wallet': {
      const wd = parent.data as WalletData
      const balances = getWalletBalances(wd)
      return balances[asset] ?? balances[wd.currency] ?? 0
    }
    case 'swap': {
      const sd = parent.data as SwapData
      return parseNumericInput(sd.amount)
    }
    case 'yield': {
      const yd = parent.data as YieldData
      return parseNumericInput(yd.amount)
    }
    case 'distribute': {
      const dd = parent.data as DistributeData
      return parseNumericInput(dd.totalAmount)
    }
    case 'agent': {
      const ad = parent.data as AgentData
      return parseNumericInput(ad.maxBudget)
    }
  }
}

/** Get the output asset of the immediate upstream (parent) node, or null. */
function getUpstreamAsset(nodeId: string, nodes: NodeData[], connections: Connection[]): string | null {
  const incoming = connections.find(c => c.toNodeId === nodeId)
  if (!incoming) return null
  const parent = nodes.find(n => n.id === incoming.fromNodeId)
  if (!parent) return null

  switch (parent.type) {
    case 'wallet': return (parent.data as WalletData).currency
    case 'swap': {
      const sd = parent.data as SwapData
      return sd.mode === 'crypto' ? sd.toToken : sd.toStable
    }
    case 'yield': return (parent.data as YieldData).idleAsset
    case 'distribute': return (parent.data as DistributeData).currency
    case 'agent': return 'USDC'
  }
}

function computeNodeValue(node: NodeData): string {
  switch (node.type) {
    case 'swap': {
      const d = node.data as SwapData
      return d.mode === 'crypto'
        ? `${formatAmount(d.amount)} ${d.fromToken} → ${d.toToken}`
        : `${formatAmount(d.amount)} ${d.fromStable} → ${d.toStable}`
    }
    case 'yield': {
      const d = node.data as YieldData
      return d.mode === 'defi' ? `${d.apy}% APY` : `${d.currentYield}% RWA`
    }
    case 'distribute': {
      const d = node.data as DistributeData
      const sched: Record<string, string> = {
        Daily: '/day', Weekly: '/wk', Biweekly: '/biwk',
        Monthly: '/mo', Quarterly: '/qtr', 'One-time': '',
      }
      return `${formatAmount(d.totalAmount)} ${sched[d.schedule] ?? ''}`.trim()
    }
    case 'wallet': {
      const d = node.data as WalletData
      return `${formatAmount(d.balance)} ${d.currency}`
    }
    case 'agent': {
      const d = node.data as AgentData
      return d.status === 'running' ? 'Running…' : d.status === 'completed' ? 'Done' : 'Idle'
    }
  }
}

// ─── Confirm dialog overlay ───────────────────────────────────────────────────

function ConfirmDialog({
  title, body, confirmLabel, confirmColor,
  onConfirm, onCancel,
}: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  confirmColor: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 300, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 10 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: 20,
          width: 'min(360px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 32px)',
          boxShadow: '0 8px 48px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          border: `1px solid ${confirmColor}33`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header strip */}
        <div style={{ background: `${confirmColor}12`, borderBottom: `1px solid ${confirmColor}22`, padding: '14px 20px' }}>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 14, color: '#1E293B' }}>{title}</div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px 20px', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16, lineHeight: 1.6, fontFamily: 'Space Grotesk, sans-serif' }}>
            {body}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-gray-50"
              style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#64748B', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: confirmColor, color: '#fff', fontFamily: 'Space Grotesk, sans-serif', boxShadow: `0 2px 12px ${confirmColor}55` }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const INPUT_BASE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  width: '100%',
  padding: 0,
  color: 'inherit',
}

function Field({
  label, value, onChange, type = 'text', options, min, max, step, readOnly, color,
}: {
  label: string; value: string; onChange?: (v: string) => void
  type?: 'text' | 'number' | 'select' | 'date'; options?: string[]
  min?: number; max?: number; step?: number; readOnly?: boolean; color?: string
}) {
  const c = color || '#1E293B'
  return (
    <div className="p-2 rounded-xl"
      style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
      <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 3, letterSpacing: '0.06em' }}>
        {label.toUpperCase()}
      </div>
      {type === 'select' && options ? (
        <select value={value} onChange={e => onChange?.(e.target.value)} disabled={readOnly}
          style={{ ...INPUT_BASE, color: c, cursor: readOnly ? 'default' : 'pointer', background: 'transparent' }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value} readOnly={readOnly} min={min} max={max} step={step}
          onChange={e => onChange?.(e.target.value)}
          style={{ ...INPUT_BASE, color: c, cursor: readOnly ? 'default' : 'text' }} />
      )}
    </div>
  )
}

/** Amount field with upstream cap: shows "Available: X" and clamps input to max. */
function AmountField({
  label, value, onChange, color, upstreamMax,
}: {
  label: string; value: string; onChange: (v: string) => void; color?: string; upstreamMax: number | null
}) {
  const c = color || '#1E293B'
  const parsed = parseNumericInput(value)
  const overMax = upstreamMax !== null && parsed > upstreamMax

  const handleChange = (raw: string) => {
    const n = parseNumericInput(raw)
    if (upstreamMax !== null && n > upstreamMax) {
      onChange(formatNumericInput(upstreamMax))
    } else {
      onChange(raw)
    }
  }

  return (
    <div className="p-2 rounded-xl"
      style={{
        background: overMax ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.03)',
        border: `1px solid ${overMax ? 'rgba(239,68,68,0.25)' : 'rgba(0,0,0,0.07)'}`,
      }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
          {label.toUpperCase()}
        </span>
        {upstreamMax !== null && (
          <button
            onClick={() => onChange(formatNumericInput(upstreamMax))}
            style={{
              fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.04em',
              color: c, opacity: 0.7, cursor: 'pointer', background: 'none', border: 'none', padding: 0,
            }}
            className="hover:opacity-100 transition-opacity"
          >
            MAX {formatNumericInput(upstreamMax)}
          </button>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        style={{ ...INPUT_BASE, color: c, cursor: 'text' }}
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded-xl"
      style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
      <span style={{ fontSize: 10, color: '#64748B', fontFamily: 'monospace', letterSpacing: '0.06em' }}>{label.toUpperCase()}</span>
      <button onClick={() => onChange(!checked)} className="relative transition-colors duration-200"
        style={{ width: 32, height: 18, borderRadius: 9,
          background: checked ? 'rgba(5,150,105,0.75)' : 'rgba(0,0,0,0.1)',
          border: '1px solid rgba(0,0,0,0.12)' }}>
        <div className="absolute top-0.5 transition-all duration-200"
          style={{ width: 14, height: 14, borderRadius: '50%',
            background: checked ? '#fff' : 'rgba(255,255,255,0.8)', left: checked ? 15 : 2 }} />
      </button>
    </div>
  )
}

function Slider({ label, value, min, max, step = 0.01, onChange, formatVal, color }: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; formatVal?: (v: number) => string; color?: string
}) {
  const c = color || '#2563EB'
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>{label.toUpperCase()}</span>
        <span style={{ fontSize: 10, color: c, fontFamily: 'monospace' }}>{formatVal ? formatVal(value) : value.toFixed(2)}</span>
      </div>
      <div className="relative h-3 rounded-full" style={{ background: 'rgba(0,0,0,0.07)' }}>
        <div className="absolute h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${c}99, ${c})` }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
    </div>
  )
}

function SectionDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 my-1">
      <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
      {label && <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>{label}</span>}
      <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
    </div>
  )
}

function ActionBtn({ children, onClick, color, variant = 'ghost' }: {
  children: React.ReactNode; onClick: () => void; color?: string; variant?: 'ghost' | 'solid'
}) {
  const c = color || '#2563EB'
  return (
    <button onClick={onClick}
      className="w-full py-2 rounded-xl text-xs font-semibold transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
      style={
        variant === 'solid'
          ? { background: c, color: '#fff', fontFamily: 'Space Grotesk, sans-serif', boxShadow: `0 2px 10px ${c}44` }
          : { background: `${c}18`, border: `1px solid ${c}44`, color: c, fontFamily: 'Space Grotesk, sans-serif' }
      }>
      {children}
    </button>
  )
}

function ModeToggle<T extends string>({
  value, onChange, options, color,
}: {
  value: T; onChange: (v: T) => void
  options: { value: T; label: string }[]
  color: string
}) {
  return (
    <div className="flex rounded-xl overflow-hidden mb-1"
      style={{ border: `1px solid rgba(0,0,0,0.09)`, background: 'rgba(0,0,0,0.03)' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="flex-1 py-1.5 text-xs font-semibold transition-all duration-150"
          style={{
            background: value === opt.value ? color : 'transparent',
            color: value === opt.value ? '#fff' : '#64748B',
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 10,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Circle StableFX data ─────────────────────────────────────────────────────

interface StableCoin {
  symbol: string
  name: string
  flag: string
  issuer: string
}

const STABLEFX_COINS: StableCoin[] = [
  { symbol: 'USDC', name: 'US Dollar',         flag: '🇺🇸', issuer: 'Circle'       },
  { symbol: 'EURC', name: 'Euro',              flag: '🇪🇺', issuer: 'Circle'       },
  { symbol: 'JPYC', name: 'Japanese Yen',      flag: '🇯🇵', issuer: 'JPYC Inc.'    },
  { symbol: 'QCAD', name: 'Canadian Dollar',   flag: '🇨🇦', issuer: 'Stablecorp'   },
  { symbol: 'MXNB', name: 'Mexican Peso',      flag: '🇲🇽', issuer: 'Bitso'        },
  { symbol: 'KRW1', name: 'Korean Won',        flag: '🇰🇷', issuer: 'Hanpass'      },
  { symbol: 'BRLA', name: 'Brazilian Real',    flag: '🇧🇷', issuer: 'BRLA Digital' },
  { symbol: 'PHPC', name: 'Philippine Peso',   flag: '🇵🇭', issuer: 'PHP Coin'     },
  { symbol: 'AUDF', name: 'Australian Dollar', flag: '🇦🇺', issuer: 'Novatti'      },
  { symbol: 'ZARU', name: 'South African Rand',flag: '🇿🇦', issuer: 'ZARX'         },
]

// Mock rates: 1 USDC = X of each coin
const FX_RATES: Record<string, number> = {
  USDC: 1.0,   EURC: 0.9215, JPYC: 149.32, QCAD: 1.354,
  MXNB: 17.12, KRW1: 1324.5, BRLA: 4.97,   PHPC: 55.43,
  AUDF: 1.536, ZARU: 18.73,
}

const FEE_PCT = 0.05 // 0.05% Circle StableFX fee

function fxRate(from: string, to: string): number {
  const fromRate = FX_RATES[from] ?? 1
  const toRate = FX_RATES[to] ?? 1
  return toRate / fromRate
}

function coinMeta(symbol: string): StableCoin {
  return STABLEFX_COINS.find(c => c.symbol === symbol) ?? { symbol, name: symbol, flag: '🪙', issuer: '' }
}

// Coin selector with flag
function CoinSelector({
  label, value, onChange, color,
}: {
  label: string; value: string; onChange: (v: string) => void; color: string
}) {
  const coin = coinMeta(value)
  return (
    <div className="p-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
      <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.06em' }}>
        {label.toUpperCase()}
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 16, lineHeight: 1 }}>{coin.flag}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, fontWeight: 600,
            color, cursor: 'pointer', flex: 1,
          }}
        >
          {STABLEFX_COINS.map(c => (
            <option key={c.symbol} value={c.symbol}>{c.flag} {c.symbol} — {c.name}</option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 8, color: '#94A3B8', fontFamily: 'monospace', marginTop: 2 }}>
        {coin.issuer}
      </div>
    </div>
  )
}

// Tenor selector: instant | hourly | daily
function TenorSelector({
  value, onChange, color,
}: {
  value: 'instant' | 'hourly' | 'daily'
  onChange: (v: 'instant' | 'hourly' | 'daily') => void
  color: string
}) {
  const opts: { value: 'instant' | 'hourly' | 'daily'; label: string; icon: string }[] = [
    { value: 'instant', label: 'Instant', icon: '⚡' },
    { value: 'hourly',  label: 'Hourly',  icon: '⏰' },
    { value: 'daily',   label: 'Daily',   icon: '📅' },
  ]
  return (
    <div>
      <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.06em' }}>
        TENOR (SETTLEMENT)
      </div>
      <div className="flex gap-1.5">
        {opts.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="flex-1 py-1.5 rounded-lg text-center transition-all duration-150"
            style={{
              background: value === o.value ? color : 'rgba(0,0,0,0.03)',
              border: `1px solid ${value === o.value ? color : 'rgba(0,0,0,0.08)'}`,
              color: value === o.value ? '#fff' : '#64748B',
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 9, fontWeight: 600,
            }}
          >
            <div style={{ fontSize: 12, lineHeight: 1, marginBottom: 1 }}>{o.icon}</div>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── After-parent trigger (shared for crypto + stableFX swaps) ───────────────

function SwapParentTrigger({
  node, d, u, meta,
}: {
  node: NodeData
  d: SwapData
  u: (p: Partial<SwapData>) => void
  meta: typeof NODE_TYPE_META[keyof typeof NODE_TYPE_META]
}) {
  const nodes = useGraphStore(s => s.nodes)
  const connections = useGraphStore(s => s.connections)
  const trigger = d.trigger ?? 'date'

  const incomingConn = connections.find(c => c.toNodeId === node.id)
  const parentNode = incomingConn ? nodes.find(n => n.id === incomingConn.fromNodeId) : null
  const parentIsScheduled = parentNode && (parentNode.type === 'swap' || parentNode.type === 'yield' || parentNode.type === 'distribute' || parentNode.type === 'wallet')

  return (
    <div className="space-y-2">
      {/* Trigger tabs */}
      <div className="flex gap-1.5">
        <button
          onClick={() => u({ trigger: 'date' })}
          className="flex-1 py-1.5 rounded-lg text-center transition-all duration-150"
          style={{
            background: trigger === 'date' ? meta.glow : 'rgba(0,0,0,0.03)',
            border: `1px solid ${trigger === 'date' ? meta.glow : 'rgba(0,0,0,0.08)'}`,
            color: trigger === 'date' ? '#fff' : '#64748B',
            fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
          }}
        >
          📅 On schedule
        </button>
        <button
          onClick={() => u({ trigger: 'after_parent' })}
          className="flex-1 py-1.5 rounded-lg text-center transition-all duration-150"
          style={{
            background: trigger === 'after_parent' ? meta.glow : 'rgba(0,0,0,0.03)',
            border: `1px solid ${trigger === 'after_parent' ? meta.glow : 'rgba(0,0,0,0.08)'}`,
            color: trigger === 'after_parent' ? '#fff' : '#64748B',
            fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
          }}
        >
          ⚡ After parent
        </button>
      </div>

      {/* After parent info */}
      {trigger === 'after_parent' && (
        <div className="px-3 py-2.5 rounded-xl space-y-1"
          style={{ background: `${meta.glow}0A`, border: `1px solid ${meta.glow}22` }}>
          {parentIsScheduled ? (
            <>
              <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                TRIGGERS AFTER
              </div>
              <div className="flex items-center gap-2">
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: `radial-gradient(circle at 36% 28%, #fff 0%, rgba(255,255,255,0.55) 18%, ${NODE_TYPE_META[parentNode!.type].color2} 52%, ${NODE_TYPE_META[parentNode!.type].color1} 100%)`,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>
                  {parentNode!.label}
                </span>
                <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>completes</span>
              </div>
              <div style={{ fontSize: 8, color: '#94A3B8', fontFamily: 'monospace', paddingTop: 2 }}>
                Executes immediately after the parent action finalises
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace', textAlign: 'center', padding: '4px 0' }}>
              Connect a node upstream to use this trigger
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── StableFX subpanel (Circle) ───────────────────────────────────────────────

function StableFXPanel({
  node, d, u, meta, onExecute, upstreamMax,
}: {
  node: NodeData
  d: SwapData
  u: (p: Partial<SwapData>) => void
  meta: typeof NODE_TYPE_META[keyof typeof NODE_TYPE_META]
  onExecute: () => void
  upstreamMax: number | null
}) {
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'loading' | 'ready' | 'expired'>('idle')
  const [quoteSeconds, setQuoteSeconds] = useState(30)

  const tenor = d.tenor ?? 'instant'
  const amount = parseNumericInput(d.amount)
  const rate = fxRate(d.fromStable, d.toStable)
  const feeAmt = amount * (FEE_PCT / 100)
  const receiveAmt = (amount - feeAmt) * rate

  // Clear quote if coin/amount changes
  const handleCoinChange = (field: 'fromStable' | 'toStable', val: string) => {
    u({ [field]: val, quoteId: undefined, quotedRate: undefined, quoteExpiry: undefined })
    setQuoteStatus('idle')
  }

  const handleGetQuote = () => {
    if (!amount || amount <= 0 || d.fromStable === d.toStable) return
    setQuoteStatus('loading')
    setTimeout(() => {
      const mockId = `qte_${Math.random().toString(36).slice(2, 10)}`
      u({
        quoteId: mockId,
        quotedRate: rate.toFixed(6),
        quotedFee: FEE_PCT.toFixed(2),
        quotedReceive: receiveAmt.toFixed(2),
        quoteExpiry: new Date(Date.now() + 30_000).toISOString(),
      })
      setQuoteStatus('ready')
      setQuoteSeconds(30)
    }, 900)
  }

  // Countdown timer for quote
  useEffect(() => {
    if (quoteStatus !== 'ready') return
    const t = setInterval(() => {
      setQuoteSeconds(s => {
        if (s <= 1) { setQuoteStatus('expired'); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [quoteStatus])

  const fromCoin = coinMeta(d.fromStable)
  const toCoin = coinMeta(d.toStable)

  return (
    <div className="space-y-3">
      {/* From / To coin selectors */}
      <CoinSelector label="You send" value={d.fromStable}
        onChange={v => handleCoinChange('fromStable', v)} color={meta.glow} />

      {/* Amount field */}
      <div className="p-2 rounded-xl" style={{
        background: upstreamMax !== null && parseNumericInput(d.amount) > upstreamMax ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.03)',
        border: `1px solid ${upstreamMax !== null && parseNumericInput(d.amount) > upstreamMax ? 'rgba(239,68,68,0.25)' : 'rgba(0,0,0,0.07)'}`,
      }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
            AMOUNT
          </span>
          {upstreamMax !== null && (
            <button
              onClick={() => { u({ amount: formatNumericInput(upstreamMax), quoteId: undefined }); setQuoteStatus('idle') }}
              style={{ fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.04em', color: meta.glow, opacity: 0.7, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              className="hover:opacity-100 transition-opacity"
            >
              MAX {formatNumericInput(upstreamMax)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={d.amount}
            onChange={e => {
              const raw = e.target.value
              const n = parseNumericInput(raw)
              if (upstreamMax !== null && n > upstreamMax) {
                u({ amount: formatNumericInput(upstreamMax), quoteId: undefined })
              } else {
                u({ amount: raw, quoteId: undefined })
              }
              setQuoteStatus('idle')
            }}
            style={{ ...INPUT_BASE, color: meta.glow, fontSize: 13, fontWeight: 600 }}
            placeholder="0.00"
          />
          <span style={{ fontSize: 10, color: meta.glow, fontFamily: 'monospace', fontWeight: 600 }}>
            {d.fromStable}
          </span>
        </div>
      </div>

      {/* Arrow swap */}
      <div className="flex items-center justify-center">
        <button
          onClick={() => { handleCoinChange('fromStable', d.toStable); handleCoinChange('toStable', d.fromStable) }}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110"
          style={{ background: `${meta.glow}18`, border: `1px solid ${meta.glow}33`, color: meta.glow, fontSize: 14 }}
        >
          ⇅
        </button>
      </div>

      <CoinSelector label="You receive" value={d.toStable}
        onChange={v => handleCoinChange('toStable', v)} color={meta.glow} />

      <TenorSelector value={tenor} onChange={v => u({ tenor: v })} color={meta.glow} />

      {/* Schedule / trigger for StableFX */}
      <div className="space-y-2">
        <SwapParentTrigger node={node} d={d} u={u} meta={meta} />
        {/* Date picker — only when trigger is 'date' (default) */}
        {(d.trigger ?? 'date') === 'date' && (
          <div className="p-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
            <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.06em' }}>
              SCHEDULE DATE
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={d.executionDay ?? ''}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => u({ executionDay: e.target.value || undefined, schedule: e.target.value ? 'scheduled' : 'One-time' })}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontFamily: 'Space Mono, monospace', fontSize: 11,
                  color: d.executionDay ? meta.glow : '#94A3B8', cursor: 'pointer',
                }}
              />
              {d.executionDay && (
                <button
                  onClick={() => u({ executionDay: undefined, schedule: 'One-time' })}
                  style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1 }}
                  title="Clear date"
                >
                  ×
                </button>
              )}
            </div>
            {!d.executionDay && (
              <div style={{ fontSize: 8, color: '#CBD5E1', fontFamily: 'monospace', marginTop: 2 }}>
                Leave empty to execute on quote confirmation
              </div>
            )}
            {d.executionDay && (
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                <span style={{ fontSize: 8, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>EXECUTES ON</span>
                <span style={{ fontSize: 10, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>
                  {new Date(d.executionDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quote box */}
      {quoteStatus === 'idle' && (
        <button
          onClick={handleGetQuote}
          disabled={!amount || amount <= 0 || d.fromStable === d.toStable}
          className="w-full py-2.5 rounded-xl text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: (!amount || d.fromStable === d.toStable) ? 'rgba(0,0,0,0.05)' : `${meta.glow}18`,
            border: `1px solid ${(!amount || d.fromStable === d.toStable) ? 'rgba(0,0,0,0.08)' : meta.glow + '44'}`,
            color: (!amount || d.fromStable === d.toStable) ? '#94A3B8' : meta.glow,
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          Get Quote via Circle StableFX
        </button>
      )}

      {quoteStatus === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-3 rounded-xl"
          style={{ background: `${meta.glow}0A`, border: `1px solid ${meta.glow}22` }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${meta.glow}33`, borderTopColor: meta.glow, animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: 11, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif' }}>
            Fetching quote…
          </span>
        </div>
      )}

      {(quoteStatus === 'ready' || quoteStatus === 'expired') && (
        <div className="rounded-xl overflow-hidden"
          style={{ border: `1px solid ${quoteStatus === 'expired' ? '#CBD5E1' : meta.glow + '44'}` }}>
          {/* Quote header */}
          <div className="px-3 py-2 flex items-center justify-between"
            style={{ background: quoteStatus === 'expired' ? 'rgba(0,0,0,0.04)' : `${meta.glow}10` }}>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: quoteStatus === 'expired' ? '#94A3B8' : meta.glow, letterSpacing: '0.06em' }}>
                {quoteStatus === 'expired' ? 'QUOTE EXPIRED' : 'LIVE QUOTE'}
              </span>
              {quoteStatus === 'ready' && (
                <span className="px-1.5 py-0.5 rounded-md"
                  style={{ fontSize: 8, background: '#059669', color: '#fff', fontFamily: 'monospace' }}>
                  LIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {quoteStatus === 'ready' ? (
                <span style={{ fontSize: 10, color: quoteSeconds <= 5 ? '#EF4444' : '#64748B', fontFamily: 'monospace' }}>
                  ⏱ {quoteSeconds}s
                </span>
              ) : (
                <button
                  onClick={handleGetQuote}
                  style={{ fontSize: 9, color: meta.glow, fontFamily: 'monospace', cursor: 'pointer' }}>
                  Refresh ↺
                </button>
              )}
            </div>
          </div>

          {/* Quote details */}
          <div className="px-3 py-2.5 space-y-2" style={{ background: '#FAFBFF' }}>
            {/* Rate */}
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>RATE</span>
              <span style={{ fontSize: 11, color: '#1E293B', fontFamily: 'Space Mono, monospace', fontWeight: 600 }}>
                1 {fromCoin.symbol} = {rate.toFixed(4)} {toCoin.symbol}
              </span>
            </div>

            {/* Fee */}
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>FEE</span>
              <span style={{ fontSize: 10, color: '#64748B', fontFamily: 'Space Mono, monospace' }}>
                {FEE_PCT}% · {feeAmt.toFixed(2)} {fromCoin.symbol}
              </span>
            </div>

            {/* You receive */}
            <div className="flex items-center justify-between pt-1.5"
              style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
              <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>YOU RECEIVE</span>
              <div className="flex items-center gap-1">
                <span style={{ fontSize: 16 }}>{toCoin.flag}</span>
                <span style={{ fontSize: 13, color: meta.glow, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                  {receiveAmt.toFixed(2)} {toCoin.symbol}
                </span>
              </div>
            </div>

            {/* Quote ID */}
            <div style={{ fontSize: 8, color: '#CBD5E1', fontFamily: 'monospace', paddingTop: 2 }}>
              ID: {d.quoteId}
            </div>
          </div>

          {/* Execute button */}
          {quoteStatus === 'ready' && (
            <div className="p-3 pt-0" style={{ background: '#FAFBFF' }}>
              <button
                onClick={onExecute}
                className="w-full py-2.5 rounded-xl text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: meta.glow, color: '#fff', fontFamily: 'Space Grotesk, sans-serif', boxShadow: `0 2px 12px ${meta.glow}44` }}
              >
                {d.trigger === 'after_parent' ? '⚡ Queue After Parent' : (d.schedule && d.schedule !== 'One-time') ? '⏱ Schedule Trade' : 'Execute Trade'} · {fromCoin.flag} {d.amount} {fromCoin.symbol} → {toCoin.flag} {receiveAmt.toFixed(2)} {toCoin.symbol}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Powered by */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'radial-gradient(circle at 36% 30%, #fff 0%, rgba(255,255,255,0.55) 18%, #3B82F6 52%, #1D4ED8 100%)' }} />
        <span style={{ fontSize: 8, color: '#CBD5E1', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
          POWERED BY CIRCLE STABLEFX · ARC BLOCKCHAIN
        </span>
      </div>
    </div>
  )
}

// ─── Swap panel ───────────────────────────────────────────────────────────────

const TOKENS = ['USDC', 'USDT', 'ETH', 'BTC', 'DAI', 'FRAX', 'WETH', 'wstETH']

function SwapPanel({ node }: { node: NodeData }) {
  const d = node.data as SwapData
  const meta = NODE_TYPE_META[node.type]
  const nodes = useGraphStore(s => s.nodes)
  const connections = useGraphStore(s => s.connections)
  const upd = useGraphStore(s => s.updateNodeData)
  const updateNodeValue = useGraphStore(s => s.updateNodeValue)
  const logHistory = useGraphStore(s => s.logHistory)
  const confirmHistoryEntry = useGraphStore(s => s.confirmHistoryEntry)
  const u = (p: Partial<SwapData>) => upd(node.id, p as Record<string, unknown>)

  const [showConfirm, setShowConfirm] = useState(false)

  const fromAssetKey = d.mode === 'crypto' ? d.fromToken : d.fromStable
  const swapUpstreamMax = getUpstreamMax(node.id, fromAssetKey, nodes, connections)

  // Keep the node value label in sync with data changes
  useEffect(() => {
    updateNodeValue(node.id, computeNodeValue(node))
  }, [d.mode, d.amount, d.fromToken, d.toToken, d.fromStable, d.toStable])

  // Compute output destination: look for downstream connections from this swap node
  const outgoingConn = connections.find(c => c.fromNodeId === node.id)
  const outputNode = outgoingConn ? nodes.find(n => n.id === outgoingConn.toNodeId) : null
  const fundingWalletForLabel = findFundingWallet(node.id, nodes, connections)
  const outputLabel = outputNode
    ? outputNode.label
    : fundingWalletForLabel
      ? `${fundingWalletForLabel.label} (default)`
      : 'Source wallet (default)'

  const handleExecute = () => {
    setShowConfirm(false)
    const fromAsset = d.mode === 'crypto' ? d.fromToken : d.fromStable
    const toAsset = d.mode === 'crypto' ? d.toToken : d.toStable
    const inputAmount = parseNumericInput(d.amount)
    const receiveAmount = d.quotedReceive ? parseNumericInput(d.quotedReceive) : inputAmount * fxRate(d.fromStable, d.toStable)

    const fundingWallet = findFundingWallet(node.id, nodes, connections)
    if (fundingWallet && inputAmount > 0) {
      applyWalletDeltas(
        fundingWallet,
        { [fromAsset]: -inputAmount, [toAsset]: receiveAmount },
        upd,
        updateNodeValue,
      )
    }

    const fromCoin = coinMeta(d.fromStable)
    const toCoin = coinMeta(d.toStable)
    const label = d.mode === 'crypto'
      ? `Swapping ${d.amount} ${d.fromToken} → ${d.toToken}…`
      : `${fromCoin.flag} ${d.amount} ${fromCoin.symbol} → ${toCoin.flag} ${receiveAmount.toFixed(2)} ${toCoin.symbol}…`
    const detail = d.mode === 'stableFX'
      ? `Tenor: ${d.tenor ?? 'instant'} · Quote: ${d.quoteId ?? 'N/A'} · Fee: ${FEE_PCT}%`
      : undefined

    const histId = logHistory({
      kind: 'swap_executed',
      label,
      status: 'loading',
      amount: d.mode === 'stableFX' ? `${d.amount} ${fromCoin.symbol}` : d.amount,
      detail,
    })
    setTimeout(() => confirmHistoryEntry(histId), 2200)
    // Clear quote
    u({ quoteId: undefined, quotedRate: undefined, quotedReceive: undefined, quoteExpiry: undefined })
  }

  return (
    <>
      <div className="space-y-2">
        <ModeToggle
          value={d.mode}
          onChange={v => u({ mode: v })}
          options={[{ value: 'crypto', label: 'Crypto Swap' }, { value: 'stableFX', label: 'Stable FX' }]}
          color={meta.glow}
        />

        {/* Output destination */}
        <div className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: `${meta.glow}0D`, border: `1px solid ${meta.glow}22` }}>
          <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', flexShrink: 0 }}>OUTPUT →</span>
          <span style={{ fontSize: 10, color: outputNode ? meta.glow : '#94A3B8', fontFamily: 'Space Mono, monospace',
            fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {outputLabel}
          </span>
          {!outputNode && (
            <span style={{ fontSize: 8, color: '#94A3B8', fontFamily: 'monospace', flexShrink: 0, fontStyle: 'italic' }}>
              Connect a node to override
            </span>
          )}
        </div>

        {d.mode === 'crypto' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" value={d.fromToken} onChange={v => u({ fromToken: v })} type="select" options={TOKENS} color={meta.glow} />
              <Field label="To" value={d.toToken} onChange={v => u({ toToken: v })} type="select" options={TOKENS} color={meta.glow} />
              <AmountField label="Amount" value={d.amount} onChange={v => u({ amount: v })} color={meta.glow} upstreamMax={swapUpstreamMax} />
              <Field label="Slippage %" value={d.slippage} onChange={v => u({ slippage: v })} type="number" min={0} max={10} step={0.1} />
            </div>
            <Field label="Exchange rate" value={d.rate} onChange={v => u({ rate: v })} />
            <SectionDivider label="TIME LOCK" />
            <Toggle label="Time-lock swap" checked={!!d.timeLocked} onChange={v => u({ timeLocked: v })} />
            {d.timeLocked && <Field label="Unlock date" value={d.lockTime ?? ''} onChange={v => u({ lockTime: v })} type="date" />}
            <SectionDivider label="SCHEDULE" />
            <SchedulePicker
              schedule={d.schedule ?? 'One-time'}
              executionDay={d.executionDay}
              onScheduleChange={v => u({ schedule: v, executionDay: undefined, trigger: undefined })}
              onDayChange={v => u({ executionDay: v })}
              color={meta.glow}
            />
            {(!d.schedule || d.schedule === 'One-time') && (
              <SwapParentTrigger node={node} d={d} u={u} meta={meta} />
            )}
            <SectionDivider />
            <ActionBtn onClick={() => setShowConfirm(true)} color={meta.glow} variant="solid">
              {d.trigger === 'after_parent' ? '⚡ Queue After Parent' : (d.schedule && d.schedule !== 'One-time') ? '⏱ Schedule Swap' : '⇄ Execute Swap'}
            </ActionBtn>
            {/* Uniswap branding */}
            <div className="flex items-center justify-center gap-1.5 pt-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9.34 3.17c.32.07.58.19.8.35L10.5 3.7a4.3 4.3 0 0 1 .63.76c.16.27.24.57.24.89 0 .6-.21 1.1-.63 1.5-.42.4-.95.6-1.6.6-.44 0-.83-.1-1.17-.3a2.18 2.18 0 0 1-.8-.83 2.3 2.3 0 0 1-.29-1.14c0-.38.08-.72.25-1.03.17-.3.4-.56.7-.74.3-.19.64-.28 1.02-.28l.49.04zM7.7 9.07c.4.53.77 1.16 1.09 1.88.33.72.55 1.42.67 2.1.54-.96 1.08-1.84 1.62-2.63.55-.8 1.12-1.5 1.72-2.13.6-.62 1.2-1.1 1.79-1.43.6-.33 1.2-.5 1.82-.5.56 0 1.08.13 1.56.38.47.25.86.62 1.16 1.1.3.48.47 1.06.5 1.74.03.48 0 .97-.09 1.48l-.18.94c-.3 1.5-.55 2.76-.74 3.78a8.08 8.08 0 0 0-.2 1.82c0 .48.1.85.28 1.12.19.27.46.4.82.4.3 0 .6-.09.89-.26.3-.17.57-.43.83-.8l.58.44a4.35 4.35 0 0 1-1.44 1.44c-.57.34-1.17.51-1.8.51-.63 0-1.18-.15-1.63-.46a2.9 2.9 0 0 1-1.01-1.3 4.97 4.97 0 0 1-.35-1.89c0-.6.06-1.22.17-1.88l.56-3.1.15-.97c.05-.32.07-.6.07-.83 0-.48-.1-.87-.32-1.17a1.03 1.03 0 0 0-.87-.44c-.42 0-.88.18-1.37.55-.5.37-1 .9-1.5 1.58-.5.68-1 1.49-1.48 2.43-.49.94-.95 1.97-1.39 3.1l-.5 1.4c-.27.76-.5 1.42-.71 1.96a8.34 8.34 0 0 1-.6 1.33c-.21.36-.43.62-.65.78-.22.16-.47.24-.76.24-.2 0-.39-.06-.56-.17a1.23 1.23 0 0 1-.41-.5 2.58 2.58 0 0 1-.23-.82 8.44 8.44 0 0 1-.08-1.2c0-.95.1-2.04.3-3.28l.35-2.12.3-1.85a12 12 0 0 0 .15-1.7c0-.38-.05-.68-.16-.9a.55.55 0 0 0-.5-.32c-.27 0-.56.12-.86.37-.3.25-.6.61-.9 1.08l-.57-.4c.35-.62.78-1.13 1.29-1.53.5-.4 1.04-.6 1.62-.6.52 0 .96.14 1.32.43.37.29.65.72.85 1.3z" fill="#FF007A"/>
              </svg>
              <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                Powered by Uniswap
              </span>
            </div>
          </>
        ) : (
          <StableFXPanel node={node} d={d} u={u} meta={meta} onExecute={handleExecute} upstreamMax={swapUpstreamMax} />
        )}
      </div>

      <AnimatePresence>
        {showConfirm && d.mode === 'crypto' && (
          <ConfirmDialog
            title="Confirm Swap Execution"
            confirmLabel="Execute Swap"
            confirmColor={meta.glow}
            onCancel={() => setShowConfirm(false)}
            onConfirm={handleExecute}
            body={
              <div>
                <p className="mb-3" style={{ color: '#475569' }}>
                  Are you sure you want to execute this swap?
                </p>
                <div className="rounded-xl p-3 space-y-1.5" style={{ background: `${meta.glow}0D`, border: `1px solid ${meta.glow}22` }}>
                  <Row label="From" value={`${d.amount} ${d.fromToken}`} color={meta.glow} />
                  <Row label="To" value={d.toToken} color={meta.glow} />
                  <Row label="Rate" value={d.rate} />
                  <Row label="Slippage" value={`${d.slippage}%`} />
                </div>
              </div>
            }
          />
        )}
      </AnimatePresence>
    </>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ fontSize: 11, color: color ?? '#1E293B', fontFamily: 'Space Mono, monospace', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

// ─── Yield panel ──────────────────────────────────────────────────────────────

const USYC_APPLY_LINK = 'https://help.circle.com/s/article/Investor-Onboarding?category=With_USYC&language=en_US'
const USYC_PORTAL_DOCS_LINK = 'https://developers.circle.com/tokenized/usyc/subscribe-and-redeem-portal'
const USYC_CONTRACT_DOCS_LINK = 'https://developers.circle.com/tokenized/usyc/subscribe-and-redeem'
const USYC_REDEMPTION_CHAINS = ['Arc', 'Ethereum', 'BSC', 'Solana']
const USYC_CONTACT_MAILTO = 'mailto:alexleereid@gmail.com?subject=Already%20whitelisted%20for%20USYC&body=Hi%20Sphere%20team%2C%20I%20am%20already%20whitelisted%20for%20USYC%20and%20need%20help%20connecting%20my%20account.'

function YieldPanel({ node }: { node: NodeData }) {
  const d = node.data as YieldData
  const meta = NODE_TYPE_META[node.type]
  const nodes = useGraphStore(s => s.nodes)
  const upd = useGraphStore(s => s.updateNodeData)
  const updateNodeValue = useGraphStore(s => s.updateNodeValue)
  const spawnAsteroid = useGraphStore(s => s.spawnAsteroid)
  const connections = useGraphStore(s => s.connections)
  const logHistory = useGraphStore(s => s.logHistory)
  const confirmHistoryEntry = useGraphStore(s => s.confirmHistoryEntry)
  const u = (p: Partial<YieldData>) => upd(node.id, p as Record<string, unknown>)

  useEffect(() => {
    updateNodeValue(node.id, computeNodeValue(node))
  }, [d.mode, d.apy, d.currentYield])
  const yieldUpstreamMax = getUpstreamMax(node.id, d.idleAsset ?? 'USDC', nodes, connections)

  const demoWallet = nodes.find(n => n.id === 'wallet_anchor' && n.type === 'wallet')
  const demoWalletAddress = demoWallet && demoWallet.type === 'wallet'
    ? (demoWallet.data as WalletData).address
    : '0x7f3a…d92b'
  const whitelistGranted = d.whitelistGranted ?? true
  const redemptionFlow = d.redemptionFlow ?? 'portal'
  const redemptionSourceChain = d.redemptionSourceChain ?? 'Arc'
  const redemptionDestinationChain = d.redemptionDestinationChain ?? 'Arc'

  const trigger = d.trigger ?? 'date'
  const incomingConn = connections.find(c => c.toNodeId === node.id)
  const parentNode = incomingConn ? nodes.find(n => n.id === incomingConn.fromNodeId) : null
  const parentIsScheduled = parentNode && (parentNode.type === 'swap' || parentNode.type === 'yield' || parentNode.type === 'distribute' || parentNode.type === 'wallet')

  const [showHarvestConfirm, setShowHarvestConfirm] = useState(false)
  const [showDeployConfirm, setShowDeployConfirm] = useState(false)
  const [showDeployUsdcConfirm, setShowDeployUsdcConfirm] = useState(false)
  const [showRedeemConfirm, setShowRedeemConfirm] = useState(false)

  const handleHarvest = () => {
    setShowHarvestConfirm(false)
    const out = connections.find(c => c.fromNodeId === node.id)
    if (out) spawnAsteroid(node.id, out.toNodeId, `${d.accruedYield} USDC`)
    const histId = logHistory({
      kind: 'yield_harvested',
      label: `Harvesting ${d.accruedYield} USDC yield…`,
      status: 'loading',
      amount: d.accruedYield,
    })
    setTimeout(() => confirmHistoryEntry(histId), 2200)
  }

  const handleDeploy = () => {
    setShowDeployConfirm(false)
    const histId = logHistory({
      kind: 'yield_deployed',
      label: `Deploying ${d.amount} ${d.idleAsset} to USYC…`,
      status: 'loading',
      amount: d.amount,
      detail: `Maturity: ${d.maturityDate === 'forever' ? '∞ Forever' : d.maturityDate} · ${d.currentYield}% yield`,
    })
    setTimeout(() => confirmHistoryEntry(histId), 2000)
  }

  const handleDeployUsdc = () => {
    setShowDeployUsdcConfirm(false)
    const out = connections.find(c => c.fromNodeId === node.id)
    if (out) spawnAsteroid(node.id, out.toNodeId, `${d.amount} USDC`)
    const histId = logHistory({
      kind: 'yield_deployed_usdc',
      label: `Deploying ${d.amount} USDC after parent executes…`,
      status: 'loading',
      amount: `${d.amount} USDC`,
      detail: parentNode ? `Triggers after ${parentNode.label} completes` : 'Queued after parent task',
    })
    setTimeout(() => confirmHistoryEntry(histId), 2200)
  }

  const handleRedeem = () => {
    setShowRedeemConfirm(false)
    const amount = (d.redemptionAmount?.trim() || d.amount).trim()
    const flow = d.redemptionFlow ?? 'portal'
    const source = d.redemptionSourceChain ?? 'Ethereum'
    const destination = d.redemptionDestinationChain ?? 'Ethereum'
    const feeBps = d.redemptionFeeBps ?? '5'

    const histId = logHistory({
      kind: 'usyc_redeemed',
      label: flow === 'portal'
        ? `Redeeming ${amount} USYC via Circle Portal…`
        : `Redeeming ${amount} USYC via teller.redeem(…)…`,
      status: 'loading',
      amount: `${amount} USYC`,
      detail: flow === 'portal'
        ? `Portal flow: ${source} -> ${destination} · Receiver: ${demoWalletAddress} · Includes fee review`
        : `Contract flow: teller.redeem(shareAmt, receiver, owner, sourceChainId, destinationChainId, fee, allowListProofs) · fee ${feeBps} bps`,
    })
    setTimeout(() => confirmHistoryEntry(histId), 2400)
  }

  return (
    <>
      <div className="space-y-2">
        <ModeToggle
          value={d.mode}
          onChange={v => u({ mode: v })}
          options={[{ value: 'defi', label: 'DeFi Yield' }, { value: 'rwa', label: 'RWA / USYC' }]}
          color={meta.glow}
        />

        {d.mode === 'defi' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="APY %" value={d.apy} onChange={v => u({ apy: v })} type="number" step={0.1} color={meta.glow} />
              <Field label="Accrued $" value={d.accruedYield} onChange={v => u({ accruedYield: v })} color={meta.glow} />
            </div>
            <Toggle label="Auto-compound" checked={d.autoCompound} onChange={v => u({ autoCompound: v })} />
            <SectionDivider />
            <ActionBtn onClick={() => setShowHarvestConfirm(true)} color={meta.glow} variant="solid">
              ↗ Harvest Yield → Wallet
            </ActionBtn>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Idle asset" value={d.idleAsset} onChange={v => u({ idleAsset: v })}
                type="select" options={['USDC', 'USDT', 'DAI']} color={meta.glow} />
              <AmountField label="Amount $" value={d.amount} onChange={v => u({ amount: v })} color={meta.glow} upstreamMax={yieldUpstreamMax} />
              <Field label="Yield %" value={d.currentYield} onChange={v => u({ currentYield: v })} type="number" step={0.01} color={meta.glow} />
            </div>
            <div className="rounded-xl p-3 space-y-2" style={{ background: `${meta.glow}10`, border: `1px solid ${meta.glow}2E` }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', letterSpacing: '0.05em' }}>USYC ACCESS</span>
                <span
                  className="px-2 py-0.5 rounded-md"
                  style={{
                    fontSize: 8,
                    fontFamily: 'monospace',
                    letterSpacing: '0.05em',
                    background: whitelistGranted ? 'rgba(5,150,105,0.14)' : 'rgba(239,68,68,0.14)',
                    color: whitelistGranted ? '#059669' : '#DC2626',
                  }}
                >
                  {whitelistGranted ? 'WHITELISTED' : 'ACCESS REQUIRED'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#64748B', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1.4 }}>
                Demo wallet <span style={{ fontFamily: 'Space Mono, monospace', color: '#334155' }}>{demoWalletAddress}</span> has whitelist access for USYC.
              </div>
              <div className="flex items-center justify-between gap-2">
                <a
                  href={USYC_APPLY_LINK}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 10, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif', textDecoration: 'underline' }}
                >
                  Apply for whitelist access
                </a>
                <a
                  href={USYC_CONTACT_MAILTO}
                  style={{ fontSize: 10, color: '#0369A1', fontFamily: 'Space Grotesk, sans-serif', textDecoration: 'underline' }}
                >
                  Already whitelisted? Contact our team
                </a>
              </div>
            </div>

            <SectionDivider label="USYC REDEMPTION" />
            <ModeToggle
              value={redemptionFlow}
              onChange={v => u({ redemptionFlow: v })}
              options={[{ value: 'portal', label: 'Portal' }, { value: 'contracts', label: 'Contracts' }]}
              color={meta.glow}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Source chain"
                value={redemptionSourceChain}
                onChange={v => u({ redemptionSourceChain: v })}
                type="select"
                options={USYC_REDEMPTION_CHAINS}
              />
              <Field
                label="Destination chain"
                value={redemptionDestinationChain}
                onChange={v => u({ redemptionDestinationChain: v })}
                type="select"
                options={USYC_REDEMPTION_CHAINS}
              />
            </div>
            <div className="rounded-xl p-2.5 space-y-1.5" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
              <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                {redemptionFlow === 'portal' ? 'PORTAL PROCESS (CIRCLE DOCS)' : 'CONTRACT PROCESS (CIRCLE DOCS)'}
              </div>
              {redemptionFlow === 'portal' ? (
                <>
                  <div style={{ fontSize: 10, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' }}>1. Enter USYC redemption amount.</div>
                  <div style={{ fontSize: 10, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' }}>2. Select source and destination chains plus recipient wallet.</div>
                  <div style={{ fontSize: 10, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' }}>3. Review fees and confirm redemption in the portal.</div>
                  <a href={USYC_PORTAL_DOCS_LINK} target="_blank" rel="noreferrer"
                    style={{ fontSize: 10, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif', textDecoration: 'underline' }}>
                    Open Portal quickstart docs
                  </a>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 10, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' }}>1. Prepare allowlist proof and redemption inputs.</div>
                  <div style={{ fontSize: 10, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' }}>2. Call `teller.redeem(shareAmt, receiver, owner, sourceChainId, destinationChainId, fee, allowListProofs)`.</div>
                  <div style={{ fontSize: 10, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' }}>3. Wait for settlement and destination-chain delivery.</div>
                  <a href={USYC_CONTRACT_DOCS_LINK} target="_blank" rel="noreferrer"
                    style={{ fontSize: 10, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif', textDecoration: 'underline' }}>
                    Open contracts quickstart docs
                  </a>
                </>
              )}
            </div>
            <SectionDivider label="CONVERSION PROGRESS" />
            <Slider label="Progress" value={d.conversionProgress} min={0} max={100} step={1}
              onChange={v => u({ conversionProgress: v })} formatVal={v => `${v}%`} color={meta.glow} />

            <SectionDivider label="DEPLOY TRIGGER" />
            <div className="flex gap-1.5">
              <button
                onClick={() => u({ trigger: 'date' })}
                className="flex-1 py-1.5 rounded-lg text-center transition-all duration-150"
                style={{
                  background: trigger === 'date' ? meta.glow : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${trigger === 'date' ? meta.glow : 'rgba(0,0,0,0.08)'}`,
                  color: trigger === 'date' ? '#fff' : '#64748B',
                  fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                }}
              >
                📅 On schedule
              </button>
              <button
                onClick={() => u({ trigger: 'after_parent' })}
                className="flex-1 py-1.5 rounded-lg text-center transition-all duration-150"
                style={{
                  background: trigger === 'after_parent' ? meta.glow : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${trigger === 'after_parent' ? meta.glow : 'rgba(0,0,0,0.08)'}`,
                  color: trigger === 'after_parent' ? '#fff' : '#64748B',
                  fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                }}
              >
                ⚡ After parent
              </button>
            </div>

            {trigger === 'after_parent' && (
              <div className="px-3 py-2.5 rounded-xl space-y-1"
                style={{ background: `${meta.glow}0A`, border: `1px solid ${meta.glow}22` }}>
                {parentIsScheduled ? (
                  <>
                    <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                      DEPLOYS TO USDC AFTER
                    </div>
                    <div className="flex items-center gap-2">
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: `radial-gradient(circle at 36% 28%, #fff 0%, rgba(255,255,255,0.55) 18%, ${NODE_TYPE_META[parentNode!.type].color2} 52%, ${NODE_TYPE_META[parentNode!.type].color1} 100%)`,
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 11, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>
                        {parentNode!.label}
                      </span>
                      <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>completes</span>
                    </div>
                    <div style={{ fontSize: 8, color: '#94A3B8', fontFamily: 'monospace', paddingTop: 2 }}>
                      Deploys {d.amount} {d.idleAsset} → USDC after parent finalises
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace', textAlign: 'center', padding: '4px 0' }}>
                    Connect a node upstream to use this trigger
                  </div>
                )}
              </div>
            )}

            <SectionDivider />
            {trigger === 'after_parent' ? (
              <ActionBtn
                onClick={() => setShowDeployUsdcConfirm(true)}
                color={meta.glow}
                variant="solid"
              >
                ⚡ Deploy to USDC · After Parent
              </ActionBtn>
            ) : (
              <ActionBtn onClick={() => setShowDeployConfirm(true)} color={meta.glow} variant="solid">
                ↗ Deploy to USYC
              </ActionBtn>
            )}
            <button
              onClick={() => setShowRedeemConfirm(true)}
              disabled={!whitelistGranted || parseNumericInput(d.amount) <= 0}
              className="w-full py-2 rounded-xl text-xs font-semibold transition-all duration-150"
              style={{
                background: (!whitelistGranted || parseNumericInput(d.amount) <= 0) ? 'rgba(0,0,0,0.05)' : '#0369A1',
                border: '1px solid rgba(0,0,0,0.08)',
                color: (!whitelistGranted || parseNumericInput(d.amount) <= 0) ? '#94A3B8' : '#fff',
                fontFamily: 'Space Grotesk, sans-serif',
                boxShadow: (!whitelistGranted || parseNumericInput(d.amount) <= 0) ? 'none' : '0 2px 10px rgba(3,105,161,0.35)',
                cursor: (!whitelistGranted || parseNumericInput(d.amount) <= 0) ? 'not-allowed' : 'pointer',
              }}
            >
              ↓ Redeem USYC (UI)
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {showHarvestConfirm && (
          <ConfirmDialog
            title="Confirm Yield Harvest"
            confirmLabel="Harvest Now"
            confirmColor={meta.glow}
            onCancel={() => setShowHarvestConfirm(false)}
            onConfirm={handleHarvest}
            body={
              <div>
                <p className="mb-3" style={{ color: '#475569' }}>
                  Send accrued yield to the connected wallet?
                </p>
                <div className="rounded-xl p-3" style={{ background: `${meta.glow}0D`, border: `1px solid ${meta.glow}22` }}>
                  <Row label="Accrued yield" value={`${d.accruedYield} USDC`} color={meta.glow} />
                  <Row label="APY" value={`${d.apy}%`} />
                </div>
              </div>
            }
          />
        )}
        {showDeployConfirm && (
          <ConfirmDialog
            title="Confirm USYC Deployment"
            confirmLabel="Deploy to USYC"
            confirmColor={meta.glow}
            onCancel={() => setShowDeployConfirm(false)}
            onConfirm={handleDeploy}
            body={
              <div>
                <p className="mb-3" style={{ color: '#475569' }}>
                  Deploy idle assets into USYC for yield?
                </p>
                <div className="rounded-xl p-3 space-y-1.5" style={{ background: `${meta.glow}0D`, border: `1px solid ${meta.glow}22` }}>
                  <Row label="Asset" value={d.idleAsset} />
                  <Row label="Amount" value={`$${d.amount}`} color={meta.glow} />
                  <Row label="Expected yield" value={`${d.currentYield}%`} color={meta.glow} />
                </div>
              </div>
            }
          />
        )}
        {showDeployUsdcConfirm && (
          <ConfirmDialog
            title="Deploy to USDC — After Parent"
            confirmLabel="⚡ Queue Deploy"
            confirmColor={meta.glow}
            onCancel={() => setShowDeployUsdcConfirm(false)}
            onConfirm={handleDeployUsdc}
            body={
              <div>
                <p className="mb-3" style={{ color: '#475569' }}>
                  Deploy to USDC once the parent task completes?
                </p>
                <div className="rounded-xl p-3 space-y-1.5" style={{ background: `${meta.glow}0D`, border: `1px solid ${meta.glow}22` }}>
                  <Row label="Asset" value={d.idleAsset} />
                  <Row label="Amount" value={`$${d.amount}`} color={meta.glow} />
                  <Row label="Target" value="USDC" color={meta.glow} />
                  {parentNode && <Row label="After" value={parentNode.label} />}
                </div>
              </div>
            }
          />
        )}
        {showRedeemConfirm && (
          <ConfirmDialog
            title="Confirm USYC Redemption"
            confirmLabel="Redeem USYC"
            confirmColor="#0369A1"
            onCancel={() => setShowRedeemConfirm(false)}
            onConfirm={handleRedeem}
            body={
              <div>
                <p className="mb-3" style={{ color: '#475569' }}>
                  Execute the {redemptionFlow === 'portal' ? 'portal' : 'contracts'} redemption process now?
                </p>
                <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(3,105,161,0.08)', border: '1px solid rgba(3,105,161,0.22)' }}>
                  <Row label="Amount" value={`${d.amount} USYC`} color="#0369A1" />
                  <Row label="Source chain" value={redemptionSourceChain} />
                  <Row label="Destination chain" value={redemptionDestinationChain} />
                  <Row label="Receiver" value={demoWalletAddress} />
                  <Row label="Flow" value={redemptionFlow === 'portal' ? 'Circle Portal' : 'teller.redeem(...)'} />
                </div>
              </div>
            }
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Scheduling helpers ───────────────────────────────────────────────────────

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const ALL_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function computeNextDate(schedule: string, executionDay?: string): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (schedule === 'One-time') return 'As scheduled'

  if (schedule === 'Daily') {
    const next = new Date(today)
    next.setDate(next.getDate() + 1)
    return next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (schedule === 'Weekly' || schedule === 'Biweekly') {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const target = executionDay ?? 'Monday'
    const targetIdx = dayNames.indexOf(target)
    const curIdx = today.getDay()
    let diff = targetIdx - curIdx
    if (diff <= 0) diff += schedule === 'Biweekly' ? 14 : 7
    const next = new Date(today)
    next.setDate(next.getDate() + diff)
    return next.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (schedule === 'Monthly' || schedule === 'Quarterly') {
    const dayOfMonth = Math.min(Math.max(parseInt(executionDay ?? '1') || 1, 1), 28)
    const monthsAhead = schedule === 'Quarterly' ? 3 : 1
    let next = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
    if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + monthsAhead, dayOfMonth)
    return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  return 'N/A'
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function SchedulePicker({
  schedule, executionDay, onScheduleChange, onDayChange, color,
}: {
  schedule: string
  executionDay?: string
  onScheduleChange: (v: string) => void
  onDayChange: (v: string) => void
  color: string
}) {
  const isWeekly = schedule === 'Weekly' || schedule === 'Biweekly'
  const isMonthly = schedule === 'Monthly' || schedule === 'Quarterly'
  const nextDate = computeNextDate(schedule, executionDay)
  const dayNum = parseInt(executionDay ?? '1') || 1

  return (
    <div className="space-y-2">
      {/* Frequency */}
      <div className="p-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
        <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 3, letterSpacing: '0.06em' }}>
          FREQUENCY
        </div>
        <select
          value={schedule}
          onChange={e => onScheduleChange(e.target.value)}
          style={{ background: 'transparent', border: 'none', outline: 'none', fontFamily: 'Space Mono, monospace', fontSize: 11, width: '100%', padding: 0, color: '#1E293B', cursor: 'pointer' }}
        >
          {['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'One-time'].map(o => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>

      {/* Execution day picker */}
      {isWeekly && (
        <div className="p-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.06em' }}>
            DAY OF WEEK
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_WEEKDAYS.map(day => (
              <button
                key={day}
                onClick={() => onDayChange(day)}
                className="px-2 py-1 rounded-lg text-center transition-all"
                style={{
                  fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.04em',
                  background: (executionDay ?? 'Monday') === day ? color : 'rgba(0,0,0,0.04)',
                  color: (executionDay ?? 'Monday') === day ? '#fff' : '#64748B',
                  border: `1px solid ${(executionDay ?? 'Monday') === day ? color : 'transparent'}`,
                }}
              >
                {day.slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {isMonthly && (
        <div className="p-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.06em' }}>
            DAY OF MONTH
          </div>
          <div className="flex flex-wrap gap-1">
            {[1,5,10,15,20,25,28].map(day => (
              <button
                key={day}
                onClick={() => onDayChange(String(day))}
                className="px-2 py-1 rounded-lg transition-all"
                style={{
                  fontSize: 8, fontFamily: 'monospace',
                  background: dayNum === day ? color : 'rgba(0,0,0,0.04)',
                  color: dayNum === day ? '#fff' : '#64748B',
                  border: `1px solid ${dayNum === day ? color : 'transparent'}`,
                  minWidth: 28, textAlign: 'center',
                }}
              >
                {ordinal(day)}
              </button>
            ))}
            {/* Custom day input */}
            <input
              type="number"
              min={1}
              max={28}
              value={executionDay ?? '1'}
              onChange={e => onDayChange(e.target.value)}
              className="px-2 py-1 rounded-lg"
              style={{
                fontSize: 8, fontFamily: 'monospace', color: '#64748B', width: 36, textAlign: 'center',
                background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', outline: 'none',
              }}
              placeholder="Day"
            />
          </div>
        </div>
      )}

      {/* Next execution date */}
      {schedule !== 'One-time' && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl"
          style={{ background: `${color}0A`, border: `1px solid ${color}22` }}>
          <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
            NEXT PAYMENT
          </span>
          <span style={{ fontSize: 10, color, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>
            {nextDate}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── One-time trigger sub-section (for Distribute) ────────────────────────────

function OneTimeTrigger({
  node, d, u, meta,
}: {
  node: NodeData
  d: DistributeData
  u: (p: Partial<DistributeData>) => void
  meta: typeof NODE_TYPE_META[keyof typeof NODE_TYPE_META]
}) {
  const nodes = useGraphStore(s => s.nodes)
  const connections = useGraphStore(s => s.connections)
  const trigger = d.trigger ?? 'date'

  // Find direct parent node (first incoming connection's source)
  const incomingConn = connections.find(c => c.toNodeId === node.id)
  const parentNode = incomingConn ? nodes.find(n => n.id === incomingConn.fromNodeId) : null
  const parentIsScheduled = parentNode && (parentNode.type === 'swap' || parentNode.type === 'yield' || parentNode.type === 'distribute')

  return (
    <div className="space-y-2">
      {/* Trigger type selector */}
      <div className="p-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
        <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.06em' }}>
          EXECUTE WHEN
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => u({ trigger: 'date' })}
            className="flex-1 py-1.5 rounded-lg text-center transition-all duration-150"
            style={{
              background: trigger === 'date' ? meta.glow : 'rgba(0,0,0,0.03)',
              border: `1px solid ${trigger === 'date' ? meta.glow : 'rgba(0,0,0,0.08)'}`,
              color: trigger === 'date' ? '#fff' : '#64748B',
              fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
            }}
          >
            📅 On date
          </button>
          <button
            onClick={() => u({ trigger: 'after_parent' })}
            className="flex-1 py-1.5 rounded-lg text-center transition-all duration-150"
            style={{
              background: trigger === 'after_parent' ? meta.glow : 'rgba(0,0,0,0.03)',
              border: `1px solid ${trigger === 'after_parent' ? meta.glow : 'rgba(0,0,0,0.08)'}`,
              color: trigger === 'after_parent' ? '#fff' : '#64748B',
              fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
            }}
          >
            ⚡ After parent
          </button>
        </div>
      </div>

      {/* Date picker */}
      {trigger === 'date' && (
        <Field
          label="Execution date"
          value={d.oneTimeDate ?? ''}
          onChange={v => u({ oneTimeDate: v })}
          type="date"
          color={meta.glow}
        />
      )}

      {/* After parent info */}
      {trigger === 'after_parent' && (
        <div className="px-3 py-2.5 rounded-xl space-y-1"
          style={{ background: `${meta.glow}0A`, border: `1px solid ${meta.glow}22` }}>
          {parentIsScheduled ? (
            <>
              <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                TRIGGERS AFTER
              </div>
              <div className="flex items-center gap-2">
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: `radial-gradient(circle at 36% 28%, #fff 0%, rgba(255,255,255,0.55) 18%, ${NODE_TYPE_META[parentNode!.type].color2} 52%, ${NODE_TYPE_META[parentNode!.type].color1} 100%)`,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>
                  {parentNode!.label}
                </span>
                <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>
                  completes
                </span>
              </div>
              <div style={{ fontSize: 8, color: '#94A3B8', fontFamily: 'monospace', paddingTop: 2 }}>
                Executes immediately after the parent action finalises
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace', textAlign: 'center', padding: '4px 0' }}>
              Connect a swap, yield, or distribute node upstream to use this trigger
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Distribute panel ─────────────────────────────────────────────────────────

function DistributePanel({ node }: { node: NodeData }) {
  const d = node.data as DistributeData
  const meta = NODE_TYPE_META[node.type]
  const nodes = useGraphStore(s => s.nodes)
  const connections = useGraphStore(s => s.connections)
  const upd = useGraphStore(s => s.updateNodeData)
  const updateNodeValue = useGraphStore(s => s.updateNodeValue)
  const updateNodeLabel = useGraphStore(s => s.updateNodeLabel)
  const logHistory = useGraphStore(s => s.logHistory)
  const confirmHistoryEntry = useGraphStore(s => s.confirmHistoryEntry)
  const u = (p: Partial<DistributeData>) => upd(node.id, p as Record<string, unknown>)
  const setR = (i: number, field: string, val: string) =>
    u({ recipients: d.recipients.map((r, idx) => idx === i ? { ...r, [field]: val } : r) })
  const distUpstreamMax = getUpstreamMax(node.id, d.currency, nodes, connections)
  const upstreamAsset = getUpstreamAsset(node.id, nodes, connections)

  // Auto-default currency to match upstream node's output asset
  useEffect(() => {
    if (upstreamAsset && upstreamAsset !== d.currency) {
      u({ currency: upstreamAsset })
    }
  }, [upstreamAsset])

  useEffect(() => {
    updateNodeValue(node.id, computeNodeValue(node))
  }, [d.totalAmount, d.schedule])

  const [showConfirm, setShowConfirm] = useState(false)

  const handlePayNow = () => {
    setShowConfirm(false)
    const fundingWallet = findFundingWallet(node.id, nodes, connections)
    const totalAmount = parseNumericInput(d.totalAmount)
    if (fundingWallet && totalAmount > 0) {
      applyWalletDeltas(
        fundingWallet,
        { [d.currency]: -totalAmount },
        upd,
        updateNodeValue,
      )
    }

    const addresses = d.recipients.map(r => r.address)
    const histId = logHistory({
      kind: 'distribution_sent',
      label: `Sending ${d.totalAmount} ${d.currency} to ${d.recipients.length} recipient${d.recipients.length !== 1 ? 's' : ''}…`,
      status: 'loading',
      amount: `${d.totalAmount} ${d.currency}`,
      addresses,
      detail: d.recipients.map(r => `${r.name}: ${r.amount} ${d.currency}`).join(' · '),
    })
    setTimeout(() => confirmHistoryEntry(histId), 2200)
  }

  return (
    <>
      <div className="space-y-2">
        <ModeToggle
          value={d.mode}
          onChange={v => u({ mode: v })}
          options={[
            { value: 'payroll', label: 'Payroll' },
            { value: 'transfer', label: 'Transfer' },
            { value: 'split', label: 'Split' },
          ]}
          color={meta.glow}
        />

        <div className="grid grid-cols-2 gap-2">
          <AmountField label="Total amount" value={d.totalAmount} onChange={v => u({ totalAmount: v })} color={meta.glow} upstreamMax={distUpstreamMax} />
          <Field label="Currency" value={d.currency} onChange={v => u({ currency: v })}
            type="select" options={(() => {
              const base = ['USDC', 'USDT', 'EURC', 'DAI', 'ETH']
              if (upstreamAsset && !base.includes(upstreamAsset)) base.splice(1, 0, upstreamAsset)
              return base
            })()} color={meta.glow} />
        </div>

        {d.mode === 'payroll' && (
          <>
            <SchedulePicker
              schedule={d.schedule}
              executionDay={d.executionDay}
              onScheduleChange={v => u({ schedule: v, executionDay: undefined })}
              onDayChange={v => u({ executionDay: v })}
              color={meta.glow}
            />
            {d.schedule === 'One-time' && (
              <OneTimeTrigger node={node} d={d} u={u} meta={meta} />
            )}
            <SectionDivider label="RECIPIENTS" />
            {d.recipients.map((r, i) => (
              <div key={i} className="rounded-xl p-2 space-y-1"
                style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="flex gap-1.5 items-center">
                  <input value={r.name} onChange={e => setR(i, 'name', e.target.value)}
                    style={{ ...INPUT_BASE, color: '#1E293B', fontSize: 10, flex: 1 }} placeholder="Name" />
                  <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>$</span>
                  <input type="number" value={r.amount} onChange={e => setR(i, 'amount', e.target.value)}
                    style={{ ...INPUT_BASE, color: meta.glow, fontSize: 10, width: 52 }} />
                  <button onClick={() => u({ recipients: d.recipients.filter((_, idx) => idx !== i) })}
                    style={{ color: 'rgba(220,50,50,0.7)', fontSize: 12 }}>×</button>
                </div>
                <input value={r.address} onChange={e => setR(i, 'address', e.target.value)}
                  style={{ ...INPUT_BASE, color: '#94A3B8', fontSize: 9 }} placeholder="0x address" />
              </div>
            ))}
            <button onClick={() => u({ recipients: [...d.recipients, { name: 'New Recipient', amount: '0', address: '0x…', pct: '0' }] })}
              style={{ fontSize: 10, color: meta.glow, fontFamily: 'monospace', marginLeft: 2 }}>
              + Add recipient
            </button>
          </>
        )}

        {d.mode === 'transfer' && (
          <>
            <Field label="To address" value={d.recipients[0]?.address ?? ''} onChange={v =>
              u({ recipients: [{ ...(d.recipients[0] ?? { name: 'Recipient', amount: d.totalAmount, pct: '100' }), address: v }] })
            } />
            <Field label="Memo / label" value={d.recipients[0]?.name ?? ''} onChange={v => {
              u({ recipients: [{ ...(d.recipients[0] ?? { address: '', amount: d.totalAmount, pct: '100' }), name: v }] })
              if (v.trim()) updateNodeLabel(node.id, v.trim())
            }} />
            <SchedulePicker
              schedule={d.schedule}
              executionDay={d.executionDay}
              onScheduleChange={v => u({ schedule: v, executionDay: undefined })}
              onDayChange={v => u({ executionDay: v })}
              color={meta.glow}
            />
            {d.schedule === 'One-time' && (
              <OneTimeTrigger node={node} d={d} u={u} meta={meta} />
            )}
          </>
        )}

        {d.mode === 'split' && (
          <>
            <SectionDivider label="SPLIT RECIPIENTS" />
            {d.recipients.map((r, i) => (
              <div key={i} className="rounded-xl p-2 space-y-1"
                style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="flex gap-1.5 items-center">
                  <input value={r.name} onChange={e => setR(i, 'name', e.target.value)}
                    style={{ ...INPUT_BASE, color: '#1E293B', fontSize: 10, flex: 1 }} placeholder="Name" />
                  <input type="number" value={r.pct ?? ''} onChange={e => setR(i, 'pct', e.target.value)}
                    style={{ ...INPUT_BASE, color: meta.glow, fontSize: 10, width: 36 }} />
                  <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>%</span>
                  <button onClick={() => u({ recipients: d.recipients.filter((_, idx) => idx !== i) })}
                    style={{ color: 'rgba(220,50,50,0.7)', fontSize: 12 }}>×</button>
                </div>
                <input value={r.address} onChange={e => setR(i, 'address', e.target.value)}
                  style={{ ...INPUT_BASE, color: '#94A3B8', fontSize: 9 }} placeholder="0x address" />
              </div>
            ))}
            <button onClick={() => u({ recipients: [...d.recipients, { name: 'New Split', amount: '0', address: '0x…', pct: '0' }] })}
              style={{ fontSize: 10, color: meta.glow, fontFamily: 'monospace', marginLeft: 2 }}>
              + Add split
            </button>
          </>
        )}

        <SectionDivider />
        <ActionBtn onClick={() => setShowConfirm(true)} color={meta.glow} variant="solid">
          → Pay Now
        </ActionBtn>
      </div>

      <AnimatePresence>
        {showConfirm && (
          <ConfirmDialog
            title="Confirm Payment Distribution"
            confirmLabel="Confirm Distribution"
            confirmColor={meta.glow}
            onCancel={() => setShowConfirm(false)}
            onConfirm={handlePayNow}
            body={
              <div>
                <p className="mb-3" style={{ color: '#475569', fontSize: 12 }}>
                  Are you sure? This will execute the payment to these wallet addresses now:
                </p>
                <div className="space-y-1.5 mb-3">
                  {d.recipients.map((r, i) => (
                    <div key={i} className="flex items-start justify-between rounded-lg px-3 py-2"
                      style={{ background: `${meta.glow}09`, border: `1px solid ${meta.glow}1A` }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#1E293B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>{r.address}</div>
                      </div>
                      <div style={{ fontSize: 11, color: meta.glow, fontFamily: 'Space Mono, monospace', fontWeight: 600 }}>
                        {r.amount} {d.currency}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between px-1" style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 8 }}>
                  <span style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>Total</span>
                  <span style={{ fontSize: 12, color: meta.glow, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                    {d.totalAmount} {d.currency}
                  </span>
                </div>
              </div>
            }
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Wallet panel ─────────────────────────────────────────────────────────────

function WalletPanel({ node }: { node: NodeData }) {
  const d = node.data as WalletData
  const meta = NODE_TYPE_META[node.type]
  const upd = useGraphStore(s => s.updateNodeData)
  const updateNodeValue = useGraphStore(s => s.updateNodeValue)
  const u = (p: Partial<WalletData>) => upd(node.id, p as Record<string, unknown>)

  const [depositOpen, setDepositOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositCurrency, setDepositCurrency] = useState('USDC')

  const logHistory = useGraphStore(s => s.logHistory)
  const confirmHistoryEntry = useGraphStore(s => s.confirmHistoryEntry)

  const balances = getWalletBalances(d)
  const visibleBalances = Object.entries(balances)
    .filter(([asset, amount]) => amount > 0 || asset === d.currency)
    .sort(([a], [b]) => a.localeCompare(b))

  const setBalanceForCurrentCurrency = (nextBalance: string) => {
    const nextBalances = getWalletBalances(d)
    nextBalances[d.currency] = parseNumericInput(nextBalance)
    applyWalletBalances(node, nextBalances, upd, updateNodeValue, d.currency)
  }

  const setSelectedCurrency = (nextCurrency: string) => {
    const nextBalances = getWalletBalances(d)
    if (!(nextCurrency in nextBalances)) nextBalances[nextCurrency] = 0
    applyWalletBalances(node, nextBalances, upd, updateNodeValue, nextCurrency)
  }

  const handleCryptoDeposit = () => {
    if (!depositAmount.trim()) return
    const amount = parseNumericInput(depositAmount)
    if (amount > 0) {
      const nextBalances = getWalletBalances(d)
      nextBalances[depositCurrency] = (nextBalances[depositCurrency] ?? 0) + amount
      applyWalletBalances(node, nextBalances, upd, updateNodeValue, d.currency)
    }
    setDepositOpen(false)
    const histId = logHistory({
      kind: 'wallet_created',
      label: `Depositing ${depositAmount} ${depositCurrency}…`,
      status: 'loading',
      detail: d.address,
      amount: `${depositAmount} ${depositCurrency}`,
    })
    setTimeout(() => confirmHistoryEntry(histId), 2000)
    setDepositAmount('')
  }

  return (
    <div className="space-y-2">
      <Field label="Address" value={d.address} onChange={v => u({ address: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Balance $" value={d.balance} onChange={setBalanceForCurrentCurrency} color={meta.glow} />
        <Field label="Currency" value={d.currency} onChange={setSelectedCurrency}
          type="select" options={['USDC', 'USDT', 'DAI', 'ETH']} color={meta.glow} />
      </div>
      <Field label="Total yield received $" value={d.totalYieldReceived} onChange={v => u({ totalYieldReceived: v })} color="#059669" readOnly />
      <div className="rounded-xl px-2 py-1.5"
        style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
        <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 4 }}>
          ASSET BALANCES
        </div>
        <div className="space-y-1">
          {visibleBalances.map(([asset, amount]) => (
            <Row key={asset} label={asset} value={formatNumericInput(amount)} color={asset === d.currency ? meta.glow : undefined} />
          ))}
        </div>
      </div>

      <SectionDivider label="DEPOSIT" />

      {/* Deposit toggle button */}
      <button
        onClick={() => setDepositOpen(v => !v)}
        className="w-full py-2 rounded-xl text-xs font-semibold transition-all duration-150 hover:scale-[1.01]"
        style={{
          background: `${meta.glow}18`, border: `1px solid ${meta.glow}33`,
          color: meta.glow, fontFamily: 'Space Grotesk, sans-serif',
        }}
      >
        + Deposit Funds
      </button>

      <AnimatePresence>
        {depositOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-2 pt-1">
              {/* Amount row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-xl col-span-1"
                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
                  <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 3, letterSpacing: '0.06em' }}>AMOUNT</div>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    style={{ ...INPUT_BASE, color: meta.glow, fontSize: 11 }}
                  />
                </div>
                <div className="p-2 rounded-xl col-span-1"
                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
                  <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 3, letterSpacing: '0.06em' }}>ASSET</div>
                  <select
                    value={depositCurrency}
                    onChange={e => setDepositCurrency(e.target.value)}
                    style={{ ...INPUT_BASE, color: meta.glow, background: 'transparent', cursor: 'pointer' }}
                  >
                    {['USDC', 'USDT', 'ETH', 'DAI'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Crypto deposit */}
              <button
                onClick={handleCryptoDeposit}
                className="w-full py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: meta.glow, color: '#fff', fontFamily: 'Space Grotesk, sans-serif', boxShadow: `0 2px 10px ${meta.glow}44` }}
              >
                Deposit via Crypto
              </button>

              {/* Bank / MoonPay — upcoming, grayed out */}
              <div className="relative">
                <button
                  disabled
                  className="w-full py-2 rounded-xl text-xs font-semibold"
                  style={{
                    background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)',
                    color: '#CBD5E1', fontFamily: 'Space Grotesk, sans-serif', cursor: 'not-allowed',
                  }}
                >
                  Deposit via MoonPay / Bank Transfer
                </button>
                <span
                  className="absolute -top-1.5 right-2 px-1.5 py-0.5 rounded-md"
                  style={{ fontSize: 7, background: '#F1F5FF', border: '1px solid rgba(0,0,0,0.08)', color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em' }}
                >
                  COMING SOON
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Editable node label ──────────────────────────────────────────────────────

function EditableLabel({ nodeId, label, color }: { nodeId: string; label: string; color: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const updateNodeLabel = useGraphStore(s => s.updateNodeLabel)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  useEffect(() => { setDraft(label) }, [label])
  const commit = () => {
    setEditing(false)
    if (draft.trim()) updateNodeLabel(nodeId, draft.trim())
    else setDraft(label)
  }
  return editing ? (
    <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(label) } }}
      style={{ background: 'transparent', border: 'none', outline: 'none', color,
        fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 600, width: '100%' }} />
  ) : (
    <button onClick={() => setEditing(true)} className="group flex items-center gap-1 text-left hover:opacity-75 transition-opacity">
      <span style={{ color, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 9, color: '#94A3B8' }} className="opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
    </button>
  )
}

// ─── Agent panel ──────────────────────────────────────────────────────────────

// Log entries are encoded as "type:text" — types: log | web | trade
const AGENT_LOG_STEPS = [
  'log:Setting up Openclaw instance…',
  'log:Checking wallet balance…',
  'log:Setting up trading system to enable trading with given wallet balance…',
  'log:Researching tokens…',
  'web:dexscreener.com/trending',
  'web:coingecko.com/en/new-cryptocurrencies',
  'web:birdeye.so/tokens',
  'web:gmgn.ai/sol/trending',
  'web:defined.fi/pulse',
  'log:Analysing on-chain metrics across 5 sources…',
  'log:Shortlisting by 24h volume, liquidity depth and momentum…',
  'log:Placing trades…',
  'trade:Bought $400 worth of $NIGHT',
  'log:Finding new tokens…',
]

function AgentPanel({ node }: { node: NodeData }) {
  const d = node.data as AgentData
  const meta = NODE_TYPE_META[node.type]
  const nodes = useGraphStore(s => s.nodes)
  const connections = useGraphStore(s => s.connections)
  const upd = useGraphStore(s => s.updateNodeData)
  const updateNodeValue = useGraphStore(s => s.updateNodeValue)
  const logHistory = useGraphStore(s => s.logHistory)
  const confirmHistoryEntry = useGraphStore(s => s.confirmHistoryEntry)
  const u = (p: Partial<AgentData>) => upd(node.id, p as Record<string, unknown>)

  // Find budget source: first incoming connection's node (wallet / yield / distribute)
  const incomingConn = connections.find(c => c.toNodeId === node.id)
  const budgetSource = incomingConn ? nodes.find(n => n.id === incomingConn.fromNodeId) : null
  const budgetSourceMeta = budgetSource ? NODE_TYPE_META[budgetSource.type] : null
  const agentUpstreamMax = getUpstreamMax(node.id, 'USDC', nodes, connections)

  // Simulate log progression while running
  const logIndexRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (d.status === 'running') {
      logIndexRef.current = (d.logs?.length ?? 0)
      intervalRef.current = setInterval(() => {
        const idx = logIndexRef.current
        if (idx < AGENT_LOG_STEPS.length) {
          u({ logs: [...(d.logs ?? []), AGENT_LOG_STEPS[idx]] })
          logIndexRef.current = idx + 1
        } else {
          clearInterval(intervalRef.current)
        }
      }, 780)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.status])

  // Auto-scroll log to bottom as new entries arrive
  useEffect(() => {
    const el = logContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [d.logs?.length])

  const handleRun = () => {
    u({ status: 'running', logs: [], usedBudget: '0', lastOutput: undefined })
    const histId = logHistory({
      kind: 'agent_started',
      label: `Agent "${node.label}" started`,
      status: 'loading',
      detail: d.instructions ? d.instructions.slice(0, 80) : 'No instructions provided',
    })
    // Auto-complete after all steps play out
    setTimeout(() => {
      upd(node.id, {
        status: 'completed',
        lastOutput: 'Bought $400 of $NIGHT · Scanning for new opportunities · 1 active position',
        usedBudget: '400',
      } as Partial<AgentData> as Record<string, unknown>)
      updateNodeValue(node.id, '$NIGHT +12.4%')
      confirmHistoryEntry(histId)
      logHistory({ kind: 'agent_completed', label: `Agent "${node.label}" — bought $400 $NIGHT`, status: 'confirmed' })
    }, AGENT_LOG_STEPS.length * 780 + 600)
  }

  const handleStop = () => {
    clearInterval(intervalRef.current)
    u({ status: 'stopped', lastOutput: 'Agent stopped by user.' })
    updateNodeValue(node.id, 'Idle')
    logHistory({ kind: 'agent_stopped', label: `Agent "${node.label}" stopped` })
  }

  const isRunning = d.status === 'running'
  const statusColors: Record<AgentData['status'], string> = {
    idle: '#94A3B8', running: meta.glow, stopped: '#F59E0B', completed: '#10B981',
  }
  const statusColor = statusColors[d.status]

  return (
    <div className="space-y-3">
      {/* Openclaw branding header */}
      <div className="flex items-center justify-between rounded-xl px-3 py-2"
        style={{ background: `${meta.glow}0D`, border: `1px solid ${meta.glow}25` }}>
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c.83 0 1.5.67 1.5 1.5S12.83 8 12 8s-1.5-.67-1.5-1.5S11.17 5 12 5zm4 10.5c0 .28-.22.5-.5.5h-7c-.28 0-.5-.22-.5-.5v-1c0-.28.22-.5.5-.5H10v-3h-.5c-.28 0-.5-.22-.5-.5v-1c0-.28.22-.5.5-.5h3c.28 0 .5.22.5.5v4h.5c.28 0 .5.22.5.5v1z" fill={meta.glow} opacity="0.9"/>
          </svg>
          <span style={{ fontSize: 12, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, color: meta.glow }}>
            Openclaw
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: statusColor,
            boxShadow: isRunning ? `0 0 6px ${statusColor}` : 'none',
            animation: isRunning ? 'agentPulse 1.2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: statusColor, letterSpacing: '0.06em' }}>
            {d.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Budget source */}
      <div>
        <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 4 }}>
          BUDGET SOURCE
        </div>
        {budgetSource ? (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: `${budgetSourceMeta!.glow}0D`, border: `1px solid ${budgetSourceMeta!.glow}22` }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              background: `radial-gradient(circle at 36% 28%, #fff 0%, rgba(255,255,255,0.55) 18%, ${budgetSourceMeta!.color2} 52%, ${budgetSourceMeta!.color1} 100%)`,
            }} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 11, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, color: budgetSourceMeta!.glow }}>
                {budgetSource.label}
              </div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#94A3B8' }}>
                {budgetSource.value ?? '—'}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <span style={{ fontSize: 10, color: '#CBD5E1', fontFamily: 'monospace' }}>
              Connect a wallet, yield, or distribute node as input
            </span>
          </div>
        )}
      </div>

      {/* Max budget */}
      <AmountField
        label="Max budget (USDC)"
        value={d.maxBudget}
        onChange={v => u({ maxBudget: v })}
        color={meta.glow}
        upstreamMax={agentUpstreamMax}
      />

      {d.usedBudget !== '0' && (
        <div className="flex items-center justify-between rounded-lg px-3 py-1.5"
          style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
          <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>USED</span>
          <span style={{ fontSize: 10, color: meta.glow, fontFamily: 'Space Mono, monospace', fontWeight: 600 }}>
            {d.usedBudget} USDC
          </span>
        </div>
      )}

      <SectionDivider label="INSTRUCTIONS" />

      {/* Instructions textarea */}
      <div>
        <textarea
          value={d.instructions}
          onChange={e => u({ instructions: e.target.value })}
          placeholder="Describe what the agent should do with the allocated budget…&#10;e.g. Monitor USDC yield, rebalance if APY drops below 3%, notify when done."
          rows={5}
          style={{
            width: '100%', borderRadius: 12, padding: '10px 12px',
            background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.09)',
            fontSize: 11, color: '#1E293B', fontFamily: 'Space Grotesk, sans-serif',
            lineHeight: 1.55, resize: 'vertical', outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.border = `1px solid ${meta.glow}66`; e.target.style.boxShadow = `0 0 0 3px ${meta.glow}15` }}
          onBlur={e => { e.target.style.border = '1px solid rgba(0,0,0,0.09)'; e.target.style.boxShadow = 'none' }}
        />
      </div>

      {/* Model info */}
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>MODEL</span>
        <span style={{ fontSize: 9, color: meta.glow, fontFamily: 'Space Mono, monospace', fontWeight: 600 }}>
          {d.model}
        </span>
      </div>

      <SectionDivider />

      {/* Run / Stop button */}
      {isRunning ? (
        <button
          onClick={handleStop}
          className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#EF4444', fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          <div style={{
            width: 8, height: 8, background: '#EF4444', borderRadius: 2,
            animation: 'none',
          }} />
          Stop Agent
        </button>
      ) : (
        <button
          onClick={handleRun}
          disabled={!d.instructions.trim()}
          className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{
            background: d.instructions.trim() ? meta.glow : 'rgba(0,0,0,0.05)',
            border: `1px solid ${d.instructions.trim() ? meta.glow : 'rgba(0,0,0,0.1)'}`,
            color: d.instructions.trim() ? '#fff' : '#94A3B8',
            fontFamily: 'Space Grotesk, sans-serif',
            boxShadow: d.instructions.trim() ? `0 2px 12px ${meta.glow}55` : 'none',
          }}
        >
          ▶ Run Agent
        </button>
      )}

      {/* Log / Output */}
      {((d.logs && d.logs.length > 0) || d.lastOutput) && (
        <>
          <SectionDivider label="ACTIVITY" />
          <div className="rounded-xl overflow-hidden"
            style={{ background: '#F8FAFC', border: '1px solid rgba(0,0,0,0.07)' }}>
            {/* Live log lines */}
            {d.logs && d.logs.length > 0 && (
              <div ref={logContainerRef} className="px-3 pt-2.5 pb-1 space-y-1 overflow-y-auto" style={{ overscrollBehavior: 'contain', maxHeight: 220 }}>
                {d.logs.map((encoded, i) => {
                  const colon = encoded.indexOf(':')
                  const kind = encoded.slice(0, colon) as 'log' | 'web' | 'trade'
                  const text = encoded.slice(colon + 1)
                  const isLast = i === (d.logs?.length ?? 0) - 1

                  if (kind === 'web') {
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1"
                        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                        <span style={{ fontSize: 10, flexShrink: 0 }}>🌐</span>
                        <span style={{ fontSize: 9, color: '#6366F1', fontFamily: 'Space Mono, monospace', lineHeight: 1.4, flex: 1 }}>
                          {text}
                        </span>
                        {isLast && isRunning && (
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1', animation: 'agentPulse 0.8s ease-in-out infinite', flexShrink: 0 }} />
                        )}
                      </div>
                    )
                  }

                  if (kind === 'trade') {
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                        style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <span style={{ fontSize: 11, flexShrink: 0 }}>⚡</span>
                        <span style={{ fontSize: 11, color: '#059669', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, lineHeight: 1.3 }}>
                          {text}
                        </span>
                        <span className="ml-auto px-1.5 py-0.5 rounded-md" style={{ fontSize: 8, background: 'rgba(5,150,105,0.15)', color: '#059669', fontFamily: 'monospace', flexShrink: 0 }}>
                          CONFIRMED
                        </span>
                      </div>
                    )
                  }

                  // Regular log step
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span style={{ fontSize: 8, color: '#CBD5E1', fontFamily: 'monospace', flexShrink: 0, marginTop: 3, minWidth: 14, textAlign: 'right' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ fontSize: 10, color: '#475569', fontFamily: 'Space Mono, monospace', lineHeight: 1.55, flex: 1 }}>
                        {text}
                      </span>
                      {isLast && isRunning && (
                        <span style={{ fontSize: 10, color: meta.glow, animation: 'agentPulse 1s ease-in-out infinite', flexShrink: 0 }}>▌</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {/* Final output summary */}
            {d.lastOutput && (
              <div className="px-3 py-2.5 border-t flex items-center gap-2" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(5,150,105,0.04)' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>✅</span>
                <div style={{ fontSize: 10, color: '#064E3B', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1.5, fontWeight: 500 }}>
                  {d.lastOutput}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function NodePanel() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const nodes = useGraphStore(s => s.nodes)
  const selectNode = useGraphStore(s => s.selectNode)
  const removeNode = useGraphStore(s => s.removeNode)
  const updateNodeValue = useGraphStore(s => s.updateNodeValue)
  const logHistory = useGraphStore(s => s.logHistory)
  const node = nodes.find(n => n.id === selectedNodeId)

  const [savedPulse, setSavedPulse] = useState(false)

  const handleSave = () => {
    if (!node) return
    const newValue = computeNodeValue(node)
    updateNodeValue(node.id, newValue)
    logHistory({ kind: 'params_updated', label: `Saved ${node.label}`, detail: newValue })
    setSavedPulse(true)
    setTimeout(() => setSavedPulse(false), 1200)
  }

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          key={node.id}
          initial={{ opacity: 0, x: 320 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 320 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="fixed w-72 rounded-2xl flex flex-col"
          style={{
            zIndex: 100,
            right: 276,
            top: 68,
            bottom: 20,
            maxHeight: 'calc(100vh - 88px)',
            background: '#FFFFFF',
            border: `1px solid ${NODE_TYPE_META[node.type].glow}33`,
            boxShadow: `0 4px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)`,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="flex-shrink-0"
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: `radial-gradient(circle at 36% 28%, #fff 0%, rgba(255,255,255,0.55) 18%, ${NODE_TYPE_META[node.type].color2} 52%, ${NODE_TYPE_META[node.type].color1} 100%)`,
                  boxShadow: `0 2px 8px ${NODE_TYPE_META[node.type].glow}55`,
                }}
              />
              <div className="min-w-0">
                <EditableLabel nodeId={node.id} label={node.label} color={NODE_TYPE_META[node.type].glow} />
                <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace' }}>
                  {NODE_TYPE_META[node.type].description}
                </div>
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {node.id !== 'wallet_anchor' && (
                <button onClick={() => removeNode(node.id)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm hover:bg-red-50 transition-colors"
                  style={{ color: 'rgba(220,50,50,0.6)' }} title="Delete node">🗑</button>
              )}
              <button onClick={() => selectNode(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm hover:bg-gray-100 transition-colors"
                style={{ color: '#94A3B8' }} title="Close">✕</button>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 pt-4 pb-6 overflow-y-auto flex-1 min-h-0" style={{ overscrollBehavior: 'contain' }}>
            {node.type === 'swap'       && <SwapPanel node={node} />}
            {node.type === 'yield'      && <YieldPanel node={node} />}
            {node.type === 'distribute' && <DistributePanel node={node} />}
            {node.type === 'wallet'     && <WalletPanel node={node} />}
            {node.type === 'agent'      && <AgentPanel node={node} />}
          </div>

          {/* Footer: Save button */}
          <div className="px-4 pb-4 pt-1 flex-shrink-0 space-y-2"
            style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            <button
              onClick={handleSave}
              className="w-full py-2 rounded-xl text-xs font-semibold transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: savedPulse ? `${NODE_TYPE_META[node.type].glow}22` : 'rgba(0,0,0,0.04)',
                border: `1px solid ${savedPulse ? NODE_TYPE_META[node.type].glow + '66' : 'rgba(0,0,0,0.1)'}`,
                color: savedPulse ? NODE_TYPE_META[node.type].glow : '#64748B',
                fontFamily: 'Space Grotesk, sans-serif',
                transition: 'all 0.2s',
              }}
            >
              {savedPulse ? '✓ Saved' : 'Save Changes'}
            </button>
            <div className="text-center" style={{ fontSize: 8, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
              BACKSPACE to delete · ESC to close · click label to rename
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
