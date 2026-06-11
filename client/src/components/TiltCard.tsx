import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useIsMobile } from '../hooks/use-is-mobile';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  scale?: number;
  perspective?: number;
  disableTilt?: boolean;
}

/**
 * TiltCard Component
 * 
 * Implements 3D tilt effect that responds to mouse position.
 * - Calculates rotateX and rotateY based on mouse position relative to card center
 * - Uses spring physics for smooth return to neutral position (stiffness: 200, damping: 25)
 * - Automatically disabled on mobile devices for performance
 * 
 * Optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Custom comparison for children (by reference), maxTilt, scale, perspective, disableTilt
 * 
 * Requirements: 3.1, 3.2
 */
const TiltCard: React.FC<TiltCardProps> = React.memo(({
  children,
  className = '',
  maxTilt = 8,
  scale = 1.02,
  perspective = 1000,
  disableTilt = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Motion values for mouse position
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  // Spring configuration matching requirements (stiffness: 200, damping: 25)
  const springConfig = { stiffness: 200, damping: 25, mass: 1 };

  // Apply spring physics to rotation values for smooth return to neutral
  const rotateX = useSpring(
    useTransform(mouseY, [0, 1], [maxTilt, -maxTilt]),
    springConfig
  );
  const rotateY = useSpring(
    useTransform(mouseX, [0, 1], [-maxTilt, maxTilt]),
    springConfig
  );

  // Determine if tilt effect should be disabled
  const shouldDisableTilt = isMobile || disableTilt;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldDisableTilt || !ref.current) return;

    const rect = ref.current.getBoundingClientRect();

    // Calculate normalized mouse position relative to card center (0 to 1)
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    if (shouldDisableTilt) return;

    // Return to neutral position (center)
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective: shouldDisableTilt ? 'none' : `${perspective}px`,
        transformStyle: 'preserve-3d',
      }}
      whileHover={shouldDisableTilt ? {} : { scale }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        style={{
          rotateX: shouldDisableTilt ? 0 : rotateX,
          rotateY: shouldDisableTilt ? 0 : rotateY,
          transformStyle: 'preserve-3d',
          // GPU acceleration
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: re-render only if props that affect rendering change
  return prevProps.className === nextProps.className &&
         prevProps.maxTilt === nextProps.maxTilt &&
         prevProps.scale === nextProps.scale &&
         prevProps.perspective === nextProps.perspective &&
         prevProps.disableTilt === nextProps.disableTilt &&
         prevProps.children === nextProps.children; // Reference equality check for children
});

TiltCard.displayName = 'TiltCard';

export default TiltCard;
