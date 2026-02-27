import { useMemo, useState } from 'react'
import { useGraphStore } from '../store/graphStore'
import { NodeData } from '../types'

const ASSET_COLORS: Record<string, string> = {
  USDC: '#2563EB',
  USDT: '#0D9488',
  ETH: '#7C3AED',
  BTC: '#EA580C',
  DAI: '#D97706',
  default: '#64748B',
}

function getPortCenter(node: NodeData, port: 'input' | 'output') {
  const halfSize = node.size / 2
  const cx = node.position.x + halfSize
  const cy = node.position.y + halfSize   // true sphere vertical centre
  if (port === 'output') return { x: cx + halfSize + 8, y: cy }
  return { x: cx - halfSize - 8, y: cy }
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.abs(x2 - x1) * 0.45
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}

function midpoint(x1: number, y1: number, x2: number, y2: number) {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
}

export function ConnectionLayer() {
  const nodes = useGraphStore(s => s.nodes)
  const connections = useGraphStore(s => s.connections)
  const connectingFrom = useGraphStore(s => s.connectingFrom)
  const cursorPos = useGraphStore(s => s.cursorPos)
  const canvasOffset = useGraphStore(s => s.canvasOffset)
  const zoom = useGraphStore(s => s.zoom)

  const setPendingDeleteConn = useGraphStore(s => s.setPendingDeleteConn)
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null)

  const nodeMap = useMemo(() => {
    const m = new Map<string, NodeData>()
    nodes.forEach(n => m.set(n.id, n))
    return m
  }, [nodes])

  return (
    <svg
      className="absolute inset-0 overflow-visible"
      style={{ zIndex: 1, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <g transform={`translate(${canvasOffset.x}, ${canvasOffset.y}) scale(${zoom})`}>
        {connections.map(conn => {
          const fromNode = nodeMap.get(conn.fromNodeId)
          const toNode = nodeMap.get(conn.toNodeId)
          if (!fromNode || !toNode) return null

          const from = getPortCenter(fromNode, 'output')
          const to = getPortCenter(toNode, 'input')
          const pathD = cubicBezier(from.x, from.y, to.x, to.y)
          const color = ASSET_COLORS[conn.assetType] || ASSET_COLORS.default
          const isHovered = hoveredConnId === conn.id
          const mid = midpoint(from.x, from.y, to.x, to.y)

          return (
            <g key={conn.id}>
              {/* Wide invisible stroke for easy hover/click */}
              <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth="18"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onMouseEnter={() => setHoveredConnId(conn.id)}
                onMouseLeave={() => setHoveredConnId(null)}
                onClick={(e) => { e.stopPropagation(); setPendingDeleteConn(conn.id) }}
              />

              {/* Subtle halo for hover state */}
              {isHovered && (
                <path
                  d={pathD} fill="none" stroke={color}
                  strokeWidth={8}
                  strokeOpacity={0.12}
                  strokeLinecap="round"
                />
              )}

              {/* Base line */}
              <path
                d={pathD} fill="none" stroke={color}
                strokeWidth={isHovered ? 2 : 1.5}
                strokeOpacity={isHovered ? 0.65 : conn.isPending ? 0.4 : 0.45}
                strokeLinecap="round"
                strokeDasharray={conn.isPending ? '6 5' : undefined}
              >
                {conn.isPending && (
                  <animate attributeName="stroke-dashoffset" from="0" to="-22" dur="0.8s" repeatCount="indefinite" />
                )}
              </path>

              {/* Pumping bulge — two staggered pulses traveling from source to destination */}
              {conn.isActive && !conn.isPending && (
                <>
                  {/* Pulse 1 */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    pathLength={1000}
                    strokeDasharray="38 962"
                    strokeOpacity={0.82}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="-1000"
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                  </path>
                  {/* Pulse 2 — staggered by half period */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    pathLength={1000}
                    strokeDasharray="38 962"
                    strokeOpacity={0.82}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="-1000"
                      dur="2.4s"
                      begin="-1.2s"
                      repeatCount="indefinite"
                    />
                  </path>
                </>
              )}

              {/* Flow amount label */}
              {conn.flowAmount && (
                <text x={mid.x} y={mid.y - 10} fill={color} fontSize="10"
                  fontFamily="Space Mono, monospace" textAnchor="middle" opacity="0.7">
                  {conn.flowAmount} {conn.assetType}
                </text>
              )}

              {/* Delete badge on hover */}
              {isHovered && (
                <g
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setPendingDeleteConn(conn.id) }}
                >
                  <circle cx={mid.x} cy={mid.y} r="11" fill="white"
                    stroke={color} strokeWidth="1.5"
                    style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.14))' }}
                  />
                  <text x={mid.x} y={mid.y + 4.5} textAnchor="middle"
                    fontSize="13" fill={color} fontWeight="600">×</text>
                </g>
              )}
            </g>
          )
        })}

        {/* Live connecting line while dragging */}
        {connectingFrom && (() => {
          // portX/Y are already in canvas space (set by handleOutputPortMouseDown)
          const sx = connectingFrom.portX
          const sy = connectingFrom.portY
          // cursorPos is also in canvas space (converted in NodeGraph.handleMouseMove)
          const tx = cursorPos.x
          const ty = cursorPos.y
          return (
            <g>
              <path
                d={cubicBezier(sx, sy, tx, ty)}
                fill="none" stroke="rgba(30,40,100,0.55)" strokeWidth="2"
                strokeDasharray="6 4" strokeLinecap="round"
              />
              <circle cx={tx} cy={ty} r="5" fill="rgba(30,40,100,0.15)"
                stroke="rgba(30,40,100,0.5)" strokeWidth="1.5" />
            </g>
          )
        })()}
      </g>
    </svg>
  )
}
