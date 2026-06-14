import React from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, MessageSquare, Brain, Zap, CheckCircle } from 'lucide-react'
import GlassCard from '../../../components/GlassCard'
import { isPhase1 } from '../constants/phase'
import { TiltCard } from '../components/TiltCard'
import { AnimatedDashboard } from '../components/dashboard/AnimatedDashboard'

/**
 * LiveDashboardSection - Showcases the product UI through an auto-piloted
 * "Live Dashboard" mockup, flanked by faded stat GlassCards (beautiful.ai style)
 * and floating status badges.
 */
export const LiveDashboardSection: React.FC = () => (
  <section className="relative pt-8 pb-20 md:pb-32 -mt-20 z-20 w-full overflow-visible">
    <div className="w-full px-4 md:px-8">
      <div style={{ perspective: 1200, transformStyle: 'preserve-3d' }} className="relative w-full">
        {/* Side Graphics - Left (faded) - hidden on mobile */}
        <div
          className="hidden md:block absolute left-4 lg:left-8 xl:left-12 top-1/2 -translate-y-1/2 w-[140px] lg:w-[180px] xl:w-[220px] space-y-3 lg:space-y-4 z-0 pointer-events-none"
          style={{ maskImage: 'linear-gradient(to right, transparent, black 60%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 60%)' }}
        >
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 0.4, x: 0 }} transition={{ delay: 0.3, duration: 0.8 }}>
            <GlassCard className="p-2 lg:p-3 xl:p-4">
              <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-3">
                <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                  <TrendingUp className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                </div>
                <div>
                  <p className="text-[8px] lg:text-[10px] text-white/40">Engagement Rate</p>
                  <p className="text-sm lg:text-base xl:text-lg font-bold text-green-400">+247%</p>
                </div>
              </div>
              <div className="h-8 lg:h-10 xl:h-12 flex items-end space-x-0.5 lg:space-x-1">
                {[30, 45, 35, 60, 75, 65, 90, 85, 95].map((h, i) => (
                  <div key={i} style={{ height: `${h}%` }} className="flex-1 bg-gradient-to-t from-pink-500 to-rose-400 rounded-sm" />
                ))}
              </div>
            </GlassCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 0.35, x: 0 }} transition={{ delay: 0.4, duration: 0.8 }}>
            <GlassCard className="p-2 lg:p-3 xl:p-4">
              <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-3">
                <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <MessageSquare className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                </div>
                <div>
                  <p className="text-[8px] lg:text-[10px] text-white/40">{isPhase1 ? 'Posts Scheduled' : 'DM Responses'}</p>
                  <p className="text-sm lg:text-base xl:text-lg font-bold">1,847</p>
                </div>
              </div>
              <div className="space-y-1 lg:space-y-1.5">
                <div className="flex items-center justify-between text-[8px] lg:text-[10px]">
                  <span className="text-white/40">{isPhase1 ? 'On-time' : 'Automated'}</span>
                  <span className="text-blue-400">94%</span>
                </div>
                <div className="h-1 lg:h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-[94%] bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" />
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* Side Graphics - Right (faded) - hidden on mobile */}
        <div
          className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-[140px] lg:w-[180px] xl:w-[220px] space-y-3 lg:space-y-4 z-0 pointer-events-none"
          style={{ maskImage: 'linear-gradient(to left, transparent, black 60%)', WebkitMaskImage: 'linear-gradient(to left, transparent, black 60%)' }}
        >
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 0.4, x: 0 }} transition={{ delay: 0.3, duration: 0.8 }}>
            <GlassCard className="p-2 lg:p-3 xl:p-4">
              <div className="flex items-center space-x-2 lg:space-x-3 mb-1 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                  <Brain className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                </div>
                <div>
                  <p className="text-[8px] lg:text-[10px] text-white/40">AI Hooks Generated</p>
                  <p className="text-sm lg:text-base xl:text-lg font-bold">3,291</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-0.5 lg:gap-1 mt-1 lg:mt-2">
                {['Trending', 'Emotional', 'Question', 'Story'].map((tag) => (
                  <span key={tag} className="px-1 lg:px-1.5 py-0.5 text-[7px] lg:text-[9px] rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20">{tag}</span>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 0.35, x: 0 }} transition={{ delay: 0.4, duration: 0.8 }}>
            <GlassCard className="p-2 lg:p-3 xl:p-4">
              <div className="flex items-center space-x-2 lg:space-x-3 mb-1 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                  <Zap className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                </div>
                <div>
                  <p className="text-[8px] lg:text-[10px] text-white/40">Growth Velocity</p>
                  <p className="text-sm lg:text-base xl:text-lg font-bold text-amber-400">12.4x</p>
                </div>
              </div>
              <p className="text-[7px] lg:text-[10px] text-white/30">{isPhase1 ? 'Faster than manual publishing' : 'Faster than manual engagement'}</p>
            </GlassCard>
          </motion.div>
        </div>

        {/* Central Dashboard */}
        <div className="relative">
          <TiltCard className="w-full">
            <AnimatedDashboard />
          </TiltCard>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="absolute -bottom-3 sm:-bottom-6 left-0 sm:-left-6 px-2 sm:px-4 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 backdrop-blur-xl z-20"
          >
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <CheckCircle className="w-3 h-3 sm:w-5 sm:h-5 text-green-400" />
              <span className="text-[10px] sm:text-sm font-medium text-green-300">{isPhase1 ? 'AI is optimizing your content' : 'AI is actively engaging'}</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="absolute -bottom-3 sm:-bottom-4 right-0 sm:-right-4 px-2 sm:px-4 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 backdrop-blur-xl z-20"
          >
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <Zap className="w-3 h-3 sm:w-5 sm:h-5 text-blue-400" />
              <span className="text-[10px] sm:text-sm font-medium text-blue-300">{isPhase1 ? 'Smart Scheduler Active' : '24/7 Automation Active'}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  </section>
)

export default LiveDashboardSection
