import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * FloatingStatusBadge Component
 * 
 * Animated status indicators that float around the dashboard section.
 * Features:
 * - Initial fade-in animation using CSS (opacity 0→1, y 20→0)
 * - Continuous breathing animation using CSS keyframes (scale 1→1.02→1)
 * - Glass morphism styling with backdrop blur
 * - Configurable position and color
 * - GPU-accelerated for optimal performance
 * - Respects prefers-reduced-motion
 * 
 * Optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Custom comparison for text, icon, position, color, and animationDelay
 * 
 * Requirements: 7.5, 10.6, 7.4 (CSS animations for continuous effects)
 */

interface FloatingStatusBadgeProps {
  /** Text content to display */
  text: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Absolute positioning coordinates */
  position: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  /** Color theme for icon and border */
  color: 'blue' | 'green' | 'purple';
  /** Optional delay before animation starts (in seconds) */
  animationDelay?: number;
}

const FloatingStatusBadge: React.FC<FloatingStatusBadgeProps> = React.memo(({
  text,
  icon: Icon,
  position,
  color,
  animationDelay = 0,
}) => {
  // Color mapping for different badge types
  const colorMap = {
    blue: {
      icon: 'text-blue-400',
      text: 'text-blue-300',
      gradient: 'from-blue-500/20 to-indigo-500/20',
      border: 'border-blue-500/30',
    },
    green: {
      icon: 'text-green-400',
      text: 'text-green-300',
      gradient: 'from-green-500/20 to-emerald-500/20',
      border: 'border-green-500/30',
    },
    purple: {
      icon: 'text-purple-400',
      text: 'text-purple-300',
      gradient: 'from-purple-500/20 to-pink-500/20',
      border: 'border-purple-500/30',
    },
  };

  const colors = colorMap[color];

  return (
    <div
      className={`absolute px-3 py-2 rounded-full bg-black/60 backdrop-blur-md border ${colors.border} flex items-center gap-2 z-20
        animate-[fade-in-up_0.8s_ease-out_forwards,breathing_3s_ease-in-out_infinite]`}
      style={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        right: position.right,
        animationDelay: `${animationDelay}s, ${animationDelay + 0.8}s`,
        opacity: 0, // Start hidden, CSS animation will fade in
        transform: 'translateZ(0)',
        willChange: 'transform, opacity',
        backfaceVisibility: 'hidden',
      }}
      role="status"
      aria-label={`Status: ${text}`}
      aria-live="polite"
    >
      <Icon className={`w-4 h-4 ${colors.icon}`} aria-hidden="true" />
      <span className={`text-xs ${colors.text} font-medium`}>{text}</span>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: re-render only if any prop changes
  // Deep equality check for position object
  const positionEqual = prevProps.position.top === nextProps.position.top &&
                       prevProps.position.bottom === nextProps.position.bottom &&
                       prevProps.position.left === nextProps.position.left &&
                       prevProps.position.right === nextProps.position.right;
  
  return prevProps.text === nextProps.text &&
         prevProps.icon === nextProps.icon &&
         prevProps.color === nextProps.color &&
         prevProps.animationDelay === nextProps.animationDelay &&
         positionEqual;
});

FloatingStatusBadge.displayName = 'FloatingStatusBadge';

export default FloatingStatusBadge;
