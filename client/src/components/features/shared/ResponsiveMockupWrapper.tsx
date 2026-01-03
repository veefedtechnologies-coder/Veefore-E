import React, { useRef, createContext } from 'react';
import { useInView } from 'framer-motion';
import { IphoneMockup } from '../../ui/iphone-mockup';

export const MockupAnimationContext = createContext<boolean>(false);

interface MockupAmbientGlowProps {
    color: 'cyan' | 'blue' | 'purple' | 'pink' | 'rose' | 'green';
}

// Ambient glow gradient configs for each color theme
const glowGradients = {
    cyan: 'radial-gradient(ellipse at center, rgba(6, 182, 212, 0.35) 0%, rgba(59, 130, 246, 0.25) 35%, rgba(20, 184, 166, 0.12) 55%, transparent 75%)',
    blue: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.35) 0%, rgba(147, 51, 234, 0.25) 35%, rgba(236, 72, 153, 0.12) 55%, transparent 75%)',
    purple: 'radial-gradient(ellipse at center, rgba(147, 51, 234, 0.35) 0%, rgba(236, 72, 153, 0.25) 35%, rgba(244, 63, 94, 0.12) 55%, transparent 75%)',
    pink: 'radial-gradient(ellipse at center, rgba(236, 72, 153, 0.35) 0%, rgba(147, 51, 234, 0.25) 35%, rgba(244, 63, 94, 0.12) 55%, transparent 75%)',
    rose: 'radial-gradient(ellipse at center, rgba(244, 63, 94, 0.35) 0%, rgba(236, 72, 153, 0.25) 35%, rgba(239, 68, 68, 0.12) 55%, transparent 75%)',
    green: 'radial-gradient(ellipse at center, rgba(34, 197, 94, 0.35) 0%, rgba(16, 185, 129, 0.25) 35%, rgba(20, 184, 166, 0.12) 55%, transparent 75%)',
};

const mobileScreenGradients = {
    cyan: 'bg-gradient-to-b from-cyan-900/40 via-[#050505] to-black',
    blue: 'bg-gradient-to-b from-blue-900/40 via-[#050505] to-black',
    purple: 'bg-gradient-to-b from-purple-900/40 via-[#050505] to-black',
    pink: 'bg-gradient-to-b from-pink-900/40 via-[#050505] to-black',
    rose: 'bg-gradient-to-b from-rose-900/40 via-[#050505] to-black',
    green: 'bg-gradient-to-b from-green-900/40 via-[#050505] to-black',
};

const MockupAmbientGlow: React.FC<MockupAmbientGlowProps> = ({ color }) => (
    <div
        className="absolute inset-0"
        style={{
            background: glowGradients[color],
            filter: 'blur(50px)',
            transform: 'scale(1.4)',
            willChange: 'transform',
        }}
    />
);

interface ResponsiveMockupWrapperProps {
    children: React.ReactNode;
    color?: 'cyan' | 'blue' | 'purple' | 'pink' | 'rose' | 'green';
    desktopClassName?: string;
    desktopBorderColor?: string;
    desktopGradient?: string;
}

/**
 * ResponsiveMockupWrapper - Handles mobile/desktop mockup layout
 * 
 * CRITICAL: No useIsMobile - pure CSS responsive only.
 * Renders BOTH mobile and desktop versions; CSS controls visibility.
 * 
 * Mobile: iPhone mockup with ambient glow
 * Desktop: Bordered panel with gradient background
 */
export const ResponsiveMockupWrapper: React.FC<ResponsiveMockupWrapperProps> = ({
    children,
    color = 'cyan',
    desktopClassName = '',
    desktopBorderColor = 'border-cyan-500/30',
    desktopGradient = 'from-cyan-500/40 via-blue-500/30 to-teal-500/40',
}) => {
    const mobileRef = useRef(null);
    const desktopRef = useRef(null);
    const mobileInView = useInView(mobileRef, { once: true, margin: "-10%" });
    const desktopInView = useInView(desktopRef, { once: true, margin: "-10%" });

    return (
        <>
            {/* Mobile Version - hidden on md+ screens */}
            <div ref={mobileRef} className="md:hidden relative flex justify-center py-4" style={{ contain: 'content' }}>
                <MockupAnimationContext.Provider value={mobileInView}>
                    <MockupAmbientGlow color={color} />
                    <IphoneMockup
                        isAutoScroll={true}
                        contentScale={0.8}
                        className="relative z-10 w-[90%] max-w-[320px] h-[600px] border-black bg-black shadow-2xl"
                    >
                        <div className={`${mobileScreenGradients[color]} min-h-full overflow-y-auto overflow-x-hidden custom-scrollbar`}>
                            <div className="w-[125%] origin-top-left scale-[0.8] h-full">
                                {children}
                            </div>
                        </div>
                    </IphoneMockup>
                </MockupAnimationContext.Provider>
            </div>

            {/* Desktop Version - hidden on small screens */}
            <div ref={desktopRef} className={`hidden md:block relative ${desktopClassName}`} style={{ contain: 'content' }}>
                <MockupAnimationContext.Provider value={desktopInView}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${desktopGradient} blur-3xl opacity-50`} />
                    <div className={`relative rounded-2xl overflow-hidden border ${desktopBorderColor} bg-black/40 backdrop-blur-xl shadow-2xl`}>
                        {children}
                    </div>
                </MockupAnimationContext.Provider>
            </div>
        </>
    );
};

export default ResponsiveMockupWrapper;
