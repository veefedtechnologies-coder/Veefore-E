import { useRef, useState, memo, useEffect } from 'react';
import { motion, useScroll, useSpring, useMotionValueEvent, useTransform } from 'framer-motion';
import { MessageSquare, DollarSign, Search, CheckCircle, Calendar, Clock } from 'lucide-react';
import { ScrollHint } from './ui/ScrollHint';
import { GPU_ACCELERATED_STYLES, MOBILE_OPTIMIZED_LAYER } from '../lib/animation-performance';
import { useIsMobile } from '../hooks/use-is-mobile';

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
    icon: typeof Search | typeof MessageSquare | typeof DollarSign | typeof Calendar;
    color: ColorKey;
    screen: {
        type: 'analysis' | 'chat' | 'sales' | 'calendar';
        title?: string;
        stats?: Array<{ label: string; value: string; color: string }>;
        points?: string[];
        messages?: Array<{ user: string; text: string; time: string }>;
        steps?: Array<{ text: string; status: string }>;
        schedule?: { date: string; time: string; postTitle: string; peak: boolean };
    };
}

const isPhase1 = import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true';

const featuresDefault: Feature[] = [
    {
        title: "See Exactly Why They Blew Up.",
        description: "Stop wondering why that creator went viral. We break down their videos frame-by-frame to show you the exact pacing, script formula, and hooks they used.",
        highlight: "Competitor Teardown Active",
        icon: Search,
        color: "blue",
        screen: {
            type: "analysis",
            title: "Video Breakdown",
            stats: [
                { label: "Pacing Speed", value: "Fast (1.2s cuts)", color: "text-blue-400" },
                { label: "Opening Hook", value: "\"Negative Statement\"", color: "text-rose-400" }
            ],
            points: ["Visual hook at 0:02", "Text overlay matches speech", "Call-to-action at 80% mark"]
        }
    },
    {
        title: "Never Ignore A Fan Again.",
        description: "Replying to hundreds of comments is exhausting. We reply to your audience exactly how you would, while you're busy filming your next hit.",
        highlight: "Replies in Your Voice",
        icon: MessageSquare,
        color: "purple",
        screen: {
            type: "chat",
            messages: [
                { user: "fan", text: "What camera did you use for this?? It's so crisp! 🔥", time: "2m" },
                { user: "me", text: "Sony A7SIII with a 35mm GM lens! Honestly a game changer for these moody shots.", time: "Just now" }
            ]
        }
    },
    {
        title: "Make Money While You Sleep.",
        description: "Stop manually sending links in DMs. Tell your followers to 'comment LINK', and we'll handle the rest—delivering your digital products instantly.",
        highlight: "Auto-DM Delivery Active",
        icon: DollarSign,
        color: "green",
        screen: {
            type: "sales",
            title: "Product Delivery",
            steps: [
                { text: "Follower commented 'PRESET'", status: "complete" },
                { text: "Verified they follow you", status: "complete" },
                { text: "Sent Lightroom Preset link via DM", status: "active" }
            ]
        }
    }
];

const featuresPhase1: Feature[] = [
    {
        title: "See Exactly Why They Blew Up.",
        description: "Stop wondering why that creator went viral. We break down their videos frame-by-frame to show you the exact pacing, script formula, and hooks they used.",
        highlight: "Competitor Teardown Active",
        icon: Search,
        color: "blue",
        screen: {
            type: "analysis",
            title: "Video Breakdown",
            stats: [
                { label: "Pacing Speed", value: "Fast (1.2s cuts)", color: "text-blue-400" },
                { label: "Opening Hook", value: "\"Negative Statement\"", color: "text-rose-400" }
            ],
            points: ["Visual hook at 0:02", "Text overlay matches speech", "Call-to-action at 80% mark"]
        }
    },
    {
        title: "Post When Your Fans Are Awake.",
        description: "Stop guessing when to hit publish. We track exactly when your specific audience is scrolling, so your post doesn't die in the first 10 minutes.",
        highlight: "Audience Sync Active",
        icon: Calendar,
        color: "purple",
        screen: {
            type: "calendar",
            title: "Content Calendar",
            schedule: {
                date: "Tuesday, Oct 12",
                time: "9:00 AM",
                postTitle: "My new video hook...",
                peak: true
            }
        }
    },
    {
        title: "Never Miss A Collab Email.",
        description: "Brands slip through the cracks when your inbox is a mess. We auto-sort your sponsorship requests and draft professional replies.",
        highlight: "Inbox Manager Active",
        icon: DollarSign,
        color: "green",
        screen: {
            type: "sales",
            title: "Sponsorship Pipeline",
            steps: [
                { text: "Detected brand email from 'Nike'", status: "complete" },
                { text: "Extracted budget & timeline", status: "complete" },
                { text: "Drafted your media kit reply", status: "active" }
            ]
        }
    }
];

const features: Feature[] = isPhase1 ? featuresPhase1 : featuresDefault;



function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * Math.max(0, Math.min(1, t));
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const t = (value - inMin) / (inMax - inMin);
    return lerp(outMin, outMax, t);
}

const ScreenContent = memo(({ feature, isMobile = false }: { feature: Feature, isMobile?: boolean }) => {
    const colors = colorMap[feature.color];

    const baseClasses = isMobile
        ? "h-full w-full flex flex-col relative z-10 bg-[#0A0A0A] overflow-hidden"
        : "h-full w-full flex flex-col relative z-10 bg-[#0A0A0A] overflow-hidden";

    return (
        <div className={baseClasses}>
            {/* Soft background glow */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 ${colors.bg} blur-[80px] opacity-20 pointer-events-none`} />

            {feature.screen.type === 'analysis' && (
                <div className={`h-full flex flex-col ${isMobile ? 'p-3 sm:p-4' : 'p-6 md:p-8'} space-y-3 md:space-y-4`}>
                    {/* Header */}
                    <div className="flex items-center space-x-3 mb-1">
                        <div className={`w-8 h-8 rounded-lg ${colors.bgLight} flex items-center justify-center`}>
                            <feature.icon className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} text-white font-medium`}>{feature.screen.title}</h4>
                    </div>

                    {/* Video scanning visualization */}
                    <div className="relative w-full aspect-[21/9] bg-zinc-900 rounded-xl overflow-hidden border border-white/5 shadow-inner">
                        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-800 to-zinc-900 opacity-50" />
                        {/* Play button hint */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-md border border-white/10">
                                <div className="w-0 h-0 border-t-[5px] border-l-[8px] border-b-[5px] border-transparent border-l-white ml-1" />
                            </div>
                        </div>
                        {/* Scanning laser line */}
                        <motion.div 
                            animate={{ x: ["0%", "100%", "0%"] }} 
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            className={`absolute top-0 bottom-0 left-0 w-0.5 ${colors.bgLight} z-10`}
                            style={{ boxShadow: `0 0 15px ${colors.orbPrimary}` }}
                        />
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                        {feature.screen.stats?.map((stat, i) => (
                            <div key={i} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl flex flex-col justify-center">
                                <div className={`text-[9px] md:text-[10px] text-white/40 uppercase tracking-wider mb-1`}>{stat.label}</div>
                                <div className={`${isMobile ? 'text-sm' : 'text-lg'} font-bold ${stat.color} truncate`}>{stat.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Insights List */}
                    <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col justify-center space-y-2.5 md:space-y-3">
                        {feature.screen.points?.map((point: string, i: number) => (
                            <div key={i} className="flex items-start space-x-2.5 md:space-x-3">
                                <div className={`mt-0.5 w-3.5 h-3.5 md:w-4 md:h-4 rounded-full ${colors.bgLight} flex items-center justify-center shrink-0`}>
                                    <CheckCircle className={`w-2 h-2 md:w-2.5 md:h-2.5 ${colors.text}`} />
                                </div>
                                <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-white/80 leading-snug`}>{point}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {feature.screen.type === 'calendar' && (
                <div className={`h-full flex flex-col ${isMobile ? 'p-3' : 'p-6'} relative`}>
                    <div className="mb-2 md:mb-4 flex items-center justify-between">
                        <div className="flex items-center space-x-2 md:space-x-3">
                            <div className={`w-6 h-6 md:w-8 md:h-8 rounded-lg ${colors.bgLight} flex items-center justify-center`}>
                                <feature.icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${colors.text}`} />
                            </div>
                            <div>
                                <h4 className={`${isMobile ? 'text-[11px]' : 'text-sm'} font-bold text-white leading-tight`}>{feature.screen.title}</h4>
                                <p className="text-[8px] md:text-[9px] text-white/50 font-medium mt-0.5">October 2026</p>
                            </div>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="mb-2 md:mb-3 bg-white/[0.02] border border-white/5 rounded-xl p-2 md:p-3">
                        <div className="grid grid-cols-7 gap-1 md:gap-1.5 mb-1.5 text-center text-[8px] md:text-[9px] text-white/40 font-medium">
                            <div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1 md:gap-1.5">
                            {Array.from({ length: 14 }).map((_, i) => (
                                <div key={i} className={`aspect-square rounded flex items-center justify-center ${
                                    i === 8 
                                        ? `${colors.bg} border ${colors.border}` 
                                        : 'bg-white/[0.02] border border-white/5'
                                }`}>
                                    {i === 8 && <div className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-white shadow-[0_0_10px_white]`} />}
                                    {i === 3 && <div className={`w-0.5 h-0.5 md:w-1 md:h-1 rounded-full ${colors.bgLight}`} />}
                                    {i === 11 && <div className={`w-0.5 h-0.5 md:w-1 md:h-1 rounded-full ${colors.bgLight}`} />}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Scheduled Post Card */}
                    {feature.screen.schedule && (
                        <div className={`flex-1 p-2 md:p-3 rounded-xl border bg-white/[0.02] ${colors.border} shadow-[0_0_30px_rgba(168,85,247,0.15)] flex flex-col justify-center`}>
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <div className={`text-[8px] md:text-[9px] ${colors.text} font-bold uppercase tracking-wider mb-0.5`}>
                                        {feature.screen.schedule.date}
                                    </div>
                                    <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-white font-medium`}>
                                        {feature.screen.schedule.postTitle}
                                    </div>
                                </div>
                                <div className={`px-1.5 py-0.5 md:px-2 md:py-1 rounded bg-black/50 border border-white/10 text-[8px] md:text-[10px] font-medium text-white flex items-center space-x-1`}>
                                    <Clock className="w-2 h-2 md:w-2.5 md:h-2.5 text-white/50" />
                                    <span>{feature.screen.schedule.time}</span>
                                </div>
                            </div>
                            {feature.screen.schedule.peak && (
                                <div className="flex items-center space-x-1.5 text-[8px] md:text-[9px] text-green-400 bg-green-500/10 p-1.5 md:p-2 rounded-md border border-green-500/20">
                                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span>3x Peak Audience Activity</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {feature.screen.type === 'chat' && (
                <div className="h-full flex flex-col bg-[#0A0A0A]">
                    {/* Chat Header */}
                    <div className={`p-3 md:p-4 border-b border-white/10 flex items-center space-x-3 bg-white/[0.02]`}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center shrink-0 shadow-lg shadow-pink-500/20">
                            <span className="text-xs text-white font-bold">IG</span>
                        </div>
                        <div>
                            <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-white font-medium`}>Audience Messages</div>
                            <div className="text-[9px] md:text-[10px] text-green-400 font-medium">Online</div>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className={`flex-1 overflow-hidden flex flex-col justify-end ${isMobile ? 'p-3' : 'p-6'} space-y-4`}>
                        {feature.screen.messages?.map((msg, i: number) => (
                            <div key={i} className={`flex ${msg.user === 'me' ? 'justify-end' : 'justify-start'}`}>
                                {msg.user !== 'me' && (
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 shrink-0 mr-2 mt-auto flex items-center justify-center">
                                        <span className="text-[8px] text-white/50">F</span>
                                    </div>
                                )}
                                <div className={`max-w-[85%] p-3 rounded-2xl shadow-lg ${
                                    msg.user === 'me' 
                                        ? `bg-blue-600 text-white rounded-br-sm shadow-blue-900/20` 
                                        : 'bg-zinc-800/80 border border-white/5 text-white/90 rounded-bl-sm'
                                }`}>
                                    <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} leading-relaxed`}>{msg.text}</p>
                                    <div className={`text-[8px] mt-1.5 text-right ${msg.user === 'me' ? 'text-blue-200' : 'text-white/40'}`}>
                                        {msg.time}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Chat Input Placeholder */}
                    <div className={`p-3 md:p-4 border-t border-white/10 bg-white/[0.02]`}>
                        <div className="w-full h-8 md:h-10 rounded-full bg-zinc-900 border border-white/10 flex items-center px-4 shadow-inner">
                            <span className="text-[10px] md:text-xs text-white/30">Message...</span>
                        </div>
                    </div>
                </div>
            )}

            {feature.screen.type === 'sales' && (
                <div className={`h-full flex flex-col ${isMobile ? 'p-4' : 'p-8'} relative`}>
                    <div className="mb-4 md:mb-6 flex items-center space-x-3 md:space-x-4">
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl ${colors.bgLight} flex items-center justify-center`}>
                            <feature.icon className={`w-4 h-4 md:w-5 md:h-5 ${colors.text}`} />
                        </div>
                        <div>
                            <h4 className={`${isMobile ? 'text-sm' : 'text-lg'} font-bold text-white leading-tight`}>{feature.screen.title}</h4>
                            <p className="text-[9px] md:text-[10px] text-green-400 font-medium">Automated Pipeline Running</p>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex-1 relative ml-2 mt-2 md:mt-4">
                        <div className="absolute top-2 bottom-6 left-[9px] w-px bg-white/10" />
                        <div className="space-y-4 md:space-y-6">
                            {feature.screen.steps?.map((step, i: number) => (
                                <div key={i} className="relative flex items-start pl-8">
                                    <div className={`absolute left-0 top-1 w-5 h-5 rounded-full flex items-center justify-center bg-[#0A0A0A] ${
                                        step.status === 'complete' 
                                            ? `border border-white/20` 
                                            : `border border-white/20`
                                    }`}>
                                        {step.status === 'complete' ? (
                                            <div className="w-2.5 h-2.5 rounded-full bg-white/80" />
                                        ) : (
                                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className={`p-3 md:p-4 rounded-xl border ${
                                            step.status === 'complete' 
                                                ? 'bg-white/[0.02] border-white/5' 
                                                : `bg-white/[0.06] ${colors.border} shadow-[0_0_20px_rgba(34,197,94,0.15)]`
                                        }`}>
                                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm'} ${step.status === 'complete' ? 'text-white/50' : 'text-white font-medium'}`}>
                                                {step.text}
                                            </div>
                                            {step.status === 'active' && (
                                                <div className={`text-[8px] md:text-[10px] mt-1.5 ${colors.text} uppercase tracking-wider font-bold`}>
                                                    In Progress...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
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
    opacity: any;
    y: any;
}

// Adaptive spring configs - mobile gets gentler springs (still smooth, less CPU intensive)
const textSpringConfig = { stiffness: 70, damping: 20, mass: 1.2 };
const mockupSpringConfig = { stiffness: 70, damping: 20, mass: 1.2 };

// Mobile-optimized spring config (slightly gentler, imperceptible difference but better performance)
const textSpringConfigMobile = { stiffness: 120, damping: 25, mass: 1 };
const mockupSpringConfigMobile = { stiffness: 120, damping: 25, mass: 1 };

const TextSlide = memo(({ feature, opacity, y }: TextSlideProps) => {
    const colors = colorMap[feature.color];
    const isMobile = useIsMobile();
    
    // Use adaptive spring config based on device
    const springCfg = isMobile ? textSpringConfigMobile : textSpringConfig;

    return (
        <motion.div
            // OPTIMIZATION: Use combined animate instead of individual springs (reduces GPU layers)
            animate={{
                opacity: typeof opacity === 'number' ? opacity : 1,
                y: typeof y === 'number' ? y : 0
            }}
            transition={{
                type: "spring",
                ...springCfg
            }}
            style={{ 
                // Keep these - needed for proper 3D layering
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                // OPTIMIZATION: Isolate rendering to prevent cascade repaints
                contain: 'layout paint style'
            }}
            className="w-full max-w-lg"
        >
            <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-black/80 md:bg-white/5 ${colors.border} text-[10px] md:text-xs font-bold ${colors.text} uppercase tracking-widest mb-4 md:mb-6 md:backdrop-blur-md`}>
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

// Adaptive mockup spring for visible sliding transitions
const MockupSlide = memo(({ feature, y, scale, isVisible, isStatic = false, opacity }: MockupSlideProps) => {
    const isMobile = useIsMobile();
    
    // Use adaptive spring config based on device
    const springCfg = isMobile ? mockupSpringConfigMobile : mockupSpringConfig;
    
    // Determine final opacity to use
    const targetOpacity = opacity !== undefined ? opacity : (isVisible ? 1 : 0);
    const targetY = typeof y === 'number' ? y : 0;
    const targetScale = typeof scale === 'number' ? scale : 1;

    if (isStatic) {
        return (
            <div
                style={{
                    ...GPU_ACCELERATED_STYLES,
                    opacity: 1,
                    // OPTIMIZATION: Isolate rendering
                    contain: 'layout paint style'
                }}
                className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
            >
                <div className="hidden md:block w-full h-full"><LaptopScreen feature={feature} /></div>
                <div className="block md:hidden w-full h-full"><IPhoneScreen feature={feature} /></div>
            </div>
        );
    }

    return (
        <motion.div
            // OPTIMIZATION: Combined animation instead of individual springs (reduces GPU layers from 5 to 1)
            animate={{
                y: targetY,
                scale: targetScale,
                opacity: targetOpacity
            }}
            transition={{
                type: "spring",
                ...springCfg
            }}
            style={{
                // OPTIMIZATION: Only hint GPU when visible (reduces offscreen GPU layers)
                willChange: isVisible ? 'transform, opacity' : 'auto',
                // Keep these - needed for proper 3D layering
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                // OPTIMIZATION: Isolate rendering to prevent cascade repaints
                contain: 'layout paint style'
            }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
            <div className="hidden md:block w-full h-full"><LaptopScreen feature={feature} /></div>
            <div className="block md:hidden w-full h-full"><IPhoneScreen feature={feature} /></div>
        </motion.div>
    );
});

const AmbientGlow = memo(({ colors, opacity }: { colors: typeof colorMap[ColorKey], opacity: number }) => {
    const isMobile = useIsMobile();

    return (
        <motion.div
            // OPTIMIZATION: Use direct animate instead of spring for background glow (simpler, less CPU)
            animate={{ opacity: opacity }}
            transition={{
                type: "tween",  // Tween is sufficient for background glow
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1]
            }}
            style={{ 
                ...MOBILE_OPTIMIZED_LAYER,
                // OPTIMIZATION: Isolate rendering
                contain: 'layout paint style'
            }}
            className={`absolute right-0 top-1/2 -translate-y-1/2 w-[200px] h-[200px] md:w-[600px] md:h-[600px] ${colors.bg} blur-[80px] md:blur-[120px] rounded-full`}
        />
    );
});

const MotionTextSlide = ({ feature, index, activeFeature }: { feature: Feature; index: number; activeFeature: number }) => {
    const isPast = index < activeFeature;
    const isUpcoming = index > activeFeature;
    const isActive = index === activeFeature;

    const y = isActive ? 0 : isPast ? -40 : 40;
    const opacity = isActive ? 1 : 0;

    return (
        <div className={`absolute inset-0 flex flex-col justify-center ${isActive ? 'pointer-events-auto z-10' : 'pointer-events-none z-0'}`}>
            <TextSlide feature={feature} opacity={opacity} y={y} />
        </div>
    );
};

const MotionMockupSlide = ({ feature, index, activeFeature }: { feature: Feature; index: number; activeFeature: number }) => {
    const isPast = index < activeFeature;
    const isActive = index === activeFeature;

    // Use a slide distance large enough to ensure it flies completely off the full screen
    const slideDistance = typeof window !== 'undefined' ? window.innerHeight * 1.2 : 1200;
    
    // Pure snappy sliding effect without opacity fade so the motion is clearly visible
    const y = isActive ? 0 : isPast ? -slideDistance : slideDistance;
    const scale = isActive ? 1 : 0.85;
    
    // Lock opacity at 1 so it NEVER fades. It will only disappear when it physically slides off the screen!
    const opacity = 1; 

    return <MockupSlide feature={feature} y={y} scale={scale} opacity={opacity} isVisible={isActive} />;
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
    const [targetFeature, setTargetFeature] = useState(0);
    const lastTransitionTimeRef = useRef(0);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });

    // Update target feature based instantly on physical scroll
    const activeFeatureIndex = useTransform(scrollYProgress, (latest) => {
        const clamped = Math.max(0, Math.min(1, latest));
        // Even distribution: 33% for each item
        return clamped < 0.33 ? 0 : clamped < 0.66 ? 1 : 2;
    });

    useMotionValueEvent(activeFeatureIndex, "change", (latest) => {
        setTargetFeature(latest);
    });

    // Rate-limited sequential transition: forces the UI to visit every step even if the user scrolls instantly
    useEffect(() => {
        if (activeFeature !== targetFeature) {
            const now = Date.now();
            const timeSinceLast = now - lastTransitionTimeRef.current;
            const delay = Math.max(0, 600 - timeSinceLast);

            const timer = setTimeout(() => {
                lastTransitionTimeRef.current = Date.now();
                setActiveFeature(prev => prev < targetFeature ? prev + 1 : prev - 1);
            }, delay);

            return () => clearTimeout(timer);
        }
    }, [activeFeature, targetFeature]);

    // Snapped progress calculation
    const activeColors = colorMap[features[activeFeature].color];

    // Reactive opacity for section elements - smooth fade in/out based on scroll
    const sectionOpacity = useTransform(scrollYProgress, p => (p > 0.05 && p < 0.95 ? 1 : 0));
    const hintOpacity = useTransform(scrollYProgress, (v: number) => (v > 0.05 && v < 0.90) ? 1 : 0);

    return (
        <section
            ref={containerRef}
            className="h-[450vh] bg-black"
            style={{ position: 'relative' }}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,0.7),rgba(0,0,0,1))]" />

            <div
                className="sticky top-0 h-[100dvh] flex flex-col md:flex-row items-center w-full z-[60]"
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
                            <MotionTextSlide key={i} feature={feature} index={i} activeFeature={activeFeature} />
                        ))}
                    </div>

                    <div className="flex w-full md:w-[55%] h-[55vh] sm:h-[60vh] md:h-full items-center justify-center relative z-[70]">
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
                            className="relative w-full h-[90%] md:h-[80%] max-w-[700px] z-[100]"
                            style={{
                                WebkitTransform: 'translate3d(0,0,0)',
                                transform: 'translate3d(0,0,0)',
                                WebkitBackfaceVisibility: 'hidden',
                                backfaceVisibility: 'hidden',
                            }}
                        >
                            {features.map((feature, i) => (
                                <MotionMockupSlide key={i} feature={feature} index={i} activeFeature={activeFeature} />
                            ))}
                        </div>
                    </div>

                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {features.map((feature, i) => (
                            <MotionAmbientGlow key={i} color={colorMap[feature.color]} index={i} progress={scrollYProgress} />
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
