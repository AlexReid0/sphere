import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphStore, HistoryEntry } from '../store/graphStore'
import { NODE_TYPE_META } from '../types'
import type { DistributeData, YieldData, SwapData } from '../types'

// ─── History tab ──────────────────────────────────────────────────────────────

const KIND_META: Record<HistoryEntry['kind'], { icon: string; color: string }> = {
  connection_added:   { icon: '→', color: '#42A5F5' },
  connection_removed: { icon: '✂', color: '#EF5350' },
  node_added:         { icon: '+', color: '#66BB6A' },
  node_removed:       { icon: '×', color: '#FF7043' },
  yield_harvested:    { icon: '↗', color: '#0D9488' },
  params_updated:     { icon: '✎', color: '#AB47BC' },
  distribution_sent:  { icon: '→', color: '#D97706' },
  swap_executed:      { icon: '⇄', color: '#EA580C' },
  yield_deployed:     { icon: '↗', color: '#0D9488' },
  usyc_redeemed:      { icon: '↓', color: '#0369A1' },
  wallet_created:     { icon: '◉', color: '#1D4ED8' },
  agent_started:      { icon: '◈', color: '#6366F1' },
  agent_stopped:      { icon: '■', color: '#94A3B8' },
  agent_completed:    { icon: '✓', color: '#6366F1' },
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function Spinner() {
  return (
    <div
      style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '2px solid rgba(0,0,0,0.1)',
        borderTopColor: '#64748B',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

function HistoryTab({ history, onClear }: { history: HistoryEntry[]; onClear: () => void }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
          {history.length} EVENT{history.length !== 1 ? 'S' : ''}
        </span>
        {history.length > 0 && (
          <button onClick={onClear}
            style={{ fontSize: 9, color: '#CBD5E1', fontFamily: 'monospace', cursor: 'pointer' }}
            className="hover:text-red-400 transition-colors">
            clear
          </button>
        )}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div style={{ fontSize: 24, opacity: 0.2 }}>📋</div>
            <div style={{ fontSize: 11, color: '#CBD5E1', fontFamily: 'monospace' }}>No activity yet</div>
          </div>
        ) : (
          history.map((entry, i) => {
            const m = KIND_META[entry.kind]
            const isLoading = entry.status === 'loading'
            const isConfirmed = entry.status === 'confirmed'
            return (
              <motion.div
                key={entry.id}
                initial={i === 0 ? { opacity: 0, x: 12 } : false}
                animate={{ opacity: 1, x: 0 }}
                className="px-4 py-3"
                style={{
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  background: isLoading ? 'rgba(245,158,11,0.04)' : 'transparent',
                }}
              >
                <div className="flex items-start gap-2.5">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5 flex items-center justify-center"
                    style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: isLoading ? 'rgba(245,158,11,0.12)' : `${m.color}15`,
                      fontSize: 10,
                    }}>
                    {isLoading ? (
                      <Spinner />
                    ) : (
                      <span style={{ color: m.color, fontWeight: 700 }}>{m.icon}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Label + time */}
                    <div className="flex items-start justify-between gap-1">
                      <span style={{
                        fontSize: 11, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500,
                        color: isLoading ? '#92400E' : '#1E293B',
                        lineHeight: 1.35,
                      }}>
                        {entry.label}
                      </span>
                      <span style={{ fontSize: 8, color: '#CBD5E1', fontFamily: 'monospace', flexShrink: 0, marginTop: 2 }}>
                        {timeAgo(entry.timestamp)}
                      </span>
                    </div>

                    {/* Detail */}
                    {entry.detail && (
                      <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginTop: 2, lineHeight: 1.4 }}>
                        {entry.detail}
                      </div>
                    )}

                    {/* Addresses for distribution */}
                    {entry.addresses && entry.addresses.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {entry.addresses.map((addr, j) => (
                          <div key={j} style={{ fontSize: 8, color: '#94A3B8', fontFamily: 'monospace' }}>
                            {addr}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Status badge */}
                    {(isLoading || isConfirmed) && (
                      <div className="mt-1.5 flex items-center gap-1">
                        {isLoading ? (
                          <span className="px-1.5 py-0.5 rounded-md"
                            style={{ fontSize: 8, fontFamily: 'monospace', background: 'rgba(245,158,11,0.15)', color: '#D97706', letterSpacing: '0.05em' }}>
                            PENDING
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md"
                            style={{ fontSize: 8, fontFamily: 'monospace', background: 'rgba(5,150,105,0.12)', color: '#059669', letterSpacing: '0.05em' }}>
                            ✓ CONFIRMED
                          </span>
                        )}
                        {entry.amount && (
                          <span style={{ fontSize: 9, color: m.color, fontFamily: 'Space Mono, monospace', fontWeight: 600 }}>
                            {entry.amount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Upcoming tab ─────────────────────────────────────────────────────────────

interface UpcomingItem {
  id: string
  nodeLabel: string
  type: 'distribution' | 'yield_maturity' | 'swap_unlock' | 'yield_auto'
  title: string
  subtitle: string
  amount: string
  schedule?: string
  dueDate?: string
  color: string
  icon: string
}

function computeNextDate(schedule: string, executionDay?: string): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (schedule === 'One-time') return 'As scheduled'
  if (schedule === 'Daily') {
    const next = new Date(today); next.setDate(next.getDate() + 1)
    return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (schedule === 'Weekly' || schedule === 'Biweekly') {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const target = executionDay ?? 'Monday'
    const targetIdx = dayNames.indexOf(target)
    let diff = targetIdx - today.getDay()
    if (diff <= 0) diff += schedule === 'Biweekly' ? 14 : 7
    const next = new Date(today); next.setDate(next.getDate() + diff)
    return next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (schedule === 'Monthly' || schedule === 'Quarterly') {
    const dom = Math.min(Math.max(parseInt(executionDay ?? '1') || 1, 1), 28)
    const mo = schedule === 'Quarterly' ? 3 : 1
    let next = new Date(today.getFullYear(), today.getMonth(), dom)
    if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + mo, dom)
    return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return 'N/A'
}

function computeUpcoming(nodes: ReturnType<typeof useGraphStore.getState>['nodes']): UpcomingItem[] {
  const items: UpcomingItem[] = []

  for (const node of nodes) {
    if (node.type === 'distribute') {
      const d = node.data as DistributeData
      const nextDate = computeNextDate(d.schedule, d.executionDay)
      items.push({
        id: `upcoming_${node.id}`,
        nodeLabel: node.label,
        type: 'distribution',
        title: node.label,
        subtitle: `${d.recipients.length} recipient${d.recipients.length !== 1 ? 's' : ''} · Next: ${nextDate}`,
        amount: `${d.totalAmount} ${d.currency}`,
        schedule: d.schedule,
        color: NODE_TYPE_META.distribute.glow,
        icon: '→',
      })
    }

    if (node.type === 'yield') {
      const d = node.data as YieldData
      if (d.mode === 'rwa' && d.maturityDate) {
        items.push({
          id: `upcoming_rwa_${node.id}`,
          nodeLabel: node.label,
          type: 'yield_maturity',
          title: node.label,
          subtitle: `Matures ${d.maturityDate}`,
          amount: `${d.amount} ${d.idleAsset}`,
          dueDate: d.maturityDate,
          color: NODE_TYPE_META.yield.glow,
          icon: '↗',
        })
      }
      if (d.mode === 'defi' && d.autoCompound) {
        items.push({
          id: `upcoming_defi_${node.id}`,
          nodeLabel: node.label,
          type: 'yield_auto',
          title: node.label,
          subtitle: `Auto-compounding at ${d.apy}% APY`,
          amount: `${d.accruedYield} USDC accrued`,
          color: NODE_TYPE_META.yield.glow,
          icon: '↗',
        })
      }
    }

    if (node.type === 'swap') {
      const d = node.data as SwapData
      if (d.timeLocked && d.lockTime) {
        items.push({
          id: `upcoming_swap_${node.id}`,
          nodeLabel: node.label,
          type: 'swap_unlock',
          title: node.label,
          subtitle: `Unlocks ${d.lockTime}`,
          amount: `${d.amount} ${d.fromToken} → ${d.toToken}`,
          dueDate: d.lockTime,
          color: NODE_TYPE_META.swap.glow,
          icon: '⇄',
        })
      }
    }
  }

  return items
}

function UpcomingTab({ nodes }: { nodes: ReturnType<typeof useGraphStore.getState>['nodes'] }) {
  const items = computeUpcoming(nodes)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
          {items.length} SCHEDULED ACTION{items.length !== 1 ? 'S' : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div style={{ fontSize: 24, opacity: 0.2 }}>📅</div>
            <div style={{ fontSize: 11, color: '#CBD5E1', fontFamily: 'monospace', textAlign: 'center' }}>
              No scheduled actions
            </div>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-start gap-2.5">
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5 flex items-center justify-center"
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: `${item.color}15`, fontSize: 10,
                  }}>
                  <span style={{ color: item.color, fontWeight: 700 }}>{item.icon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <span style={{ fontSize: 11, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, color: '#1E293B', lineHeight: 1.35 }}>
                      {item.title}
                    </span>
                    {item.schedule && (
                      <span className="px-1.5 py-0.5 rounded-md flex-shrink-0"
                        style={{ fontSize: 8, fontFamily: 'monospace', background: `${item.color}15`, color: item.color, letterSpacing: '0.04em' }}>
                        {item.schedule.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 10, color: item.color, fontFamily: 'Space Mono, monospace', fontWeight: 600, marginTop: 2 }}>
                    {item.amount}
                  </div>

                  <div style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'monospace', marginTop: 1 }}>
                    {item.subtitle}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActivityPanel() {
  const [tab, setTab] = useState<'history' | 'upcoming'>('history')
  const history = useGraphStore(s => s.history)
  const nodes = useGraphStore(s => s.nodes)
  const clearHistory = useGraphStore(s => s.clearHistory)

  const upcomingCount = computeUpcoming(nodes).length
  const pendingCount = history.filter(h => h.status === 'loading').length

  return (
    <div
      className="fixed right-0 bottom-0 flex flex-col"
      style={{
        top: 52,
        width: 260,
        background: '#FFFFFF',
        borderLeft: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.05)',
        zIndex: 90,
      }}
    >
      {/* Panel header */}
      <div className="px-4 pb-0 flex-shrink-0" style={{ paddingTop: 20 }}>
        <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: 8 }}>
          ACTIVITY
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.03)' }}>
          <TabBtn active={tab === 'history'} onClick={() => setTab('history')} badge={pendingCount > 0 ? pendingCount : 0}>
            History
          </TabBtn>
          <TabBtn active={tab === 'upcoming'} onClick={() => setTab('upcoming')} badge={upcomingCount}>
            Upcoming
          </TabBtn>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col mt-2">
        <AnimatePresence mode="wait">
          {tab === 'history' ? (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }} className="flex flex-col flex-1 min-h-0">
              <HistoryTab history={history} onClear={clearHistory} />
            </motion.div>
          ) : (
            <motion.div key="upcoming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }} className="flex flex-col flex-1 min-h-0">
              <UpcomingTab nodes={nodes} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function TabBtn({
  active, onClick, children, badge,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode; badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1.5 flex items-center justify-center gap-1 transition-all duration-150"
      style={{
        background: active ? '#FFFFFF' : 'transparent',
        color: active ? '#1E293B' : '#94A3B8',
        fontSize: 10, fontFamily: 'Space Grotesk, sans-serif', fontWeight: active ? 600 : 400,
        boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
        borderRadius: active ? 10 : 0,
        margin: active ? 2 : 0,
      }}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="flex items-center justify-center rounded-full"
          style={{
            width: 14, height: 14, fontSize: 7, fontFamily: 'monospace',
            background: active ? '#EF4444' : 'rgba(0,0,0,0.1)',
            color: active ? '#fff' : '#94A3B8',
          }}>
          {badge}
        </span>
      )}
    </button>
  )
}
