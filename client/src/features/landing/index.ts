/**
 * Landing Feature Module
 *
 * Exports the Landing page orchestrator plus all of its composable sections,
 * components, hooks, and data constants.
 *
 * Requirements: 21.1
 */

// Page orchestrator
export { Landing, default as LandingDefault } from './Landing'

// Sections
export { HeroSection, default as HeroSectionDefault } from './sections/HeroSection'
export { LiveDashboardSection } from './sections/LiveDashboardSection'
export { TestimonialSection } from './sections/TestimonialSection'
export { FeaturesGrid } from './sections/FeaturesGrid'
export { ProblemSection } from './sections/ProblemSection'
export { HeroFeaturesSection } from './sections/HeroFeaturesSection'
export { EvolutionSection } from './sections/EvolutionSection'
export { default as PricingSection } from './sections/PricingSection'
export { FaqSection } from './sections/FaqSection'
export { default as CTASection } from './sections/CTASection'

// Components
export { RotatingText } from './components/RotatingText'
export { VideoBackground } from './components/VideoBackground'
export { TiltCard } from './components/TiltCard'
export { GradientOrb } from './components/GradientOrb'
export { AnimatedDashboard } from './components/dashboard/AnimatedDashboard'
export { StaticDashboardPreview } from './components/dashboard/StaticDashboardPreview'

// Hooks
export { useScrollAnimation } from './hooks/useScrollAnimation'
export type { ScrollAnimationValues } from './hooks/useScrollAnimation'

// Constants / data
export { isPhase1 } from './constants/phase'
export { heroFeatures } from './constants/heroFeatures'
export type { HeroFeature } from './constants/heroFeatures'
export { faqs } from './constants/faqs'
export type { Faq } from './constants/faqs'
