import React, { useRef, useState, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  Clock, MessageSquare, TrendingDown, Zap, Bot, BarChart3,
  ArrowRight, CheckCircle, X, Calendar, Sparkles, Users
} from 'lucide-react';

const bottlenecks = [
  {
    id: 'time',
    painIcon: Clock,
    painTitle: 'Hours lost to manual engagement',
    painDesc: 'Creators spend 3–5 hours a day just replying to comments and DMs — time that could go into making content.',
    painColor: 'from-red-500/20 to-transparent',
    painBorder: 'border-red-500/20',
    painTag: 'bg-red-500/10 text-red-400 border-red-500/20',
    fixIcon: Bot,
    fixTitle: 'Veefore replies for you, instantly',
    fixDesc: 'AI handles every comment and DM in under 2 seconds — human-sounding, context-aware, always on.',
    fixColor: 'from-blue-500/20 to-transparent',
    fixBorder: 'border-blue-500/20',
    fixTag: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    mockBefore: (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Your Notification Inbox</div>
        {['@user1: Love this! 😍', '@user2: How much does it cost?', '@user3: Can you collab?', '@user4: Fire content bro 🔥', '@user5: What camera do you use?'].map((msg, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
            <span className="text-xs text-white/60 truncate">{msg}</span>
            <span className="text-[10px] text-red-400 ml-2 shrink-0">Unread</span>
          </div>
        ))}
        <div className="text-center text-[10px] text-red-400 pt-1">+247 more unanswered...</div>
      </div>
    ),
    mockAfter: (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Veefore Auto-Replies</div>
        {[
          { msg: '@user1: Love this! 😍', reply: 'Thank you so much! 🙌 More coming tomorrow!' },
          { msg: '@user2: How much does it cost?', reply: 'Check the link in bio for pricing — just for you! 🎁' },
        ].map((item, i) => (
          <div key={i} className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 space-y-1.5">
            <div className="text-xs text-white/50">{item.msg}</div>
            <div className="flex items-start space-x-1.5">
              <Bot className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
              <span className="text-xs text-blue-200">{item.reply}</span>
            </div>
          </div>
        ))}
        <div className="text-center text-[10px] text-blue-400 pt-1 flex items-center justify-center space-x-1">
          <CheckCircle className="w-3 h-3" /><span>245 replies sent in the last hour</span>
        </div>
      </div>
    ),
  },
  {
    id: 'timing',
    painIcon: TrendingDown,
    painTitle: 'Posting at the wrong time',
    painDesc: "Most creators post when it's convenient for them, not when their audience is actually online — killing organic reach before it starts.",
    painColor: 'from-orange-500/20 to-transparent',
    painBorder: 'border-orange-500/20',
    painTag: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    fixIcon: Calendar,
    fixTitle: 'AI finds your perfect window',
    fixDesc: "Veefore analyzes your follower activity patterns and auto-schedules your posts at the exact moment they'll get maximum eyeballs.",
    fixColor: 'from-emerald-500/20 to-transparent',
    fixBorder: 'border-emerald-500/20',
    fixTag: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    mockBefore: (
      <div className="mt-4 space-y-2">
        <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Your Posting Schedule</div>
        {['Mon – 11:00 PM 😴', 'Wed – 2:00 AM 🌙', 'Fri – 10:00 PM 😴'].map((slot, i) => (
          <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5">
            <span className="text-xs text-white/60">{slot}</span>
            <span className="text-[10px] text-orange-400">Low traffic</span>
          </div>
        ))}
        <div className="text-center text-[10px] text-orange-400 pt-1">Avg reach: 430 accounts</div>
      </div>
    ),
    mockAfter: (
      <div className="mt-4 space-y-2">
        <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Veefore Smart Schedule</div>
        {[
          { slot: 'Tue – 10:30 AM', tag: '🔥 Peak', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { slot: 'Thu – 7:45 PM', tag: '🔥 Peak', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { slot: 'Sat – 9:15 AM', tag: '✨ High', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
        ].map((slot, i) => (
          <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${slot.bg}`}>
            <span className="text-xs text-white/80 font-medium">{slot.slot}</span>
            <span className={`text-[10px] ${slot.color}`}>{slot.tag}</span>
          </div>
        ))}
        <div className="text-center text-[10px] text-emerald-400 pt-1 flex items-center justify-center space-x-1">
          <CheckCircle className="w-3 h-3" /><span>Projected reach: 8,200+ accounts</span>
        </div>
      </div>
    ),
  },
  {
    id: 'content',
    painIcon: MessageSquare,
    painTitle: 'Captions that don\'t hook',
    painDesc: 'Great content dies with a weak caption. Most creators spend 30 min writing captions that get ignored in the first 3 words.',
    painColor: 'from-purple-500/20 to-transparent',
    painBorder: 'border-purple-500/20',
    painTag: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    fixIcon: Sparkles,
    fixTitle: 'AI writes hooks that stop the scroll',
    fixDesc: 'Veefore\'s caption engine is trained on thousands of viral posts. It writes the opening line that makes someone stop, read, and engage.',
    fixColor: 'from-pink-500/20 to-transparent',
    fixBorder: 'border-pink-500/20',
    fixTag: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    mockBefore: (
      <div className="mt-4 space-y-3">
        <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Your Draft Caption</div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-xs text-white/60 leading-relaxed italic">
            "Hey guys, check out my new video about productivity tips! Hope you like it and don't forget to like and subscribe 🙏"
          </p>
        </div>
        <div className="flex items-center space-x-2 text-orange-400 text-[10px]">
          <X className="w-3 h-3" />
          <span>Hook strength: Weak. Avg scroll-stop rate: 2%</span>
        </div>
      </div>
    ),
    mockAfter: (
      <div className="mt-4 space-y-3">
        <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Veefore AI Rewrite</div>
        <div className="p-3 rounded-lg bg-pink-500/5 border border-pink-500/15">
          <p className="text-xs text-pink-100 leading-relaxed">
            "I wasted 2 years being 'busy' — until I found the 3 systems that actually moved the needle. Here's what I wish someone had told me sooner 👇"
          </p>
        </div>
        <div className="flex items-center space-x-2 text-pink-400 text-[10px]">
          <CheckCircle className="w-3 h-3" />
          <span>Hook strength: Viral. Predicted scroll-stop rate: 34%</span>
        </div>
      </div>
    ),
  }
];

export const AlgorithmScienceSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });
  const [activeCard, setActiveCard] = useState<string>('time');
  const [direction, setDirection] = useState<1 | -1>(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ids = bottlenecks.map(b => b.id);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setDirection(1);
      setActiveCard(prev => {
        const idx = ids.indexOf(prev);
        return ids[(idx + 1) % ids.length];
      });
    }, 6000);
  };

  // Start timer when section comes into view
  useEffect(() => {
    if (isInView) startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isInView]);

  // Reset timer on every tab change (so manual clicks get a fresh 6s)
  useEffect(() => {
    if (isInView) startTimer();
  }, [activeCard]);

  // Pure state update — no side effects, responds instantly
  const handleTabClick = (id: string) => {
    const prevIdx = ids.indexOf(activeCard);
    const nextIdx = ids.indexOf(id);
    setDirection(nextIdx >= prevIdx ? 1 : -1);
    setActiveCard(id);
  };

  const active = bottlenecks.find(b => b.id === activeCard)!;

  return (
    <section ref={containerRef} className="pt-16 sm:pt-20 md:pt-28 pb-6 md:pb-10 relative overflow-hidden w-full bg-[#030303]">
      <div className="absolute -top-[20%] -right-[5%] w-[45vw] h-[45vw] rounded-full bg-purple-600/6 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-[10%] -left-[5%] w-[40vw] h-[40vw] rounded-full bg-blue-600/6 blur-[130px] pointer-events-none" />

      <div className="w-full px-4 sm:px-6 md:px-12 lg:px-20 relative z-10">
        <div className="max-w-[1400px] w-full mx-auto">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7 }}
            className="text-center mb-14 md:mb-20"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 text-[10px] sm:text-xs font-bold text-orange-400 uppercase tracking-widest mb-6"
            >
              <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Why creators plateau</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-5 leading-tight tracking-tight"
            >
              The 3 things that{' '}
              <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                kill your growth
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-white/50 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed"
            >
              It's not your content. It's the invisible bottlenecks eating your reach, your time, and your momentum — every single day.
            </motion.p>
          </motion.div>

          {/* Tab Selector */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap justify-center gap-3 mb-10"
          >
            {bottlenecks.map((b) => {
              const Icon = b.painIcon;
              return (
                <button
                  key={b.id}
                  onClick={() => handleTabClick(b.id)}
                  className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-300 ${
                    activeCard === b.id
                      ? 'bg-white/10 border-white/20 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{b.painTitle.split(' ').slice(0,3).join(' ')}...</span>
                </button>
              );
            })}
          </motion.div>

          {/* Main Comparison Panel */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5 }}
          >
            <AnimatePresence mode="popLayout" custom={direction}>
              <motion.div
                key={activeCard}
                custom={direction}
                variants={{
                  enter: (dir: number) => ({ opacity: 0, x: dir * 40 }),
                  center: { opacity: 1, x: 0 },
                  exit: (dir: number) => ({ opacity: 0, x: dir * -40 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="grid grid-cols-1 md:grid-cols-2 gap-5"
              >
                {/* Pain Side */}
                <div className={`p-6 md:p-8 rounded-2xl bg-gradient-to-br ${active.painColor} border ${active.painBorder} relative overflow-hidden`}>
                  <div className="flex items-center space-x-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${active.painTag} flex items-center space-x-1`}>
                      <X className="w-3 h-3" />
                      <span>Without Veefore</span>
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{active.painTitle}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{active.painDesc}</p>
                  {active.mockBefore}
                </div>

                {/* Fix Side */}
                <div className={`p-6 md:p-8 rounded-2xl bg-gradient-to-br ${active.fixColor} border ${active.fixBorder} relative overflow-hidden`}>
                  <div className="flex items-center space-x-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${active.fixTag} flex items-center space-x-1`}>
                      <CheckCircle className="w-3 h-3" />
                      <span>With Veefore</span>
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{active.fixTitle}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{active.fixDesc}</p>
                  {active.mockAfter}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* Bottom CTA hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.9 }}
            className="mt-10 text-center"
          >
            <p className="text-white/30 text-sm">
              These are the exact workflows Veefore automates from day one.{' '}
              <span className="text-white/60 underline underline-offset-4 decoration-white/20 cursor-pointer hover:text-white transition-colors">
                See the full feature list →
              </span>
            </p>
          </motion.div>

        </div>
      </div>
    </section>
  );
};
