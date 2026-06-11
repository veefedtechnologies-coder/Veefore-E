import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useMotionValueEvent } from 'framer-motion';
import { Sparkles, TrendingUp, Zap, Target, BrainCircuit, Activity, Rocket, CheckCircle, Eye, Heart, MessageCircle, Calendar, Clock, Bell, ArrowUpRight } from 'lucide-react';

const steps = [
  {
    number: "01",
    icon: Sparkles,
    title: "Create Your Content",
    description: "Post your content as usual. Our AI seamlessly analyzes every single element—from captions to timing—without interrupting your flow.",
    accentColor: "#60a5fa", // Blue
    glowColor: "rgba(96, 165, 250, 0.5)",
    visualIcon: BrainCircuit
  },
  {
    number: "02",
    icon: TrendingUp,
    title: "AI Analyzes & Learns",
    description: "Deep machine learning identifies hidden patterns from millions of posts to understand exactly what triggers engagement in your niche.",
    accentColor: "#a78bfa", // Purple
    glowColor: "rgba(167, 139, 250, 0.5)",
    visualIcon: Activity
  },
  {
    number: "03",
    icon: Zap,
    title: "Auto-Optimize",
    description: "The engine automatically calibrates posting times, tweaks captions, and adjusts strategies in real-time for maximum reach.",
    accentColor: "#fb923c", // Orange
    glowColor: "rgba(251, 146, 60, 0.5)",
    visualIcon: Zap
  },
  {
    number: "04",
    icon: Target,
    title: "Exponential Growth",
    description: "Every post gets smarter. Watch your engagement compound exponentially as the AI builds a custom algorithm just for you.",
    accentColor: "#34d399", // Emerald
    glowColor: "rgba(52, 211, 153, 0.5)",
    visualIcon: Rocket
  }
];

const CreateContentMock = () => (
  <div className="space-y-2 lg:space-y-3 w-full px-1 lg:px-4">
    <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-4">
      <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shrink-0">
        <span className="text-xs lg:text-sm font-bold text-white">SJ</span>
      </div>
      <div>
        <div className="text-[11px] lg:text-sm font-semibold text-white">Sarah Jenkins</div>
        <div className="text-[9px] lg:text-[10px] text-white/50">Drafting new post...</div>
      </div>
    </div>
    
    <div className="p-3 lg:p-4 bg-white/5 border border-white/10 rounded-xl relative shadow-inner">
      <p className="text-[10px] lg:text-sm text-white/90 leading-relaxed font-light">
        Just launched our new feature! 🚀 We've been working on this for months and I can't wait for you all to try it out...
      </p>
      
      {/* AI Suggestion Bubble */}
      <motion.div 
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 100 }}
        className="mt-2 lg:mt-4 p-2 lg:p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start space-x-2"
      >
        <Sparkles className="w-3 h-3 lg:w-4 lg:h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-[9px] lg:text-xs text-blue-100 leading-snug">
          <strong className="text-blue-400">AI Suggestion:</strong> Add a question at the end to boost comments by 40%.
        </p>
      </motion.div>
    </div>
    
    <div className="flex justify-end pt-1 lg:pt-2">
      <div className="px-3 py-1.5 lg:px-4 lg:py-2 bg-white/10 hover:bg-white/20 transition-colors rounded-lg text-[10px] lg:text-xs font-semibold text-white flex items-center cursor-pointer">
        <Sparkles className="w-3 h-3 lg:w-3.5 lg:h-3.5 mr-1.5 text-blue-400" /> Auto-Rewrite
      </div>
    </div>
  </div>
);

const AnalyticsMock = () => (
  <div className="space-y-3 lg:space-y-5 w-full px-1 lg:px-4">
    <div className="p-3 lg:p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.1)]">
      <div className="text-[9px] lg:text-[10px] text-purple-300 uppercase tracking-wider mb-1 lg:mb-2 font-semibold">Hook Analysis</div>
      <div className="text-[11px] lg:text-sm font-medium text-white italic">"Just launched our new..."</div>
      <div className="mt-2 lg:mt-4 flex items-end justify-between">
        <div className="text-[10px] lg:text-xs text-white/60">Predicted Retention</div>
        <div className="text-lg lg:text-xl font-bold text-purple-400">85%</div>
      </div>
      {/* Retention Curve */}
      <div className="mt-2 h-8 lg:h-12 w-full relative flex items-end border-b border-white/10">
        <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible" preserveAspectRatio="none">
          <motion.path 
            d="M0,5 Q20,5 40,15 T100,35" 
            fill="none" 
            stroke="#c084fc" 
            strokeWidth="3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />
        </svg>
      </div>
    </div>

    <div className="grid grid-cols-3 gap-2 lg:gap-3">
      <div className="bg-white/5 rounded-xl p-2 lg:p-3 text-center border border-white/5">
        <Eye className="w-3 h-3 lg:w-4 lg:h-4 text-white/40 mx-auto mb-1 lg:mb-1.5" />
        <div className="text-[11px] lg:text-sm font-bold text-white">12.4K</div>
      </div>
      <div className="bg-white/5 rounded-xl p-2 lg:p-3 text-center border border-white/5">
        <Heart className="w-3 h-3 lg:w-4 lg:h-4 text-white/40 mx-auto mb-1 lg:mb-1.5" />
        <div className="text-[11px] lg:text-sm font-bold text-white">842</div>
      </div>
      <div className="bg-white/5 rounded-xl p-2 lg:p-3 text-center border border-white/5">
        <MessageCircle className="w-3 h-3 lg:w-4 lg:h-4 text-white/40 mx-auto mb-1 lg:mb-1.5" />
        <div className="text-[11px] lg:text-sm font-bold text-white">156</div>
      </div>
    </div>
  </div>
);

const OptimizeMock = () => (
  <div className="space-y-3 lg:space-y-5 w-full px-1 lg:px-4">
    <div className="flex items-center space-x-2 text-orange-400 mb-2 lg:mb-4">
      <Zap className="w-4 h-4 lg:w-5 lg:h-5" />
      <span className="text-[11px] lg:text-sm font-bold uppercase tracking-wider">Smart Scheduler</span>
    </div>
    
    <div className="space-y-2 lg:space-y-3">
      <div className="p-2.5 lg:p-3 border border-white/5 rounded-xl flex items-center justify-between opacity-50 bg-white/5">
        <div className="flex items-center space-x-2 lg:space-x-3">
          <Clock className="w-3 h-3 lg:w-4 lg:h-4 text-white/50" />
          <span className="text-[10px] lg:text-xs text-white/80">Today, 2:00 PM</span>
        </div>
        <span className="text-[9px] lg:text-[10px] text-white/30">Low Traffic</span>
      </div>
      
      <motion.div 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.8, type: "spring" }}
        className="p-3 lg:p-4 border-2 border-orange-500/50 rounded-xl flex items-center justify-between bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.15)] relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/10 to-transparent animate-[shimmer_2s_infinite]" />
        <div className="relative z-10 flex items-center space-x-2 lg:space-x-3">
          <div className="p-1.5 lg:p-2 bg-orange-500/20 rounded-lg">
            <Calendar className="w-3 h-3 lg:w-4 lg:h-4 text-orange-400" />
          </div>
          <div>
            <div className="text-[11px] lg:text-sm font-bold text-white">Tomorrow, 10:30 AM</div>
            <div className="text-[9px] lg:text-[10px] text-orange-300 mt-0.5">Peak Audience Active</div>
          </div>
        </div>
        <div className="relative z-10 w-8 lg:w-10 h-4 lg:h-5 bg-orange-500 rounded-full flex items-center px-0.5 justify-end cursor-pointer shrink-0">
          <div className="w-3 h-3 lg:w-4 lg:h-4 bg-white rounded-full shadow-sm" />
        </div>
      </motion.div>
      
      <div className="p-2.5 lg:p-3 border border-white/5 rounded-xl flex items-center justify-between opacity-50 bg-white/5">
        <div className="flex items-center space-x-2 lg:space-x-3">
          <Clock className="w-3 h-3 lg:w-4 lg:h-4 text-white/50" />
          <span className="text-[10px] lg:text-xs text-white/80">Friday, 6:00 PM</span>
        </div>
        <span className="text-[9px] lg:text-[10px] text-white/30">Average</span>
      </div>
    </div>
  </div>
);

const GrowthMock = () => (
  <div className="space-y-4 lg:space-y-6 w-full px-1 lg:px-4">
    {/* Notification Toast */}
    <motion.div 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4, type: "spring" }}
      className="p-2.5 lg:p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center space-x-2 lg:space-x-3 backdrop-blur-md shadow-[0_4px_20px_rgba(52,211,153,0.15)]"
    >
      <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
        <Bell className="w-3 h-3 lg:w-4 lg:h-4 text-emerald-400" />
      </div>
      <div>
        <div className="text-[10px] lg:text-xs font-bold text-white">Viral Alert!</div>
        <div className="text-[9px] lg:text-[10px] text-emerald-200 mt-0.5">Your post hit the explore page.</div>
      </div>
    </motion.div>
    
    <div className="pt-1 lg:pt-2">
      <div className="flex justify-between items-end mb-4 lg:mb-6">
        <div>
          <div className="text-[9px] lg:text-[10px] text-white/50 uppercase tracking-wider mb-1">New Followers</div>
          <div className="text-2xl lg:text-4xl font-bold text-white">+1,248</div>
        </div>
        <div className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 px-2 py-1 lg:px-2.5 lg:py-1.5 rounded-lg border border-emerald-500/20">
          <ArrowUpRight className="w-3 h-3 lg:w-4 lg:h-4" />
          <span className="text-xs lg:text-sm font-bold">400%</span>
        </div>
      </div>
      
      {/* Hockey Stick Chart */}
      <div className="h-16 lg:h-24 w-full relative">
        {/* Fill Area */}
        <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(52, 211, 153, 0.4)" />
              <stop offset="100%" stopColor="rgba(52, 211, 153, 0)" />
            </linearGradient>
          </defs>
          <motion.path 
            d="M0,35 Q40,35 60,30 T100,5 L100,40 L0,40 Z" 
            fill="url(#growthGradient)" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
          />
          <motion.path 
            d="M0,35 Q40,35 60,30 T100,5" 
            fill="none" 
            stroke="#34d399" 
            strokeWidth="2.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeIn" }}
          />
          
          {/* Data Point Dots */}
          <motion.circle 
            cx="100" cy="5" r="2.5" 
            fill="#10b981" 
            stroke="#fff" 
            strokeWidth="1.5"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.5, type: "spring" }}
          />
        </svg>
      </div>
    </div>
  </div>
);

const VisualizerDashboard = ({ activeStep }: { activeStep: number }) => {
  return (
    <div className="relative w-full max-w-[280px] sm:max-w-[320px] lg:max-w-[420px] mx-auto aspect-square lg:aspect-square flex items-center justify-center mt-2 lg:mt-0">
      {/* Background Ambient Glow */}
      <motion.div
        animate={{ 
          backgroundColor: steps[activeStep].glowColor,
        }}
        transition={{ duration: 0.5 }}
        className="absolute w-full h-full md:blur-[80px] blur-[40px] opacity-30 pointer-events-none"
      />
      
      {/* Dashboard frame */}
      <div className="w-full h-full bg-[#0a0a0a] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden relative z-10">
        {/* Header */}
        <div className="h-8 lg:h-10 border-b border-white/10 flex items-center px-4 space-x-2 bg-black/60 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          <div className="ml-auto w-1/3 h-3 bg-white/5 rounded-full" />
        </div>
        
        {/* Content area */}
        <div className="flex-1 p-3 lg:p-6 relative flex flex-col justify-center items-center overflow-hidden">
          {/* Background grid */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNCkiLz48L3N2Zz4=')] [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)] pointer-events-none" />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 15, scale: 0.95, filter: 'blur(5px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -15, scale: 0.95, filter: 'blur(5px)' }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative z-10 w-full"
            >
              {activeStep === 0 && <CreateContentMock />}
              {activeStep === 1 && <AnalyticsMock />}
              {activeStep === 2 && <OptimizeMock />}
              {activeStep === 3 && <GrowthMock />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const StepCard = ({ 
  step, 
  index, 
  activeStep,
  setActiveStep
}: { 
  step: typeof steps[0], 
  index: number, 
  activeStep: number,
  setActiveStep: (idx: number) => void
}) => {
  const ref = useRef<HTMLDivElement>(null);
  
  // Detects when card is near the center to update the sticky visualizer
  const { scrollYProgress: spyProgress } = useScroll({
    target: ref,
    offset: ["start 75%", "end 25%"]
  });

  useMotionValueEvent(spyProgress, "change", (latest) => {
    if (latest > 0 && latest < 1) {
      setActiveStep(index);
    }
  });

  const isActive = activeStep === index;

  return (
    <motion.div 
      ref={ref}
      animate={{
        x: isActive ? 0 : 40,
        scale: isActive ? 1 : 0.85,
        opacity: isActive ? 1 : 0.4,
        boxShadow: isActive ? `0 15px 50px -20px ${step.glowColor}` : '0 0 0 0 rgba(0,0,0,0)'
      }}
      transition={{
        type: 'spring',
        stiffness: 180,
        damping: 18,
        mass: 1.2
      }}
      className={`relative p-6 md:p-8 rounded-[1.5rem] border snap-center
        ${isActive 
          ? 'bg-black/90 md:bg-white/[0.04] border-white/20 md:backdrop-blur-xl z-10' 
          : 'bg-black/40 md:bg-black/20 border-white/5 z-0'
        }`}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
        <div 
          className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl flex items-center justify-center border transition-colors duration-500"
          style={{ 
            borderColor: isActive ? step.accentColor : 'rgba(255,255,255,0.1)', 
            backgroundColor: isActive ? `${step.accentColor}15` : 'transparent',
            color: isActive ? step.accentColor : 'rgba(255,255,255,0.5)' 
          }}
        >
          <span className="text-sm md:text-base font-bold font-mono">{step.number}</span>
        </div>
        
        <div className="flex items-center gap-3">
          <step.icon 
            className="w-5 h-5 md:w-6 md:h-6 transition-colors duration-500" 
            style={{ color: isActive ? step.accentColor : 'rgba(255,255,255,0.3)' }} 
            strokeWidth={1.5}
          />
          <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            {step.title}
          </h3>
        </div>
      </div>
      
      <p className="text-sm md:text-base text-white/60 leading-relaxed md:ml-[4.5rem]">
        {step.description}
      </p>

      {/* Subtle glowing line at bottom of active card */}
      <div 
        className={`absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white to-transparent transition-all duration-700 ${isActive ? 'opacity-30 scale-x-100' : 'opacity-0 scale-x-0'}`}
        style={{ backgroundImage: `linear-gradient(to right, transparent, ${step.accentColor}, transparent)` }}
      />
    </motion.div>
  );
};

const GrowthEngineSection = () => {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section className="bg-black relative py-12 lg:py-24">
      {/* Background ambient noise */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")'
      }} />

      <div className="max-w-7xl mx-auto px-6 md:px-8 relative">
        
        {/* Mobile Title (Scrolls normally) */}
        <div className="lg:hidden mb-6 mt-4 text-center z-10 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400/80 animate-[pulse_2s_ease-in-out_infinite]" />
            <span className="text-[10px] font-medium text-white/60 tracking-wide uppercase">How It Works</span>
          </div>
          <h2 className="text-3xl font-bold leading-tight">
            <span className="text-white">Four steps to </span>
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              exponential growth
            </span>
          </h2>
        </div>

        <div className="flex flex-col lg:flex-row relative items-start gap-4 lg:gap-24">
          
          {/* LEFT COLUMN: Sticky Visualizer */}
          <div className="w-[calc(100%+48px)] lg:w-1/2 sticky top-[70px] lg:top-[15vh] flex flex-col justify-center items-center lg:items-start text-center lg:text-left z-20 lg:z-0 bg-black/95 backdrop-blur-2xl lg:bg-transparent pt-3 lg:pt-0 pb-4 lg:pb-0 border-b border-white/10 lg:border-none shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)] lg:shadow-none -mx-6 px-6 lg:mx-0 lg:w-full lg:px-0">
            {/* Desktop Title (Sticky) */}
            <div className="hidden lg:block lg:mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400/80 animate-[pulse_2s_ease-in-out_infinite]" />
                <span className="text-xs font-medium text-white/60 tracking-wide uppercase">How It Works</span>
              </div>
              
              <h2 className="text-4xl lg:text-5xl font-bold leading-tight">
                <span className="text-white">Four steps to </span>
                <br />
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  exponential growth
                </span>
              </h2>
            </div>
            
            <VisualizerDashboard activeStep={activeStep} />
          </div>

          {/* RIGHT COLUMN: Scrolling Cards */}
          <div className="w-full lg:w-1/2 relative flex flex-col gap-6 lg:gap-8 md:gap-[15vh] py-8 lg:py-[20vh] z-10">
            {steps.map((step, index) => (
              <StepCard 
                key={step.number} 
                step={step} 
                index={index} 
                activeStep={activeStep}
                setActiveStep={setActiveStep}
              />
            ))}
          </div>
          
        </div>
      </div>
    </section>
  );
};

export default GrowthEngineSection;
