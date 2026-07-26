import { useEffect, useRef } from 'react'
import { LazyMotion, domAnimation } from 'framer-motion'

import './newLanding.css'

import { LandingMotionProvider, useLandingMotion } from './context/LandingMotionProvider'
import { useLenis } from './hooks/useLenis'
import { usePageLoadSequence } from './hooks/usePageLoadSequence'
import { CustomCursor } from './primitives/CustomCursor'
import { ScrollPath } from './primitives/ScrollPath'

import { NavSection } from './sections/NavSection'
import { HeroSection } from './sections/HeroSection'
import { FeatureShowcaseSection } from './sections/FeatureShowcaseSection'
import { TickerSection } from './sections/TickerSection'
import { ProblemSection } from './sections/ProblemSection'
import { HowItWorksSection } from './sections/HowItWorksSection'
import { LiveDemoSection } from './sections/LiveDemoSection'
import OldPricingSection from './sections/OldPricingSection'
import { TestimonialsSection } from './sections/TestimonialsSection'
import { FaqSection } from './sections/FaqSection'
import BetaLaunchSection from './sections/BetaLaunchSection'
import { FinalCtaSection } from './sections/FinalCtaSection'
import { FooterSection } from './sections/FooterSection'

/** Props shared by the orchestrator and its inner consumer. */
export interface NewLandingPageProps {
  /**
   * Navigation callback handed to the sections that drive routing (Nav, Hero,
   * Pricing, Final CTA, Footer). Receives the destination page key/path.
   */
  onNavigate?: (page: string) => void
}

/**
 * The Google Fonts the page renders with (Requirement 4.4). The scoped
 * stylesheet already `@import`s them; these resource hints let the browser
 * open connections and fetch the stylesheet earlier, reducing render-blocking
 * latency (Requirements 22.3, 22.4).
 */
const FONT_PRECONNECT_ORIGINS = [
  { href: 'https://fonts.googleapis.com', crossOrigin: false },
  // gstatic serves the font binaries cross-origin.
  { href: 'https://fonts.gstatic.com', crossOrigin: true },
] as const

const FONT_STYLESHEET_HREF =
  'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'

/**
 * Injects `<link rel="preconnect">` + `<link rel="preload" as="style">` resource
 * hints for the landing page fonts into `<head>` on mount and removes them on
 * unmount, so the hints exist only while the new landing page is mounted.
 *
 * Requirements: 22.3, 22.4
 */
function useFontResourceHints(): void {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const links: HTMLLinkElement[] = []

    // Preconnect to the Google Fonts CSS + static font origins.
    for (const origin of FONT_PRECONNECT_ORIGINS) {
      const link = document.createElement('link')
      link.rel = 'preconnect'
      link.href = origin.href
      if (origin.crossOrigin) {
        link.crossOrigin = 'anonymous'
      }
      document.head.appendChild(link)
      links.push(link)
    }

    // Preload the font stylesheet so the @import resolves sooner.
    const preload = document.createElement('link')
    preload.rel = 'preload'
    preload.as = 'style'
    preload.href = FONT_STYLESHEET_HREF
    document.head.appendChild(preload)
    links.push(preload)

    return () => {
      for (const link of links) {
        link.remove()
      }
    }
  }, [])
}

/**
 * The motion-aware inner page. It lives *inside* {@link LandingMotionProvider}
 * so it can read {@link useLandingMotion}; it owns the page-level container ref
 * and wires up the cross-cutting effects (smooth scroll, page-load timeline,
 * font hints) before composing the global overlays and the ordered section
 * stack.
 *
 * No large inline section markup lives here — it is pure composition
 * (Requirement 3.2).
 */
const LandingPageInner: React.FC<NewLandingPageProps> = ({ onNavigate }) => {
  const { reducedMotion } = useLandingMotion()

  // The page root the scroll-path SVG is injected into and measured against.
  // `position: relative` lets the absolutely-positioned overlay span it.
  const containerRef = useRef<HTMLDivElement>(null)

  // Smooth scrolling (Req 18.3) — native scroll under reduced motion.
  useLenis({ reducedMotion })

  // Page-load entrance timeline (Req 19.1) — no-ops under reduced motion.
  usePageLoadSequence({ reducedMotion })

  // Font resource hints (Req 22.3 / 22.4).
  useFontResourceHints()

  // Prevent horizontal overflow on narrow screens. Using clip (not hidden)
  // so it doesn't create a scroll container and doesn't affect position:fixed
  // elements like the agentation toolbar. Only applied to <body>, not <html>.
  useEffect(() => {
    const body = document.body
    const prev = body.style.overflowX
    body.style.overflowX = 'clip'
    return () => {
      body.style.overflowX = prev
    }
  }, [])

  return (
    <LazyMotion features={domAnimation}>
    <div ref={containerRef} className="veef-landing" style={{ position: 'relative' }}>
      {/* Single fixed page canvas (z-0) + fine grain (z-1). All sections are
          transparent so this — and the scroll path (z-2) — show through. */}
      <div className="veef-bg-layer" aria-hidden="true" />
      <div className="veef-grid" aria-hidden="true" />
      <div className="veef-grain" aria-hidden="true" />

      {/* Global overlays — injected/positioned absolutely, never intercept clicks. */}
      <CustomCursor />
      <ScrollPath containerRef={containerRef} />

      {/* Content sits above the canvas + path. */}
      <div style={{ position: 'relative', zIndex: 3 }}>
        {/* Ordered section stack (Requirement 3.1). */}
        <NavSection onNavigate={onNavigate} />
        <HeroSection onNavigate={onNavigate} />
        <TickerSection />
        <FeatureShowcaseSection />
        <ProblemSection />
        <HowItWorksSection />
        <LiveDemoSection />
        <OldPricingSection onNavigate={onNavigate ?? (() => {})} />
        <TestimonialsSection />
        <BetaLaunchSection />
        <FaqSection />
        <FinalCtaSection onNavigate={onNavigate} />
        <FooterSection onNavigate={onNavigate} />
      </div>
    </div>
    </LazyMotion>
  )
}

LandingPageInner.displayName = 'LandingPageInner'

/**
 * NewLandingPage — orchestrator root for the new Veefore marketing landing page
 * served at `/landing`.
 *
 * Wraps the page in {@link LandingMotionProvider} so every descendant shares one
 * source of truth for motion gating, then renders {@link LandingPageInner} which
 * consumes that context. The single `.veef-landing` root class on the inner
 * container scopes all styles (Requirement 4.5). Imagery is negligible on this
 * page; any `<img>` added later should use `loading="lazy"` (Requirement 22.4).
 *
 * Requirements: 3.1, 3.2, 4.5, 18.3, 19.1, 22.3, 22.4
 */
export const NewLandingPage: React.FC<NewLandingPageProps> = ({ onNavigate }) => (
  <LandingMotionProvider>
    <LandingPageInner onNavigate={onNavigate} />
  </LandingMotionProvider>
)

NewLandingPage.displayName = 'NewLandingPage'

export default NewLandingPage
