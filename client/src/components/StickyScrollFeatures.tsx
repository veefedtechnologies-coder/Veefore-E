import { useRef, useState, memo, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, DollarSign, Search, CheckCircle } from 'lucide-react';

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

const IPhoneMockup = memo(({ feature }: { feature: Feature }) => (
    <div className="h-full max-h-[500px] md:max-h-[580px] w-auto aspect-[9/19.5] bg-black rounded-[2.5rem] md:rounded-[3rem] border-[6px] md:border-[8px] border-zinc-800 overflow-hidden relative shadow-2xl ring-1 ring-white/10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 md:w-28 h-6 md:h-7 bg-black rounded-b-2xl z-20 flex justify-center items-center">
            <div className="w-12 md:w-16 h-3 md:h-4 bg-zinc-900 rounded-full" />
        </div>
        <div className="absolute top-2 md:top-3 left-6 md:left-8 text-[8px] md:text-[10px] font-bold text-white z-20">9:41</div>
        <div className="absolute top-2 md:top-3 right-6 md:right-8 flex space-x-1 z-20">
            <div className="w-3 md:w-4 h-2 md:h-2.5 bg-white rounded-[1px]" />
        </div>
        <ScreenContent feature={feature} isMobile={true} />
    </div>
));

const MacBookMockup = memo(({ feature }: { feature: Feature }) => (
    <div className="w-full flex flex-col items-center justify-center">
        <div className="w-full aspect-[16/10] bg-black rounded-t-2xl border-[6px] border-zinc-800 overflow-hidden relative shadow-2xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-5 bg-zinc-900 rounded-b-xl z-20" />
            <ScreenContent feature={feature} />
        </div>
        <div className="w-[110%] h-3 bg-gradient-to-b from-zinc-700 to-zinc-800 rounded-b-xl shadow-lg" />
        <div className="w-[95%] h-1 bg-zinc-900/50 rounded-b-sm" />
    </div>
));

const TextContent = memo(({ feature, isActive }: { feature: Feature; isActive: boolean }) => {
    const colors = colorMap[feature.color];
    
    return (
        <div 
            className="absolute w-full max-w-lg transition-all duration-500 ease-out"
            style={{
                opacity: isActive ? 1 : 0,
                transform: isActive ? 'translateY(0)' : 'translateY(30px)',
                pointerEvents: isActive ? 'auto' : 'none'
            }}
        >
            <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full ${colors.badgeBg} ${colors.border} text-[10px] md:text-xs font-bold ${colors.text} uppercase tracking-widest mb-4 md:mb-6`}>
                <feature.icon className="w-3 h-3 md:w-4 md:h-4" />
                <span>{feature.highlight}</span>
            </div>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 md:mb-6 leading-tight">{feature.title}</h2>
            <p className="text-sm md:text-lg md:text-xl text-white/50 leading-relaxed">{feature.description}</p>
        </div>
    );
});

const MockupSlide = memo(({ feature, state }: { feature: Feature; state: 'before' | 'active' | 'after' }) => {
    const getTransform = () => {
        switch (state) {
            case 'before': return 'translateY(100vh) scale(0.9)';
            case 'active': return 'translateY(0) scale(1)';
            case 'after': return 'translateY(-100vh) scale(0.9)';
        }
    };
    
    return (
        <div 
            className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out will-change-transform"
            style={{ transform: getTransform() }}
        >
            <div className="hidden md:flex w-full h-full items-center justify-center p-8">
                <MacBookMockup feature={feature} />
            </div>
            <div className="flex md:hidden w-full h-full items-center justify-center p-4">
                <IPhoneMockup feature={feature} />
            </div>
        </div>
    );
});

const AmbienceGlow = memo(({ color, isActive }: { color: ColorKey; isActive: boolean }) => {
    const colors = colorMap[color];
    return (
        <div 
            className={`absolute right-0 top-1/2 -translate-y-1/2 w-[200px] h-[200px] md:w-[600px] md:h-[600px] ${colors.bg} blur-[80px] md:blur-[120px] rounded-full pointer-events-none transition-opacity duration-700`}
            style={{ opacity: isActive ? 0.2 : 0 }}
        />
    );
});

export default function StickyScrollFeatures() {
    const containerRef = useRef<HTMLDivElement>(null);
    const sentinel0Ref = useRef<HTMLDivElement>(null);
    const sentinel1Ref = useRef<HTMLDivElement>(null);
    const sentinel2Ref = useRef<HTMLDivElement>(null);
    
    const [activeFeature, setActiveFeature] = useState(0);
    const [isInSection, setIsInSection] = useState(false);
    
    useEffect(() => {
        const sentinels = [sentinel0Ref.current, sentinel1Ref.current, sentinel2Ref.current];
        if (sentinels.some(s => !s)) return;
        
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const index = sentinels.indexOf(entry.target as HTMLDivElement);
                    if (index === -1) return;
                    
                    if (entry.isIntersecting) {
                        setActiveFeature(index);
                        setIsInSection(true);
                    }
                });
            },
            {
                root: null,
                rootMargin: '-40% 0px -40% 0px',
                threshold: 0
            }
        );
        
        sentinels.forEach(sentinel => {
            if (sentinel) observer.observe(sentinel);
        });
        
        return () => observer.disconnect();
    }, []);
    
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsInSection(entry.isIntersecting && entry.intersectionRatio > 0.1);
            },
            { threshold: [0.1, 0.9] }
        );
        
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    const activeColors = useMemo(() => colorMap[features[activeFeature].color], [activeFeature]);
    
    const getMockupState = useCallback((index: number): 'before' | 'active' | 'after' => {
        if (index < activeFeature) return 'after';
        if (index > activeFeature) return 'before';
        return 'active';
    }, [activeFeature]);

    return (
        <section 
            ref={containerRef} 
            className="relative h-[300vh] bg-black"
            style={{ position: 'relative', contain: 'none', transform: 'none' }}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,0.7),rgba(0,0,0,1))]" />

            <div className="absolute top-0 left-0 right-0 h-[100vh]" ref={sentinel0Ref} />
            <div className="absolute top-[100vh] left-0 right-0 h-[100vh]" ref={sentinel1Ref} />
            <div className="absolute top-[200vh] left-0 right-0 h-[100vh]" ref={sentinel2Ref} />

            <div 
                className="sticky top-0 h-screen flex flex-col md:flex-row items-center w-full overflow-hidden"
                style={{ position: 'sticky', WebkitOverflowScrolling: 'touch' }}
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
                        {features.map((feature, i) => (
                            <TextContent key={i} feature={feature} isActive={activeFeature === i} />
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
                                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                            />
                        </div>

                        <div className="w-full h-full max-w-[340px] md:max-w-[700px] relative overflow-hidden">
                            {features.map((feature, i) => (
                                <MockupSlide key={i} feature={feature} state={getMockupState(i)} />
                            ))}
                        </div>
                    </div>

                    {features.map((feature, i) => (
                        <AmbienceGlow key={i} color={feature.color} isActive={activeFeature === i} />
                    ))}
                </div>
            </div>
        </section>
    );
}
