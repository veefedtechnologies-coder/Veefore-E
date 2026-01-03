import { useRef, useState, memo, useEffect } from 'react';
import { motion, useScroll, useSpring, useMotionValueEvent, useTransform } from 'framer-motion';
import { MessageSquare, DollarSign, Search, CheckCircle } from 'lucide-react';
import { ScrollHint } from './ui/ScrollHint';
import { GPU_ACCELERATED_STYLES, MOBILE_OPTIMIZED_LAYER } from '../lib/animation-performance';

// Lightning fast spring config - low solver overhead
const springConfig = { stiffness: 200, damping: 30, mass: 1 };

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

    // Updated padding: removed top padding on mobile as IphoneMockup handles it now
    const baseClasses = isMobile
        ? "h-full w-full p-2 sm:p-3 pt-4 sm:pt-6 flex flex-col relative z-10 bg-gradient-to-br from-zinc-900 to-black overflow-hidden"
        : "h-full w-full p-4 md:p-6 lg:p-8 pt-10 md:pt-12 flex flex-col relative z-10 bg-gradient-to-br from-zinc-900 to-black overflow-hidden";

    return (
        <div className={baseClasses}>
            {feature.screen.type === 'analysis' && (
                <div className={`${isMobile ? 'space-y-2 sm:space-y-3' : 'space-y-4 md:space-y-6'} h-full flex flex-col justify-center`}>
                    <div className={`bg-white/5 ${isMobile ? 'rounded-xl p-2 sm:p-3' : 'rounded-2xl p-4 md:p-6'} border border-white/10 backdrop-blur-sm`}>
                        <h4 className={`${isMobile ? 'text-[8px] sm:text-[10px] mb-2 sm:mb-3' : 'text-xs md:text-sm mb-4 md:mb-6'} text-white/50 uppercase tracking-widest`}>{feature.screen.title}</h4>
                        <div className={`flex justify-between items-end ${isMobile ? 'mb-2 sm:mb-3' : 'mb-4 md:mb-6'}`}>
                            <div>
                                <div className={`${isMobile ? 'text-lg sm:text-xl' : 'text-3xl md:text-5xl'} font-bold text-white mb-0.5 md:mb-2`}>High</div>
                                <div className={`${isMobile ? 'text-[8px] sm:text-[10px]' : 'text-xs md:text-sm'} text-white/50`}>Potential</div>
                            </div>
                            <div className="text-right">
                                <div className={`${isMobile ? 'text-lg sm:text-xl' : 'text-3xl md:text-5xl'} font-bold ${feature.screen.stats?.[0]?.color}`}>{feature.screen.stats?.[0]?.value}</div>
                            </div>
                        </div>
                        <div className={`${isMobile ? 'h-1.5 sm:h-2' : 'h-2 md:h-3'} bg-white/10 rounded-full overflow-hidden`}>
                            <div className={`h-full w-[98%] bg-gradient-to-r ${colors.gradient}`} />
                        </div>
                    </div>

                    <div className={`grid ${isMobile ? 'grid-cols-1 gap-1.5 sm:gap-2' : 'grid-cols-3 gap-4'}`}>
                        {feature.screen.points?.map((point: string, i: number) => (
                            <div key={i} className={`flex items-center ${isMobile ? 'space-x-1.5 sm:space-x-2 p-1.5 sm:p-2 rounded-lg' : 'space-x-2 md:space-x-3 p-3 md:p-4 rounded-xl'} bg-white/5 border border-white/5 backdrop-blur-sm`}>
                                <div className={`${isMobile ? 'w-1 h-1 sm:w-1.5 sm:h-1.5' : 'w-1.5 h-1.5 md:w-2 md:h-2'} rounded-full bg-blue-500 shrink-0`} />
                                <span className={`${isMobile ? 'text-[8px] sm:text-[10px]' : 'text-xs md:text-sm'} text-white/80 truncate`}>{point}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {feature.screen.type === 'chat' && (
                <div className={`${isMobile ? 'space-y-2 sm:space-y-3 px-1 sm:px-2' : 'space-y-4 md:space-y-6 px-4 md:px-12'} h-full justify-center flex flex-col`}>
                    {feature.screen.messages?.map((msg, i: number) => (
                        <div
                            key={i}
                            className={`${isMobile ? 'max-w-[90%] p-2 sm:p-3 rounded-xl' : 'max-w-[85%] md:max-w-[70%] p-4 md:p-5 rounded-2xl'} ${msg.user === 'me'
                                ? 'bg-purple-500 text-white self-end rounded-br-none ml-auto'
                                : 'bg-white/10 text-white self-start rounded-bl-none backdrop-blur-sm'
                                }`}
                        >
                            <p className={`${isMobile ? 'text-[10px] sm:text-xs' : 'text-sm md:text-base'} font-medium`}>{msg.text}</p>
                            <p className={`${isMobile ? 'text-[8px] sm:text-[9px] mt-1' : 'text-[10px] md:text-xs mt-2'} opacity-60 ${msg.user === 'me' ? 'text-white' : 'text-white/60'}`}>{msg.time}</p>
                        </div>
                    ))}
                </div>
            )}

            {feature.screen.type === 'sales' && (
                <div className={`h-full flex flex-col justify-center ${isMobile ? 'space-y-3 sm:space-y-4 px-1 sm:px-2' : 'space-y-6 md:space-y-8 px-4 md:px-12'}`}>
                    <div className={`text-center ${isMobile ? 'mb-1 sm:mb-2' : 'mb-4 md:mb-6'}`}>
                        <div className={`${isMobile ? 'w-10 h-10 sm:w-12 sm:h-12 mb-2 sm:mb-3' : 'w-16 h-16 md:w-20 md:h-20 mb-4 md:mb-6'} bg-green-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse`}>
                            <DollarSign className={`${isMobile ? 'w-5 h-5 sm:w-6 sm:h-6' : 'w-8 h-8 md:w-10 md:h-10'} text-green-400`} />
                        </div>
                        <h4 className={`font-bold ${isMobile ? 'text-sm sm:text-base' : 'text-xl md:text-2xl'}`}>{feature.screen.title}</h4>
                    </div>

                    <div className={`${isMobile ? 'space-y-1.5 sm:space-y-2' : 'space-y-3 md:space-y-5'}`}>
                        {feature.screen.steps?.map((step, i: number) => (
                            <div
                                key={i}
                                className={`flex items-center ${isMobile ? 'space-x-2 sm:space-x-3 p-1.5 sm:p-2 rounded-lg' : 'space-x-3 md:space-x-5 p-3 md:p-4 rounded-xl'} bg-white/5 backdrop-blur-sm`}
                            >
                                <div className={`${isMobile ? 'w-5 h-5 sm:w-6 sm:h-6 border' : 'w-8 h-8 md:w-10 md:h-10 border-2'} rounded-full flex items-center justify-center shrink-0 ${step.status === 'complete' ? 'bg-green-500 border-green-500' : 'bg-transparent border-green-500/30'
                                    }`}>
                                    {step.status === 'complete' && <CheckCircle className={`${isMobile ? 'w-2.5 h-2.5 sm:w-3 sm:h-3' : 'w-4 h-4 md:w-5 md:h-5'} text-white`} />}
                                    {step.status === 'active' && <div className={`${isMobile ? 'w-1.5 h-1.5 sm:w-2 sm:h-2' : 'w-2.5 h-2.5 md:w-3 md:h-3'} bg-green-500 rounded-full animate-ping`} />}
                                </div>
                                <span className={`${isMobile ? 'text-[9px] sm:text-[10px]' : 'text-sm md:text-base'} ${step.status === 'active' ? 'text-white font-medium' : 'text-white/50'}`}>
                                    {step.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className={`absolute -bottom-32 -right-32 ${isMobile ? 'w-40 h-40 sm:w-48 sm:h-48 blur-[15px] sm:blur-[20px]' : 'w-60 h-60 md:w-80 md:h-80 blur-[20px] md:blur-[30px]'} ${colors.bg} rounded-full pointer-events-none`} />
            <div className={`absolute -top-32 -left-32 ${isMobile ? 'w-40 h-40 sm:w-48 sm:h-48 blur-[15px] sm:blur-[20px]' : 'w-60 h-60 md:w-80 md:h-80 blur-[20px] md:blur-[30px]'} ${colors.bgLight} rounded-full pointer-events-none`} />
        </div>
    );
});

import { IphoneMockup } from './ui/iphone-mockup';

const IPhoneScreen = memo(({ feature }: { feature: Feature }) => {
    return (
        <div
            className="w-full h-full flex flex-col items-center justify-center pointer-events-none"
            style={{
                ...GPU_ACCELERATED_STYLES,
            }}
        >
            <div className="scale-[0.6] sm:scale-[0.7] md:scale-[0.8] origin-center sm:-mt-0">
                <IphoneMockup className="shadow-2xl">
                    <ScreenContent feature={feature} isMobile={true} />
                </IphoneMockup>
            </div>
        </div>
    );
});

const LaptopScreen = memo(({ feature }: { feature: Feature }) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center" style={GPU_ACCELERATED_STYLES}>
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
    opacity: any; // Allow MotionValue or number
    y: any;       // Allow MotionValue or number
}

// Faster text spring for snappier transitions
const textSpringConfig = { stiffness: 240, damping: 30, mass: 0.5 };

const TextSlide = memo(({ feature, opacity, y }: TextSlideProps) => {
    const colors = colorMap[feature.color];
    // Cast to any to bypass strict type checking for motion vs number mix
    const opacityValue = useSpring(opacity as any, textSpringConfig);
    const yValue = useSpring(y as any, textSpringConfig);

    useEffect(() => {
        if (typeof opacity === 'number') opacityValue.set(opacity as any);
        if (typeof y === 'number') yValue.set(y as any);
    }, [opacity, y]);

    return (
        <motion.div
            style={{ opacity: opacityValue, y: yValue, ...GPU_ACCELERATED_STYLES }}
            className="absolute w-full max-w-lg"
        >
            <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full ${colors.badgeBg} ${colors.border} text-[10px] md:text-xs font-bold ${colors.text} uppercase tracking-widest mb-4 md:mb-6`}>
                <feature.icon className="w-3 h-3 md:w-4 md:h-4" />
                <span>{feature.highlight}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-3 md:mb-6 leading-tight">{feature.title}</h2>
            <p className="text-xs sm:text-sm md:text-lg md:text-xl text-white/50 leading-relaxed max-w-sm md:max-w-none">{feature.description}</p>
        </motion.div>
    );
});

interface MockupSlideProps {
    feature: Feature;
    y: any;       // Allow MotionValue or number
    scale: any;   // Allow MotionValue or number
    isVisible: boolean;
    isStatic?: boolean;
    opacity?: any; // Allow MotionValue or number
}

// Faster mockup spring for snappier transitions
const mockupSpringConfig = { stiffness: 220, damping: 30, mass: 0.5 };

const MockupSlide = memo(({ feature, y, scale, isVisible, isStatic = false, opacity }: MockupSlideProps) => {
    // Cast to any to bypass strict type checking
    const springY = useSpring(y as any, mockupSpringConfig);
    const springScale = useSpring(scale as any, mockupSpringConfig);

    // Only use spring for opacity if it's a number (if it's a MotionValue, use it directly)
    const springOpacity = useSpring((typeof opacity === 'number' ? opacity : 1), mockupSpringConfig);

    useEffect(() => {
        if (typeof y === 'number') springY.set(y);
        if (typeof scale === 'number') springScale.set(scale);
        if (typeof opacity === 'number') springOpacity.set(opacity);
    }, [y, scale, opacity]);

    if (isStatic) {
        return (
            <div
                style={{
                    ...GPU_ACCELERATED_STYLES,
                    visibility: 'visible',
                    opacity: 1,
                }}
                className="absolute inset-0 flex items-center justify-center z-10"
            >
                <div className="hidden md:block w-full h-full"><LaptopScreen feature={feature} /></div>
                <div className="block md:hidden w-full h-full"><IPhoneScreen feature={feature} /></div>
            </div>
        );
    }

    // Fallback visibility logic if opacity is not provided or is just a number
    const shouldHide = !isVisible && y > 50;

    // Determine final opacity to use: explicit prop (if MotionValue or number), or calculated fallback
    const finalOpacity = opacity !== undefined
        ? (typeof opacity === 'number' ? springOpacity : opacity)
        : (shouldHide ? 0 : 1);

    return (
        <motion.div
            style={{
                y: springY,
                scale: springScale,
                ...MOBILE_OPTIMIZED_LAYER,
                opacity: finalOpacity,
                // Only hide visibility if purely based on the fallback boolean logic and opacity is 0
                visibility: (finalOpacity === 0 || (typeof finalOpacity === 'number' && finalOpacity === 0)) ? 'hidden' : 'visible',
                pointerEvents: (finalOpacity === 0 || (typeof finalOpacity === 'number' && finalOpacity === 0)) ? 'none' : 'auto',
            }}
            className="absolute inset-0 flex items-center justify-center"
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
            style={{ opacity: springOpacity, ...MOBILE_OPTIMIZED_LAYER }}
            className={`absolute right-0 top-1/2 -translate-y-1/2 w-[200px] h-[200px] md:w-[600px] md:h-[600px] ${colors.bg} blur-[80px] md:blur-[120px] rounded-full`}
        />
    );
});

const MotionTextSlide = ({ feature, index, progress }: { feature: Feature; index: number; progress: any }) => {
    const opacity = useTransform(progress, (p: number) => {
        // Apply snap logic inside transform
        const snapPoints = [0, 0.33, 0.66, 1];
        const snapStrength = 0.25;
        let snapped = p;
        for (const snap of snapPoints) {
            const dist = Math.abs(p - snap);
            if (dist < snapStrength) {
                const factor = dist / snapStrength;
                const eased = factor * factor;
                snapped = snap + (p - snap > 0 ? 1 : -1) * eased * snapStrength;
            }
        }

        const i = index;
        if (i === 0) {
            let op = mapRange(snapped, 0, 0.28, 1, 1);
            if (snapped > 0.28) op = mapRange(snapped, 0.28, 0.35, 1, 0);
            return Math.max(0, Math.min(1, op));
        } else if (i === 1) {
            let op = mapRange(snapped, 0.31, 0.38, 0, 1);
            if (snapped > 0.58) op = mapRange(snapped, 0.58, 0.65, 1, 0);
            return Math.max(0, Math.min(1, op));
        } else {
            const op = mapRange(snapped, 0.62, 0.69, 0, 1);
            return Math.max(0, Math.min(1, op));
        }
    });

    const y = useTransform(progress, (p: number) => {
        // Apply snap logic
        const snapPoints = [0, 0.33, 0.66, 1];
        const snapStrength = 0.15;
        let snapped = p;
        for (const snap of snapPoints) {
            const dist = Math.abs(p - snap);
            if (dist < snapStrength) {
                const factor = dist / snapStrength;
                const eased = factor * factor;
                snapped = snap + (p - snap > 0 ? 1 : -1) * eased * snapStrength;
            }
        }

        const i = index;
        if (i === 0) {
            return snapped > 0.28 ? mapRange(snapped, 0.28, 0.35, 0, -40) : 0;
        } else if (i === 1) {
            return snapped < 0.38 ? mapRange(snapped, 0.31, 0.38, 40, 0) :
                snapped > 0.58 ? mapRange(snapped, 0.58, 0.65, 0, -40) : 0;
        } else {
            return snapped < 0.69 ? mapRange(snapped, 0.62, 0.69, 40, 0) : 0;
        }
    });

    return <TextSlide feature={feature} opacity={opacity} y={y} />;
};

const MotionMockupSlide = ({ feature, index, progress }: { feature: Feature; index: number; progress: any }) => {
    const transformValues = useTransform(progress, (p: number) => {
        // Apply snap logic
        const snapPoints = [0, 0.33, 0.66, 1];
        const snapStrength = 0.25;
        let snapped = p;
        for (const snap of snapPoints) {
            const dist = Math.abs(p - snap);
            if (dist < snapStrength) {
                const factor = dist / snapStrength;
                const eased = factor * factor;
                snapped = snap + (p - snap > 0 ? 1 : -1) * eased * snapStrength;
            }
        }

        const i = index;
        let y = 0;
        let scale = 1;
        let isVisible = true;
        let isStatic = false;

        // Tighter transition windows for sharper mockup changes
        if (i === 0) {
            if (snapped < 0.05) {
                isStatic = true;
                isVisible = true;
            } else {
                y = snapped > 0.28 ? mapRange(snapped, 0.28, 0.35, 0, -100) * (typeof window !== 'undefined' ? window.innerHeight : 800) / 100 : 0;
                scale = snapped > 0.28 ? mapRange(snapped, 0.28, 0.35, 1, 0.85) : 1;
                isVisible = snapped < 0.40;
            }
        } else if (i === 1) {
            const enterY = mapRange(snapped, 0.31, 0.38, 100, 0);
            const exitY = mapRange(snapped, 0.58, 0.65, 0, -100);
            y = (snapped < 0.38 ? enterY : snapped > 0.58 ? exitY : 0) * (typeof window !== 'undefined' ? window.innerHeight : 800) / 100;
            scale = snapped < 0.40 ? mapRange(snapped, 0.31, 0.40, 0.85, 1) :
                snapped > 0.56 ? mapRange(snapped, 0.56, 0.65, 1, 0.85) : 1;
            isVisible = snapped > 0.28 && snapped < 0.70;
        } else {
            y = mapRange(snapped, 0.62, 0.69, 100, 0) * (typeof window !== 'undefined' ? window.innerHeight : 800) / 100;
            scale = mapRange(snapped, 0.62, 0.72, 0.85, 1);
            isVisible = snapped > 0.58;
        }

        return { y, scale: Math.max(0.85, Math.min(1, scale)), isVisible, isStatic };
    });

    const y = useTransform(transformValues, (v) => v.y);
    const scale = useTransform(transformValues, (v) => v.scale);
    const opacity = useTransform(transformValues, (v) => v.isVisible ? 1 : 0);
    // We can't easily control 'isStatic' or 'isVisible' prop on MockupSlide via motion value without re-render
    // So we use opacity to hide it and always render

    return <MockupSlide feature={feature} y={y} scale={scale} opacity={opacity} isVisible={true} />;
};

const MotionAmbientGlow = ({ color, index, progress }: { color: any; index: number; progress: any }) => {
    const opacity = useTransform(progress, (p: number) => {
        // Apply snap logic
        const snapPoints = [0, 0.33, 0.66, 1];
        const snapStrength = 0.25;
        let snapped = p;
        for (const snap of snapPoints) {
            const dist = Math.abs(p - snap);
            if (dist < snapStrength) {
                const factor = dist / snapStrength;
                const eased = factor * factor;
                snapped = snap + (p - snap > 0 ? 1 : -1) * eased * snapStrength;
            }
        }

        if (index === 0) {
            let op = mapRange(snapped, 0, 0.1, 0, 0.25);
            if (snapped > 0.25) op = mapRange(snapped, 0.25, 0.35, 0.25, 0);
            return Math.max(0, Math.min(0.25, op));
        } else if (index === 1) {
            let op = mapRange(snapped, 0.3, 0.4, 0, 0.25);
            if (snapped > 0.6) op = mapRange(snapped, 0.6, 0.7, 0.25, 0);
            return Math.max(0, Math.min(0.25, op));
        } else {
            return Math.max(0, Math.min(0.25, mapRange(snapped, 0.6, 0.7, 0, 0.25)));
        }
    });

    return <AmbientGlow colors={color} opacity={opacity} />;
};

export default function StickyScrollFeaturesV2() {
    const containerRef = useRef<HTMLElement>(null);
    const [activeFeature, setActiveFeature] = useState(0);
    const lastFeatureRef = useRef(0);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });

    // Spring for smooth scrolling
    const smoothProgress = useSpring(scrollYProgress, {
        stiffness: 240,
        damping: 35,
        mass: 0.8
    });

    // Only update React state when feature changes - dramatically reduces re-renders
    useMotionValueEvent(smoothProgress, "change", (latest) => {
        const clamped = Math.max(0, Math.min(1, latest));
        const newFeature = clamped < 0.33 ? 0 : clamped < 0.66 ? 1 : 2;

        // Only trigger re-render when feature actually changes
        if (newFeature !== lastFeatureRef.current) {
            lastFeatureRef.current = newFeature;
            setActiveFeature(newFeature);
        }
    });

    // Snapped progress calculation
    const activeColors = colorMap[features[activeFeature].color];

    // Reactive opacity for section elements - smooth fade in/out based on scroll
    const sectionOpacity = useTransform(smoothProgress, p => (p > 0.05 && p < 0.95 ? 1 : 0));
    const hintOpacity = useTransform(smoothProgress, p => (p > 0.02 && p < 0.92 ? 1 : 0));

    return (
        <section
            ref={containerRef}
            className="h-[650vh] bg-black"
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

                    <motion.div
                        style={{ opacity: sectionOpacity }}
                        className="absolute top-8 md:top-28 left-6 md:left-16 lg:left-24 flex space-x-2 z-50"
                    >
                        {features.map((_, i) => (
                            <div key={i} className={`h-1 rounded-full transition-all duration-700 ease-out relative overflow-hidden ${activeFeature === i ? 'w-14' : 'w-6'}`}>
                                <div className="absolute inset-0 bg-white/20 rounded-full" />
                                <div className={`absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 origin-left transition-transform duration-700 ease-out ${activeFeature === i ? 'scale-x-100' : 'scale-x-0'}`} />
                            </div>
                        ))}
                    </motion.div>

                    <div className="w-full md:w-[45%] relative h-[35vh] sm:h-[40vh] md:h-full flex items-center md:items-center justify-start z-20 pb-4 md:pb-0">
                        {features.map((feature, i) => (
                            <MotionTextSlide key={i} feature={feature} index={i} progress={smoothProgress} />
                        ))}
                    </div>

                    <div className="flex w-full md:w-[55%] h-[55vh] sm:h-[60vh] md:h-full items-center justify-center relative z-20">
                        <motion.div
                            style={{ opacity: sectionOpacity, ...MOBILE_OPTIMIZED_LAYER }}
                            className="absolute -inset-2 md:-inset-8 overflow-visible pointer-events-none"
                        >
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
                        </motion.div>

                        <div
                            className="relative w-full h-[90%] md:h-[80%] max-w-[700px]"
                            style={{
                                WebkitTransform: 'translate3d(0,0,0)',
                                transform: 'translate3d(0,0,0)',
                                WebkitBackfaceVisibility: 'hidden',
                                backfaceVisibility: 'hidden',
                            }}
                        >
                            {features.map((feature, i) => (
                                <MotionMockupSlide key={i} feature={feature} index={i} progress={smoothProgress} />
                            ))}
                        </div>
                    </div>

                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {features.map((feature, i) => (
                            <MotionAmbientGlow key={i} color={colorMap[feature.color]} index={i} progress={smoothProgress} />
                        ))}
                    </div>

                </div>

                <motion.div
                    style={{ opacity: hintOpacity }}
                    className="absolute bottom-4 sm:bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none scale-75 sm:scale-100"
                >
                    <ScrollHint />
                </motion.div>
            </div>
        </section>
    );
}
