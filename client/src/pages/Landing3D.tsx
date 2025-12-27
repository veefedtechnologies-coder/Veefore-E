import React, { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  hue: number
  pulseOffset: number
}

const Landing3D = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    let width = 0
    let height = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      
      ctx.fillStyle = '#030303'
      ctx.fillRect(0, 0, width, height)
    }

    const initParticles = () => {
      const count = Math.min(70, Math.floor(width / 22))
      particlesRef.current = []
      
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 0.2 + Math.random() * 0.25
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 2 + 1.5,
          opacity: Math.random() * 0.4 + 0.4,
          hue: 220 + Math.random() * 50,
          pulseOffset: Math.random() * Math.PI * 2
        })
      }
    }

    const drawConnections = () => {
      const particles = particlesRef.current
      const connectionDistance = 160

      ctx.lineWidth = 0.5

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distSq = dx * dx + dy * dy

          if (distSq < connectionDistance * connectionDistance) {
            const distance = Math.sqrt(distSq)
            const opacity = 0.18 * (1 - distance / connectionDistance)
            ctx.beginPath()
            ctx.strokeStyle = `hsla(235, 70%, 60%, ${opacity})`
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
    }

    const drawParticles = (time: number) => {
      const particles = particlesRef.current

      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) }
        if (p.x > width) { p.x = width; p.vx = -Math.abs(p.vx) }
        if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) }
        if (p.y > height) { p.y = height; p.vy = -Math.abs(p.vy) }

        const pulse = Math.sin(time * 0.0008 + p.pulseOffset) * 0.2 + 0.8
        const currentOpacity = p.opacity * pulse

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5)
        gradient.addColorStop(0, `hsla(${p.hue}, 80%, 65%, ${currentOpacity * 0.7})`)
        gradient.addColorStop(0.3, `hsla(${p.hue}, 75%, 55%, ${currentOpacity * 0.35})`)
        gradient.addColorStop(1, 'transparent')
        
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${currentOpacity})`
        ctx.fill()
      })
    }

    const animate = (time: number) => {
      ctx.fillStyle = 'rgba(3, 3, 3, 0.18)'
      ctx.fillRect(0, 0, width, height)

      drawConnections()
      drawParticles(time)

      animationRef.current = requestAnimationFrame(animate)
    }

    resize()
    initParticles()
    
    ctx.fillStyle = '#030303'
    ctx.fillRect(0, 0, width, height)
    
    animationRef.current = requestAnimationFrame(animate)

    const handleResize = () => {
      resize()
      initParticles()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/80 pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-purple-600/8 rounded-full blur-[100px] pointer-events-none" />
    </div>
  )
}

export default Landing3D
