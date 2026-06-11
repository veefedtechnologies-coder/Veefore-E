import React, { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { useWaitlist } from '../context/WaitlistContext'
import { useEarlyAccessCheck } from '../hooks/useEarlyAccessCheck'

const taglines = [
  { w1: "Posting is not", w2: "growth.", w3: "Engagement", w4: "is." },
  { w1: "Schedule", w2: "smarter.", w3: "Grow", w4: "faster." },
  { w1: "Publish with", w2: "precision.", w3: "Grow with", w4: "data." },
  { w1: "Smart", w2: "comments.", w3: "Smarter", w4: "DMs." }
]

const RotatingCinematicText = () => {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % taglines.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative flex justify-center items-center w-full overflow-visible pb-4 md:pb-8">
      <AnimatePresence mode="popLayout">
        <motion.h1
          key={index}
          initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -40, filter: 'blur(10px)' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="w-full px-4 font-normal leading-[1.1] md:leading-[0.95] tracking-[-1px] md:tracking-[-2px] text-white"
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 'clamp(2.5rem, 5.5vw, 5rem)',
            transformOrigin: 'center center',
          }}
        >
          {taglines[index].w1}{' '}
          <em className="not-italic" style={{ color: 'hsl(240 4% 66%)' }}>
            {taglines[index].w2}
          </em>{' '}
          {taglines[index].w3}{' '}
          <em className="not-italic" style={{ color: 'hsl(240 4% 66%)' }}>
            {taglines[index].w4}
          </em>
        </motion.h1>
      </AnimatePresence>
    </div>
  )
}

/**
 * CinematicHeroSection
 *
 * A standalone, fullscreen cinematic hero section with:
 * - Looping background video
 * - Instrument Serif display font (rotating text)
 * - Liquid glass CTA button
 * - Fade-rise animations
 * - Scroll parallax effect (moves backward on scroll)
 *
 * The existing MainNavigation (sticky) from App.tsx is preserved above this component.
 * This hero section starts from the top of the page (negative margin to go behind the nav),
 * using pt-[80px] (the nav height) so content is not hidden behind the nav.
 */
const CinematicHeroSection: React.FC = () => {
  const [, setLocation] = useLocation()
  const { openWaitlist } = useWaitlist()
  const { hasEarlyAccess } = useEarlyAccessCheck()
  const { scrollY } = useScroll()

  // Parallax / Shrink effect as user scrolls down
  const opacity = useTransform(scrollY, [0, 800], [1, 0])
  const scale = useTransform(scrollY, [0, 800], [1, 0.92])
  
  // Progressive blur filter (Desktop only)
  const blurValue = useTransform(scrollY, [0, 800], [0, 24])
  const filter = useTransform(blurValue, (v) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return 'blur(0px)'
    return `blur(${v}px)`
  })
  
  // Performant dark overlay fallback for mobile (gives focus to dashboard without GPU lag)
  const mobileDarkenOpacity = useTransform(scrollY, [0, 800], [0, 0.95])
  const overlayOpacity = useTransform(mobileDarkenOpacity, (v) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return v
    return 0
  })

  const handleCTA = () => {
    if (hasEarlyAccess) {
      setLocation('/signin')
    } else {
      openWaitlist()
    }
  }

  return (
    <section
      className="cinematic-hero-section sticky top-0 flex flex-col overflow-hidden w-full"
      style={{
        zIndex: 0,
        // Pull section up behind the sticky nav (nav is z-50, ~80px tall)
        marginTop: '-80px',
        background: '#030303', // Matches the main body background
        // Make the hero tall enough so the next section's -mt-20 doesn't pull it into view
        minHeight: 'calc(100vh + 80px)'
      }}
    >
      <motion.div
        style={{ 
          opacity, 
          scale, 
          filter,
          willChange: 'filter, transform, opacity',
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)'
        }}
        className="absolute inset-0 w-full h-full flex flex-col"
      >
        {/* ── Gradient Placeholder while video loads ── */}
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#0a1128] via-[#122143] to-[#5c3a18] z-0" />

        {/* ── Video Background ── */}
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
          aria-hidden="true"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4"
            type="video/mp4"
          />
        </video>

        {/* ── Subtle dark overlay so text stays legible ── */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          aria-hidden="true"
        />

        {/* ── Mobile Fallback Dark Overlay ── */}
        <motion.div
          style={{ opacity: overlayOpacity }}
          className="absolute inset-0 z-[2] bg-black pointer-events-none"
        />

        {/* ── Hero Content ── */}
        <div
          className="relative z-10 flex flex-col items-center justify-center text-center flex-1 px-4 sm:px-6 w-full pt-[80px] pb-[160px] md:pb-[240px]"
        >
          {/* H1 Rotating Component */}
          <div className="w-full">
            <RotatingCinematicText />
          </div>

          {/* Sub-text */}
          <p
            className="animate-fade-rise max-w-2xl mt-8 leading-relaxed text-sm sm:text-base"
            style={{ color: 'hsl(240 4% 66%)' }}
          >
            Automate engagement, discover winning hooks, and build smart DM funnels that actually convert. Supercharge your social media growth without the chaos.
          </p>

          {/* CTA Button */}
          <button
            onClick={handleCTA}
            className="animate-fade-rise btn-brick btn-brick-dark text-sm sm:text-base mt-10 sm:mt-12 cursor-pointer"
            style={{ padding: '1rem 3rem' }}
          >
            Begin Journey
          </button>
        </div>
      </motion.div>
    </section>
  )
}

export default CinematicHeroSection

