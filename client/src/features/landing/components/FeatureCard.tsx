import { memo } from 'react';
import { motion } from 'framer-motion';
import { Search, MessageSquare, DollarSign, Calendar, CheckCircle, Clock } from 'lucide-react';
import { IphoneMockup } from '../../../components/ui/iphone-mockup';
import { GPU_ACCELERATED_STYLES } from '../../../lib/animation-performance';

// Color configuration map for feature theming
export const colorMap = {
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

export type ColorKey = keyof typeof colorMap;

// Feature data interface
export interface Feature {
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

// Screen content rendering based on feature type
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

ScreenContent.displayName = 'ScreenContent';

// iPhone mockup rendering
export const IPhoneScreen = memo(({ feature }: { feature: Feature }) => {
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

IPhoneScreen.displayName = 'IPhoneScreen';

// Laptop mockup rendering
export const LaptopScreen = memo(({ feature }: { feature: Feature }) => {
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

LaptopScreen.displayName = 'LaptopScreen';

// Main FeatureCard component props
export interface FeatureCardProps {
    feature: Feature;
    variant?: 'phone' | 'laptop' | 'auto';
    className?: string;
}

/**
 * FeatureCard component for displaying individual feature showcases
 * with device mockups and animated content.
 * 
 * Supports:
 * - Multiple screen types (analysis, chat, sales, calendar)
 * - Device variants (iPhone, Laptop, Auto-responsive)
 * - Color theming (blue, purple, green)
 * - Animated content transitions
 * 
 * @component
 * @example
 * ```tsx
 * <FeatureCard 
 *   feature={featureData} 
 *   variant="laptop"
 * />
 * ```
 * 
 * **Validates: Requirements 22.1**
 */
export const FeatureCard = memo(({ feature, variant = 'auto', className = '' }: FeatureCardProps) => {
    if (variant === 'phone') {
        return (
            <div className={className}>
                <IPhoneScreen feature={feature} />
            </div>
        );
    }

    if (variant === 'laptop') {
        return (
            <div className={className}>
                <LaptopScreen feature={feature} />
            </div>
        );
    }

    // Auto-responsive: show laptop on desktop, phone on mobile
    return (
        <div className={className}>
            <div className="hidden md:block">
                <LaptopScreen feature={feature} />
            </div>
            <div className="block md:hidden">
                <IPhoneScreen feature={feature} />
            </div>
        </div>
    );
});

FeatureCard.displayName = 'FeatureCard';

export default FeatureCard;
