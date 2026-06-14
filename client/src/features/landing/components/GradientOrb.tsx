import React from 'react'
import { MOBILE_OPTIMIZED_LAYER } from '../../../lib/animation-performance'

type OrbColor = 'blue' | 'purple' | 'indigo' | 'cyan'

interface GradientOrbProps {
  className?: string
  color?: OrbColor | string
}

const colors: Record<OrbColor, string> = {
  blue: 'from-blue-500/30 via-blue-600/20 to-transparent',
  purple: 'from-purple-500/30 via-purple-600/20 to-transparent',
  indigo: 'from-indigo-500/30 via-indigo-600/20 to-transparent',
  cyan: 'from-cyan-500/20 via-cyan-600/10 to-transparent',
}

/**
 * GradientOrb - GPU-accelerated blurred radial gradient used for ambient
 * background lighting across landing sections.
 */
export const GradientOrb: React.FC<GradientOrbProps> = ({ className, color = 'blue' }) => (
  <div
    className={`gradient-orb bg-gradient-radial ${colors[color as OrbColor]} blur-3xl ${className ?? ''}`}
    style={MOBILE_OPTIMIZED_LAYER}
  />
)

export default GradientOrb
