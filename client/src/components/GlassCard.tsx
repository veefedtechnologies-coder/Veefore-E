import React from 'react';
import { useIsMobile } from '../hooks/use-is-mobile';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    showGradient?: boolean;
}

/**
 * GlassCard Component
 * 
 * Glass morphism card with backdrop blur and gradient overlay.
 * 
 * Optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Custom comparison for all props including children
 */
const GlassCard = React.memo(({ children, className = '', hover = true, showGradient = true, onClick, ...props }: GlassCardProps) => {
    const isMobile = useIsMobile();

    return (
        <div
            onClick={onClick}
            className={`relative backdrop-blur-md ${isMobile ? 'bg-white/[0.04]' : 'bg-white/[0.02]'} border border-white/10 rounded-2xl overflow-hidden ${hover ? 'hover:border-white/20 hover:bg-white/[0.04] transition-all duration-500' : ''} ${className}`}
            {...props}
        >
            {!isMobile && showGradient && <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent pointer-events-none" />}
            {children}
        </div>
    );
}, (prevProps, nextProps) => {
  // Custom comparison: re-render only if relevant props change
  return prevProps.className === nextProps.className &&
         prevProps.hover === nextProps.hover &&
         prevProps.showGradient === nextProps.showGradient &&
         prevProps.onClick === nextProps.onClick &&
         prevProps.children === nextProps.children;
});

GlassCard.displayName = 'GlassCard';

export default GlassCard;
