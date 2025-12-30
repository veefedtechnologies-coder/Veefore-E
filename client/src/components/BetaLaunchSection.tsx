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
// SCROLL REVEAL WITH 3D FLIP & PORTAL EFFECT
// ============================================
const ScrollZoomIntro = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end end"]
    });

    // ANIMATION TIMELINE (0 to 1)
    // 0.0 - 0.2: Entry
    // 0.2 - 0.6: Hero Flips + Portal Bursts
    // 0.5 - 1.0: Benefits Staggered Reveal

    // 1. HERO BLAST (4-Quadrant Tear Effect)
    // The image splits into 4 parts and flies outward
    const tearMove = useTransform(scrollYProgress, [0.2, 0.5], ['0%', '150%']);
    const tearRotate = useTransform(scrollYProgress, [0.2, 0.5], [0, 15]);
    const tearOpacity = useTransform(scrollYProgress, [0.35, 0.6], [1, 0]);

    // Text flies through camera
    const textScale = useTransform(scrollYProgress, [0.2, 0.45], [1, 3]);
    const textOpacity = useTransform(scrollYProgress, [0.25, 0.4], [1, 0]);

    // 2. PORTAL EXPLOSION (Shockwave Effect)
    const portalScale = useTransform(scrollYProgress, [0.25, 0.65], [0, 4.5]);
    const portalShockwave = useTransform(scrollYProgress, [0.3, 0.6], [0.5, 5]); // Faster, larger burst
    const portalOpacity = useTransform(scrollYProgress, [0.25, 0.45, 0.7], [0, 1, 0]); // Fades out at end
    const portalGlow = useTransform(scrollYProgress, [0.3, 0.5], [0.5, 1]);

    // 3. BENEFITS STAGGERED REVEAL (Cascading Entrance)
    // Header appears first
    const headerOpacity = useTransform(scrollYProgress, [0.45, 0.6], [0, 1]);
    const headerY = useTransform(scrollYProgress, [0.45, 0.6], [40, 0]);

    // Grid appears slightly later with separate zoom
    const gridOpacity = useTransform(scrollYProgress, [0.5, 0.7], [0, 1]);
    const gridScale = useTransform(scrollYProgress, [0.5, 0.7], [0.85, 1]);
    const gridY = useTransform(scrollYProgress, [0.5, 0.7], [60, 0]);

    // 4. SCROLL INDICATOR
    const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

    return (
        <section
            ref={containerRef}
            className="h-[250vh] md:h-[400vh] relative z-10"
            style={{ perspective: '2000px' }} // Deeper perspective for grander scale
        >
            <div className="sticky top-0 h-screen overflow-hidden bg-[#030303]">

                {/* ------------------------------------------- */}
                {/* BOTTOM LAYER: BENEFITS SECTION              */}
                {/* z-10: Always there, revealed by portal      */}
                {/* ------------------------------------------- */}
                <motion.div
                    className="absolute inset-0 z-10 flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, #02040a 0%, #0d121f 50%, #02040a 100%)'
                    }}
                >
                    {/* Decorative Orbs - Multi-colored mix */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {/* Cyan/Blue Orb (Top Left) */}
                        <div className="absolute left-[-10%] top-[10%] w-[45vw] h-[45vw] rounded-full bg-cyan-600/15 blur-[120px]" />
                        {/* Orange/Yellow Orb (Bottom Right) */}
                        <div className="absolute right-[-5%] bottom-[5%] w-[40vw] h-[40vw] rounded-full bg-orange-500/10 blur-[100px]" />
                        {/* Deep Blue Orb (Bottom Left) */}
                        <div className="absolute left-[10%] bottom-[10%] w-[35vw] h-[35vw] rounded-full bg-blue-700/10 blur-[90px]" />
                    </div>

                    {/* Benefits Content - Mobile: Scaled to fit; Desktop: Standard */}
                    <div className="w-full max-w-[1200px] px-6 pt-4 md:pt-24 select-none pointer-events-auto flex flex-col items-center">
                        <motion.div
                            className="text-center mb-4 md:mb-10 scale-90 md:scale-100 origin-bottom"
                            style={{ opacity: headerOpacity, y: headerY }}
                        >
                            <h3 className="text-3xl md:text-5xl font-bold text-white mb-4">
                                Beta member <span className="text-white/90">benefits</span>
                            </h3>
                            <p className="text-lg md:text-xl text-white/60 max-w-lg mx-auto">
                                Exclusive perks reserved for early adopters
                            </p>
                        </motion.div>

                        <motion.div
                            style={{ opacity: gridOpacity, scale: gridScale, y: gridY }}
                            className="w-full origin-top transform scale-95 sm:scale-90 md:scale-100 mt-4 sm:mt-0"
                        >
                            <BentoBenefitsGrid />
                        </motion.div>
                    </div>
                </motion.div>

                {/* ------------------------------------------- */}
                {/* MIDDLE LAYER: PORTAL (Expanding Circle)    */}
                {/* z-20: Glowing circle that reveals benefits */}
                {/* ------------------------------------------- */}
                {/* ------------------------------------------- */}
                {/* MIDDLE LAYER: PORTAL (Expanding Circle)    */}
                {/* z-20: Glowing circle that reveals benefits */}
                {/* ------------------------------------------- */}
                <motion.div
                    className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                    style={{ opacity: portalOpacity }}
                >
                    <motion.div
                        className="w-[50vw] h-[50vw] md:w-[40vw] md:h-[40vw] rounded-full"
                        style={{
                            scale: portalScale,
                            // Cyan/Blue Outer with Transparent Center
                            background: 'radial-gradient(circle, transparent 0%, rgba(3, 7, 18, 0.3) 40%, rgba(6, 182, 212, 0.15) 60%, transparent 70%)',
                            boxShadow: '0 0 80px 40px rgba(6, 182, 212, 0.1), 0 0 150px 80px rgba(59, 130, 246, 0.05)',
                            filter: 'blur(20px)'
                        }}
                    />
                    {/* Inner glow ring - Multi-colored Border */}
                    <motion.div
                        className="absolute w-[48vw] h-[48vw] md:w-[38vw] md:h-[38vw] rounded-full"
                        style={{
                            scale: portalScale,
                            opacity: portalGlow,
                            // Gradient border effect via background + mask? Or just simple border color
                            // Using a simple thin colored border for now, maybe Cyan mixed with Orange
                            border: '2px solid rgba(255, 255, 255, 0.1)',
                            background: 'conic-gradient(from 0deg, transparent 0%, rgba(6,182,212,0.3) 25%, rgba(249,115,22,0.3) 50%, rgba(59,130,246,0.3) 75%, transparent 100%)',
                            mask: 'radial-gradient(transparent 68%, black 69%)' // Creating a ring shape manually if needed, but border is simpler.
                            // Let's stick to a clean border with the colors:
                        }}
                    >
                        <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30" />
                        <div className="absolute inset-0 rounded-full border-t-2 border-orange-500/40 rotate-180" />
                    </motion.div>

                    {/* Shockwave Ring */}
                    <motion.div
                        className="absolute w-[48vw] h-[48vw] rounded-full border border-white/10"
                        style={{
                            scale: portalShockwave,
                            opacity: useTransform(scrollYProgress, [0.3, 0.5], [0.4, 0])
                        }}
                    />
                </motion.div>

                {/* ------------------------------------------- */}
                {/* ------------------------------------------- */}
                {/* TOP LAYER: HERO BLAST (Split Image)         */}
                {/* ------------------------------------------- */}
                <div className="absolute inset-0 z-30 pointer-events-none">
                    {/* Top Left Quadrant */}
                    <motion.div
                        className="absolute top-0 left-0 w-1/2 h-1/2 overflow-hidden bg-[#030303]"
                        style={{ x: useTransform(tearMove, v => `-${v}`), y: useTransform(tearMove, v => `-${v}`), rotate: useTransform(tearRotate, v => `-${v}deg`), opacity: tearOpacity, borderTopLeftRadius: '32px' }}
                    >
                        <img src="/beta-hero.png" alt="" className="absolute w-[200%] h-[200%] max-w-none object-cover top-0 left-0 brightness-[0.4]" />
                        <div className="absolute inset-0 bg-gradient-to-br from-[#030303]/80 to-transparent" />
                    </motion.div>

                    {/* Top Right Quadrant */}
                    <motion.div
                        className="absolute top-0 right-0 w-1/2 h-1/2 overflow-hidden bg-[#030303]"
                        style={{ x: tearMove, y: useTransform(tearMove, v => `-${v}`), rotate: tearRotate, opacity: tearOpacity, borderTopRightRadius: '32px' }}
                    >
                        <img src="/beta-hero.png" alt="" className="absolute w-[200%] h-[200%] max-w-none object-cover top-0 right-0 brightness-[0.4]" />
                        <div className="absolute inset-0 bg-gradient-to-bl from-[#030303]/80 to-transparent" />
                    </motion.div>

                    {/* Bottom Left Quadrant */}
                    <motion.div
                        className="absolute bottom-0 left-0 w-1/2 h-1/2 overflow-hidden bg-[#030303]"
                        style={{ x: useTransform(tearMove, v => `-${v}`), y: tearMove, rotate: tearRotate, opacity: tearOpacity, borderBottomLeftRadius: '32px' }}
                    >
                        <img src="/beta-hero.png" alt="" className="absolute w-[200%] h-[200%] max-w-none object-cover bottom-0 left-0 brightness-[0.4]" />
                        <div className="absolute inset-0 bg-gradient-to-tr from-[#030303]/80 to-transparent" />
                    </motion.div>

                    {/* Bottom Right Quadrant */}
                    <motion.div
                        className="absolute bottom-0 right-0 w-1/2 h-1/2 overflow-hidden bg-[#030303]"
                        style={{ x: tearMove, y: tearMove, rotate: useTransform(tearRotate, v => `-${v}deg`), opacity: tearOpacity, borderBottomRightRadius: '32px' }}
                    >
                        <img src="/beta-hero.png" alt="" className="absolute w-[200%] h-[200%] max-w-none object-cover bottom-0 right-0 brightness-[0.4]" />
                        <div className="absolute inset-0 bg-gradient-to-tl from-[#030303]/80 to-transparent" />
                    </motion.div>
                </div>

                {/* Hero Content (Text Layer) - Scaled Independently */}
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center px-6 pointer-events-none">
                    <motion.div
                        className="text-center max-w-4xl"
                        style={{ opacity: textOpacity, scale: textScale }}
                    >
                        <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black text-white mb-6 leading-tight">
                            The Future of
                            <span className="block bg-gradient-to-r from-cyan-400 via-blue-500 to-orange-400 bg-clip-text text-transparent">
                                Content Creation
                            </span>
                        </h1>
                        <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-8">
                            Join the exclusive beta and transform your workflow with AI-powered tools designed for creators.
                        </p>

                    </motion.div>


                </div>


                {/* Scroll Indicator */}
                <motion.div
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-40 pointer-events-none"
                    style={{ opacity: scrollIndicatorOpacity }}
                >
                    <span className="text-xs text-white/50 uppercase tracking-widest">Scroll to explore</span>
                    <motion.div className="w-6 h-10 rounded-full border-2 border-white/30 flex justify-center pt-2">
                        <motion.div
                            className="w-1.5 h-3 rounded-full bg-white/60"
                            animate={{ y: [0, 12, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        />
                    </motion.div>
                </motion.div>

            </div>
        </section >
    );
};


// ============================================
// REFINED BENTO BENEFITS GRID
// ============================================
function BentoBenefitsGrid() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-5 w-full mx-auto relative z-10">
            {/* CARD 1: 500 CREDITS (Cyan Accent) */}
            <Perspective3D className="col-span-2 md:col-span-7">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/20">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[80px] rounded-full group-hover:bg-cyan-500/10 transition-colors" />

                    <div className="relative z-10 flex flex-col h-full justify-between" style={{ transformStyle: 'preserve-3d' }}>
                        <div className="flex justify-between items-start mb-4 md:mb-8">
                            <motion.div
                                className="p-2 md:p-3 rounded-2xl bg-white/10 border border-white/10 group-hover:border-cyan-500/30 transition-colors"
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

            {/* CARD 2: EARLY ACCESS (Orange Accent) */}
            <Perspective3D className="col-span-1 md:col-span-5">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-orange-500/30 hover:shadow-2xl hover:shadow-orange-500/20">
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/5 blur-[80px] rounded-full group-hover:bg-orange-500/10 transition-colors" />

                    <div className="relative z-10 h-full flex flex-col justify-between" style={{ transformStyle: 'preserve-3d' }}>
                        <motion.div
                            className="p-2 md:p-3 w-fit rounded-2xl bg-white/10 border border-white/10 mb-4 md:mb-8 group-hover:border-orange-500/30 transition-colors"
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

            {/* CARD 3: 30 DAYS (Blue Accent) */}
            <Perspective3D className="col-span-1 md:col-span-5">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/20">
                    <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full group-hover:bg-blue-500/10 transition-colors" />

                    <div className="relative z-10 flex flex-col h-full justify-between" style={{ transformStyle: 'preserve-3d' }}>
                        <div className="flex justify-between items-start mb-4 md:mb-6">
                            <motion.div
                                className="p-2 md:p-3 rounded-2xl bg-white/10 border border-white/10 group-hover:border-blue-500/30 transition-colors"
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

            {/* CARD 4: PRIORITY SUPPORT (Yellow Accent) */}
            <Perspective3D className="col-span-2 md:col-span-7">
                <div className="h-full group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/60 backdrop-blur-xl p-3 md:p-6 transition-all duration-500 hover:bg-[#111827]/80 hover:border-yellow-500/30 hover:shadow-2xl hover:shadow-yellow-500/20">
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-yellow-500/5 blur-[80px] rounded-full group-hover:bg-yellow-500/10 transition-colors" />

                    <div className="relative z-10 h-full flex flex-col justify-between" style={{ transformStyle: 'preserve-3d' }}>
                        <div className="flex justify-between items-start mb-4 md:mb-8">
                            <motion.div
                                className="p-2 md:p-3 w-fit rounded-2xl bg-white/10 border border-white/10 mb-4 md:mb-8 group-hover:border-yellow-500/30 transition-colors"
                                style={{ transform: 'translateZ(40px)' }}
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
                            >
                                <Mail className="w-5 h-5 md:w-8 md:h-8 text-white group-hover:text-yellow-400 transition-colors" />
                            </motion.div>

                            {/* Empty div to balance layout if needed, or text on right */}
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
