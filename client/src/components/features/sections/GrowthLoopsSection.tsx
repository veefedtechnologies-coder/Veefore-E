import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Sparkles, Share2, Heart, TrendingUp, Users, MessageSquare } from 'lucide-react';


export const GrowthLoopsSection = React.memo(() => {
    return (

        <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden" style={{ contain: 'content' }}>
            {/* Background Effects - Blends from Indigo to Blue */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/10 via-transparent to-blue-900/10" />
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-purple-500/15 blur-[150px] rounded-full"
                    style={{ willChange: 'transform' }}
                />
            </div>

            <div className="max-w-7xl mx-auto relative">
                {/* Section Header */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 text-indigo-400 text-sm mb-6">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        🚀 Viral Growth Engine
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6">
                        <span className="text-white">Create </span>
                        <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">Viral Growth Loops</span>
                    </h2>
                    <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                        Build self-sustaining growth systems that turn every follower into a
                        <span className="text-indigo-400 font-semibold"> potential promoter</span>. Watch your reach multiply exponentially.
                    </p>
                </motion.div>

                {/* Flywheel Visualization + Stats */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-12 md:mb-20 items-center">
                    {/* Animated Flywheel */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="relative"
                    >
                        <div className="relative aspect-square max-w-xs sm:max-w-sm md:max-w-md mx-auto">
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
                                    initial={{ opacity: 0 }}
                                    whileInView={{ opacity: 1 }}
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
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
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
                                        initial={{ opacity: 0 }}
                                        whileInView={{ opacity: 1 }}
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mb-16"
                >
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white text-center mb-6 md:mb-10">How the Growth Loop Works</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
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
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="relative z-10 p-6 rounded-2xl bg-[#0a0a0a] border border-indigo-500/20 hover:border-indigo-500/40 transition-colors group"
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-indigo-600/10 via-violet-600/5 to-purple-600/10 border border-indigo-500/20"
                >
                    <div className="text-center mb-6 md:mb-8">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3">Pre-Built Growth Loop Templates</h3>
                        <p className="text-white/50">Launch viral campaigns in minutes</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
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
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                                className="p-5 rounded-xl bg-white/5 hover:bg-indigo-500/10 transition-colors group cursor-pointer"
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

    );
});

export default GrowthLoopsSection;
