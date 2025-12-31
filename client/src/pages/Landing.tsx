import React, { useState, useEffect, useRef, Suspense, useCallback, memo } from 'react'
import { motion, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Play, Zap, CheckCircle, MessageSquare, Bot, TrendingUp,
  Users, Sparkles, Brain, Rocket, Plus,
  Clock, Shield, BarChart3, Send, Layers,
  Crown, RefreshCw, Lock, Menu, ChevronDown,
  X, Instagram, Twitter, Linkedin, Mail,
  MessageCircle, Check, DollarSign, Search
} from 'lucide-react'
import { SEO, seoConfig } from '../lib/seo-optimization'
import { useIsMobile } from '../hooks/use-is-mobile';
import GlassCard from '../components/GlassCard';
import { PricingScrollAnimation } from '../components/PricingScrollAnimation';
import { CinematicFeatures } from '../components/CinematicFeatures';
import { EngagementVisual, DMVisual, HookVisual } from '../components/USPVisuals';
import TargetAudienceSection from '../components/TargetAudienceSection';
import GrowthEngineSection from '../components/GrowthEngineSection';
import CreditSystemSection from '../components/CreditSystemSection';
import BetaLaunchSection from '../components/BetaLaunchSection';

// Check if device should have reduced animations (low-end mobile, reduced motion preference)




const Landing3D = React.lazy(() => import('./Landing3D'))

// Ultra-lightweight mobile background - NO blur effects for instant load
const MobileBackground = memo(() => (
  <div className="absolute inset-0 bg-[#030303] overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-purple-950/20 to-transparent" />
    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/30 via-transparent to-transparent" />
  </div>
))

const Landing3DFallback = memo(() => (
  <div className="absolute inset-0 bg-black">
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-blue-600/10 rounded-full blur-[80px]" />
  </div>
))

import StickyScrollFeaturesV2 from '../components/StickyScrollFeaturesV2';
// Mobile-optimized gradient orbs - use opacity gradient instead of expensive blur
const GradientOrb = ({ className, color = 'blue' }: { className?: string, color?: string }) => {
  const isMobile = useIsMobile()
  const colors = {
    blue: isMobile ? 'bg-blue-600/10' : 'from-blue-500/30 via-blue-600/20 to-transparent',
    purple: isMobile ? 'bg-purple-600/10' : 'from-purple-500/30 via-purple-600/20 to-transparent',
    indigo: isMobile ? 'bg-indigo-500/8' : 'from-indigo-500/30 via-indigo-600/20 to-transparent',
    cyan: isMobile ? 'bg-cyan-500/8' : 'from-cyan-500/20 via-cyan-600/10 to-transparent'
  }

  // On mobile, skip blur entirely for performance
  if (isMobile) {
    return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
  }

  return (
    <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
  )
}

const MagneticButton = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => {
  const isMobile = useIsMobile()
  const ref = useRef<HTMLButtonElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 300, damping: 20 })
  const springY = useSpring(y, { stiffness: 300, damping: 20 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isMobile || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    x.set((e.clientX - centerX) * 0.15)
    y.set((e.clientY - centerY) * 0.15)
  }

  const handleMouseLeave = () => {
    if (isMobile) return
    x.set(0)
    y.set(0)
  }

  if (isMobile) {
    return (
      <button ref={ref} onClick={onClick} className={className}>
        {children}
      </button>
    )
  }

  return (
    <motion.button
      ref={ref}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.button>
  )
}

const taglines = [
  { top: "Posting is not growth.", bottom: "Engagement is." },
  { top: "Respond faster.", bottom: "Engage at scale." },
  { top: "Automate engagement.", bottom: "Maintain momentum." },
  { top: "Turn attention", bottom: "into interaction." },
  { top: "AI that actively", bottom: "grows your account." },
  { top: "Smart comments.", bottom: "Smarter DMs." }
]

const Marquee = memo(({ children, direction = 'left' }: { children: React.ReactNode, direction?: 'left' | 'right' }) => {
  return (
    <div className="flex overflow-hidden w-full mask-linear-fade">
      <motion.div
        className="flex items-center space-x-8 md:space-x-16 pr-8 md:pr-16 shrink-0 will-change-transform"
        animate={{ x: direction === 'left' ? ["0%", "-100%"] : ["-100%", "0%"] }}
        transition={{
          duration: 40, // Slower, smoother
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop"
        }}
      >
        {children}
      </motion.div>
      <motion.div
        className="flex items-center space-x-8 md:space-x-16 pr-8 md:pr-16 shrink-0 will-change-transform"
        animate={{ x: direction === 'left' ? ["0%", "-100%"] : ["-100%", "0%"] }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop"
        }}
      >
        {children}
      </motion.div>
    </div>
  )
})

const RotatingHeroText = memo(() => {
  const isMobile = useIsMobile()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState(-1)
  const [isReady, setIsReady] = useState(false)

  // Delay rotation start on mobile to allow fast initial render
  useEffect(() => {
    const delay = isMobile ? 2000 : 500
    const timer = setTimeout(() => setIsReady(true), delay)
    return () => clearTimeout(timer)
  }, [isMobile])

  useEffect(() => {
    if (!isReady) return
    const interval = setInterval(() => {
      setPrevIndex(currentIndex)
      setCurrentIndex((prev) => (prev + 1) % taglines.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [currentIndex, isReady])

  return (
    <div className="relative overflow-visible" style={{ height: 'clamp(10rem, 25vw, 16rem)', paddingBottom: '0.5em' }}>
      {taglines.map((tagline, index) => {
        const isActive = currentIndex === index
        const isExiting = prevIndex === index

        return (
          <motion.div
            key={index}
            initial={false}
            animate={{
              opacity: isActive ? 1 : 0,
              y: isActive ? 0 : (isExiting ? '-100%' : '100%'),
              filter: isMobile ? 'none' : (isActive ? 'blur(0px)' : 'blur(8px)'),
              scale: isActive ? 1 : 0.95
            }}
            transition={{
              duration: isMobile ? 0.5 : 0.9,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="absolute inset-0 flex flex-col items-center justify-center will-change-transform"
            style={{ pointerEvents: isActive ? 'auto' : 'none' }}
          >
            <span className="block text-white" style={{ lineHeight: '1.15' }}>
              {tagline.top}
            </span>
            <span
              className="block mt-1 pb-2"
              style={{
                lineHeight: '1.2',
                background: 'linear-gradient(to right, #60a5fa, #818cf8, #a78bfa)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent'
              }}
            >
              {tagline.bottom}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
})



const TiltCard = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-100, 100], [8, -8])
  const rotateY = useTransform(x, [-100, 100], [-8, 8])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isMobile || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    x.set(e.clientX - centerX)
    y.set(e.clientY - centerY)
  }

  const handleMouseLeave = () => {
    if (isMobile) return
    x.set(0)
    y.set(0)
  }

  if (isMobile) {
    return <div ref={ref} className={className}>{children}</div>
  }

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`${className}`}
    >
      {children}
    </motion.div>
  )
}

const DashboardPageContent = memo(() => (
  <div className="space-y-4">
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: 'Total Engagements', value: '24,847', change: '+18%', color: 'text-blue-400' },
        { label: 'DMs Processed', value: '3,291', change: '+42%', color: 'text-purple-400' },
        { label: 'Hooks Created', value: '847', change: '+28%', color: 'text-pink-400' },
        { label: 'Credits Used', value: '892/1200', change: '74%', color: 'text-amber-400' }
      ].map((stat) => (
        <div key={stat.label} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[10px] text-white/40 mb-1">{stat.label}</p>
          <div className="flex items-end justify-between">
            <span className="text-xl font-bold">{stat.value}</span>
            <span className={`text-xs ${stat.color}`}>{stat.change}</span>
          </div>
        </div>
      ))}
    </div>
    <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">Engagement Velocity</h4>
        <div className="flex items-center space-x-2 text-xs text-white/40">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5" />Comments</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-purple-500 mr-1.5" />DMs</span>
        </div>
      </div>
      <div className="h-32 flex items-end space-x-2">
        {[40, 55, 45, 70, 60, 80, 75, 90, 85, 95, 88, 100].map((h, i) => (
          <div key={i} style={{ height: `${h}%` }} className="flex-1 rounded-t-sm bg-gradient-to-t from-blue-600 to-blue-400" />
        ))}
      </div>
    </div>
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <h4 className="text-sm font-medium mb-3">Recent AI Activity</h4>
      <div className="space-y-2">
        {[
          { text: 'Replied to 12 comments on latest post', time: '2m ago' },
          { text: 'Processed 8 DM inquiries automatically', time: '5m ago' },
          { text: 'Generated 3 hook variations for carousel', time: '8m ago' }
        ].map((activity, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
            <span className="text-xs text-white/60">{activity.text}</span>
            <span className="text-[10px] text-white/30">{activity.time}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
))

const EngagementPageContent = memo(() => (
  <div className="space-y-4">
    <div className="p-5 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Comment Automation</h4>
            <p className="text-xs text-white/40">AI-powered reply engine active</p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>Active</span>
        </div>
      </div>
      <div className="space-y-3">
        {[
          { user: '@sarah_creates', comment: 'Love this content! How do you...', reply: 'Thanks Sarah! I use a combination of...', status: 'sent' },
          { user: '@mike_growth', comment: 'Can you share more about your process?', reply: 'Absolutely! My process involves...', status: 'sending' },
          { user: '@julia_design', comment: 'This is exactly what I needed!', reply: 'So glad it helped Julia! Check out...', status: 'queued' }
        ].map((item, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium text-blue-400">{item.user}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === 'sent' ? 'bg-green-500/20 text-green-400' : item.status === 'sending' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40'}`}>{item.status}</span>
            </div>
            <p className="text-[11px] text-white/50 mb-1.5">"{item.comment}"</p>
            <div className="flex items-center space-x-2">
              <Bot className="w-3 h-3 text-purple-400" />
              <p className="text-[11px] text-white/70">{item.reply}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="p-5 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">DM Automation</h4>
            <p className="text-xs text-white/40">Smart funnel responses</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-purple-400">847</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[{ label: 'Leads Captured', value: '324' }, { label: 'Responded', value: '98%' }, { label: 'Converted', value: '23%' }].map((s, i) => (
          <div key={i} className="p-2 rounded-lg bg-white/[0.03]">
            <p className="text-lg font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-white/40">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
))

const HooksPageContent = memo(() => (
  <div className="space-y-4">
    <div className="p-5 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">AI Hook Generator</h4>
            <p className="text-xs text-white/40">Trending patterns detected</p>
          </div>
        </div>
        <Sparkles className="w-5 h-5 text-indigo-400" />
      </div>
      <div className="space-y-3">
        {[
          { hook: "Stop scrolling. This changed everything for me...", score: 94, type: 'Curiosity' },
          { hook: "I made $10K in 30 days using this one strategy", score: 91, type: 'Result' },
          { hook: "Nobody talks about this creator secret...", score: 88, type: 'Exclusive' }
        ].map((item, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm text-white/80 flex-1">"{item.hook}"</p>
              <div className="ml-3 flex items-center space-x-1 px-2 py-0.5 rounded-full bg-green-500/20">
                <span className="text-xs font-bold text-green-400">{item.score}</span>
                <TrendingUp className="w-3 h-3 text-green-400" />
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">{item.type}</span>
          </div>
        ))}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <h5 className="text-xs font-medium text-white/60 mb-2">Trending Patterns</h5>
        <div className="flex flex-wrap gap-1.5">
          {['Story hooks', 'Questions', 'Contrarian', 'Numbers', 'Emotional'].map((tag) => (
            <span key={tag} className="px-2 py-1 text-[10px] rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20">{tag}</span>
          ))}
        </div>
      </div>
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <h5 className="text-xs font-medium text-white/60 mb-2">Your Hook Score</h5>
        <div className="flex items-end space-x-2">
          <span className="text-3xl font-bold text-indigo-400">87</span>
          <span className="text-xs text-green-400 mb-1">+12 this week</span>
        </div>
      </div>
    </div>
  </div>
))

const BASE_WIDTH = 1000
const BASE_HEIGHT = 600

const AnimatedDashboard = memo(() => {
  const [activePage, setActivePage] = useState(0)
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 12 })
  const [isClicking, setIsClicking] = useState(false)
  const [scale, setScale] = useState(1)
  const [isMobile, setIsMobile] = useState(false)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const sidebarRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkMobile = () => window.innerWidth < 768
    setIsMobile(checkMobile())
    const handleResize = () => setIsMobile(checkMobile())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const sidebarItems = [
    { name: 'Dashboard', pageIndex: 0 },
    { name: 'Engagement', pageIndex: 1 },
    { name: 'DM Funnels', pageIndex: null },
    { name: 'Hooks', pageIndex: 2 },
    { name: 'Analytics', pageIndex: null }
  ]

  const getCursorPosition = useCallback((itemIndex: number) => {
    const item = itemRefs.current[itemIndex]
    const sidebar = sidebarRef.current
    if (item && sidebar) {
      const itemRect = item.getBoundingClientRect()
      const sidebarRect = sidebar.getBoundingClientRect()
      const parentScale = sidebarRect.width > 0 ? (item.offsetWidth / (itemRect.width || 1)) : 1
      return {
        x: ((itemRect.left - sidebarRect.left) * parentScale) + item.offsetWidth / 2 + 8,
        y: ((itemRect.top - sidebarRect.top) * parentScale) + item.offsetHeight / 2
      }
    }
    const baseY = 12
    const itemHeight = 32
    return { x: 50, y: baseY + (itemIndex * itemHeight) }
  }, [])

  useEffect(() => {
    let isMounted = true
    const timeouts: NodeJS.Timeout[] = []

    const addTimeout = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay)
      timeouts.push(id)
      return id
    }

    const runSequence = () => {
      if (!isMounted) return

      addTimeout(() => {
        if (!isMounted) return
        setCursorPos(getCursorPosition(0))
        setActivePage(0)
      }, 100)

      addTimeout(() => {
        if (!isMounted) return
        setCursorPos(getCursorPosition(1))
      }, 3000)

      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(true)
      }, 3600)

      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(false)
        setActivePage(1)
      }, 3750)

      addTimeout(() => {
        if (!isMounted) return
        setCursorPos(getCursorPosition(3))
      }, 7750)

      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(true)
      }, 8350)

      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(false)
        setActivePage(2)
      }, 8500)

      addTimeout(() => {
        if (!isMounted) return
        setCursorPos(getCursorPosition(0))
      }, 12500)

      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(true)
      }, 13100)

      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(false)
        setActivePage(0)
      }, 13250)

      addTimeout(() => {
        if (!isMounted) return
        runSequence()
      }, 16250)
    }

    addTimeout(() => runSequence(), 500)

    return () => {
      isMounted = false
      timeouts.forEach(clearTimeout)
    }
  }, [getCursorPosition, isMobile])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const updateScale = () => {
      const wrapperWidth = wrapper.offsetWidth
      const newScale = Math.min(wrapperWidth / BASE_WIDTH, 1)
      setScale(newScale)
    }

    updateScale()

    const resizeObserver = new ResizeObserver(updateScale)
    resizeObserver.observe(wrapper)

    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div ref={wrapperRef} className="relative mx-auto max-w-[1000px] w-full">
      <div
        style={{
          height: BASE_HEIGHT * scale,
          overflow: 'hidden'
        }}
      >
        <div
          className="relative rounded-[20px] border border-white/10 bg-[#0a0a0a] shadow-[0_0_100px_rgba(59,130,246,0.15)] overflow-hidden"
          style={{
            width: BASE_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#0d0d0d]">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/40">
              <Clock className="w-3 h-3" />
              <span>Live Dashboard</span>
            </div>
            <img src="/veefore-logo.png" alt="Veefore" className="w-8 h-8 object-contain" />
          </div>
          <div className="p-6 bg-gradient-to-b from-[#0a0a0a] to-[#0f0f0f] relative">
            <div className="grid grid-cols-12 gap-4">
              <div ref={sidebarRef} className="col-span-2 space-y-1 relative">
                <motion.div
                  className="absolute pointer-events-none z-50 will-change-transform"
                  style={{ width: 20, height: 20 }}
                  animate={{
                    left: cursorPos.x - 10,
                    top: cursorPos.y - 10,
                    scale: isClicking ? 0.85 : 1
                  }}
                  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                    <path d="M5.5 3.21V20.79c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87a.5.5 0 00.35-.85L6.35 2.86a.5.5 0 00-.85.35z" fill="#fff" stroke="#1a1a1a" strokeWidth="1.5" />
                  </svg>
                  {isClicking && (
                    <motion.div
                      initial={{ scale: 0.3, opacity: 0.8 }}
                      animate={{ scale: 1.8, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-blue-400/60"
                    />
                  )}
                </motion.div>
                {sidebarItems.map((item, i) => {
                  const isActive = item.pageIndex === activePage
                  return (
                    <div
                      key={item.name}
                      ref={el => { itemRefs.current[i] = el }}
                      className={`px-3 py-2 rounded-lg text-xs border ${isActive ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' : 'text-white/40 border-transparent'}`}
                    >
                      {item.name}
                    </div>
                  )
                })}
              </div>
              <div className="col-span-10 relative overflow-hidden" style={{ minHeight: '520px' }}>
                <div
                  className="absolute inset-0 transition-opacity duration-300 ease-in-out"
                  style={{ opacity: activePage === 0 ? 1 : 0, pointerEvents: activePage === 0 ? 'auto' : 'none' }}
                >
                  <DashboardPageContent />
                </div>
                <div
                  className="absolute inset-0 transition-opacity duration-300 ease-in-out"
                  style={{ opacity: activePage === 1 ? 1 : 0, pointerEvents: activePage === 1 ? 'auto' : 'none' }}
                >
                  <EngagementPageContent />
                </div>
                <div
                  className="absolute inset-0 transition-opacity duration-300 ease-in-out"
                  style={{ opacity: activePage === 2 ? 1 : 0, pointerEvents: activePage === 2 ? 'auto' : 'none' }}
                >
                  <HooksPageContent />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

const Landing = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const isMobile = useIsMobile()
  const [activeFaq, setActiveFaq] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // HUD State for Algorithm Science section
  const [hudActiveSignal, setHudActiveSignal] = useState<number | null>(null);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  // Initialize to true (scrolled/solid state) to prevent flash of transparent on reload
  const [isScrolled, setIsScrolled] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollY, scrollYProgress } = useScroll()

  // Check initial scroll position immediately on mount
  useEffect(() => {
    // Set correct initial state based on current scroll position
    const initialScroll = window.scrollY || window.pageYOffset || 0;
    setIsScrolled(initialScroll > 50);
  }, []);

  useEffect(() => {
    return scrollY.on('change', (latest) => {
      setIsScrolled(latest > 50)
    })
  }, [scrollY])

  const heroOpacity = useTransform(scrollYProgress, isMobile ? [0, 1] : [0, 0.15], [1, isMobile ? 1 : 0])
  const heroScale = useTransform(scrollYProgress, isMobile ? [0, 1] : [0, 0.15], [1, isMobile ? 1 : 0.95])
  const heroY = useTransform(scrollYProgress, isMobile ? [0, 1] : [0, 0.15], [0, isMobile ? 0 : -50])

  const heroFeatures = [
    {
      id: 'engagement-automation',
      icon: MessageSquare,
      title: 'AI Engagement Automation',
      tagline: 'Increase engagement velocity and consistency.',
      description: 'Fast, meaningful engagement directly boosts algorithmic reach. This is VeeFore\'s strongest differentiator.',
      details: ['Context-aware comment replies', 'Priority handling of high-value comments', 'Human-like tone control', 'Platform-safe automation limits'],
      gradient: 'from-blue-500 to-cyan-500',
      visual: <EngagementVisual />
    },
    {
      id: 'dm-automation',
      icon: Send,
      title: 'Smart DM Automation',
      tagline: 'Turn DMs into scalable growth and monetization channels.',
      description: 'Creators lose opportunities in DMs. VeeFore captures them without spam.',
      details: ['Keyword-triggered replies', 'Lead qualification logic', 'Creator-defined safety boundaries', 'Advanced follow-up funnels'],
      gradient: 'from-purple-500 to-pink-500',
      visual: <DMVisual />
    },
    {
      id: 'hook-intelligence',
      icon: Brain,
      title: 'AI Hook & Trend Intelligence',
      tagline: 'Remove guesswork from content creation.',
      description: 'Creators don\'t need trends. They need explanations. VeeFore provides intelligence, not noise.',
      details: ['Competitor hook extraction', 'Emotional pattern analysis', 'Niche-specific suggestions', 'Viral pattern prediction'],
      gradient: 'from-indigo-500 to-purple-500',
      visual: <HookVisual />
    }
  ]

  const pricingPlans = [
    {
      name: 'Starter',
      price: billingCycle === 'monthly' ? 399 : 3990,
      credits: 300,
      description: 'For new creators testing growth',
      features: ['AI Hook Generator', 'Caption & CTA Engine', 'Basic Scheduler', '1 Competitor', 'Read-only Analytics'],
      locked: ['Comment Automation', 'DM Automation', 'Adaptive AI'],
      gradient: 'from-slate-500/20 to-slate-600/10',
      border: 'border-white/10'
    },
    {
      name: 'Growth',
      price: billingCycle === 'monthly' ? 899 : 8990,
      credits: 1200,
      description: 'For serious creators ready to scale',
      features: ['Everything in Starter', 'AI Comment Automation', 'Smart DM Replies', 'Hook Intelligence', 'Unlimited Scheduling', '3 Competitors', 'Adaptive AI Loop', 'Full Analytics'],
      locked: [],
      gradient: 'from-blue-500/20 to-indigo-500/20',
      border: 'border-blue-500/30',
      popular: true
    },
    {
      name: 'Pro',
      price: billingCycle === 'monthly' ? 1999 : 19990,
      credits: 3000,
      description: 'For agencies and power users',
      features: ['Everything in Growth', '3-5 Social Accounts', 'Advanced DM Funnels', 'Team Access (2-5)', 'Priority Processing', 'Dedicated Support'],
      locked: [],
      gradient: 'from-purple-500/20 to-pink-500/20',
      border: 'border-purple-500/30'
    }
  ]



  const faqs = [
    { q: "What exactly is VeeFore?", a: "VeeFore is an AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically. Unlike schedulers or content tools, VeeFore participates in your growth through AI-driven engagement automation, hook intelligence, and smart DM funnels." },
    { q: "How is VeeFore different from other tools?", a: "Most tools help you create and schedule. VeeFore helps you RESPOND faster, ENGAGE at scale, and MAINTAIN momentum. We follow a Growth-First philosophy: engagement before volume, interaction before impressions." },
    { q: "Is the automation safe?", a: "Absolutely. VeeFore uses context-aware AI with human-like tone control and strictly adheres to platform-safe automation limits. Our system mimics natural engagement patterns to protect your account." },
    { q: "How does the credit system work?", a: "1 Credit = 1 AI Action. Actions include generating hooks, creating captions, replying to comments or DMs. Credits reset monthly. Starter gets 300, Growth gets 1,200, Pro gets 3,000 credits." },
    { q: "What do I get by joining the beta?", a: "Beta members get 500 bonus credits, a surprise exclusive feature, 30 days free trial when we launch, and priority email updates about pricing and new features." },
    { q: "Who is VeeFore for?", a: "Instagram & short-form creators with 5k-200k followers who value time and want scale without spam. Not for casual posters or hobby accounts." }
  ]

  return (
    <div ref={containerRef} className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
      <SEO {...seoConfig.landing} />

      {/* Ambient Background - absolute on mobile to avoid iOS fixed stacking issues */}
      <div className={`${isMobile ? 'absolute h-[500vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
        <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
        <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
        <GradientOrb className={`${isMobile ? 'w-[250px] h-[250px]' : 'w-[500px] h-[500px]'} bottom-[10%] left-[20%]`} color="indigo" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
      </div>

      {/* Navigation - use wrapper for sticky/fixed to avoid iOS Safari transform issues */}
      <div className="landing-nav-wrapper w-full z-50">
        <motion.nav
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <div 
            className={`transition-[margin] duration-150 ease-linear ${isScrolled 
              ? 'mx-2 sm:mx-4 mt-2 sm:mt-3' 
              : 'mx-0 mt-4 sm:mt-4 md:mt-5'
            }`}
          >
            <GlassCard
              className={`mx-auto transition-[max-width,border-radius,background-color,backdrop-filter,box-shadow,padding] duration-150 ease-linear ${isScrolled
                ? 'max-w-[1200px] !rounded-full bg-black/60 backdrop-blur-xl border-white/10 shadow-lg shadow-black/20 px-3 sm:px-5 py-2 sm:py-2'
                : 'max-w-full !rounded-none !bg-transparent !border-transparent !backdrop-blur-none !shadow-none px-4 sm:px-5 md:px-6 lg:px-10 py-3 sm:py-3 md:py-3'
                }`}
              hover={false}
              showGradient={isScrolled}
            >
              <div className="flex items-center justify-between w-full max-w-[1400px] mx-auto">
                <div className="flex items-center space-x-4 sm:space-x-6 md:space-x-8">
                  <div className="flex items-center cursor-pointer" onClick={() => onNavigate('/')}>
                    <img
                      src="/veefore-logo.png"
                      alt="VeeFore"
                      className="h-6 sm:h-7 md:h-8 w-auto"
                    />
                    <span className="text-lg sm:text-xl font-bold tracking-tight ml-[-2px]">eefore</span>
                  </div>

                  <div className="hidden lg:flex items-center space-x-4 xl:space-x-6 text-sm font-medium text-white/50">
                    {['Features', 'How it Works', 'Pricing', 'FAQ'].map((item) => (
                      <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="hover:text-white transition-colors duration-300 relative group">
                        {item}
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 group-hover:w-full transition-all duration-300" />
                      </a>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-2 sm:space-x-3">
                  <button className="hidden md:block text-sm font-medium text-white/60 hover:text-white transition-colors px-3 lg:px-4 py-2" onClick={() => onNavigate('signin')}>Login</button>
                  <MagneticButton
                    className="bg-white text-black hover:bg-white/90 rounded-full px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold transition-all duration-300"
                    onClick={() => onNavigate('signup')}
                  >
                    <span className="hidden sm:inline">Start Free Trial</span>
                    <span className="sm:hidden">Start Free</span>
                  </MagneticButton>
                  
                  {/* Mobile Menu Toggle */}
                  <button 
                    className="lg:hidden flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    aria-label="Toggle menu"
                  >
                    {mobileMenuOpen ? (
                      <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    ) : (
                      <Menu className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>
        </motion.nav>
        
        {/* Mobile Menu Full Page - Clean Design */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 z-50 bg-[#0a0a0f]"
            >
              {/* Header with logo and close */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
                <div className="flex items-center cursor-pointer" onClick={() => { setMobileMenuOpen(false); onNavigate('/'); }}>
                  <img
                    src="/veefore-logo-simple.svg"
                    alt="VeeFore"
                    className="h-7 w-auto"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <span className="text-white text-lg font-bold tracking-tight ml-1">eefore</span>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>

              {/* Menu Content */}
              <div className="px-4 py-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 70px)' }}>
                {/* CTA Button */}
                <motion.button 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.05 }}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full py-3.5 text-base font-semibold mb-4"
                  onClick={() => { onNavigate('signup'); setMobileMenuOpen(false); }}
                >
                  GET STARTED
                </motion.button>

                {/* Sign In */}
                <motion.button 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.1 }}
                  className="w-full text-center text-white/70 hover:text-white text-sm font-medium tracking-wide py-3 mb-6"
                  onClick={() => { onNavigate('signin'); setMobileMenuOpen(false); }}
                >
                  SIGN IN
                </motion.button>

                {/* Menu Items */}
                <div className="space-y-2">
                  {['Features', 'How it Works', 'Pricing', 'FAQ'].map((item, index) => (
                    <motion.a 
                      key={item} 
                      href={`#${item.toLowerCase().replace(' ', '-')}`} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: 0.15 + index * 0.05 }}
                      className="flex items-center justify-between w-full px-4 py-4 border border-white/10 rounded-xl text-white/80 hover:text-white hover:border-white/20 transition-all"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span className="text-sm font-medium tracking-wide uppercase">{item.toUpperCase()}</span>
                      <ChevronDown className="w-5 h-5 text-white/40" />
                    </motion.a>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-24 pb-20 overflow-hidden" style={{ marginTop: '-80px', paddingTop: 'calc(80px + 6rem)' }}>
        {/* Background layer */}
        <div className="absolute inset-0 z-0">
          {isMobile ? (
            <MobileBackground />
          ) : (
            <Suspense fallback={<Landing3DFallback />}>
              <Landing3D />
            </Suspense>
          )}
        </div>

        {/* Gradient orbs layer for mobile - on top of MobileBackground */}
        {isMobile && (
          <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
            <GradientOrb className="w-[350px] h-[350px] -top-[50px] -left-[80px]" color="blue" />
            <GradientOrb className="w-[280px] h-[280px] top-[40%] -right-[60px]" color="purple" />
            <GradientOrb className="w-[200px] h-[200px] bottom-[15%] left-[30%]" color="indigo" />
          </div>
        )}

        {isMobile ? (
          <div className="container max-w-[1100px] mx-auto px-3 sm:px-6 relative z-10 text-center">


            <h1 className="text-[clamp(2rem,8vw,5.5rem)] font-extrabold tracking-[-0.04em] leading-[1] mb-8">
              <RotatingHeroText />
            </h1>

            <p className="text-sm sm:text-lg md:text-xl lg:text-2xl text-white/40 max-w-3xl mx-auto mb-4 sm:mb-6 leading-relaxed font-medium px-4">
              VeeFore actively grows your social media using AI-driven engagement automation, hook intelligence, and smart DM funnels.
            </p>

            <p className="text-xs sm:text-sm md:text-base lg:text-lg text-white/25 max-w-2xl mx-auto mb-8 sm:mb-12 px-4">
              Most tools help you post. VeeFore helps you <span className="text-blue-400/80">respond faster</span>, <span className="text-indigo-400/80">engage at scale</span>, and <span className="text-purple-400/80">maintain momentum</span>.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4">
              <MagneticButton
                className="group relative bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full px-6 sm:px-8 md:px-10 py-3 sm:py-4 md:py-5 text-sm sm:text-base md:text-lg font-bold overflow-hidden"
                onClick={() => onNavigate('signup')}
              >
                <span className="relative z-10 flex items-center">
                  Start 7-Day Free Trial
                  <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
                </span>
              </MagneticButton>

              <button className="group flex items-center space-x-2 sm:space-x-3 text-white/60 hover:text-white transition-colors px-4 sm:px-6 py-3 sm:py-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
                </div>
                <span className="font-semibold text-sm sm:text-base">Watch Demo</span>
              </button>
            </div>

            <div className="mt-8 sm:mt-14 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-white/30 text-xs sm:text-sm px-4">
              {[
                { icon: CheckCircle, text: 'No credit card required' },
                { icon: Zap, text: '150 credits included' },
                { icon: Shield, text: 'Cancel anytime' }
              ].map((item, i) => (
                <div key={i} className="flex items-center space-x-1.5 sm:space-x-2">
                  <item.icon className="w-3 h-3 sm:w-4 sm:h-4 text-green-500/70" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <motion.div
            style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
            className="container max-w-[1100px] mx-auto px-3 sm:px-6 relative z-10 text-center"
          >


            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-[clamp(2rem,8vw,5.5rem)] font-extrabold tracking-[-0.04em] leading-[1] mb-8"
            >
              <RotatingHeroText />
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="text-sm sm:text-lg md:text-xl lg:text-2xl text-white/40 max-w-3xl mx-auto mb-4 sm:mb-6 leading-relaxed font-medium px-4"
            >
              VeeFore actively grows your social media using AI-driven engagement automation, hook intelligence, and smart DM funnels.
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1 }}
              className="text-xs sm:text-sm md:text-base lg:text-lg text-white/25 max-w-2xl mx-auto mb-8 sm:mb-12 px-4"
            >
              Most tools help you post. VeeFore helps you <span className="text-blue-400/80">respond faster</span>, <span className="text-indigo-400/80">engage at scale</span>, and <span className="text-purple-400/80">maintain momentum</span>.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.1 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4"
            >
              <MagneticButton
                className="group relative bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full px-6 sm:px-8 md:px-10 py-3 sm:py-4 md:py-5 text-sm sm:text-base md:text-lg font-bold overflow-hidden"
                onClick={() => onNavigate('signup')}
              >
                <span className="relative z-10 flex items-center">
                  Start 7-Day Free Trial
                  <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute inset-[-2px] bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 rounded-full blur-xl opacity-50" />
                </div>
              </MagneticButton>

              <button className="group flex items-center space-x-2 sm:space-x-3 text-white/60 hover:text-white transition-colors px-4 sm:px-6 py-3 sm:py-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 transition-all">
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
                </div>
                <span className="font-semibold text-sm sm:text-base">Watch Demo</span>
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1.3 }}
              className="mt-8 sm:mt-14 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-white/30 text-xs sm:text-sm px-4"
            >
              {[
                { icon: CheckCircle, text: 'No credit card required' },
                { icon: Zap, text: '150 credits included' },
                { icon: Shield, text: 'Cancel anytime' }
              ].map((item, i) => (
                <div key={i} className="flex items-center space-x-1.5 sm:space-x-2">
                  <item.icon className="w-3 h-3 sm:w-4 sm:h-4 text-green-500/70" />
                  <span>{item.text}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}

      </section>

      {/* Dashboard Showcase Section */}
      <section className="relative py-8 -mt-20 z-20 w-full overflow-hidden">
        <div className="w-full px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
            className="relative w-full"
          >
            {/* Side Graphics - Left (Faded, beautiful.ai style) - Hidden on mobile */}
            <div className="hidden md:block absolute left-4 lg:left-8 xl:left-12 top-1/2 -translate-y-1/2 w-[140px] lg:w-[180px] xl:w-[220px] space-y-3 lg:space-y-4 z-0 pointer-events-none" style={{ maskImage: 'linear-gradient(to right, transparent, black 60%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 60%)' }}>
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 0.4, x: 0 }}
                transition={{ delay: 2, duration: 1 }}
              >
                <GlassCard className="p-2 lg:p-3 xl:p-4">
                  <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-3">
                    <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                      <TrendingUp className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[8px] lg:text-[10px] text-white/40">Engagement Rate</p>
                      <p className="text-sm lg:text-base xl:text-lg font-bold text-green-400">+247%</p>
                    </div>
                  </div>
                  <div className="h-8 lg:h-10 xl:h-12 flex items-end space-x-0.5 lg:space-x-1">
                    {[30, 45, 35, 60, 75, 65, 90, 85, 95].map((h, i) => (
                      <div
                        key={i}
                        style={{ height: `${h}%` }}
                        className="flex-1 bg-gradient-to-t from-pink-500 to-rose-400 rounded-sm"
                      />
                    ))}
                  </div>
                </GlassCard>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 0.35, x: 0 }}
                transition={{ delay: 2.2, duration: 1 }}
              >
                <GlassCard className="p-2 lg:p-3 xl:p-4">
                  <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-3">
                    <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <MessageSquare className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[8px] lg:text-[10px] text-white/40">DM Responses</p>
                      <p className="text-sm lg:text-base xl:text-lg font-bold">1,847</p>
                    </div>
                  </div>
                  <div className="space-y-1 lg:space-y-1.5">
                    <div className="flex items-center justify-between text-[8px] lg:text-[10px]">
                      <span className="text-white/40">Automated</span>
                      <span className="text-blue-400">94%</span>
                    </div>
                    <div className="h-1 lg:h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full w-[94%] bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </div>

            {/* Side Graphics - Right (Faded, beautiful.ai style) - Hidden on mobile */}
            <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-[140px] lg:w-[180px] xl:w-[220px] space-y-3 lg:space-y-4 z-0 pointer-events-none" style={{ maskImage: 'linear-gradient(to left, transparent, black 60%)', WebkitMaskImage: 'linear-gradient(to left, transparent, black 60%)' }}>
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 0.4, x: 0 }}
                transition={{ delay: 2.1, duration: 1 }}
              >
                <GlassCard className="p-2 lg:p-3 xl:p-4">
                  <div className="flex items-center space-x-2 lg:space-x-3 mb-1 lg:mb-2">
                    <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                      <Brain className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[8px] lg:text-[10px] text-white/40">AI Hooks Generated</p>
                      <p className="text-sm lg:text-base xl:text-lg font-bold">3,291</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-0.5 lg:gap-1 mt-1 lg:mt-2">
                    {['Trending', 'Emotional', 'Question', 'Story'].map((tag) => (
                      <span key={tag} className="px-1 lg:px-1.5 py-0.5 text-[7px] lg:text-[9px] rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20">{tag}</span>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 0.35, x: 0 }}
                transition={{ delay: 2.3, duration: 1 }}
              >
                <GlassCard className="p-2 lg:p-3 xl:p-4">
                  <div className="flex items-center space-x-2 lg:space-x-3 mb-1 lg:mb-2">
                    <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                      <Zap className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[8px] lg:text-[10px] text-white/40">Growth Velocity</p>
                      <p className="text-sm lg:text-base xl:text-lg font-bold text-amber-400">12.4x</p>
                    </div>
                  </div>
                  <p className="text-[7px] lg:text-[10px] text-white/30">Faster than manual engagement</p>
                </GlassCard>
              </motion.div>
            </div>

            {/* Central Dashboard - Animated Motion Graphic - Now visible on mobile */}
            <div className="relative">
              <AnimatedDashboard />

              {/* Floating Elements - Responsive */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 3, duration: 0.5 }}
                className="absolute -bottom-3 sm:-bottom-6 left-0 sm:-left-6 px-2 sm:px-4 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 backdrop-blur-xl z-20"
              >
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <CheckCircle className="w-3 h-3 sm:w-5 sm:h-5 text-green-400" />
                  <span className="text-[10px] sm:text-sm font-medium text-green-300">AI is actively engaging</span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 3.2, duration: 0.5 }}
                className="absolute -bottom-3 sm:-bottom-4 right-0 sm:-right-4 px-2 sm:px-4 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 backdrop-blur-xl z-20"
              >
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <Zap className="w-3 h-3 sm:w-5 sm:h-5 text-blue-400" />
                  <span className="text-[10px] sm:text-sm font-medium text-blue-300">24/7 Automation Active</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trusted By Top Brands Section */}
      <section className="py-16 md:py-24 relative overflow-hidden bg-transparent w-full">
        <div className="w-full px-4 md:px-8">
          <div className="text-center mb-12 md:mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs font-bold text-purple-400 uppercase tracking-widest mb-6">
              <span>Trusted Partners</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">Trusted By Top Brands</h3>
            <p className="text-base text-white/50">Join thousands of creators using Veefore to grow their presence</p>
          </div>

          {/* Infinite Scrolling Logos Container */}
          <div className="relative">
            <Marquee>
              {[
                {
                  name: "Meta",
                  category: "Social Media Leader",
                  icon: (
                    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <title>Meta</title>
                      <path d="M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z" fill="url(#lobe-icons-meta-fill-0)"></path>
                      <path d="M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z" fill="url(#lobe-icons-meta-fill-1)"></path>
                      <path d="M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z" fill="url(#lobe-icons-meta-fill-2)"></path>
                      <path d="M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z" fill="url(#lobe-icons-meta-fill-3)"></path>
                      <path d="M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z" fill="url(#lobe-icons-meta-fill-4)"></path>
                      <path d="M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z" fill="url(#lobe-icons-meta-fill-5)"></path>
                      <path d="M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z" fill="#0082FB"></path>
                      <path d="M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z" fill="url(#lobe-icons-meta-fill-6)"></path>
                      <path d="M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z" fill="#0082FB"></path>
                      <path d="M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z" fill="url(#lobe-icons-meta-fill-7)"></path>
                      <path d="M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z" fill="url(#lobe-icons-meta-fill-8)"></path>
                      <path d="M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z" fill="url(#lobe-icons-meta-fill-9)"></path>
                      <path d="M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z" fill="url(#lobe-icons-meta-fill-10)"></path>
                      <path d="M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z" fill="url(#lobe-icons-meta-fill-11)"></path>
                      <path d="M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z" fill="url(#lobe-icons-meta-fill-12)"></path>
                      <defs>
                        <linearGradient id="lobe-icons-meta-fill-0" x1="75.897%" x2="26.312%" y1="89.199%" y2="12.194%"><stop offset=".06%" stopColor="#0867DF"></stop><stop offset="45.39%" stopColor="#0668E1"></stop><stop offset="85.91%" stopColor="#0064E0"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-1" x1="21.67%" x2="97.068%" y1="75.874%" y2="23.985%"><stop offset="13.23%" stopColor="#0064DF"></stop><stop offset="99.88%" stopColor="#0064E0"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-2" x1="38.263%" x2="60.895%" y1="89.127%" y2="16.131%"><stop offset="1.47%" stopColor="#0072EC"></stop><stop offset="68.81%" stopColor="#0064DF"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-3" x1="47.032%" x2="52.15%" y1="90.19%" y2="15.745%"><stop offset="7.31%" stopColor="#007CF6"></stop><stop offset="99.43%" stopColor="#0072EC"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-4" x1="52.155%" x2="47.591%" y1="58.301%" y2="37.004%"><stop offset="7.31%" stopColor="#007FF9"></stop><stop offset="100%" stopColor="#007CF6"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-5" x1="37.689%" x2="61.961%" y1="12.502%" y2="63.624%"><stop offset="7.31%" stopColor="#007FF9"></stop><stop offset="100%" stopColor="#0082FB"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-6" x1="34.808%" x2="62.313%" y1="68.859%" y2="23.174%"><stop offset="27.99%" stopColor="#007FF8"></stop><stop offset="91.41%" stopColor="#0082FB"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-7" x1="43.762%" x2="57.602%" y1="6.235%" y2="98.514%"><stop offset="0%" stopColor="#0082FB"></stop><stop offset="99.95%" stopColor="#0081FA"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-8" x1="60.055%" x2="39.88%" y1="4.661%" y2="69.077%"><stop offset="6.19%" stopColor="#0081FA"></stop><stop offset="100%" stopColor="#0080F9"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-9" x1="30.282%" x2="61.081%" y1="59.32%" y2="33.244%"><stop offset="0%" stopColor="#027AF3"></stop><stop offset="100%" stopColor="#0080F9"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-10" x1="20.433%" x2="82.112%" y1="50.001%" y2="50.001%"><stop offset="0%" stopColor="#0377EF"></stop><stop offset="99.94%" stopColor="#0279F1"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-11" x1="40.303%" x2="72.394%" y1="35.298%" y2="57.811%"><stop offset=".19%" stopColor="#0471E9"></stop><stop offset="100%" stopColor="#0377EF"></stop></linearGradient>
                        <linearGradient id="lobe-icons-meta-fill-12" x1="32.254%" x2="68.003%" y1="19.719%" y2="84.908%"><stop offset="27.65%" stopColor="#0867DF"></stop><stop offset="100%" stopColor="#0471E9"></stop></linearGradient>
                      </defs>
                    </svg>
                  )
                },
                {
                  name: "WhatsApp",
                  category: "Messaging Platform",
                  icon: (
                    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#25D366' }}>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  )
                },
                {
                  name: "Instagram",
                  category: "Social Platform",
                  icon: (
                    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                      <defs>
                        <linearGradient id="igGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#f09433" />
                          <stop offset="25%" stopColor="#e6683c" />
                          <stop offset="50%" stopColor="#dc2743" />
                          <stop offset="75%" stopColor="#cc2366" />
                          <stop offset="100%" stopColor="#bc1888" />
                        </linearGradient>
                      </defs>
                      <path fill="url(#igGradient)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.069-4.85.069-3.204 0-3.584-.012-4.849-.069-3.225-.149-4.771-1.664-4.919-4.919-.058-1.265-.069-1.644-.069-4.849 0-3.204.012-3.584.069-4.849.149-3.225 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  )
                },
                {
                  name: "ChatGPT",
                  category: "AI Assistant",
                  icon: (
                    <svg
                      className="w-10 h-10"
                      xmlns="http://www.w3.org/2000/svg"
                      shapeRendering="geometricPrecision"
                      textRendering="geometricPrecision"
                      imageRendering="optimizeQuality"
                      fillRule="evenodd"
                      clipRule="evenodd"
                      viewBox="0 0 512 509.639"
                    >
                      <path fill="#fff" d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.613-115.613 115.613H115.612C52.026 509.64 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z" />
                      <path fillRule="nonzero" fill="black" d="M412.037 221.764a90.834 90.834 0 004.648-28.67 90.79 90.79 0 00-12.443-45.87c-16.37-28.496-46.738-46.089-79.605-46.089-6.466 0-12.943.683-19.264 2.04a90.765 90.765 0 00-67.881-30.515h-.576c-.059.002-.149.002-.216.002-39.807 0-75.108 25.686-87.346 63.554-25.626 5.239-47.748 21.31-60.682 44.03a91.873 91.873 0 00-12.407 46.077 91.833 91.833 0 0023.694 61.553 90.802 90.802 0 00-4.649 28.67 90.804 90.804 0 0012.442 45.87c16.369 28.504 46.74 46.087 79.61 46.087a91.81 91.81 0 0019.253-2.04 90.783 90.783 0 0067.887 30.516h.576l.234-.001c39.829 0 75.119-25.686 87.357-63.588 25.626-5.242 47.748-21.312 60.682-44.033a91.718 91.718 0 0012.383-46.035 91.83 91.83 0 00-23.693-61.553l-.004-.005zM275.102 413.161h-.094a68.146 68.146 0 01-43.611-15.8 56.936 56.936 0 002.155-1.221l72.54-41.901a11.799 11.799 0 005.962-10.251V241.651l30.661 17.704c.326.163.55.479.596.84v84.693c-.042 37.653-30.554 68.198-68.21 68.273h.001zm-146.689-62.649a68.128 68.128 0 01-9.152-34.085c0-3.904.341-7.817 1.005-11.663.539.323 1.48.897 2.155 1.285l72.54 41.901a11.832 11.832 0 0011.918-.002l88.563-51.137v35.408a1.1 1.1 0 01-.438.94l-73.33 42.339a68.43 68.43 0 01-34.11 9.12 68.359 68.359 0 01-59.15-34.11l-.001.004zm-19.083-158.36a68.044 68.044 0 0135.538-29.934c0 .625-.036 1.731-.036 2.5v83.801l-.001.07a11.79 11.79 0 005.954 10.242l88.564 51.13-30.661 17.704a1.096 1.096 0 01-1.034.093l-73.337-42.375a68.36 68.36 0 01-34.095-59.143 68.412 68.412 0 019.112-34.085l-.004-.003zm251.907 58.621l-88.563-51.137 30.661-17.697a1.097 1.097 0 011.034-.094l73.337 42.339c21.109 12.195 34.132 34.746 34.132 59.132 0 28.604-17.849 54.199-44.686 64.078v-86.308c.004-.032.004-.065.004-.096 0-4.219-2.261-8.119-5.919-10.217zm30.518-45.93c-.539-.331-1.48-.898-2.155-1.286l-72.54-41.901a11.842 11.842 0 00-5.958-1.611c-2.092 0-4.15.558-5.957 1.611l-88.564 51.137v-35.408l-.001-.061a1.1 1.1 0 01.44-.88l73.33-42.303a68.301 68.301 0 0134.108-9.129c37.704 0 68.281 30.577 68.281 68.281a68.69 68.69 0 01-.984 11.545v.005zm-191.843 63.109l-30.668-17.704a1.09 1.09 0 01-.596-.84v-84.692c.016-37.685 30.593-68.236 68.281-68.236a68.332 68.332 0 0143.689 15.804 63.09 63.09 0 00-2.155 1.222l-72.54 41.9a11.794 11.794 0 00-5.961 10.248v.068l-.05 102.23zm16.655-35.91l39.445-22.782 39.444 22.767v45.55l-39.444 22.767-39.445-22.767v-45.535z" /></svg>
                  )
                },
                {
                  name: "YouTube",
                  category: "Video Platform",
                  icon: (
                    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#FF0000' }}>
                      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  )
                },
                {
                  name: "Twitter",
                  category: "Social Network",
                  icon: (
                    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor" transform="scale(0.85)">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  )
                },
                {
                  name: "LinkedIn",
                  category: "Professional Network",
                  icon: (
                    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0077B5' }}>
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  )
                }
              ].map((brand, i) => (
                <div key={i} className="flex flex-col items-center justify-center min-w-[150px] md:min-w-[180px]">
                  <div className="flex items-center space-x-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 md:px-6 md:py-4 hover:bg-white/10 transition-all cursor-pointer group w-full justify-center">
                    <div className="flex items-center justify-center transition-transform group-hover:scale-110">
                      {brand.icon}
                    </div>
                    <div>
                      <p className="text-white font-bold text-base md:text-lg">{brand.name}</p>
                      <p className="text-white/40 text-[10px] md:text-xs">{brand.category}</p>
                    </div>
                  </div>
                </div>
              ))}
            </Marquee>

            {/* Gradient overlays for smooth fade effect */}
            <div className="absolute top-0 left-0 w-12 md:w-32 h-full bg-gradient-to-r from-black to-transparent z-10 pointer-events-none"></div>
            <div className="absolute top-0 right-0 w-12 md:w-32 h-full bg-gradient-to-l from-black to-transparent z-10 pointer-events-none"></div>
          </div>
        </div>
      </section>

      {/* How VeeFore Works - Ascending Graph Section */}
      {/* How VeeFore Works - Ascending Graph Section */}
      <section className="relative py-20 z-20 overflow-hidden">
        {/* Left Side - Meaningful Social Media Context Graphics with fade */}
        {/* Left fade overlay */}
        <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-64 pointer-events-none bg-gradient-to-r from-transparent via-transparent to-transparent z-10" />

        {/* Incoming comments/engagement waiting to be answered */}
        <div className="hidden lg:block absolute left-6 top-28 pointer-events-none opacity-60">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 0.6, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm scale-110"
            style={{ maskImage: 'linear-gradient(to right, rgba(0,0,0,0.3), rgba(0,0,0,1) 30%)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <MessageCircle className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-white/50">New comments</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-purple-500" />
                <div className="h-2.5 w-24 bg-white/10 rounded" />
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500" />
                <div className="h-2.5 w-20 bg-white/10 rounded" />
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500" />
                <div className="h-2.5 w-28 bg-white/10 rounded" />
              </div>
            </div>
            <div className="mt-2.5 text-[10px] text-orange-400/70 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>Waiting for reply...</span>
            </div>
          </motion.div>
        </div>

        {/* Manual work indicator - time consuming */}
        <div className="hidden lg:block absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 0.5, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.7 }}
            className="text-center scale-115"
            style={{ maskImage: 'linear-gradient(to right, rgba(0,0,0,0.2), rgba(0,0,0,1) 40%)' }}
          >
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 mb-3">
              <div className="text-xs text-white/30 uppercase tracking-wider mb-1.5">Without AI</div>
              <div className="text-2xl font-bold text-red-400/60">2-4 hrs</div>
              <div className="text-[10px] text-white/30">daily replies</div>
            </div>
            <svg className="w-8 h-12 mx-auto text-white/20" viewBox="0 0 24 40">
              <path d="M12 5 L12 30 M7 25 L12 30 L17 25" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </motion.div>
        </div>

        {/* DM inbox preview */}
        <div className="hidden lg:block absolute left-8 bottom-20 pointer-events-none opacity-55">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 0.55, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.9 }}
            className="bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm scale-110"
            style={{ maskImage: 'linear-gradient(to right, rgba(0,0,0,0.25), rgba(0,0,0,1) 35%)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <Send className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-white/50">DM requests</span>
              <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">12</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2.5 w-28 bg-white/10 rounded" />
              <div className="h-2.5 w-24 bg-white/10 rounded" />
            </div>
          </motion.div>
        </div>

        {/* Right Side - Results & Growth Graphics with fade */}
        {/* AI auto-reply indicator */}
        <div className="hidden lg:block absolute right-6 top-24 pointer-events-none opacity-60">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 0.6, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
            className="bg-white/[0.04] border border-green-500/20 rounded-2xl px-4 py-3 backdrop-blur-sm scale-110"
            style={{ maskImage: 'linear-gradient(to left, rgba(0,0,0,0.3), rgba(0,0,0,1) 30%)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <Bot className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400/80">AI Auto-replied</span>
              <Check className="w-3.5 h-3.5 text-green-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-purple-500" />
                <div className="flex-1 h-2.5 bg-green-500/20 rounded" />
                <Check className="w-3 h-3 text-green-400/60" />
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500" />
                <div className="flex-1 h-2.5 bg-green-500/20 rounded" />
                <Check className="w-3 h-3 text-green-400/60" />
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500" />
                <div className="flex-1 h-2.5 bg-green-500/20 rounded" />
                <Check className="w-3 h-3 text-green-400/60" />
              </div>
            </div>
            <div className="mt-2.5 text-[10px] text-green-400/70 flex items-center gap-1.5">
              <Zap className="w-3 h-3" />
              <span>Replied in 2 seconds</span>
            </div>
          </motion.div>
        </div>

        {/* Engagement growth metrics */}
        <div className="hidden lg:block absolute right-4 top-1/2 -translate-y-1/4 pointer-events-none opacity-50">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 0.5, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8 }}
            className="space-y-3 scale-115"
            style={{ maskImage: 'linear-gradient(to left, rgba(0,0,0,0.2), rgba(0,0,0,1) 40%)' }}
          >
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-white/30 uppercase tracking-wider mb-1.5">Engagement</div>
              <div className="text-2xl font-bold text-green-400">+147%</div>
              <div className="text-[10px] text-white/30">this month</div>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-white/30 uppercase tracking-wider mb-1.5">Response</div>
              <div className="text-2xl font-bold text-purple-400">{"<"}3s</div>
              <div className="text-[10px] text-white/30">avg time</div>
            </div>
          </motion.div>
        </div>

        {/* Follower growth indicator */}
        <div className="hidden lg:block absolute right-8 bottom-16 pointer-events-none opacity-55">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 0.55, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 1 }}
            className="bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm scale-110"
            style={{ maskImage: 'linear-gradient(to left, rgba(0,0,0,0.25), rgba(0,0,0,1) 35%)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-white/50">Follower growth</span>
            </div>
            <div className="flex items-end gap-1.5 h-10">
              <div className="w-2.5 bg-blue-500/40 rounded-t" style={{ height: '30%' }} />
              <div className="w-2.5 bg-blue-500/50 rounded-t" style={{ height: '45%' }} />
              <div className="w-2.5 bg-purple-500/50 rounded-t" style={{ height: '55%' }} />
              <div className="w-2.5 bg-purple-500/60 rounded-t" style={{ height: '70%' }} />
              <div className="w-2.5 bg-green-500/70 rounded-t" style={{ height: '90%' }} />
              <div className="w-2.5 bg-green-500 rounded-t" style={{ height: '100%' }} />
            </div>
            <div className="mt-2 text-[10px] text-green-400/70 flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" />
              <span>+2.4K this week</span>
            </div>
          </motion.div>
        </div>


        <div className="max-w-[1100px] mx-auto px-6 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.05, margin: "0px 0px -100px 0px" }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/60 uppercase tracking-widest mb-5">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              <span>How It Works</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Your AI-powered <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">growth engine</span>
            </h2>
            <p className="text-base md:text-lg text-white/40 max-w-2xl mx-auto">
              Each step compounds your engagement, building momentum that algorithms reward.
            </p>
          </motion.div>

          {/* Ascending Graph Visualization */}
          <div className="relative">
            {/* Desktop: Ascending graph layout */}
            <div className="hidden md:block">
              {/* SVG Graph with wavy ascending line */}
              <svg className="absolute inset-0 w-full h-[400px] pointer-events-none will-change-transform" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="graphLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="33%" stopColor="#8b5cf6" />
                    <stop offset="66%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                  <linearGradient id="graphFillGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                {/* Wavy ascending line with oscillating pattern */}
                <motion.path
                  d="M 50 340 
                     C 80 320, 100 330, 120 310
                     C 140 290, 160 300, 180 280
                     C 200 260, 220 270, 250 250
                     C 280 230, 300 245, 340 220
                     C 380 195, 400 210, 450 185
                     C 500 160, 520 175, 580 145
                     C 640 115, 660 130, 720 100
                     C 780 70, 800 85, 860 55
                     C 920 25, 940 35, 950 30"
                  fill="none"
                  stroke="url(#graphLineGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 2, ease: "easeOut" }}
                />
                {/* Gradient fill under the wavy line */}
                <motion.path
                  d="M 50 340 
                     C 80 320, 100 330, 120 310
                     C 140 290, 160 300, 180 280
                     C 200 260, 220 270, 250 250
                     C 280 230, 300 245, 340 220
                     C 380 195, 400 210, 450 185
                     C 500 160, 520 175, 580 145
                     C 640 115, 660 130, 720 100
                     C 780 70, 800 85, 860 55
                     C 920 25, 940 35, 950 30
                     L 950 400 L 50 400 Z"
                  fill="url(#graphFillGradient)"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, duration: 1 }}
                />
              </svg>

              {/* Step nodes positioned along the ascending wavy line */}
              <div className="relative h-[400px]">
                {[
                  {
                    step: 1,
                    icon: Send,
                    title: 'You Post',
                    desc: 'Create content as usual',
                    metric: 'Content Live',
                    color: 'text-blue-400',
                    bgColor: 'bg-blue-500',
                    top: '75%',
                    left: '2%'
                  },
                  {
                    step: 2,
                    icon: Bot,
                    title: 'AI Responds',
                    desc: 'Instant comment & DM replies',
                    metric: '+Speed',
                    color: 'text-purple-400',
                    bgColor: 'bg-purple-500',
                    top: '52%',
                    left: '25%'
                  },
                  {
                    step: 3,
                    icon: TrendingUp,
                    title: 'Algorithm Boosts',
                    desc: 'Engagement signals compound',
                    metric: '+Reach',
                    color: 'text-indigo-400',
                    bgColor: 'bg-indigo-500',
                    top: '30%',
                    left: '52%'
                  },
                  {
                    step: 4,
                    icon: RefreshCw,
                    title: 'AI Improves',
                    desc: 'Every interaction trains AI',
                    metric: '+Growth',
                    color: 'text-green-400',
                    bgColor: 'bg-green-500',
                    top: '8%',
                    left: '76%'
                  }
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.3, type: "spring", stiffness: 100 }}
                    className="absolute will-change-transform"
                    style={{ top: item.top, left: item.left }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Node circle with glow */}
                      <div className="relative">
                        <div className={`absolute inset-0 ${item.bgColor} rounded-full blur-md opacity-40`} />
                        <div className={`relative w-11 h-11 rounded-full ${item.bgColor} flex items-center justify-center shadow-lg`}>
                          <item.icon className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      {/* Content card */}
                      <div className="bg-[#0d0d0d]/80 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 min-w-[170px]">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold ${item.color} uppercase`}>Step {item.step}</span>
                          <span className={`text-[10px] font-medium ${item.color} bg-white/10 px-1.5 py-0.5 rounded`}>{item.metric}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-0.5">{item.title}</h4>
                        <p className="text-xs text-white/50">{item.desc}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Mobile: Vertical curved layout */}
            <div className="md:hidden relative px-4">
              {/* Curved SVG connector */}
              <svg className="absolute left-0 top-0 w-full h-full pointer-events-none will-change-transform" viewBox="0 0 100 400" preserveAspectRatio="none">
                <motion.path
                  d="M 20 20 Q 30 80, 20 120 Q 10 160, 20 200 Q 30 240, 20 280 Q 10 320, 20 360"
                  fill="none"
                  stroke="url(#mobileGradient)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
                <defs>
                  <linearGradient id="mobileGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                    <stop offset="33%" stopColor="#8b5cf6" stopOpacity="0.3" />
                    <stop offset="66%" stopColor="#6366f1" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
              </svg>
              {/* Steps */}
              <div className="space-y-6 relative">
                {[
                  { step: 1, icon: Send, title: 'You Post', desc: 'Create content as usual', metric: 'Content Live', color: 'text-blue-400', bgColor: 'bg-blue-500' },
                  { step: 2, icon: Bot, title: 'AI Responds', desc: 'Instant comment & DM replies', metric: '+Speed', color: 'text-purple-400', bgColor: 'bg-purple-500' },
                  { step: 3, icon: TrendingUp, title: 'Algorithm Boosts', desc: 'Engagement signals compound', metric: '+Reach', color: 'text-indigo-400', bgColor: 'bg-indigo-500' },
                  { step: 4, icon: RefreshCw, title: 'AI Improves', desc: 'Every interaction trains AI', metric: '+Growth', color: 'text-green-400', bgColor: 'bg-green-500' }
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 }}
                    className="flex items-center gap-3"
                  >
                    {/* Node with glow */}
                    <div className="relative shrink-0">
                      <div className={`absolute inset-0 ${item.bgColor} rounded-full blur-md opacity-40`} />
                      <div className={`relative w-11 h-11 rounded-full ${item.bgColor} flex items-center justify-center shadow-lg`}>
                        <item.icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    {/* Content */}
                    <div className="flex-1 bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold ${item.color} uppercase tracking-wider`}>Step {item.step}</span>
                        <span className={`text-[10px] font-medium ${item.color} bg-white/10 px-2 py-0.5 rounded-full`}>{item.metric}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-white mb-0.5">{item.title}</h4>
                      <p className="text-xs text-white/50">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* Algorithm Impact - Why Engagement Velocity Matters */}
      <section className="py-12 sm:py-16 md:py-20 lg:py-28 relative overflow-hidden w-full">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/[0.03] to-transparent" />
        <GradientOrb className="w-[300px] sm:w-[400px] md:w-[500px] h-[300px] sm:h-[400px] md:h-[500px] bottom-0 right-0 translate-x-1/2 translate-y-1/2" color="purple" />

        <div className="w-full px-4 sm:px-6 md:px-12 lg:px-20 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.05, margin: "0px 0px -100px 0px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="relative overflow-hidden">
              {/* Background decorative elements */}
              <div className="absolute top-0 right-0 w-48 sm:w-64 md:w-96 h-48 sm:h-64 md:h-96 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full blur-3xl opacity-50" />
              <div className="absolute bottom-0 left-0 w-32 sm:w-48 md:w-64 h-32 sm:h-48 md:h-64 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-3xl opacity-50" />

              <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 md:gap-12 items-center relative">
                <div>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className="inline-flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-[10px] sm:text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 sm:mb-6">
                      <Brain className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>Algorithm Science</span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
                      Why <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">speed</span> matters to algorithms
                    </h3>
                    <p className="text-white/60 mb-6 sm:mb-8 text-sm sm:text-base md:text-lg leading-relaxed">
                      Social platforms reward accounts that generate quick, meaningful engagement. The first <span className="text-blue-400 font-semibold">30 minutes</span> after posting are critical for algorithmic amplification.
                    </p>
                  </motion.div>
                </div>

                <div className="relative w-full rounded-3xl overflow-hidden bg-gradient-to-br from-[#0a0a0a] via-[#111111] to-[#050505] backdrop-blur-2xl border border-white/5 shadow-2xl group/hud">
                  {/* Premium Ambient Background Effects */}
                  <div className="absolute inset-0 opacity-40 pointer-events-none">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-900/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-900/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 md:p-8 relative z-10 items-center">

                    {/* Left Column: Primary Metric */}
                    <div className="flex flex-col justify-center relative">
                      {/* Decorative vertical line */}
                      <div className="absolute left-0 top-10 bottom-10 w-[1px] bg-gradient-to-b from-transparent via-blue-500/20 to-transparent hidden lg:block -ml-8" />

                      <div className="relative pl-4">
                        <div className="flex items-baseline space-x-2">
                          <motion.span
                            key={hudActiveSignal}
                            initial={{ opacity: 0.9, filter: 'blur(0px)' }}
                            animate={{
                              opacity: 1,
                              filter: 'blur(0px)',
                              textShadow: hudActiveSignal ? '0 0 50px rgba(59,130,246,0.4)' : 'none'
                            }}
                            className="text-5xl sm:text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60"
                          >
                            {hudActiveSignal ? 98 + hudActiveSignal : 98}
                          </motion.span>
                          <span className="text-3xl text-blue-400/50 font-light">%</span>
                        </div>
                        <div className="mt-4 space-y-3">
                          <p className="text-2xl text-white/90 font-semibold tracking-wide flex items-center gap-2">
                            Efficiency Score
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                            </span>
                          </p>
                          <p className="text-lg text-white/50 leading-relaxed max-w-md font-medium">
                            Real-time probability of algorithmic amplification based on current content velocity.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Premium Glass Cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          id: 1,
                          label: 'Velocity',
                          value: '12ms',
                          sub: 'Response',
                          icon: Zap,
                          gradient: 'from-blue-500/10 to-transparent'
                        },
                        {
                          id: 2,
                          label: 'Depth',
                          value: '4.2x',
                          sub: 'Threads',
                          icon: Layers,
                          gradient: 'from-purple-500/10 to-transparent'
                        },
                        {
                          id: 3,
                          label: 'Trust',
                          value: '100',
                          sub: 'Health',
                          icon: Shield,
                          gradient: 'from-emerald-500/10 to-transparent'
                        },
                        {
                          id: 4,
                          label: 'Authority',
                          value: 'Top 1%',
                          sub: 'Rank',
                          icon: Crown,
                          gradient: 'from-amber-500/10 to-transparent'
                        }
                      ].map((item) => (
                        <motion.div
                          key={item.id}
                          onHoverStart={() => setHudActiveSignal(item.id)}
                          onHoverEnd={() => setHudActiveSignal(null)}
                          whileHover={{ y: -2, scale: 1.01 }}
                          className="relative overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 cursor-default group transition-all duration-300 hover:border-white/15 hover:bg-white/[0.04] hover:shadow-lg min-h-[90px] flex flex-col justify-between"
                        >
                          {/* Hover Gradient Background */}
                          <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                          <div className="relative z-10 w-full">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[10px] font-bold text-white/30 group-hover:text-white/60 transition-colors uppercase tracking-wider">{item.label}</span>
                              <item.icon className="w-3 h-3 text-white/20 group-hover:text-white/80 transition-colors" />
                            </div>

                            <div className="mt-2">
                              <span className={`text-xl font-bold text-white tracking-tight group-hover:scale-105 inline-block transition-transform duration-300 origin-left`}>
                                {item.value}
                              </span>
                              <p className="text-[9px] text-white/30 font-medium mt-0 leading-tight">{item.sub}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Sticky Scroll "Story" Features */}
      <StickyScrollFeaturesV2 />


      {/* Problem / Philosophy Section */}
      <section id="how-it-works" className="py-16 md:py-32 relative overflow-hidden w-full">
        {/* Background Gradients */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-red-500/5 rounded-full blur-[60px] md:blur-[100px] pointer-events-none" />
        <div className="absolute right-0 bottom-0 w-[250px] md:w-[400px] h-[250px] md:h-[400px] bg-blue-500/5 rounded-full blur-[60px] md:blur-[100px] pointer-events-none" />

        <div className="w-full px-4 md:px-12 lg:px-20 relative z-10">
          <div className="text-center mb-12 md:mb-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center space-x-2 px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] md:text-xs font-bold text-red-400 uppercase tracking-widest mb-4 md:mb-6"
            >
              <span className="flex h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-red-500 animate-pulse mr-1.5 md:mr-2" />
              <span>The Real Problem</span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight mb-4 md:mb-6"
            >
              Why Creators <span className="text-red-500 drop-shadow-sm">Fail</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-sm sm:text-lg md:text-xl text-white/40 max-w-2xl mx-auto leading-relaxed"
            >
              Most tools focus on posting, scheduling, and analytics. <br className="hidden md:block" />
              But creators don't fail because they lack tools.
            </motion.p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-stretch">
            {/* Left Column: The Failures */}
            <div className="space-y-3 md:space-y-4 flex flex-col justify-center">
              {[
                { title: 'Inconsistent Engagement', desc: 'Cannot keep up with comments & DMs manually' },
                { title: 'Missed Opportunities', desc: 'Leads slip through cracks in untracked DMs' },
                { title: 'Algorithm Momentum Loss', desc: 'Slow responses kill viral potential instantly' },
                { title: 'Time Burnout', desc: 'hours wasted on repetitive, low-value typing' },
                { title: 'Blind Creation', desc: 'Posting without knowing what actually hooks' }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + (i * 0.1) }}
                >
                  <GlassCard
                    className="p-3 md:p-5 flex items-center space-x-3 md:space-x-5 !bg-red-500/[0.02] !border-red-500/10 group hover:!bg-red-500/[0.06] hover:!border-red-500/30 transition-all duration-300"
                  >
                    <div className="h-9 w-9 md:h-12 md:w-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20 group-hover:bg-red-500/20 group-hover:scale-110 transition-all duration-300">
                      <X className="w-4 h-4 md:w-6 md:h-6 text-red-500" />
                    </div>
                    <div>
                      <h4 className="text-sm md:text-lg font-bold text-white/90 group-hover:text-red-100 transition-colors mb-0.5 md:mb-0">{item.title}</h4>
                      <p className="text-xs md:text-sm text-white/40 group-hover:text-white/60 transition-colors leading-snug">{item.desc}</p>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>

            {/* Right Column: The Solution Philosophy */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="h-full mt-6 lg:mt-0"
            >
              <TiltCard className="h-full">
                <GlassCard className="p-5 md:p-12 h-full flex flex-col justify-center !bg-gradient-to-br !from-blue-500/[0.05] !via-purple-500/[0.05] !to-transparent border-t border-white/10">
                  <div className="inline-flex self-start items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/20 text-[10px] md:text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 md:mb-8">
                    <span>VeeFore's Philosophy</span>
                  </div>
                  <h3 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8 leading-tight">
                    Growth-First <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Approach</span>
                  </h3>

                  <div className="space-y-5 md:space-y-8">
                    {[
                      { title: 'Engagement before volume', sub: 'Interact first, post second. The algorithm rewards community.', icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/20' },
                      { title: 'Interaction before impressions', sub: 'Turn eyeballs into conversations. Conversations convert.', icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/20' },
                      { title: 'Momentum before aesthetics', sub: 'Keep the wheel turning automatically. Consistency wins.', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/20' }
                    ].map((item, i) => (
                      <div key={i} className="flex items-start space-x-3 md:space-x-5 group">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${item.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                          <item.icon className={`w-5 h-5 md:w-6 md:h-6 ${item.color}`} />
                        </div>
                        <div>
                          <h4 className="text-sm md:text-lg font-bold text-white/90 mb-0.5 md:mb-1 group-hover:text-white transition-colors">{item.title}</h4>
                          <p className="text-xs md:text-sm text-white/40 leading-relaxed group-hover:text-white/60 transition-colors">{item.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </TiltCard>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Who is VeeFore For - Target Audience Section */}
      <TargetAudienceSection />

      {/* Hero Features - Cinematic Scroll */}
      <section id="features" className="relative bg-black">
        <div className="py-24 text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 uppercase tracking-widest mb-6">
            <Layers className="w-4 h-4" />
            <span>GAME-CHANGING FEATURES</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Everything You Need to <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Scale</span>
          </h2>
          <p className="text-xl text-white/40 max-w-2xl mx-auto px-4">
            Stop guessing. Start growing. VeeFore gives you the AI-powered tools to create, engage, and convert like top 1% creators.
          </p>
        </div>

        <CinematicFeatures features={heroFeatures} />
      </section>

      {/* Support Features - Growth Engine Section */}
      <GrowthEngineSection />

      {/* Credit System */}
      <CreditSystemSection />

      {/* VeeFore vs Traditional Tools - "The Evolution" Section */}
      <section className="py-24 relative overflow-hidden">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-900/5 to-transparent pointer-events-none" />
        <GradientOrb className="w-[500px] h-[500px] top-1/2 right-0 translate-x-1/2 -translate-y-1/2 opacity-30" color="indigo" />

        <div className="max-w-[1100px] mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.05, margin: "0px 0px -100px 0px" }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6">
              <BarChart3 className="w-4 h-4" />
              <span>The Evolution</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Stop <span className="text-white/40 decoration-red-500/50 line-through">Managing</span>. Start <span className="text-indigo-400">Scaling</span>.
            </h2>
            <p className="text-lg text-white/40 max-w-2xl mx-auto">
              Traditional tools were built for 2015. VeeFore is built for the AI era.
            </p>
          </motion.div>

          <div className="space-y-4">
            {[
              {
                oldTitle: "Manual Grinding",
                oldDesc: "Hours of typing replies one by one. Slow, exhausting, and unscalable.",
                oldIcon: X,
                newTitle: "Velocity Engine",
                newDesc: "AI replies instantly with context. Boosts algorithm scores while you sleep.",
                newIcon: Zap,
                gradient: "from-blue-600 to-cyan-500",
                metric: "< 2s Response"
              },
              {
                oldTitle: "Leaking Bucket",
                oldDesc: "Missed leads and forgotten follow-ups. Money left on the table daily.",
                oldIcon: Lock,
                newTitle: "Conversion Machine",
                newDesc: "24/7 Sales Funnel that qualifies leads and sends payment links automatically.",
                newIcon: DollarSign,
                gradient: "from-emerald-600 to-green-500",
                metric: "+24% Sales"
              },
              {
                oldTitle: "Guesswork",
                oldDesc: "Posting blindly and hoping for luck without understanding viral drivers.",
                oldIcon: Search,
                newTitle: "Viral Intelligence",
                newDesc: "Analyze top performers to extract exact hooks and patterns that guarantee reach.",
                newIcon: Brain,
                gradient: "from-purple-600 to-pink-500",
                metric: "94% Accuracy"
              }
            ].map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="group relative overflow-hidden rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-500">
                  {/* Subtle hover glow */}
                  <div className={`absolute inset-0 bg-gradient-to-r ${card.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 pointer-events-none`} />

                  <div className="flex flex-col md:flex-row items-stretch">
                    {/* Old Way - 40% width */}
                    <div className="p-6 md:p-8 md:w-[40%] flex flex-col justify-center border-b md:border-b-0 md:border-r border-white/5 bg-white/[0.01]">
                      <div className="flex items-center space-x-3 mb-3 opacity-40 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-60">
                        <card.oldIcon size={18} />
                        <h3 className="text-xs font-bold uppercase tracking-widest">{card.oldTitle}</h3>
                      </div>
                      <p className="text-sm text-white/30 leading-relaxed">{card.oldDesc}</p>
                    </div>

                    {/* New Way - 60% width */}
                    <div className="p-6 md:p-8 md:w-[60%] flex flex-col justify-center relative">
                      <div className="absolute top-3 right-4 md:top-4 md:right-6 text-[9px] font-mono uppercase tracking-widest text-white/20">VeeFore</div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-4 sm:gap-0">
                        <div className="flex items-center space-x-4">
                          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-lg shadow-black/50`}>
                            <card.newIcon size={20} />
                          </div>
                          <h3 className="text-xl font-bold text-white tracking-tight">{card.newTitle}</h3>
                        </div>
                        {/* Metric */}
                        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 w-fit">
                          <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${card.gradient}`} />
                          <span className="text-xs font-mono font-medium text-white/70">{card.metric}</span>
                        </div>
                      </div>
                      <p className="text-sm md:text-base text-white/50 pl-0 md:pl-[58px] leading-relaxed group-hover:text-white/70 transition-colors duration-300">
                        {card.newDesc}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <MagneticButton
              className="bg-white text-black hover:bg-white/90 rounded-full px-8 py-3 text-sm font-bold transition-all duration-300 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)]"
              onClick={() => onNavigate('signup')}
            >
              Switch to VeeFore Now
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* Pricing */}
      < section id="pricing" className="pt-32 pb-0 relative" >
        <GradientOrb className="w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="blue" />

        <div className="max-w-[1200px] mx-auto px-6 relative">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Choose your <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">growth speed</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto mb-10">
              We don't sell features. We sell saved time, increased engagement, and automation leverage.
            </p>

            <div className="inline-flex items-center p-1 rounded-full bg-white/5 border border-white/10">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'yearly' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
              >
                Yearly <span className="text-green-500 ml-1 text-xs">-17%</span>
              </button>
            </div>
          </div>

          {/* Mobile View - Sticky Stack */}
          <div className="md:hidden flex flex-col space-y-6 pb-8">
            {pricingPlans.map((plan, i) => (
              <div
                key={plan.name}
                className="sticky transition-all duration-300"
                style={{
                  top: `calc(5rem + ${i * 1.5}rem)`,
                  zIndex: i + 1
                }}
              >
                <TiltCard className="h-full group">
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-auto max-w-full px-4 py-1 rounded-full bg-blue-500 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-500/30 text-white z-30 whitespace-nowrap pointer-events-none">
                      Most Popular
                    </div>
                  )}
                  <GlassCard className={`p-6 h-full flex flex-col !bg-gradient-to-br ${plan.gradient} ${plan.border} relative shadow-xl`}>

                    <div className="mb-4">
                      <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                      <p className="text-sm text-white/40">{plan.description}</p>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-baseline">
                        <span className="text-4xl font-bold">₹{plan.price.toLocaleString()}</span>
                        <span className="text-white/40 ml-2">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                      </div>
                      <p className="text-sm text-white/30 mt-1">{plan.credits.toLocaleString()} credits/month</p>
                    </div>

                    <div className="space-y-3 mb-6 flex-1">
                      {plan.features.map((feature, j) => (
                        <div key={j} className="flex items-center space-x-2 text-sm text-white/60">
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                      {plan.locked.map((feature, j) => (
                        <div key={j} className="flex items-center space-x-2 text-sm text-white/30">
                          <Lock className="w-4 h-4 shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <MagneticButton
                      className={`w-full rounded-full py-3 font-bold transition-all ${plan.popular
                        ? 'bg-white text-black hover:bg-white/90'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                        }`}
                      onClick={() => onNavigate('signup')}
                    >
                      Get Started
                    </MagneticButton>
                  </GlassCard>
                </TiltCard>
              </div>
            ))}
          </div>

          {/* Desktop View - Scroll Animation */}
          <PricingScrollAnimation
            pricingPlans={pricingPlans}
            billingCycle={billingCycle}
            onNavigate={onNavigate}
          />
        </div>
      </section >

      {/* Beta Launch */}
      <BetaLaunchSection onNavigate={onNavigate} />

      {/* FAQ */}
      < section id="faq" className="py-32 relative" >
        <div className="max-w-[800px] mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold">Frequently Asked</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i}>
                <GlassCard className="overflow-hidden">
                  <button
                    onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                    className="w-full p-6 flex items-center justify-between text-left"
                  >
                    <span className="font-bold pr-4">{faq.q}</span>
                    <div className={`w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 transition-transform duration-300 ${activeFaq === i ? 'rotate-45' : ''}`}>
                      <Plus className="w-4 h-4" />
                    </div>
                  </button>
                  <AnimatePresence>
                    {activeFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="px-6 pb-6 text-white/50 leading-relaxed"
                      >
                        {faq.a}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassCard>
              </div>
            ))}
          </div>
        </div>
      </section >

      {/* Final CTA */}
      < section className="py-32 relative overflow-hidden" >
        <GradientOrb className="w-[800px] h-[800px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="purple" />

        <div className="max-w-[900px] mx-auto px-6 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.05, margin: "0px 0px -100px 0px" }}
          >
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8">
              Don't miss the <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">beta launch</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto mb-12">
              Be among the first creators to experience VeeFore. Limited spots available for early adopters who want to grow smarter.
            </p>

            <MagneticButton
              className="group relative bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full px-14 py-6 text-xl font-bold overflow-hidden"
              onClick={() => onNavigate('signup')}
            >
              <span className="relative z-10 flex items-center">
                Join Beta Waitlist
                <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-[-2px] bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 rounded-full blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
            </MagneticButton>
          </motion.div>
        </div>
      </section >

      {/* Footer */}
      < footer className="py-20 border-t border-white/[0.05] relative overflow-hidden" >
        <div className="absolute inset-0 bg-gradient-to-t from-blue-500/[0.02] to-transparent" />

        <div className="max-w-[1200px] mx-auto px-6 relative">
          <div className="grid md:grid-cols-5 gap-12 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-2.5 mb-6">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">VeeFore</span>
              </div>
              <p className="text-white/30 text-sm leading-relaxed max-w-xs mb-6">
                AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically.
              </p>

              <div className="flex items-center space-x-3">
                {[
                  { icon: Twitter, href: '#', gradient: 'from-blue-400 to-cyan-400' },
                  { icon: Instagram, href: '#', gradient: 'from-pink-500 to-purple-500' },
                  { icon: Linkedin, href: '#', gradient: 'from-blue-600 to-blue-400' }
                ].map((social, i) => (
                  <a
                    key={i}
                    href={social.href}
                    className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-gradient-to-br hover:${social.gradient} transition-all duration-300 group`}
                  >
                    <social.icon className="w-5 h-5 text-white/40 group-hover:text-white transition-colors" />
                  </a>
                ))}
              </div>
            </div>

            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Free Trial', 'Changelog'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
              { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'GDPR'] }
            ].map((col) => (
              <div key={col.title}>
                <h5 className="font-bold mb-4 text-xs uppercase tracking-widest text-white/30">{col.title}</h5>
                <ul className="space-y-3 text-sm text-white/40">
                  {col.links.map((link) => (
                    <li key={link} className="hover:text-white cursor-pointer transition-colors">{link}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mb-12">
            <GlassCard className="p-6 md:p-8 !bg-gradient-to-r !from-blue-500/[0.05] !to-purple-500/[0.05]">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-center md:text-left">
                  <h4 className="font-bold text-lg mb-1">Stay in the loop</h4>
                  <p className="text-sm text-white/40">Get growth tips and VeeFore updates in your inbox</p>
                </div>
                <div className="flex w-full md:w-auto">
                  <div className="relative flex-1 md:w-72">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                      type="email"
                      placeholder="Enter your email"
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-l-xl text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
                    />
                  </div>
                  <button className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-r-xl text-sm font-bold hover:opacity-90 transition-opacity whitespace-nowrap">
                    Subscribe
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="pt-8 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/20 text-sm">
              © 2025 VeeFore. Built for serious creators.
            </p>
            <div className="flex items-center space-x-6 text-sm text-white/30">
              <span className="hover:text-white cursor-pointer transition-colors">Privacy Policy</span>
              <span className="hover:text-white cursor-pointer transition-colors">Terms of Service</span>
              <span className="hover:text-white cursor-pointer transition-colors">Cookie Policy</span>
            </div>
          </div>
        </div>
      </footer >
    </div >
  )
}

export default Landing