import React from 'react'
import { X, MessageSquare, Users, Zap } from 'lucide-react'
import GlassCard from '../../../components/GlassCard'
import { isPhase1 } from '../constants/phase'
import { TiltCard } from '../components/TiltCard'

const failures = isPhase1 ? [
  { title: 'Content Burnout', desc: 'Spending too much time creating content manually' },
  { title: 'Missed Peak Times', desc: 'Missing the best time to post for maximum reach' },
  { title: 'Algorithm Momentum Loss', desc: 'Slow responses kill viral potential instantly' },
  { title: 'Time Burnout', desc: 'Hours wasted on repetitive, low-value typing' },
  { title: 'Blind Creation', desc: 'Posting without knowing what actually hooks' }
] : [
  { title: 'Inconsistent Engagement', desc: 'Cannot keep up with comments & DMs manually' },
  { title: 'Missed Opportunities', desc: 'Leads slip through cracks in untracked DMs' },
  { title: 'Algorithm Momentum Loss', desc: 'Slow responses kill viral potential instantly' },
  { title: 'Time Burnout', desc: 'hours wasted on repetitive, low-value typing' },
  { title: 'Blind Creation', desc: 'Posting without knowing what actually hooks' }
]

const philosophy = [
  { title: 'Engagement before volume', sub: 'Interact first, post second. The algorithm rewards community.', icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { title: 'Interaction before impressions', sub: 'Turn eyeballs into conversations. Conversations convert.', icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { title: 'Momentum before aesthetics', sub: 'Keep the wheel turning automatically. Consistency wins.', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/20' }
]

/**
 * ProblemSection - "Why Creators Fail" problem framing paired with VeeFore's
 * growth-first philosophy.
 */
export const ProblemSection: React.FC = () => (
  <section id="how-it-works" className="py-10 md:py-16 relative overflow-hidden w-full">
    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-red-500/5 rounded-full blur-[60px] md:blur-[100px] pointer-events-none" />
    <div className="absolute right-0 bottom-0 w-[250px] md:w-[400px] h-[250px] md:h-[400px] bg-blue-500/5 rounded-full blur-[60px] md:blur-[100px] pointer-events-none" />

    <div className="w-full px-4 md:px-12 lg:px-20 relative z-10">
      <div className="text-center mb-12 md:mb-20">
        <div className="inline-flex items-center space-x-2 px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] md:text-xs font-bold text-red-400 uppercase tracking-widest mb-4 md:mb-6">
          <span className="flex h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-red-500 animate-pulse mr-1.5 md:mr-2" />
          <span>The Real Problem</span>
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight mb-4 md:mb-6">
          Why Creators <span className="text-red-500 drop-shadow-sm">Fail</span>
        </h2>
        <p className="text-sm sm:text-lg md:text-xl text-white/40 max-w-2xl mx-auto leading-relaxed">
          Most tools focus on posting, scheduling, and analytics. <br className="hidden md:block" />
          But creators don't fail because they lack tools.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-stretch">
        {/* Left: The Failures */}
        <div className="space-y-3 md:space-y-4 flex flex-col justify-center">
          {failures.map((item, i) => (
            <div key={i}>
              <GlassCard className="p-3 md:p-5 flex items-center space-x-3 md:space-x-5 !bg-red-500/[0.02] !border-red-500/10 group hover:!bg-red-500/[0.06] hover:!border-red-500/30 transition-all duration-300">
                <div className="h-9 w-9 md:h-12 md:w-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20 group-hover:bg-red-500/20 group-hover:scale-110 transition-all duration-300">
                  <X className="w-4 h-4 md:w-6 md:h-6 text-red-500" />
                </div>
                <div>
                  <h4 className="text-sm md:text-lg font-bold text-white/90 group-hover:text-red-100 transition-colors mb-0.5 md:mb-0">{item.title}</h4>
                  <p className="text-xs md:text-sm text-white/40 group-hover:text-white/60 transition-colors leading-snug">{item.desc}</p>
                </div>
              </GlassCard>
            </div>
          ))}
        </div>

        {/* Right: The Solution Philosophy */}
        <div className="h-full mt-6 lg:mt-0">
          <TiltCard className="h-full">
            <GlassCard className="p-5 md:p-12 h-full flex flex-col justify-center !bg-gradient-to-br !from-blue-500/[0.05] !via-purple-500/[0.05] !to-transparent border-t border-white/10">
              <div className="inline-flex self-start items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/20 text-[10px] md:text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 md:mb-8">
                <span>VeeFore's Philosophy</span>
              </div>
              <h3 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8 leading-tight">
                Growth-First <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Approach</span>
              </h3>

              <div className="space-y-5 md:space-y-8">
                {philosophy.map((item, i) => (
                  <div key={i} className="flex items-start space-x-3 md:space-x-5 group">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${item.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                      <item.icon className={`w-5 h-5 md:w-6 md:h-6 ${item.color}`} />
                    </div>
                    <div>
                      <h4 className="text-sm md:text-lg font-bold text-white/90 mb-0.5 md:mb-1 group-hover:text-white transition-colors">{item.title}</h4>
                      <p className="text-xs md:text-sm text-white/40 leading-relaxed group-hover:text-white/60 transition-colors">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </TiltCard>
        </div>
      </div>
    </div>
  </section>
)

export default ProblemSection
