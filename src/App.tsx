import { NodeGraph } from './components/NodeGraph'
import { NodePalette } from './components/NodePalette'
import { NodePanel } from './components/panels/NodePanel'
import { ActivityPanel } from './components/ActivityPanel'
import { useGraphStore } from './store/graphStore'
import type { DistributeData, WalletData, YieldData } from './types'

// ─── Derived header stats ─────────────────────────────────────────────────────

function useTreasuryStats() {
  const nodes = useGraphStore(s => s.nodes)
  const connections = useGraphStore(s => s.connections)

  // Total balance: sum of all wallet balances
  const totalBalance = nodes
    .filter(n => n.type === 'wallet')
    .reduce((sum, n) => {
      const balance = parseFloat(((n.data as WalletData).balance ?? '0').replace(/,/g, ''))
      return sum + (isNaN(balance) ? 0 : balance)
    }, 0)

  // Active flows: number of active connections
  const activeFlows = connections.filter(c => c.isActive).length

  // Upcoming: scheduled distribute items
  const upcoming = nodes.filter(n => {
    if (n.type === 'distribute') {
      const d = n.data as DistributeData
      return d.schedule !== 'One-time'
    }
    return false
  }).length

  // Average yield: mean APY across all yield nodes
  const yieldNodes = nodes.filter(n => n.type === 'yield')
  const avgYield = yieldNodes.length === 0 ? 0
    : yieldNodes.reduce((sum, n) => {
        const d = n.data as YieldData
        const apy = parseFloat(d.mode === 'defi' ? d.apy : d.currentYield)
        return sum + (isNaN(apy) ? 0 : apy)
      }, 0) / yieldNodes.length

  return { totalBalance, activeFlows, upcoming, avgYield }
}

function formatBalance(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`
  return `$${v.toFixed(0)}`
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const { totalBalance, activeFlows, upcoming, avgYield } = useTreasuryStats()

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#EEF2FF' }}>
      {/* App header */}
      <div
        className="fixed top-0 left-0 right-0 flex items-center justify-between px-6 py-3"
        style={{
          zIndex: 100,
          background: '#FFFFFF',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Logo sphere */}
          <div
            className="w-8 h-8 rounded-full flex-shrink-0"
            style={{
              background: 'radial-gradient(circle at 36% 30%, #ffffff 0%, rgba(255,255,255,0.55) 18%, #3B82F6 52%, #1D4ED8 100%)',
              boxShadow: '0 3px 10px rgba(37,99,235,0.45)',
            }}
          />
          <div>
            <div className="font-semibold text-base tracking-tight" style={{ color: '#1E293B' }}>
              Sphere
            </div>
            <div className="font-mono text-xs" style={{ color: '#94A3B8', fontSize: 9 }}>
              Your spherical treasury
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6">
          <HeaderStat label="Total Balance" value={formatBalance(totalBalance)} color="#1D4ED8" />
          <HeaderStat label="Active Flows" value={String(activeFlows)} color="#0D9488" />
          <HeaderStat label="Upcoming" value={String(upcoming)} color="#D97706" />
          <HeaderStat label="Avg Yield" value={`${avgYield.toFixed(1)}%`} color="#059669" />
        </div>

        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: '#059669', boxShadow: '0 0 5px #059669aa' }}
          />
          <span className="font-mono text-xs" style={{ color: '#94A3B8', fontSize: 10 }}>
            LIVE
          </span>
        </div>
      </div>

      {/* Main graph canvas — right-padded to not hide under ActivityPanel */}
      <div className="absolute inset-0" style={{ zIndex: 1, paddingTop: 52, paddingRight: 260 }}>
        <NodeGraph />
      </div>

      {/* Left palette */}
      <NodePalette />

      {/* Right edit panel (slides in when node selected) */}
      <NodePanel />

      {/* Right activity panel (always visible) */}
      <ActivityPanel />
    </div>
  )
}

function HeaderStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="font-mono font-bold text-sm" style={{ color }}>
        {value}
      </div>
      <div className="font-mono text-xs" style={{ color: '#94A3B8', fontSize: 8 }}>
        {label.toUpperCase()}
      </div>
    </div>
  )
}
