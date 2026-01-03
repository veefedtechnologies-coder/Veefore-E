import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Bell, Target, Sparkles, Zap, Calendar, Eye, Play } from 'lucide-react';

import MainDashboardMockup from '../mockups/MainDashboardMockup';

export const DashboardSection = React.memo(() => {
    return (

        <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden" style={{ contain: 'content' }}>
            {/* Background Effects - Final Blend from Blue to Transparent/Black */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 via-transparent to-black" />
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-blue-500/15 via-purple-500/10 to-violet-500/15 blur-[150px] rounded-full"
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mb-16"
                >
                    <MainDashboardMockup />
                </motion.div>

                {/* Dashboard Features */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-violet-600/10 border border-blue-500/20"
                >
                    <div className="text-center mb-6 md:mb-8">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3">Everything You Need, One Dashboard</h3>
                        <p className="text-white/50">Monitor, manage, and grow - all from a single screen</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                                className="p-4 rounded-xl bg-white/5 hover:bg-blue-500/10 transition-colors group"
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

    );
});

export default DashboardSection;
