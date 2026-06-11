import React, { useState, useEffect, useRef, Suspense, useCallback, memo } from 'react'
import { Link } from 'wouter'
import { useWaitlist } from '../context/WaitlistContext'

import { motion, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Zap, CheckCircle, MessageSquare, Bot, TrendingUp,
  Users, Sparkles, Brain, Plus,
  Clock, Shield, BarChart3, Send, Layers,
  Crown, RefreshCw, Lock,
  X, Mail,
  MessageCircle, Check, DollarSign, Search
} from 'lucide-react'
import { SEO, seoConfig } from '../lib/seo-optimization'
import { MOBILE_OPTIMIZED_LAYER } from '../lib/animation-performance';
import { useIsMobile } from '../hooks/use-is-mobile';
import GlassCard from '../components/GlassCard';
// MainNavigation and MainFooter are rendered by App.tsx for all public pages

// PERMANENT FIX: All sections now eagerly imported to eliminate async loading flickering
// React.lazy() with Suspense causes brief fallback flashes when chunks load
// Direct imports ensure everything is bundled and renders immediately

// Feature showcases with mockups
import { CinematicFeatures } from '../components/CinematicFeatures';
import StickyScrollFeaturesV2 from '../components/StickyScrollFeaturesV2';

// All sections - now eagerly loaded to prevent flickering
import { PricingScrollAnimation } from '../components/PricingScrollAnimation';
import TargetAudienceSection from '../components/TargetAudienceSection';
import GrowthEngineSection from '../components/GrowthEngineSection';
import CreditSystemSection from '../components/CreditSystemSection';
import BetaLaunchSection from '../components/BetaLaunchSection';
import CinematicHeroSection from '../components/CinematicHeroSection';
import { AlgorithmScienceSection } from '../components/AlgorithmScienceSection';


// Visuals for Hero section
import { Phase1EngagementVisual, Phase1DMVisual, HookVisual } from '../components/USPVisuals';

// Phase 1 Review Mode flag
const isPhase1 = import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true';

// Cinematic Hero flag is now permanently true, old hero removed
// Only keep 3D component lazy as it's truly optional and heavy (WebGL)
// (Leaving Landing3D import if it's used elsewhere, but removing MobileBackground as it was only used in old hero)

const Landing3DFallback = memo(() => (
  <div className="absolute inset-0 bg-black">
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black" />
    <div className="fallback-orb" />
  </div>
))

// Gradient orbs with blur effects - GPU accelerated
const GradientOrb = ({ className, color = 'blue' }: { className?: string, color?: string }) => {
  const colors = {
    blue: 'from-blue-500/30 via-blue-600/20 to-transparent',
    purple: 'from-purple-500/30 via-purple-600/20 to-transparent',
    indigo: 'from-indigo-500/30 via-indigo-600/20 to-transparent',
    cyan: 'from-cyan-500/20 via-cyan-600/10 to-transparent'
  }

  return (
    <div
      className={`gradient-orb bg-gradient-radial ${colors[color as keyof typeof colors]} blur-3xl ${className}`}
      style={MOBILE_OPTIMIZED_LAYER}
    />
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

const taglines = isPhase1 ? [
  { top: "Posting is not growth.", bottom: "Engagement is." },
  { top: "Schedule smarter.", bottom: "Grow faster." },
  { top: "Publish with precision.", bottom: "Grow with data." },
  { top: "Turn attention", bottom: "into interaction." },
  { top: "AI that actively", bottom: "grows your account." },
  { top: "Content at scale.", bottom: "Analytics at depth." }
] : [
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
        className="flex items-center space-x-8 md:space-x-16 pr-8 md:pr-16 shrink-0"
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
        className="flex items-center space-x-8 md:space-x-16 pr-8 md:pr-16 shrink-0"
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
          <motion.div
            key={index}
            initial={false}
            animate={{
              opacity: isActive ? 1 : 0,
              y: isActive ? 0 : (isExiting ? '-100%' : '100%'),
              scale: isActive ? 1 : 0.95
            }}
            transition={{
              duration: isMobile ? 0.5 : 0.9,
              ease: [0.22, 1, 0.36, 1]
            }}
            className={`absolute inset-0 flex flex-col items-center justify-center ${isActive ? 'hero-text-no-blur' : 'hero-text-blur'}`}
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
      className={`${className} `}
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
        isPhase1
          ? { label: 'Posts Scheduled', value: '3,291', change: '+42%', color: 'text-purple-400' }
          : { label: 'DMs Processed', value: '3,291', change: '+42%', color: 'text-purple-400' },
        { label: 'Hooks Created', value: '847', change: '+28%', color: 'text-pink-400' },
        { label: 'Credits Used', value: '892/1200', change: '74%', color: 'text-amber-400' }
      ].map((stat) => (
        <div key={stat.label} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[10px] text-white/40 mb-1">{stat.label}</p>
          <div className="flex items-end justify-between">
            <span className="text-xl font-bold">{stat.value}</span>
            <span className={`text - xs ${stat.color} `}>{stat.change}</span>
          </div>
        </div>
      ))}
    </div>
    <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">Engagement Velocity</h4>
        <div className="flex items-center space-x-2 text-xs text-white/40">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5" />{isPhase1 ? 'Posts' : 'Comments'}</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-purple-500 mr-1.5" />{isPhase1 ? 'Saves' : 'DMs'}</span>
        </div>
      </div>
      <div className="h-32 flex items-end space-x-2">
        {[40, 55, 45, 70, 60, 80, 75, 90, 85, 95, 88, 100].map((h, i) => (
          <div key={i} style={{ height: `${h}% ` }} className="flex-1 rounded-t-sm bg-gradient-to-t from-blue-600 to-blue-400" />
        ))}
      </div>
    </div>
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <h4 className="text-sm font-medium mb-3">Recent AI Activity</h4>
      <div className="space-y-2">
        {[
          isPhase1 ? { text: 'Scheduled 3 posts for peak engagement windows', time: '2m ago' } : { text: 'Replied to 12 comments on latest post', time: '2m ago' },
          isPhase1 ? { text: 'Hook score improved by 12 points this week', time: '5m ago' } : { text: 'Processed 8 DM inquiries automatically', time: '5m ago' },
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

const EngagementPageContent = memo(() => isPhase1 ? (
  <div className="space-y-4">
    <div className="p-5 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">AI Smart Scheduler</h4>
            <p className="text-xs text-white/40">Best-time publishing active</p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>Active</span>
        </div>
      </div>
      <div className="space-y-3">
        {[
          { time: 'Mon 9:00 AM', label: 'Product Reel', reach: '+94% reach', status: 'scheduled' },
          { time: 'Wed 12:00 PM', label: 'Carousel Post', reach: '+87% reach', status: 'optimal' },
          { time: 'Fri 6:00 PM', label: 'Story Series', reach: '+78% reach', status: 'scheduled' }
        ].map((item, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-start justify-between mb-1">
              <span className="text-xs font-medium text-blue-400">{item.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === 'optimal' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>{item.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-white/50">{item.time}</p>
              <p className="text-[11px] text-green-400 font-medium">{item.reach}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="p-5 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Hook Intelligence</h4>
            <p className="text-xs text-white/40">Viral patterns analyzed</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-purple-400">94</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[{ label: 'Hooks Scored', value: '847' }, { label: 'Avg Score', value: '91%' }, { label: 'Top Hook', value: '#FOMO' }].map((s, i) => (
          <div key={i} className="p-2 rounded-lg bg-white/[0.03]">
            <p className="text-lg font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-white/40">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
) : (
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
              <span className={`text - [10px] px - 2 py - 0.5 rounded - full ${item.status === 'sent' ? 'bg-green-500/20 text-green-400' : item.status === 'sending' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40'} `}>{item.status}</span>
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

  const sidebarItems = isPhase1 ? [
    { name: 'Dashboard', pageIndex: 0 },
    { name: 'Scheduler', pageIndex: 1 },
    { name: 'Analytics', pageIndex: null },
    { name: 'Hooks', pageIndex: 2 },
    { name: 'Publish', pageIndex: null }
  ] : [
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

      // Move to Engagement (was 3000 -> 1500)
      addTimeout(() => {
        if (!isMounted) return
        setCursorPos(getCursorPosition(1))
      }, 1500)

      // Click Engagement (was 3600 -> 1800)
      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(true)
      }, 1800)

      // Switch to Engagement (was 3750 -> 1900)
      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(false)
        setActivePage(1)
      }, 1900)

      // Move to Hooks (was 7750 -> 3900)
      addTimeout(() => {
        if (!isMounted) return
        setCursorPos(getCursorPosition(3))
      }, 3900)

      // Click Hooks (was 8350 -> 4200)
      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(true)
      }, 4200)

      // Switch to Hooks (was 8500 -> 4300)
      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(false)
        setActivePage(2)
      }, 4300)

      // Move to Dashboard (was 12500 -> 6300)
      addTimeout(() => {
        if (!isMounted) return
        setCursorPos(getCursorPosition(0))
      }, 6300)

      // Click Dashboard (was 13100 -> 6600)
      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(true)
      }, 6600)

      // Switch to Dashboard (was 13250 -> 6700)
      addTimeout(() => {
        if (!isMounted) return
        setIsClicking(false)
        setActivePage(0)
      }, 6700)

      // Restart Loop (was 16250 -> 8200)
      addTimeout(() => {
        if (!isMounted) return
        runSequence()
      }, 8200)
    }

    addTimeout(() => runSequence(), 50)

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
                  className="absolute pointer-events-none z-50"
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
                      className={`px-3 py-2 rounded-lg text-xs transition-colors ${isActive ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-white/40'} `}
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
  const { openWaitlist } = useWaitlist()
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  // HUD State for Algorithm Science section

  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll()

  const heroFeatures = isPhase1 ? [
    {
      id: 'smart-scheduler',
      icon: Clock,
      title: 'Smart Content Scheduler',
      tagline: 'Post when your fans are actually awake.',
      description: 'Stop guessing when to hit publish. We track exactly when your specific audience is scrolling, so your post doesn\'t die in the first 10 minutes.',
      details: ['Peak-time prediction', 'Visual content calendar', 'Auto-publishing queue', 'Audience heatmaps'],
      gradient: 'from-blue-500 to-cyan-500',
      visual: <Phase1EngagementVisual />
    },
    {
      id: 'analytics-engine',
      icon: BarChart3,
      title: 'Deep Analytics Engine',
      tagline: 'Know exactly what is working and double down on it.',
      description: 'Understand your top content formats, posting patterns, and growth drivers with AI-powered insight reports.',
      details: ['Content performance scoring', 'Reach & impression tracking', 'Competitor benchmarking', 'AI growth recommendations'],
      gradient: 'from-purple-500 to-pink-500',
      visual: <Phase1DMVisual />
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
  ] : [
    {
      id: 'engagement-automation',
      icon: MessageSquare,
      title: 'AI Engagement Automation',
      tagline: 'Increase engagement velocity and consistency.',
      description: 'Fast, meaningful engagement directly boosts algorithmic reach. This is VeeFore\'s strongest differentiator.',
      details: ['Context-aware comment replies', 'Priority handling of high-value comments', 'Human-like tone control', 'Platform-safe automation limits'],
      gradient: 'from-blue-500 to-cyan-500',
      visual: <Phase1EngagementVisual />
    },
    {
      id: 'dm-automation',
      icon: Send,
      title: 'Smart DM Automation',
      tagline: 'Turn DMs into scalable growth and monetization channels.',
      description: 'Creators lose opportunities in DMs. VeeFore captures them without spam.',
      details: ['Keyword-triggered replies', 'Lead qualification logic', 'Creator-defined safety boundaries', 'Advanced follow-up funnels'],
      gradient: 'from-purple-500 to-pink-500',
      visual: <Phase1DMVisual />
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

  const pricingPlans = isPhase1 ? [
    {
      name: 'Starter',
      credits: 300,
      description: 'For new creators testing growth',
      features: ['AI Hook Generator', 'Caption & CTA Engine', 'Basic Scheduler', '1 Competitor', 'Read-only Analytics'],
      locked: ['Advanced Analytics', 'Bulk Scheduler', 'Adaptive AI'],
      gradient: 'from-slate-500/20 to-slate-600/10',
      border: 'border-white/10'
    },
    {
      name: 'Growth',
      credits: 1200,
      description: 'For serious creators ready to scale',
      features: ['Everything in Starter', 'AI Smart Scheduler', 'Social Listening', 'Hook Intelligence', 'Unlimited Scheduling', '3 Competitors', 'Adaptive AI Loop', 'Full Analytics'],
      locked: [],
      gradient: 'from-blue-500/20 to-indigo-500/20',
      border: 'border-blue-500/30',
      popular: true
    },
    {
      name: 'Pro',
      credits: 3000,
      description: 'For agencies and power users',
      features: ['Everything in Growth', '3-5 Social Accounts', 'Multi-Account Management', 'Team Access (2-5)', 'Priority Processing', 'Dedicated Support'],
      locked: [],
      gradient: 'from-purple-500/20 to-pink-500/20',
      border: 'border-purple-500/30'
    }
  ] : [
    {
      name: 'Starter',
      credits: 300,
      description: 'For new creators testing growth',
      features: ['AI Hook Generator', 'Caption & CTA Engine', 'Basic Scheduler', '1 Competitor', 'Read-only Analytics'],
      locked: ['Comment Automation', 'DM Automation', 'Adaptive AI'],
      gradient: 'from-slate-500/20 to-slate-600/10',
      border: 'border-white/10'
    },
    {
      name: 'Growth',
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
      credits: 3000,
      description: 'For agencies and power users',
      features: ['Everything in Growth', '3-5 Social Accounts', 'Advanced DM Funnels', 'Team Access (2-5)', 'Priority Processing', 'Dedicated Support'],
      locked: [],
      gradient: 'from-purple-500/20 to-pink-500/20',
      border: 'border-purple-500/30'
    }
  ]

  const faqs = isPhase1 ? [
    {
      q: "What exactly is VeeFore?",
      a: "VeeFore is an AI-powered Social Media Growth Platform for serious creators and brands. It supercharges your growth through three core systems: AI Hook Intelligence (viral content analysis), Smart Scheduler (best-time publishing), and Deep Analytics (performance insights). Think of it as having a 24/7 data-driven growth team.",
      category: "About"
    },
    {
      q: "How is VeeFore different from Hootsuite, Buffer, or Later?",
      a: "Those tools help you schedule and publish content. VeeFore goes deeper — we analyze what content performs best, recommend the exact time to publish, and give you actionable hook intelligence to create content that actually reaches people. Our philosophy: data before guessing, insights before impressions.",
      category: "Comparison"
    },
    {
      q: "How does VeeFore's AI content system work?",
      a: "VeeFore's AI continuously analyzes top-performing content in your niche, extracts the hook patterns and emotional triggers that drive viral reach, and uses your historical performance data to recommend what to create and when to post. The more you use it, the smarter it gets.",
      category: "About"
    },
    {
      q: "How does the credit system work?",
      a: "1 Credit = 1 AI Action. Actions include: generating viral hooks, creating captions with CTAs, analyzing trends, scoring your content, or generating posting schedules. Credits reset monthly based on your plan. Starter gets 300 credits, Growth gets 1,200, and Pro gets 3,000 credits. Unused credits don't roll over, so use them!",
      category: "Pricing"
    },
    {
      q: "Which platforms does VeeFore support?",
      a: "We're launching with full Instagram support (posts, reels, stories). TikTok, YouTube Shorts, and Twitter/X integrations are on our roadmap for Q2 2025. Beta users will get early access to new platform integrations as they roll out.",
      category: "Platforms"
    },
    {
      q: "What do I get by joining the beta waitlist?",
      a: "Beta members receive exclusive perks: 500 bonus credits on launch, access to a surprise feature we haven't announced yet, 30 days free trial (vs. 14 days for regular users), founding member pricing locked in forever, and direct access to our team for feedback and support. Plus, you'll help shape the product roadmap.",
      category: "Beta"
    },
    {
      q: "Who is VeeFore built for?",
      a: "VeeFore is designed for Instagram creators with 5K-500K followers, personal brands, coaches, agencies managing multiple accounts, and e-commerce brands using social for sales. If you're serious about growth and value your time, VeeFore is for you. Not ideal for casual posters or hobby accounts.",
      category: "About"
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes, absolutely. No contracts, no commitments. You can cancel your subscription at any time from your dashboard. Your access continues until the end of your billing period. We believe in earning your business every month, not locking you in.",
      category: "Pricing"
    }
  ] : [
    {
      q: "What exactly is VeeFore?",
      a: "VeeFore is an AI-powered Social Media Growth Engine designed for serious creators and brands. Unlike basic scheduling tools, VeeFore actively participates in your growth through three core systems: AI Engagement Automation (smart comment replies), Hook Intelligence (trend analysis & viral hook suggestions), and Smart DM Funnels (converting followers into customers). Think of it as having a 24/7 growth team powered by AI.",
      category: "About"
    },
    {
      q: "How is VeeFore different from Hootsuite, Buffer, or Later?",
      a: "Those tools help you schedule and publish content. VeeFore focuses on what happens AFTER you post. We help you respond to comments faster, engage with your audience at scale, identify trending hooks before they blow up, and turn DM conversations into conversions. Our philosophy: Engagement before volume, interaction before impressions.",
      category: "Comparison"
    },
    {
      q: "Is the automation safe for my account?",
      a: "Absolutely. VeeFore uses context-aware AI that mimics natural human engagement patterns. We implement strict rate limits well below platform thresholds, use human-like delays between actions, and our AI generates contextually relevant responses—not generic spam. Your account safety is our top priority, which is why we've built compliance into every feature.",
      category: "Safety"
    },
    {
      q: "How does the credit system work?",
      a: "1 Credit = 1 AI Action. Actions include: generating viral hooks, creating captions with CTAs, replying to comments, sending DM responses, or analyzing trends. Credits reset monthly based on your plan. Starter gets 300 credits, Growth gets 1,200, and Pro gets 3,000 credits. Unused credits don't roll over, so use them!",
      category: "Pricing"
    },
    {
      q: "Which platforms does VeeFore support?",
      a: "We're launching with full Instagram support (posts, reels, stories, DMs). TikTok, YouTube Shorts, and Twitter/X integrations are on our roadmap for Q2 2025. Beta users will get early access to new platform integrations as they roll out.",
      category: "Platforms"
    },
    {
      q: "What do I get by joining the beta waitlist?",
      a: "Beta members receive exclusive perks: 500 bonus credits on launch, access to a surprise feature we haven't announced yet, 30 days free trial (vs. 14 days for regular users), founding member pricing locked in forever, and direct access to our team for feedback and support. Plus, you'll help shape the product roadmap.",
      category: "Beta"
    },
    {
      q: "Who is VeeFore built for?",
      a: "VeeFore is designed for Instagram creators with 5K-500K followers, personal brands, coaches, agencies managing multiple accounts, and e-commerce brands using social for sales. If you're serious about growth and value your time, VeeFore is for you. Not ideal for casual posters or hobby accounts.",
      category: "About"
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes, absolutely. No contracts, no commitments. You can cancel your subscription at any time from your dashboard. Your access continues until the end of your billing period. We believe in earning your business every month, not locking you in.",
      category: "Pricing"
    }
  ]

  return (
    <div ref={containerRef} className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
      <SEO {...seoConfig.landing} />
      <img src="/veefore.svg" alt="" className="hidden" aria-hidden="true" />

      {/* Ambient Background - absolute on mobile to avoid iOS fixed stacking issues */}
      <div className={`${isMobile ? 'absolute h-[500vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
        <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
        <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
        <GradientOrb className={`${isMobile ? 'w-[250px] h-[250px]' : 'w-[500px] h-[500px]'} bottom-[10%] left-[20%]`} color="indigo" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
      </div>

      {/* MainNavigation is rendered by App.tsx */}

      <CinematicHeroSection />

      <section className="relative pt-8 pb-20 md:pb-32 -mt-20 z-20 w-full overflow-visible">
        <div className="w-full px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 160, scale: 0.95, rotateX: 5 }}
            whileInView={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            viewport={{ once: false, amount: 0, margin: "0px 0px 300px 0px" }}
            onViewportEnter={() => {
              // Gentle haptic feedback as it locks into place
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(20);
              }
            }}
            transition={{
              opacity: { duration: 0.5, delay: 0.1 },
              y: { type: 'spring', stiffness: 120, damping: 20, mass: 1.8, delay: 0.1 },
              scale: { type: 'spring', stiffness: 100, damping: 20, mass: 1.5, delay: 0.1 },
              rotateX: { type: 'spring', stiffness: 100, damping: 20, mass: 1.5, delay: 0.1 },
            }}
            style={{ perspective: 1200, transformStyle: 'preserve-3d' }}
            className="relative w-full"
          >
            {/* Side Graphics - Left (Faded, beautiful.ai style) - Hidden on mobile */}
            <div className="hidden md:block absolute left-4 lg:left-8 xl:left-12 top-1/2 -translate-y-1/2 w-[140px] lg:w-[180px] xl:w-[220px] space-y-3 lg:space-y-4 z-0 pointer-events-none" style={{ maskImage: 'linear-gradient(to right, transparent, black 60%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 60%)' }}>
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 0.4, x: 0 }}
                transition={{ delay: 0.3, duration: 0.8 }}
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
                        style={{ height: `${h}% ` }}
                        className="flex-1 bg-gradient-to-t from-pink-500 to-rose-400 rounded-sm"
                      />
                    ))}
                  </div>
                </GlassCard>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 0.35, x: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
              >
                <GlassCard className="p-2 lg:p-3 xl:p-4">
                  <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-3">
                    <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <MessageSquare className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[8px] lg:text-[10px] text-white/40">{isPhase1 ? 'Posts Scheduled' : 'DM Responses'}</p>
                      <p className="text-sm lg:text-base xl:text-lg font-bold">1,847</p>
                    </div>
                  </div>
                  <div className="space-y-1 lg:space-y-1.5">
                    <div className="flex items-center justify-between text-[8px] lg:text-[10px]">
                      <span className="text-white/40">{isPhase1 ? 'On-time' : 'Automated'}</span>
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
                transition={{ delay: 0.3, duration: 0.8 }}
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
                transition={{ delay: 0.4, duration: 0.8 }}
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
                  <p className="text-[7px] lg:text-[10px] text-white/30">{isPhase1 ? 'Faster than manual publishing' : 'Faster than manual engagement'}</p>
                </GlassCard>
              </motion.div>
            </div>

            {/* Central Dashboard - Animated Motion Graphic - Now visible on mobile */}
            <div className="relative">
              <TiltCard className="w-full">
                <AnimatedDashboard />
              </TiltCard>

              {/* Floating Elements - Responsive */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="absolute -bottom-3 sm:-bottom-6 left-0 sm:-left-6 px-2 sm:px-4 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 backdrop-blur-xl z-20"
              >
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <CheckCircle className="w-3 h-3 sm:w-5 sm:h-5 text-green-400" />
                  <span className="text-[10px] sm:text-sm font-medium text-green-300">{isPhase1 ? 'AI is optimizing your content' : 'AI is actively engaging'}</span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="absolute -bottom-3 sm:-bottom-4 right-0 sm:-right-4 px-2 sm:px-4 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 backdrop-blur-xl z-20"
              >
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <Zap className="w-3 h-3 sm:w-5 sm:h-5 text-blue-400" />
                  <span className="text-[10px] sm:text-sm font-medium text-blue-300">{isPhase1 ? 'Smart Scheduler Active' : '24/7 Automation Active'}</span>
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

      {/* Growth Engine Section - "How It Works" (New Premium Design) */}
      <GrowthEngineSection />

      {/* Algorithm Impact - Why Engagement Velocity Matters */}
      <AlgorithmScienceSection />

      {/* Sticky Scroll "Story" Features */}
      <StickyScrollFeaturesV2 />


      {/* Problem / Philosophy Section */}
      <section id="how-it-works" className="py-10 md:py-16 relative overflow-hidden w-full">
        {/* Background Gradients */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-red-500/5 rounded-full blur-[60px] md:blur-[100px] pointer-events-none" />
        <div className="absolute right-0 bottom-0 w-[250px] md:w-[400px] h-[250px] md:h-[400px] bg-blue-500/5 rounded-full blur-[60px] md:blur-[100px] pointer-events-none" />

        <div className="w-full px-4 md:px-12 lg:px-20 relative z-10">
          <div className="text-center mb-12 md:mb-20">
            <div
              className="inline-flex items-center space-x-2 px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] md:text-xs font-bold text-red-400 uppercase tracking-widest mb-4 md:mb-6"
            >
              <span className="flex h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-red-500 animate-pulse mr-1.5 md:mr-2" />
              <span>The Real Problem</span>
            </div>
            <h2
              className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight mb-4 md:mb-6"
            >
              Why Creators <span className="text-red-500 drop-shadow-sm">Fail</span>
            </h2>
            <p
              className="text-sm sm:text-lg md:text-xl text-white/40 max-w-2xl mx-auto leading-relaxed"
            >
              Most tools focus on posting, scheduling, and analytics. <br className="hidden md:block" />
              But creators don't fail because they lack tools.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-stretch">
            {/* Left Column: The Failures */}
            <div className="space-y-3 md:space-y-4 flex flex-col justify-center">
              {(isPhase1 ? [
                { title: 'Content Burnout', desc: 'Spending too much time creating content manually' },
                { title: 'Missed Peak Times', desc: 'Missing the best time to post for maximum reach' },
                { title: 'Algorithm Momentum Loss', desc: 'Slow responses kill viral potential instantly' },
                { title: 'Time Burnout', desc: 'Hours wasted on repetitive, low-value typing' },
                { title: 'Blind Creation', desc: 'Posting without knowing what actually hooks' }
              ] : [
                { title: 'Inconsistent Engagement', desc: 'Cannot keep up with comments & DMs manually' },
                { title: 'Missed Opportunities', desc: 'Leads slip through cracks in untracked DMs' },
                { title: 'Algorithm Momentum Loss', desc: 'Slow responses kill viral potential instantly' },
                { title: 'Time Burnout', desc: 'hours wasted on repetitive, low-value typing' },
                { title: 'Blind Creation', desc: 'Posting without knowing what actually hooks' }
              ]).map((item, i) => (
                <div key={i}>
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
                </div>
              ))}
            </div>

            {/* Right Column: The Solution Philosophy */}
            <div
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
                        <div className={`w - 10 h - 10 md: w - 12 md: h - 12 rounded - xl ${item.bg} flex items - center justify - center shrink - 0 group - hover: scale - 110 transition - transform duration - 300`}>
                          <item.icon className={`w - 5 h - 5 md: w - 6 md: h - 6 ${item.color} `} />
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
            </div>
          </div>
        </div>
      </section>

      {/* Who is VeeFore For - Target Audience Section */}
      <TargetAudienceSection />

      {/* Hero Features - Cinematic Scroll */}
      <section id="features" className="relative bg-black">
        <div className="pt-10 md:pt-14 pb-4 text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 md:mb-6">
            <Layers className="w-4 h-4" />
            <span>GAME-CHANGING FEATURES</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 md:mb-6">
            Everything You Need to <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Scale</span>
          </h2>
          <p className="text-base md:text-xl text-white/40 max-w-2xl mx-auto px-4">
            Stop guessing. Start growing. VeeFore gives you the AI-powered tools to create, engage, and convert like top 1% creators.
          </p>
        </div>

        <CinematicFeatures features={heroFeatures} />
      </section>

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
                newTitle: isPhase1 ? 'Smart Publisher' : 'Conversion Machine',
                newDesc: isPhase1 ? 'Post at the perfect time with AI scheduling that maximizes your content reach and impressions.' : '24/7 Sales Funnel that qualifies leads and sends payment links automatically.',
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
                  <div className={`absolute inset - 0 bg - gradient - to - r ${card.gradient} opacity - 0 group - hover: opacity - [0.03] transition - opacity duration - 500 pointer - events - none`} />

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
                          <div className={`p - 2.5 rounded - xl bg - gradient - to - br ${card.gradient} text - white shadow - lg shadow - black / 50`}>
                            <card.newIcon size={20} />
                          </div>
                          <h3 className="text-xl font-bold text-white tracking-tight">{card.newTitle}</h3>
                        </div>
                        {/* Metric */}
                        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 w-fit">
                          <div className={`w - 1.5 h - 1.5 rounded - full bg - gradient - to - r ${card.gradient} `} />
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
            <button
              className="btn-brick btn-brick-white px-8 py-3 text-sm"
              onClick={() => onNavigate('signup')}
            >
              Get Started Now
            </button>
          </div>
        </div>
      </section>

      {/* Pricing */}
      < section id="pricing" className="pt-32 pb-0 relative" >
        <GradientOrb className="w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="blue" />

        <div className="max-w-[1200px] mx-auto px-6 relative">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6">
              Choose your <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">growth speed</span>
            </h2>
            <p className="text-sm sm:text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-6 sm:mb-10 px-4">
              {isPhase1 ? "We don't sell features. We sell saved time, increased engagement, and AI-powered content growth." : "We don't sell features. We sell saved time, increased engagement, and automation leverage."}
            </p>


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
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-auto max-w-full px-3 py-1 rounded-full bg-blue-500 text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-blue-500/30 text-white z-30 whitespace-nowrap pointer-events-none">
                      Most Popular
                    </div>
                  )}
                  <GlassCard className={`p-4 sm:p-6 h-full flex flex-col bg-gradient-to-br ${plan.gradient} ${plan.border} relative shadow-xl`}>

                    <div className="mb-3 sm:mb-4">
                      <h3 className="text-xl sm:text-2xl font-bold mb-1">{plan.name}</h3>
                      <p className="text-xs sm:text-sm text-white/40">{plan.description}</p>
                    </div>

                    <div className="mb-4 sm:mb-6">
                      {/* Hidden Price - Coming Soon */}
                      <div className="relative mb-1">
                        {/* Blurred price hint */}
                        <div className="flex items-baseline filter blur-sm select-none pointer-events-none opacity-50">
                          <span className="text-2xl sm:text-4xl font-bold">₹???</span>
                          <span className="text-white/40 ml-2 text-sm">/mo</span>
                        </div>
                        {/* Coming Soon Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md">
                            <Lock className="w-3 h-3 text-amber-400" />
                            <span className="text-xs sm:text-sm font-medium text-white/90">Coming Soon</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs sm:text-sm text-white/30 mt-1">{plan.credits.toLocaleString()} credits/month</p>
                    </div>

                    <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 flex-1">
                      {plan.features.map((feature, j) => (
                        <div key={j} className="flex items-start space-x-2 text-xs sm:text-sm text-white/60">
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </div>
                      ))}
                      {plan.locked.map((feature, j) => (
                        <div key={j} className="flex items-start space-x-2 text-xs sm:text-sm text-white/30">
                          <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      className={`w-full py-2.5 sm:py-3 text-sm sm:text-base btn-brick ${plan.popular
                        ? 'btn-brick-white'
                        : 'btn-brick-dark'
                        }`}
                      onClick={() => onNavigate('signup')}
                    >
                      Get Started
                    </button>
                  </GlassCard>
                </TiltCard>
              </div>
            ))}
          </div>

          {/* Desktop View - Scroll Animation */}
          <div className="hidden md:block">
            <PricingScrollAnimation
              pricingPlans={pricingPlans}
            />
          </div>
        </div>
      </section >

      {/* Beta Launch */}
      <BetaLaunchSection />

      {/* FAQ */}
      <section id="faq" className="py-24 md:py-32 relative">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/10 to-transparent pointer-events-none" />

        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 relative">
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <span className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 mb-4 sm:mb-6">
              Got Questions?
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4">
              Frequently Asked <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Questions</span>
            </h2>
            <p className="text-white/40 text-sm sm:text-base lg:text-lg max-w-2xl mx-auto px-2">
              Everything you need to know about VeeFore and how it can help you grow.
            </p>
          </div>

          {/* FAQ Grid */}
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <div className="h-full bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] rounded-xl sm:rounded-2xl overflow-hidden hover:border-white/10 transition-colors duration-300">
                  <button
                    onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                    className="w-full p-4 sm:p-5 md:p-6 flex items-start justify-between text-left gap-3 sm:gap-4">
                    <div className="flex-1">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-[9px] sm:text-[10px] md:text-xs font-medium text-blue-300/80 mb-1.5 sm:mb-2">
                        {faq.category}
                      </span>
                      <span className="block font-semibold text-xs sm:text-sm md:text-base text-white/90 leading-snug">{faq.q}</span>
                    </div>
                    <div className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center shrink-0 transition-all duration-300 ${activeFaq === i ? 'rotate-45 from-blue-500/30 to-purple-500/30' : ''}`}>
                      <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white/70" />
                    </div>
                  </button>
                  <AnimatePresence>
                    {activeFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 sm:px-5 md:px-6 pb-4 sm:pb-5 md:pb-6 pt-0">
                          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-3 sm:mb-4" />
                          <p className="text-white/50 text-xs sm:text-sm md:text-[15px] leading-relaxed">
                            {faq.a}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Still have questions CTA */}
          <div className="text-center mt-8 sm:mt-12 md:mt-16">
            <p className="text-white/40 text-sm mb-3 sm:mb-4">Still have questions?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white transition-all duration-300 text-xs sm:text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                Contact Support
              </Link>
              <a
                href="mailto:support@veefore.com"
                className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full bg-transparent border border-white/10 text-white/60 hover:bg-white/5 hover:text-white/80 transition-all duration-300 text-xs sm:text-sm font-medium"
              >
                <Mail className="w-4 h-4" />
                Email Us
              </a>
            </div>
          </div>
        </div>
      </section>

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

            <button
              className="group btn-brick btn-brick-brand px-14 py-6 text-xl"
              onClick={() => onNavigate('signup')}
            >
              <span className="relative z-10 flex items-center">
                Get Started Now
                <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </motion.div>
        </div>
      </section>

      {/* MainFooter is rendered by App.tsx */}
    </div>
  )
}

export default Landing