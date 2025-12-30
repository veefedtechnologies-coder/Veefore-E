import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Sparkles, Clock, Eye, RefreshCw, Cpu, Activity, ArrowRight, Zap, ShieldCheck, Database, Layers, Hexagon } from 'lucide-react';

const FeatureCard = ({ feature, index, isLeft }: { feature: any, index: number, isLeft: boolean }) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotateX = useTransform(y, [-100, 100], [5, -5]);
    const rotateY = useTransform(x, [-100, 100], [-5, 5]);

    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        x.set(event.clientX - centerX);
        y.set(event.clientY - centerY);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.2 }}
            className="group relative perspective-1000"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: 1000 }}
        >
            {/* Connecting Line (Desktop) */}
            <div className={`hidden lg:block absolute top-1/2 ${isLeft ? '-right-24' : '-left-24'} w-24 h-[2px] bg-white/5 overflow-hidden`}>
                <motion.div
                    className={`w-full h-full bg-gradient-to-${isLeft ? 'r' : 'l'} from-transparent via-indigo-500 to-transparent`}
                    animate={{ x: isLeft ? ['-100%', '100%'] : ['100%', '-100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: index * 0.5 }}
                />
            </div>

            <motion.div
                style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                className={`relative p-6 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md transition-all duration-300 ${feature.border} hover:shadow-[0_0_30px_rgba(79,70,229,0.15)] overflow-hidden group-hover:bg-black/80`}
            >
                {/* Tech Corners */}
                <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-white/20 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-white/20 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-white/20 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-white/20 rounded-br-lg" />

                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                <div className={`relative flex items-start gap-4 ${!isLeft ? 'lg:flex-row-reverse lg:text-right' : ''}`}>
                    <div className={`w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:border-white/20 transition-all duration-300 shadow-inner relative overflow-hidden ${feature.iconColor}`}>
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <feature.icon className={`w-6 h-6 ${feature.color} relative z-10`} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1 group-hover:text-white transition-colors">{feature.title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed group-hover:text-gray-300 transition-colors">{feature.desc}</p>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

const GrowthEngineSection = () => {
    const features = [
        {
            icon: Sparkles,
            title: 'AI Caption Engine',
            desc: 'Hook-aligned captions with CTA optimization',
            color: 'text-cyan-400 group-hover:text-cyan-300',
            gradient: 'from-cyan-500/20 to-blue-500/5',
            border: 'group-hover:border-cyan-500/50',
            iconColor: 'group-hover:bg-cyan-500/10'
        },
        {
            icon: Clock,
            title: 'Smart Scheduler',
            desc: 'Best-time recommendations with feedback loops',
            color: 'text-purple-400 group-hover:text-purple-300',
            gradient: 'from-purple-500/20 to-pink-500/5',
            border: 'group-hover:border-purple-500/50',
            iconColor: 'group-hover:bg-purple-500/10'
        },
        {
            icon: Eye,
            title: 'Competitor Intel',
            desc: 'Top-performing posts and pattern analysis',
            color: 'text-blue-400 group-hover:text-blue-300',
            gradient: 'from-blue-500/20 to-indigo-500/5',
            border: 'group-hover:border-blue-500/50',
            iconColor: 'group-hover:bg-blue-500/10'
        },
        {
            icon: RefreshCw,
            title: 'Adaptive Learning',
            desc: 'AI learns and improves from your results',
            color: 'text-pink-400 group-hover:text-pink-300',
            gradient: 'from-pink-500/20 to-rose-500/5',
            border: 'group-hover:border-pink-500/50',
            iconColor: 'group-hover:bg-pink-500/10'
        }
    ];

    return (
        <section className="py-24 md:py-32 relative w-full overflow-hidden bg-black">
            {/* Background Atmosphere */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-black to-black" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(circle_at_center,black_40%,transparent_100%)] pointer-events-none opacity-50" />

            {/* Floating Particles */}
            {[...Array(30)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute w-1 h-1 bg-indigo-500/30 rounded-full"
                    initial={{
                        x: Math.random() * 1500 - 750,
                        y: Math.random() * 1000 - 500,
                        opacity: 0,
                        scale: 0
                    }}
                    animate={{
                        y: [null, Math.random() * -200],
                        opacity: [0, 0.8, 0],
                        scale: [0, 1.5, 0]
                    }}
                    transition={{
                        duration: Math.random() * 5 + 8,
                        repeat: Infinity,
                        delay: Math.random() * 5,
                        ease: "linear"
                    }}
                    style={{ left: '50%', top: '50%' }}
                />
            ))}

            <div className="max-w-7xl mx-auto px-6 relative z-10">

                {/* Section Header */}
                <div className="text-center mb-16 md:mb-24">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-4"
                    >
                        <Cpu className="w-3 h-3" />
                        <span>Core Support Systems</span>
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-3xl md:text-5xl font-bold tracking-tight mb-4"
                    >
                        Features that <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Enable Growth</span>
                    </motion.h2>
                </div>

                {/* THE ENGINE LAYOUT */}
                <div className="relative flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24">

                    {/* Left Wing (Features 1 & 3) */}
                    <div className="flex flex-col gap-8 w-full lg:w-1/3 order-2 lg:order-1">
                        {[features[0], features[2]].map((feature, i) => (
                            <FeatureCard key={i} feature={feature} index={i} isLeft={true} />
                        ))}
                    </div>

                    {/* Center Core (The Reactor) */}
                    <div className="relative w-full lg:w-1/3 flex justify-center order-1 lg:order-2 py-12 lg:py-0">
                        <div className="relative w-72 h-72 md:w-96 md:h-96">

                            {/* Complex Rotating Rings */}
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 rounded-full border border-dashed border-indigo-500/20"
                            />
                            <motion.div
                                animate={{ rotate: -360 }}
                                transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-8 rounded-full border border-dotted border-cyan-500/20"
                            />
                            <motion.div
                                animate={{ rotate: 180 }}
                                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-16 rounded-full border border-white/5"
                            />

                            {/* Hexagonal Grid Overlay */}
                             <div className="absolute inset-0 flex items-center justify-center opacity-10 animate-[spin_60s_linear_infinite]">
                                <Hexagon className="w-full h-full text-indigo-500" strokeWidth={0.5} />
                             </div>

                            {/* Energy Field */}
                            <div className="absolute inset-0 rounded-full bg-indigo-500/5 blur-3xl animate-pulse" />

                            {/* Glowing Core */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <motion.div 
                                    whileHover={{ scale: 1.05 }}
                                    className="relative w-48 h-48 md:w-56 md:h-56 rounded-full bg-black/80 backdrop-blur-xl border border-indigo-500/30 shadow-[0_0_60px_rgba(79,70,229,0.15)] flex items-center justify-center group cursor-pointer z-20 overflow-hidden"
                                >

                                    {/* Holographic Inner Gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-purple-500/10 group-hover:opacity-100 transition-opacity" />

                                    {/* Scanning Line */}
                                    <motion.div
                                        className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-400/10 to-transparent h-[20%]"
                                        animate={{ top: ['-20%', '120%'] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                    />
                                    
                                    {/* Rotating Data Ring */}
                                     <div className="absolute inset-2 border border-dashed border-indigo-500/10 rounded-full animate-[spin_10s_linear_infinite]" />

                                    <div className="text-center relative z-10 p-6">
                                        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-110 transition-transform duration-300">
                                            <Cpu className="w-7 h-7 text-white" />
                                        </div>
                                        <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-[0.2em] mb-1">Central Intelligence</div>
                                        <div className="text-xl md:text-2xl font-bold text-white leading-tight">Adaptive<br />Growth Loop</div>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Orbiting Data Nodes */}
                            {[0, 1, 2, 3].map((i) => (
                                <motion.div
                                    key={i}
                                    className="absolute w-2 h-2 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] z-10"
                                    animate={{
                                        x: [Math.cos(i * 1.5) * 160, Math.cos(i * 1.5 + Math.PI) * 160],
                                        y: [Math.sin(i * 1.5) * 160, Math.sin(i * 1.5 + Math.PI) * 160],
                                        scale: [1, 0.5, 1],
                                        opacity: [1, 0.3, 1]
                                    }}
                                    transition={{
                                        duration: 5,
                                        repeat: Infinity,
                                        delay: i * 1.2,
                                        ease: "easeInOut"
                                    }}
                                    style={{ top: '50%', left: '50%' }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Right Wing (Features 2 & 4) */}
                    <div className="flex flex-col gap-8 w-full lg:w-1/3 order-3">
                        {[features[1], features[3]].map((feature, i) => (
                             <FeatureCard key={i} feature={feature} index={i} isLeft={false} />
                        ))}
                    </div>

                </div>

                {/* Bottom Loop Visualization (Replaces the old banner) */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4 }}
                    className="mt-20 md:mt-32 max-w-5xl mx-auto"
                >
                    <div className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm p-1 overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent animate-pulse group-hover:via-indigo-500/10 transition-colors" />

                        <div className="relative rounded-xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="flex items-center gap-5 w-full md:w-auto">
                                <div className="relative w-12 h-12 rounded-full bg-green-900/20 border border-green-500/30 flex items-center justify-center shrink-0">
                                    <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                                    <Activity className="w-6 h-6 text-green-400 relative z-10" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                        <div className="text-xs font-bold text-green-400 uppercase tracking-widest">System Online</div>
                                    </div>
                                    <div className="text-white font-bold text-lg">Continuous Optimization Active</div>
                                </div>
                            </div>

                            <div className="flex-1 w-full relative h-12 flex items-center bg-white/5 rounded-lg border border-white/5 px-4 overflow-hidden">
                                {/* Progress Bar Background */}
                                <div className="absolute left-0 top-0 bottom-0 w-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.05)_50%,transparent_100%)] animate-[shimmer_2s_infinite]" />

                                <div className="flex items-center justify-between w-full text-[10px] md:text-xs font-mono font-bold text-gray-400 relative z-10">
                                    {['POST', 'DATA', 'ANALYZE', 'REFINE', 'IMPROVE'].map((step, i) => (
                                        <div key={step} className={`flex items-center gap-2 ${i === 4 ? 'text-indigo-400' : ''}`}>
                                            <span>{step}</span>
                                            {i < 4 && <div className="w-1 h-1 rounded-full bg-white/20" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

            </div>
        </section>
    );
};

export default GrowthEngineSection;
