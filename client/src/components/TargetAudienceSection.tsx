import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Layers,
  Target,
  Instagram,
  Smartphone,
  Sparkles,
  Battery,
  Signal,
  Wifi,
  XCircle
} from 'lucide-react';

const TargetAudienceSection = () => {
  const [activeProfile, setActiveProfile] = useState<'pro' | 'casual'>('pro');

  // Auto-toggle between profiles every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveProfile(prev => prev === 'pro' ? 'casual' : 'pro');
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative w-full overflow-hidden bg-[#050505] min-h-screen flex items-center py-12 md:py-24">
      {/* Cinematic Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100px_100px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Ambient Glows - Adjusted to Purple/Pink for Creator Vibe */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 w-full">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-24">

          {/* LEFT SIDE: Narrative & Selection */}
          <div className="w-full lg:w-5/12 space-y-6 md:space-y-12 text-center lg:text-left">
            <div>
              <div
                className="inline-flex items-center space-x-2 text-purple-400 font-medium text-xs mb-4 md:mb-6 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20"
              >
                <Sparkles className="w-3 h-3" />
                <span>AUDIENCE FIT CHECK</span>
              </div>

              <h2
                className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4 md:mb-6 leading-tight"
              >
                Built for the <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                  Modern Creator.
                </span>
              </h2>

              <p
                className="text-base md:text-lg text-gray-400 leading-relaxed max-w-md mx-auto lg:mx-0"
              >
                VeeFore replaces guesswork with a predictable growth system. Designed for creators and brands treating content as a scalable business.
              </p>
            </div>

            {/* Interactive Selector - Compact Grid on Mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              <div
                onClick={() => setActiveProfile('pro')}
                className={`cursor-pointer group relative p-4 md:p-6 rounded-xl border transition-all duration-500 overflow-hidden text-left ${activeProfile === 'pro'
                    ? 'bg-purple-900/10 border-purple-500/50'
                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                  }`}
              >
                {activeProfile === 'pro' && (
                  <motion.div
                    layoutId="highlight"
                    className="absolute inset-0 bg-purple-500/5"
                  />
                )}
                <div className="relative flex items-start gap-4">
                  <div className={`p-2 md:p-3 rounded-lg ${activeProfile === 'pro' ? 'bg-purple-500 text-white' : 'bg-white/10 text-gray-400'}`}>
                    <Rocket className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h3 className={`text-base md:text-lg font-bold mb-1 ${activeProfile === 'pro' ? 'text-white' : 'text-gray-400'}`}>
                      The Growth Architect
                    </h3>
                    <p className="text-xs md:text-sm text-gray-500 leading-relaxed hidden sm:block">
                      Automated workflows, data-driven strategy, and consistent viral reach.
                    </p>
                  </div>
                </div>
              </div>

              <div
                onClick={() => setActiveProfile('casual')}
                className={`cursor-pointer group relative p-4 md:p-6 rounded-xl border transition-all duration-500 overflow-hidden text-left ${activeProfile === 'casual'
                    ? 'bg-red-900/10 border-red-500/50'
                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                  }`}
              >
                {activeProfile === 'casual' && (
                  <motion.div
                    layoutId="highlight"
                    className="absolute inset-0 bg-red-500/5"
                  />
                )}
                <div className="relative flex items-start gap-4">
                  <div className={`p-2 md:p-3 rounded-lg ${activeProfile === 'casual' ? 'bg-red-500 text-white' : 'bg-white/10 text-gray-400'}`}>
                    <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h3 className={`text-base md:text-lg font-bold mb-1 ${activeProfile === 'casual' ? 'text-white' : 'text-gray-400'}`}>
                      The Casual Poster
                    </h3>
                    <p className="text-xs md:text-sm text-gray-500 leading-relaxed hidden sm:block">
                      Posting without a plan or goal? Our tools might be overkill.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: The "Creator Dashboard" Visual */}
          <div className="w-full lg:w-7/12 relative flex justify-center">
            <div
              className={`
                relative overflow-hidden shadow-2xl shadow-black/50 bg-[#0F1117] border border-white/10 transition-all duration-500
                /* Desktop Styles: Landscape Window */
                lg:rounded-xl lg:w-full lg:max-w-none
                /* Mobile Styles: Portrait Phone */
                rounded-[2.5rem] w-[280px] xs:w-[300px] sm:w-[320px] aspect-[9/18] lg:aspect-auto border-[8px] lg:border text-left
              `}
            >
              {/* Desktop Window Header */}
              <div className="hidden lg:flex items-center justify-between px-6 py-4 bg-[#161B22] border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                    <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                  </div>
                  <div className="h-4 w-[1px] bg-white/10 mx-2" />
                  <div className="text-xs font-medium text-gray-400 flex items-center gap-2">
                    <BarChart3 className="w-3 h-3" />
                    Growth_Simulator_v2.4
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${activeProfile === 'pro' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                  {activeProfile === 'pro' ? 'System Active' : 'System Idle'}
                </div>
              </div>

              {/* Mobile Phone Notch/Status Bar */}
              <div className="lg:hidden absolute top-0 left-0 w-full h-8 bg-black z-20 flex justify-center pointer-events-none">
                <div className="w-1/3 h-6 bg-black rounded-b-xl absolute top-0" /> {/* Notch */}
                <div className="w-full px-6 flex justify-between items-center text-[10px] text-white font-bold mt-1">
                  <span>9:41</span>
                  <div className="flex gap-1">
                    <Signal className="w-3 h-3" />
                    <Wifi className="w-3 h-3" />
                    <Battery className="w-3 h-3" />
                  </div>
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="p-4 md:p-8 h-full lg:h-auto relative flex flex-col gap-4 pt-12 lg:pt-8">

                {/* 1. Strategy Module */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                  <div className="p-3 lg:p-4 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-[10px] lg:text-xs text-gray-500 mb-2 uppercase tracking-wide">Strategy Engine</div>
                    <AnimatePresence mode="wait">
                      {activeProfile === 'pro' ? (
                        <motion.div
                          key="pro-strat"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-center gap-3"
                        >
                          <div className="p-2 rounded-lg bg-green-500/20 text-green-400">
                            <Target className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-white text-sm lg:text-base font-bold">Data-Driven</div>
                            <div className="text-[10px] lg:text-xs text-green-400">AI Optimized</div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="casual-strat"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-center gap-3"
                        >
                          <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
                            <Layers className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-white text-sm lg:text-base font-bold">Random</div>
                            <div className="text-[10px] lg:text-xs text-red-400">Guesswork</div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="p-3 lg:p-4 rounded-xl bg-white/5 border border-white/5 hidden lg:block">
                    <div className="text-[10px] lg:text-xs text-gray-500 mb-2 uppercase tracking-wide">Consistency</div>
                    <AnimatePresence mode="wait">
                      {activeProfile === 'pro' ? (
                        <motion.div
                          key="pro-const"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-center gap-3"
                        >
                          <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                            <Zap className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-white text-sm lg:text-base font-bold">Automated</div>
                            <div className="text-[10px] lg:text-xs text-blue-400">Daily Posting</div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="casual-const"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-center gap-3"
                        >
                          <div className="p-2 rounded-lg bg-yellow-500/20 text-yellow-400">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-white text-sm lg:text-base font-bold">Sporadic</div>
                            <div className="text-[10px] lg:text-xs text-yellow-400">When Inspired</div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* 2. Simulation Graph */}
                <div className="flex-1 rounded-xl bg-gradient-to-b from-white/5 to-transparent border border-white/5 p-4 lg:p-5 relative overflow-hidden flex flex-col justify-end">
                  <div className="flex justify-between items-end mb-4 relative z-10">
                    <div>
                      <div className="text-[10px] lg:text-xs text-gray-500 uppercase tracking-wide mb-1">Projected Reach</div>
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={activeProfile}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`text-2xl lg:text-3xl font-bold ${activeProfile === 'pro' ? 'text-white' : 'text-gray-500'}`}
                        >
                          {activeProfile === 'pro' ? '124.5K' : '850'}
                          <span className={`text-xs lg:text-sm ml-2 ${activeProfile === 'pro' ? 'text-green-400' : 'text-gray-600'}`}>
                            {activeProfile === 'pro' ? '+480%' : '+2%'}
                          </span>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    {activeProfile === 'pro' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="px-2 py-1 bg-green-500 text-white text-[10px] font-bold rounded-full animate-pulse absolute top-0 right-0 lg:relative"
                      >
                        VIRAL SPIKE
                      </motion.div>
                    )}
                  </div>

                  {/* The Chart Visual */}
                  <div className="relative h-24 lg:h-32 w-full flex items-end gap-1">
                    {Array.from({ length: 24 }).map((_, i) => {
                      // Pro: Exponential curve
                      // Casual: Random low noise
                      const proHeight = Math.pow(1.2, i) * 2 + 10;
                      const casualHeight = Math.random() * 20 + 10;
                      const height = activeProfile === 'pro'
                        ? Math.min(proHeight, 100)
                        : casualHeight;

                      const color = activeProfile === 'pro'
                        ? i > 18 ? 'bg-green-400' : 'bg-purple-500'
                        : 'bg-gray-700';

                      return (
                        <motion.div
                          key={i}
                          className={`w-full rounded-t-sm opacity-80 ${color}`}
                          initial={{ height: '0%' }}
                          animate={{ height: `${height}%` }}
                          transition={{ duration: 0.5, delay: i * 0.03 }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* 3. Output Log */}
                <div className="p-3 lg:p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px] lg:text-xs space-y-2">
                  <AnimatePresence mode="wait">
                    {activeProfile === 'pro' ? (
                      <motion.div
                        key="pro-log"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-2"
                      >
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Persona Identified</span>
                        </div>
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>30 Days Planned</span>
                        </div>
                        <div className="flex items-center gap-2 text-blue-400">
                          <TrendingUp className="w-3 h-3" />
                          <span>Scaling Ready...</span>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="casual-log"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-2"
                      >
                        <div className="flex items-center gap-2 text-gray-500">
                          <XCircle className="w-3 h-3" />
                          <span>No Strategy</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <XCircle className="w-3 h-3" />
                          <span>Inconsistent</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-400">
                          <AlertCircle className="w-3 h-3" />
                          <span>Stagnant Growth</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </div>

              {/* Scan Line Effect */}
              <motion.div
                className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent opacity-50"
                style={{ willChange: 'top' }}
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
            </div>

            {/* Background Decorative Graphic */}
            <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] opacity-20 pointer-events-none">
              <svg viewBox="0 0 100 100" className="w-full h-full animate-[spin_30s_linear_infinite]">
                <circle cx="50" cy="50" r="45" stroke="url(#gradient-creator)" strokeWidth="0.5" fill="none" strokeDasharray="8 8" />
                <defs>
                  <linearGradient id="gradient-creator" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#A855F7" />
                    <stop offset="100%" stopColor="#EC4899" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default TargetAudienceSection;
