import React from 'react';

interface GradientOrbProps {
    className?: string;
    color?: 'blue' | 'purple' | 'cyan' | 'pink' | 'rose' | 'green' | 'teal';
    gradient?: string;
}

// Rich radial gradient colors for premium ambient lighting
const gradientStyles = {
    blue: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(37, 99, 235, 0.2) 50%, transparent 70%)',
    purple: 'radial-gradient(circle, rgba(147, 51, 234, 0.4) 0%, rgba(126, 34, 206, 0.2) 50%, transparent 70%)',
    cyan: 'radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, rgba(14, 165, 233, 0.2) 50%, transparent 70%)',
    pink: 'radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, rgba(219, 39, 119, 0.2) 50%, transparent 70%)',
    rose: 'radial-gradient(circle, rgba(244, 63, 94, 0.4) 0%, rgba(225, 29, 72, 0.2) 50%, transparent 70%)',
    green: 'radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, rgba(22, 163, 74, 0.2) 50%, transparent 70%)',
    teal: 'radial-gradient(circle, rgba(20, 184, 166, 0.4) 0%, rgba(13, 148, 136, 0.2) 50%, transparent 70%)',
};

/**
 * GradientOrb - Ambient gradient lighting effect
 * 
 * Uses CSS-only responsive blur - no JavaScript viewport detection.
 * Mobile gets slightly less blur for better performance.
 */
export const GradientOrb: React.FC<GradientOrbProps> = ({ className = '', color = 'blue', gradient: customGradient }) => {
    const gradient = customGradient || gradientStyles[color];

    return (
        <>
            {/* Mobile version - 60px blur for performance */}
            <div
                className={`md:hidden absolute rounded-full ${className}`}
                style={{
                    background: gradient,
                    filter: 'blur(60px)',
                    willChange: 'transform',
                }}
            />
            {/* Desktop version - 100px blur for smooth blending */}
            <div
                className={`hidden md:block absolute rounded-full ${className}`}
                style={{
                    background: gradient,
                    filter: 'blur(100px)',
                    willChange: 'transform',
                }}
            />
        </>
    );
};

export default GradientOrb;
