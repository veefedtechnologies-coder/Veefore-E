import React, { useRef } from 'react'
import { useLocation } from 'wouter'
import { SEO, seoConfig } from '../../lib/seo-optimization'
import { useIsMobile } from '../../hooks/use-is-mobile'

// Shared building blocks
import { GradientOrb } from './components/GradientOrb'

// Standalone marketing sections (live under client/src/components)
import CinematicHeroSection from '../../components/CinematicHeroSection'
import StickyScrollFeaturesV2 from '../../components/StickyScrollFeaturesV2'
import GrowthEngineSection from '../../components/GrowthEngineSection'
import { AlgorithmScienceSection } from '../../components/AlgorithmScienceSection'
import TargetAudienceSection from '../../components/TargetAudienceSection'
import CreditSystemSection from '../../components/CreditSystemSection'
import BetaLaunchSection from '../../components/BetaLaunchSection'

// Landing-feature sections
import { LiveDashboardSection } from './sections/LiveDashboardSection'
import { TestimonialSection } from './sections/TestimonialSection'
import { FeaturesGrid } from './sections/FeaturesGrid'
import { ProblemSection } from './sections/ProblemSection'
import { HeroFeaturesSection } from './sections/HeroFeaturesSection'
import { EvolutionSection } from './sections/EvolutionSection'
import PricingSection from './sections/PricingSection'
import { FaqSection } from './sections/FaqSection'
import CTASection from './sections/CTASection'

import { isPhase1 } from './constants/phase'

interface LandingProps {
  /** Navigation handler. Optional — falls back to wouter's setLocation. */
  onNavigate?: (page: string) => void
}

/**
 * Landing - Thin orchestrator for the public marketing homepage.
 *
 * This component intentionally contains no large inline markup. Every visual
 * block is an independently testable section/component composed here in order.
 * Ambient background + SEO are the only page-level concerns kept inline.
 */
export const Landing: React.FC<LandingProps> = ({ onNavigate }) => {
  const isMobile = useIsMobile()
  const [, setLocation] = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)

  // Allow rendering without an explicit onNavigate (e.g. direct route mounts)
  const handleNavigate = onNavigate ?? ((page: string) => setLocation(`/${page}`))

  return (
    <div ref={containerRef} className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
      <SEO {...seoConfig.landing} />
      <img src="/veefore.svg" alt="" className="hidden" aria-hidden="true" />

      {/* Ambient background - absolute on mobile to avoid iOS fixed stacking issues */}
      <div className={`${isMobile ? 'absolute h-[500vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
        <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
        <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
        <GradientOrb className={`${isMobile ? 'w-[250px] h-[250px]' : 'w-[500px] h-[500px]'} bottom-[10%] left-[20%]`} color="indigo" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
      </div>

      {/* MainNavigation + MainFooter are rendered by App.tsx */}

      <CinematicHeroSection />
      <LiveDashboardSection />
      <TestimonialSection isPhase1={isPhase1} />
      <FeaturesGrid />
      <GrowthEngineSection />
      <AlgorithmScienceSection />
      <StickyScrollFeaturesV2 />
      <ProblemSection />
      <TargetAudienceSection />
      <HeroFeaturesSection />
      <CreditSystemSection />
      <EvolutionSection onNavigate={handleNavigate} />
      <PricingSection onNavigate={handleNavigate} />
      <BetaLaunchSection />
      <FaqSection />
      <CTASection onNavigate={handleNavigate} />
    </div>
  )
}

export default Landing
