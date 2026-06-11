import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useIsMobile } from '../hooks/use-is-mobile';

interface MagneticButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * MagneticButton Component
 * 
 * A button with magnetic pull effect that follows the cursor position.
 * Calculates offset based on cursor distance from button center (0.15x multiplier).
 * Uses spring physics for smooth animation (stiffness: 300, damping: 20).
 * Automatically disables magnetic effect on mobile devices for better performance.
 * 
 * Optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Custom comparison for children (by reference) and onClick handler
 * 
 * Requirements: 3.1, 3.2
 * 
 * @param children - Button content
 * @param className - Optional CSS classes to apply to the button
 * @param onClick - Optional click handler
 */
const MagneticButton: React.FC<MagneticButtonProps> = React.memo(({ 
  children, 
  className = '', 
  onClick 
}) => {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLButtonElement>(null);
  
  // Motion values for x and y offset
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  // Apply spring configuration as specified: stiffness: 300, damping: 20
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  /**
   * Handle mouse move to calculate magnetic pull effect
   * Calculates offset based on cursor distance from button center with 0.15x multiplier
   */
  const handleMouseMove = (e: React.MouseEvent) => {
    // Disable magnetic effect on mobile devices
    if (isMobile || !ref.current) return;
    
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate offset with 0.15x multiplier as specified
    x.set((e.clientX - centerX) * 0.15);
    y.set((e.clientY - centerY) * 0.15);
  };

  /**
   * Reset button position when mouse leaves
   */
  const handleMouseLeave = () => {
    // Disable magnetic effect on mobile devices
    if (isMobile) return;
    
    x.set(0);
    y.set(0);
  };

  // Render static button on mobile for better performance
  if (isMobile) {
    return (
      <button 
        ref={ref} 
        onClick={onClick} 
        className={className}
      >
        {children}
      </button>
    );
  }

  // Render animated button on desktop with GPU acceleration
  return (
    <motion.button
      ref={ref}
      style={{ 
        x: springX, 
        y: springY,
        transform: 'translateZ(0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.button>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: re-render only if className, children, or onClick handler changes
  return prevProps.className === nextProps.className &&
         prevProps.children === nextProps.children &&
         prevProps.onClick === nextProps.onClick;
});

MagneticButton.displayName = 'MagneticButton';

export default MagneticButton;
