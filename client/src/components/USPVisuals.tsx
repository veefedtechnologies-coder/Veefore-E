import { motion } from 'framer-motion';
import { MOBILE_OPTIMIZED_LAYER } from '../lib/animation-performance';
import { MessageSquare, Bot, User, ArrowRight, Sparkles, TrendingUp, Zap, CheckCircle2, BarChart3, Share2, Bookmark, Calendar, Clock, Eye, Activity } from 'lucide-react';

const isPhase1 = import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true';

export const EngagementVisual = () => {
  return (
    <div className="relative w-full h-auto min-h-[220px] md:min-h-[320px] bg-neutral-950 rounded-xl border border-white/10 p-2 md:p-4 overflow-hidden flex flex-col justify-end shadow-2xl">
      <motion.div style={MOBILE_OPTIMIZED_LAYER} className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />

      <div className="space-y-3 md:space-y-4 relative z-10 pb-1 md:pb-2">
        {/* User Comment */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.25, 0.1, 0.25, 1.0] }}
          style={MOBILE_OPTIMIZED_LAYER}
          className="flex items-end gap-2 md:gap-3 max-w-[95%] md:max-w-[90%]"
        >
          <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center shrink-0">
            <User className="w-3 h-3 md:w-4 md:h-4 text-neutral-400" />
          </div>
          <div className="bg-neutral-800/80 backdrop-blur-sm rounded-2xl rounded-bl-none p-2.5 md:p-4 border border-white/5 shadow-lg">
            <p className="text-[11px] md:text-sm text-neutral-200 leading-snug">How do you scale this without losing quality?</p>
          </div>
        </motion.div>

        {/* AI Processing Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1, duration: 0.5 }}
          className="flex items-center gap-2 text-[10px] md:text-xs text-blue-400 pl-8 md:pl-12"
        >
          <Sparkles className="w-2.5 h-2.5 md:w-3 md:h-3 animate-pulse" />
          <span className="font-medium tracking-wide">AI analyzing context...</span>
        </motion.div>

        {/* AI Reply */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 2, duration: 0.6, ease: [0.25, 0.1, 0.25, 1.0] }}
          style={MOBILE_OPTIMIZED_LAYER}
          className="flex items-end gap-2 md:gap-3 max-w-[95%] md:max-w-[90%] ml-auto flex-row-reverse"
        >
          <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 relative shadow-lg shadow-blue-500/20">
            <Bot className="w-3 h-3 md:w-4 md:h-4 text-white" />
            <div className="absolute -top-1 -right-1 w-2 h-2 md:w-2.5 md:h-2.5 bg-green-500 rounded-full border-2 border-neutral-950" />
          </div>
          <div className="bg-blue-600 rounded-2xl rounded-br-none p-2.5 md:p-4 shadow-lg shadow-blue-900/20">
            <p className="text-[11px] md:text-sm text-white font-medium leading-snug">
              We use a hybrid approach where AI handles the draft, but you set the tone boundaries. Keeps consistency high! 🚀
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export const DMVisual = () => {
  return (
    <div className="relative w-full h-auto min-h-[220px] md:min-h-[320px] bg-neutral-950 rounded-xl border border-white/10 p-2 md:p-6 overflow-hidden flex items-center justify-center shadow-2xl">
      <motion.div style={MOBILE_OPTIMIZED_LAYER} className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-black to-black" />

      {/* Flow Diagram */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[260px] md:max-w-[320px] scale-90 md:scale-100 origin-center">

        {/* Trigger Node */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          style={MOBILE_OPTIMIZED_LAYER}
          className="w-full relative group"
        >
          <div className="absolute -left-1 top-0 bottom-0 w-1 bg-purple-500 rounded-l-lg" />
          <div className="bg-neutral-900/90 border border-white/5 p-2.5 md:p-4 rounded-r-lg rounded-l-sm shadow-xl flex items-center justify-between backdrop-blur-sm">
            <div>
              <div className="text-[9px] md:text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-0.5 md:mb-1">Trigger</div>
              <div className="text-white font-bold text-[11px] md:text-sm">Keyword: "GROWTH"</div>
            </div>
            <div className="w-6 h-6 md:w-8 md:h-8 rounded bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
              <Zap className="w-3 h-3 md:w-4 md:h-4 text-purple-400" />
            </div>
          </div>
        </motion.div>

        {/* Connector */}
        <div className="h-4 md:h-8 w-px bg-gradient-to-b from-purple-500/50 to-blue-500/50 my-1" />

        {/* Action Node */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.25, 0.1, 0.25, 1.0] }}
          style={MOBILE_OPTIMIZED_LAYER}
          className="w-full relative group"
        >
          <div className="absolute -left-1 top-0 bottom-0 w-1 bg-blue-500 rounded-l-lg" />
          <div className="bg-neutral-900/90 border border-white/5 p-2.5 md:p-4 rounded-r-lg rounded-l-sm shadow-xl flex items-center justify-between backdrop-blur-sm relative overflow-hidden">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent"
              initial={{ x: '-100%' }}
              whileInView={{ x: '100%' }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear", repeatDelay: 1 }}
            />
            <div>
              <div className="text-[9px] md:text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-0.5 md:mb-1">Action</div>
              <div className="text-white font-bold text-[11px] md:text-sm">Send "Free Guide"</div>
            </div>
            <div className="w-6 h-6 md:w-8 md:h-8 rounded bg-blue-500/10 flex items-center justify-center border border-blue-500/20 relative z-10">
              <Bot className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
            </div>
          </div>
        </motion.div>

        {/* Connector */}
        <div className="h-4 md:h-8 w-px bg-gradient-to-b from-blue-500/50 to-green-500/50 my-1" />

        {/* Outcome Node */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.6, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="w-full relative group"
        >
          <div className="absolute inset-0 bg-green-500/5 blur-xl rounded-lg opacity-50" />
          <div className="absolute -left-1 top-0 bottom-0 w-1 bg-green-500 rounded-l-lg" />
          <div className="bg-neutral-900/90 border border-green-500/20 p-2.5 md:p-4 rounded-r-lg rounded-l-sm shadow-xl flex items-center justify-between backdrop-blur-sm relative z-10">
            <div>
              <div className="text-[9px] md:text-[10px] font-bold text-green-400 uppercase tracking-widest mb-0.5 md:mb-1">Outcome</div>
              <div className="text-white font-bold text-[11px] md:text-sm">Lead Captured (+1)</div>
            </div>
            <div className="w-6 h-6 md:w-8 md:h-8 rounded bg-green-500/20 flex items-center justify-center border border-green-500/30">
              <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-green-400" />
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export const HookVisual = () => {
  return (
    <div className="relative w-full h-auto min-h-[180px] md:min-h-[240px] bg-neutral-950 rounded-xl border border-white/10 p-2 md:p-4 overflow-hidden flex flex-col justify-center shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-pink-500/10 via-transparent to-transparent" />

      <div className="relative z-10 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-pink-500 animate-pulse" />
            <span className="text-[10px] md:text-xs font-bold text-pink-400 uppercase tracking-wider">Viral Analysis</span>
          </div>
          <div className="text-xl md:text-2xl font-black text-white">94<span className="text-[10px] md:text-sm text-white/40 font-normal ml-1">/100</span></div>
        </div>

        {/* Progress Bar */}
        <div className="relative h-3 md:h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '94%' }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 relative"
          >
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%,transparent_100%)] bg-[length:1rem_1rem] animate-[shimmer_1s_linear_infinite]" />
          </motion.div>
        </div>

        {/* Card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.6, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="bg-neutral-900 border border-white/10 rounded-xl p-3 md:p-5 shadow-lg relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-3 opacity-20">
            <BarChart3 className="w-8 h-8 md:w-12 md:h-12 text-white" />
          </div>
          <div className="flex items-center gap-2 mb-2 md:mb-3">
            <span className="px-1.5 py-0.5 md:px-2 md:py-1 rounded bg-indigo-500/20 text-indigo-300 text-[9px] md:text-[10px] font-bold uppercase border border-indigo-500/20">
              High Performing
            </span>
          </div>
          <p className="text-sm md:text-lg font-bold text-white leading-snug">
            "Stop making this <span className="text-pink-300 bg-pink-500/20 px-1 rounded mx-0.5 border border-pink-500/20">mistake</span> if you want to grow..."
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {[
            { label: 'Retention', val: '+45%', icon: TrendingUp, color: 'text-green-400' },
            { label: 'Shares', val: '1.2k', icon: Share2, color: 'text-blue-400' },
            { label: 'Saves', val: '850', icon: Bookmark, color: 'text-purple-400' }
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0.8, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 1 + (i * 0.15), duration: 0.6, ease: [0.25, 0.1, 0.25, 1.0] }}
              className="bg-white/5 rounded-lg p-2 md:p-3 border border-white/5 flex flex-col items-center justify-center gap-1 hover:bg-white/10 transition-colors"
            >
              <stat.icon className={`w-3 h-3 md:w-4 md:h-4 ${stat.color} mb-0.5 md:mb-1`} />
              <div className="text-[8px] md:text-[10px] text-white/40 uppercase font-bold tracking-wide">{stat.label}</div>
              <div className="text-xs md:text-sm font-bold text-white">{stat.val}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Phase 1 Safe Visuals ─────────────────────────────────────────────────────

export const SchedulerVisual = () => {
  const posts = [
    { time: 'Mon 9:00 AM', label: 'Product Reel', status: 'scheduled', color: 'from-blue-500 to-cyan-500', score: 94 },
    { time: 'Wed 12:00 PM', label: 'Carousel Post', status: 'optimal', color: 'from-purple-500 to-indigo-500', score: 91 },
    { time: 'Fri 6:00 PM', label: 'Story Series', status: 'scheduled', color: 'from-pink-500 to-rose-500', score: 88 },
  ];
  return (
    <div className="relative w-full h-auto min-h-[220px] md:min-h-[320px] bg-neutral-950 rounded-xl border border-white/10 p-2 md:p-4 overflow-hidden flex flex-col justify-center shadow-2xl">
      <motion.div style={MOBILE_OPTIMIZED_LAYER} className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
      <div className="relative z-10 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[10px] md:text-xs font-bold text-blue-400 uppercase tracking-wider">AI Best-Time Scheduler</span>
        </div>
        {posts.map((post, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.2, duration: 0.5 }}
            style={MOBILE_OPTIMIZED_LAYER}
            className="bg-neutral-900/80 rounded-xl p-2.5 md:p-3.5 border border-white/5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${post.color} flex items-center justify-center shrink-0`}>
                  <Clock className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p className="text-[11px] md:text-sm font-semibold text-white">{post.label}</p>
                  <p className="text-[9px] md:text-[10px] text-white/40">{post.time}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${post.status === 'optimal' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {post.status === 'optimal' ? '⚡ Optimal' : '✓ Scheduled'}
                </span>
                <p className="text-[9px] text-white/30 mt-0.5">Score: {post.score}</p>
              </div>
            </div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.9 }}
          className="flex items-center gap-2 pt-1"
        >
          <Sparkles className="w-3 h-3 text-blue-400 animate-pulse" />
          <span className="text-[10px] text-blue-400/80 font-medium">AI analyzing peak engagement windows...</span>
        </motion.div>
      </div>
    </div>
  );
};

export const AnalyticsVisual = () => {
  return (
    <div className="relative w-full h-auto min-h-[220px] md:min-h-[320px] bg-neutral-950 rounded-xl border border-white/10 p-2 md:p-6 overflow-hidden flex items-center justify-center shadow-2xl">
      <motion.div style={MOBILE_OPTIMIZED_LAYER} className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black" />
      <div className="relative z-10 w-full space-y-3 md:space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[10px] md:text-xs font-bold text-indigo-400 uppercase tracking-wider">Growth Analytics</span>
        </div>
        {[
          { label: 'Reach', value: '+247%', bar: 94, color: 'from-blue-500 to-cyan-400', textColor: 'text-blue-400' },
          { label: 'Impressions', value: '+189%', bar: 78, color: 'from-purple-500 to-indigo-400', textColor: 'text-purple-400' },
          { label: 'Saves', value: '+312%', bar: 88, color: 'from-green-500 to-emerald-400', textColor: 'text-green-400' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.15, duration: 0.5 }}
            className="space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] md:text-xs text-white/50 font-medium">{stat.label}</span>
              <span className={`text-[10px] md:text-xs font-bold ${stat.textColor}`}>{stat.value}</span>
            </div>
            <div className="h-1.5 md:h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${stat.bar}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.15, duration: 0.8, ease: 'easeOut' }}
                className={`h-full bg-gradient-to-r ${stat.color} rounded-full`}
              />
            </div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8 }}
          className="pt-1 grid grid-cols-3 gap-2"
        >
          {[
            { icon: Eye, label: 'Views', val: '248K' },
            { icon: TrendingUp, label: 'Growth', val: '+2.4K' },
            { icon: BarChart3, label: 'Score', val: '94/100' },
          ].map((s, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/5 rounded-lg p-2 text-center">
              <s.icon className="w-3.5 h-3.5 text-indigo-400 mx-auto mb-1" />
              <p className="text-[8px] md:text-[9px] text-white/30 uppercase tracking-wide">{s.label}</p>
              <p className="text-[10px] md:text-xs font-bold text-white">{s.val}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

// Phase 1 aware exports — these are what Landing.tsx imports
export const Phase1EngagementVisual = isPhase1 ? SchedulerVisual : EngagementVisual;
export const Phase1DMVisual = isPhase1 ? AnalyticsVisual : DMVisual;
