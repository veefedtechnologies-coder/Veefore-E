import { useRef, memo, useState } from 'react';
import { motion, useScroll, useSpring, useTransform, MotionValue, useMotionValueEvent } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { ScrollHint } from './ui/ScrollHint';

interface Feature {
  id: string;
  title: string;
  tagline: string;
  description: string;
  details: string[];
  gradient: string;
  visual: React.ReactNode;
}

interface CinematicFeaturesProps {
  features: Feature[];
}

const Card = memo(({ feature, index, activeIndex }: { feature: Feature, index: number, activeIndex: MotionValue<number> }) => {
  const targetX = useTransform(activeIndex, (current: number) => {
    if (index === current) return 0;
    if (index < current) return -5; 
    return 100;
  });

  const x = useSpring(targetX, {
    stiffness: 50,
    damping: 20,
    mass: 0.8
  });

  const xWithUnits = useTransform(x, (value) => `${value}vw`);

  const scale = useSpring(
    useTransform(activeIndex, (current: number) => {
      if (index < current) return 0.9; 
      if (index > current) return 1.1; // Parallax scale for incoming
      return 1;
    }),
    { stiffness: 50, damping: 20 }
  );
  
  const opacity = useSpring(
    useTransform(activeIndex, (current: number) => {
      if (index < current) return 0; // Fade out completely
      if (index > current) return 0; // Incoming starts invisible
      return 1;
    }),
    { stiffness: 50, damping: 20 }
  );

  const zIndex = useTransform(activeIndex, (current: number) => {
    if (index === current) return 10;
    if (index > current) return 5; 
    return 0; 
  });

  return (
    <motion.div 
      style={{ x: xWithUnits, zIndex, scale, opacity }}
      className="absolute inset-0 h-screen w-screen flex items-center justify-center overflow-hidden bg-black will-change-transform"
    >
      {/* Optimized Backgrounds: removed heavy blur for better performance */}
      <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-[0.05]`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000_100%)]" />

      {/* Responsive Container */}
      <div className="relative w-full h-full max-w-[1400px] mx-auto p-6 pt-20 md:p-12 md:pt-28 flex flex-col justify-center">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center h-full max-h-[800px]">
          
          {/* Left: Text Content */}
          <div className="flex flex-col justify-center order-2 lg:order-1 z-10">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 w-fit mb-4 md:mb-6 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] md:text-xs font-bold tracking-widest text-white/60 uppercase">Feature 0{index + 1}</span>
              </div>

              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6 leading-tight drop-shadow-lg">
                {feature.title}
              </h2>
              
              <p className="text-lg md:text-xl lg:text-xl text-white/80 mb-6 md:mb-8 font-light leading-relaxed">
                {feature.tagline}
              </p>

              <div className="p-5 md:p-8 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md shadow-xl">
                <p className="text-white/80 mb-6 leading-relaxed text-sm md:text-lg">
                  {feature.description}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  {feature.details.map((detail, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-400 shrink-0" />
                      <span className="text-xs md:text-sm text-white/70">{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
          </div>

          {/* Right: Visual Content */}
          {/* Fixed aspect ratio container that scales with screen width */}
          <div className="relative w-full h-auto aspect-auto md:max-h-[60vh] order-1 lg:order-2 flex items-center justify-center z-10 mb-6 md:mb-0">
            {/* Removed backdrop-blur-xl and reduced to md for performance */}
            <div className="relative w-full h-auto bg-gradient-to-tr from-white/10 to-white/0 rounded-xl md:rounded-[2rem] border border-white/10 backdrop-blur-md overflow-hidden shadow-2xl p-0.5 md:p-1 transform transition-transform hover:scale-[1.02] duration-500 will-change-transform">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50 pointer-events-none" />
                <div className="w-full h-auto rounded-[0.7rem] md:rounded-[1.9rem] overflow-hidden flex items-center justify-center bg-black/60">
                  <div className="w-full h-auto flex items-center justify-center">
                      {feature.visual}
                  </div>
                </div>
            </div>
            
            {/* Glows */}
            <div className={`absolute -top-10 -right-10 w-40 h-40 md:w-64 md:h-64 bg-gradient-to-br ${feature.gradient} rounded-full blur-[80px] md:blur-[100px] opacity-30 pointer-events-none`} />
          </div>
        </div>
      </div>
    </motion.div>
  );
});

export const CinematicFeatures = ({ features }: CinematicFeaturesProps) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const [showHint, setShowHint] = useState(true);
  
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"]
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 30,
    damping: 25,
    mass: 1.2
  });

  useMotionValueEvent(smoothProgress, "change", (latest) => {
    // Show hint while section is locked on screen (between 5% and 90% progress)
    if (latest > 0.05 && latest < 0.90) setShowHint(true);
    else setShowHint(false);
  });

  const activeIndex = useTransform(smoothProgress, (value) => {
    const total = features.length;
    const raw = value * total;
    return Math.min(Math.floor(raw), total - 1);
  });

  return (
    <section ref={targetRef} className="relative" style={{ height: `${features.length * 180}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden bg-black">
        {features.map((feature, index) => (
          <Card 
            key={feature.id} 
            feature={feature} 
            index={index} 
            activeIndex={activeIndex}
          />
        ))}
        
        {showHint && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <ScrollHint />
          </motion.div>
        )}
      </div>
    </section>
  );
};
