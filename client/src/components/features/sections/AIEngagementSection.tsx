import React from 'react';
import { motion } from 'framer-motion';
import { Brain, MessageSquare, Clock, Zap, TrendingUp, Sparkles, Send, Heart } from 'lucide-react';


export const AIEngagementSection = React.memo(() => {
    return (

        <section className="py-24 md:py-36 px-4 sm:px-6 relative overflow-hidden" style={{ contain: 'content' }}>
            {/* Background Effects - Blends from Orange to Purple */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-orange-900/10 via-transparent to-fuchsia-900/10" />
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-yellow-500/15 blur-[150px] rounded-full"
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-10 md:mb-16"
                >
                    {[
                        { value: '10x', label: 'More Responses', icon: MessageSquare },
                        { value: '24/7', label: 'Always Active', icon: Clock },
                        { value: '85%', label: 'Time Saved', icon: Zap },
                        { value: '3.2x', label: 'Engagement Boost', icon: TrendingUp },
                    ].map((stat, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
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
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
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
                                            initial={{ opacity: 0 }}
                                            whileInView={{ opacity: 1 }}
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
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
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
                                        initial={{ opacity: 0 }}
                                        whileInView={{ opacity: 1 }}
                                        viewport={{ once: true }}
                                        className="flex justify-end"
                                    >
                                        <div className="max-w-[80%] p-3 rounded-2xl rounded-tr-sm bg-white/10 text-white text-sm">
                                            Hey! Loved your recent post about productivity. Do you have any course or guide?
                                        </div>
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        whileInView={{ opacity: 1 }}
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
                                        initial={{ opacity: 0 }}
                                        whileInView={{ opacity: 1 }}
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
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                >
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white text-center mb-6 md:mb-10">How Creators Use AI Engagement</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                        {[
                            { title: 'Reply to Comments', desc: 'Automatically respond to every comment with context-aware replies', icon: MessageSquare },
                            { title: 'Answer FAQs', desc: 'Detect common questions and provide helpful answers instantly', icon: Brain },
                            { title: 'Thank New Followers', desc: 'Send personalized welcome messages to new followers', icon: Heart },
                            { title: 'Handle Inquiries', desc: 'Process DM inquiries about products, collabs, and more', icon: Send },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-5 rounded-2xl bg-white/[0.03] border border-orange-500/10 hover:border-orange-500/30 transition-colors group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mb-4 group-hover:from-orange-500 group-hover:to-amber-500 transition-colors">
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

    );
});

export default AIEngagementSection;
