import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Zap, RefreshCw, Instagram, Send, Eye } from 'lucide-react';

import SchedulingCalendarMockup from '../mockups/SchedulingCalendarMockup';

export const SchedulingSection = React.memo(() => {
    return (

        <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden" style={{ contain: 'content' }}>
            {/* Background Effects - Blends from Rose to Indigo */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-rose-900/10 via-transparent to-indigo-900/10" />
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-rose-500/15 via-pink-500/10 to-red-500/15 blur-[150px] rounded-full"
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
                    <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30 text-rose-400 text-sm mb-6">
                        <Calendar className="w-4 h-4 mr-2" />
                        📅 Smart Scheduling
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6">
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mb-16"
                >
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white text-center mb-6 md:mb-10">Your Audience is Most Active</h3>
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-pink-500/10 to-transparent blur-3xl" />
                        <div className="relative p-6 rounded-2xl bg-white/[0.02] border border-rose-500/10">
                            {/* Time Labels */}
                            <div className="flex mb-2 md:mb-4">
                                <div className="w-8 sm:w-12 md:w-16" />
                                <div className="flex-1 grid grid-cols-6 gap-1 sm:gap-2 text-center">
                                    {['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'].map((t, i) => (
                                        <span key={i} className="text-[10px] sm:text-xs text-white/40 truncate">{t}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Heatmap Grid */}
                            <div className="space-y-1 sm:space-y-2">
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
                                        <div className="w-8 sm:w-12 md:w-16 text-[10px] sm:text-sm text-white/50 flex items-center">{row.day}</div>
                                        <div className="flex-1 grid grid-cols-6 gap-1 sm:gap-2">
                                            {row.values.map((v, j) => (
                                                <motion.div
                                                    key={j}
                                                    initial={{ opacity: 0 }}
                                                    whileInView={{ opacity: 1 }}
                                                    viewport={{ once: true }}
                                                    transition={{ delay: (i * 6 + j) * 0.02 }}
                                                    className={`h-6 sm:h-8 rounded flex items-center justify-center text-[10px] sm:text-xs font-medium transition-transform cursor-pointer hover:scale-105 ${v > 80 ? 'bg-rose-500 text-white' :
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
                            <div className="flex items-center justify-center gap-2 sm:gap-4 mt-4 sm:mt-6 flex-wrap">
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-rose-600/10 via-pink-600/5 to-red-600/10 border border-rose-500/20"
                >
                    <div className="text-center mb-6 md:mb-8">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3">Powerful Scheduling Features</h3>
                        <p className="text-white/50">Everything you need to plan your content strategy</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                                className="p-4 rounded-xl bg-white/5 hover:bg-rose-500/10 transition-colors group"
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

    );
});

export default SchedulingSection;
