import React, { useEffect, useRef, useState, memo } from 'react'

const Landing3D = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const checkMobile = () => window.innerWidth < 768
    setIsMobile(checkMobile())
    
    const handleResize = () => setIsMobile(checkMobile())
    window.addEventListener('resize', handleResize, { passive: true })
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    let animationId: number
    let lastTime = 0
    const targetFPS = isMobile ? 24 : 60
    const frameInterval = 1000 / targetFPS
    const fadeOpacity = isMobile ? 0.12 : 0.08
    
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
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.scale(dpr, dpr)
    }

    const createParticles = () => {
      particles = []
      const count = isMobile 
        ? Math.min(18, Math.floor(window.innerWidth / 40))
        : Math.min(70, Math.floor(window.innerWidth / 20))
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * (isMobile ? 0.3 : 0.4),
          vy: (Math.random() - 0.5) * (isMobile ? 0.3 : 0.4),
          size: Math.random() * 2.5 + 0.5,
          opacity: Math.random() * 0.6 + 0.2,
          hue: 220 + Math.random() * 60
        })
      }
    }

    const drawConnections = () => {
      const maxDistance = isMobile ? 100 : 180
      const maxDistSq = maxDistance * maxDistance
      
      ctx.lineWidth = 0.8
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distSq = dx * dx + dy * dy

          if (distSq < maxDistSq) {
            const distance = Math.sqrt(distSq)
            const opacity = 0.15 * (1 - distance / maxDistance)
            ctx.beginPath()
            ctx.strokeStyle = `hsla(230, 80%, 60%, ${opacity})`
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
    }

    const animate = (currentTime: number) => {
      animationId = requestAnimationFrame(animate)
      
      const deltaTime = currentTime - lastTime
      if (deltaTime < frameInterval) return
      lastTime = currentTime - (deltaTime % frameInterval)

      ctx.fillStyle = `rgba(0, 0, 0, ${fadeOpacity})`
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)

      drawConnections()

      const w = window.innerWidth
      const h = window.innerHeight

      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1

        if (!isMobile) {
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4)
          gradient.addColorStop(0, `hsla(${p.hue}, 80%, 60%, ${p.opacity})`)
          gradient.addColorStop(0.5, `hsla(${p.hue}, 80%, 50%, ${p.opacity * 0.5})`)
          gradient.addColorStop(1, 'transparent')
          
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2)
          ctx.fillStyle = gradient
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${p.opacity})`
        ctx.fill()
      })
    }

    requestAnimationFrame(() => {
      resize()
      createParticles()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
      setIsLoaded(true)
      animationId = requestAnimationFrame(animate)
    })

    const handleCanvasResize = () => {
      resize()
      createParticles()
    }

    window.addEventListener('resize', handleCanvasResize, { passive: true })

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleCanvasResize)
    }
  }, [isMobile])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className={`w-full h-full transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black pointer-events-none" />
      {!isMobile && (
        <>
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[150px] animate-pulse pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-[120px] animate-pulse pointer-events-none" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-purple-600/10 rounded-full blur-[100px] animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />
        </>
      )}
      {isMobile && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-blue-600/10 rounded-full blur-[80px] pointer-events-none" />
      )}
    </div>
  )
})

Landing3D.displayName = 'Landing3D'

export default Landing3D