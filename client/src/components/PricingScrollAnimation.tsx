import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion';
import { CheckCircle, Lock } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import { useWaitlist } from '../context/WaitlistContext';

// Interfaces
interface PricingPlan {
    name: string;
    credits: number;
    description: string;
    features: string[];
    locked: string[];
    gradient: string;
    border: string;
    popular?: boolean;
}

interface PricingScrollAnimationProps {
    pricingPlans: PricingPlan[];
}

// Simplified components for Desktop-only use
const TiltCard = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
    // ... existing TiltCard code ...
    const ref = useRef<HTMLDivElement>(null)
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const rotateX = useTransform(y, [-100, 100], [8, -8])
    const rotateY = useTransform(x, [-100, 100], [-8, 8])

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!ref.current) return
        const rect = ref.current.getBoundingClientRect()
        const width = rect.width
        const height = rect.height
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const xPct = mouseX / width - 0.5
        const yPct = mouseY / height - 0.5
        x.set(xPct * 200)
        y.set(yPct * 200)
    }

    const handleMouseLeave = () => {
        x.set(0)
        y.set(0)
    }

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
            className={`relative transition-all duration-200 ease-out ${className}`}
        >
            {children}
        </motion.div>
    )
}

const MagneticButton = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => {
    const ref = useRef<HTMLButtonElement>(null)
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const springX = useSpring(x, { stiffness: 300, damping: 20 })
    const springY = useSpring(y, { stiffness: 300, damping: 20 })

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!ref.current) return
        const rect = ref.current.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        x.set((e.clientX - centerX) * 0.15)
        y.set((e.clientY - centerY) * 0.15)
    }

    const handleMouseLeave = () => {
        x.set(0)
        y.set(0)
    }

    return (
        <motion.button
            ref={ref}
            style={{ x: springX, y: springY }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={onClick}
            className={className}
        >
            {children}
        </motion.button>
    )
}

export const PricingScrollAnimation: React.FC<PricingScrollAnimationProps> = ({ pricingPlans }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });

    const smoothProgress = useSpring(scrollYProgress, {
        stiffness: 60,  // Reduced from 100 for gentler movement
        damping: 40,    // Increased from 30 for more resistance/smoothing
        restDelta: 0.001
    });

    // Transforms for Desktop Stacking Effect
    // Using nearly full range [0.1, 0.9] to make animation slower and smoother over the scroll distance

    // Middle Card (Growth) - The Hero
    const middleScale = useTransform(smoothProgress, [0.1, 0.8], [1, 1.05]);
    const middleY = useTransform(smoothProgress, [0.1, 0.8], [0, 15]);

    // Left Card (Starter) - Tucks behind left
    const leftX = useTransform(smoothProgress, [0.1, 0.8], ["-380px", "-50px"]);
    const leftScale = useTransform(smoothProgress, [0.1, 0.8], [0.95, 0.9]);
    const leftOpacity = useTransform(smoothProgress, [0.1, 0.8], [1, 0.6]);
    const leftRotate = useTransform(smoothProgress, [0.1, 0.8], [0, -6]);
    const leftZ = useTransform(smoothProgress, [0.1, 0.8], [1, 0]);

    // Right Card (Pro) - Tucks behind right
    const rightX = useTransform(smoothProgress, [0.1, 0.8], ["380px", "50px"]);
    const rightScale = useTransform(smoothProgress, [0.1, 0.8], [0.95, 0.9]);
    const rightOpacity = useTransform(smoothProgress, [0.1, 0.8], [1, 0.6]);
    const rightRotate = useTransform(smoothProgress, [0.1, 0.8], [0, 6]);
    const rightZ = useTransform(smoothProgress, [0.1, 0.8], [1, 0]);

    return (
        <div ref={containerRef} className="hidden md:block relative h-[200vh] -mt-20 mb-0 z-50">
            <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden perspective-1000">
                <div className="relative w-full max-w-[1200px] flex justify-center items-center h-[600px]">

                    {/* Left Card - Starter */}
                    <motion.div
                        style={{ x: leftX, scale: leftScale, opacity: leftOpacity, rotate: leftRotate, zIndex: leftZ }}
                        className="absolute w-[350px] h-full origin-bottom-right"
                    >
                        <PricingCard plan={pricingPlans[0]} />
                    </motion.div>

                    {/* Right Card - Pro */}
                    <motion.div
                        style={{ x: rightX, scale: rightScale, opacity: rightOpacity, rotate: rightRotate, zIndex: rightZ }}
                        className="absolute w-[350px] h-full origin-bottom-left"
                    >
                        <PricingCard plan={pricingPlans[2]} />
                    </motion.div>

                    {/* Middle Card - Growth - Stays on top */}
                    <motion.div
                        style={{ scale: middleScale, y: middleY, zIndex: 10 }}
                        className="absolute w-[380px] h-full shadow-2xl shadow-blue-500/20 rounded-3xl"
                    >
                        <PricingCard plan={pricingPlans[1]} isHero />
                    </motion.div>

                </div>

                {/* Scroll Indicator */}
                <motion.div
                    style={{ opacity: useTransform(scrollYProgress, [0, 0.1, 0.8, 1], [1, 0, 0, 0]) }}
                    className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
                >
                    <span className="text-white/30 text-sm uppercase tracking-widest font-medium">Compare Plans</span>
                    <div className="w-1 h-12 rounded-full bg-white/10 overflow-hidden">
                        <motion.div
                            animate={{ y: [0, 48, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="w-full h-1/2 bg-blue-500 rounded-full"
                        />
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

// Reusable Pricing Card Component (Internal)
const PricingCard = ({ plan, isHero = false }: { plan: PricingPlan, isHero?: boolean }) => {
    const { openWaitlist } = useWaitlist();
    return (
        <TiltCard className="h-full group">
            {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-auto max-w-full px-4 py-1 rounded-full bg-blue-500 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-500/30 text-white z-30 whitespace-nowrap pointer-events-none">
                    Most Popular
                </div>
            )}
            <GlassCard className={`p-8 h-full flex flex-col !bg-gradient-to-br ${plan.gradient} ${plan.border} relative transition-all duration-300`}>

                <div className="mb-6">
                    <h3 className={`text-2xl font-bold mb-2 ${isHero ? 'text-white' : 'text-white/80'}`}>{plan.name}</h3>
                    <p className="text-sm text-white/40">{plan.description}</p>
                </div>

                <div className="mb-8">
                    {/* Hidden Price - Coming Soon */}
                    <div className="relative mb-2">
                        {/* Blurred price hint */}
                        <div className="flex items-baseline filter blur-sm select-none pointer-events-none opacity-50">
                            <span className={`text-5xl font-bold ${isHero ? 'text-white' : 'text-white/90'}`}>₹???</span>
                            <span className="text-white/40 ml-2">/mo</span>
                        </div>
                        {/* Coming Soon Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 backdrop-blur-md">
                                <Lock className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-sm font-medium text-white/90">Coming Soon</span>
                            </div>
                        </div>
                    </div>

                    <p className={`text-sm mt-2 font-medium ${isHero ? 'text-blue-400' : 'text-white/30'}`}>
                        {plan.credits.toLocaleString()} credits/month
                    </p>
                </div>

                <div className="space-y-4 mb-8 flex-1">
                    {plan.features.map((feature, j) => (
                        <div key={j} className="flex items-center space-x-3 text-sm text-white/70">
                            <CheckCircle className={`w-4 h-4 shrink-0 ${isHero ? 'text-blue-400' : 'text-white/30'}`} />
                            <span>{feature}</span>
                        </div>
                    ))}
                    {plan.locked.map((feature, j) => (
                        <div key={j} className="flex items-center space-x-3 text-sm text-white/20">
                            <Lock className="w-4 h-4 shrink-0" />
                            <span>{feature}</span>
                        </div>
                    ))}
                </div>

                <MagneticButton
                    className={`w-full rounded-full py-4 font-bold transition-all duration-300 ${isHero
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                        }`}
                    onClick={openWaitlist}
                >
                    Get Notified
                </MagneticButton>
            </GlassCard>
        </TiltCard>
    );
};
