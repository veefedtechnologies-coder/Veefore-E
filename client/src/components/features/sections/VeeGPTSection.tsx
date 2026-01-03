import React from 'react';
import { motion } from 'framer-motion';
import { Bot, Brain, Zap, Target, CheckCircle } from 'lucide-react';

import VeeGPTChatMockup from '../mockups/VeeGPTChatMockup';
import HybridAIMockup from '../mockups/HybridAIMockup';
import AgentTasksMockup from '../mockups/AgentTasksMockup';

export const VeeGPTSection = React.memo(() => {
    return (

        <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden" id="veegpt" style={{ contain: 'content' }}>
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-black via-cyan-900/5 to-blue-900/10" />
                <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-cyan-500/10 via-transparent to-transparent blur-[120px]"
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className="max-w-2xl mx-auto mb-20"
                >
                    <VeeGPTChatMockup />
                </motion.div>

                {/* Key Differentiators */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-16 md:mb-20">
                    {[
                        { icon: Brain, title: "Hybrid AI Engine", desc: "Automatically analyzes your query complexity and routes to the best AI model (GPT-4o, Claude, Gemini) for optimal results" },
                        { icon: Zap, title: "Agent Capabilities", desc: "Goes beyond answering questions — VeeGPT executes multi-step tasks like creating content plans, analyzing data, and scheduling posts" },
                        { icon: Target, title: "Growth-Focused", desc: "Purpose-built for social media and business growth with specialized knowledge in engagement, content strategy, and audience building" },
                    ].map((item, i) => (
                        <div
                            key={i}
                            className="p-6 rounded-2xl bg-white/[0.03] border border-cyan-500/20 hover:border-cyan-500/40 transition-colors group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mb-4">
                                <item.icon className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                            <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
                        </div>
                    ))}
                </div>

                {/* Two Column Layout - Hybrid AI + Agent Tasks */}
                <div className="grid md:grid-cols-2 gap-6 lg:gap-8 mb-16 md:mb-20">
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
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
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="p-8 md:p-12 rounded-3xl bg-gradient-to-br from-cyan-600/20 via-blue-600/10 to-teal-600/20 border border-cyan-500/20"
                >
                    <div className="text-center mb-6 md:mb-10">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3">What VeeGPT Can Do For You</h3>
                        <p className="text-white/50">Ask VeeGPT anything about growth — it understands and acts</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
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

    );
});

export default VeeGPTSection;
