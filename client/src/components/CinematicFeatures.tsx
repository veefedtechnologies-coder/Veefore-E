import { useRef, memo } from 'react';
import { motion, useScroll, useSpring, useTransform, MotionValue } from 'framer-motion';
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

// 1. Scroll Spring: Responsive but smooth tracking of the "snapped" scroll position
const scrollSpringConfig = { stiffness: 220, damping: 40, mass: 1 };

// 2. Transition Spring: Neutral, natural feel (not too fast, not too slow)
const transitionSpringConfig = { stiffness: 180, damping: 30, mass: 1 };

// Helper for mapping ranges (Removed as unused)

const Card = memo(({ feature, index, progress }: { feature: Feature, index: number, progress: MotionValue<number> }) => {
  // STEP-BASED LOGIC:
  // 1. Determine "Active Index" by rounding the continuous progress
  // 2. Set distinct target states based on whether this card is active, previous, or next
  // 3. Spring to those targets for smooth transitions

  const activeIndex = useTransform(progress, (v) => Math.round(v));

  // Target X Position (Carousel effect)
  const targetX = useTransform(activeIndex, (current) => {
    if (index === current) return 0;       // Active: Center
    if (index < current) return -20;       // Previous: Move Left (Exit) - Increased from -5 for better motion
    return 100;                            // Next: Far Right (Waiting)
  });
  const xSpring = useSpring(targetX as any, transitionSpringConfig);
  const x = useTransform(xSpring, (v) => `${v}vw`);

  // Target Scale
  const targetScale = useTransform(activeIndex, (current) => {
    return index === current ? 1 : 0.9;
  });
  const scale = useSpring(targetScale as any, transitionSpringConfig);

  // Target Opacity
  const targetOpacity = useTransform(activeIndex, (current) => {
    return index === current ? 1 : 0;
  });
  const opacity = useSpring(targetOpacity as any, transitionSpringConfig);

  // Target Z-Index (Instant, no spring needed)
  const zIndex = useTransform(activeIndex, (current) => {
    return index === current ? 10 : 0;
  });

  return (
    <motion.div
      style={{
        x,
        scale,
        opacity,
        zIndex,
        ...MOBILE_OPTIMIZED_LAYER
      }}
      className="absolute inset-0 h-screen w-screen flex items-center justify-center overflow-hidden bg-black"
    >
      {/* Background with blur effects restored */}
      <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-[0.08] blur-3xl`} />
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
            {/* Visual container with blur effects */}
            <div className="relative w-full h-auto bg-gradient-to-tr from-white/10 to-white/0 rounded-xl md:rounded-[2rem] border border-white/10 backdrop-blur-xl overflow-hidden shadow-2xl p-0.5 md:p-1 transform transition-transform hover:scale-[1.02] duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50 pointer-events-none" />
              <div className="w-full h-auto rounded-[0.7rem] md:rounded-[1.9rem] overflow-hidden flex items-center justify-center bg-black/60">
                <div className="w-full h-auto flex items-center justify-center">
                  {feature.visual}
                </div>
              </div>
            </div>

            {/* Glows with enhanced blur */}
            <div className={`absolute -top-10 -right-10 w-40 h-40 md:w-64 md:h-64 bg-gradient-to-br ${feature.gradient} rounded-full blur-[100px] md:blur-[150px] opacity-40 pointer-events-none`} />
            <div className={`absolute -bottom-10 -left-10 w-32 h-32 md:w-48 md:h-48 bg-gradient-to-tr ${feature.gradient} rounded-full blur-[80px] md:blur-[120px] opacity-30 pointer-events-none`} />
          </div>
        </div>
      </div>
    </motion.div>
  );
});

export const CinematicFeatures = ({ features }: CinematicFeaturesProps) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"]
  });

  // Snapped progress - creates "resistance" at each feature boundary
  // Ported to useTransform to avoid React re-renders
  const snappedProgress = useTransform(scrollYProgress, (latest: number) => {
    const total = features.length;
    if (total <= 1) return latest;

    const snapPoints = Array.from({ length: total }, (_, i) => i / (total - 1));
    const snapStrength = 0.5 / total; // Strongly increased strength for better locking

    // Find nearest snap point and apply resistance
    for (const snap of snapPoints) {
      const distToSnap = Math.abs(latest - snap);
      if (distToSnap < snapStrength) {
        const factor = distToSnap / snapStrength;
        const eased = factor * factor; // Quadratic easing for "sticky" feel
        return snap + (latest - snap > 0 ? 1 : -1) * eased * snapStrength;
      }
    }
    return latest;
  });

  // Optimized spring for mobile - higher stiffness = fewer solver iterations = better performance
  const snappedMotionValue = useSpring(snappedProgress, scrollSpringConfig);

  // Convert normalized progress (0-1) to Index Progress (0 - total-1)
  // We use this directly in Card to derive steps, AVOIDING double-springs
  const continuousIndex = useTransform(snappedMotionValue, v => v * (features.length - 1));

  // Reactive hint opacity
  const hintOpacity = useTransform(scrollYProgress, (v: number) => (v > 0.05 && v < 0.90) ? 1 : 0);

  return (
    <section ref={targetRef} className="relative" style={{ height: `${features.length * 200}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden bg-black">
        {features.map((feature, index) => (
          <Card
            key={feature.id}
            feature={feature}
            index={index}
            progress={continuousIndex}
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
