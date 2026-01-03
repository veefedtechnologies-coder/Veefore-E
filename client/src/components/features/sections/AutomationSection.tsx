import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Users, MessageSquare, Repeat, ArrowRight, Instagram, Bell, Eye, Target, Brain, Clock, TrendingUp, Heart, Zap, Send } from 'lucide-react';

import WorkflowBuilderMockup from '../mockups/WorkflowBuilderMockup';

export const AutomationSection = React.memo(() => {
    return (

        <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden" style={{ contain: 'content' }}>
            {/* Background Effects - Blends from Purple to Emerald */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-transparent to-emerald-900/10" />
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-purple-500/15 via-pink-500/10 to-rose-500/15 blur-[150px] rounded-full"
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="max-w-7xl mx-auto mb-20"
                >
                    <WorkflowBuilderMockup />
                </motion.div>

                {/* Automation Templates */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mb-16"
                >
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white text-center mb-6 md:mb-10">Pre-Built Automation Templates</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
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
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-6 rounded-2xl bg-white/[0.03] border border-purple-500/10 hover:border-purple-500/30 transition-colors group"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center group-hover:from-purple-500 group-hover:to-pink-500 transition-colors">
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="p-8 md:p-10 rounded-3xl bg-gradient-to-br from-purple-600/10 via-pink-600/5 to-rose-600/10 border border-purple-500/20"
                >
                    <div className="text-center mb-6 md:mb-8">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3">Powerful Trigger Options</h3>
                        <p className="text-white/50">Start automations based on any event</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 md:gap-3">
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
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.03 }}
                                className="flex items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-purple-500/20 transition-colors cursor-pointer group"
                            >
                                <trigger.icon className="w-4 h-4 text-purple-400 group-hover:text-white transition-colors flex-shrink-0" />
                                <span className="text-xs text-white/70 group-hover:text-white transition-colors">{trigger.label}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </section>

    );
});

export default AutomationSection;
