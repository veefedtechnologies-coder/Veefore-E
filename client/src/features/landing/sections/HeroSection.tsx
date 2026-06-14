import React from 'react'
import { useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { useWaitlist } from '../../../context/WaitlistContext'
import { useEarlyAccessCheck } from '../../../hooks/useEarlyAccessCheck'
import { useScrollAnimation } from '../hooks/useScrollAnimation'
import { RotatingText } from '../components/RotatingText'
import { VideoBackground } from '../components/VideoBackground'

/**
 * HeroSection Component
 * 
 * Main hero section for the landing page featuring:
 * - Cinematic video background with lazy loading
 * - Rotating tagline text with smooth transitions
 * - Scroll-based parallax effects (opacity, scale, blur)
 * - CTA button with early access check
 * - Mobile-optimized animations
 * 
 * The hero section is designed to be fullscreen and sticky, with parallax
 * effects that fade it out as the user scrolls down to reveal content below.
 * 
 * Requirements: 21.1, 21.3, 21.5
 * 
 * @component
 */
export const HeroSection: React.FC = () => {
  const [, setLocation] = useLocation()
  const { openWaitlist } = useWaitlist()
  const { hasEarlyAccess } = useEarlyAccessCheck()
  const { opacity, scale, filter, overlayOpacity } = useScrollAnimation()

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
        {/* Video Background with lazy loading */}
        <VideoBackground 
          videoUrl="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4"
        />

        {/* Mobile Fallback Dark Overlay (performance optimization) */}
        <motion.div
          style={{ opacity: overlayOpacity }}
          className="absolute inset-0 z-[2] bg-black pointer-events-none"
        />

        {/* Hero Content */}
        <div
          className="relative z-10 flex flex-col items-center justify-center text-center flex-1 px-4 sm:px-6 w-full pt-[80px] pb-[160px] md:pb-[240px]"
        >
          {/* Rotating Headline */}
          <div className="w-full">
            <RotatingText />
          </div>

          {/* Subheading */}
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

export default HeroSection
