import { useCallback, useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../store/graphStore'
import { SphereNode } from './SphereNode'
import { ConnectionLayer } from './ConnectionLayer'
import { AsteroidAnimation } from './AsteroidAnimation'

const MOMENTUM_FRICTION = 0.88  // velocity decay per frame (lower = stops faster)
const MOMENTUM_MIN = 0.4        // stop momentum below this px/frame

export function NodeGraph() {
  const nodes = useGraphStore(s => s.nodes)
  const draggingNodeId = useGraphStore(s => s.draggingNodeId)
  const dragNode = useGraphStore(s => s.dragNode)
  const stopDragging = useGraphStore(s => s.stopDragging)
  const selectNode = useGraphStore(s => s.selectNode)
  const cancelConnecting = useGraphStore(s => s.cancelConnecting)
  const setCursorPos = useGraphStore(s => s.setCursorPos)
  const panCanvas = useGraphStore(s => s.panCanvas)
  const zoomToward = useGraphStore(s => s.zoomToward)
  const zoom = useGraphStore(s => s.zoom)
  const canvasOffset = useGraphStore(s => s.canvasOffset)
  const connectingFrom = useGraphStore(s => s.connectingFrom)
  const finishConnecting = useGraphStore(s => s.finishConnecting)
  const removeNode = useGraphStore(s => s.removeNode)
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)

  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const isPanningRef = useRef(false)
  const lastPanPos = useRef({ x: 0, y: 0 })
  const didMoveRef = useRef(false)

  // Momentum
  const velocityRef = useRef({ x: 0, y: 0 })
  const lastMoveTime = useRef(0)
  const momentumRaf = useRef(0)

  const startPan = useCallback((x: number, y: number) => {
    cancelAnimationFrame(momentumRaf.current)
    velocityRef.current = { x: 0, y: 0 }
    isPanningRef.current = true
    setIsPanning(true)
    lastPanPos.current = { x, y }
    lastMoveTime.current = performance.now()
    didMoveRef.current = false
  }, [])

  const applyPan = useCallback((x: number, y: number) => {
    if (!isPanningRef.current) return
    const now = performance.now()
    const dt = Math.max(now - lastMoveTime.current, 1)
    const dx = x - lastPanPos.current.x
    const dy = y - lastPanPos.current.y
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) didMoveRef.current = true
    panCanvas(dx, dy)
    // Scale velocity to ~px/frame at 60 fps for momentum
    velocityRef.current = { x: dx / dt * 16, y: dy / dt * 16 }
    lastPanPos.current = { x, y }
    lastMoveTime.current = now
  }, [panCanvas])

  const endPan = useCallback(() => {
    if (!isPanningRef.current) return
    isPanningRef.current = false
    setIsPanning(false)
    const runMomentum = () => {
      const { x, y } = velocityRef.current
      if (Math.sqrt(x * x + y * y) < MOMENTUM_MIN) return
      panCanvas(x, y)
      velocityRef.current = { x: x * MOMENTUM_FRICTION, y: y * MOMENTUM_FRICTION }
      momentumRaf.current = requestAnimationFrame(runMomentum)
    }
    momentumRaf.current = requestAnimationFrame(runMomentum)
  }, [panCanvas])

  // Non-passive wheel listener so we can call preventDefault reliably
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch (browser maps pinch to wheel + ctrlKey)
        const factor = 1 - e.deltaY * 0.008
        zoomToward(zoom * factor, e.clientX, e.clientY)
      } else {
        // Two-finger scroll → pan (kill momentum so it feels immediate)
        cancelAnimationFrame(momentumRaf.current)
        panCanvas(-e.deltaX, -e.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, panCanvas, zoomToward])

  useEffect(() => () => cancelAnimationFrame(momentumRaf.current), [])

  // Keyboard: Delete/Backspace removes selected node; Escape cancels connection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        removeNode(selectedNodeId)
      }
      if (e.key === 'Escape') {
        selectNode(null)
        cancelConnecting()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNodeId, removeNode, selectNode, cancelConnecting])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Convert screen → canvas coords for the live connecting line.
    // useGraphStore.getState() avoids stale closure over canvasOffset/zoom.
    const { canvasOffset: co, zoom: z } = useGraphStore.getState()
    const top = containerRef.current?.getBoundingClientRect().top ?? 0
    setCursorPos(
      (e.clientX - co.x) / z,
      (e.clientY - top - co.y) / z,
    )
    if (draggingNodeId) {
      dragNode(e.clientX, e.clientY)
    } else {
      applyPan(e.clientX, e.clientY)
    }
  }, [draggingNodeId, dragNode, setCursorPos, applyPan])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle-click or left-click on empty canvas → pan
    if (e.button === 1) {
      e.preventDefault()
      startPan(e.clientX, e.clientY)
    } else if (e.button === 0 && e.target === e.currentTarget) {
      e.preventDefault()   // prevent text-selection highlight on drag
      startPan(e.clientX, e.clientY)
    }
  }, [startPan])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    stopDragging()

    // If we were drawing a connection, snap to nearest input port within threshold
    if (connectingFrom) {
      const SNAP_PX = 52
      let bestId: string | null = null
      let bestDist = SNAP_PX
      const containerTop = containerRef.current?.getBoundingClientRect().top ?? 0
      for (const node of nodes) {
        if (node.id === connectingFrom.nodeId) continue
        // Input port canvas position — matches getPortCenter(node, 'input')
        const portCanvasX = node.position.x - 8
        const portCanvasY = node.position.y + node.size / 2
        // Convert to screen coords for distance comparison
        const portScreenX = canvasOffset.x + portCanvasX * zoom
        const portScreenY = containerTop + canvasOffset.y + portCanvasY * zoom
        const dist = Math.hypot(e.clientX - portScreenX, e.clientY - portScreenY)
        if (dist < bestDist) { bestDist = dist; bestId = node.id }
      }
      if (bestId) finishConnecting(bestId)
      else cancelConnecting()
    } else {
      cancelConnecting()
    }

    if (!didMoveRef.current && e.target === e.currentTarget) {
      selectNode(null)
    }
    endPan()
  }, [connectingFrom, nodes, zoom, canvasOffset, finishConnecting, cancelConnecting,
      stopDragging, selectNode, endPan])

  const handleMouseLeave = useCallback(() => {
    stopDragging()
    endPan()
  }, [stopDragging, endPan])

  const cursor = draggingNodeId ? 'grabbing' : isPanning ? 'grabbing' : 'grab'

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        cursor,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(30,41,100,0.07) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        backgroundColor: '#F1F5FF',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
    >
      {/* Connection SVG layer */}
      <ConnectionLayer />

      {/* Nodes container — transformed */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {nodes.map(node => (
          <SphereNode key={node.id} node={node} />
        ))}
      </div>

      {/* Asteroid animations (screen space) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <AsteroidAnimation />
      </div>

      {/* Zoom indicator */}
      <div
        className="absolute bottom-4 right-4 font-mono text-xs px-3 py-1.5 rounded-full"
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.08)',
          color: '#64748B',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          fontSize: 10,
        }}
      >
        {Math.round(zoom * 100)}%
      </div>

      {/* Help text */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs px-3 py-1.5 rounded-full pointer-events-none"
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.07)',
          color: '#94A3B8',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          fontSize: 9,
          whiteSpace: 'nowrap',
        }}
      >
        Click+drag to pan · Two-finger scroll · Pinch to zoom · Drag ports to connect
      </div>
    </div>
  )
}
