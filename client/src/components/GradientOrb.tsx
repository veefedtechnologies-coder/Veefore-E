import React from 'react';

interface GradientOrbProps {
    className?: string;
    color?: 'blue' | 'purple' | 'indigo' | 'cyan';
    animate?: boolean; // Optional pulsing animation
}

/**
 * GradientOrb - Ambient gradient lighting effect for landing page sections
 * 
 * Features:
 * - GPU-accelerated CSS animations for optimal performance
 * - Configurable color variants (blue, purple, indigo, cyan) matching hero section palette
 * - Optional pulsing animation using pure CSS (no Framer Motion)
 * - Tailwind blur-3xl effect for smooth gradient blending
 * - Optimized for use in LiveDashboardSection and GrowthEngineSection backgrounds
 * 
 * Requirements: 8.1, 8.5, 7.4 (CSS animations for continuous effects)
 */
const GradientOrb: React.FC<GradientOrbProps> = ({ 
    className = '', 
    color = 'blue',
    animate = false
}) => {
    // Gradient color definitions matching hero section color palette
    const gradientStyles: Record<string, string> = {
        blue: 'bg-blue-400/40',      // #60a5fa - Primary blue from hero
        purple: 'bg-purple-400/40',  // #a78bfa - Purple accent from hero
        indigo: 'bg-indigo-400/40',  // #818cf8 - Indigo from hero
        cyan: 'bg-cyan-400/40',      // #22d3ee - Cyan accent
    };

    const bgClass = gradientStyles[color] || gradientStyles.blue;

    return (
        <div
            className={`absolute rounded-full blur-3xl ${bgClass} ${className} ${animate ? 'animate-[orb-pulse_4s_ease-in-out_infinite]' : ''}`}
            style={{
                transform: 'translateZ(0)',
                willChange: animate ? 'transform, opacity' : 'auto',
                backfaceVisibility: 'hidden',
            }}
            aria-hidden="true"
        />
    );
};

export default GradientOrb;
