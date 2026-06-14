import React from 'react'
import { X, Zap, Lock, DollarSign, Search, Brain, BarChart3, LucideIcon } from 'lucide-react'
import { isPhase1 } from '../constants/phase'
import { GradientOrb } from '../components/GradientOrb'

interface EvolutionCard {
  oldTitle: string
  oldDesc: string
  oldIcon: LucideIcon
  newTitle: string
  newDesc: string
  newIcon: LucideIcon
  gradient: string
  metric: string
}

const cards: EvolutionCard[] = [
  {
    oldTitle: 'Manual Grinding',
    oldDesc: 'Hours of typing replies one by one. Slow, exhausting, and unscalable.',
    oldIcon: X,
    newTitle: 'Velocity Engine',
    newDesc: 'AI replies instantly with context. Boosts algorithm scores while you sleep.',
    newIcon: Zap,
    gradient: 'from-blue-600 to-cyan-500',
    metric: '< 2s Response'
  },
  {
    oldTitle: 'Leaking Bucket',
    oldDesc: 'Missed leads and forgotten follow-ups. Money left on the table daily.',
    oldIcon: Lock,
    newTitle: isPhase1 ? 'Smart Publisher' : 'Conversion Machine',
    newDesc: isPhase1 ? 'Post at the perfect time with AI scheduling that maximizes your content reach and impressions.' : '24/7 Sales Funnel that qualifies leads and sends payment links automatically.',
    newIcon: DollarSign,
    gradient: 'from-emerald-600 to-green-500',
    metric: '+24% Sales'
  },
  {
    oldTitle: 'Guesswork',
    oldDesc: 'Posting blindly and hoping for luck without understanding viral drivers.',
    oldIcon: Search,
    newTitle: 'Viral Intelligence',
    newDesc: 'Analyze top performers to extract exact hooks and patterns that guarantee reach.',
    newIcon: Brain,
    gradient: 'from-purple-600 to-pink-500',
    metric: '94% Accuracy'
  }
]

interface EvolutionSectionProps {
  onNavigate: (page: string) => void
}

/**
 * EvolutionSection - "The Evolution" comparison of traditional tools vs VeeFore,
 * rendered as side-by-side old-way / new-way cards.
 */
export const EvolutionSection: React.FC<EvolutionSectionProps> = ({ onNavigate }) => (
  <section className="py-24 relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-900/5 to-transparent pointer-events-none" />
    <GradientOrb className="w-[500px] h-[500px] top-1/2 right-0 translate-x-1/2 -translate-y-1/2 opacity-30" color="indigo" />

    <div className="max-w-[1100px] mx-auto px-6 relative z-10">
      <div className="text-center mb-16">
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6">
          <BarChart3 className="w-4 h-4" />
          <span>The Evolution</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
          Stop <span className="text-white/40 decoration-red-500/50 line-through">Managing</span>. Start <span className="text-indigo-400">Scaling</span>.
        </h2>
        <p className="text-lg text-white/40 max-w-2xl mx-auto">
          Traditional tools were built for 2015. VeeFore is built for the AI era.
        </p>
      </div>

      <div className="space-y-4">
        {cards.map((card, i) => (
          <div key={i}>
            <div className="group relative overflow-hidden rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-500">
              <div className={`absolute inset-0 bg-gradient-to-r ${card.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 pointer-events-none`} />

              <div className="flex flex-col md:flex-row items-stretch">
                {/* Old Way */}
                <div className="p-6 md:p-8 md:w-[40%] flex flex-col justify-center border-b md:border-b-0 md:border-r border-white/5 bg-white/[0.01]">
                  <div className="flex items-center space-x-3 mb-3 opacity-40 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-60">
                    <card.oldIcon size={18} />
                    <h3 className="text-xs font-bold uppercase tracking-widest">{card.oldTitle}</h3>
                  </div>
                  <p className="text-sm text-white/30 leading-relaxed">{card.oldDesc}</p>
                </div>

                {/* New Way */}
                <div className="p-6 md:p-8 md:w-[60%] flex flex-col justify-center relative">
                  <div className="absolute top-3 right-4 md:top-4 md:right-6 text-[9px] font-mono uppercase tracking-widest text-white/20">VeeFore</div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-4 sm:gap-0">
                    <div className="flex items-center space-x-4">
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-lg shadow-black/50`}>
                        <card.newIcon size={20} />
                      </div>
                      <h3 className="text-xl font-bold text-white tracking-tight">{card.newTitle}</h3>
                    </div>
                    <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 w-fit">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${card.gradient}`} />
                      <span className="text-xs font-mono font-medium text-white/70">{card.metric}</span>
                    </div>
                  </div>
                  <p className="text-sm md:text-base text-white/50 pl-0 md:pl-[58px] leading-relaxed group-hover:text-white/70 transition-colors duration-300">
                    {card.newDesc}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 text-center">
        <button className="btn-brick btn-brick-white px-8 py-3 text-sm" onClick={() => onNavigate('signup')}>
          Get Started Now
        </button>
      </div>
    </div>
  </section>
)

export default EvolutionSection
