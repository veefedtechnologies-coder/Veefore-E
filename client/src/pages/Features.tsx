
import React, { useState } from 'react'

import { motion } from 'framer-motion'
import {
    ArrowRight, Zap, CheckCircle, MessageSquare, TrendingUp,
    Brain, Sparkles, Send, Clock, BarChart3, Target, Play,
    Bot, RefreshCw, Instagram,
    Heart, Users, Bell, Repeat, Share2, Eye, Calendar, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile';
import { SEO } from '../lib/seo-optimization'
import { Link } from 'wouter'
import { useWaitlist } from '../context/WaitlistContext'
import { MainNavigation } from '../components/MainNavigation'
import MainFooter from '../components/MainFooter'
import { IphoneMockup } from '../components/ui/iphone-mockup'

// Lazy load wrapper to fix "stuck loading" issues
const LazySection = ({ children, threshold = 0.1 }: { children: React.ReactNode, threshold?: number }) => {
    const [isVisible, setIsVisible] = useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px', threshold }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, [threshold]);

    return (
        <div ref={ref} className="min-h-[50vh]">
            {isVisible ? children : <div className="h-96 flex items-center justify-center opacity-10">Loading section...</div>}
        </div>
    );
};

const GradientOrb = ({ className, color = 'blue' }: { className?: string, color?: string }) => {
    const isMobile = useIsMobile()
    const colors = {
        blue: isMobile ? 'bg-blue-600/10' : 'from-blue-500/30 via-blue-600/20 to-transparent',
        purple: isMobile ? 'bg-purple-600/10' : 'from-purple-500/30 via-purple-600/20 to-transparent',
    }

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    )
}


// VeeGPT Chat Interface Mockup
const VeeGPTChatMockup = React.memo(() => {
    const isMobile = useIsMobile();
    // Use slightly less blur for mobile but keep opacity high to maintain glow
    const blurClass = isMobile ? 'blur-2xl' : 'blur-3xl';

    // Header Content
    const Header = () => (
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 sticky top-0 z-10 backdrop-blur-md">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                    <div className="font-semibold text-white flex items-center gap-2">
                        VeeGPT
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-500/20 text-green-400 font-medium">AI Agent</span>
                    </div>
                    <div className="text-xs text-white/50">Your growth assistant</div>
                </div>
            </div>
            {!isMobile && (
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-400">Active</span>
                </div>
            )}
        </div>
    );

    // Messages Content
    const Messages = () => (
        <div className={`p-5 space-y-4 ${!isMobile ? 'max-h-80 overflow-y-auto' : ''}`}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="flex justify-end"
            >
                <div className="max-w-[85%] p-4 rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                    <p className="text-sm">Analyze my last 10 posts and tell me what's working</p>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="flex justify-start"
            >
                <div className="max-w-[100%] p-4 rounded-2xl rounded-tl-sm bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs text-cyan-400 font-medium">Analyzing with GPT-4o</span>
                    </div>
                    <p className="text-sm text-white mb-3">I've analyzed your recent posts. Here's what I found:</p>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-white/70">Reels get 3.2x more engagement</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-white/70">Best time: 6-8 PM gets 40% more views</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-white/70">Carousel posts drive 2x saves</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="flex justify-end"
            >
                <div className="max-w-[85%] p-4 rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                    <p className="text-sm">Create a content strategy for next week</p>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6 }}
                className="flex justify-start"
            >
                <div className="max-w-[100%] p-4 rounded-2xl rounded-tl-sm bg-white/5 border border-cyan-500/30">
                    <div className="flex items-center gap-2 mb-3">
                        <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                        <span className="text-xs text-cyan-400 font-medium">Agent working...</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-xs text-white/70">Analyzing audience trends</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-xs text-white/70">Creating 7-day content plan</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-cyan-500/20 flex items-center justify-center animate-pulse flex-shrink-0">
                                <Clock className="w-3 h-3 text-cyan-400" />
                            </div>
                            <span className="text-xs text-white/70">Scheduling posts...</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );

    if (isMobile) {
        return (
            <div className="relative flex justify-center py-4">
                <div className={`absolute inset-0 bg-gradient-to-br from-cyan-500/40 via-blue-500/30 to-teal-500/40 ${blurClass}`} style={{ transform: 'scale(1.2)' }} />
                <IphoneMockup isAutoScroll={true} className="relative z-10 w-[90%] max-w-[320px] h-[600px] border-gray-900 bg-gray-900 shadow-2xl">
                    <div className="bg-[#0a0a0a] min-h-full">
                        <Header />
                        <Messages />
                    </div>
                </IphoneMockup>
            </div>
        );
    }

    return (
        <div className="relative" style={{ willChange: 'transform' }}>
            <div className={`absolute inset-0 bg-gradient-to-br from-cyan-500/40 via-blue-500/30 to-teal-500/40 ${blurClass}`} />

            <div className="relative rounded-2xl overflow-hidden border border-cyan-500/30 bg-[#0a0a0a] shadow-2xl">
                <Header />
                <Messages />
            </div>
        </div>
    )
})

// VeeGPT Hybrid AI Selector Mockup
const HybridAIMockup = React.memo(() => {
    const isMobile = useIsMobile();
    const blurClass = isMobile ? 'blur-2xl' : 'blur-3xl';

    const Content = () => (
        <>
            <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-white mb-2">Hybrid AI Engine</h3>
                <p className="text-xs text-white/50">Automatically selects the best model for your query</p>
            </div>

            {/* Query Analysis */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4"
            >
                <div className="text-xs text-white/50 mb-2">Your Query</div>
                <p className="text-sm text-white">"Create a viral marketing campaign for my new product launch"</p>
            </motion.div>

            {/* AI Models */}
            <div className="space-y-3">
                {[
                    { name: 'GPT-4o', color: 'from-green-500 to-emerald-500', match: 92, desc: 'Best for creative strategy', selected: true },
                    { name: 'Claude 3.5', color: 'from-orange-500 to-amber-500', match: 78, desc: 'Great for detailed analysis' },
                    { name: 'Gemini Pro', color: 'from-blue-500 to-cyan-500', match: 71, desc: 'Good for research' },
                ].map((model, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1 }}
                        className={`p-3 rounded-xl flex items-center gap-3 ${model.selected ? 'bg-gradient-to-r ' + model.color + ' bg-opacity-20 border-2 border-green-500' : 'bg-white/5 border border-white/5'}`}
                    >
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${model.color} flex items-center justify-center flex-shrink-0`}>
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white">{model.name}</span>
                                {model.selected && <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-500 text-white">Selected</span>}
                            </div>
                            <p className="text-xs text-white/50">{model.desc}</p>
                        </div>
                        <div className="text-right">
                            <div className={`text-lg font-bold ${model.selected ? 'text-green-400' : 'text-white/40'}`}>{model.match}%</div>
                            <div className="text-[10px] text-white/40">Match</div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </>
    );

    if (isMobile) {
        return (
            <div className="relative flex justify-center py-4">
                <div className={`absolute inset-0 bg-gradient-to-br from-blue-500/30 via-purple-500/30 to-pink-500/30 ${blurClass}`} style={{ transform: 'scale(1.2)' }} />
                <IphoneMockup isAutoScroll={true} className="relative z-10 w-[90%] max-w-[320px] h-[600px] border-gray-900 bg-gray-900 shadow-2xl">
                    <div className="bg-[#0a0a0a] min-h-full p-4 overflow-y-auto">
                        <Content />
                    </div>
                </IphoneMockup>
            </div>
        );
    }

    return (
        <div className="relative" style={{ willChange: 'transform' }}>
            <div className={`absolute inset-0 bg-gradient-to-br from-blue-500/30 via-purple-500/30 to-pink-500/30 ${blurClass}`} />

            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-2xl p-6">
                <Content />
            </div>
        </div>
    )
})

// VeeGPT Agent Tasks Mockup
const AgentTasksMockup = React.memo(() => {
    const isMobile = useIsMobile();
    const blurClass = isMobile ? 'blur-2xl' : 'blur-3xl';

    const Content = () => (
        <>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Agent Tasks</h3>
                        <p className="text-xs text-white/50">VeeGPT working for you</p>
                    </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-medium">
                    4 Active
                </div>
            </div>

            <div className="space-y-3">
                {[
                    { task: 'Responding to 12 new comments', status: 'running', progress: 75 },
                    { task: 'Scheduling posts for next week', status: 'done', progress: 100 },
                    { task: 'Analyzing competitor strategies', status: 'running', progress: 45 },
                    { task: 'Generating content ideas', status: 'queued', progress: 0 },
                ].map((item, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1 }}
                        className="p-3 rounded-xl bg-white/5 border border-white/5"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-white">{item.task}</span>
                            {item.status === 'running' && (
                                <div className="flex items-center gap-1.5 align-middle">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse bg-green-400" />
                                    <span className="text-[10px] text-green-400 font-medium uppercase tracking-wider">Running</span>
                                </div>
                            )}
                            {item.status === 'done' && (
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                    <span className="text-[10px] text-green-500 font-medium uppercase tracking-wider">Done</span>
                                </div>
                            )}
                            {item.status === 'queued' && (
                                <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Queued</span>
                            )}
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${item.progress}%` }}
                                viewport={{ once: true }}
                                transition={{ duration: 1, delay: i * 0.2 }}
                                className={`h-full rounded-full ${item.status === 'running' ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : item.status === 'done' ? 'bg-green-500' : 'bg-transparent'}`}
                            />
                        </div>
                    </motion.div>
                ))}
            </div>
        </>
    );

    if (isMobile) {
        return (
            <div className="relative flex justify-center py-4">
                <div className={`absolute inset-0 bg-gradient-to-br from-cyan-500/30 via-blue-500/30 to-teal-500/30 ${blurClass}`} style={{ transform: 'scale(1.2)' }} />
                <IphoneMockup isAutoScroll={true} className="relative z-10 w-[90%] max-w-[320px] h-[600px] border-gray-900 bg-gray-900 shadow-2xl">
                    <div className="bg-[#0a0a0a] min-h-full p-4 overflow-y-auto">
                        <Content />
                    </div>
                </IphoneMockup>
            </div>
        );
    }

    return (
        <div className="relative" style={{ willChange: 'transform' }}>
            <div className={`absolute inset-0 bg-gradient-to-br from-cyan-500/30 via-blue-500/30 to-teal-500/30 ${blurClass}`} />

            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-2xl p-6">
                <Content />
            </div>
        </div>
    )
})

// Workflow Builder Mockup
const WorkflowBuilderMockup = React.memo(() => {
    const isMobile = useIsMobile();
    const blurClass = isMobile ? 'blur-2xl' : 'blur-3xl';

    const Content = () => (
        <>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Workflow Builder</h3>
                        <p className="text-xs text-white/50">Create automations visually</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-400">3 Active Workflows</span>
                </div>
            </div>

            {/* Workflow Timeline */}
            <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500 via-pink-500 to-rose-500" />

                {/* Workflow Steps */}
                <div className="space-y-6">
                    {[
                        { type: 'trigger', label: 'TRIGGER', title: 'New Comment Received', desc: 'When someone comments on any post', icon: Bell, color: 'from-purple-500 to-violet-500' },
                        { type: 'condition', label: 'CONDITION', title: 'Check Sentiment', desc: 'Is the comment positive or question?', icon: Brain, color: 'from-blue-500 to-cyan-500' },
                        { type: 'action', label: 'ACTION', title: 'AI Generates Reply', desc: 'Create personalized response', icon: Sparkles, color: 'from-pink-500 to-rose-500' },
                        { type: 'action', label: 'ACTION', title: 'Post Reply', desc: 'Send reply after 2-5 min delay', icon: Send, color: 'from-green-500 to-emerald-500' },
                    ].map((step, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.15 }}
                            className="relative pl-16"
                        >
                            {/* Step Icon */}
                            <div className={`absolute left-0 w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg`}>
                                <step.icon className="w-6 h-6 text-white" />
                            </div>

                            {/* Step Content */}
                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-purple-500/30 transition-all">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${step.type === 'trigger' ? 'bg-purple-500/20 text-purple-400' :
                                        step.type === 'condition' ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-green-500/20 text-green-400'
                                        } `}>
                                        {step.label}
                                    </span>
                                </div>
                                <h4 className="font-semibold text-white mb-1">{step.title}</h4>
                                <p className="text-sm text-white/50">{step.desc}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Stats Footer */}
            <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                <div>
                    <div className="text-2xl font-bold text-purple-400">1,247</div>
                    <div className="text-xs text-white/50">Runs today</div>
                </div>
                <div>
                    <div className="text-2xl font-bold text-pink-400">98.5%</div>
                    <div className="text-xs text-white/50">Success rate</div>
                </div>
                <div>
                    <div className="text-2xl font-bold text-green-400">4.2h</div>
                    <div className="text-xs text-white/50">Time saved</div>
                </div>
            </div>
        </>
    );

    if (isMobile) {
        return (
            <div className="relative flex justify-center py-4">
                <div className={`absolute inset-0 bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-rose-500/30 ${blurClass}`} style={{ transform: 'scale(1.2)' }} />
                <IphoneMockup isAutoScroll={true} className="relative z-10 w-[90%] max-w-[320px] h-[600px] border-gray-900 bg-gray-900 shadow-2xl">
                    <div className="bg-[#0a0a0a] min-h-full p-4 overflow-y-auto">
                        <Content />
                    </div>
                </IphoneMockup>
            </div>
        );
    }

    return (
        <div className="relative">
            <div className={`absolute inset-0 bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-rose-500/30 ${blurClass}`} />
            <div className="relative rounded-2xl overflow-hidden border border-purple-500/20 bg-[#0a0a0a] shadow-2xl p-6 md:p-8">
                <Content />
            </div>
        </div>
    )
})

// Scheduling Calendar Mockup
const SchedulingCalendarMockup = React.memo(() => {
    const isMobile = useIsMobile();
    const blurClass = isMobile ? 'blur-2xl' : 'blur-3xl';

    const Content = () => (
        <>
            {/* Calendar View */}
            <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className={isMobile ? "w-full mb-8" : "lg:col-span-2"}
            >
                <div>
                    {!isMobile && (
                        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/30 via-pink-500/20 to-red-500/30 blur-3xl" />
                    )}
                    <div className={`relative rounded-2xl overflow-hidden border border-rose-500/20 bg-[#0a0a0a] shadow-2xl ${isMobile ? '' : ''}`}>
                        {/* Calendar Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                    <ChevronLeft className="w-4 h-4 text-white/50" />
                                </button>
                                <h3 className="font-semibold text-white">January 2026</h3>
                                <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                    <ChevronRight className="w-4 h-4 text-white/50" />
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-xs px-2 py-1 rounded bg-rose-500/20 text-rose-400">Week View</span>
                                {!isMobile && <span className="text-xs px-2 py-1 rounded bg-white/5 text-white/50">Month View</span>}
                            </div>
                        </div>

                        {/* Calendar Grid */}
                        <div className="p-4">
                            {/* Days Header */}
                            <div className="grid grid-cols-7 gap-2 mb-2">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                                    <div key={i} className="text-center text-xs text-white/40 py-2">{isMobile ? day.charAt(0) : day}</div>
                                ))}
                            </div>

                            {/* Calendar Days */}
                            <div className="grid grid-cols-7 gap-2">
                                {Array.from({ length: 35 }, (_, i) => {
                                    const day = i - 3 // Start from Wednesday (offset)
                                    const hasPost = [3, 5, 8, 12, 15, 19, 22, 26].includes(i)
                                    const isOptimal = [5, 12, 19, 26].includes(i) // Tuesdays
                                    const isToday = i === 15

                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: i * 0.01 }}
                                            className={`aspect-square rounded-lg flex flex-col items-center justify-center relative cursor-pointer transition-all ${day < 1 || day > 31 ? 'opacity-30' :
                                                isToday ? 'bg-rose-500 text-white' :
                                                    isOptimal ? 'bg-rose-500/20 border border-rose-500/30' :
                                                        'bg-white/[0.02] hover:bg-white/[0.05]'
                                                } `}
                                        >
                                            <span className={`text-sm ${isToday ? 'font-bold' : 'text-white/70'} `}>
                                                {day > 0 && day <= 31 ? day : ''}
                                            </span>
                                            {hasPost && day > 0 && day <= 31 && (
                                                <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isOptimal ? 'bg-green-400' : 'bg-rose-400'} `} />
                                            )}
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Scheduled Posts Preview */}
                        <div className="px-4 pb-4 space-y-2">
                            <div className="text-xs text-white/40 mb-2">Scheduled for Today</div>
                            {[
                                { time: '6:00 PM', title: 'Behind the scenes reel', type: 'Reel', optimal: true },
                                { time: '8:30 PM', title: 'Product showcase carousel', type: 'Carousel', optimal: false },
                            ].map((post, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: -10 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                                        <Instagram className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm text-white truncate max-w-[120px]">{post.title}</div>
                                        <div className="text-xs text-white/50">{post.time} • {post.type}</div>
                                    </div>
                                    {post.optimal && (
                                        <span className="text-[10px] px-2 py-1 rounded bg-green-500/20 text-green-400">Optimal</span>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Content Queue */}
            <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className={isMobile ? "w-full" : ""}
            >
                <div className="relative h-full">
                    {!isMobile && (
                        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/30 via-rose-500/20 to-red-500/30 blur-3xl" />
                    )}
                    <div className="relative rounded-2xl overflow-hidden border border-pink-500/20 bg-[#0a0a0a] shadow-2xl h-full">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                            <h3 className="font-semibold text-white">Content Queue</h3>
                            <span className="text-xs px-2 py-1 rounded-full bg-rose-500/20 text-rose-400">12 drafts</span>
                        </div>

                        <div className="p-4 space-y-3">
                            {[
                                { title: 'Morning motivation post', status: 'ready', time: 'Tomorrow 7:00 AM' },
                                { title: 'Tutorial: Quick tips', status: 'ready', time: 'Wed 6:00 PM' },
                                { title: 'Weekly Q&A story', status: 'draft', time: 'Thu 12:00 PM' },
                                { title: 'Product launch teaser', status: 'review', time: 'Fri 5:00 PM' },
                                { title: 'Weekend vibes reel', status: 'ready', time: 'Sat 10:00 AM' },
                            ].map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1 }}
                                    className="p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-rose-500/30 transition-all cursor-grab"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm text-white truncate">{item.title}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                                            item.status === 'review' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-white/10 text-white/50'
                                            } `}>
                                            {item.status}
                                        </span>
                                    </div>
                                    <div className="text-xs text-white/40">{item.time}</div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="px-4 pb-4">
                            <button className="w-full py-2 rounded-xl border border-dashed border-rose-500/30 text-rose-400 text-sm hover:bg-rose-500/10 transition-colors">
                                + Add to Queue
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </>
    );

    if (isMobile) {
        return (
            <div className="relative flex justify-center py-4">
                <div className={`absolute inset-0 bg-gradient-to-br from-rose-500/30 via-pink-500/20 to-red-500/30 ${blurClass}`} style={{ transform: 'scale(1.2)' }} />
                <IphoneMockup isAutoScroll={true} className="relative z-10 w-[90%] max-w-[320px] h-[600px] border-gray-900 bg-gray-900 shadow-2xl">
                    <div className="bg-[#0a0a0a] min-h-full p-4 overflow-y-auto">
                        <Content />
                    </div>
                </IphoneMockup>
            </div>
        );
    }

    return (
        <div className="grid lg:grid-cols-3 gap-8 mb-16 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/30 via-pink-500/20 to-red-500/30 blur-3xl -z-10" />
            <Content />
        </div>
    )
})

// Main Dashboard Mockup
const MainDashboardMockup = React.memo(() => {
    const isMobile = useIsMobile();
    const blurClass = isMobile ? 'blur-2xl' : 'blur-3xl';

    // Extracted content for reusability
    const Content = () => (
        <div className="flex h-full">
            {/* Sidebar - Hidden on mobile, visible on desktop */}
            {!isMobile && (
                <div className="hidden md:flex w-16 flex-col items-center py-6 border-r border-white/10 bg-white/[0.02]">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center mb-8">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    {[BarChart3, MessageSquare, Users, Bell, Clock, Target].map((Icon, i) => (
                        <div key={i} className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 cursor-pointer transition-all ${i === 0 ? 'bg-blue-500/20 text-blue-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}>
                            <Icon className="w-5 h-5" />
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 p-6 overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Dashboard Overview</h3>
                        <p className="text-xs text-white/50">Welcome back! Here's your growth summary.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                            All Systems Operational
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                            V
                        </div>
                    </div>
                </div>

                {/* Metric Cards */}
                <div className={`grid grid-cols-2 ${isMobile ? 'gap-3' : 'md:grid-cols-4 gap-4'} mb-6`}>
                    {[
                        { label: 'Total Followers', value: '24.5K', change: '+12.3%', icon: Users, color: 'blue' },
                        { label: 'Engagement', value: '8.7%', change: '+2.1%', icon: Heart, color: 'pink' },
                        { label: 'Comments', value: '847', change: '+34%', icon: MessageSquare, color: 'purple' },
                        { label: 'Reach', value: '156K', change: '+18%', icon: Eye, color: 'green' },
                    ].map((metric, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="p-4 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <metric.icon className={`w-4 h-4 ${metric.color === 'blue' ? 'text-blue-400' : metric.color === 'pink' ? 'text-pink-400' : metric.color === 'purple' ? 'text-purple-400' : 'text-green-400'}`} />
                                <span className="text-xs text-green-400">{metric.change}</span>
                            </div>
                            <div className="text-xl font-bold text-white">{metric.value}</div>
                            <div className="text-xs text-white/50">{metric.label}</div>
                        </motion.div>
                    ))}
                </div>

                {/* Main Grid */}
                <div className={`grid ${isMobile ? 'gap-4' : 'lg:grid-cols-3 gap-4'}`}>
                    {/* Chart Area */}
                    <div className={`${isMobile ? '' : 'lg:col-span-2'} p-4 rounded-xl bg-white/[0.02] border border-white/5`}>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-medium text-white">Growth Overview</h4>
                            <div className="flex gap-2">
                                <span className="text-[10px] px-2 py-1 rounded bg-blue-500/20 text-blue-400">7D</span>
                                {!isMobile && (
                                    <>
                                        <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/40">30D</span>
                                        <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/40">90D</span>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* Mini Chart */}
                        <div className="flex items-end justify-between h-32 gap-1">
                            {[40, 55, 45, 70, 65, 80, 75, 90, 85, 95, 88, 100].slice(0, isMobile ? 8 : 12).map((h, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    whileInView={{ height: `${h}% ` }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.05, duration: 0.4 }}
                                    className="flex-1 bg-gradient-to-t from-blue-500 to-purple-500 rounded-t opacity-70"
                                />
                            ))}
                        </div>
                    </div>

                    {/* Activity Feed */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <h4 className="text-sm font-medium text-white mb-3">Recent Activity</h4>
                        <div className="space-y-3">
                            {[
                                { text: 'New follower milestone: 24K', time: '2m ago', icon: Users },
                                { text: 'AI replied to 5 comments', time: '15m ago', icon: MessageSquare },
                                { text: 'Automation triggered', time: '1h ago', icon: Zap },
                                { text: 'Post scheduled', time: '2h ago', icon: Clock },
                            ].map((activity, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                        <activity.icon className="w-3 h-3 text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-white/70 truncate">{activity.text}</p>
                                        <p className="text-[10px] text-white/30">{activity.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom Row */}
                <div className={`grid ${isMobile ? 'gap-4 mt-4' : 'md:grid-cols-2 gap-4 mt-4'}`}>
                    {/* Goals */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <h4 className="text-sm font-medium text-white mb-3">Monthly Goals</h4>
                        <div className="space-y-3">
                            {[
                                { goal: 'Reach 25K followers', progress: 98, target: '24.5K / 25K' },
                                { goal: '5% engagement rate', progress: 100, target: '8.7% ✓' },
                                { goal: 'Post 30 times', progress: 73, target: '22 / 30' },
                            ].map((item, i) => (
                                <div key={i}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-white/70">{item.goal}</span>
                                        <span className="text-white/40">{item.target}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            whileInView={{ width: `${item.progress}% ` }}
                                            viewport={{ once: true }}
                                            transition={{ delay: i * 0.1, duration: 0.5 }}
                                            className={`h-full rounded-full ${item.progress >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 to-purple-500'}`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Automations Status */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <h4 className="text-sm font-medium text-white mb-3">Active Automations</h4>
                        <div className="space-y-2">
                            {[
                                { name: 'Comment Auto-Reply', status: 'active', runs: '247 today' },
                                { name: 'DM Responder', status: 'active', runs: '89 today' },
                                { name: 'Welcome Messages', status: 'active', runs: '34 today' },
                            ].map((auto, i) => (
                                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                        <span className="text-xs text-white">{auto.name}</span>
                                    </div>
                                    <span className="text-[10px] text-white/40">{auto.runs}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

    if (isMobile) {
        return (
            <div className="relative flex justify-center py-4">
                <div className={`absolute inset-0 bg-gradient-to-br from-blue-500/30 via-purple-500/20 to-violet-500/30 ${blurClass}`} style={{ transform: 'scale(1.2)' }} />
                <IphoneMockup isAutoScroll={true} className="relative z-10 w-[90%] max-w-[320px] h-[600px] border-gray-900 bg-gray-900 shadow-2xl">
                    <div className="bg-[#0a0a0a] min-h-full overflow-hidden flex flex-col">
                        <Content />
                    </div>
                </IphoneMockup>
            </div>
        );
    }

    return (
        <div className="relative">
            <div className={`absolute inset-0 bg-gradient-to-br from-blue-500/30 via-purple-500/20 to-violet-500/30 ${blurClass}`} />
            <div className="relative rounded-2xl overflow-hidden border border-blue-500/20 bg-[#0a0a0a] shadow-2xl">
                <Content />
            </div>
        </div>
    )
})

// Analytics Dashboard Mockup
const AnalyticsDashboardMockup = React.memo(() => {
    const isMobile = useIsMobile();
    const blurClass = isMobile ? 'blur-2xl' : 'blur-3xl';

    const Content = () => (
        <>
            {/* Dashboard Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-green-600/10 to-emerald-600/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Analytics Dashboard</h3>
                        <p className="text-xs text-white/50">Last updated: Just now</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        Live
                    </div>
                    {!isMobile && <span className="text-xs text-white/40">Last 30 days</span>}
                </div>
            </div>

            {/* Dashboard Content */}
            <div className="p-6">
                {/* Top Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Total Followers', value: '24,847', change: '+12.3%', up: true },
                        { label: 'Engagement Rate', value: '8.7%', change: '+2.1%', up: true },
                        { label: 'Avg. Reach', value: '45.2K', change: '+18.5%', up: true },
                        { label: 'Profile Visits', value: '3,521', change: '-3.2%', up: false },
                    ].map((stat, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="p-4 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                            <div className="text-xs text-white/50 mb-1">{stat.label}</div>
                            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                            <div className={`text-xs font-medium ${stat.up ? 'text-green-400' : 'text-red-400'} `}>
                                {stat.up ? '↑' : '↓'} {stat.change}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Chart Area */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {/* Main Chart */}
                    <div className="lg:col-span-2 p-5 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-medium text-white">Engagement Over Time</h4>
                            <div className="flex gap-2">
                                <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">Likes</span>
                                <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">Comments</span>
                            </div>
                        </div>
                        {/* Animated Chart Bars */}
                        <div className="flex items-end justify-between h-44 gap-2">
                            {[35, 52, 45, 68, 55, 72, 48, 85, 62, 78, 55, 92, 68, 88].slice(0, isMobile ? 8 : 14).map((h, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    whileInView={{ height: `${h}% ` }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.05, duration: 0.5 }}
                                    className="flex-1 bg-gradient-to-t from-green-500 to-emerald-400 rounded-t relative group"
                                >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white bg-black/50 px-1 rounded">
                                        {h * 12}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        {!isMobile && (
                            <div className="flex justify-between mt-2 text-[10px] text-white/30">
                                {['Jan 1', 'Jan 7', 'Jan 14', 'Jan 21', 'Jan 28'].map((d, i) => (
                                    <span key={i}>{d}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Best Posting Times */}
                    <div className="p-5 rounded-xl bg-white/[0.02] border border-white/5">
                        <h4 className="font-medium text-white mb-4">Best Posting Times</h4>
                        <div className="space-y-3">
                            {[
                                { day: 'Tuesday', time: '6:00 PM', engagement: '92%' },
                                { day: 'Thursday', time: '12:00 PM', engagement: '87%' },
                                { day: 'Saturday', time: '10:00 AM', engagement: '84%' },
                                { day: 'Friday', time: '7:00 PM', engagement: '79%' },
                            ].map((slot, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: 10 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]"
                                >
                                    <div>
                                        <div className="text-sm text-white">{slot.day}</div>
                                        <div className="text-xs text-white/50">{slot.time}</div>
                                    </div>
                                    <div className="text-sm font-semibold text-green-400">{slot.engagement}</div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    if (isMobile) {
        return (
            <div className="relative flex justify-center py-4">
                <div className={`absolute inset-0 bg-gradient-to-br from-green-500/30 via-emerald-500/20 to-teal-500/30 ${blurClass}`} style={{ transform: 'scale(1.2)' }} />
                <IphoneMockup isAutoScroll={true} className="relative z-10 w-[90%] max-w-[320px] h-[600px] border-gray-900 bg-gray-900 shadow-2xl">
                    <div className="bg-[#0a0a0a] min-h-full overflow-y-auto">
                        <Content />
                    </div>
                </IphoneMockup>
            </div>
        );
    }

    return (
        <div className="relative">
            <div className={`absolute inset-0 bg-gradient-to-br from-green-500/30 via-emerald-500/20 to-teal-500/30 ${blurClass}`} />
            <div className="relative rounded-2xl overflow-hidden border border-green-500/20 bg-[#0a0a0a] shadow-2xl">
                <Content />
            </div>
        </div>
    )
})


const Features = () => {
    const isMobile = useIsMobile()
    const { openWaitlist } = useWaitlist()


    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Features - Veefore | AI-Powered Growth Tools"
                description="Discover Veefore's powerful features - AI automation, engagement tools, analytics, and more to help you grow your audience."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[800vh]' : 'fixed'} inset - 0 pointer - events - none overflow - hidden - z - 10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top - [100px] - left - [100px]`} color="blue" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top - [50 %] - right - [100px]`} color="purple" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Navigation */}
            <MainNavigation />

            {/* Hero Section */}
            <section className="relative pt-28 pb-16 md:pt-40 md:pb-24 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-400 text-sm mb-6">
                            <Sparkles className="w-4 h-4 mr-2" />
                            Powerful Tools for Creators
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight mb-6"
                    >
                        <span className="text-white">The Complete </span>
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Growth Platform
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-8 md:mb-10"
                    >
                        AI-powered automation, intelligent engagement, and deep analytics working together to skyrocket your growth.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex flex-col sm:flex-row gap-4 justify-center"
                    >
                        <button onClick={openWaitlist} className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-all group cursor-pointer">
                            Join Waitlist
                            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <button className="inline-flex items-center justify-center px-8 py-4 rounded-full border border-white/20 text-white font-medium hover:bg-white/5 transition-all gap-2">
                            <Play className="w-5 h-5" />
                            Watch Demo
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* 1. VeeGPT Section */}
            <LazySection>
                <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden" id="veegpt">
                    {/* Background Effects */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-black via-cyan-900/5 to-blue-900/10" />
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-cyan-500/10 via-transparent to-transparent blur-[120px]" />
                    </div>

                    <div className="max-w-7xl mx-auto relative">
                        {/* Section Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400 text-sm mb-6">
                                <Bot className="w-4 h-4 mr-2" />
                                ⭐ Our Flagship Feature
                            </span>
                            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6">
                                <span className="text-white">Meet </span>
                                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-teal-400 bg-clip-text text-transparent">VeeGPT</span>
                            </h2>
                            <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                                Not just another AI chatbot — VeeGPT is your personal growth agent that thinks, plans, and executes tasks for you.
                                Powered by a revolutionary <span className="text-cyan-400 font-semibold">Hybrid AI Engine</span> that automatically selects the best AI model for each task.
                            </p>
                        </motion.div>

                        {/* Main VeeGPT Visual - Chat Interface */}
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="max-w-2xl mx-auto mb-20"
                        >
                            <VeeGPTChatMockup />
                        </motion.div>

                        {/* Key Differentiators */}
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-16 md:mb-20">
                            {[
                                { icon: Brain, title: "Hybrid AI Engine", desc: "Automatically analyzes your query complexity and routes to the best AI model (GPT-4o, Claude, Gemini) for optimal results" },
                                { icon: Zap, title: "Agent Capabilities", desc: "Goes beyond answering questions — VeeGPT executes multi-step tasks like creating content plans, analyzing data, and scheduling posts" },
                                { icon: Target, title: "Growth-Focused", desc: "Purpose-built for social media and business growth with specialized knowledge in engagement, content strategy, and audience building" },
                            ].map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1 }}
                                    className="p-6 rounded-2xl bg-white/[0.03] border border-cyan-500/20 hover:border-cyan-500/40 transition-all"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mb-4">
                                        <item.icon className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                                    <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
                                </motion.div>
                            ))}
                        </div>

                        {/* Two Column Layout - Hybrid AI + Agent Tasks */}
                        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 mb-16 md:mb-20">
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                            >
                                <div className="mb-6">
                                    <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                                        Intelligent Model Selection
                                    </h3>
                                    <p className="text-white/60 leading-relaxed">
                                        VeeGPT's Hybrid AI Engine analyzes the complexity and type of your query, then automatically routes it to the most capable AI model.
                                        Creative tasks go to models optimized for creativity, while analytical tasks use models built for reasoning.
                                    </p>
                                </div>
                                <HybridAIMockup />
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.2 }}
                            >
                                <div className="mb-6">
                                    <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                                        Works Like an Agent
                                    </h3>
                                    <p className="text-white/60 leading-relaxed">
                                        Unlike basic chatbots, VeeGPT takes action. Ask it to create a content strategy and it will analyze your data,
                                        generate ideas, create posts, and schedule them — all automatically while you focus on what matters.
                                    </p>
                                </div>
                                <AgentTasksMockup />
                            </motion.div>
                        </div>

                        {/* VeeGPT Capabilities List */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="p-8 md:p-12 rounded-3xl bg-gradient-to-br from-cyan-600/20 via-blue-600/10 to-teal-600/20 border border-cyan-500/20"
                        >
                            <div className="text-center mb-10">
                                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">What VeeGPT Can Do For You</h3>
                                <p className="text-white/50">Ask VeeGPT anything about growth — it understands and acts</p>
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    "Analyze your content performance",
                                    "Create weekly content strategies",
                                    "Write engaging captions & hashtags",
                                    "Respond to comments intelligently",
                                    "Schedule posts at optimal times",
                                    "Research competitor strategies",
                                    "Generate viral content ideas",
                                    "Build engagement automations",
                                    "Track and report growth metrics",
                                    "Optimize your profile & bio",
                                    "Plan product launch campaigns",
                                    "Answer any growth question",
                                ].map((text, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.03 }}
                                        className="flex items-center gap-2 p-3 rounded-xl bg-white/5"
                                    >
                                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                                        <span className="text-sm text-white/70">{text}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </section>
            </LazySection>

            {/* AI Engagement - Expanded Showcase Section */}
            <LazySection>
                <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden">
                    {/* Background Effects - Blends from Orange to Purple */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-orange-900/10 via-transparent to-fuchsia-900/10" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-yellow-500/15 blur-[150px] rounded-full" />
                    </div>

                    <div className="max-w-7xl mx-auto relative">
                        {/* Section Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 text-orange-400 text-sm mb-6">
                                <Brain className="w-4 h-4 mr-2" />
                                🔥 AI-Powered Engagement
                            </span>
                            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6">
                                <span className="text-white">Engage </span>
                                <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">Smarter, Not Harder</span>
                            </h2>
                            <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                                Let our AI handle your engagement 24/7. It understands context, sentiment, and your unique voice to create
                                <span className="text-orange-400 font-semibold"> authentic responses</span> that feel genuinely human.
                            </p>
                        </motion.div>

                        {/* Impact Stats Row */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16"
                        >
                            {[
                                { value: '10x', label: 'More Responses', icon: MessageSquare },
                                { value: '24/7', label: 'Always Active', icon: Clock },
                                { value: '85%', label: 'Time Saved', icon: Zap },
                                { value: '3.2x', label: 'Engagement Boost', icon: TrendingUp },
                            ].map((stat, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1 }}
                                    className="p-5 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20 text-center"
                                >
                                    <stat.icon className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                                    <div className="text-3xl md:text-4xl font-bold text-white">{stat.value}</div>
                                    <div className="text-sm text-white/50">{stat.label}</div>
                                </motion.div>
                            ))}
                        </motion.div>

                        {/* Main Visual - Chat + Response Demo */}
                        <div className="grid md:grid-cols-2 gap-6 lg:gap-10 mb-16 md:mb-20">
                            {/* Left - Comment Response Demo */}
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                            >
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/30 via-amber-500/20 to-yellow-500/30 blur-3xl" />
                                    <div className="relative rounded-2xl overflow-hidden border border-orange-500/20 bg-[#0a0a0a] shadow-2xl p-6">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                                                <MessageSquare className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-white">Smart Comment Responses</h3>
                                                <p className="text-xs text-white/50">AI understands and responds authentically</p>
                                            </div>
                                        </div>

                                        {/* Demo Comments */}
                                        <div className="space-y-4">
                                            {[
                                                { user: '@fitness_journey', comment: "Love this workout routine! 💪 Any tips for beginners?", reply: "Thanks so much! For beginners, I'd suggest starting with 2-3 sets instead of 5. Focus on form first, then gradually increase. Want me to share a beginner-friendly version?", time: '2m ago' },
                                                { user: '@creative_soul', comment: "Where did you get that amazing outfit?", reply: "Thank you! It's from @brandname's new collection. I'll tag them in the post! They have a 20% off sale right now 🛍️", time: '5m ago' },
                                            ].map((item, i) => (
                                                <motion.div
                                                    key={i}
                                                    initial={{ opacity: 0, y: 15 }}
                                                    whileInView={{ opacity: 1, y: 0 }}
                                                    viewport={{ once: true }}
                                                    transition={{ delay: i * 0.2 }}
                                                    className="p-4 rounded-xl bg-white/[0.03] border border-white/5"
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-medium text-orange-400">{item.user}</span>
                                                        <span className="text-[10px] text-white/30">{item.time}</span>
                                                    </div>
                                                    <p className="text-sm text-white/70 mb-3">{item.comment}</p>
                                                    <div className="pl-4 border-l-2 border-orange-500/40">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Sparkles className="w-3 h-3 text-orange-400" />
                                                            <span className="text-[10px] text-orange-400 font-medium">AI Response</span>
                                                        </div>
                                                        <p className="text-sm text-white/60">{item.reply}</p>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Right - DM Automation Demo */}
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.2 }}
                            >
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/30 via-orange-500/20 to-red-500/30 blur-3xl" />
                                    <div className="relative rounded-2xl overflow-hidden border border-amber-500/20 bg-[#0a0a0a] shadow-2xl p-6">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                                                <Send className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-white">Automated DM Replies</h3>
                                                <p className="text-xs text-white/50">Convert followers into fans</p>
                                            </div>
                                        </div>

                                        {/* DM Demo */}
                                        <div className="space-y-3">
                                            <motion.div
                                                initial={{ opacity: 0, x: 20 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                viewport={{ once: true }}
                                                className="flex justify-end"
                                            >
                                                <div className="max-w-[80%] p-3 rounded-2xl rounded-tr-sm bg-white/10 text-white text-sm">
                                                    Hey! Loved your recent post about productivity. Do you have any course or guide?
                                                </div>
                                            </motion.div>

                                            <motion.div
                                                initial={{ opacity: 0, x: -20 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                viewport={{ once: true }}
                                                transition={{ delay: 0.3 }}
                                                className="flex justify-start"
                                            >
                                                <div className="max-w-[80%] p-3 rounded-2xl rounded-tl-sm bg-gradient-to-r from-orange-500 to-amber-500">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Sparkles className="w-3 h-3 text-white/80" />
                                                        <span className="text-[10px] text-white/80 font-medium">Auto-Reply</span>
                                                    </div>
                                                    <p className="text-sm text-white">Thanks for reaching out! 🙌 Yes, I have a free productivity guide! Here's the link: [link]. Let me know if you have questions!</p>
                                                </div>
                                            </motion.div>

                                            <motion.div
                                                initial={{ opacity: 0, x: 20 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                viewport={{ once: true }}
                                                transition={{ delay: 0.5 }}
                                                className="flex justify-end"
                                            >
                                                <div className="max-w-[80%] p-3 rounded-2xl rounded-tr-sm bg-white/10 text-white text-sm">
                                                    This is amazing! Thank you so much! 🙏
                                                </div>
                                            </motion.div>
                                        </div>

                                        {/* Stats */}
                                        <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
                                            <div className="text-center">
                                                <div className="text-2xl font-bold text-amber-400">247</div>
                                                <div className="text-xs text-white/50">DMs today</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-2xl font-bold text-green-400">94%</div>
                                                <div className="text-xs text-white/50">Response rate</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>

                        {/* Use Cases Grid */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                        >
                            <h3 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">How Creators Use AI Engagement</h3>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                                {[
                                    { title: 'Reply to Comments', desc: 'Automatically respond to every comment with context-aware replies', icon: MessageSquare },
                                    { title: 'Answer FAQs', desc: 'Detect common questions and provide helpful answers instantly', icon: Brain },
                                    { title: 'Thank New Followers', desc: 'Send personalized welcome messages to new followers', icon: Heart },
                                    { title: 'Handle Inquiries', desc: 'Process DM inquiries about products, collabs, and more', icon: Send },
                                ].map((item, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.1 }}
                                        className="p-5 rounded-2xl bg-white/[0.03] border border-orange-500/10 hover:border-orange-500/30 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mb-4 group-hover:from-orange-500 group-hover:to-amber-500 transition-all">
                                            <item.icon className="w-5 h-5 text-orange-400 group-hover:text-white transition-colors" />
                                        </div>
                                        <h4 className="font-semibold text-white mb-2">{item.title}</h4>
                                        <p className="text-sm text-white/50">{item.desc}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </section>
            </LazySection>


            {/* 2. Automation Section */}
            <LazySection>
                <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden">
                    {/* Background Effects - Blends from Purple to Emerald */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-transparent to-emerald-900/10" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-purple-500/15 via-pink-500/10 to-rose-500/15 blur-[150px] rounded-full" />
                    </div>

                    <div className="max-w-7xl mx-auto relative">
                        {/* Section Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-400 text-sm mb-6">
                                <RefreshCw className="w-4 h-4 mr-2" />
                                ⚡ Automation Workflows
                            </span>
                            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6">
                                <span className="text-white">Build Relationships </span>
                                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-rose-400 bg-clip-text text-transparent">on Autopilot</span>
                            </h2>
                            <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                                Create powerful automation workflows that run 24/7. Set triggers, define actions, and let
                                <span className="text-purple-400 font-semibold"> Veefore handle the rest</span> while you focus on creating.
                            </p>
                        </motion.div>

                        {/* Central Workflow Builder Mockup */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="max-w-7xl mx-auto mb-20"
                        >
                            <WorkflowBuilderMockup />
                        </motion.div>

                        {/* Automation Templates */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mb-16"
                        >
                            <h3 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">Pre-Built Automation Templates</h3>
                            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                                {[
                                    {
                                        title: 'Welcome New Followers',
                                        desc: 'Automatically send personalized DMs to new followers within minutes of follow',
                                        trigger: 'New Follower',
                                        actions: ['Send Welcome DM', 'Add to List'],
                                        runs: '2.4K',
                                        icon: Users
                                    },
                                    {
                                        title: 'Comment Auto-Reply',
                                        desc: 'AI-powered replies to comments based on context and sentiment analysis',
                                        trigger: 'New Comment',
                                        actions: ['Analyze Sentiment', 'Generate Reply', 'Post Reply'],
                                        runs: '8.1K',
                                        icon: MessageSquare
                                    },
                                    {
                                        title: 'Re-Engage Inactive',
                                        desc: 'Reach out to followers who havent engaged in 30+ days with personalized content',
                                        trigger: '30 Days Inactive',
                                        actions: ['Check Last Activity', 'Send Re-engagement'],
                                        runs: '956',
                                        icon: Repeat
                                    },
                                ].map((template, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.1 }}
                                        className="p-6 rounded-2xl bg-white/[0.03] border border-purple-500/10 hover:border-purple-500/30 transition-all group"
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center group-hover:from-purple-500 group-hover:to-pink-500 transition-all">
                                                <template.icon className="w-6 h-6 text-purple-400 group-hover:text-white transition-colors" />
                                            </div>
                                            <span className="text-xs text-white/40">{template.runs} runs</span>
                                        </div>
                                        <h4 className="font-semibold text-white text-lg mb-2">{template.title}</h4>
                                        <p className="text-sm text-white/50 mb-4">{template.desc}</p>

                                        {/* Mini Flow */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] px-2 py-1 rounded bg-purple-500/20 text-purple-400">{template.trigger}</span>
                                            <ArrowRight className="w-3 h-3 text-white/30" />
                                            {template.actions.map((action, j) => (
                                                <React.Fragment key={j}>
                                                    <span className="text-[10px] px-2 py-1 rounded bg-pink-500/20 text-pink-400">{action}</span>
                                                    {j < template.actions.length - 1 && <ArrowRight className="w-3 h-3 text-white/30" />}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Trigger Types */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-purple-600/10 via-pink-600/5 to-rose-600/10 border border-purple-500/20"
                        >
                            <div className="text-center mb-8">
                                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">Powerful Trigger Options</h3>
                                <p className="text-white/50">Start automations based on any event</p>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
                                {[
                                    { label: 'New Comment', icon: MessageSquare },
                                    { label: 'New Follower', icon: Users },
                                    { label: 'New DM', icon: Send },
                                    { label: 'Post Published', icon: Instagram },
                                    { label: 'Mention', icon: Bell },
                                    { label: 'Story View', icon: Eye },
                                    { label: 'Link Click', icon: Target },
                                    { label: 'Keyword Match', icon: Brain },
                                    { label: 'Time-Based', icon: Clock },
                                    { label: 'Engagement Drop', icon: TrendingUp },
                                    { label: 'New Like', icon: Heart },
                                    { label: 'Custom Event', icon: Zap },
                                ].map((trigger, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.03 }}
                                        className="flex items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-purple-500/20 transition-all cursor-pointer group"
                                    >
                                        <trigger.icon className="w-4 h-4 text-purple-400 group-hover:text-white transition-colors flex-shrink-0" />
                                        <span className="text-xs text-white/70 group-hover:text-white transition-colors">{trigger.label}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </section>
            </LazySection>


            {/* Analytics - Expanded Showcase Section */}
            <LazySection>
                <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden">
                    {/* Background Effects - Blends from Emerald to Rose */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/10 via-transparent to-rose-900/10" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-green-500/15 via-emerald-500/10 to-teal-500/15 blur-[150px] rounded-full" />
                    </div>

                    <div className="max-w-7xl mx-auto relative">
                        {/* Section Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-400 text-sm mb-6">
                                <BarChart3 className="w-4 h-4 mr-2" />
                                📊 Real-Time Analytics
                            </span>
                            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6">
                                <span className="text-white">Understand What's </span>
                                <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent">Actually Working</span>
                            </h2>
                            <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                                Get deep insights into your growth with
                                <span className="text-green-400 font-semibold"> real-time analytics</span>. Track engagement, discover optimal posting times, and understand what resonates with your audience.
                            </p>
                        </motion.div>

                        {/* Main Dashboard Mockup */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mb-16"
                        >
                            <AnalyticsDashboardMockup />
                        </motion.div>

                        {/* Key Metrics Grid */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mb-16"
                        >
                            <h3 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">Track Every Metric That Matters</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                                {[
                                    { title: 'Follower Growth', desc: 'Track daily, weekly, monthly follower trends', icon: Users, value: '+1.2K/week' },
                                    { title: 'Engagement Rate', desc: 'Likes, comments, shares per post', icon: Heart, value: '8.7%' },
                                    { title: 'Reach & Impressions', desc: 'How far your content travels', icon: Eye, value: '45.2K avg' },
                                    { title: 'Story Performance', desc: 'Views, replies, exits on stories', icon: Instagram, value: '12K views' },
                                    { title: 'Post Performance', desc: 'Which content types work best', icon: BarChart3, value: 'Reels +32%' },
                                    { title: 'Audience Insights', desc: 'Demographics, locations, interests', icon: Target, value: '18-34 top' },
                                    { title: 'Best Times', desc: 'When your audience is online', icon: Clock, value: '6PM Tue' },
                                    { title: 'Competitor Analysis', desc: 'Benchmark against similar accounts', icon: TrendingUp, value: '+15% vs avg' },
                                ].map((metric, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.05 }}
                                        className="p-5 rounded-2xl bg-white/[0.03] border border-green-500/10 hover:border-green-500/30 transition-all group"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center group-hover:from-green-500 group-hover:to-emerald-500 transition-all">
                                                <metric.icon className="w-5 h-5 text-green-400 group-hover:text-white transition-colors" />
                                            </div>
                                            <span className="text-sm font-semibold text-green-400">{metric.value}</span>
                                        </div>
                                        <h4 className="font-semibold text-white mb-1">{metric.title}</h4>
                                        <p className="text-sm text-white/50">{metric.desc}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>

                        {/* AI Insights Panel */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-green-600/10 via-emerald-600/5 to-teal-600/10 border border-green-500/20"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">AI-Powered Insights</h3>
                                    <p className="text-sm text-white/50">Actionable recommendations based on your data</p>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                    { insight: 'Your Reels get 3.2x more engagement than static posts. Consider posting more Reels.', type: 'tip' },
                                    { insight: 'Engagement drops 40% on Mondays. Try shifting Monday content to Tuesday.', type: 'warning' },
                                    { insight: 'Posts with questions get 2x more comments. Add CTAs to boost engagement.', type: 'tip' },
                                    { insight: 'Your 6 PM posts perform 52% better than morning posts.', type: 'success' },
                                    { insight: 'Carousel posts have highest save rate (4.2%). Great for evergreen content.', type: 'success' },
                                    { insight: 'Hashtag #productivity drives 28% of your discovery reach.', type: 'tip' },
                                ].map((item, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.05 }}
                                        className={`p - 4 rounded - xl border ${item.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20' :
                                            item.type === 'success' ? 'bg-green-500/10 border-green-500/20' :
                                                'bg-blue-500/10 border-blue-500/20'
                                            } `}
                                    >
                                        <div className="flex items-start gap-2">
                                            <Brain className={`w - 4 h - 4 mt - 0.5 flex - shrink - 0 ${item.type === 'warning' ? 'text-amber-400' :
                                                item.type === 'success' ? 'text-green-400' :
                                                    'text-blue-400'
                                                } `} />
                                            <p className="text-sm text-white/70">{item.insight}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </section>
            </LazySection>


            {/* 4. Scheduling Section */}
            <LazySection>
                <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden">
                    {/* Background Effects - Blends from Rose to Indigo */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-rose-900/10 via-transparent to-indigo-900/10" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-rose-500/15 via-pink-500/10 to-red-500/15 blur-[150px] rounded-full" />
                    </div>

                    <div className="max-w-7xl mx-auto relative">
                        {/* Section Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30 text-rose-400 text-sm mb-6">
                                <Calendar className="w-4 h-4 mr-2" />
                                📅 Smart Scheduling
                            </span>
                            <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6">
                                <span className="text-white">Perfect Timing, </span>
                                <span className="bg-gradient-to-r from-rose-400 via-pink-400 to-red-400 bg-clip-text text-transparent">Every Time</span>
                            </h2>
                            <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                                Plan and schedule your content with
                                <span className="text-rose-400 font-semibold"> AI-recommended optimal times</span>. Our algorithm analyzes when your audience is most active to maximize engagement.
                            </p>
                        </motion.div>

                        {/* Main Calendar + Queue Layout */}
                        <SchedulingCalendarMockup />

                        {/* Optimal Times Heatmap */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mb-16"
                        >
                            <h3 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">Your Audience is Most Active</h3>
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-pink-500/10 to-transparent blur-3xl" />
                                <div className="relative p-6 rounded-2xl bg-white/[0.02] border border-rose-500/10">
                                    {/* Time Labels */}
                                    <div className="flex mb-4">
                                        <div className="w-16" />
                                        <div className="flex-1 grid grid-cols-6 gap-2 text-center">
                                            {['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'].map((t, i) => (
                                                <span key={i} className="text-xs text-white/40">{t}</span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Heatmap Grid */}
                                    <div className="space-y-2">
                                        {[
                                            { day: 'Mon', values: [20, 35, 45, 40, 75, 55] },
                                            { day: 'Tue', values: [25, 40, 55, 50, 92, 65] },
                                            { day: 'Wed', values: [22, 38, 48, 45, 78, 58] },
                                            { day: 'Thu', values: [30, 42, 60, 55, 85, 62] },
                                            { day: 'Fri', values: [28, 45, 52, 48, 88, 70] },
                                            { day: 'Sat', values: [50, 65, 55, 42, 60, 45] },
                                            { day: 'Sun', values: [55, 60, 50, 38, 55, 40] },
                                        ].map((row, i) => (
                                            <div key={i} className="flex">
                                                <div className="w-16 text-sm text-white/50 flex items-center">{row.day}</div>
                                                <div className="flex-1 grid grid-cols-6 gap-2">
                                                    {row.values.map((v, j) => (
                                                        <motion.div
                                                            key={j}
                                                            initial={{ opacity: 0 }}
                                                            whileInView={{ opacity: 1 }}
                                                            viewport={{ once: true }}
                                                            transition={{ delay: (i * 6 + j) * 0.02 }}
                                                            className={`h - 8 rounded flex items - center justify - center text - xs font - medium transition - all cursor - pointer hover: scale - 105 ${v > 80 ? 'bg-rose-500 text-white' :
                                                                v > 60 ? 'bg-rose-500/70 text-white' :
                                                                    v > 40 ? 'bg-rose-500/40 text-white/80' :
                                                                        'bg-rose-500/20 text-white/50'
                                                                } `}
                                                        >
                                                            {v > 80 && '🔥'}
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Legend */}
                                    <div className="flex items-center justify-center gap-4 mt-6">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded bg-rose-500/20" />
                                            <span className="text-xs text-white/50">Low</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded bg-rose-500/40" />
                                            <span className="text-xs text-white/50">Medium</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded bg-rose-500" />
                                            <span className="text-xs text-white/50">High (Best)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Scheduling Features */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-rose-600/10 via-pink-600/5 to-red-600/10 border border-rose-500/20"
                        >
                            <div className="text-center mb-8">
                                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">Powerful Scheduling Features</h3>
                                <p className="text-white/50">Everything you need to plan your content strategy</p>
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { title: 'AI Optimal Times', desc: 'Post when your audience is most active', icon: Clock },
                                    { title: 'Drag & Drop', desc: 'Easily reschedule with visual calendar', icon: Calendar },
                                    { title: 'Auto-Publish', desc: 'Set it and forget it automation', icon: Zap },
                                    { title: 'Smart Queue', desc: 'Auto-rebalance based on performance', icon: RefreshCw },
                                    { title: 'Multi-Platform', desc: 'Schedule across all your accounts', icon: Instagram },
                                    { title: 'Bulk Upload', desc: 'Upload and schedule weeks ahead', icon: Send },
                                    { title: 'Time Zones', desc: 'Schedule for global audiences', icon: Clock },
                                    { title: 'Content Preview', desc: 'See exactly how posts will look', icon: Eye },
                                ].map((feature, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 15 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.05 }}
                                        className="p-4 rounded-xl bg-white/5 hover:bg-rose-500/10 transition-all group"
                                    >
                                        <feature.icon className="w-5 h-5 text-rose-400 mb-2 group-hover:text-white transition-colors" />
                                        <h4 className="font-semibold text-white text-sm mb-1">{feature.title}</h4>
                                        <p className="text-xs text-white/50">{feature.desc}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </section>
            </LazySection>


            {/* 5. Growth Loops Section */}
            <LazySection>
                <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden">
                    {/* Background Effects - Blends from Indigo to Blue */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/10 via-transparent to-blue-900/10" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-purple-500/15 blur-[150px] rounded-full" />
                    </div>

                    <div className="max-w-7xl mx-auto relative">
                        {/* Section Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 text-indigo-400 text-sm mb-6">
                                <RefreshCw className="w-4 h-4 mr-2" />
                                🚀 Viral Growth Engine
                            </span>
                            <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6">
                                <span className="text-white">Create </span>
                                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">Viral Growth Loops</span>
                            </h2>
                            <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                                Build self-sustaining growth systems that turn every follower into a
                                <span className="text-indigo-400 font-semibold"> potential promoter</span>. Watch your reach multiply exponentially.
                            </p>
                        </motion.div>

                        {/* Flywheel Visualization + Stats */}
                        <div className="grid lg:grid-cols-2 gap-12 mb-20 items-center">
                            {/* Animated Flywheel */}
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                className="relative"
                            >
                                <div className="relative aspect-square max-w-md mx-auto">
                                    {/* Outer rotating ring */}
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-500/30"
                                    />

                                    {/* Middle ring */}
                                    <motion.div
                                        animate={{ rotate: -360 }}
                                        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-6 rounded-full border border-violet-500/40"
                                    />

                                    {/* Inner glowing core */}
                                    <div className="absolute inset-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center">
                                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-2xl shadow-indigo-500/50">
                                            <RefreshCw className="w-10 h-10 text-white animate-spin" style={{ animationDuration: '3s' }} />
                                        </div>
                                    </div>

                                    {/* Orbiting stages */}
                                    {[
                                        { label: 'Create', icon: Sparkles, angle: 0 },
                                        { label: 'Share', icon: Share2, angle: 90 },
                                        { label: 'Engage', icon: Heart, angle: 180 },
                                        { label: 'Grow', icon: TrendingUp, angle: 270 },
                                    ].map((stage, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, scale: 0 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.2 + i * 0.15 }}
                                            className="absolute"
                                            style={{
                                                top: `${50 - 42 * Math.cos((stage.angle * Math.PI) / 180)}% `,
                                                left: `${50 + 42 * Math.sin((stage.angle * Math.PI) / 180)}% `,
                                                transform: 'translate(-50%, -50%)'
                                            }}
                                        >
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg">
                                                    <stage.icon className="w-6 h-6 text-white" />
                                                </div>
                                                <span className="text-xs font-medium text-white">{stage.label}</span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Growth Metrics */}
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.2 }}
                                className="space-y-6"
                            >
                                <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20">
                                    <h3 className="text-xl font-bold text-white mb-4">Your Growth Multiplier</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { value: '3.2x', label: 'Viral Coefficient', change: '+0.4 this week' },
                                            { value: '48hr', label: 'Avg. Loop Time', change: '-12hr improved' },
                                            { value: '2,847', label: 'Shares This Month', change: '+156% vs last' },
                                            { value: '89%', label: 'Engagement Rate', change: 'Top 5% creators' },
                                        ].map((stat, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, y: 15 }}
                                                whileInView={{ opacity: 1, y: 0 }}
                                                viewport={{ once: true }}
                                                transition={{ delay: 0.3 + i * 0.1 }}
                                                className="p-4 rounded-xl bg-white/[0.03]"
                                            >
                                                <div className="text-2xl font-bold text-indigo-400">{stat.value}</div>
                                                <div className="text-sm text-white mb-1">{stat.label}</div>
                                                <div className="text-xs text-green-400">{stat.change}</div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                {/* Active Loops */}
                                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="font-medium text-white">Active Growth Loops</h4>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                            <span className="text-xs text-green-400">3 running</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {[
                                            { name: 'Share-to-Unlock', type: 'UGC Campaign', reach: '12.4K' },
                                            { name: 'Comment Rewards', type: 'Engagement Loop', reach: '8.2K' },
                                            { name: 'Tag-a-Friend', type: 'Viral Challenge', reach: '5.7K' },
                                        ].map((loop, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]">
                                                <div>
                                                    <div className="text-sm text-white">{loop.name}</div>
                                                    <div className="text-xs text-white/50">{loop.type}</div>
                                                </div>
                                                <div className="text-sm font-medium text-indigo-400">{loop.reach} reach</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        </div>

                        {/* Loop Stages */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mb-16"
                        >
                            <h3 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">How the Growth Loop Works</h3>
                            <div className="grid md:grid-cols-4 gap-4 relative">
                                {/* Connecting arrows (desktop) */}
                                <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500/50 via-violet-500/50 to-indigo-500/50 -translate-y-1/2 z-0" />

                                {[
                                    { step: '01', title: 'Create Value', desc: 'Post engaging content that your audience loves and wants to share', icon: Sparkles },
                                    { step: '02', title: 'Incentivize Sharing', desc: 'Offer rewards, exclusive content, or recognition for shares', icon: Share2 },
                                    { step: '03', title: 'New Discovery', desc: 'Shared content reaches new audiences through trusted connections', icon: Users },
                                    { step: '04', title: 'Convert & Repeat', desc: 'New followers join and become sharers themselves', icon: RefreshCw },
                                ].map((stage, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.1 }}
                                        className="relative z-10 p-6 rounded-2xl bg-[#0a0a0a] border border-indigo-500/20 hover:border-indigo-500/40 transition-all group"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <stage.icon className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="text-xs text-indigo-400 font-bold mb-2">STEP {stage.step}</div>
                                        <h4 className="font-semibold text-white text-lg mb-2">{stage.title}</h4>
                                        <p className="text-sm text-white/50">{stage.desc}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Growth Loop Types */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-indigo-600/10 via-violet-600/5 to-purple-600/10 border border-indigo-500/20"
                        >
                            <div className="text-center mb-8">
                                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">Pre-Built Growth Loop Templates</h3>
                                <p className="text-white/50">Launch viral campaigns in minutes</p>
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                    { title: 'Share-to-Unlock', desc: 'Exclusive content unlocked after followers share your post', multiplier: '4.2x', icon: Share2 },
                                    { title: 'Comment Rewards', desc: 'Top commenters get featured in your stories or posts', multiplier: '2.8x', icon: MessageSquare },
                                    { title: 'Tag Challenge', desc: 'Encourage tagging friends with prizes for participation', multiplier: '5.1x', icon: Users },
                                    { title: 'UGC Campaigns', desc: 'Fans create content about you for repost opportunities', multiplier: '3.5x', icon: Heart },
                                    { title: 'Milestone Celebrations', desc: 'Celebrate follower milestones with community shoutouts', multiplier: '2.3x', icon: TrendingUp },
                                    { title: 'Referral Program', desc: 'Reward followers who bring in new engaged followers', multiplier: '6.7x', icon: RefreshCw },
                                ].map((template, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.05 }}
                                        className="p-5 rounded-xl bg-white/5 hover:bg-indigo-500/10 transition-all group cursor-pointer"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <template.icon className="w-5 h-5 text-indigo-400" />
                                            <span className="text-xs font-bold text-violet-400">{template.multiplier} avg</span>
                                        </div>
                                        <h4 className="font-semibold text-white mb-1">{template.title}</h4>
                                        <p className="text-xs text-white/50">{template.desc}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </section>
            </LazySection>


            {/* 6. Dashboard Preview Section */}
            <LazySection>
                <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden">
                    {/* Background Effects - Final Blend from Blue to Transparent/Black */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 via-transparent to-black" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-blue-500/15 via-purple-500/10 to-violet-500/15 blur-[150px] rounded-full" />
                    </div>

                    <div className="max-w-7xl mx-auto relative">
                        {/* Section Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-400 text-sm mb-6">
                                <BarChart3 className="w-4 h-4 mr-2" />
                                🎯 Command Center
                            </span>
                            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6">
                                <span className="text-white">Everything in </span>
                                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-violet-400 bg-clip-text text-transparent">One Place</span>
                            </h2>
                            <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                                A beautiful, intuitive dashboard that gives you a
                                <span className="text-blue-400 font-semibold"> complete view of your growth</span>. Monitor metrics, manage automations, and track progress from a single screen.
                            </p>
                        </motion.div>

                        {/* Full Dashboard Mockup */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mb-16"
                        >
                            <MainDashboardMockup />
                        </motion.div>

                        {/* Dashboard Features */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-violet-600/10 border border-blue-500/20"
                        >
                            <div className="text-center mb-8">
                                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">Everything You Need, One Dashboard</h3>
                                <p className="text-white/50">Monitor, manage, and grow - all from a single screen</p>
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { title: 'Real-Time Metrics', desc: 'Live updates on followers, engagement, and reach', icon: BarChart3 },
                                    { title: 'Smart Notifications', desc: 'Stay informed with intelligent alerts', icon: Bell },
                                    { title: 'Goal Tracking', desc: 'Set, monitor, and achieve your targets', icon: Target },
                                    { title: 'AI Insights', desc: 'Actionable recommendations for growth', icon: Sparkles },
                                    { title: 'Automation Hub', desc: 'Manage all your automations in one place', icon: Zap },
                                    { title: 'Content Calendar', desc: 'Visual overview of scheduled content', icon: Calendar },
                                    { title: 'Activity Feed', desc: 'Track everything happening on your account', icon: Eye },
                                    { title: 'Quick Actions', desc: 'One-click shortcuts for common tasks', icon: Play },
                                ].map((feature, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 15 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.05 }}
                                        className="p-4 rounded-xl bg-white/5 hover:bg-blue-500/10 transition-all group"
                                    >
                                        <feature.icon className="w-5 h-5 text-blue-400 mb-2 group-hover:text-white transition-colors" />
                                        <h4 className="font-semibold text-white text-sm mb-1">{feature.title}</h4>
                                        <p className="text-xs text-white/50">{feature.desc}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </section>
            </LazySection>


            {/* CTA Section */}
            <section className="py-24 md:py-32 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative p-12 md:p-16 rounded-3xl overflow-hidden"
                    >
                        {/* Background */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 via-purple-600/30 to-pink-600/30" />
                        <div className="absolute inset-0 backdrop-blur-sm" />
                        <div className="absolute inset-0 border border-white/10 rounded-3xl" />

                        <div className="relative z-10">
                            <motion.div
                                animate={{ rotate: [0, 360] }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center"
                            >
                                <Zap className="w-10 h-10 text-white" />
                            </motion.div>

                            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6">
                                Ready to Transform Your Growth?
                            </h2>
                            <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto">
                                Join thousands of creators using Veefore to automate their engagement and grow 10x faster.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Link href="/waitlist" className="inline-flex items-center justify-center px-10 py-5 rounded-full bg-white text-black font-bold text-lg hover:bg-white/90 transition-all group">
                                    Start Free Trial
                                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                                </Link>
                                <Link href="/pricing" className="inline-flex items-center justify-center px-10 py-5 rounded-full border-2 border-white/20 text-white font-semibold text-lg hover:bg-white/10 transition-all">
                                    View Pricing
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            <MainFooter />
        </div>
    )
}

export default Features
