import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphStore, HistoryEntry } from '../store/graphStore'

const KIND_META: Record<HistoryEntry['kind'], { icon: string; color: string }> = {
  connection_added:   { icon: '🔗', color: '#42A5F5' },
  connection_removed: { icon: '✂️', color: '#EF5350' },
  node_added:         { icon: '🌍', color: '#66BB6A' },
  node_removed:       { icon: '💥', color: '#FF7043' },
  yield_harvested:    { icon: '🚀', color: '#FFD700' },
  params_updated:     { icon: '✎',  color: '#AB47BC' },
  distribution_sent:  { icon: '→',  color: '#D97706' },
  swap_executed:      { icon: '⇄',  color: '#EA580C' },
  yield_deployed:     { icon: '↗',  color: '#0D9488' },
  yield_deployed_usdc: { icon: '⚡', color: '#0D9488' },
  usyc_redeemed:      { icon: '↓',  color: '#0369A1' },
  wallet_created:     { icon: '◉',  color: '#1D4ED8' },
  agent_started:      { icon: '◈',  color: '#6366F1' },
  agent_stopped:      { icon: '■',  color: '#94A3B8' },
  agent_completed:    { icon: '✓',  color: '#6366F1' },
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function HistoryPanel() {
  const [open, setOpen] = useState(false)
  const history = useGraphStore(s => s.history)
  const clearHistory = useGraphStore(s => s.clearHistory)

  return (
    <div className="fixed bottom-14 left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ zIndex: 90 }}>
      {/* Toggle pill */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-1.5 rounded-full transition-all hover:scale-105"
        style={{
          background: 'rgba(8,12,30,0.85)',
          border: `1px solid ${open ? 'rgba(100,140,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
          backdropFilter: 'blur(12px)',
          color: open ? 'rgba(150,190,255,0.9)' : 'rgba(120,140,190,0.55)',
          fontSize: 10, fontFamily: 'Space Mono, monospace',
          boxShadow: open ? '0 0 20px rgba(80,120,255,0.2)' : 'none',
        }}
      >
        <span style={{ fontSize: 12 }}>📋</span>
        <span>HISTORY</span>
        {history.length > 0 && (
          <span className="flex items-center justify-center rounded-full text-xs"
            style={{ width: 16, height: 16, background: 'rgba(80,140,255,0.3)',
              color: 'rgba(150,200,255,0.9)', fontSize: 8, fontFamily: 'monospace' }}>
            {Math.min(history.length, 99)}
          </span>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scaleY: 0.8 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: 10, scaleY: 0.8 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            style={{
              position: 'absolute', bottom: 'calc(100% + 8px)',
              width: 340, maxHeight: 320,
              background: 'rgba(6, 10, 26, 0.96)',
              border: '1px solid rgba(100,140,255,0.2)',
              borderRadius: 16,
              backdropFilter: 'blur(20px)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 10, color: 'rgba(150,170,220,0.6)', fontFamily: 'monospace' }}>
                TRANSACTION HISTORY
              </span>
              <div className="flex gap-2 items-center">
                {history.length > 0 && (
                  <button onClick={clearHistory}
                    style={{ fontSize: 9, color: 'rgba(150,170,220,0.4)', fontFamily: 'monospace', cursor: 'pointer' }}
                    className="hover:opacity-80 transition-opacity">
                    clear
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  style={{ fontSize: 12, color: 'rgba(150,170,220,0.4)', lineHeight: 1 }}>✕</button>
              </div>
            </div>

            {/* Entries */}
            <div className="overflow-y-auto flex-1" style={{ overscrollBehavior: 'contain' }}>
              {history.length === 0 ? (
                <div className="py-8 text-center" style={{ color: 'rgba(120,140,190,0.4)', fontSize: 11, fontFamily: 'monospace' }}>
                  No activity yet
                </div>
              ) : (
                history.map((entry, i) => {
                  const m = KIND_META[entry.kind]
                  return (
                    <motion.div
                      key={entry.id}
                      initial={i === 0 ? { opacity: 0, x: -10 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-3 px-4 py-2.5"
                      style={{
                        borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: i === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 14, lineHeight: 1.4, flexShrink: 0 }}>{m.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 11, color: m.color, fontFamily: 'Space Grotesk, sans-serif',
                          fontWeight: 500, lineHeight: 1.3 }}>
                          {entry.label}
                        </div>
                        {entry.detail && (
                          <div style={{ fontSize: 9, color: 'rgba(150,170,220,0.5)', fontFamily: 'monospace', marginTop: 2 }}>
                            {entry.detail}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 9, color: 'rgba(120,140,180,0.4)', fontFamily: 'monospace',
                        flexShrink: 0, marginTop: 2 }}>
                        {timeAgo(entry.timestamp)}
                      </span>
                    </motion.div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
