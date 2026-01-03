import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Users, Heart, Eye, Instagram, Target, Clock, TrendingUp, Sparkles, Brain } from 'lucide-react';

import AnalyticsDashboardMockup from '../mockups/AnalyticsDashboardMockup';

export const AnalyticsSection = React.memo(() => {
    return (

        <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden" style={{ contain: 'content' }}>
            {/* Background Effects - Blends from Emerald to Rose */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/10 via-transparent to-rose-900/10" />
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-green-500/15 via-emerald-500/10 to-teal-500/15 blur-[150px] rounded-full"
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mb-16"
                >
                    <AnalyticsDashboardMockup />
                </motion.div>

                {/* Key Metrics Grid */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mb-16"
                >
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white text-center mb-6 md:mb-10">Track Every Metric That Matters</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
                            <div
                                key={i}
                                className="p-5 rounded-2xl bg-white/[0.03] border border-green-500/10 hover:border-green-500/30 transition-colors group"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center group-hover:from-green-500 group-hover:to-emerald-500 transition-colors">
                                        <metric.icon className="w-5 h-5 text-green-400 group-hover:text-white transition-colors" />
                                    </div>
                                    <span className="text-sm font-semibold text-green-400">{metric.value}</span>
                                </div>
                                <h4 className="font-semibold text-white mb-1">{metric.title}</h4>
                                <p className="text-sm text-white/50">{metric.desc}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* AI Insights Panel */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
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
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                                className={`p-4 rounded-xl border ${item.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20' :
                                    item.type === 'opportunity' ? 'bg-green-500/10 border-green-500/20' :
                                        'bg-blue-500/10 border-blue-500/20'} transition-colors duration-300`}
                            >
                                <div className="flex items-start gap-2">
                                    <Brain className={`w-4 h-4 mt-0.5 flex-shrink-0 ${item.type === 'warning' ? 'text-amber-400' :
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

    );
});

export default AnalyticsSection;
