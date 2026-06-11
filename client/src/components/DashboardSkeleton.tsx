/**
 * DashboardSkeleton Component - Landing Page Sections Redesign
 * 
 * Fallback skeleton component displayed while AnimatedDashboard lazy loads.
 * Matches the visual structure and dimensions of the actual dashboard.
 * 
 * Features:
 * - Matches BASE_WIDTH (1000px) and BASE_HEIGHT (600px) of AnimatedDashboard
 * - Glass morphism styling matching the hero section design language
 * - Subtle pulse animations for loading state indication
 * - Responsive scaling to match parent container
 * 
 * Used with React.Suspense for lazy loading AnimatedDashboard:
 * <Suspense fallback={<DashboardSkeleton />}>
 *   <AnimatedDashboard />
 * </Suspense>
 */

import React from 'react';
import { motion } from 'framer-motion';

const DashboardSkeleton: React.FC = () => {
  return (
    <div className="relative w-full" style={{ paddingBottom: '60%' }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 w-full h-full"
      >
        {/* Dashboard Chrome Container */}
        <div
          className="relative w-full h-full bg-[#0a0a0a]/80 backdrop-blur-md rounded-[20px] border border-white/10 shadow-[0_0_100px_rgba(59,130,246,0.15)] overflow-hidden"
          style={{
            maxWidth: '1000px',
            maxHeight: '600px',
            margin: '0 auto',
          }}
        >
          {/* Header Bar with Traffic Lights */}
          <div className="flex items-center justify-between h-10 px-4 border-b border-white/5 bg-black/20">
            {/* Traffic Lights */}
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-white/10 animate-pulse" />
              <div className="w-3 h-3 rounded-full bg-white/10 animate-pulse" style={{ animationDelay: '0.1s' }} />
              <div className="w-3 h-3 rounded-full bg-white/10 animate-pulse" style={{ animationDelay: '0.2s' }} />
            </div>

            {/* Title Skeleton */}
            <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />

            {/* Right Controls Skeleton */}
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded bg-white/5 animate-pulse" />
              <div className="w-6 h-6 rounded bg-white/5 animate-pulse" style={{ animationDelay: '0.1s' }} />
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex h-[calc(100%-2.5rem)]">
            {/* Sidebar Skeleton */}
            <div className="w-48 border-r border-white/5 bg-black/10 p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-8 bg-white/5 rounded-lg animate-pulse"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>

            {/* Main Dashboard Content Skeleton */}
            <div className="flex-1 p-6 space-y-4">
              {/* Title Row */}
              <div className="flex items-center justify-between mb-6">
                <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
                <div className="h-8 w-32 bg-white/5 rounded animate-pulse" style={{ animationDelay: '0.1s' }} />
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2"
                  >
                    <div className="h-4 w-24 bg-white/10 rounded animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                    <div className="h-8 w-16 bg-white/10 rounded animate-pulse" style={{ animationDelay: `${i * 0.1 + 0.05}s` }} />
                    <div className="h-3 w-20 bg-white/10 rounded animate-pulse" style={{ animationDelay: `${i * 0.1 + 0.1}s` }} />
                  </div>
                ))}
              </div>

              {/* Chart Area Skeleton */}
              <div className="h-48 rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <div className="flex items-end justify-between h-full space-x-2">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-blue-400/20 to-transparent rounded-t animate-pulse"
                      style={{
                        height: `${Math.random() * 60 + 40}%`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Bottom Metric Cards */}
              <div className="grid grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2"
                  >
                    <div className="h-4 w-32 bg-white/10 rounded animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                    <div className="h-6 w-20 bg-white/10 rounded animate-pulse" style={{ animationDelay: `${i * 0.1 + 0.05}s` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Animated Cursor Skeleton */}
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute top-16 left-52 w-5 h-5 rounded-full bg-blue-400/50 blur-sm pointer-events-none"
          />
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardSkeleton;
