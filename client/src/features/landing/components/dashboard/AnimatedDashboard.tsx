import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { isPhase1 } from '../../constants/phase'
import { StaticDashboardPreview } from './StaticDashboardPreview'
import { DashboardPageContent, EngagementPageContent, HooksPageContent } from './DashboardPages'

const BASE_WIDTH = 1000
const BASE_HEIGHT = 600

/**
 * AnimatedDashboard - The cinematic "Live Dashboard" preview with an auto-piloted
 * cursor that cycles through Dashboard / Engagement / Hooks pages. Scales to fit
 * its container. Falls back to StaticDashboardPreview on mobile for performance.
 */
export const AnimatedDashboard = memo(() => {
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
    if (isMobile) return

    let isMounted = true
    const timeouts: ReturnType<typeof setTimeout>[] = []

    const addTimeout = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay)
      timeouts.push(id)
      return id
    }

    const runSequence = () => {
      if (!isMounted) return

      addTimeout(() => { if (!isMounted) return; setCursorPos(getCursorPosition(0)); setActivePage(0) }, 100)
      addTimeout(() => { if (!isMounted) return; setCursorPos(getCursorPosition(1)) }, 1500)
      addTimeout(() => { if (!isMounted) return; setIsClicking(true) }, 1800)
      addTimeout(() => { if (!isMounted) return; setIsClicking(false); setActivePage(1) }, 1900)
      addTimeout(() => { if (!isMounted) return; setCursorPos(getCursorPosition(3)) }, 3900)
      addTimeout(() => { if (!isMounted) return; setIsClicking(true) }, 4200)
      addTimeout(() => { if (!isMounted) return; setIsClicking(false); setActivePage(2) }, 4300)
      addTimeout(() => { if (!isMounted) return; setCursorPos(getCursorPosition(0)) }, 6300)
      addTimeout(() => { if (!isMounted) return; setIsClicking(true) }, 6600)
      addTimeout(() => { if (!isMounted) return; setIsClicking(false); setActivePage(0) }, 6700)
      addTimeout(() => { if (!isMounted) return; runSequence() }, 8200)
    }

    addTimeout(() => runSequence(), 50)

    return () => {
      isMounted = false
      timeouts.forEach(clearTimeout)
    }
  }, [getCursorPosition, isMobile])

  useEffect(() => {
    if (isMobile) return

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
  }, [isMobile])

  if (isMobile) {
    return <StaticDashboardPreview />
  }

  return (
    <div ref={wrapperRef} className="relative mx-auto max-w-[1000px] w-full">
      <div style={{ height: BASE_HEIGHT * scale, overflow: 'hidden' }}>
        <div
          className="relative rounded-[20px] border border-white/10 bg-[#0a0a0a] shadow-[0_0_100px_rgba(59,130,246,0.15)] overflow-hidden"
          style={{ width: BASE_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
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
                  animate={{ left: cursorPos.x - 10, top: cursorPos.y - 10, scale: isClicking ? 0.85 : 1 }}
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
                      className={`px-3 py-2 rounded-lg text-xs transition-colors ${isActive ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-white/40'}`}
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
AnimatedDashboard.displayName = 'AnimatedDashboard'
