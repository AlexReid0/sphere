import { useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../store/graphStore'

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function AsteroidParticle({
  fromX, fromY, toX, toY, onComplete, amount,
}: {
  fromX: number; fromY: number; toX: number; toY: number
  onComplete: () => void; amount: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [impacting, setImpacting] = useState(false)
  const [shockwave, setShockwave] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = 22
    canvas.width = size
    canvas.height = size

    let animId: number
    const startTime = performance.now()
    const duration = 1600 // ms

    // Arc path - parabolic curve going up then down
    const midX = (fromX + toX) / 2
    const midY = Math.min(fromY, toY) - 80 // arc apex

    const draw = (now: number) => {
      const elapsed = now - startTime
      const raw = Math.min(elapsed / duration, 1)
      const t = easeInOutCubic(raw)

      // Quadratic bezier position
      const bx = lerp(lerp(fromX, midX, t), lerp(midX, toX, t), t)
      const by = lerp(lerp(fromY, midY, t), lerp(midY, toY, t), t)

      // Move the canvas element
      canvas.style.left = `${bx - size / 2}px`
      canvas.style.top = `${by - size / 2}px`

      // Draw asteroid
      ctx.clearRect(0, 0, size, size)
      const r = size / 2 - 2

      // Spin rotation
      ctx.save()
      ctx.translate(size / 2, size / 2)
      ctx.rotate(t * Math.PI * 6)

      // Rocky gradient
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r)
      grad.addColorStop(0, '#A89070')
      grad.addColorStop(0.5, '#6B5040')
      grad.addColorStop(1, '#3A2818')
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      // Rocky surface bumps
      ctx.strokeStyle = 'rgba(50, 30, 10, 0.6)'
      ctx.lineWidth = 0.5
      for (let i = 0; i < 4; i++) {
        const bumpX = (Math.sin(i * 2.1) * 0.5) * r
        const bumpY = (Math.cos(i * 1.7) * 0.5) * r
        ctx.beginPath()
        ctx.arc(bumpX, bumpY, r * 0.25, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Glow trailing tail
      const trailGrad = ctx.createRadialGradient(r * 0.4, r * 0.4, 0, r * 0.4, r * 0.4, r * 1.2)
      trailGrad.addColorStop(0, 'rgba(255, 150, 50, 0.6)')
      trailGrad.addColorStop(1, 'transparent')
      ctx.fillStyle = trailGrad
      ctx.beginPath()
      ctx.arc(r * 0.4, r * 0.4, r * 1.2, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      if (raw < 1) {
        animId = requestAnimationFrame(draw)
      } else {
        // Impact!
        setImpacting(true)
        setShockwave(true)
        setTimeout(() => onComplete(), 800)
      }
    }

    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [fromX, fromY, toX, toY, onComplete])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          zIndex: 50,
        }}
      />
      {impacting && (
        <div
          style={{
            position: 'absolute',
            left: toX - 40,
            top: toY - 40,
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,200,50,0.8) 0%, transparent 70%)',
            animation: 'shockwave 0.8s ease-out forwards',
            pointerEvents: 'none',
            zIndex: 51,
          }}
        />
      )}
      {impacting && (
        <div
          style={{
            position: 'absolute',
            left: toX - 20,
            top: toY - 6,
            fontFamily: 'Space Mono, monospace',
            fontSize: '11px',
            color: '#FFD700',
            fontWeight: 'bold',
            animation: 'float 1s ease-out forwards',
            pointerEvents: 'none',
            zIndex: 52,
            textShadow: '0 0 8px rgba(255, 215, 0, 0.8)',
            whiteSpace: 'nowrap',
          }}
        >
          +{amount}
        </div>
      )}
    </>
  )
}

export function AsteroidAnimation() {
  const asteroids = useGraphStore(s => s.asteroids)
  const nodes = useGraphStore(s => s.nodes)
  const removeAsteroid = useGraphStore(s => s.removeAsteroid)
  const canvasOffset = useGraphStore(s => s.canvasOffset)
  const zoom = useGraphStore(s => s.zoom)

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  return (
    <>
      {asteroids.map(ast => {
        const from = nodeMap.get(ast.fromNodeId)
        const to = nodeMap.get(ast.toNodeId)
        if (!from || !to) return null

        const halfFrom = from.size / 2
        const halfTo = to.size / 2

        const fromX = (from.position.x + halfFrom) * zoom + canvasOffset.x
        const fromY = (from.position.y + halfFrom + 50) * zoom + canvasOffset.y
        const toX = (to.position.x + halfTo) * zoom + canvasOffset.x
        const toY = (to.position.y + halfTo + 50) * zoom + canvasOffset.y

        return (
          <AsteroidParticle
            key={ast.id}
            fromX={fromX}
            fromY={fromY}
            toX={toX}
            toY={toY}
            amount={ast.amount}
            onComplete={() => removeAsteroid(ast.id)}
          />
        )
      })}
    </>
  )
}
