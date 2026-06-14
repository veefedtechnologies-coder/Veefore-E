import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import {
    motion,
    useScroll,
    useTransform,
    useSpring,
    useMotionValue
} from 'framer-motion';
import {
    Rocket, ArrowRight, Calendar
} from 'lucide-react';
import { useIsMobile } from '../hooks/use-is-mobile';
import { useWaitlist } from '../context/WaitlistContext';
import {
    MysteryDateDigits,
    BentoBenefitsGrid,
    UrgencySection,
    SignupSection
} from '../features/landing/components/BetaLaunchContent';

// Clean GPU hint without backfaceVisibility (causes flickering)
const GPU_STYLE = {
    willChange: 'transform',
    transform: 'translateZ(0)',
} as const;

// ============================================
// 3D FLOATING ORB COMPONENT (Memoized + Mobile Optimized)
// ============================================
const FloatingOrb = memo(({
    size,
    color,
    delay,
    duration,
    className
}: {
    size: number;
    color: string;
    delay: number;
    duration: number;
    className?: string;
}) => {
    const isMobile = useIsMobile();

    const mobileAnimation = useMemo(() => ({
        y: [0, -15, 0],
        scale: [1, 1.05, 1],
    }), []);

    const desktopAnimation = useMemo(() => ({
        y: [0, -30, 0],
        x: [0, 15, 0],
        scale: [1, 1.1, 1],
        rotateZ: [0, 180, 360]
    }), []);

    return (
        <motion.div
            className={`absolute rounded-full pointer-events-none gpu-stable ${className}`}
            style={{
                width: size,
                height: size,
                background: `radial-gradient(circle at 30% 30%, ${color}, transparent 70%)`,
                filter: isMobile ? 'none' : 'blur(1px)',
            }}
            animate={isMobile ? mobileAnimation : desktopAnimation}
            transition={{
                duration: isMobile ? duration * 1.5 : duration,
                delay,
                repeat: Infinity,
                ease: "easeInOut"
            }}
        />
    );
});
FloatingOrb.displayName = 'FloatingOrb';

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

/**
 * BetaLaunchSection Component
 * 
 * Main beta launch page section featuring:
 * - Immersive 3D hero section with floating orbs
 * - Cinematic scroll-based reveal animations
 * - Benefits showcase with Bento grid
 * - Urgency section with limited spots
 * - Email signup form
 * 
 * This component orchestrates the beta launch experience and imports
 * content components from BetaLaunchContent.tsx following the established
 * patterns from previous landing page refactorings (Tasks 13-14).
 * 
 * Requirements: 15.1 (BetaLaunchSection refactoring)
 * 
 * @component
 */

// ============================================
// IMMERSIVE 3D HERO SECTION (Memoized + No Re-renders)
// ============================================
const Hero3D = memo(() => {
    const isMobile = useIsMobile();
    const { openWaitlist } = useWaitlist();
    const sectionRef = useRef<HTMLElement>(null);
    const gradientRef = useRef<HTMLDivElement>(null);
    const isInViewRef = useRef(true);

    useEffect(() => {
        if (isMobile || !sectionRef.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                isInViewRef.current = entry.isIntersecting;
            },
            { threshold: 0 }
        );
        observer.observe(sectionRef.current);

        let rafId: number;
        const handleMouseMove = (e: MouseEvent) => {
            if (!isInViewRef.current || !gradientRef.current) return;
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const x = (e.clientX / window.innerWidth) * 100;
                const y = (e.clientY / window.innerHeight) * 100;
                if (gradientRef.current) {
                    gradientRef.current.style.background = `radial-gradient(ellipse at ${x}% ${y}%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)`;
                }
            });
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            observer.disconnect();
            cancelAnimationFrame(rafId);
        };
    }, [isMobile]);

    return (
        <section ref={sectionRef} className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0">
                <div
                    ref={gradientRef}
                    className="absolute inset-0"
                    style={{
                        background: 'radial-gradient(ellipse at 50% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)'
                    }}
                />

                <FloatingOrb size={400} color="rgba(139,92,246,0.1)" delay={0} duration={20} className="top-[10%] left-[10%]" />
                <FloatingOrb size={300} color="rgba(59,130,246,0.1)" delay={2} duration={25} className="top-[60%] right-[5%]" />
                <FloatingOrb size={200} color="rgba(236,72,153,0.08)" delay={4} duration={18} className="bottom-[20%] left-[20%]" />
                <FloatingOrb size={150} color="rgba(16,185,129,0.08)" delay={1} duration={22} className="top-[30%] right-[30%]" />

                <div
                    className="absolute bottom-0 left-0 right-0 h-[50vh] opacity-20 gpu-stable"
                    style={{
                        background: `linear-gradient(to top, rgba(139, 92, 246, 0.1), transparent),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)`,
                        backgroundSize: '100% 100%, 40px 40px, 40px 40px',
                        transform: 'perspective(500px) rotateX(60deg) translateZ(0)',
                        transformOrigin: 'center bottom',
                    }}
                />
            </div>

            <div className="relative z-10 max-w-[1200px] mx-auto px-6 text-center">
                <Perspective3D className="inline-block mb-8">
                    <motion.div
                        initial={{ opacity: 0, y: 30, rotateX: -30 }}
                        animate={{ opacity: 1, y: 0, rotateX: 0 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="relative inline-flex items-center gap-3 px-6 py-3 rounded-2xl gpu-stable"
                        style={{
                            background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(59,130,246,0.2) 100%)',
                            border: '1px solid rgba(139,92,246,0.3)',
                            boxShadow: '0 20px 40px -20px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
                            transform: 'translateZ(20px)',
                        }}
                    >
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                            className="gpu-stable"
                        >
                            <Rocket className="w-5 h-5 text-purple-400" />
                        </motion.div>
                        <span className="text-sm font-semibold text-white">Beta Launch Coming Soon</span>
                        <motion.div
                            className="w-2 h-2 rounded-full bg-green-400 gpu-stable"
                            animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                    </motion.div>
                </Perspective3D>

                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="mb-8"
                    style={GPU_STYLE}
                >
                    <h2
                        className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.1]"
                        style={{
                            textShadow: '0 0 80px rgba(139,92,246,0.3)'
                        }}
                    >
                        <span className="block text-white">Be the first</span>
                        <span className="block bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                            to experience
                        </span>
                        <span className="block text-white">VeeFore</span>
                    </h2>
                </motion.div>

                <motion.p
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="text-xl md:text-2xl text-white/50 max-w-2xl mx-auto mb-12"
                    style={GPU_STYLE}
                >
                    Join the exclusive beta and unlock premium benefits
                    reserved only for early adopters.
                </motion.p>

                <Perspective3D className="inline-block mb-12">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, rotateY: -20 }}
                        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                        transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="relative px-8 py-6 rounded-3xl gpu-stable"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
                            transform: 'translateZ(40px)',
                        }}
                    >
                        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
                            <div className="p-2 sm:p-3 rounded-xl bg-purple-500/20 border border-purple-500/30">
                                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
                            </div>
                            <div className="text-center sm:text-left">
                                <p className="text-[10px] sm:text-xs text-white/40 uppercase tracking-wider mb-1">Launch Date</p>
                                <div className="flex items-center gap-1 sm:gap-2 scale-90 sm:scale-100 origin-left">
                                    <MysteryDateDigits />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </Perspective3D>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.8 }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    style={GPU_STYLE}
                >
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(139,92,246,0.4)' }}
                        whileTap={{ scale: 0.98 }}
                        className="group relative px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold text-lg overflow-hidden gpu-stable"
                        onClick={openWaitlist}
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Join Beta Waitlist
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                        <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 gpu-stable"
                            initial={{ x: '-100%' }}
                            whileHover={{ x: 0 }}
                            transition={{ duration: 0.3 }}
                        />
                    </motion.button>
                </motion.div>
            </div>
        </section>
    );
});
Hero3D.displayName = 'Hero3D';

// ============================================
// PREMIUM CINEMATIC SCROLL REVEAL (GPU Optimized)
// ============================================
const ScrollZoomIntro = memo(() => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end end"]
    });

    const snappedProgress = useTransform(scrollYProgress, (latest: number) => {
        const snapPoints = [0, 0.6, 1];
        const snapStrength = 0.15; // Moderate snap for this section
        for (const snap of snapPoints) {
            const dist = Math.abs(latest - snap);
            if (dist < snapStrength) {
                const factor = dist / snapStrength;
                const eased = factor * factor;
                return snap + (latest - snap > 0 ? 1 : -1) * eased * snapStrength;
            }
        }
        return latest;
    });

    const smoothProgress = useSpring(snappedProgress, {
        stiffness: 220,
        damping: 40,
        mass: 1
    });

    const heroScale = useTransform(smoothProgress, [0, 0.25, 0.5], [1, 1.15, 1.4]);
    const heroOpacity = useTransform(smoothProgress, [0.2, 0.45], [1, 0]);
    const heroBlur = useTransform(smoothProgress, [0.15, 0.4], [0, 20]);
    const heroY = useTransform(smoothProgress, [0, 0.4], [0, -60]);

    const textOpacity = useTransform(smoothProgress, [0.15, 0.35], [1, 0]);
    const textY = useTransform(smoothProgress, [0, 0.35], [0, -80]);
    const textScale = useTransform(smoothProgress, [0.15, 0.35], [1, 1.05]);

    const revealScale = useTransform(smoothProgress, [0.25, 0.6], [0, 3]);
    const revealOpacity = useTransform(smoothProgress, [0.25, 0.4, 0.65], [0, 0.8, 0]);

    const particleOpacity = useTransform(smoothProgress, [0.3, 0.45, 0.6], [0, 1, 0]);

    const headerOpacity = useTransform(smoothProgress, [0.45, 0.6], [0, 1]);
    const headerY = useTransform(smoothProgress, [0.45, 0.6], [50, 0]);

    const gridOpacity = useTransform(smoothProgress, [0.5, 0.7], [0, 1]);
    const gridScale = useTransform(smoothProgress, [0.5, 0.7], [0.9, 1]);
    const gridY = useTransform(smoothProgress, [0.5, 0.7], [40, 0]);

    const scrollIndicatorOpacity = useTransform(smoothProgress, [0, 0.05, 0.25], [1, 1, 0]);

    const outerRingScale = useTransform(smoothProgress, [0.3, 0.55], [0.8, 2]);
    const outerRingOpacity = useTransform(smoothProgress, [0.3, 0.55], [0.3, 0]);
    const heroFilterBlur = useTransform(heroBlur, v => `blur(${v}px)`);

    const particles = useMemo(() => [...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 25 + (i % 3) * 10;
        return {
            id: i,
            left: `calc(50% + ${Math.cos(angle) * radius}vw)`,
            top: `calc(50% + ${Math.sin(angle) * radius}vh)`,
            background: i % 2 === 0
                ? 'radial-gradient(circle, rgba(59,130,246,0.8) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(139,92,246,0.8) 0%, transparent 70%)',
            boxShadow: i % 2 === 0
                ? '0 0 20px 8px rgba(59,130,246,0.3)'
                : '0 0 20px 8px rgba(139,92,246,0.3)',
            yAnim: [0, -20 - (i * 5), 0],
            duration: 3 + (i * 0.3),
            delay: i * 0.2
        };
    }), []);

    return (
        <section
            ref={containerRef}
            className="h-[300vh] md:h-[400vh] relative z-10"
        >
            <div className="sticky top-0 h-screen overflow-hidden bg-[#020408]">

                <motion.div
                    className="absolute inset-0 z-10 flex items-center justify-center"
                    style={{
                        background: 'radial-gradient(ellipse at center, #0a1628 0%, #020408 70%)',
                        ...GPU_STYLE
                    }}
                >
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="absolute left-[5%] top-[15%] w-[40vw] h-[40vw] rounded-full bg-gradient-to-br from-blue-600/15 to-cyan-500/10 blur-[80px]" style={GPU_STYLE} />
                        <div className="absolute right-[5%] bottom-[10%] w-[35vw] h-[35vw] rounded-full bg-gradient-to-tl from-purple-600/12 to-pink-500/8 blur-[80px]" style={GPU_STYLE} />
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] rounded-full bg-gradient-to-r from-indigo-600/10 to-transparent blur-[100px]" style={GPU_STYLE} />
                    </div>

                    <div className="w-full max-w-[1200px] px-6 pt-4 md:pt-20 select-none pointer-events-auto flex flex-col items-center">
                        <motion.div
                            className="text-center mb-4 md:mb-10"
                            style={{ opacity: headerOpacity, y: headerY }}
                        >
                            <h3 className="text-3xl md:text-5xl font-bold text-white mb-4">
                                Beta member <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">benefits</span>
                            </h3>
                            <p className="text-lg md:text-xl text-white/50 max-w-lg mx-auto">
                                Exclusive perks reserved for early adopters
                            </p>
                        </motion.div>

                        <motion.div
                            style={{ opacity: gridOpacity, scale: gridScale, y: gridY }}
                            className="w-full origin-top scale-95 sm:scale-90 md:scale-100 mt-4 sm:mt-0"
                        >
                            <BentoBenefitsGrid />
                        </motion.div>
                    </div>
                </motion.div>

                <motion.div
                    className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                    style={{ opacity: revealOpacity }}
                >
                    <motion.div
                        className="absolute w-[60vw] h-[60vw] md:w-[50vw] md:h-[50vw]"
                        style={{
                            scale: revealScale,
                            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(99,102,241,0.1) 30%, rgba(139,92,246,0.05) 50%, transparent 70%)',
                            filter: 'blur(40px)',
                        }}
                    />

                    <motion.div
                        className="absolute w-[40vw] h-[40vw] md:w-[30vw] md:h-[30vw] rounded-full"
                        style={{
                            scale: revealScale,
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 0 60px 20px rgba(59,130,246,0.1), inset 0 0 40px rgba(139,92,246,0.05)',
                        }}
                    />

                    <motion.div
                        className="absolute w-[55vw] h-[55vw] md:w-[45vw] md:h-[45vw] rounded-full"
                        style={{
                            scale: outerRingScale,
                            opacity: outerRingOpacity,
                            border: '1px solid rgba(99,102,241,0.2)',
                        }}
                    />
                </motion.div>

                <motion.div
                    className="absolute inset-0 z-25 pointer-events-none"
                    style={{ opacity: particleOpacity }}
                >
                    {particles.map((p) => (
                        <motion.div
                            key={p.id}
                            className="absolute w-2 h-2 rounded-full"
                            style={{
                                left: p.left,
                                top: p.top,
                                background: p.background,
                                boxShadow: p.boxShadow,
                            }}
                            animate={{
                                y: p.yAnim,
                                opacity: [0.4, 1, 0.4]
                            }}
                            transition={{
                                duration: p.duration,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: p.delay
                            }}
                        />
                    ))}
                </motion.div>

                <motion.div
                    className="absolute inset-0 z-30 overflow-hidden"
                    style={{
                        opacity: heroOpacity,
                        scale: heroScale,
                        y: heroY,
                        filter: heroFilterBlur,
                    }}
                >
                    <div className="absolute inset-0" style={GPU_STYLE}>
                        <img
                            src="/beta-hero.png"
                            alt=""
                            className="absolute w-full h-full object-cover object-center"
                            style={{
                                filter: 'brightness(0.7) saturate(1.2)',
                            }}
                        />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(2,4,8,0.5)_60%,rgba(2,4,8,0.85)_100%)]" />
                        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#020408] to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#020408] via-[#020408]/60 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-purple-900/20 mix-blend-overlay" />
                    </div>
                </motion.div>

                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center px-6 pointer-events-none">
                    <motion.div
                        className="text-center max-w-4xl"
                        style={{
                            opacity: textOpacity,
                            y: textY,
                            scale: textScale,
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="mb-6"
                            style={GPU_STYLE}
                        >
                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Beta Access Opening Soon</span>
                            </span>
                        </motion.div>

                        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
                            The Future of
                            <span className="block mt-2 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                                Content Creation
                            </span>
                        </h1>
                        <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
                            Join the exclusive beta and transform your workflow with AI-powered tools designed for creators.
                        </p>
                    </motion.div>
                </div>

                <motion.div
                    className="absolute bottom-6 md:bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-[60] pointer-events-none"
                    style={{ opacity: scrollIndicatorOpacity }}
                    initial={{ opacity: 1 }}
                >
                    <span className="text-[11px] text-white/60 uppercase tracking-[0.15em] font-medium drop-shadow-lg">Scroll for more</span>
                    <motion.div
                        className="w-7 h-11 rounded-full border-2 border-white/30 flex justify-center pt-2.5 backdrop-blur-md bg-black/20 shadow-lg gpu-stable"
                        animate={{ y: [0, 5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <motion.div
                            className="w-1.5 h-3 rounded-full bg-white/70 gpu-stable"
                            animate={{ y: [0, 12, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                    </motion.div>
                    <motion.div
                        className="gpu-stable"
                        animate={{ y: [0, 8, 0], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <ArrowRight className="w-5 h-5 text-white/50 rotate-90 drop-shadow-md" />
                    </motion.div>
                </motion.div>

            </div>
        </section>
    );
});
ScrollZoomIntro.displayName = 'ScrollZoomIntro';

// ============================================
// MAIN COMPONENT
// ============================================
function BetaLaunchSection() {
    return (
        <div className="bg-[#020408] min-h-screen overflow-x-clip">
            <Hero3D />
            <ScrollZoomIntro />
            <UrgencySection />
            <SignupSection />
        </div>
    );
}

export default BetaLaunchSection;
