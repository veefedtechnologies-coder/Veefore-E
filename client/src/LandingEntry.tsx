import { memo, useMemo, useEffect } from 'react'
import Landing from './pages/Landing'
import { useMobilePerformance, ANIMATION_PRESETS } from '@/lib/mobile-performance-optimizer'

interface LandingEntryProps {
  onNavigate: (page: string) => void
}

const LandingEntry = memo(({ onNavigate }: LandingEntryProps) => {
  const { 
    qualityTier, 
    shouldReduceMotion, 
    animationSettings,
    deviceCapabilities 
  } = useMobilePerformance()

  const animationPreset = useMemo(() => {
    if (shouldReduceMotion) {
      return ANIMATION_PRESETS.reducedMotion
    }
    return ANIMATION_PRESETS[qualityTier as keyof typeof ANIMATION_PRESETS] || ANIMATION_PRESETS.high
  }, [qualityTier, shouldReduceMotion])

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const root = document.documentElement
    if (!root) return
    
    root.style.setProperty(
      '--animation-duration', 
      shouldReduceMotion ? '0s' : `${animationSettings.duration}s`
    )
    root.style.setProperty(
      '--animation-stagger', 
      `${animationPreset.stagger?.staggerChildren ?? 0}s`
    )
    root.style.setProperty(
      '--animation-delay',
      `${animationPreset.stagger?.delayChildren ?? 0}s`
    )
    root.classList.toggle('reduce-motion', shouldReduceMotion)
    root.classList.toggle('low-end-device', deviceCapabilities.isLowEndDevice)
    root.setAttribute('data-quality-tier', qualityTier)
  }, [shouldReduceMotion, animationSettings.duration, deviceCapabilities.isLowEndDevice, qualityTier, animationPreset])

  return <Landing onNavigate={onNavigate} />
})

LandingEntry.displayName = 'LandingEntry'

export default LandingEntry
