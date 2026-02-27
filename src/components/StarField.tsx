import { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  r: number
  opacity: number
  twinkleSpeed: number
  twinklePhase: number
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const stars: Star[] = Array.from({ length: 220 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.3,
      opacity: Math.random() * 0.7 + 0.3,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      twinklePhase: Math.random() * Math.PI * 2,
    }))

    // Nebula blobs
    const nebulae = Array.from({ length: 5 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      rx: Math.random() * 300 + 150,
      ry: Math.random() * 200 + 100,
      hue: Math.random() < 0.5 ? 220 : 280,
      opacity: Math.random() * 0.06 + 0.02,
    }))

    let animId: number
    let t = 0

    const draw = () => {
      animId = requestAnimationFrame(draw)
      t += 0.016

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Nebulae
      nebulae.forEach(n => {
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, Math.max(n.rx, n.ry))
        grad.addColorStop(0, `hsla(${n.hue}, 70%, 55%, ${n.opacity})`)
        grad.addColorStop(1, 'transparent')
        ctx.save()
        ctx.scale(1, n.ry / n.rx)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(n.x, n.y * (n.rx / n.ry), n.rx, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      // Stars
      stars.forEach(s => {
        const opacity = s.opacity * (0.6 + 0.4 * Math.sin(t * s.twinkleSpeed * 60 + s.twinklePhase))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200, 220, 255, ${opacity})`
        ctx.fill()

        // Bright stars get a cross flare
        if (s.r > 1.2) {
          ctx.save()
          ctx.strokeStyle = `rgba(200, 220, 255, ${opacity * 0.3})`
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(s.x - s.r * 3, s.y)
          ctx.lineTo(s.x + s.r * 3, s.y)
          ctx.moveTo(s.x, s.y - s.r * 3)
          ctx.lineTo(s.x, s.y + s.r * 3)
          ctx.stroke()
          ctx.restore()
        }
      })
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
