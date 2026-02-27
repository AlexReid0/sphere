import { NodeType, NODE_TYPE_META } from '../types'
import { useGraphStore } from '../store/graphStore'

interface Suggestion {
  type: NodeType
  hint: string
  label: string
}

function getSuggestions(nodeType: NodeType, outTypes: Set<NodeType>): Suggestion[] {
  const missing = (t: NodeType) => !outTypes.has(t)

  const all: Record<NodeType, Suggestion[]> = {
    swap: [
      missing('yield')      && { type: 'yield',      label: 'Earn Yield',    hint: 'Put swapped tokens to work at 4–6% APY' },
      missing('wallet')     && { type: 'wallet',     label: 'Send to Wallet', hint: 'Receive swapped tokens in your wallet' },
      missing('distribute') && { type: 'distribute', label: 'Distribute',     hint: 'Route swap output to payroll or split' },
    ].filter(Boolean) as Suggestion[],

    yield: [
      missing('wallet')     && { type: 'wallet',     label: 'Collect Yield',  hint: 'Route harvested yield to your wallet' },
      missing('distribute') && { type: 'distribute', label: 'Distribute',     hint: 'Fund payroll or split directly from yield' },
      missing('swap')       && { type: 'swap',       label: 'Swap Yield',     hint: 'Convert earned yield into another token' },
    ].filter(Boolean) as Suggestion[],

    distribute: [
      missing('swap')   && { type: 'swap',   label: 'Swap First',   hint: 'Swap to the target currency before distributing' },
      missing('wallet') && { type: 'wallet', label: 'Keep a Slice', hint: 'Retain a portion of funds in your wallet' },
    ].filter(Boolean) as Suggestion[],

    wallet: [
      missing('yield')      && { type: 'yield',      label: 'Earn Yield',  hint: 'Put idle wallet balance to work generating yield' },
      missing('swap')       && { type: 'swap',        label: 'Swap Assets', hint: 'Convert wallet balance to another token' },
      missing('distribute') && { type: 'distribute',  label: 'Distribute',  hint: 'Set up payroll or transfers from this wallet' },
    ].filter(Boolean) as Suggestion[],
  }

  return (all[nodeType] || []).slice(0, 3)
}

const SLOT_ANGLES = [18, -32, 60]

interface SuggestedNodesProps {
  parentId: string
  parentType: NodeType
  parentX: number
  parentY: number
  parentSize: number
}

export function SuggestedNodes({ parentId, parentType, parentX, parentY, parentSize }: SuggestedNodesProps) {
  const addNode = useGraphStore(s => s.addNode)
  const addConnection = useGraphStore(s => s.addConnection)
  const hoverNode = useGraphStore(s => s.hoverNode)
  const connections = useGraphStore(s => s.connections)
  const nodes = useGraphStore(s => s.nodes)

  const outTypes = new Set<NodeType>()
  connections.forEach(c => {
    if (c.fromNodeId === parentId) {
      const target = nodes.find(n => n.id === c.toNodeId)
      if (target) outTypes.add(target.type)
    }
  })

  const suggestions = getSuggestions(parentType, outTypes)
  if (suggestions.length === 0) return null

  const center = parentSize / 2
  const orbitRadius = parentSize / 2 + 96

  const handleAdd = (suggestion: Suggestion, angle: number) => {
    const rad = (angle * Math.PI) / 180
    const nx = parentX + center + Math.cos(rad) * orbitRadius - 34
    const ny = parentY + center + Math.sin(rad) * orbitRadius - 34
    const newId = addNode(suggestion.type, { x: nx, y: ny })
    addConnection(parentId, newId)
    hoverNode(null)
  }

  return (
    <div className="absolute inset-0" style={{ zIndex: 3, pointerEvents: 'none' }}>
      {suggestions.map((sug, i) => {
        const angle = SLOT_ANGLES[i] ?? 90
        const rad = (angle * Math.PI) / 180
        const meta = NODE_TYPE_META[sug.type]
        const x = center + Math.cos(rad) * orbitRadius
        const y = center + Math.sin(rad) * orbitRadius

        return (
          <div
            key={`${sug.type}_${i}`}
            className="absolute cursor-pointer group"
            style={{
              left: x - 28,
              top: y - 28,
              pointerEvents: 'all',
              animation: `float ${3.2 + i * 0.6}s ease-in-out infinite`,
              animationDelay: `${i * 0.25}s`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handleAdd(sug, angle) }}
          >
            {/* Ghost sphere */}
            <div
              className="w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all duration-200 group-hover:scale-110"
              style={{
                background: `radial-gradient(circle at 36% 28%, #fff 0%, rgba(255,255,255,0.5) 18%, ${meta.color2}99 52%, ${meta.color1}55 100%)`,
                border: `1.5px dashed ${meta.glow}88`,
                boxShadow: `0 2px 12px ${meta.glow}44, 0 1px 4px rgba(0,0,0,0.1)`,
              }}
            >
              <span style={{ fontSize: 15, opacity: 0.9, lineHeight: 1 }}>{meta.icon}</span>
              <span style={{ fontSize: 8, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 600, marginTop: 2, opacity: 0.95, letterSpacing: '0.02em' }}>
                {sug.label}
              </span>
            </div>

            {/* Tooltip */}
            <div
              className="absolute pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{
                left: '50%', top: 'calc(100% + 6px)',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                background: '#FFFFFF',
                border: `1px solid rgba(0,0,0,0.1)`,
                borderRadius: 10,
                padding: '5px 10px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 50,
              }}
            >
              <div style={{ fontSize: 9, color: meta.glow, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, marginBottom: 1 }}>
                {meta.label}
              </div>
              <div style={{ fontSize: 8, color: '#64748B', fontFamily: 'monospace', maxWidth: 160, whiteSpace: 'normal' }}>
                {sug.hint}
              </div>
            </div>

            {/* Dashed connector line */}
            <svg
              className="absolute pointer-events-none"
              style={{ left: 28 - x + center, top: 28 - y + center, overflow: 'visible', opacity: 0.4 }}
            >
              <line x1={0} y1={0} x2={x - center} y2={y - center}
                stroke={meta.glow} strokeWidth="1" strokeDasharray="4 3" />
            </svg>
          </div>
        )
      })}
    </div>
  )
}
