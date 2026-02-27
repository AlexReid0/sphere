import { motion, AnimatePresence } from 'framer-motion'
import { useGraphStore } from '../store/graphStore'
import { NodeType, NODE_TYPE_META } from '../types'

interface Warning { emoji: string; title: string; body: string; confirmLabel: string }

function getWarning(fromType: NodeType, toType: NodeType, fromLabel: string, toLabel: string): Warning {
  if (fromType === 'yield' && toType === 'wallet') return {
    emoji: '⚠️', title: 'Stop collecting yield?',
    body: `${toLabel} will no longer receive harvested yield from ${fromLabel}.`,
    confirmLabel: 'Stop yield',
  }
  if (fromType === 'yield' && toType === 'distribute') return {
    emoji: '👥', title: 'Remove distribution funding?',
    body: `${toLabel} will stop receiving yield from ${fromLabel} and will not execute until reconnected.`,
    confirmLabel: 'Remove',
  }
  if (fromType === 'swap' && toType === 'yield') return {
    emoji: '📉', title: 'Stop earning yield on swap output?',
    body: `Swapped tokens from ${fromLabel} will no longer flow into ${toLabel} to generate returns.`,
    confirmLabel: 'Disconnect',
  }
  if (toType === 'wallet') return {
    emoji: '🔗', title: 'Disconnect flow to wallet?',
    body: `${toLabel} will no longer receive assets from ${fromLabel}.`,
    confirmLabel: 'Disconnect',
  }
  if (toType === 'distribute') return {
    emoji: '🚫', title: 'Remove distribution input?',
    body: `${toLabel} will stop receiving funds from ${fromLabel}.`,
    confirmLabel: 'Remove input',
  }
  return {
    emoji: '✕', title: 'Remove this connection?',
    body: `The active asset flow from ${fromLabel} to ${toLabel} will stop.`,
    confirmLabel: 'Remove',
  }
}

export function DeleteConnectionDialog() {
  const pendingId = useGraphStore(s => s.pendingDeleteConnId)
  const setPending = useGraphStore(s => s.setPendingDeleteConn)
  const removeConnection = useGraphStore(s => s.removeConnection)
  const connections = useGraphStore(s => s.connections)
  const nodes = useGraphStore(s => s.nodes)

  const conn = connections.find(c => c.id === pendingId)
  const fromNode = nodes.find(n => n.id === conn?.fromNodeId)
  const toNode = nodes.find(n => n.id === conn?.toNodeId)

  const warning = conn && fromNode && toNode
    ? getWarning(fromNode.type, toNode.type, fromNode.label, toNode.label)
    : null

  const fromMeta = fromNode ? NODE_TYPE_META[fromNode.type] : null
  const toMeta = toNode ? NODE_TYPE_META[toNode.type] : null

  const confirm = () => {
    if (pendingId) {
      removeConnection(pendingId)
      setPending(null)
    }
  }

  return (
    <AnimatePresence>
      {warning && fromNode && toNode && fromMeta && toMeta && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0"
            style={{ zIndex: 200, background: 'rgba(15,23,42,0.22)', backdropFilter: 'blur(2px)' }}
            onClick={() => setPending(null)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.90, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.90, y: 16 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 w-80"
            style={{
              zIndex: 201,
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.09)',
              boxShadow: '0 16px 60px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.07)',
            }}
          >
            <div className="text-3xl mb-3 text-center">{warning.emoji}</div>

            <h3 className="text-center font-semibold mb-2"
              style={{ color: '#1E293B', fontSize: 15, fontFamily: 'Space Grotesk, sans-serif' }}>
              {warning.title}
            </h3>

            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ background: `${fromMeta.color3}55`, border: `1px solid ${fromMeta.glow}33` }}>
                <span style={{ fontSize: 12 }}>{fromMeta.icon}</span>
                <span style={{ fontSize: 10, color: fromMeta.glow, fontFamily: 'monospace', fontWeight: 600 }}>{fromNode.label}</span>
              </div>
              <span style={{ fontSize: 14, color: '#94A3B8' }}>→</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ background: `${toMeta.color3}55`, border: `1px solid ${toMeta.glow}33` }}>
                <span style={{ fontSize: 12 }}>{toMeta.icon}</span>
                <span style={{ fontSize: 10, color: toMeta.glow, fontFamily: 'monospace', fontWeight: 600 }}>{toNode.label}</span>
              </div>
            </div>

            <p className="text-center mb-5"
              style={{ fontSize: 12, color: '#64748B', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1.55 }}>
              {warning.body}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setPending(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all hover:bg-gray-50"
                style={{ color: '#64748B', border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'Space Grotesk' }}>
                Keep connection
              </button>
              <button
                onClick={confirm}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.28)',
                  color: '#DC2626', fontFamily: 'Space Grotesk' }}>
                {warning.confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
