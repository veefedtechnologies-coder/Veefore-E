import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { motion, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import { 
  ArrowRight, Play, Zap, CheckCircle, MessageSquare, Bot, TrendingUp, 
  Users, Sparkles, Brain, Rocket, ChevronDown, Plus, Minus,
  Target, Clock, Shield, BarChart3, Send, Layers, Eye, Activity,
  ChevronRight, Star, Crown, Gauge, RefreshCw, Lock, Unlock, ArrowUpRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEO, seoConfig } from '@/lib/seo-optimization'

const Landing3D = React.lazy(() => import('./Landing3D'))

const GradientOrb = ({ className, color = 'blue' }: { className?: string, color?: string }) => {
  const colors = {
    blue: 'from-blue-500/30 via-blue-600/20 to-transparent',
    purple: 'from-purple-500/30 via-purple-600/20 to-transparent',
    indigo: 'from-indigo-500/30 via-indigo-600/20 to-transparent',
    cyan: 'from-cyan-500/20 via-cyan-600/10 to-transparent'
  }
  return (
    <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
  )
}

const GlassCard = ({ children, className = '', hover = true }: { children: React.ReactNode, className?: string, hover?: boolean }) => (
  <div className={`relative backdrop-blur-xl bg-white/[0.02] border border-white/[0.08] rounded-[24px] overflow-hidden ${hover ? 'hover:border-white/[0.15] hover:bg-white/[0.04] transition-all duration-500' : ''} ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent pointer-events-none" />
    {children}
  </div>
)

const MagneticButton = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => {
  const ref = useRef<HTMLButtonElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 300, damping: 20 })
  const springY = useSpring(y, { stiffness: 300, damping: 20 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    x.set((e.clientX - centerX) * 0.15)
    y.set((e.clientY - centerY) * 0.15)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
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

const RotatingHeroText = () => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState(-1)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPrevIndex(currentIndex)
      setCurrentIndex((prev) => (prev + 1) % taglines.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [currentIndex])

  return (
    <div className="relative overflow-hidden" style={{ height: 'clamp(8rem, 20vw, 16rem)', paddingBottom: '0.15em' }}>
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
              filter: isActive ? 'blur(0px)' : 'blur(8px)',
              scale: isActive ? 1 : 0.95
            }}
            transition={{
              duration: 0.9,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="absolute inset-0 flex flex-col items-center justify-center"
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
}

const AnimatedText = ({ text, className = '' }: { text: string, className?: string }) => {
  const words = text.split(' ')
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block mr-[0.25em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  )
}

const TiltCard = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-100, 100], [8, -8])
  const rotateY = useTransform(x, [-100, 100], [-8, 8])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    x.set(e.clientX - centerX)
    y.set(e.clientY - centerY)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
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

const DashboardPageContent = () => (
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
)

const EngagementPageContent = () => (
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
)

const HooksPageContent = () => (
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
)

const AnimatedDashboard = () => {
  const [activePage, setActivePage] = useState(0)
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 12 })
  const [isClicking, setIsClicking] = useState(false)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const sidebarRef = useRef<HTMLDivElement>(null)
  
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
      return {
        x: itemRect.left - sidebarRect.left + itemRect.width / 2 + 8,
        y: itemRect.top - sidebarRect.top + itemRect.height / 2
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
  }, [getCursorPosition])


  return (
    <div className="relative mx-auto max-w-[1000px]">
      <div className="relative rounded-[20px] border border-white/10 bg-[#0a0a0a] shadow-[0_0_100px_rgba(59,130,246,0.15)] overflow-hidden">
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
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold">V</div>
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
                  <path d="M5.5 3.21V20.79c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87a.5.5 0 00.35-.85L6.35 2.86a.5.5 0 00-.85.35z" fill="#fff" stroke="#1a1a1a" strokeWidth="1.5"/>
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
                    ref={el => itemRefs.current[i] = el}
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
  )
}

const Landing = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null)
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [activeCredit, setActiveCredit] = useState(500)
  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll()
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95])
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, -50])

  const heroFeatures = [
    {
      id: 'engagement-automation',
      icon: MessageSquare,
      title: 'AI Engagement Automation',
      tagline: 'Increase engagement velocity and consistency.',
      description: 'Fast, meaningful engagement directly boosts algorithmic reach. This is VeeFore\'s strongest differentiator.',
      details: ['Context-aware comment replies', 'Priority handling of high-value comments', 'Human-like tone control', 'Platform-safe automation limits'],
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      id: 'dm-automation',
      icon: Send,
      title: 'Smart DM Automation',
      tagline: 'Turn DMs into scalable growth and monetization channels.',
      description: 'Creators lose opportunities in DMs. VeeFore captures them without spam.',
      details: ['Keyword-triggered replies', 'Lead qualification logic', 'Creator-defined safety boundaries', 'Advanced follow-up funnels'],
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      id: 'hook-intelligence',
      icon: Brain,
      title: 'AI Hook & Trend Intelligence',
      tagline: 'Remove guesswork from content creation.',
      description: 'Creators don\'t need trends. They need explanations. VeeFore provides intelligence, not noise.',
      details: ['Competitor hook extraction', 'Emotional pattern analysis', 'Niche-specific suggestions', 'Viral pattern prediction'],
      gradient: 'from-indigo-500 to-purple-500'
    }
  ]

  const supportFeatures = [
    { icon: Sparkles, title: 'AI Caption Engine', desc: 'Hook-aligned captions with CTA optimization' },
    { icon: Clock, title: 'Smart Scheduler', desc: 'Best-time recommendations with feedback loops' },
    { icon: Eye, title: 'Competitor Intel', desc: 'Top-performing posts and pattern analysis' },
    { icon: RefreshCw, title: 'Adaptive Learning', desc: 'AI learns and improves from your results' }
  ]

  const creditActions = [
    { action: 'Generate Hook', icon: Sparkles },
    { action: 'Create Caption', icon: MessageSquare },
    { action: 'Reply Comment', icon: Send },
    { action: 'DM Response', icon: Bot },
    { action: 'Competitor Scan', icon: Eye }
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

  const trialDays = [
    { day: '1', title: 'Connect & Create', desc: 'Link your account, generate first hooks' },
    { day: '2', title: 'Schedule & Automate', desc: 'Enable comment automation' },
    { day: '3', title: 'See Results', desc: 'First engagement data appears' },
    { day: '4-5', title: 'Hit Limits', desc: 'Experience upgrade motivation' },
    { day: '6-7', title: 'Decide', desc: 'Upgrade or explore alternatives' }
  ]

  const faqs = [
    { q: "What exactly is VeeFore?", a: "VeeFore is an AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically. Unlike schedulers or content tools, VeeFore participates in your growth through AI-driven engagement automation, hook intelligence, and smart DM funnels." },
    { q: "How is VeeFore different from other tools?", a: "Most tools help you create and schedule. VeeFore helps you RESPOND faster, ENGAGE at scale, and MAINTAIN momentum. We follow a Growth-First philosophy: engagement before volume, interaction before impressions." },
    { q: "Is the automation safe?", a: "Absolutely. VeeFore uses context-aware AI with human-like tone control and strictly adheres to platform-safe automation limits. Our system mimics natural engagement patterns to protect your account." },
    { q: "How does the credit system work?", a: "1 Credit = 1 AI Action. Actions include generating hooks, creating captions, replying to comments or DMs. Credits reset monthly. Starter gets 300, Growth gets 1,200, Pro gets 3,000 credits." },
    { q: "What's included in the free trial?", a: "7 days of Growth plan access with limits: 150 credits, 1 social account, capped automation. Experience real AI automation. No credit card required." },
    { q: "Who is VeeFore for?", a: "Instagram & short-form creators with 5k-200k followers who value time and want scale without spam. Not for casual posters or hobby accounts." }
  ]

  return (
    <div ref={containerRef} className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <SEO {...seoConfig.landing} />
      
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <GradientOrb className="w-[800px] h-[800px] -top-[200px] -left-[200px]" color="blue" />
        <GradientOrb className="w-[600px] h-[600px] top-[30%] -right-[150px]" color="purple" />
        <GradientOrb className="w-[500px] h-[500px] bottom-[10%] left-[20%]" color="indigo" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
      </div>

      {/* Navigation */}
      <motion.nav 
        initial={{ y: -100 }} 
        animate={{ y: 0 }} 
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-0 w-full z-50"
      >
        <div className="mx-4 mt-4">
          <GlassCard className="max-w-[1400px] mx-auto !rounded-full px-6 py-3" hover={false}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-8">
                <div className="flex items-center cursor-pointer" onClick={() => onNavigate('/')}>
                  <img 
                    src="/veefore-logo.png" 
                    alt="VeeFore" 
                    className="h-9 w-auto"
                  />
                </div>
                
                <div className="hidden lg:flex items-center space-x-6 text-sm font-medium text-white/50">
                  {['Features', 'How it Works', 'Pricing', 'FAQ'].map((item) => (
                    <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="hover:text-white transition-colors duration-300 relative group">
                      {item}
                      <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 group-hover:w-full transition-all duration-300" />
                    </a>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button className="text-sm font-medium text-white/60 hover:text-white transition-colors px-3 py-1.5" onClick={() => onNavigate('signin')}>Login</button>
                <MagneticButton 
                  className="bg-white text-black hover:bg-white/90 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300"
                  onClick={() => onNavigate('signup')}
                >
                  Start Free Trial
                </MagneticButton>
              </div>
            </div>
          </GlassCard>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Suspense fallback={<div className="w-full h-full bg-transparent" />}>
            <Landing3D />
          </Suspense>
        </div>
        
        <motion.div 
          style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
          className="container max-w-[1100px] mx-auto px-6 relative z-10 text-center"
        >
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] text-sm text-blue-400 mb-8 backdrop-blur-xl"
          >
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
              <Sparkles className="w-4 h-4" />
            </motion.div>
            <span className="font-medium">AI-Powered Growth Engine</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-[clamp(2.5rem,7vw,5.5rem)] font-extrabold tracking-[-0.04em] leading-[1] mb-8"
          >
            <RotatingHeroText />
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="text-xl md:text-2xl text-white/40 max-w-3xl mx-auto mb-6 leading-relaxed font-medium"
          >
            VeeFore actively grows your social media using AI-driven engagement automation, hook intelligence, and smart DM funnels.
          </motion.p>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="text-lg text-white/25 max-w-2xl mx-auto mb-12"
          >
            Most tools help you post. VeeFore helps you <span className="text-blue-400/80">respond faster</span>, <span className="text-indigo-400/80">engage at scale</span>, and <span className="text-purple-400/80">maintain momentum</span>.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <MagneticButton 
              className="group relative bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full px-10 py-5 text-lg font-bold overflow-hidden"
              onClick={() => onNavigate('signup')}
            >
              <span className="relative z-10 flex items-center">
                Start 7-Day Free Trial
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute inset-[-2px] bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 rounded-full blur-xl opacity-50" />
              </div>
            </MagneticButton>
            
            <button className="group flex items-center space-x-3 text-white/60 hover:text-white transition-colors px-6 py-4">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 transition-all">
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </div>
              <span className="font-semibold">Watch Demo</span>
            </button>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.3 }}
            className="mt-14 flex items-center justify-center space-x-8 text-white/30 text-sm"
          >
            {[
              { icon: CheckCircle, text: 'No credit card required' },
              { icon: Zap, text: '150 credits included' },
              { icon: Shield, text: 'Cancel anytime' }
            ].map((item, i) => (
              <div key={i} className="flex items-center space-x-2">
                <item.icon className="w-4 h-4 text-green-500/70" />
                <span>{item.text}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

      </section>

      {/* Dashboard Showcase Section */}
      <section className="relative py-8 -mt-20 z-20">
        <div className="max-w-[1600px] mx-auto px-4">
          <motion.div 
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
            className="relative"
          >
            {/* Side Graphics - Left (Faded, beautiful.ai style) */}
            <div className="hidden xl:block absolute left-0 top-1/2 -translate-y-1/2 w-[220px] space-y-4 z-0 pointer-events-none" style={{ maskImage: 'linear-gradient(to right, transparent, black 60%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 60%)' }}>
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 0.4, x: 0 }}
                transition={{ delay: 2, duration: 1 }}
              >
                <GlassCard className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40">Engagement Rate</p>
                      <p className="text-lg font-bold text-green-400">+247%</p>
                    </div>
                  </div>
                  <div className="h-12 flex items-end space-x-1">
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
                <GlassCard className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40">DM Responses</p>
                      <p className="text-lg font-bold">1,847</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white/40">Automated</span>
                      <span className="text-blue-400">94%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full w-[94%] bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </div>

            {/* Side Graphics - Right (Faded, beautiful.ai style) */}
            <div className="hidden xl:block absolute right-0 top-1/2 -translate-y-1/2 w-[220px] space-y-4 z-0 pointer-events-none" style={{ maskImage: 'linear-gradient(to left, transparent, black 60%)', WebkitMaskImage: 'linear-gradient(to left, transparent, black 60%)' }}>
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 0.4, x: 0 }}
                transition={{ delay: 2.1, duration: 1 }}
              >
                <GlassCard className="p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40">AI Hooks Generated</p>
                      <p className="text-lg font-bold">3,291</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {['Trending', 'Emotional', 'Question', 'Story'].map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 text-[9px] rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20">{tag}</span>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 0.35, x: 0 }}
                transition={{ delay: 2.3, duration: 1 }}
              >
                <GlassCard className="p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40">Growth Velocity</p>
                      <p className="text-lg font-bold text-amber-400">12.4x</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-white/30">Faster than manual engagement</p>
                </GlassCard>
              </motion.div>
            </div>

            {/* Central Dashboard - Animated Motion Graphic */}
            <div className="relative">
              <AnimatedDashboard />

              {/* Floating Elements */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 3, duration: 0.5 }}
                className="absolute -bottom-6 -left-6 px-4 py-3 rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 backdrop-blur-xl z-20"
              >
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-medium text-green-300">AI is actively engaging</span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 3.2, duration: 0.5 }}
                className="absolute -bottom-4 -right-4 px-4 py-3 rounded-2xl bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 backdrop-blur-xl z-20"
              >
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 text-blue-400" />
                  <span className="text-sm font-medium text-blue-300">24/7 Automation Active</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Social Proof Strip */}
      <section className="py-16 border-y border-white/[0.03]">
        <div className="max-w-[1400px] mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-col md:flex-row items-center justify-between gap-8"
          >
            <p className="text-white/30 text-sm font-medium uppercase tracking-widest">Trusted by growth-focused creators</p>
            <div className="flex items-center space-x-12">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <Star key={j} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                  ))}
                  <span className="ml-2 text-white/40 text-sm">5.0</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem / Philosophy Section */}
      <section id="how-it-works" className="py-32 relative">
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-20"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400 uppercase tracking-widest mb-6">
              <span>The Real Problem</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Why Creators <span className="text-red-400">Fail</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto">
              Most tools focus on posting, scheduling, and analytics. But creators don't fail because they lack tools.
            </p>
          </motion.div>
          
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div className="space-y-4">
              {[
                'They cannot engage consistently',
                'They miss comments and DMs',
                'They lose algorithm momentum',
                'They burn time on repetitive actions',
                'They do not know why content works'
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <GlassCard className="p-5 flex items-center space-x-4 !bg-red-500/[0.03] !border-red-500/10">
                    <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-white/60">{item}</span>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
            
            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <TiltCard>
                <GlassCard className="p-10 !bg-gradient-to-br !from-blue-500/[0.08] !to-purple-500/[0.08]">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/20 text-xs font-bold text-blue-400 uppercase tracking-widest mb-6">
                    <span>VeeFore's Philosophy</span>
                  </div>
                  <h3 className="text-3xl font-bold mb-6">Growth-First Approach</h3>
                  
                  <div className="space-y-6">
                    {[
                      { title: 'Engagement before volume', sub: 'Interact first, post second' },
                      { title: 'Interaction before impressions', sub: 'Turn eyeballs into conversations' },
                      { title: 'Momentum before aesthetics', sub: 'Keep the wheel turning automatically' }
                    ].map((item, i) => (
                      <div key={i} className="flex items-start space-x-4 group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center shrink-0 group-hover:from-blue-500/30 group-hover:to-purple-500/30 transition-all">
                          <TrendingUp className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white/90">{item.title}</h4>
                          <p className="text-sm text-white/40">{item.sub}</p>
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

      {/* Hero Features - Layer 1 */}
      <section id="features" className="py-32 relative">
        <GradientOrb className="w-[600px] h-[600px] top-0 left-1/2 -translate-x-1/2" color="blue" />
        
        <div className="max-w-[1200px] mx-auto px-6 relative">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 uppercase tracking-widest mb-6">
              <Layers className="w-4 h-4" />
              <span>Hero Growth Features</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              The USP <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Drivers</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto">
              These features are VeeFore's public identity. They're what users remember and talk about.
            </p>
          </motion.div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {heroFeatures.map((feature, i) => (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <TiltCard className="h-full">
                  <GlassCard 
                    className={`p-8 h-full cursor-pointer transition-all duration-500 ${
                      expandedFeature === feature.id ? '!border-blue-500/30 !bg-blue-500/[0.05]' : ''
                    }`}
                    onClick={() => setExpandedFeature(expandedFeature === feature.id ? null : feature.id)}
                  >
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 shadow-lg`}>
                      <feature.icon className="w-7 h-7 text-white" />
                    </div>
                    
                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-white/50 text-sm mb-4">{feature.tagline}</p>
                    
                    <AnimatePresence>
                      {expandedFeature === feature.id && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 border-t border-white/10">
                            <p className="text-white/40 text-sm mb-4">{feature.description}</p>
                            <ul className="space-y-2">
                              {feature.details.map((detail, j) => (
                                <li key={j} className="flex items-center space-x-2 text-sm">
                                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                                  <span className="text-white/60">{detail}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    <button className="flex items-center space-x-1 text-blue-400 text-sm font-medium mt-4 group">
                      <span>{expandedFeature === feature.id ? 'Show Less' : 'Learn More'}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${expandedFeature === feature.id ? 'rotate-180' : ''}`} />
                    </button>
                  </GlassCard>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Support Features - Layer 2 */}
      <section className="py-24 relative">
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">
              <span>Core Support Systems</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Features that <span className="text-indigo-400">Enable</span> Growth</h2>
          </motion.div>
          
          <div className="grid md:grid-cols-4 gap-4">
            {supportFeatures.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <GlassCard className="p-6 text-center h-full">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h4 className="font-bold mb-1">{feature.title}</h4>
                  <p className="text-xs text-white/40">{feature.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
          
          {/* Adaptive AI Loop */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8"
          >
            <GlassCard className="p-8 !bg-gradient-to-r !from-purple-500/[0.05] !to-indigo-500/[0.05]">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center space-x-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-xl shadow-purple-500/20">
                    <RefreshCw className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">Intelligence Engine</p>
                    <h4 className="text-2xl font-bold">Adaptive AI Growth Loop</h4>
                  </div>
                </div>
                <div className="flex items-center space-x-3 text-sm text-white/40 flex-wrap justify-center">
                  {['Post', 'Collect Data', 'AI Learns', 'Improve'].map((step, i) => (
                    <React.Fragment key={step}>
                      <span className={`px-3 py-1.5 rounded-full ${i === 3 ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5'}`}>{step}</span>
                      {i < 3 && <ChevronRight className="w-4 h-4 text-white/20" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* Credit System */}
      <section className="py-32 relative">
        <GradientOrb className="w-[500px] h-[500px] bottom-0 right-0" color="cyan" />
        
        <div className="max-w-[1200px] mx-auto px-6 relative">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-400 uppercase tracking-widest mb-6">
              <Gauge className="w-4 h-4" />
              <span>Credit System</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Simple. <span className="text-amber-400">Fair.</span> Predictable.
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto">
              1 Credit = 1 AI Action. No hidden costs, no complexity.
            </p>
          </motion.div>
          
          {/* Credit Actions */}
          <div className="grid grid-cols-5 gap-4 mb-12">
            {creditActions.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <GlassCard className="p-6 text-center !bg-amber-500/[0.02]">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                    <item.icon className="w-6 h-6 text-amber-400" />
                  </div>
                  <p className="text-xs text-white/50 mb-2">{item.action}</p>
                  <p className="text-2xl font-bold text-amber-400">1</p>
                  <p className="text-xs text-white/30">credit</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
          
          {/* Credit Slider */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <GlassCard className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold">Monthly Credit Usage</h4>
                <div className="text-3xl font-bold text-amber-400">{activeCredit.toLocaleString()}</div>
              </div>
              <input 
                type="range" 
                min="100" 
                max="3000" 
                value={activeCredit}
                onChange={(e) => setActiveCredit(Number(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-amber-500/30"
              />
              <div className="flex justify-between mt-4 text-sm text-white/30">
                <span>Starter (300)</span>
                <span>Growth (1,200)</span>
                <span>Pro (3,000)</span>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-32 relative">
        <GradientOrb className="w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="blue" />
        
        <div className="max-w-[1200px] mx-auto px-6 relative">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
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
          </motion.div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {pricingPlans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className={plan.popular ? 'md:-mt-4 md:mb-4' : ''}
              >
                <TiltCard className="h-full">
                  <GlassCard className={`p-8 h-full flex flex-col !bg-gradient-to-br ${plan.gradient} ${plan.border} relative`}>
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-blue-500 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-500/30">
                        Most Popular
                      </div>
                    )}
                    
                    <div className="mb-6">
                      <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                      <p className="text-sm text-white/40">{plan.description}</p>
                    </div>
                    
                    <div className="mb-6">
                      <div className="flex items-baseline">
                        <span className="text-5xl font-bold">₹{plan.price.toLocaleString()}</span>
                        <span className="text-white/40 ml-2">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                      </div>
                      <p className="text-sm text-white/30 mt-1">{plan.credits.toLocaleString()} credits/month</p>
                    </div>
                    
                    <div className="space-y-3 mb-8 flex-1">
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
                      className={`w-full rounded-full py-4 font-bold transition-all ${
                        plan.popular 
                          ? 'bg-white text-black hover:bg-white/90' 
                          : 'bg-white/5 border border-white/10 hover:bg-white/10'
                      }`}
                      onClick={() => onNavigate('signup')}
                    >
                      Get Started
                    </MagneticButton>
                  </GlassCard>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Free Trial */}
      <section className="py-32 relative">
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-bold text-green-400 uppercase tracking-widest mb-6">
              <Unlock className="w-4 h-4" />
              <span>7-Day Free Trial</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Experience real <span className="text-green-400">automation</span>
            </h2>
            <p className="text-lg text-white/40 max-w-xl mx-auto">
              150 credits • 1 social account • No credit card required
            </p>
          </motion.div>
          
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-500/30 to-transparent hidden md:block" />
            
            <div className="grid md:grid-cols-5 gap-4">
              {trialDays.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <GlassCard className="p-6 text-center relative">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4 text-green-400 font-bold text-sm">
                      {item.day}
                    </div>
                    <h4 className="font-bold mb-1 text-sm">{item.title}</h4>
                    <p className="text-xs text-white/40">{item.desc}</p>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <MagneticButton 
              className="bg-green-600 hover:bg-green-500 text-white rounded-full px-12 py-5 text-lg font-bold shadow-xl shadow-green-600/20"
              onClick={() => onNavigate('signup')}
            >
              Start Your Free Trial
              <ArrowRight className="inline-block ml-2 w-5 h-5" />
            </MagneticButton>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-32 relative">
        <div className="max-w-[800px] mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold">Frequently Asked</h2>
          </motion.div>
          
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 relative overflow-hidden">
        <GradientOrb className="w-[800px] h-[800px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="blue" />
        
        <div className="max-w-[900px] mx-auto px-6 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8">
              Ready to grow <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">actively?</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto mb-12">
              Join serious creators who value time, want scale without spam, and understand that engagement velocity is the key to growth.
            </p>
            
            <MagneticButton 
              className="group relative bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full px-14 py-6 text-xl font-bold overflow-hidden"
              onClick={() => onNavigate('signup')}
            >
              <span className="relative z-10 flex items-center">
                Start Your 7-Day Free Trial
                <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-[-2px] bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 rounded-full blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
            </MagneticButton>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/[0.05]">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid md:grid-cols-5 gap-12 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-2.5 mb-6">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">VeeFore</span>
              </div>
              <p className="text-white/30 text-sm leading-relaxed max-w-xs">
                AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically.
              </p>
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
          
          <div className="pt-8 border-t border-white/[0.05] text-center text-white/20 text-sm">
            © 2025 VeeFore. Built for serious creators.
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing