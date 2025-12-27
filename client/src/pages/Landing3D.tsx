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
      ctx.scale(dpr, dpr)
    }

    const initParticles = () => {
      const count = Math.min(80, Math.floor(width / 20))
      particlesRef.current = []
      
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 2 + 1,
          opacity: Math.random() * 0.5 + 0.3,
          hue: 220 + Math.random() * 50,
          pulseOffset: Math.random() * Math.PI * 2
        })
      }
    }

    const drawConnections = (time: number) => {
      const particles = particlesRef.current
      const connectionDistance = 150

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < connectionDistance) {
            const opacity = 0.12 * (1 - distance / connectionDistance)
            ctx.beginPath()
            ctx.strokeStyle = `hsla(230, 70%, 55%, ${opacity})`
            ctx.lineWidth = 0.6
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

        if (p.x < 0) { p.x = 0; p.vx *= -1 }
        if (p.x > width) { p.x = width; p.vx *= -1 }
        if (p.y < 0) { p.y = 0; p.vy *= -1 }
        if (p.y > height) { p.y = height; p.vy *= -1 }

        const pulse = Math.sin(time * 0.001 + p.pulseOffset) * 0.15 + 0.85
        const currentOpacity = p.opacity * pulse

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6)
        gradient.addColorStop(0, `hsla(${p.hue}, 75%, 60%, ${currentOpacity * 0.8})`)
        gradient.addColorStop(0.4, `hsla(${p.hue}, 70%, 50%, ${currentOpacity * 0.3})`)
        gradient.addColorStop(1, 'transparent')
        
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 6, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${currentOpacity})`
        ctx.fill()
      })
    }

    const animate = (time: number) => {
      ctx.fillStyle = '#030303'
      ctx.fillRect(0, 0, width, height)

      drawConnections(time)
      drawParticles(time)

      animationRef.current = requestAnimationFrame(animate)
    }

    resize()
    initParticles()
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
