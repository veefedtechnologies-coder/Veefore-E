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
import { useIsMobile } from '../hooks/use-is-mobile';
import { useWaitlist } from '../context/WaitlistContext';
import { VIEWPORT_ONCE } from '../lib/animation-performance';

// Empty - GPU hints removed to prevent layer explosion
const GPU_STYLE = {} as const;

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

// Mystery date with animated digits (Memoized)
const MysteryDateDigits = memo(() => {
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
// PREMIUM CINEMATIC SCROLL REVEAL (GPU Optimized)
// ============================================
const ScrollZoomIntro = memo(() => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end end"]
    });

    const smoothProgress = useSpring(scrollYProgress, {
        stiffness: 50,
        damping: 30,
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
                    {/* Background gradients - simplified for performance (no blur) */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="absolute left-[5%] top-[15%] w-[40vw] h-[40vw] rounded-full bg-gradient-to-br from-blue-600/10 to-cyan-500/5 opacity-60" style={GPU_STYLE} />
                        <div className="absolute right-[5%] bottom-[10%] w-[35vw] h-[35vw] rounded-full bg-gradient-to-tl from-purple-600/8 to-pink-500/5 opacity-60" style={GPU_STYLE} />
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] rounded-full bg-gradient-to-r from-indigo-600/8 to-transparent opacity-50" style={GPU_STYLE} />
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
// REFINED BENTO BENEFITS GRID (Memoized)
// ============================================
const BentoBenefitsGrid = memo(function BentoBenefitsGrid() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-5 w-full mx-auto relative z-10">
            <Perspective3D className="col-span-2 md:col-span-7">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/20">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full opacity-50 group-hover:opacity-70 transition-opacity" />

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

            <Perspective3D className="col-span-1 md:col-span-5">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-orange-500/30 hover:shadow-2xl hover:shadow-orange-500/20">
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/5 rounded-full opacity-50 group-hover:opacity-70 transition-opacity" />

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

            <Perspective3D className="col-span-1 md:col-span-5">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/20">
                    <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full opacity-50 group-hover:opacity-70 transition-opacity" />

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

            <Perspective3D className="col-span-2 md:col-span-7">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-yellow-500/30 hover:shadow-2xl hover:shadow-yellow-500/20">
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full opacity-50 group-hover:opacity-70 transition-opacity" />

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
function UrgencySection() {
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
const SignupSection = memo(() => {
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
            <div className="absolute inset-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-radial from-purple-500/10 via-transparent to-transparent rounded-full opacity-50" />
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
                                            whileTap={{ scale: 0.98 }}
                                            className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold disabled:opacity-60 gpu-stable"
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
