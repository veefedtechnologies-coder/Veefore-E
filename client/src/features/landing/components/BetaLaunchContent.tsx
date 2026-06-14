import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import {
    motion, AnimatePresence,
    useScroll,
    useTransform,
    useSpring,
    useMotionValue
} from 'framer-motion';
import {
    Rocket, Gift, Calendar, Mail, ArrowRight, Lock, Check
} from 'lucide-react';
import { useIsMobile } from '../../../hooks/use-is-mobile';
import { useWaitlist } from '../../../context/WaitlistContext';
import { VIEWPORT_ONCE } from '../../../lib/animation-performance';

// Clean GPU hint without backfaceVisibility (causes flickering)
const GPU_STYLE = {
    willChange: 'transform',
    transform: 'translateZ(0)',
} as const;

/**
 * BetaLaunchContent Component
 * 
 * Content sections for the Beta Launch page including:
 * - Mystery date digits with animated characters
 * - Bento benefits grid with 3D perspective cards
 * - Urgency section with progress bar
 * - Email signup section with form and success state
 * 
 * This component contains all the content/text sections extracted from BetaLaunchSection.
 * It follows the established patterns from previous landing page refactorings (Tasks 13-14).
 * 
 * Requirements: 15.1 (BetaLaunchSection refactoring)
 * 
 * @component
 */

// ============================================
// 3D PERSPECTIVE CONTAINER (Memoized + No Re-renders)
// ============================================
const Perspective3D = memo(({ children, className }: { children: React.ReactNode; className?: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();

    const rotateXMotion = useMotionValue(0);
    const rotateYMotion = useMotionValue(0);
    const smoothRotateX = useSpring(rotateXMotion, { stiffness: 300, damping: 30 });
    const smoothRotateY = useSpring(rotateYMotion, { stiffness: 300, damping: 30 });

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isMobile || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const x = (e.clientX - centerX) / (rect.width / 2);
        const y = (e.clientY - centerY) / (rect.height / 2);
        rotateYMotion.set(x * 5);
        rotateXMotion.set(-y * 5);
    }, [isMobile, rotateXMotion, rotateYMotion]);

    const handleMouseLeave = useCallback(() => {
        rotateXMotion.set(0);
        rotateYMotion.set(0);
    }, [rotateXMotion, rotateYMotion]);

    return (
        <motion.div
            ref={containerRef}
            className={className || ''}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                rotateX: smoothRotateX,
                rotateY: smoothRotateY,
                transformStyle: 'preserve-3d',
                perspective: '1000px',
            }}
        >
            {children}
        </motion.div>
    );
});
Perspective3D.displayName = 'Perspective3D';

// ============================================
// MYSTERY DATE DIGITS (Memoized)
// ============================================
export const MysteryDateDigits = memo(() => {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick(prev => prev + 1), 500);
        return () => clearInterval(interval);
    }, []);

    const chars = '?!#*@%&';

    return (
        <div className="flex items-center gap-1 font-mono text-2xl font-bold">
            {[0, 1].map(i => (
                <motion.span
                    key={`d${i}`}
                    className="w-8 h-10 flex items-center justify-center rounded-lg bg-purple-500/20 text-purple-400 gpu-stable"
                    style={{ transform: 'translateZ(0)' }}
                    animate={{ rotateX: [0, 360] }}
                    transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatDelay: 2 }}
                >
                    {chars[(tick + i) % chars.length]}
                </motion.span>
            ))}
            <span className="text-white/30 mx-1">/</span>
            {[0, 1].map(i => (
                <motion.span
                    key={`m${i}`}
                    className="w-8 h-10 flex items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 gpu-stable"
                    style={{ transform: 'translateZ(0)' }}
                    animate={{ rotateX: [0, 360] }}
                    transition={{ duration: 0.5, delay: 0.2 + i * 0.1, repeat: Infinity, repeatDelay: 2 }}
                >
                    {chars[(tick + 2 + i) % chars.length]}
                </motion.span>
            ))}
            <span className="text-white/30 mx-1">/</span>
            <span className="w-16 h-10 flex items-center justify-center rounded-lg bg-white/5 text-white/60">
                2026
            </span>
        </div>
    );
});
MysteryDateDigits.displayName = 'MysteryDateDigits';

// ============================================
// REFINED BENTO BENEFITS GRID (Memoized)
// ============================================
export const BentoBenefitsGrid = memo(function BentoBenefitsGrid() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-5 w-full mx-auto relative z-10">
            {/* 500 Bonus Credits Card */}
            <Perspective3D className="col-span-2 md:col-span-7">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/20">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[80px] rounded-full group-hover:bg-cyan-500/10 transition-colors" style={GPU_STYLE} />

                    <div className="relative z-10 flex flex-col h-full justify-between" style={{ transformStyle: 'preserve-3d' }}>
                        <div className="flex justify-between items-start mb-4 md:mb-8">
                            <motion.div
                                className="p-2 md:p-3 rounded-2xl bg-white/10 border border-white/10 group-hover:border-cyan-500/30 transition-colors gpu-stable"
                                style={{ transform: 'translateZ(40px)' }}
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                            >
                                <Gift className="w-5 h-5 md:w-8 md:h-8 text-white group-hover:text-cyan-400 transition-colors" />
                            </motion.div>
                            <div className="text-right" style={{ transform: 'translateZ(20px)' }}>
                                <span className="block text-3xl md:text-5xl font-black text-white drop-shadow-lg group-hover:text-cyan-100 transition-colors">
                                    500
                                </span>
                                <span className="text-[10px] md:text-sm font-bold tracking-wider text-cyan-200 uppercase">credits</span>
                            </div>
                        </div>

                        <div style={{ transform: 'translateZ(10px)' }}>
                            <h4 className="text-lg md:text-2xl font-bold text-white mb-1 md:mb-2 group-hover:text-cyan-50 transition-colors">500 Bonus Credits</h4>
                            <p className="text-xs md:text-base text-blue-100/80 font-medium leading-relaxed">
                                Get started with a generous credit balance to explore all AI features.
                            </p>
                        </div>
                    </div>
                </div>
            </Perspective3D>

            {/* Early Access Card */}
            <Perspective3D className="col-span-1 md:col-span-5">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-orange-500/30 hover:shadow-2xl hover:shadow-orange-500/20">
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/5 blur-[80px] rounded-full group-hover:bg-orange-500/10 transition-colors" style={GPU_STYLE} />

                    <div className="relative z-10 h-full flex flex-col justify-between" style={{ transformStyle: 'preserve-3d' }}>
                        <motion.div
                            className="p-2 md:p-3 w-fit rounded-2xl bg-white/10 border border-white/10 mb-4 md:mb-8 group-hover:border-orange-500/30 transition-colors gpu-stable"
                            style={{ transform: 'translateZ(40px)' }}
                            animate={{ y: [0, -6, 0] }}
                            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                        >
                            <Lock className="w-5 h-5 md:w-8 md:h-8 text-white group-hover:text-orange-400 transition-colors" />
                        </motion.div>

                        <div style={{ transform: 'translateZ(20px)' }}>
                            <h4 className="text-sm md:text-2xl font-bold text-white mb-1 md:mb-2 group-hover:text-orange-50 transition-colors">Early Access</h4>
                            <p className="text-[10px] md:text-base text-blue-100/80 font-medium leading-relaxed hidden sm:block">
                                Be the first to try new features before release.
                            </p>
                        </div>
                    </div>
                </div>
            </Perspective3D>

            {/* 30 Days Free Trial Card */}
            <Perspective3D className="col-span-1 md:col-span-5">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/20">
                    <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full group-hover:bg-blue-500/10 transition-colors" style={GPU_STYLE} />

                    <div className="relative z-10 flex flex-col h-full justify-between" style={{ transformStyle: 'preserve-3d' }}>
                        <div className="flex justify-between items-start mb-4 md:mb-6">
                            <motion.div
                                className="p-2 md:p-3 rounded-2xl bg-white/10 border border-white/10 group-hover:border-blue-500/30 transition-colors gpu-stable"
                                style={{ transform: 'translateZ(40px)' }}
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                            >
                                <Calendar className="w-5 h-5 md:w-8 md:h-8 text-white group-hover:text-blue-400 transition-colors" />
                            </motion.div>
                            <div className="text-right" style={{ transform: 'translateZ(20px)' }}>
                                <span className="block text-3xl md:text-5xl font-black text-white drop-shadow-lg group-hover:text-blue-100 transition-colors">
                                    30
                                </span>
                                <span className="text-[10px] md:text-sm font-bold tracking-wider text-blue-200 uppercase">days</span>
                            </div>
                        </div>

                        <div style={{ transform: 'translateZ(10px)' }}>
                            <h4 className="text-sm md:text-2xl font-bold text-white mb-1 md:mb-2 group-hover:text-blue-50 transition-colors">Free Trial</h4>
                            <p className="text-[10px] md:text-base text-blue-100/80 font-medium leading-relaxed hidden sm:block">
                                Full premium access.
                            </p>
                        </div>
                    </div>
                </div>
            </Perspective3D>

            {/* Priority Support Card */}
            <Perspective3D className="col-span-2 md:col-span-7">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-yellow-500/30 hover:shadow-2xl hover:shadow-yellow-500/20">
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-yellow-500/5 blur-[80px] rounded-full group-hover:bg-yellow-500/10 transition-colors" style={GPU_STYLE} />

                    <div className="relative z-10 h-full flex flex-col justify-between" style={{ transformStyle: 'preserve-3d' }}>
                        <div className="flex justify-between items-start mb-4 md:mb-8">
                            <motion.div
                                className="p-2 md:p-3 w-fit rounded-2xl bg-white/10 border border-white/10 mb-4 md:mb-8 group-hover:border-yellow-500/30 transition-colors gpu-stable"
                                style={{ transform: 'translateZ(40px)' }}
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
                            >
                                <Mail className="w-5 h-5 md:w-8 md:h-8 text-white group-hover:text-yellow-400 transition-colors" />
                            </motion.div>
                        </div>

                        <div style={{ transform: 'translateZ(20px)' }}>
                            <h4 className="text-lg md:text-2xl font-bold text-white mb-1 md:mb-2 group-hover:text-yellow-50 transition-colors">Priority Support</h4>
                            <p className="text-xs md:text-base text-blue-100/80 font-medium leading-relaxed">
                                Direct access to our team.
                            </p>
                        </div>
                    </div>
                </div>
            </Perspective3D>
        </div>
    );
});

// ============================================
// SIMPLE URGENCY SECTION
// ============================================
export function UrgencySection() {
    const { openWaitlist } = useWaitlist();
    const [spotsLeft] = useState(147);
    const totalSpots = 500;
    const claimedSpots = totalSpots - spotsLeft;
    const percentage = (claimedSpots / totalSpots) * 100;

    return (
        <section className="py-16 relative">
            <div className="max-w-[700px] mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={VIEWPORT_ONCE}
                    transition={{ duration: 0.5 }}
                    className="text-center"
                    style={GPU_STYLE}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="text-xs font-medium text-amber-400">Limited spots available</span>
                    </div>

                    <h3 className="text-3xl md:text-4xl font-bold text-white mb-2">
                        Only <span className="text-amber-400">{spotsLeft}</span> spots remaining
                    </h3>
                    <p className="text-white/40 mb-8">
                        {claimedSpots} of {totalSpots} beta spots have been claimed
                    </p>

                    <div className="max-w-md mx-auto mb-8">
                        <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                                initial={{ width: 0 }}
                                whileInView={{ width: `${percentage}%` }}
                                viewport={VIEWPORT_ONCE}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                        <p className="text-xs text-white/30 mt-2">{Math.floor(percentage)}% filled</p>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={openWaitlist}
                        className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors gpu-stable"
                    >
                        Reserve your spot
                    </motion.button>
                </motion.div>
            </div>
        </section>
    );
}

// ============================================
// 3D EMAIL SIGNUP SECTION
// ============================================
export const SignupSection = memo(() => {
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const isMobile = useIsMobile();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        setIsSubmitting(true);
        await new Promise(resolve => setTimeout(resolve, 1500));
        setIsSuccess(true);
        setIsSubmitting(false);
    };

    return (
        <section id="beta-signup" className="py-24 relative overflow-hidden">
            <div className="absolute inset-0" style={GPU_STYLE}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-radial from-purple-500/10 via-transparent to-transparent rounded-full blur-3xl" />
            </div>

            <div className="max-w-[700px] mx-auto px-6 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={VIEWPORT_ONCE}
                    className="text-center mb-12"
                    style={GPU_STYLE}
                >
                    <h3 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        Reserve your spot
                    </h3>
                    <p className="text-xl text-white/50">
                        Be among the first to experience the future of creator growth.
                    </p>
                </motion.div>

                <AnimatePresence mode="wait">
                    {!isSuccess ? (
                        <motion.form
                            key="form"
                            onSubmit={handleSubmit}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <Perspective3D className="w-full">
                                <motion.div
                                    initial={{ opacity: 0, y: 20, rotateX: -10 }}
                                    whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                                    viewport={VIEWPORT_ONCE}
                                    className="relative p-2 rounded-2xl"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(59,130,246,0.2) 100%)',
                                        boxShadow: isFocused
                                            ? '0 0 60px -20px rgba(139,92,246,0.5)'
                                            : '0 20px 40px -20px rgba(0,0,0,0.3)',
                                        ...GPU_STYLE
                                    }}
                                >
                                    <div className="flex flex-col sm:flex-row gap-2 p-1 rounded-xl bg-[#0a0a0a]">
                                        <div className="relative flex-1">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                onFocus={() => setIsFocused(true)}
                                                onBlur={() => setIsFocused(false)}
                                                placeholder="Enter your email"
                                                className="w-full pl-12 pr-4 py-4 bg-transparent text-white placeholder:text-white/30 focus:outline-none"
                                                required
                                            />
                                        </div>
                                        <motion.button
                                            type="submit"
                                            disabled={isSubmitting}
                                            whileHover={{ scale: isMobile ? 1 : 1.02 }}
                                            className="btn-brick btn-brick-brand px-8 py-4 gpu-stable"
                                        >
                                            {isSubmitting ? (
                                                <motion.div
                                                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mx-auto gpu-stable"
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                />
                                            ) : (
                                                <span className="flex items-center gap-2">
                                                    Join Waitlist
                                                    <ArrowRight className="w-4 h-4" />
                                                </span>
                                            )}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            </Perspective3D>
                            <p className="text-center text-sm text-white/30 mt-4">
                                No spam. Unsubscribe anytime.
                            </p>
                        </motion.form>
                    ) : (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-12"
                            style={GPU_STYLE}
                        >
                            <motion.div
                                initial={{ scale: 0, rotateY: -180 }}
                                animate={{ scale: 1, rotateY: 0 }}
                                transition={{ type: "spring", duration: 0.8 }}
                                className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center gpu-stable"
                            >
                                <Check className="w-10 h-10 text-white" />
                            </motion.div>
                            <h4 className="text-2xl font-bold text-white mb-2">You're on the list!</h4>
                            <p className="text-white/50">We'll notify you when VeeFore launches.</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
});
SignupSection.displayName = 'SignupSection';

export default {
    MysteryDateDigits,
    BentoBenefitsGrid,
    UrgencySection,
    SignupSection,
    Perspective3D
};
