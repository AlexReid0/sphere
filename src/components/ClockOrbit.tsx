import { useEffect, useRef } from 'react'

interface ClockOrbitProps {
  lockTime?: string
}

function Clock3D({ angle, size = 28 }: { angle: number; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number

    const draw = () => {
      animId = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, size, size)
      const r = size / 2 - 2
      const cx = size / 2
      const cy = size / 2

      // Clock face (3D pill)
      const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r)
      grad.addColorStop(0, 'rgba(200, 180, 100, 0.95)')
      grad.addColorStop(0.6, 'rgba(120, 100, 40, 0.9)')
      grad.addColorStop(1, 'rgba(60, 50, 20, 0.8)')

      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 220, 80, 0.6)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Hour markers
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2
        const x1 = cx + Math.cos(a) * (r - 4)
        const y1 = cy + Math.sin(a) * (r - 4)
        const x2 = cx + Math.cos(a) * (r - 7)
        const y2 = cy + Math.sin(a) * (r - 7)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = 'rgba(255, 230, 100, 0.8)'
        ctx.lineWidth = i % 3 === 0 ? 1.5 : 0.8
        ctx.stroke()
      }

      // Clock hands
      const now = Date.now() / 1000
      const secondAngle = (now % 60) / 60 * Math.PI * 2 - Math.PI / 2
      const minuteAngle = (now % 3600) / 3600 * Math.PI * 2 - Math.PI / 2
      const hourAngle = (now % 43200) / 43200 * Math.PI * 2 - Math.PI / 2

      // Hour hand
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(hourAngle) * (r * 0.45), cy + Math.sin(hourAngle) * (r * 0.45))
      ctx.strokeStyle = 'rgba(255, 220, 80, 0.95)'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.stroke()

      // Minute hand
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(minuteAngle) * (r * 0.65), cy + Math.sin(minuteAngle) * (r * 0.65))
      ctx.strokeStyle = 'rgba(255, 230, 120, 0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Second hand
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(secondAngle) * (r * 0.72), cy + Math.sin(secondAngle) * (r * 0.72))
      ctx.strokeStyle = 'rgba(255, 80, 40, 0.9)'
      ctx.lineWidth = 0.8
      ctx.stroke()

      // Center dot
      ctx.beginPath()
      ctx.arc(cx, cy, 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 200, 60, 1)'
      ctx.fill()
    }
    draw()

    return () => cancelAnimationFrame(animId)
  }, [size])

  const orbitRadius = 42
  const x = Math.cos((angle * Math.PI) / 180) * orbitRadius
  const y = Math.sin((angle * Math.PI) / 180) * orbitRadius

  return (
    <div
      className="absolute"
      style={{
        left: `calc(50% + ${x}px - ${size / 2}px)`,
        top: `calc(50% + ${y}px - ${size / 2}px)`,
        animation: `orbit ${8 + angle * 0.03}s linear infinite`,
        transformOrigin: `${-x}px ${-y}px`,
        filter: 'drop-shadow(0 0 6px rgba(255, 180, 40, 0.8))',
      }}
    >
      <canvas ref={canvasRef} width={size} height={size} />
    </div>
  )
}

export function ClockOrbit({ lockTime }: ClockOrbitProps) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
      <Clock3D angle={0} size={26} />
      <Clock3D angle={135} size={22} />
      <Clock3D angle={250} size={24} />

      {/* Time label */}
      {lockTime && (
        <div
          className="absolute font-mono text-xs text-yellow-300 text-center whitespace-nowrap"
          style={{
            left: '50%',
            top: 'calc(100% + 2px)',
            transform: 'translateX(-50%)',
            fontSize: '9px',
            opacity: 0.85,
            textShadow: '0 0 8px rgba(255, 180, 40, 0.8)',
          }}
        >
          🔒 {new Date(lockTime).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}
