import React from 'react';
import { useIsMobile } from '../hooks/use-is-mobile';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    showGradient?: boolean;
}

const GlassCard = ({ children, className = '', hover = true, showGradient = true, onClick, ...props }: GlassCardProps) => {
    const isMobile = useIsMobile();

    return (
        <div
            onClick={onClick}
            className={`relative backdrop-blur-xl ${isMobile ? 'bg-white/[0.04]' : 'bg-white/[0.02]'} border border-white/[0.08] rounded-[24px] overflow-hidden ${hover ? 'hover:border-white/[0.15] hover:bg-white/[0.04] transition-all duration-500' : ''} ${className}`}
            {...props}
        >
            {!isMobile && showGradient && <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent pointer-events-none" />}
            {children}
        </div>
    );
};

export default GlassCard;
