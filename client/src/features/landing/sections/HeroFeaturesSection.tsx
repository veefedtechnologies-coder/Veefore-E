import React from 'react'
import { Layers } from 'lucide-react'
import { CinematicFeatures } from '../../../components/CinematicFeatures'
import { heroFeatures } from '../constants/heroFeatures'

/**
 * HeroFeaturesSection - "Game-Changing Features" intro header wrapping the
 * cinematic scroll-driven feature showcase.
 */
export const HeroFeaturesSection: React.FC = () => (
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
)

export default HeroFeaturesSection
