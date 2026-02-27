import { useState } from 'react'
import { NodeType, NODE_TYPE_META } from '../types'
import { useGraphStore } from '../store/graphStore'

const NODE_TYPES: NodeType[] = ['swap', 'yield', 'distribute', 'wallet', 'agent']

export function NodePalette() {
  const addNode = useGraphStore(s => s.addNode)
  const canvasOffset = useGraphStore(s => s.canvasOffset)
  const zoom = useGraphStore(s => s.zoom)
  const [collapsed, setCollapsed] = useState(false)

  const handleAdd = (type: NodeType) => {
    const cx = (window.innerWidth / 2 - canvasOffset.x) / zoom - 50
    const cy = (window.innerHeight / 2 - canvasOffset.y) / zoom - 50
    addNode(type, {
      x: cx + (Math.random() - 0.5) * 200,
      y: cy + (Math.random() - 0.5) * 200,
    })
  }

  return (
    <div
      className="fixed left-4 top-1/2 -translate-y-1/2"
      style={{ zIndex: 100 }}
    >
      <div
        className="rounded-2xl flex flex-col"
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Header / toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
          style={{ minWidth: collapsed ? 'unset' : 160 }}
          title={collapsed ? 'Expand palette' : 'Collapse palette'}
        >
          <span className="text-xs font-mono" style={{ color: '#94A3B8', fontSize: 9, letterSpacing: '0.08em' }}>
            {collapsed ? '⊕' : 'ADD NODE'}
          </span>
          <span style={{ fontSize: 10, color: '#CBD5E1', marginLeft: collapsed ? 0 : 6, transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
            ‹
          </span>
        </button>

        {/* Node buttons — hidden when collapsed */}
        {!collapsed && (
          <div className="flex flex-col gap-1.5 px-3 pb-3">
            {NODE_TYPES.map(type => {
              const meta = NODE_TYPE_META[type]
              return (
                <button
                  key={type}
                  onClick={() => handleAdd(type)}
                  className="group flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: `${meta.color3}55`,
                    border: `1px solid ${meta.glow}22`,
                    minWidth: 148,
                  }}
                  title={meta.description}
                >
                  <div
                    style={{
                      width: 28, height: 28,
                      borderRadius: '50%',
                      background: `radial-gradient(circle at 36% 28%, #fff 0%, rgba(255,255,255,0.55) 18%, ${meta.color2} 52%, ${meta.color1} 100%)`,
                      boxShadow: `0 2px 8px ${meta.glow}55`,
                      flexShrink: 0,
                    }}
                  />
                  <div className="flex flex-col items-start min-w-0">
                    <span className="font-semibold" style={{ color: meta.glow, fontSize: 11 }}>
                      {meta.label}
                    </span>
                    <span style={{ color: '#94A3B8', fontSize: 9 }}>
                      {meta.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
