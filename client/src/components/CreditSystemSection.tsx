import React, { useState, useEffect, useMemo } from 'react';
import { motion, useSpring, useTransform, animate, useMotionValue } from 'framer-motion';
import {
    Gauge, Plus, Coins, Zap, MessageSquare, Bot,
    Sparkles, Eye, Calculator, ArrowRight, CheckCircle2, TrendingUp,
    Info, Check, AtSign, BarChart3, Calendar, Infinity
} from 'lucide-react';

// Counter component for smooth number transitions
const Counter = ({ value }: { value: number }) => {
    const count = useMotionValue(value);
    const rounded = useTransform(count, Math.round);

    useEffect(() => {
        const animation = animate(count, value, { duration: 0.5 });
        return animation.stop;
    }, [value]);

    return <motion.span>{rounded}</motion.span>;
};

const CreditSystemSection = () => {
    const [credits, setCredits] = useState(1200);
    const [selectedFeatures, setSelectedFeatures] = useState({
        hooks: true,
        replies: true,
        dms: true
    });

    const creditActions = [
        { action: 'Generate Hook', cost: 1, icon: Sparkles },
        { action: 'Create Caption', cost: 1, icon: MessageSquare },
        { action: 'Reply Comment', cost: 1, icon: Zap },
        { action: 'DM Response', cost: 1, icon: Bot },
        { action: 'Competitor Scan', cost: 1, icon: Eye }
    ];

    const addons = [
        { credits: 200, price: 199, label: 'Starter Pack' },
        { credits: 500, price: 399, label: 'Growth Pack', popular: true },
        { credits: 1000, price: 699, label: 'Power Pack' }
    ];

    const freeFeatures = [
        { label: 'Keyword Triggers', desc: 'Unlimited auto-replies', icon: Zap, color: 'text-green-400', bg: 'bg-green-500/10' },
        { label: 'Story Mentions', desc: 'Never miss a tag', icon: AtSign, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { label: 'Live Analytics', desc: 'Real-time insights', icon: BarChart3, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Smart Scheduling', desc: 'Plan posts ahead', icon: Calendar, color: 'text-pink-400', bg: 'bg-pink-500/10' }
    ];

    // Calculate capabilities based on current credits and selected features
    const capabilities = useMemo(() => {
        const weights = {
            hooks: 0.3,
            replies: 0.4,
            dms: 0.3
        };

        let totalActiveWeight = 0;
        if (selectedFeatures.hooks) totalActiveWeight += weights.hooks;
        if (selectedFeatures.replies) totalActiveWeight += weights.replies;
        if (selectedFeatures.dms) totalActiveWeight += weights.dms;

        // If no features selected, avoid division by zero
        const normalizationFactor = totalActiveWeight > 0 ? 1 / totalActiveWeight : 0;

        return [
            { 
                id: 'hooks',
                label: 'Viral Hooks', 
                amount: selectedFeatures.hooks ? Math.floor(credits * weights.hooks * normalizationFactor) : 0, 
                icon: TrendingUp,
                active: selectedFeatures.hooks
            },
            { 
                id: 'replies',
                label: 'Smart Replies', 
                amount: selectedFeatures.replies ? Math.floor(credits * weights.replies * normalizationFactor) : 0, 
                icon: MessageSquare,
                active: selectedFeatures.replies
            },
            { 
                id: 'dms',
                label: 'DM Conversions', 
                amount: selectedFeatures.dms ? Math.floor(credits * weights.dms * normalizationFactor) : 0, 
                icon: Bot,
                active: selectedFeatures.dms
            }
        ];
    }, [credits, selectedFeatures]);

    const toggleFeature = (key: keyof typeof selectedFeatures) => {
        setSelectedFeatures(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <section className="py-12 md:py-24 relative w-full overflow-hidden bg-black">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-amber-900/20 via-black to-black" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(circle_at_center,black_40%,transparent_100%)] pointer-events-none opacity-30" />

            {/* Floating Gold Particles */}
            {[...Array(15)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute w-1 h-1 bg-amber-400/40 rounded-full"
                    initial={{
                        x: Math.random() * 100 + '%',
                        y: Math.random() * 100 + '%',
                        opacity: 0,
                        scale: 0
                    }}
                    animate={{
                        y: [null, Math.random() * -100],
                        opacity: [0, 0.6, 0],
                        scale: [0, 1.2, 0]
                    }}
                    transition={{
                        duration: Math.random() * 10 + 10,
                        repeat: Number.MAX_SAFE_INTEGER,
                        delay: Math.random() * 5,
                        ease: "linear"
                    }}
                />
            ))}

            <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">

                {/* Header */}
                <div className="text-center mb-8 md:mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-4"
                    >
                        <Gauge className="w-3 h-3" />
                        <span>Credit System</span>
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-2xl md:text-5xl font-bold tracking-tight mb-4 md:mb-6"
                    >
                        Simple. <span className="text-amber-400">Fair.</span> Predictable.
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-sm md:text-lg text-white/40 max-w-2xl mx-auto px-4"
                    >
                        1 Credit = 1 AI Action. No hidden costs, no complexity.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

                    {/* LEFT: The Calculator */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="lg:col-span-7"
                    >
                        <div className="relative rounded-[1.5rem] bg-neutral-900/50 border border-white/10 p-5 md:p-8 backdrop-blur-xl overflow-hidden group mb-6">
                            {/* Moving Shine Effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
                            
                            {/* Ambient Glow */}
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 blur-[80px] rounded-full" />

                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 flex items-center justify-center border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                                        <Calculator className="w-6 h-6 text-amber-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">Credit Estimator</h3>
                                        <p className="text-xs text-white/40">Calculate your monthly needs</p>
                                    </div>
                                </div>
                                <div className="text-right bg-black/40 px-4 py-2 rounded-lg border border-white/5 w-full md:w-auto mt-4 md:mt-0">
                                    <div className="text-2xl md:text-3xl font-bold text-white tabular-nums tracking-tight flex justify-end">
                                        <Counter value={credits} />
                                    </div>
                                    <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-end gap-1">
                                        Credits / Month
                                    </div>
                                </div>
                            </div>

                            {/* Interactive Slider */}
                            <div className="mb-10 relative">
                                <div className="flex justify-between text-[10px] font-bold text-white/30 uppercase tracking-wider mb-3">
                                    <span>Starter</span>
                                    <span>Growth</span>
                                    <span>Scale</span>
                                </div>
                                <div className="relative h-3 w-full">
                                    {/* Track */}
                                    <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <motion.div 
                                            className="h-full bg-gradient-to-r from-amber-600 to-amber-400"
                                            style={{ width: `${(credits / 5000) * 100}%` }}
                                        />
                                    </div>
                                    <input
                                        type="range"
                                        min="100"
                                        max="5000"
                                        step="100"
                                        value={credits}
                                        onChange={(e) => setCredits(Number(e.target.value))}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                    />
                                    {/* Custom Thumb */}
                                    <motion.div 
                                        className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-amber-500 rounded-full border-2 border-neutral-900 shadow-[0_0_15px_rgba(245,158,11,0.5)] z-10 pointer-events-none"
                                        style={{ left: `calc(${(credits / 5000) * 100}% - 12px)` }}
                                        whileHover={{ scale: 1.2 }}
                                        whileTap={{ scale: 0.9 }}
                                    >
                                        <div className="absolute inset-0 rounded-full bg-white/30 animate-pulse" />
                                    </motion.div>
                                </div>
                            </div>

                            {/* Feature Selection & Output */}
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-amber-400" />
                                        <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Potential Output</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {/* Feature Toggles */}
                                        <button 
                                            onClick={() => toggleFeature('hooks')}
                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${selectedFeatures.hooks ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'}`}
                                        >
                                            Hooks
                                        </button>
                                        <button 
                                            onClick={() => toggleFeature('replies')}
                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${selectedFeatures.replies ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'}`}
                                        >
                                            Replies
                                        </button>
                                        <button 
                                            onClick={() => toggleFeature('dms')}
                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${selectedFeatures.dms ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'}`}
                                        >
                                            DMs
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {capabilities.map((cap, i) => (
                                        <div 
                                            key={i} 
                                            className={`rounded-xl p-3 border flex flex-col items-center text-center transition-all duration-300 ${cap.active ? 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-amber-500/20' : 'bg-white/[0.02] border-white/[0.02] opacity-50'}`}
                                        >
                                            <div className={`mb-2 p-1.5 rounded-lg ${cap.active ? 'bg-black/40 text-amber-400' : 'bg-black/20 text-white/20'}`}>
                                                <cap.icon className="w-4 h-4" />
                                            </div>
                                            <div className={`text-xl font-bold mb-1 tabular-nums ${cap.active ? 'text-white' : 'text-white/30'}`}>
                                                ~<Counter value={cap.amount} />
                                            </div>
                                            <div className="text-[10px] text-white/50 font-medium">{cap.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>

                        {/* Free Features Grid - The "Blank Space" Filler */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             {freeFeatures.map((feature, i) => (
                                <div key={i} className="group relative overflow-hidden rounded-xl bg-neutral-900/30 border border-white/5 p-4 hover:bg-white/[0.02] hover:border-amber-500/20 transition-all duration-300">
                                    <div className="flex items-start gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${feature.bg} flex items-center justify-center ${feature.color} group-hover:scale-110 transition-transform`}>
                                            <feature.icon className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="text-sm font-bold text-white">{feature.label}</h4>
                                                <div className="px-1.5 py-0.5 rounded-full bg-white/5 text-[8px] font-bold text-white/40 uppercase tracking-wider border border-white/5 group-hover:bg-amber-500/10 group-hover:text-amber-400 group-hover:border-amber-500/20 transition-all">Free</div>
                                            </div>
                                            <p className="text-[10px] text-white/40 leading-relaxed group-hover:text-white/60 transition-colors">{feature.desc}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                    </motion.div>

                    {/* RIGHT: The Exchange Board */}
                    <motion.div 
                        initial={{ opacity: 0, x: 50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4 }}
                        className="lg:col-span-5 space-y-4"
                    >
                        {/* Token Value Card */}
                        <div className="rounded-[1.5rem] bg-gradient-to-br from-amber-500 to-amber-600 p-5 md:p-6 text-black relative overflow-hidden group shadow-[0_10px_30px_rgba(245,158,11,0.2)]">
                            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:rotate-12 duration-500">
                                <Coins className="w-24 h-24" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2 opacity-70">
                                    <div className="px-2 py-0.5 rounded-full bg-black/10 text-[10px] font-black uppercase tracking-widest border border-black/5">Exchange Rate</div>
                                </div>
                                <h3 className="text-3xl md:text-4xl font-black mb-2 tracking-tighter">1 Credit</h3>
                                <div className="h-px w-10 bg-black/20 my-3" />
                                <div className="flex items-center gap-2 text-lg font-bold opacity-90">
                                    <span>1 AI Action</span>
                                    <CheckCircle2 className="w-4 h-4" />
                                </div>
                            </div>
                        </div>

                        {/* Action List */}
                        <div className="rounded-[1.5rem] bg-neutral-900/50 border border-white/10 p-4 md:p-5 backdrop-blur-sm">
                            <div className="space-y-1.5">
                                {creditActions.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 transition-colors group border border-transparent hover:border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-amber-400 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-black transition-all duration-300">
                                                <item.icon className="w-4 h-4" />
                                            </div>
                                            <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">{item.action}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-base font-bold text-white tabular-nums">{item.cost}</span>
                                            <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider group-hover:text-amber-400 transition-colors">Credit</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                         {/* Addon Packs Mini-Grid */}
                         <div className="grid grid-cols-3 gap-2">
                            {addons.map((addon, i) => (
                                <div key={i} className={`relative rounded-xl bg-neutral-900/50 border p-2 md:p-3 text-center transition-all cursor-pointer group overflow-hidden ${addon.popular ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'border-white/10 hover:border-amber-500/30'}`}>
                                    {addon.popular && (
                                        <div className="absolute top-0 inset-x-0 h-1 bg-amber-500" />
                                    )}
                                    <div className="text-[8px] font-bold text-white/40 uppercase tracking-wider mb-1 truncate">{addon.label}</div>
                                    <div className="text-sm md:text-base font-bold text-white mb-0.5 group-hover:text-amber-400 transition-colors">+{addon.credits}</div>
                                    <div className="text-[9px] md:text-[10px] text-white/50">₹{addon.price}</div>
                                </div>
                            ))}
                        </div>

                         {/* IMPORTANT NOTE */}
                         <div className="mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/20 flex gap-3 items-start relative overflow-hidden">
                            <div className="absolute inset-0 bg-amber-500/5 animate-pulse" />
                            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 relative z-10" />
                            <div className="relative z-10">
                                <p className="text-[10px] md:text-xs text-amber-200/90 leading-relaxed font-medium">
                                    <span className="text-amber-400 font-bold block mb-0.5 uppercase tracking-wider text-[9px]">Credit Usage Policy</span>
                                    Credits are deducted <span className="text-white font-bold">ONLY</span> when using AI features (like AI Replies & DMs). Keyword-based automations are <span className="text-amber-400 font-bold underline decoration-amber-500/50 underline-offset-2">100% FREE</span>.
                                </p>
                            </div>
                        </div>

                    </motion.div>

                </div>

            </div>
        </section>
    );
};

export default CreditSystemSection;
