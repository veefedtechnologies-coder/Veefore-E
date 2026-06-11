import { useRef, memo, useState, useEffect } from 'react';
import { motion, useScroll, useSpring, useTransform, useMotionValueEvent } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { ScrollHint } from './ui/ScrollHint';
import { GPU_ACCELERATED_STYLES, MOBILE_OPTIMIZED_LAYER } from '../lib/animation-performance';

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

// Luxurious, smooth spring for visible sliding transitions (matched to StickyScrollFeaturesV2)
const luxuriousSpringConfig = { stiffness: 70, damping: 20, mass: 1.2 };

const Card = memo(({ feature, index, activeFeature }: { feature: Feature, index: number, activeFeature: number }) => {
  const isPast = index < activeFeature;
  const isUpcoming = index > activeFeature;
  const isActive = index === activeFeature;

  // Target values
  const targetX = isActive ? 0 : isPast ? -120 : 120;
  const targetY = isActive ? 0 : isPast ? -30 : 30;
  const targetScale = isActive ? 1 : 0.95;
  const targetOpacity = isActive ? 1 : 0;
  const zIndex = isPast ? 30 : isActive ? 20 : 10;

  // Springs
  const xSpring = useSpring(targetX, luxuriousSpringConfig);
  const ySpring = useSpring(targetY, luxuriousSpringConfig);
  const scale = useSpring(targetScale, luxuriousSpringConfig);
  const opacity = useSpring(targetOpacity, luxuriousSpringConfig);

  const x = useTransform(xSpring, (v) => `${v}vw`);
  const y = useTransform(ySpring, (v) => `${v}px`);

  // useSpring does not automatically react to primitive changes. We must manually set it.
  useEffect(() => {
    xSpring.set(targetX);
    ySpring.set(targetY);
    scale.set(targetScale);
    opacity.set(targetOpacity);
  }, [targetX, targetY, targetScale, targetOpacity]);

  return (
    <motion.div
      style={{
        scale,
        zIndex,
        pointerEvents: isActive ? 'auto' : 'none',
        ...MOBILE_OPTIMIZED_LAYER
      }}
      className="absolute inset-0 h-[100dvh] w-full flex items-center justify-center overflow-hidden"
    >
      {/* Background with blur effects restored */}
      <motion.div style={{ opacity }} className="absolute inset-0 pointer-events-none">
        <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-[0.08] blur-xl md:blur-3xl`} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000_100%)]" />
      </motion.div>

      {/* Responsive Container */}
      <div className="relative w-full h-full max-w-[1400px] mx-auto p-3 pt-4 pb-8 sm:p-4 sm:pt-10 sm:pb-16 md:p-12 md:pt-28 flex flex-col justify-center overflow-y-auto md:overflow-hidden">
        <div className="grid lg:grid-cols-2 gap-2 sm:gap-4 md:gap-8 lg:gap-16 items-center min-h-min md:h-full md:max-h-[800px]">

          {/* Left: Text Content */}
          <motion.div 
            style={{ y, opacity }}
            className="flex flex-col justify-center order-2 lg:order-1 z-10 mt-2 sm:mt-4 md:mt-0"
          >
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-black/80 md:bg-white/5 border border-white/10 w-fit mb-2 sm:mb-4 md:mb-6 md:backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] md:text-xs font-bold tracking-widest text-white/60 uppercase">Feature 0{index + 1}</span>
            </div>

            <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-1.5 sm:mb-2 md:mb-6 leading-tight drop-shadow-lg">
              {feature.title}
            </h2>

            <p className="text-sm sm:text-lg md:text-xl lg:text-xl text-white/80 mb-3 sm:mb-6 md:mb-8 font-light leading-relaxed">
              {feature.tagline}
            </p>

            <div className="p-3 sm:p-4 md:p-8 rounded-2xl bg-black/90 md:bg-black/40 border border-white/10 md:backdrop-blur-md shadow-xl">
              <p className="text-white/80 mb-3 sm:mb-4 md:mb-6 leading-relaxed text-xs md:text-lg">
                {feature.description}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                {feature.details.map((detail, i) => (
                  <div key={i} className="flex items-center space-x-2.5 sm:space-x-3">
                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-green-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs md:text-sm text-white/70 leading-snug">{detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right: Visual Content */}
          {/* Allow visual container to fit content naturally on mobile to avoid overflow clipping */}
          <motion.div 
            style={{ x }}
            className="relative w-full h-auto max-h-[45vh] md:max-h-[60vh] order-1 lg:order-2 flex items-center justify-center z-30 mb-1 sm:mb-2 md:mb-0"
          >
            {/* Visual container with blur effects */}
            <div className="relative w-full max-w-[400px] md:max-w-none h-auto bg-gradient-to-tr from-white/10 to-white/0 rounded-xl md:rounded-[2rem] border border-white/10 bg-black/50 md:bg-transparent md:backdrop-blur-xl overflow-hidden shadow-2xl p-0.5 md:p-1 transform transition-transform hover:scale-[1.02] duration-500 mx-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50 pointer-events-none" />
              <div className="w-full h-auto rounded-[0.7rem] md:rounded-[1.9rem] overflow-hidden flex items-center justify-center bg-black/60">
                <div className="w-full h-auto flex items-center justify-center">
                  {feature.visual}
                </div>
              </div>
            </div>

            {/* Glows with enhanced blur */}
            <div className={`absolute -top-10 -right-10 w-40 h-40 md:w-64 md:h-64 bg-gradient-to-br ${feature.gradient} rounded-full blur-[40px] md:blur-[150px] opacity-40 pointer-events-none`} />
            <div className={`absolute -bottom-10 -left-10 w-32 h-32 md:w-48 md:h-48 bg-gradient-to-tr ${feature.gradient} rounded-full blur-[40px] md:blur-[120px] opacity-30 pointer-events-none`} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
});

export const CinematicFeatures = ({ features }: CinematicFeaturesProps) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  const [targetFeature, setTargetFeature] = useState(0);
  const lastTransitionTimeRef = useRef(0);

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"]
  });

  // Update target feature based instantly on physical scroll
  const activeFeatureIndex = useTransform(scrollYProgress, (latest) => {
    const clamped = Math.max(0, Math.min(1, latest));
    const total = features.length;
    if (total === 3) {
      // Even distribution: 33% for each item
      return clamped < 0.33 ? 0 : clamped < 0.66 ? 1 : 2;
    }
    return Math.min(total - 1, Math.floor(clamped * total));
  });

  useMotionValueEvent(activeFeatureIndex, "change", (latest) => {
    setTargetFeature(latest);
  });

  // Rate-limited sequential transition: forces the UI to visit every step even if the user scrolls instantly
  useEffect(() => {
    if (activeFeature !== targetFeature) {
      const now = Date.now();
      const timeSinceLast = now - lastTransitionTimeRef.current;
      const delay = Math.max(0, 600 - timeSinceLast);

      const timer = setTimeout(() => {
        lastTransitionTimeRef.current = Date.now();
        setActiveFeature(prev => prev < targetFeature ? prev + 1 : prev - 1);
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [activeFeature, targetFeature]);

  // Reactive hint opacity
  const hintOpacity = useTransform(scrollYProgress, (v: number) => (v > 0.05 && v < 0.90) ? 1 : 0);

  return (
    <section ref={targetRef} className="relative" style={{ height: `${features.length * 150}vh` }}>
      <div className="sticky top-0 h-[100dvh] overflow-hidden bg-black">
        {features.map((feature, index) => (
          <Card
            key={feature.id}
            feature={feature}
            index={index}
            activeFeature={activeFeature}
          />
        ))}

        <motion.div
          style={{ opacity: hintOpacity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none z-50 mix-blend-difference"
        >
          <ScrollHint />
        </motion.div>
      </div>
    </section>
  );
};
