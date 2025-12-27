import React, { useEffect, useRef } from 'react'

const Landing3D = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      opacity: number
      hue: number
    }> = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const createParticles = () => {
      particles = []
      const count = Math.min(100, Math.floor(window.innerWidth / 15))
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          size: Math.random() * 2.5 + 0.5,
          opacity: Math.random() * 0.6 + 0.2,
          hue: 220 + Math.random() * 60
        })
      }
    }

    const drawConnections = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 180) {
            const opacity = 0.15 * (1 - distance / 180)
            ctx.beginPath()
            ctx.strokeStyle = `hsla(230, 80%, 60%, ${opacity})`
            ctx.lineWidth = 0.8
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
    }

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      drawConnections()

      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4)
        gradient.addColorStop(0, `hsla(${p.hue}, 80%, 60%, ${p.opacity})`)
        gradient.addColorStop(0.5, `hsla(${p.hue}, 80%, 50%, ${p.opacity * 0.5})`)
        gradient.addColorStop(1, 'transparent')
        
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${p.opacity})`
        ctx.fill()
      })

      animationId = requestAnimationFrame(animate)
    }

    resize()
    createParticles()
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    animate()

    const handleResize = () => {
      resize()
      createParticles()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[150px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-[120px] animate-pulse pointer-events-none" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-purple-600/10 rounded-full blur-[100px] animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />
    </div>
  )
}

export default Landing3D