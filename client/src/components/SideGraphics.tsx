import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, MessageSquare, Brain, Zap } from 'lucide-react';
import GlassCard from './GlassCard';

/**
 * SideGraphics Component
 * 
 * Decorative graphics displayed on left and right sides of the AnimatedDashboard section.
 * Features:
 * - Positioned absolutely on either left or right side
 * - Hidden on mobile (< 768px) and tablet (< 1024px) using responsive classes
 * - Fade effect using mask-image with linear-gradient
 * - Displays floating metric cards with engagement visualizations
 * - GPU-accelerated animations for smooth performance
 * 
 * Optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Simple equality check on 'side' prop
 * 
 * Requirements: 4.1, 8.4
 * 
 * @param side - Position of the graphics ('left' | 'right')
 */

interface SideGraphicsProps {
  side: 'left' | 'right';
}

// Phase 1 Review Mode flag
const isPhase1 = import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true';

const SideGraphics: React.FC<SideGraphicsProps> = React.memo(({ side }) => {
  const isLeft = side === 'left';
  
  // Position and mask configuration based on side
  const positionClasses = isLeft 
    ? 'left-4 lg:left-8 xl:left-12' 
    : 'right-0';
  
  const maskStyle = isLeft
    ? {
        maskImage: 'linear-gradient(to right, transparent, black 60%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 60%)'
      }
    : {
        maskImage: 'linear-gradient(to left, transparent, black 60%)',
        WebkitMaskImage: 'linear-gradient(to left, transparent, black 60%)'
      };
  
  const animationDirection = isLeft ? -30 : 30;

  return (
    <div 
      className={`hidden md:block absolute ${positionClasses} top-1/2 -translate-y-1/2 w-[140px] lg:w-[180px] xl:w-[220px] space-y-3 lg:space-y-4 z-0 pointer-events-none`}
      style={maskStyle}
      aria-hidden="true"
    >
      {isLeft ? (
        <>
          {/* Left Side - Engagement Rate Card */}
          <motion.div
            initial={{ opacity: 0, x: animationDirection }}
            animate={{ opacity: 0.4, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            role="img"
            aria-label="Engagement rate increased by 247%"
          >
            <GlassCard className="p-2 lg:p-3 xl:p-4">
              <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-3">
                <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center" aria-hidden="true">
                  <TrendingUp className="w-3 h-3 lg:w-4 lg:h-4 text-white" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[8px] lg:text-[10px] text-white/40">Engagement Rate</p>
                  <p className="text-sm lg:text-base xl:text-lg font-bold text-green-400">+247%</p>
                </div>
              </div>
              <div className="h-8 lg:h-10 xl:h-12 flex items-end space-x-0.5 lg:space-x-1" aria-hidden="true">
                {[30, 45, 35, 60, 75, 65, 90, 85, 95].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className="flex-1 bg-gradient-to-t from-pink-500 to-rose-400 rounded-sm"
                  />
                ))}
              </div>
            </GlassCard>
          </motion.div>

          {/* Left Side - Posts/DM Responses Card */}
          <motion.div
            initial={{ opacity: 0, x: animationDirection }}
            animate={{ opacity: 0.35, x: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            role="img"
            aria-label={`${isPhase1 ? 'Posts scheduled' : 'DM responses'}: 1,847 total, 94% ${isPhase1 ? 'on-time' : 'automated'}`}
          >
            <GlassCard className="p-2 lg:p-3 xl:p-4">
              <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-3">
                <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center" aria-hidden="true">
                  <MessageSquare className="w-3 h-3 lg:w-4 lg:h-4 text-white" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[8px] lg:text-[10px] text-white/40">
                    {isPhase1 ? 'Posts Scheduled' : 'DM Responses'}
                  </p>
                  <p className="text-sm lg:text-base xl:text-lg font-bold">1,847</p>
                </div>
              </div>
              <div className="space-y-1 lg:space-y-1.5">
                <div className="flex items-center justify-between text-[8px] lg:text-[10px]">
                  <span className="text-white/40">
                    {isPhase1 ? 'On-time' : 'Automated'}
                  </span>
                  <span className="text-blue-400">94%</span>
                </div>
                <div className="h-1 lg:h-1.5 bg-white/10 rounded-full overflow-hidden" aria-hidden="true">
                  <div className="h-full w-[94%] bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" />
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </>
      ) : (
        <>
          {/* Right Side - AI Hooks Generated Card */}
          <motion.div
            initial={{ opacity: 0, x: animationDirection }}
            animate={{ opacity: 0.4, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            role="img"
            aria-label="AI hooks generated: 3,291 total including trending, emotional, question and story patterns"
          >
            <GlassCard className="p-2 lg:p-3 xl:p-4">
              <div className="flex items-center space-x-2 lg:space-x-3 mb-1 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center" aria-hidden="true">
                  <Brain className="w-3 h-3 lg:w-4 lg:h-4 text-white" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[8px] lg:text-[10px] text-white/40">AI Hooks Generated</p>
                  <p className="text-sm lg:text-base xl:text-lg font-bold">3,291</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-0.5 lg:gap-1 mt-1 lg:mt-2" aria-hidden="true">
                {['Trending', 'Emotional', 'Question', 'Story'].map((tag) => (
                  <span 
                    key={tag} 
                    className="px-1 lg:px-1.5 py-0.5 text-[7px] lg:text-[9px] rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          {/* Right Side - Growth Velocity Card */}
          <motion.div
            initial={{ opacity: 0, x: animationDirection }}
            animate={{ opacity: 0.35, x: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            role="img"
            aria-label={`Growth velocity: 12.4 times faster than manual ${isPhase1 ? 'publishing' : 'engagement'}`}
          >
            <GlassCard className="p-2 lg:p-3 xl:p-4">
              <div className="flex items-center space-x-2 lg:space-x-3 mb-1 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 xl:w-9 xl:h-9 rounded-lg xl:rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center" aria-hidden="true">
                  <Zap className="w-3 h-3 lg:w-4 lg:h-4 text-white" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[8px] lg:text-[10px] text-white/40">Growth Velocity</p>
                  <p className="text-sm lg:text-base xl:text-lg font-bold text-amber-400">12.4x</p>
                </div>
              </div>
              <p className="text-[7px] lg:text-[10px] text-white/30">
                {isPhase1 ? 'Faster than manual publishing' : 'Faster than manual engagement'}
              </p>
            </GlassCard>
          </motion.div>
        </>
      )}
    </div>
  );
});

SideGraphics.displayName = 'SideGraphics';

export default SideGraphics;
