import React, { useState, useEffect, useRef } from 'react';
import {
    motion, AnimatePresence,
    useScroll,
    useTransform,
    useSpring,
    MotionValue
} from 'framer-motion';
import {
    Rocket, Gift, Calendar, Mail, ArrowRight, Lock, Check
} from 'lucide-react';
import { useIsMobile } from '../hooks/use-is-mobile';

// ============================================
// 3D FLOATING ORB COMPONENT
// ============================================
const FloatingOrb = ({
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
    return (
        <motion.div
            className={`absolute rounded-full pointer-events-none ${className}`}
            style={{
                width: size,
                height: size,
                background: `radial-gradient(circle at 30% 30%, ${color}, transparent 70%)`,
                filter: 'blur(1px)'
            }}
            animate={{
                y: [0, -30, 0],
                x: [0, 15, 0],
                scale: [1, 1.1, 1],
                rotateZ: [0, 180, 360]
            }}
            transition={{
                duration,
                delay,
                repeat: Infinity,
                ease: "easeInOut"
            }}
        />
    );
};

// ============================================
// 3D PERSPECTIVE CONTAINER
// ============================================
const Perspective3D = ({ children, className }: { children: React.ReactNode; className?: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [rotateX, setRotateX] = useState(0);
    const [rotateY, setRotateY] = useState(0);
    const isMobile = useIsMobile();

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isMobile || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const x = (e.clientX - centerX) / (rect.width / 2);
        const y = (e.clientY - centerY) / (rect.height / 2);
        setRotateY(x * 5);
        setRotateX(-y * 5);
    };

    const handleMouseLeave = () => {
        setRotateX(0);
        setRotateY(0);
    };

    return (
        <motion.div
            ref={containerRef}
            className={className}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            animate={{ rotateX, rotateY }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{
                transformStyle: 'preserve-3d',
                perspective: '1000px'
            }}
        >
            {children}
        </motion.div>
    );
};

// ============================================
// IMMERSIVE 3D HERO SECTION
// ============================================
const Hero3D = () => {
    const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
    const isMobile = useIsMobile();

    useEffect(() => {
        if (isMobile) return;
        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight
            });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [isMobile]);

    return (
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
            {/* Dynamic 3D Background */}
            <div className="absolute inset-0">
                {/* Moving gradient based on mouse */}
                <motion.div
                    className="absolute inset-0"
                    animate={{
                        background: `radial - gradient(ellipse at ${mousePos.x * 100} % ${mousePos.y * 100} %, rgba(139, 92, 246, 0.15) 0 %, transparent 50 %)`
                    }}
                    transition={{ type: "tween", duration: 0.3 }}
                />

                {/* 3D Floating Orbs */}
                <FloatingOrb size={400} color="rgba(139,92,246,0.1)" delay={0} duration={20} className="top-[10%] left-[10%]" />
                <FloatingOrb size={300} color="rgba(59,130,246,0.1)" delay={2} duration={25} className="top-[60%] right-[5%]" />
                <FloatingOrb size={200} color="rgba(236,72,153,0.08)" delay={4} duration={18} className="bottom-[20%] left-[20%]" />
                <FloatingOrb size={150} color="rgba(16,185,129,0.08)" delay={1} duration={22} className="top-[30%] right-[30%]" />

                {/* 3D Grid floor */}
                <div
                    className="absolute bottom-0 left-0 right-0 h-[50vh] opacity-20"
                    style={{
                        background: `linear - gradient(to top, rgba(139, 92, 246, 0.1), transparent),
    linear - gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear - gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)`,
                        backgroundSize: '100% 100%, 40px 40px, 40px 40px',
                        transform: 'perspective(500px) rotateX(60deg)',
                        transformOrigin: 'center bottom'
                    }}
                />
            </div>

            {/* Hero Content */}
            <div className="relative z-10 max-w-[1200px] mx-auto px-6 text-center">
                {/* 3D Floating Badge */}
                <Perspective3D className="inline-block mb-8">
                    <motion.div
                        initial={{ opacity: 0, y: 30, rotateX: -30 }}
                        animate={{ opacity: 1, y: 0, rotateX: 0 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="relative inline-flex items-center gap-3 px-6 py-3 rounded-2xl"
                        style={{
                            background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(59,130,246,0.2) 100%)',
                            border: '1px solid rgba(139,92,246,0.3)',
                            boxShadow: '0 20px 40px -20px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
                            transform: 'translateZ(20px)'
                        }}
                    >
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                        >
                            <Rocket className="w-5 h-5 text-purple-400" />
                        </motion.div>
                        <span className="text-sm font-semibold text-white">Beta Launch Coming Soon</span>
                        <motion.div
                            className="w-2 h-2 rounded-full bg-green-400"
                            animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                    </motion.div>
                </Perspective3D>

                {/* 3D Headline */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="mb-8"
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

                {/* Subheadline */}
                <motion.p
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="text-xl md:text-2xl text-white/50 max-w-2xl mx-auto mb-12"
                >
                    Join the exclusive beta and unlock premium benefits
                    reserved only for early adopters.
                </motion.p>

                {/* 3D Mystery Date Card */}
                <Perspective3D className="inline-block mb-12">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, rotateY: -20 }}
                        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                        transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="relative px-8 py-6 rounded-3xl"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
                            transform: 'translateZ(40px)'
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

                {/* CTA Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.8 }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4"
                >
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(139,92,246,0.4)' }}
                        whileTap={{ scale: 0.98 }}
                        className="group relative px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold text-lg overflow-hidden"
                        onClick={() => document.getElementById('beta-signup')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Join Beta Waitlist
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                        <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500"
                            initial={{ x: '-100%' }}
                            whileHover={{ x: 0 }}
                            transition={{ duration: 0.3 }}
                        />
                    </motion.button>

                </motion.div>


            </div>
        </section>
    );
};

// Mystery date with animated digits
const MysteryDateDigits = () => {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick(prev => prev + 1), 100);
        return () => clearInterval(interval);
    }, []);

    const chars = '?!#*@%&';

    return (
        <div className="flex items-center gap-1 font-mono text-2xl font-bold">
            {[0, 1].map(i => (
                <motion.span
                    key={`d${i} `}
                    className="w-8 h-10 flex items-center justify-center rounded-lg bg-purple-500/20 text-purple-400"
                    animate={{ rotateX: [0, 360] }}
                    transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatDelay: 2 }}
                >
                    {chars[(tick + i) % chars.length]}
                </motion.span>
            ))}
            <span className="text-white/30 mx-1">/</span>
            {[0, 1].map(i => (
                <motion.span
                    key={`m${i} `}
                    className="w-8 h-10 flex items-center justify-center rounded-lg bg-blue-500/20 text-blue-400"
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
};



// ============================================
// PREMIUM CINEMATIC SCROLL REVEAL
// ============================================
const ScrollZoomIntro = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end end"]
    });

    // Smooth spring for all animations
    const smoothProgress = useSpring(scrollYProgress, {
        stiffness: 50,
        damping: 30,
        mass: 1
    });

    // PHASE 1: Hero Image - Elegant 3D zoom and fade
    const heroScale = useTransform(smoothProgress, [0, 0.25, 0.5], [1, 1.15, 1.4]);
    const heroOpacity = useTransform(smoothProgress, [0.2, 0.45], [1, 0]);
    const heroBlur = useTransform(smoothProgress, [0.15, 0.4], [0, 20]);
    const heroY = useTransform(smoothProgress, [0, 0.4], [0, -60]);

    // Text elegant fade with slight parallax
    const textOpacity = useTransform(smoothProgress, [0.15, 0.35], [1, 0]);
    const textY = useTransform(smoothProgress, [0, 0.35], [0, -80]);
    const textScale = useTransform(smoothProgress, [0.15, 0.35], [1, 1.05]);

    // PHASE 2: Elegant Light Reveal - Soft expanding gradient
    const revealScale = useTransform(smoothProgress, [0.25, 0.6], [0, 3]);
    const revealOpacity = useTransform(smoothProgress, [0.25, 0.4, 0.65], [0, 0.8, 0]);
    
    // Floating light particles
    const particleOpacity = useTransform(smoothProgress, [0.3, 0.45, 0.6], [0, 1, 0]);

    // PHASE 3: Benefits reveal with stagger
    const headerOpacity = useTransform(smoothProgress, [0.45, 0.6], [0, 1]);
    const headerY = useTransform(smoothProgress, [0.45, 0.6], [50, 0]);

    const gridOpacity = useTransform(smoothProgress, [0.5, 0.7], [0, 1]);
    const gridScale = useTransform(smoothProgress, [0.5, 0.7], [0.9, 1]);
    const gridY = useTransform(smoothProgress, [0.5, 0.7], [40, 0]);

    // Scroll indicator - visible while hero is showing
    const scrollIndicatorOpacity = useTransform(smoothProgress, [0, 0.05, 0.25], [1, 1, 0]);

    return (
        <section
            ref={containerRef}
            className="h-[300vh] md:h-[400vh] relative z-10"
            style={{ perspective: '1500px' }}
        >
            <div className="sticky top-0 h-screen bg-[#020408] overflow-y-auto overflow-x-hidden">

                {/* ============================================ */}
                {/* BOTTOM LAYER: Benefits Section               */}
                {/* ============================================ */}
                <motion.div
                    className="relative z-10 w-full py-12 sm:py-16 md:py-20"
                    style={{
                        background: 'radial-gradient(ellipse at center, #0a1628 0%, #020408 70%)'
                    }}
                >
                    {/* Premium ambient lighting */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="absolute left-[5%] top-[15%] w-[40vw] h-[40vw] rounded-full bg-gradient-to-br from-blue-600/10 to-cyan-500/5 blur-[100px]" />
                        <div className="absolute right-[5%] bottom-[10%] w-[35vw] h-[35vw] rounded-full bg-gradient-to-tl from-purple-600/8 to-pink-500/5 blur-[100px]" />
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] rounded-full bg-gradient-to-r from-indigo-600/5 to-transparent blur-[120px]" />
                    </div>

                    {/* Benefits Content */}
                    <div className="relative w-full max-w-[1200px] mx-auto px-4 md:px-6 select-none pointer-events-auto flex flex-col items-center">
                        <motion.div
                            className="text-center mb-6 md:mb-10"
                            style={{ opacity: headerOpacity, y: headerY }}
                        >
                            <h3 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-3 md:mb-4">
                                Beta member <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">benefits</span>
                            </h3>
                            <p className="text-base md:text-xl text-white/50 max-w-lg mx-auto px-4">
                                Exclusive perks reserved for early adopters
                            </p>
                        </motion.div>

                        <motion.div
                            style={{ opacity: gridOpacity, scale: gridScale, y: gridY }}
                            className="w-full origin-top"
                        >
                            <BentoBenefitsGrid />
                        </motion.div>
                    </div>
                </motion.div>

                {/* ============================================ */}
                {/* MIDDLE LAYER: Elegant Light Reveal          */}
                {/* ============================================ */}
                <motion.div
                    className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none"
                    style={{ opacity: revealOpacity }}
                >
                    {/* Central expanding glow */}
                    <motion.div
                        className="absolute w-[60vw] h-[60vw] md:w-[50vw] md:h-[50vw]"
                        style={{
                            scale: revealScale,
                            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(99,102,241,0.1) 30%, rgba(139,92,246,0.05) 50%, transparent 70%)',
                            filter: 'blur(40px)'
                        }}
                    />
                    
                    {/* Soft inner ring */}
                    <motion.div
                        className="absolute w-[40vw] h-[40vw] md:w-[30vw] md:h-[30vw] rounded-full"
                        style={{
                            scale: revealScale,
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 0 60px 20px rgba(59,130,246,0.1), inset 0 0 40px rgba(139,92,246,0.05)'
                        }}
                    />

                    {/* Outer ring pulse */}
                    <motion.div
                        className="absolute w-[55vw] h-[55vw] md:w-[45vw] md:h-[45vw] rounded-full"
                        style={{
                            scale: useTransform(smoothProgress, [0.3, 0.55], [0.8, 2]),
                            opacity: useTransform(smoothProgress, [0.3, 0.55], [0.3, 0]),
                            border: '1px solid rgba(99,102,241,0.2)'
                        }}
                    />
                </motion.div>

                {/* Floating light particles */}
                <motion.div
                    className="fixed inset-0 z-25 pointer-events-none"
                    style={{ opacity: particleOpacity }}
                >
                    {[...Array(8)].map((_, i) => {
                        const angle = (i / 8) * Math.PI * 2;
                        const radius = 25 + (i % 3) * 10;
                        return (
                            <motion.div
                                key={i}
                                className="absolute w-2 h-2 rounded-full"
                                style={{
                                    left: `calc(50% + ${Math.cos(angle) * radius}vw)`,
                                    top: `calc(50% + ${Math.sin(angle) * radius}vh)`,
                                    background: i % 2 === 0 
                                        ? 'radial-gradient(circle, rgba(59,130,246,0.8) 0%, transparent 70%)'
                                        : 'radial-gradient(circle, rgba(139,92,246,0.8) 0%, transparent 70%)',
                                    boxShadow: i % 2 === 0 
                                        ? '0 0 20px 8px rgba(59,130,246,0.3)'
                                        : '0 0 20px 8px rgba(139,92,246,0.3)'
                                }}
                                animate={{
                                    y: [0, -20 - (i * 5), 0],
                                    opacity: [0.4, 1, 0.4]
                                }}
                                transition={{
                                    duration: 3 + (i * 0.3),
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                    delay: i * 0.2
                                }}
                            />
                        );
                    })}
                </motion.div>

                {/* ============================================ */}
                {/* TOP LAYER: Hero Image with 3D Depth          */}
                {/* ============================================ */}
                <motion.div
                    className="fixed inset-0 z-30 overflow-hidden"
                    style={{
                        opacity: heroOpacity,
                        scale: heroScale,
                        y: heroY,
                        filter: useTransform(heroBlur, v => `blur(${v}px)`)
                    }}
                >
                    {/* Hero image with professional treatment */}
                    <div className="absolute inset-0">
                        <img 
                            src="/beta-hero.png" 
                            alt="" 
                            className="absolute w-full h-full object-cover object-center"
                            style={{ 
                                filter: 'brightness(0.5) saturate(1.1)',
                            }}
                        />
                        {/* Premium vignette overlay */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(2,4,8,0.7)_70%,rgba(2,4,8,0.95)_100%)]" />
                        {/* Top gradient fade */}
                        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#020408] to-transparent" />
                        {/* Bottom gradient fade */}
                        <div className="absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-[#020408] via-[#020408]/80 to-transparent" />
                        {/* Subtle color overlay for cohesion */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 via-transparent to-purple-900/10 mix-blend-overlay" />
                    </div>
                </motion.div>

                {/* ============================================ */}
                {/* TEXT LAYER: Hero Content                     */}
                {/* ============================================ */}
                <div className="fixed inset-0 z-40 flex flex-col items-center justify-center px-6 pointer-events-none">
                    <motion.div
                        className="text-center max-w-4xl"
                        style={{ 
                            opacity: textOpacity, 
                            y: textY,
                            scale: textScale
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="mb-6"
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

                {/* ============================================ */}
                {/* SCROLL INDICATOR                             */}
                {/* ============================================ */}
                <motion.div
                    className="absolute bottom-6 md:bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-[60] pointer-events-none"
                    style={{ opacity: scrollIndicatorOpacity }}
                    initial={{ opacity: 1 }}
                >
                    <span className="text-[11px] text-white/60 uppercase tracking-[0.15em] font-medium drop-shadow-lg">Scroll for more</span>
                    <motion.div 
                        className="w-7 h-11 rounded-full border-2 border-white/30 flex justify-center pt-2.5 backdrop-blur-md bg-black/20 shadow-lg"
                        animate={{ y: [0, 5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <motion.div
                            className="w-1.5 h-3 rounded-full bg-white/70"
                            animate={{ y: [0, 12, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                    </motion.div>
                    <motion.div
                        animate={{ y: [0, 8, 0], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <ArrowRight className="w-5 h-5 text-white/50 rotate-90 drop-shadow-md" />
                    </motion.div>
                </motion.div>

            </div>
        </section>
    );
};


// ============================================
// CREDIT TOKEN VISUAL
// ============================================
const CreditTokensVisual = () => {
    return (
        <div className="relative w-full min-h-[100px] md:min-h-[120px] flex items-center justify-between px-2">
            <div className="flex items-center -space-x-3">
                {[...Array(4)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{
                            y: [0, -6, 0],
                        }}
                        transition={{
                            duration: 2,
                            delay: i * 0.15,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        style={{ zIndex: 4 - i }}
                    >
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-cyan-400 via-cyan-500 to-cyan-600 border-2 border-cyan-300/40 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <span className="text-white font-bold text-sm md:text-base">V</span>
                        </div>
                    </motion.div>
                ))}
            </div>
            <motion.div
                className="text-right"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
            >
                <span className="text-3xl md:text-5xl font-black text-cyan-400 block leading-none">+500</span>
                <span className="text-[9px] md:text-xs text-cyan-300 uppercase tracking-wider">credits</span>
            </motion.div>
        </div>
    );
};

// ============================================
// TERMINAL/CODE VISUAL FOR EARLY ACCESS
// ============================================
const TerminalVisual = () => {
    const [lineIndex, setLineIndex] = useState(0);
    const lines = [
        { text: '$ veefore --beta', color: 'text-green-400' },
        { text: '+ Hook Generator v2', color: 'text-emerald-400' },
        { text: '+ Smart DM Funnels', color: 'text-emerald-400' },
        { text: '+ AI Analytics', color: 'text-emerald-400' },
        { text: 'Access granted!', color: 'text-cyan-400' },
    ];

    useEffect(() => {
        if (lineIndex < lines.length) {
            const timeout = setTimeout(() => {
                setLineIndex(prev => prev + 1);
            }, 600);
            return () => clearTimeout(timeout);
        }
    }, [lineIndex, lines.length]);

    return (
        <div className="w-full min-h-[100px] md:min-h-[120px] rounded-xl bg-[#0d1117] border border-white/10 p-2.5 md:p-3 font-mono text-[9px] md:text-[11px] overflow-hidden">
            <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-500/80" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
                <div className="w-2 h-2 rounded-full bg-green-500/80" />
                <span className="ml-2 text-white/30 text-[8px]">terminal</span>
            </div>
            <div className="space-y-1">
                {lines.slice(0, lineIndex).map((line, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`${line.color} leading-tight`}
                    >
                        {line.text}
                    </motion.div>
                ))}
                {lineIndex < lines.length && (
                    <motion.span
                        className="inline-block w-1.5 h-3 bg-white/60"
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                    />
                )}
                {lineIndex >= lines.length && (
                    <motion.span
                        className="inline-block w-1.5 h-3 bg-emerald-400"
                        animate={{ opacity: [1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                    />
                )}
            </div>
        </div>
    );
};

// ============================================
// CALENDAR VISUAL FOR FREE TRIAL
// ============================================
const CalendarVisual = () => {
    return (
        <div className="w-full min-h-[100px] md:min-h-[120px] rounded-xl bg-gradient-to-br from-blue-900/40 to-blue-950/60 border border-blue-500/20 p-3 overflow-hidden relative">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] md:text-[11px] text-blue-300 font-medium">Premium Trial</span>
                <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[8px] font-bold">ACTIVE</span>
            </div>
            <div className="flex items-center justify-between">
                <div className="grid grid-cols-7 gap-1 flex-1 mr-3">
                    {[...Array(21)].map((_, i) => {
                        const isToday = i === 0;
                        return (
                            <motion.div
                                key={i}
                                className={`w-4 h-4 md:w-5 md:h-5 rounded flex items-center justify-center text-[7px] md:text-[8px] font-medium
                                    ${isToday ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-300'}`}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: i * 0.03 }}
                            >
                                {i + 1}
                            </motion.div>
                        );
                    })}
                </div>
                <div className="text-right">
                    <span className="text-2xl md:text-4xl font-black text-blue-400 block leading-none">30</span>
                    <span className="text-[8px] md:text-[10px] text-blue-300 uppercase tracking-wider">days free</span>
                </div>
            </div>
        </div>
    );
};

// ============================================
// CHAT VISUAL FOR PRIORITY SUPPORT
// ============================================
const ChatVisual = () => {
    return (
        <div className="w-full min-h-[100px] md:min-h-[120px] rounded-xl bg-gradient-to-br from-purple-900/40 to-purple-950/60 border border-purple-500/20 p-2.5 md:p-3 overflow-hidden">
            <div className="space-y-2">
                <motion.div
                    className="flex items-start gap-2"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="w-5 h-5 rounded-full bg-purple-500/30 flex items-center justify-center shrink-0">
                        <span className="text-[7px] text-purple-300">You</span>
                    </div>
                    <div className="bg-white/10 rounded-lg rounded-tl-none px-2 py-1.5">
                        <p className="text-[9px] md:text-[10px] text-white/80">Need help with credits</p>
                    </div>
                </motion.div>
                <motion.div
                    className="flex items-start gap-2 justify-end"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 }}
                >
                    <div className="bg-purple-500/30 rounded-lg rounded-tr-none px-2 py-1.5 max-w-[85%]">
                        <p className="text-[9px] md:text-[10px] text-white/90">I'm here to help! Beta members get priority support</p>
                    </div>
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                        <span className="text-[7px] text-white font-bold">V</span>
                    </div>
                </motion.div>
                <motion.div
                    className="flex items-center gap-1.5 justify-end pr-7"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 }}
                >
                    <span className="text-[8px] text-green-400">●</span>
                    <span className="text-[8px] text-purple-300">Replies instantly</span>
                </motion.div>
            </div>
        </div>
    );
};

// ============================================
// PREMIUM BENTO BENEFITS GRID
// ============================================
function BentoBenefitsGrid() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full max-w-4xl mx-auto relative z-10 pb-8">
            {/* CARD 1: 500 CREDITS */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="group relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a1520]/90 to-[#0a0f18]/90 backdrop-blur-xl p-4 md:p-6 pb-6 md:pb-8 transition-all duration-500 hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/10"
            >
                <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/10 blur-[60px] rounded-full" />
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3 md:mb-4">
                        <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30">
                            <Gift className="w-4 h-4 md:w-5 md:h-5 text-cyan-400" />
                        </div>
                        <span className="text-[10px] md:text-xs font-bold text-cyan-400 uppercase tracking-wider">Bonus Credits</span>
                    </div>
                    <CreditTokensVisual />
                    <div className="mt-3 md:mt-4">
                        <h4 className="text-base md:text-xl font-bold text-white mb-1.5">500 Free Credits</h4>
                        <p className="text-xs md:text-sm text-white/50 leading-relaxed">Start creating with a generous balance to explore all AI tools.</p>
                    </div>
                </div>
            </motion.div>

            {/* CARD 2: EARLY ACCESS */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="group relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a1520]/90 to-[#0a0f18]/90 backdrop-blur-xl p-4 md:p-6 pb-6 md:pb-8 transition-all duration-500 hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/10"
            >
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-500/10 blur-[60px] rounded-full" />
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3 md:mb-4">
                        <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                            <Lock className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                        </div>
                        <span className="text-[10px] md:text-xs font-bold text-emerald-400 uppercase tracking-wider">Early Access</span>
                    </div>
                    <TerminalVisual />
                    <div className="mt-3 md:mt-4">
                        <h4 className="text-base md:text-xl font-bold text-white mb-1.5">First to New Features</h4>
                        <p className="text-xs md:text-sm text-white/50 leading-relaxed">Test unreleased tools before anyone else.</p>
                    </div>
                </div>
            </motion.div>

            {/* CARD 3: 30 DAYS FREE */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="group relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a1520]/90 to-[#0a0f18]/90 backdrop-blur-xl p-4 md:p-6 pb-6 md:pb-8 transition-all duration-500 hover:border-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/10"
            >
                <div className="absolute top-0 left-0 w-40 h-40 bg-blue-500/10 blur-[60px] rounded-full" />
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3 md:mb-4">
                        <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-500/30">
                            <Calendar className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                        </div>
                        <span className="text-[10px] md:text-xs font-bold text-blue-400 uppercase tracking-wider">Free Trial</span>
                    </div>
                    <CalendarVisual />
                    <div className="mt-3 md:mt-4">
                        <h4 className="text-base md:text-xl font-bold text-white mb-1.5">30 Days Premium</h4>
                        <p className="text-xs md:text-sm text-white/50 leading-relaxed">Full access to all premium features, no limits.</p>
                    </div>
                </div>
            </motion.div>

            {/* CARD 4: PRIORITY SUPPORT */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="group relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a1520]/90 to-[#0a0f18]/90 backdrop-blur-xl p-4 md:p-6 pb-6 md:pb-8 transition-all duration-500 hover:border-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/10"
            >
                <div className="absolute bottom-0 right-0 w-40 h-40 bg-purple-500/10 blur-[60px] rounded-full" />
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3 md:mb-4">
                        <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30">
                            <Mail className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                        </div>
                        <span className="text-[10px] md:text-xs font-bold text-purple-400 uppercase tracking-wider">Priority Support</span>
                    </div>
                    <ChatVisual />
                    <div className="mt-3 md:mt-4">
                        <h4 className="text-base md:text-xl font-bold text-white mb-1.5">Direct Team Access</h4>
                        <p className="text-xs md:text-sm text-white/50 leading-relaxed">Get instant help from our dedicated support team.</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

// ============================================
// SIMPLE URGENCY SECTION
// ============================================
function UrgencySection() {
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
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="text-center"
                >
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="text-xs font-medium text-amber-400">Limited spots available</span>
                    </div>

                    {/* Main counter */}
                    <h3 className="text-3xl md:text-4xl font-bold text-white mb-2">
                        Only <span className="text-amber-400">{spotsLeft}</span> spots remaining
                    </h3>
                    <p className="text-white/40 mb-8">
                        {claimedSpots} of {totalSpots} beta spots have been claimed
                    </p>

                    {/* Simple progress bar */}
                    <div className="max-w-md mx-auto mb-8">
                        <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                                initial={{ width: 0 }}
                                whileInView={{ width: `${percentage}% ` }}
                                viewport={{ once: true }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                        <p className="text-xs text-white/30 mt-2">{Math.floor(percentage)}% filled</p>
                    </div>

                    {/* CTA */}
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => document.getElementById('beta-signup')?.scrollIntoView({ behavior: 'smooth' })}
                        className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors"
                    >
                        Reserve your spot
                    </motion.button>
                </motion.div>
            </div>
        </section>
    );
};

// ============================================
// 3D EMAIL SIGNUP SECTION
// ============================================
const SignupSection = () => {
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
            {/* 3D Background elements */}
            <div className="absolute inset-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-radial from-purple-500/10 via-transparent to-transparent rounded-full blur-3xl" />
            </div>

            <div className="max-w-[700px] mx-auto px-6 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-12"
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
                                    viewport={{ once: true }}
                                    className="relative p-2 rounded-2xl"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(59,130,246,0.2) 100%)',
                                        boxShadow: isFocused
                                            ? '0 0 60px -20px rgba(139,92,246,0.5)'
                                            : '0 20px 40px -20px rgba(0,0,0,0.3)'
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
                                            className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold disabled:opacity-60"
                                        >
                                            {isSubmitting ? (
                                                <motion.div
                                                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mx-auto"
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
                        >
                            <motion.div
                                initial={{ scale: 0, rotateY: -180 }}
                                animate={{ scale: 1, rotateY: 0 }}
                                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 flex items-center justify-center"
                                style={{ boxShadow: '0 20px 40px -20px rgba(16,185,129,0.5)' }}
                            >
                                <Check className="w-10 h-10 text-white" />
                            </motion.div>
                            <h4 className="text-2xl font-bold text-white mb-2">You're on the list!</h4>
                            <p className="text-white/50">We'll notify you when beta access opens.</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
interface BetaLaunchSectionProps {
    onNavigate: (view: string) => void;
}

const BetaLaunchSection: React.FC<BetaLaunchSectionProps> = () => {

    return (
        <div className="relative bg-[#030303]">
            {/* Hero Section */}
            <Hero3D />

            {/* Scroll Zoom Intro - ManyChat Style */}
            <ScrollZoomIntro />



            {/* Urgency */}
            <UrgencySection />

            {/* Signup */}
            <SignupSection />
        </div>
    );
};

export default BetaLaunchSection;
