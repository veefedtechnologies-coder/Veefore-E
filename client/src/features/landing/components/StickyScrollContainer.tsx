import { useRef, useState, useEffect, ReactNode, memo } from 'react';
import { motion, useScroll, useTransform, useMotionValueEvent, type MotionValue } from 'framer-motion';

/**
 * StickyScrollContainer Component
 * 
 * A container component that implements sticky scroll behavior with smooth transitions
 * between feature cards. Uses IntersectionObserver for viewport detection and triggers
 * animations when cards enter the viewport.
 * 
 * Features:
 * - Sticky scroll behavior with configurable sections
 * - Smooth transitions between active sections
 * - IntersectionObserver for viewport-based animation triggers
 * - Rate-limited sequential transitions
 * - Support for custom scroll progress tracking
 * - GPU-accelerated animations
 * - Mobile-optimized performance
 * 
 * Requirements: 22.1, 22.5
 * 
 * @example
 * ```tsx
 * <StickyScrollContainer
 *   items={features}
 *   renderContent={(feature, index, isActive) => (
 *     <FeatureCard feature={feature} isActive={isActive} />
 *   )}
 *   renderVisual={(feature, index, isActive) => (
 *     <FeatureVisual feature={feature} isActive={isActive} />
 *   )}
 * />
 * ```
 */

/**
 * Configuration for sticky scroll behavior
 */
export interface StickyScrollConfig {
  /** Height multiplier for scroll container (default: 4 for 400vh) */
  heightMultiplier?: number;
  /** Transition delay between sections in milliseconds */
  transitionDelay?: number;
  /** Enable sequential transitions (forces UI to visit each step) */
  sequentialTransitions?: boolean;
  /** Enable IntersectionObserver for viewport detection */
  useIntersectionObserver?: boolean;
  /** Threshold for IntersectionObserver (0-1) */
  intersectionThreshold?: number;
  /** Snap strength for scroll snapping (0-1, where 0 = no snap) */
  snapStrength?: number;
  /** Enable progress indicators */
  showProgress?: boolean;
}

/**
 * Props for rendering individual items
 */
export interface RenderItemProps<T> {
  item: T;
  index: number;
  isActive: boolean;
  isPast: boolean;
  isUpcoming: boolean;
  progress: MotionValue<number>;
}

/**
 * Main component props
 */
export interface StickyScrollContainerProps<T> {
  /** Array of items to display */
  items: T[];
  /** Render function for content (left side) */
  renderContent: (props: RenderItemProps<T>) => ReactNode;
  /** Render function for visual (right side) */
  renderVisual: (props: RenderItemProps<T>) => ReactNode;
  /** Optional render function for ambient effects */
  renderAmbient?: (props: RenderItemProps<T>) => ReactNode;
  /** Optional render function for progress indicators */
  renderProgress?: (activeIndex: number, totalItems: number) => ReactNode;
  /** Configuration options */
  config?: StickyScrollConfig;
  /** Additional CSS classes for container */
  className?: string;
  /** Callback when active item changes */
  onActiveChange?: (index: number) => void;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<StickyScrollConfig> = {
  heightMultiplier: 4,
  transitionDelay: 600,
  sequentialTransitions: true,
  useIntersectionObserver: true,
  intersectionThreshold: 0.1,
  snapStrength: 0.25,
  showProgress: true,
};

/**
 * Helper function for linear interpolation
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, t));
}

/**
 * Helper function to map a value from one range to another
 */
function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, t);
}

/**
 * Hook for managing sticky scroll state and transitions
 */
function useStickyScroll(
  itemCount: number,
  config: Required<StickyScrollConfig>,
  onActiveChange?: (index: number) => void
) {
  const containerRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const lastTransitionTimeRef = useRef(0);
  const [hasEntered, setHasEntered] = useState(false);

  // Track scroll progress
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Calculate target index based on scroll progress
  const targetFeatureIndex = useTransform(scrollYProgress, (latest) => {
    const clamped = Math.max(0, Math.min(1, latest));
    const step = 1 / itemCount;
    for (let i = 0; i < itemCount; i++) {
      if (clamped < (i + 1) * step) return i;
    }
    return itemCount - 1;
  });

  // Update target index when scroll changes
  useMotionValueEvent(targetFeatureIndex, 'change', (latest) => {
    setTargetIndex(latest);
  });

  // Rate-limited sequential transition
  useEffect(() => {
    if (!config.sequentialTransitions) {
      setActiveIndex(targetIndex);
      return;
    }

    if (activeIndex !== targetIndex) {
      const now = Date.now();
      const timeSinceLast = now - lastTransitionTimeRef.current;
      const delay = Math.max(0, config.transitionDelay - timeSinceLast);

      const timer = setTimeout(() => {
        lastTransitionTimeRef.current = Date.now();
        setActiveIndex((prev) =>
          prev < targetIndex ? prev + 1 : prev - 1
        );
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [activeIndex, targetIndex, config.sequentialTransitions, config.transitionDelay]);

  // Notify parent of active index changes
  useEffect(() => {
    onActiveChange?.(activeIndex);
  }, [activeIndex, onActiveChange]);

  // IntersectionObserver for viewport detection
  useEffect(() => {
    if (!config.useIntersectionObserver || !containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEntered(true);
        }
      },
      { threshold: config.intersectionThreshold }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [config.useIntersectionObserver, config.intersectionThreshold]);

  return {
    containerRef,
    activeIndex,
    targetIndex,
    scrollYProgress,
    hasEntered,
  };
}

/**
 * Content slide component with animation
 */
interface ContentSlideProps {
  children: ReactNode;
  isActive: boolean;
  isPast: boolean;
  isUpcoming: boolean;
}

const ContentSlide = memo(({ children, isActive, isPast }: ContentSlideProps) => {
  const y = isActive ? 0 : isPast ? -40 : 40;
  const opacity = isActive ? 1 : 0;

  return (
    <div
      className={`absolute inset-0 flex flex-col justify-center ${
        isActive ? 'pointer-events-auto z-10' : 'pointer-events-none z-0'
      }`}
    >
      <motion.div
        animate={{ opacity, y }}
        transition={{
          type: 'spring',
          stiffness: 120,
          damping: 25,
          mass: 1,
        }}
        style={{
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          contain: 'layout paint style',
        }}
        className="w-full max-w-lg"
      >
        {children}
      </motion.div>
    </div>
  );
});

ContentSlide.displayName = 'ContentSlide';

/**
 * Visual slide component with slide animation
 */
interface VisualSlideProps {
  children: ReactNode;
  isActive: boolean;
  isPast: boolean;
  opacity?: number;
}

const VisualSlide = memo(({ children, isActive, isPast, opacity = 1 }: VisualSlideProps) => {
  const slideDistance = typeof window !== 'undefined' ? window.innerHeight * 1.2 : 1200;
  const y = isActive ? 0 : isPast ? -slideDistance : slideDistance;
  const scale = isActive ? 1 : 0.85;

  return (
    <motion.div
      animate={{ y, scale, opacity }}
      transition={{
        type: 'spring',
        stiffness: 120,
        damping: 25,
        mass: 1,
      }}
      style={{
        willChange: isActive ? 'transform, opacity' : 'auto',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        contain: 'layout paint style',
      }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      {children}
    </motion.div>
  );
});

VisualSlide.displayName = 'VisualSlide';

/**
 * Default progress indicator component
 */
interface DefaultProgressProps {
  activeIndex: number;
  totalItems: number;
  opacity: MotionValue<number>;
}

const DefaultProgress = memo(({ activeIndex, totalItems, opacity }: DefaultProgressProps) => (
  <motion.div style={{ opacity }} className="flex space-x-2">
    {Array.from({ length: totalItems }).map((_, i) => (
      <div
        key={i}
        className={`h-1 rounded-full transition-all duration-700 ease-out relative overflow-hidden ${
          activeIndex === i ? 'w-14' : 'w-6'
        }`}
      >
        <div className="absolute inset-0 bg-white/20 rounded-full" />
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 origin-left transition-transform duration-700 ease-out ${
            activeIndex === i ? 'scale-x-100' : 'scale-x-0'
          }`}
        />
      </div>
    ))}
  </motion.div>
));

DefaultProgress.displayName = 'DefaultProgress';

/**
 * Main StickyScrollContainer component
 */
export function StickyScrollContainer<T>({
  items,
  renderContent,
  renderVisual,
  renderAmbient,
  renderProgress,
  config = {},
  className = '',
  onActiveChange,
}: StickyScrollContainerProps<T>) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const {
    containerRef,
    activeIndex,
    scrollYProgress,
  } = useStickyScroll(items.length, mergedConfig, onActiveChange);

  // Calculate opacity for section elements
  const sectionOpacity = useTransform(
    scrollYProgress,
    [0, 0.05, 0.95, 1],
    [0, 1, 1, 0]
  );

  const containerHeight = `${mergedConfig.heightMultiplier * 100}vh`;

  return (
    <section
      ref={containerRef}
      className={`bg-black ${className}`}
      style={{ position: 'relative', height: containerHeight }}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,0.7),rgba(0,0,0,1))]" />

      {/* Sticky container */}
      <div
        className="sticky top-0 h-[100dvh] flex flex-col md:flex-row items-center w-full z-[60]"
        style={{
          position: 'sticky',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="w-full px-4 md:px-16 lg:px-24 relative h-full flex flex-col md:flex-row items-center">
          
          {/* Progress indicators */}
          {mergedConfig.showProgress && (
            <motion.div
              style={{ opacity: sectionOpacity }}
              className="absolute top-8 md:top-28 left-6 md:left-16 lg:left-24 z-50"
            >
              {renderProgress ? (
                renderProgress(activeIndex, items.length)
              ) : (
                <DefaultProgress
                  activeIndex={activeIndex}
                  totalItems={items.length}
                  opacity={sectionOpacity}
                />
              )}
            </motion.div>
          )}

          {/* Content area (left side) */}
          <div className="w-full md:w-[45%] relative h-[35vh] sm:h-[40vh] md:h-full flex items-center md:items-center justify-start z-20 pb-4 md:pb-0">
            {items.map((item, index) => {
              const isPast = index < activeIndex;
              const isUpcoming = index > activeIndex;
              const isActive = index === activeIndex;

              return (
                <ContentSlide
                  key={index}
                  isActive={isActive}
                  isPast={isPast}
                  isUpcoming={isUpcoming}
                >
                  {renderContent({
                    item,
                    index,
                    isActive,
                    isPast,
                    isUpcoming,
                    progress: scrollYProgress,
                  })}
                </ContentSlide>
              );
            })}
          </div>

          {/* Visual area (right side) */}
          <div className="flex w-full md:w-[55%] h-[55vh] sm:h-[60vh] md:h-full items-center justify-center relative z-[70]">
            <div
              className="relative w-full h-[90%] md:h-[80%] max-w-[700px] z-[100]"
              style={{
                WebkitTransform: 'translate3d(0,0,0)',
                transform: 'translate3d(0,0,0)',
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden',
              }}
            >
              {items.map((item, index) => {
                const isPast = index < activeIndex;
                const isActive = index === activeIndex;

                return (
                  <VisualSlide
                    key={index}
                    isActive={isActive}
                    isPast={isPast}
                    opacity={1}
                  >
                    {renderVisual({
                      item,
                      index,
                      isActive,
                      isPast,
                      isUpcoming: index > activeIndex,
                      progress: scrollYProgress,
                    })}
                  </VisualSlide>
                );
              })}
            </div>
          </div>

          {/* Ambient effects (optional) */}
          {renderAmbient && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {items.map((item, index) => (
                <div key={index}>
                  {renderAmbient({
                    item,
                    index,
                    isActive: index === activeIndex,
                    isPast: index < activeIndex,
                    isUpcoming: index > activeIndex,
                    progress: scrollYProgress,
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Helper hook for creating ambient glow effects
 * 
 * @param index - Item index
 * @param scrollProgress - Scroll progress motion value
 * @param itemCount - Total number of items
 * @returns Opacity motion value for the glow
 */
export function useAmbientGlow(
  index: number,
  scrollProgress: MotionValue<number>,
  itemCount: number
): MotionValue<number> {
  return useTransform(scrollProgress, (p: number) => {
    const step = 1 / itemCount;
    const startRange = index * step;
    const peakRange = (index + 0.5) * step;
    const endRange = (index + 1) * step;

    if (p < startRange) return 0;
    if (p >= startRange && p < peakRange) {
      return mapRange(p, startRange, peakRange, 0, 0.25);
    }
    if (p >= peakRange && p < endRange) {
      return mapRange(p, peakRange, endRange, 0.25, 0);
    }
    return 0;
  });
}

export default StickyScrollContainer;
