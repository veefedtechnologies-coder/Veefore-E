import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { MessageSquare, DollarSign, Search, CheckCircle } from 'lucide-react';

const features = [
    {
        title: "Stop Guessing. Know Exactly What Works.",
        description: "Expertly analyze top-performing competitor content. We tell you the emotional hooks, structural patterns, and why it went viral.",
        highlight: "140+ Viral Patterns Detected",
        icon: Search,
        color: "blue",
        screen: {
            type: "analysis",
            title: "Viral Hook Intelligence",
            stats: [
                { label: "Viral Probability", value: "98%", color: "text-green-400" },
                { label: "Emotional Trigger", value: "FOMO", color: "text-blue-400" }
            ],
            points: ["Competitor Analysis", "Hook Extraction", "Trend Prediction"]
        }
    },
    {
        title: "Turn Comments into Conversations.",
        description: "Don't just post. Participate. Our AI replies to comments with human-like context in seconds, boosting your algorithm score.",
        highlight: "12ms Response Time",
        icon: MessageSquare,
        color: "purple",
        screen: {
            type: "chat",
            messages: [
                { user: "fan", text: "How do I get this?", time: "2m" },
                { user: "me", text: "Check your DMs! I just sent you the link 🚀", time: "Just now" }
            ]
        }
    },
    {
        title: "Turn DMs into 24/7 Revenue.",
        description: "Capture every lead. Auto-reply to keywords, qualify potential customers, and send payment links while you sleep.",
        highlight: "Auto-Sales Funnel Active",
        icon: DollarSign,
        color: "green",
        screen: {
            type: "sales",
            title: "Smart Sales Funnel",
            steps: [
                { text: "Keyword Detected: 'START'", status: "complete" },
                { text: "Lead Qualified", status: "complete" },
                { text: "Checkout Link Sent", status: "active" }
            ]
        }
    }
];

// Screen content with responsive adjustments
const ScreenContent = ({ feature, isMobile = false }: { feature: any, isMobile?: boolean }) => {
    return (
        <div className="h-full w-full p-4 md:p-8 pt-8 md:pt-10 flex flex-col relative z-10 bg-gradient-to-br from-zinc-900 to-black overflow-hidden">

            {feature.screen.type === 'analysis' && (
                <div className="space-y-4 md:space-y-6 h-full flex flex-col justify-center">
                    <div className="bg-white/5 rounded-2xl p-4 md:p-6 border border-white/10 backdrop-blur-sm">
                        <h4 className="text-xs md:text-sm text-white/50 uppercase tracking-widest mb-4 md:mb-6">{feature.screen.title}</h4>
                        <div className="flex justify-between items-end mb-4 md:mb-6">
                            <div>
                                <div className="text-3xl md:text-5xl font-bold text-white mb-1 md:mb-2">High</div>
                                <div className="text-xs md:text-sm text-white/50">Potential</div>
                            </div>
                            <div className="text-right">
                                <div className={`text-3xl md:text-5xl font-bold ${feature.screen.stats[0].color}`}>{feature.screen.stats[0].value}</div>
                            </div>
                        </div>
                        <div className="h-2 md:h-3 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: "98%" }}
                                transition={{ duration: 1, delay: 0.5 }}
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                            />
                        </div>
                    </div>

                    <div className={`grid ${isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-3 gap-4'}`}>
                        {feature.screen.points.map((point: string, i: number) => (
                            <div key={i} className="flex items-center space-x-2 md:space-x-3 bg-white/5 p-3 md:p-4 rounded-xl border border-white/5 backdrop-blur-sm">
                                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500 shrink-0" />
                                <span className="text-xs md:text-sm text-white/80 truncate">{point}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {feature.screen.type === 'chat' && (
                <div className="space-y-4 md:space-y-6 h-full justify-center flex flex-col px-4 md:px-12">
                    {feature.screen.messages.map((msg: any, i: number) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            whileInView={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ delay: i * 0.5 }}
                            className={`max-w-[85%] md:max-w-[70%] p-4 md:p-5 rounded-2xl ${msg.user === 'me'
                                ? 'bg-purple-500 text-white self-end rounded-br-none ml-auto'
                                : 'bg-white/10 text-white self-start rounded-bl-none backdrop-blur-sm'
                                }`}
                        >
                            <p className="text-sm md:text-base font-medium">{msg.text}</p>
                            <p className={`text-[10px] md:text-xs mt-2 opacity-60 ${msg.user === 'me' ? 'text-white' : 'text-white/60'}`}>{msg.time}</p>
                        </motion.div>
                    ))}
                </div>
            )}

            {feature.screen.type === 'sales' && (
                <div className="h-full flex flex-col justify-center space-y-6 md:space-y-8 px-4 md:px-12">
                    <div className="text-center mb-4 md:mb-6">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6 animate-pulse">
                            <DollarSign className="w-8 h-8 md:w-10 md:h-10 text-green-400" />
                        </div>
                        <h4 className="font-bold text-xl md:text-2xl">{feature.screen.title}</h4>
                    </div>

                    <div className="space-y-3 md:space-y-5">
                        {feature.screen.steps.map((step: any, i: number) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.3 }}
                                className="flex items-center space-x-3 md:space-x-5 bg-white/5 p-3 md:p-4 rounded-xl backdrop-blur-sm"
                            >
                                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 shrink-0 ${step.status === 'complete' ? 'bg-green-500 border-green-500' : 'bg-transparent border-green-500/30'
                                    }`}>
                                    {step.status === 'complete' && <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />}
                                    {step.status === 'active' && <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-green-500 rounded-full animate-ping" />}
                                </div>
                                <span className={`text-sm md:text-base ${step.status === 'active' ? 'text-white font-medium' : 'text-white/50'}`}>
                                    {step.text}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Abstract Background Elements */}
            <div className={`absolute -bottom-32 -right-32 w-60 h-60 md:w-80 md:h-80 bg-${feature.color}-500/20 rounded-full blur-[60px] md:blur-[80px] pointer-events-none`} />
            <div className={`absolute -top-32 -left-32 w-60 h-60 md:w-80 md:h-80 bg-${feature.color}-500/10 rounded-full blur-[60px] md:blur-[80px] pointer-events-none`} />
        </div>
    );
};

const IPhoneScreen = ({ feature }: { feature: any }) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
            {/* iPhone Frame - Responsive Height/Aspect Ratio */}
            <div className="h-full max-h-[500px] md:max-h-[580px] w-auto aspect-[9/19.5] bg-black rounded-[2.5rem] md:rounded-[3rem] border-[6px] md:border-[8px] border-zinc-800 overflow-hidden relative shadow-2xl ring-1 ring-white/10">
                {/* Dynamic Island / Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 md:w-28 h-6 md:h-7 bg-black rounded-b-2xl z-20 flex justify-center items-center">
                     <div className="w-12 md:w-16 h-3 md:h-4 bg-zinc-900 rounded-full" />
                </div>
                
                {/* Status Bar Time */}
                <div className="absolute top-2 md:top-3 left-6 md:left-8 text-[8px] md:text-[10px] font-bold text-white z-20">9:41</div>
                
                {/* Signal/Battery */}
                <div className="absolute top-2 md:top-3 right-6 md:right-8 flex space-x-1 z-20">
                     <div className="w-3 md:w-4 h-2 md:h-2.5 bg-white rounded-[1px]" />
                </div>

                <ScreenContent feature={feature} isMobile={true} />
            </div>
        </div>
    );
};

// Keep original LaptopScreen for backward compatibility (not used in carousel)
const LaptopScreen = ({ feature }: { feature: any }) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center">
            {/* MacBook Screen */}
            <div className="w-full aspect-[16/10] bg-black rounded-t-2xl border-[6px] border-zinc-800 overflow-hidden relative shadow-2xl">
                {/* Top Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-5 bg-zinc-900 rounded-b-xl z-20" />
                <ScreenContent feature={feature} />
            </div>

            {/* MacBook Base/Keyboard */}
            <div className="w-[110%] h-3 bg-gradient-to-b from-zinc-700 to-zinc-800 rounded-b-xl shadow-lg" />
            <div className="w-[95%] h-1 bg-zinc-900/50 rounded-b-sm" />
        </div>
    );
};

export default function StickyScrollFeatures() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start 0.9", "end 0.1"]  // Content appears sooner, exits sooner
    });

    const [activeFeature, setActiveFeature] = useState(0);
    const [isInSection, setIsInSection] = useState(false);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isScrollingRef = useRef(false);

    // Snap points for each feature (normalized 0-1)
    const snapPoints = [0.17, 0.5, 0.83]; // Center of each feature range

    // Auto-scroll to nearest snap point
    const snapToNearest = (currentProgress: number) => {
        if (!containerRef.current) return;

        // Find which transition zone we're in
        const transitionZones = [
            { start: 0.30, end: 0.38, snapTo: currentProgress < 0.34 ? 0 : 1 }, // Between feature 0 and 1
            { start: 0.64, end: 0.72, snapTo: currentProgress < 0.68 ? 1 : 2 }, // Between feature 1 and 2
        ];

        for (const zone of transitionZones) {
            if (currentProgress > zone.start && currentProgress < zone.end) {
                // We're in a transition zone - snap to nearest feature
                const targetProgress = snapPoints[zone.snapTo];
                const containerTop = containerRef.current.offsetTop;
                const containerHeight = containerRef.current.scrollHeight - window.innerHeight;
                const targetScrollY = containerTop + (containerHeight * targetProgress);

                window.scrollTo({
                    top: targetScrollY,
                    behavior: 'smooth'
                });
                return;
            }
        }
    };

    useEffect(() => {
        const handleScroll = () => {
            isScrollingRef.current = true;

            // Clear any existing timeout
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }

            // Set new timeout to detect scroll end
            scrollTimeoutRef.current = setTimeout(() => {
                isScrollingRef.current = false;
                // Check if we need to snap
                scrollYProgress.get() && snapToNearest(scrollYProgress.get());
            }, 150); // 150ms after scroll stops
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, [scrollYProgress]);

    useEffect(() => {
        return scrollYProgress.onChange((latest) => {
            // Show progress bar only when user is fully in the section
            setIsInSection(latest > 0.20 && latest < 0.80);

            if (latest < 0.35) setActiveFeature(0);
            else if (latest < 0.7) setActiveFeature(1);
            else setActiveFeature(2);
        });
    }, [scrollYProgress]);

    // Feature ranges with overlap for crossfade effect on text
    const featureRanges = [
        [0, 0.38],      // First feature: 0% to 38%
        [0.32, 0.72],   // Second feature: 32% to 72% (overlap for crossfade)
        [0.66, 1.0]     // Third feature: 66% to 100%
    ];

    return (
        <section ref={containerRef} className="relative h-[600vh] bg-black">
            {/* Background Gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,0.7),rgba(0,0,0,1))]" />

            <div className="sticky top-0 h-screen flex flex-col md:flex-row items-center overflow-hidden w-full">
                <div className="w-full px-4 md:px-16 lg:px-24 relative h-full flex flex-col md:flex-row items-center">

                    {/* Horizontal Progress Segments (Manychat-style) */}
                    <div className={`absolute top-8 md:top-28 left-6 md:left-16 lg:left-24 flex space-x-2 z-50 transition-opacity duration-500 ${isInSection ? 'opacity-100' : 'opacity-0'}`}>
                        {features.map((_, i) => (
                            <div
                                key={i}
                                className={`h-1 rounded-full transition-all duration-700 ease-out relative overflow-hidden ${activeFeature === i ? 'w-14' : 'w-6'
                                    }`}
                            >
                                {/* Background track */}
                                <div className="absolute inset-0 bg-white/20 rounded-full" />
                                {/* Active fill that expands from left to right */}
                                <div
                                    className={`absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 origin-left transition-transform duration-700 ease-out ${activeFeature === i ? 'scale-x-100' : 'scale-x-0'
                                        }`}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Left Column: Text Content - Crossfade effect only (no Y movement) */}
                    <div className="w-full md:w-[45%] relative h-[40vh] md:h-full flex items-end md:items-center justify-start z-20 pb-8 md:pb-0">
                        {features.map((feature, index) => {
                            const [start, end] = featureRanges[index];

                            // Crossfade effect - smooth opacity transition like Manychat
                            const isFirst = index === 0;
                            const isLast = index === features.length - 1;

                            const opacity = useTransform(scrollYProgress,
                                isFirst
                                    ? [0, end - 0.06, end]  // First feature: visible, crossfade out
                                    : isLast
                                        ? [start, start + 0.06, 1.0]  // Last feature: crossfade in, stays visible
                                        : [start, start + 0.06, end - 0.06, end],
                                isFirst
                                    ? [1, 1, 0]  // First feature: start visible
                                    : isLast
                                        ? [0, 1, 1]  // Last feature: stays visible
                                        : [0, 1, 1, 0]
                            );

                            return (
                                <motion.div
                                    key={index}
                                    style={{ opacity, position: 'absolute' }}
                                    className="w-full max-w-lg px-0 md:px-0"
                                >
                                    <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-${feature.color}-500/10 border border-${feature.color}-500/20 text-[10px] md:text-xs font-bold text-${feature.color}-400 uppercase tracking-widest mb-4 md:mb-6`}>
                                        <feature.icon className="w-3 h-3 md:w-4 md:h-4" />
                                        <span>{feature.highlight}</span>
                                    </div>
                                    <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 md:mb-6 leading-tight">
                                        {feature.title}
                                    </h2>
                                    <p className="text-sm md:text-lg md:text-xl text-white/50 leading-relaxed">
                                        {feature.description}
                                    </p>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Right Column: Dynamic Laptop/iPhone - Smooth snap-to-center animation */}
                    <div className="flex w-full md:w-[55%] h-[60vh] md:h-full items-center justify-center relative z-20">

                        {/* BOLD Decorative Background for MacBook Area - Only visible when in section */}
                        <div className={`absolute -inset-2 md:-inset-8 overflow-visible pointer-events-none transition-opacity duration-500 ${isInSection ? 'opacity-100' : 'opacity-0'}`}>
                            {/* Large Gradient Panel - Very Visible */}
                            <div
                                className="absolute inset-0 rounded-3xl"
                                style={{
                                    background: activeFeature === 0
                                        ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 50%, transparent 100%)'
                                        : activeFeature === 1
                                            ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(236, 72, 153, 0.1) 50%, transparent 100%)'
                                            : 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.1) 50%, transparent 100%)',
                                    transition: 'background 0.5s ease'
                                }}
                            />

                            {/* Glowing Border Frame */}
                            <div
                                className="absolute inset-4 rounded-2xl border-2"
                                style={{
                                    borderColor: activeFeature === 0
                                        ? 'rgba(59, 130, 246, 0.3)'
                                        : activeFeature === 1
                                            ? 'rgba(168, 85, 247, 0.3)'
                                            : 'rgba(34, 197, 94, 0.3)',
                                    boxShadow: activeFeature === 0
                                        ? '0 0 60px rgba(59, 130, 246, 0.2), inset 0 0 60px rgba(59, 130, 246, 0.05)'
                                        : activeFeature === 1
                                            ? '0 0 60px rgba(168, 85, 247, 0.2), inset 0 0 60px rgba(168, 85, 247, 0.05)'
                                            : '0 0 60px rgba(34, 197, 94, 0.2), inset 0 0 60px rgba(34, 197, 94, 0.05)',
                                    transition: 'all 0.5s ease'
                                }}
                            />

                            {/* Prominent Grid Pattern */}
                            <div
                                className="absolute inset-0 rounded-3xl opacity-30"
                                style={{
                                    backgroundImage: `
                                        linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
                                        linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)
                                    `,
                                    backgroundSize: '30px 30px'
                                }}
                            />

                            {/* Diagonal Lines Pattern */}
                            <div
                                className="absolute inset-0 rounded-3xl opacity-10"
                                style={{
                                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 21px)'
                                }}
                            />

                            {/* Larger Animated Orbs */}
                            <motion.div
                                className="absolute top-0 right-0 w-[200px] h-[200px] md:w-[500px] md:h-[500px] rounded-full"
                                style={{
                                    background: activeFeature === 0
                                        ? 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, transparent 60%)'
                                        : activeFeature === 1
                                            ? 'radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 60%)'
                                            : 'radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, transparent 60%)',
                                    filter: 'blur(60px)',
                                    transition: 'background 0.5s ease'
                                }}
                                animate={{
                                    scale: [1, 1.15, 1],
                                }}
                                transition={{
                                    duration: 6,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            />
                            <motion.div
                                className="absolute bottom-0 left-0 w-[150px] h-[150px] md:w-[400px] md:h-[400px] rounded-full"
                                style={{
                                    background: activeFeature === 0
                                        ? 'radial-gradient(circle, rgba(139, 92, 246, 0.35) 0%, transparent 60%)'
                                        : activeFeature === 1
                                            ? 'radial-gradient(circle, rgba(236, 72, 153, 0.35) 0%, transparent 60%)'
                                            : 'radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, transparent 60%)',
                                    filter: 'blur(50px)',
                                    transition: 'background 0.5s ease'
                                }}
                                animate={{
                                    scale: [1.15, 1, 1.15],
                                }}
                                transition={{
                                    duration: 5,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            />

                            {/* Corner Accents */}
                            <div className="absolute top-0 right-0 w-12 h-12 md:w-24 md:h-24 border-t-2 border-r-2 rounded-tr-2xl"
                                style={{
                                    borderColor: activeFeature === 0 ? 'rgba(59, 130, 246, 0.5)' : activeFeature === 1 ? 'rgba(168, 85, 247, 0.5)' : 'rgba(34, 197, 94, 0.5)',
                                    transition: 'border-color 0.5s ease'
                                }}
                            />
                            <div className="absolute bottom-0 left-0 w-12 h-12 md:w-24 md:h-24 border-b-2 border-l-2 rounded-bl-2xl"
                                style={{
                                    borderColor: activeFeature === 0 ? 'rgba(59, 130, 246, 0.5)' : activeFeature === 1 ? 'rgba(168, 85, 247, 0.5)' : 'rgba(34, 197, 94, 0.5)',
                                    transition: 'border-color 0.5s ease'
                                }}
                            />
                        </div>

                        <div className="w-full h-full md:w-[550px] md:h-[400px] relative z-10 flex items-center justify-center">
                            {features.map((feature, index) => {
                                const [start, end] = featureRanges[index];
                                const isFirst = index === 0;
                                const isLast = index === features.length - 1;

                                // Larger transition zone for smoother motion (8% of scroll)
                                const transitionSize = 0.08;

                                // Y position: snap to center and stay, then smoothly transition
                                const yRaw = useTransform(
                                    scrollYProgress,
                                    isFirst
                                        ? [0, end - transitionSize, end]
                                        : isLast
                                            ? [start, start + transitionSize, 1.0]
                                            : [start, start + transitionSize, end - transitionSize, end],
                                    isFirst
                                        ? [0, 0, -100]  // Use numbers for spring (vh units)
                                        : isLast
                                            ? [100, 0, 0]
                                            : [100, 0, 0, -100]
                                );

                                // Apply spring for smooth, natural motion
                                const ySmooth = useSpring(yRaw, {
                                    stiffness: 100,
                                    damping: 30,
                                    mass: 1
                                });

                                // Convert to vh units
                                const y = useTransform(ySmooth, (value) => `${value}vh`);

                                return (
                                    <motion.div
                                        key={index}
                                        style={{ y }}
                                        className="absolute inset-0 flex items-center justify-center"
                                    >
                                        {/* Desktop: Laptop Screen */}
                                        <div className="hidden md:block w-full h-full">
                                            <LaptopScreen feature={feature} />
                                        </div>
                                        {/* Mobile: iPhone Screen */}
                                        <div className="block md:hidden w-full h-full transform scale-90">
                                            <IPhoneScreen feature={feature} />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Subtle Background Ambience (Fixed Position) */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {features.map((feature, index) => {
                            const [start, end] = featureRanges[index];
                            const opacity = useTransform(scrollYProgress, [start, start + 0.1, end - 0.1, end], [0, 0.2, 0.2, 0]);

                            return (
                                <motion.div
                                    key={index}
                                    style={{ opacity }}
                                    className={`absolute right-0 top-1/2 -translate-y-1/2 w-[200px] h-[200px] md:w-[600px] md:h-[600px] bg-${feature.color}-500 blur-[80px] md:blur-[120px] rounded-full opacity-20`}
                                />
                            );
                        })}
                    </div>

                </div>
            </div>
        </section>
    );
}
