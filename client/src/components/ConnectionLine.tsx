import React from 'react';

interface ConnectionLineProps {
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
  delay: number;
}

/**
 * ConnectionLine Component
 * 
 * Renders an animated SVG line connecting feature cards to the center orb
 * with a shimmer effect that travels along the line.
 * 
 * Features:
 * - Linear gradient with shimmer animation
 * - Stroke-dasharray for dashed line effect
 * - Traveling light effect using animated gradient offset (2s infinite)
 * - Calculates line coordinates based on card and orb positions
 * 
 * Optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Custom comparison for startPos, endPos, and delay
 * 
 * @param startPos - Starting coordinates of the line (feature card position)
 * @param endPos - Ending coordinates of the line (center orb position)
 * @param delay - Animation delay for staggered effect
 */
const ConnectionLine: React.FC<ConnectionLineProps> = React.memo(({ startPos, endPos, delay }) => {
  const gradientId = `shimmer-${delay}`;
  
  return (
    <svg 
      className="absolute inset-0 pointer-events-none w-full h-full" 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%',
        zIndex: 0,
        transform: 'translateZ(0)',
        willChange: 'auto',
        backfaceVisibility: 'hidden',
      }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="40%" stopColor="transparent" />
          <stop offset="50%" stopColor="rgba(99, 102, 241, 0.6)" />
          <stop offset="60%" stopColor="transparent" />
          <stop offset="100%" stopColor="transparent" />
          <animate
            attributeName="x1"
            values="-100%;200%"
            dur="2s"
            repeatCount="indefinite"
            begin={`${delay}s`}
          />
          <animate
            attributeName="x2"
            values="0%;300%"
            dur="2s"
            repeatCount="indefinite"
            begin={`${delay}s`}
          />
        </linearGradient>
      </defs>
      
      {/* Base dashed line */}
      <line
        x1={startPos.x}
        y1={startPos.y}
        x2={endPos.x}
        y2={endPos.y}
        stroke="rgba(255, 255, 255, 0.05)"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      
      {/* Animated shimmer line */}
      <line
        x1={startPos.x}
        y1={startPos.y}
        x2={endPos.x}
        y2={endPos.y}
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
    </svg>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: re-render only if coordinates or delay change
  return prevProps.startPos.x === nextProps.startPos.x &&
         prevProps.startPos.y === nextProps.startPos.y &&
         prevProps.endPos.x === nextProps.endPos.x &&
         prevProps.endPos.y === nextProps.endPos.y &&
         prevProps.delay === nextProps.delay;
});

ConnectionLine.displayName = 'ConnectionLine';

export default ConnectionLine;
