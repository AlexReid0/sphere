import { NodeType, NODE_TYPE_META } from '../types'

interface SphereCanvasProps {
  type: NodeType
  size: number
  isSelected?: boolean
}

export function SphereCanvas({ type, size, isSelected }: SphereCanvasProps) {
  const meta = NODE_TYPE_META[type]

  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      {/* Sphere body */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: `radial-gradient(
            circle at 36% 28%,
            #ffffff 0%,
            rgba(255,255,255,0.62) 16%,
            ${meta.color2} 52%,
            ${meta.color1} 100%
          )`,
          boxShadow: isSelected
            ? `0 0 0 2.5px ${meta.glow}, 0 8px 30px ${meta.glow}99, 0 2px 12px rgba(0,0,0,0.14)`
            : `0 4px 18px ${meta.glow}77, 0 1px 6px rgba(0,0,0,0.09)`,
          transition: 'box-shadow 0.3s ease',
        }}
      />

      {/* Soft ground shadow for depth */}
      <div
        style={{
          position: 'absolute',
          bottom: -Math.round(size * 0.07),
          left: '20%',
          right: '20%',
          height: Math.round(size * 0.15),
          background: `radial-gradient(ellipse, ${meta.color1}44 0%, transparent 70%)`,
          borderRadius: '50%',
          filter: 'blur(3px)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
