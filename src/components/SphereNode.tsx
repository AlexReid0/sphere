import { useRef, useCallback } from 'react'
import { NodeData, NODE_TYPE_META } from '../types'
import { useGraphStore } from '../store/graphStore'
import { SphereCanvas } from './SphereCanvas'
import { ClockOrbit } from './ClockOrbit'
import { SuggestedNodes } from './SuggestedNodes'
import type { SwapData, AgentData } from '../types'

function AgentRunningRing({ size, color }: { size: number; color: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
      {/* Outer dashed rotating ring */}
      <div style={{
        position: 'absolute',
        inset: -6,
        borderRadius: '50%',
        border: `2px dashed ${color}`,
        opacity: 0.55,
        animation: 'agentScan 2.8s linear infinite',
      }} />
      {/* Inner solid rotating ring — opposite direction */}
      <div style={{
        position: 'absolute',
        inset: -12,
        borderRadius: '50%',
        border: `1.5px dashed ${color}`,
        opacity: 0.25,
        animation: 'agentScanReverse 4s linear infinite',
      }} />
      {/* Pulsing glow */}
      <div style={{
        position: 'absolute',
        inset: -2,
        borderRadius: '50%',
        boxShadow: `0 0 18px 4px ${color}55`,
        animation: 'agentPulse 1.6s ease-in-out infinite',
      }} />
    </div>
  )
}

interface SphereNodeProps {
  node: NodeData
}

export function SphereNode({ node }: SphereNodeProps) {
  const meta = NODE_TYPE_META[node.type]
  const selectNode = useGraphStore(s => s.selectNode)
  const hoverNode = useGraphStore(s => s.hoverNode)
  const startDragging = useGraphStore(s => s.startDragging)
  const startConnecting = useGraphStore(s => s.startConnecting)
  const finishConnecting = useGraphStore(s => s.finishConnecting)
  const connectingFrom = useGraphStore(s => s.connectingFrom)
  const canvasOffset = useGraphStore(s => s.canvasOffset)
  const zoom = useGraphStore(s => s.zoom)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>()

  const isValidTarget = connectingFrom !== null && connectingFrom.nodeId !== node.id

  const isTimeLocked = node.type === 'swap' && (node.data as SwapData).timeLocked
  const lockTime = node.type === 'swap' ? (node.data as SwapData).lockTime : undefined
  const isAgentRunning = node.type === 'agent' && (node.data as AgentData).status === 'running'

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    selectNode(node.id)
    const nodeScreenX = node.position.x * zoom + canvasOffset.x
    const nodeScreenY = node.position.y * zoom + canvasOffset.y
    startDragging(node.id, (e.clientX - nodeScreenX) / zoom, (e.clientY - nodeScreenY) / zoom)
  }, [node.id, node.position, zoom, canvasOffset, selectNode, startDragging])

  const handleOutputPortMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const portX = node.position.x + node.size + 8
    const portY = node.position.y + node.size / 2
    startConnecting(node.id, portX, portY)
  }, [node.id, node.position, node.size, startConnecting])

  const handleInputPortMouseUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    finishConnecting(node.id)
  }, [node.id, finishConnecting])

  return (
    <div
      className="absolute select-none"
      style={{
        left: node.position.x,
        top: node.position.y,
        width: node.size,
        zIndex: node.isSelected ? 20 : node.isHovered ? 15 : 10,
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={() => { clearTimeout(leaveTimer.current); hoverNode(node.id) }}
      onMouseLeave={() => { leaveTimer.current = setTimeout(() => hoverNode(null), 200) }}
    >
      {/* Clock orbit for time-locked swaps */}
      {isTimeLocked && <ClockOrbit lockTime={lockTime} />}

      {/* Suggested nodes on hover */}
      {node.isHovered && (
        <SuggestedNodes
          parentId={node.id}
          parentType={node.type}
          parentX={node.position.x}
          parentY={node.position.y}
          parentSize={node.size}
        />
      )}

      {/* The Sphere */}
      <div className="relative" style={{ animation: 'float 6s ease-in-out infinite' }}>
        <SphereCanvas type={node.type} size={node.size} isSelected={node.isSelected} />
        {isAgentRunning && <AgentRunningRing size={node.size} color={meta.glow} />}
      </div>

      {/* Input port — invisible hit zone, glows when valid drop target */}
      <div
        className="absolute cursor-crosshair"
        style={{ left: -16, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, zIndex: 5 }}
        onMouseUp={handleInputPortMouseUp}
      >
        {isValidTarget && (
          <div style={{
            position: 'absolute', inset: 8, borderRadius: '50%',
            background: meta.glow,
            boxShadow: `0 0 0 3px ${meta.glow}44, 0 2px 8px ${meta.glow}66`,
            animation: 'pulseGlow 0.8s ease-in-out infinite',
          }} />
        )}
      </div>

      {/* Output port — + handle visible on hover */}
      <div
        className="absolute cursor-crosshair"
        style={{
          right: -16, top: '50%', transform: 'translateY(-50%)',
          width: 30, height: 30, zIndex: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseDown={handleOutputPortMouseDown}
      >
        {node.isHovered && !connectingFrom && (
          <div
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: meta.glow,
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 300, lineHeight: 1,
              boxShadow: `0 2px 14px ${meta.glow}88, 0 1px 4px rgba(0,0,0,0.12)`,
              animation: 'popIn 0.14s ease-out',
              userSelect: 'none',
            }}
          >
            +
          </div>
        )}
      </div>

      {/* Node label */}
      <div className="mt-2 text-center">
        <div
          className="font-sans text-xs font-semibold tracking-wide"
          style={{ color: meta.glow }}
        >
          {node.label}
        </div>
        {node.value && (
          <div className="font-mono text-xs mt-0.5" style={{ color: '#64748B', fontSize: '10px' }}>
            {node.value}
          </div>
        )}
      </div>
    </div>
  )
}
