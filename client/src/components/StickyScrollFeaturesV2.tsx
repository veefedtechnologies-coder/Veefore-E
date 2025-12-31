import { useRef, useState, memo, useMemo, useEffect } from 'react';
import { motion, useScroll, useSpring, useMotionValueEvent } from 'framer-motion';
import { MessageSquare, DollarSign, Search, CheckCircle } from 'lucide-react';

const springConfig = { stiffness: 100, damping: 20, mass: 0.5 };

const colorMap = {
    blue: {
        bg: 'bg-blue-500/20',
        bgLight: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        text: 'text-blue-400',
        badgeBg: 'bg-blue-500/10',
        gradient: 'from-blue-500 to-purple-500',
        orbPrimary: 'rgba(59, 130, 246, 0.4)',
        orbSecondary: 'rgba(139, 92, 246, 0.35)',
        panelGradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 50%, transparent 100%)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        boxShadow: '0 0 60px rgba(59, 130, 246, 0.2), inset 0 0 60px rgba(59, 130, 246, 0.05)',
    },
    purple: {
        bg: 'bg-purple-500/20',
        bgLight: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        text: 'text-purple-400',
        badgeBg: 'bg-purple-500/10',
        gradient: 'from-purple-500 to-pink-500',
        orbPrimary: 'rgba(168, 85, 247, 0.4)',
        orbSecondary: 'rgba(236, 72, 153, 0.35)',
        panelGradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(236, 72, 153, 0.1) 50%, transparent 100%)',
        borderColor: 'rgba(168, 85, 247, 0.3)',
        boxShadow: '0 0 60px rgba(168, 85, 247, 0.2), inset 0 0 60px rgba(168, 85, 247, 0.05)',
    },
    green: {
        bg: 'bg-green-500/20',
        bgLight: 'bg-green-500/10',
        border: 'border-green-500/20',
        text: 'text-green-400',
        badgeBg: 'bg-green-500/10',
        gradient: 'from-green-500 to-emerald-500',
        orbPrimary: 'rgba(34, 197, 94, 0.4)',
        orbSecondary: 'rgba(16, 185, 129, 0.35)',
        panelGradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.1) 50%, transparent 100%)',
        borderColor: 'rgba(34, 197, 94, 0.3)',
        boxShadow: '0 0 60px rgba(34, 197, 94, 0.2), inset 0 0 60px rgba(34, 197, 94, 0.05)',
    }
} as const;

type ColorKey = keyof typeof colorMap;

interface Feature {
    title: string;
    description: string;
    highlight: string;
    icon: typeof Search | typeof MessageSquare | typeof DollarSign;
    color: ColorKey;
    screen: {
        type: 'analysis' | 'chat' | 'sales';
        title?: string;
        stats?: Array<{ label: string; value: string; color: string }>;
        points?: string[];
        messages?: Array<{ user: string; text: string; time: string }>;
        steps?: Array<{ text: string; status: string }>;
    };
}

const features: Feature[] = [
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


function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * Math.max(0, Math.min(1, t));
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const t = (value - inMin) / (inMax - inMin);
    return lerp(outMin, outMax, t);
}

const ScreenContent = memo(({ feature, isMobile = false }: { feature: Feature, isMobile?: boolean }) => {
    const colors = colorMap[feature.color];
    
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
                                <div className={`text-3xl md:text-5xl font-bold ${feature.screen.stats?.[0]?.color}`}>{feature.screen.stats?.[0]?.value}</div>
                            </div>
                        </div>
                        <div className="h-2 md:h-3 bg-white/10 rounded-full overflow-hidden">
                            <div className={`h-full w-[98%] bg-gradient-to-r ${colors.gradient}`} />
                        </div>
                    </div>

                    <div className={`grid ${isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-3 gap-4'}`}>
                        {feature.screen.points?.map((point: string, i: number) => (
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
                    {feature.screen.messages?.map((msg, i: number) => (
                        <div
                            key={i}
                            className={`max-w-[85%] md:max-w-[70%] p-4 md:p-5 rounded-2xl ${msg.user === 'me'
                                ? 'bg-purple-500 text-white self-end rounded-br-none ml-auto'
                                : 'bg-white/10 text-white self-start rounded-bl-none backdrop-blur-sm'
                                }`}
                        >
                            <p className="text-sm md:text-base font-medium">{msg.text}</p>
                            <p className={`text-[10px] md:text-xs mt-2 opacity-60 ${msg.user === 'me' ? 'text-white' : 'text-white/60'}`}>{msg.time}</p>
                        </div>
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
                        {feature.screen.steps?.map((step, i: number) => (
                            <div
                                key={i}
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
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className={`absolute -bottom-32 -right-32 w-60 h-60 md:w-80 md:h-80 ${colors.bg} rounded-full blur-[40px] md:blur-[60px] pointer-events-none`} />
            <div className={`absolute -top-32 -left-32 w-60 h-60 md:w-80 md:h-80 ${colors.bgLight} rounded-full blur-[40px] md:blur-[60px] pointer-events-none`} />
        </div>
    );
});

const IPhoneScreen = memo(({ feature }: { feature: Feature }) => {
    return (
        <div 
            className="w-full h-full flex flex-col items-center justify-center p-4"
            style={{
                WebkitTransform: 'translate3d(0,0,0)',
                transform: 'translate3d(0,0,0)',
            }}
        >
            <div 
                className="h-full max-h-[500px] md:max-h-[580px] w-auto aspect-[9/19.5] bg-black rounded-[2.5rem] md:rounded-[3rem] border-[6px] md:border-[8px] border-zinc-800 overflow-hidden relative shadow-2xl ring-1 ring-white/10"
                style={{
                    WebkitBackfaceVisibility: 'hidden',
                    backfaceVisibility: 'hidden',
                    WebkitTransformStyle: 'preserve-3d',
                }}
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 md:w-28 h-6 md:h-7 bg-black rounded-b-2xl z-20 flex justify-center items-center">
                    <div className="w-12 md:w-16 h-3 md:h-4 bg-zinc-900 rounded-full" />
                </div>
                <div className="absolute top-2 md:top-3 left-6 md:left-8 text-[8px] md:text-[10px] font-bold text-white z-20">9:41</div>
                <div className="absolute top-2 md:top-3 right-6 md:right-8 flex space-x-1 z-20">
                    <div className="w-3 md:w-4 h-2 md:h-2.5 bg-white rounded-[1px]" />
                </div>
                <ScreenContent feature={feature} isMobile={true} />
            </div>
        </div>
    );
});

const LaptopScreen = memo(({ feature }: { feature: Feature }) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-full aspect-[16/10] bg-black rounded-t-2xl border-[6px] border-zinc-800 overflow-hidden relative shadow-2xl">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-5 bg-zinc-900 rounded-b-xl z-20" />
                <ScreenContent feature={feature} />
            </div>
            <div className="w-[110%] h-3 bg-gradient-to-b from-zinc-700 to-zinc-800 rounded-b-xl shadow-lg" />
            <div className="w-[95%] h-1 bg-zinc-900/50 rounded-b-sm" />
        </div>
    );
});

interface TextSlideProps {
    feature: Feature;
    opacity: number;
    y: number;
}

const TextSlide = memo(({ feature, opacity, y }: TextSlideProps) => {
    const colors = colorMap[feature.color];
    const opacityValue = useSpring(opacity, springConfig);
    const yValue = useSpring(y, springConfig);

    useEffect(() => {
        opacityValue.set(opacity);
        yValue.set(y);
    }, [opacity, y]);

    return (
        <motion.div 
            style={{ opacity: opacityValue, y: yValue }} 
            className="absolute w-full max-w-lg"
        >
            <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full ${colors.badgeBg} ${colors.border} text-[10px] md:text-xs font-bold ${colors.text} uppercase tracking-widest mb-4 md:mb-6`}>
                <feature.icon className="w-3 h-3 md:w-4 md:h-4" />
                <span>{feature.highlight}</span>
            </div>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 md:mb-6 leading-tight">{feature.title}</h2>
            <p className="text-sm md:text-lg md:text-xl text-white/50 leading-relaxed">{feature.description}</p>
        </motion.div>
    );
});

interface MockupSlideProps {
    feature: Feature;
    y: number;
    scale: number;
    isVisible: boolean;
    isStatic?: boolean;
}

const MockupSlide = memo(({ feature, y, scale, isVisible, isStatic = false }: MockupSlideProps) => {
    const springY = useSpring(y, springConfig);
    const springScale = useSpring(scale, springConfig);

    useEffect(() => {
        springY.set(y);
        springScale.set(scale);
    }, [y, scale]);

    if (isStatic) {
        return (
            <div 
                style={{ 
                    transform: `translate3d(0, 0, 0) scale(1)`,
                    WebkitTransform: `translate3d(0, 0, 0) scale(1)`,
                    visibility: 'visible',
                    opacity: 1,
                    WebkitBackfaceVisibility: 'hidden',
                    backfaceVisibility: 'hidden',
                }} 
                className="absolute inset-0 flex items-center justify-center z-10"
            >
                <div className="hidden md:block w-full h-full"><LaptopScreen feature={feature} /></div>
                <div className="block md:hidden w-full h-full"><IPhoneScreen feature={feature} /></div>
            </div>
        );
    }

    if (!isVisible && y > 50) return null;

    return (
        <motion.div 
            style={{ 
                y: springY,
                scale: springScale,
            }} 
            className="absolute inset-0 flex items-center justify-center will-change-transform"
        >
            <div className="hidden md:block w-full h-full"><LaptopScreen feature={feature} /></div>
            <div className="block md:hidden w-full h-full"><IPhoneScreen feature={feature} /></div>
        </motion.div>
    );
});

const AmbientGlow = memo(({ colors, opacity }: { colors: typeof colorMap[ColorKey], opacity: number }) => {
    const springOpacity = useSpring(opacity, springConfig);

    useEffect(() => {
        springOpacity.set(opacity);
    }, [opacity]);

    return (
        <motion.div 
            style={{ opacity: springOpacity }} 
            className={`absolute right-0 top-1/2 -translate-y-1/2 w-[200px] h-[200px] md:w-[600px] md:h-[600px] ${colors.bg} blur-[80px] md:blur-[120px] rounded-full will-change-[opacity]`} 
        />
    );
});

export default function StickyScrollFeaturesV2() {
    const containerRef = useRef<HTMLElement>(null);
    const [hasMounted, setHasMounted] = useState(false);
    const [progress, setProgress] = useState(0);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });

    const smoothProgress = useSpring(scrollYProgress, {
        stiffness: 50,
        damping: 20,
        mass: 0.5
    });

    useMotionValueEvent(smoothProgress, "change", (latest) => {
        // Clamp progress to valid range to handle edge cases on tall screens
        setProgress(Math.max(0, Math.min(1, latest)));
    });

    useEffect(() => {
        const timer = setTimeout(() => setHasMounted(true), 300);
        return () => clearTimeout(timer);
    }, []);

    const activeFeature = useMemo(() => {
        if (progress < 0.33) return 0;
        if (progress < 0.66) return 1;
        return 2;
    }, [progress]);

    const isInSection = progress > 0.05 && progress < 0.95;
    const activeColors = colorMap[features[activeFeature].color];

    const textSlides = useMemo(() => {
        return features.map((feature, i) => {
            let opacity = 0;
            let y = 30;

            if (i === 0) {
                opacity = mapRange(progress, 0, 0.27, 1, 1);
                if (progress > 0.27) opacity = mapRange(progress, 0.27, 0.33, 1, 0);
                y = progress > 0.27 ? mapRange(progress, 0.27, 0.33, 0, -30) : 0;
                if (progress < 0.05) { opacity = 1; y = 0; }
            } else if (i === 1) {
                opacity = mapRange(progress, 0.30, 0.36, 0, 1);
                if (progress > 0.60) opacity = mapRange(progress, 0.60, 0.66, 1, 0);
                y = progress < 0.36 ? mapRange(progress, 0.30, 0.36, 30, 0) : 
                    progress > 0.60 ? mapRange(progress, 0.60, 0.66, 0, -30) : 0;
            } else {
                opacity = mapRange(progress, 0.63, 0.70, 0, 1);
                y = progress < 0.70 ? mapRange(progress, 0.63, 0.70, 30, 0) : 0;
            }

            return { feature, opacity: Math.max(0, Math.min(1, opacity)), y };
        });
    }, [progress]);

    const mockupSlides = useMemo(() => {
        return features.map((feature, i) => {
            let y = 0;
            let scale = 1;
            let isVisible = true;
            let isStatic = false;

            if (i === 0) {
                // Always show first mockup at start - critical for iPhone 16 Pro Max
                if (!hasMounted || progress < 0.05) {
                    y = 0;
                    scale = 1;
                    isStatic = true;
                    isVisible = true;
                } else {
                    y = progress > 0.27 ? mapRange(progress, 0.27, 0.33, 0, -100) * window.innerHeight / 100 : 0;
                    scale = progress > 0.27 ? mapRange(progress, 0.27, 0.33, 1, 0.9) : 1;
                    isVisible = progress < 0.40;
                }
            } else if (i === 1) {
                const enterY = mapRange(progress, 0.30, 0.36, 100, 0);
                const exitY = mapRange(progress, 0.60, 0.66, 0, -100);
                y = (progress < 0.36 ? enterY : progress > 0.60 ? exitY : 0) * window.innerHeight / 100;
                scale = progress < 0.40 ? mapRange(progress, 0.30, 0.40, 0.9, 1) : 
                        progress > 0.56 ? mapRange(progress, 0.56, 0.66, 1, 0.9) : 1;
                isVisible = progress > 0.27 && progress < 0.70;
            } else {
                y = mapRange(progress, 0.63, 0.70, 100, 0) * window.innerHeight / 100;
                scale = mapRange(progress, 0.63, 0.73, 0.9, 1);
                isVisible = progress > 0.60;
            }

            return { feature, y, scale: Math.max(0.9, Math.min(1, scale)), isVisible, isStatic };
        });
    }, [progress, hasMounted]);

    const ambientOpacities = useMemo(() => {
        return features.map((_, i) => {
            if (i === 0) {
                let op = mapRange(progress, 0, 0.1, 0, 0.2);
                if (progress > 0.23) op = mapRange(progress, 0.23, 0.33, 0.2, 0);
                return Math.max(0, Math.min(0.2, op));
            } else if (i === 1) {
                let op = mapRange(progress, 0.30, 0.40, 0, 0.2);
                if (progress > 0.56) op = mapRange(progress, 0.56, 0.66, 0.2, 0);
                return Math.max(0, Math.min(0.2, op));
            } else {
                return Math.max(0, Math.min(0.2, mapRange(progress, 0.63, 0.73, 0, 0.2)));
            }
        });
    }, [progress]);

    return (
        <section 
            ref={containerRef} 
            className="h-[450vh] bg-black"
            style={{ position: 'relative' }}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,0.7),rgba(0,0,0,1))]" />

            <div 
                className="sticky top-0 h-screen flex flex-col md:flex-row items-center w-full"
                style={{ 
                    position: 'sticky',
                    WebkitOverflowScrolling: 'touch'
                }}
            >
                <div className="w-full px-4 md:px-16 lg:px-24 relative h-full flex flex-col md:flex-row items-center">

                    <div className={`absolute top-8 md:top-28 left-6 md:left-16 lg:left-24 flex space-x-2 z-50 transition-opacity duration-500 ${isInSection ? 'opacity-100' : 'opacity-0'}`}>
                        {features.map((_, i) => (
                            <div key={i} className={`h-1 rounded-full transition-all duration-700 ease-out relative overflow-hidden ${activeFeature === i ? 'w-14' : 'w-6'}`}>
                                <div className="absolute inset-0 bg-white/20 rounded-full" />
                                <div className={`absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 origin-left transition-transform duration-700 ease-out ${activeFeature === i ? 'scale-x-100' : 'scale-x-0'}`} />
                            </div>
                        ))}
                    </div>

                    <div className="w-full md:w-[45%] relative h-[40vh] md:h-full flex items-end md:items-center justify-start z-20 pb-8 md:pb-0">
                        {textSlides.map(({ feature, opacity, y }, i) => (
                            <TextSlide key={i} feature={feature} opacity={opacity} y={y} />
                        ))}
                    </div>

                    <div className="flex w-full md:w-[55%] h-[60vh] md:h-full items-center justify-center relative z-20">
                        <div className={`absolute -inset-2 md:-inset-8 overflow-visible pointer-events-none transition-opacity duration-500 ${isInSection ? 'opacity-100' : 'opacity-0'}`}>
                            <div className="absolute inset-0 rounded-3xl transition-all duration-500" style={{ background: activeColors.panelGradient }} />
                            <div className="absolute inset-4 rounded-2xl border-2 transition-all duration-500" style={{ borderColor: activeColors.borderColor, boxShadow: activeColors.boxShadow }} />
                            <div className="absolute inset-0 rounded-3xl opacity-30" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)`, backgroundSize: '30px 30px' }} />
                            <div className="absolute inset-0 rounded-3xl opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 21px)' }} />
                            <motion.div
                                className="absolute top-0 right-0 w-[200px] h-[200px] md:w-[500px] md:h-[500px] rounded-full transition-all duration-500"
                                style={{ background: `radial-gradient(circle, ${activeColors.orbPrimary} 0%, transparent 60%)`, filter: 'blur(60px)' }}
                                animate={{ scale: [1, 1.15, 1] }}
                                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                            />
                            <motion.div
                                className="absolute bottom-0 left-0 w-[150px] h-[150px] md:w-[400px] md:h-[400px] rounded-full transition-all duration-500"
                                style={{ background: `radial-gradient(circle, ${activeColors.orbSecondary} 0%, transparent 60%)`, filter: 'blur(50px)' }}
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                            />
                        </div>

                        <div 
                            className="relative w-full h-[90%] md:h-[80%] max-w-[700px]"
                            style={{
                                WebkitTransform: 'translate3d(0,0,0)',
                                transform: 'translate3d(0,0,0)',
                                WebkitBackfaceVisibility: 'hidden',
                                backfaceVisibility: 'hidden',
                            }}
                        >
                            {mockupSlides.map(({ feature, y, scale, isVisible, isStatic }, i) => (
                                <MockupSlide key={i} feature={feature} y={y} scale={scale} isVisible={isVisible} isStatic={isStatic} />
                            ))}
                        </div>
                    </div>

                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {features.map((feature, i) => (
                            <AmbientGlow key={i} colors={colorMap[feature.color]} opacity={ambientOpacities[i]} />
                        ))}
                    </div>

                </div>
            </div>
        </section>
    );
}
