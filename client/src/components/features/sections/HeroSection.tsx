
import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Play } from 'lucide-react';
import { useWaitlist } from "../../../context/WaitlistContext";

export const HeroSection = React.memo(() => {
    const { openWaitlist } = useWaitlist();

    return (
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
                    <button onClick={openWaitlist} className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-colors group cursor-pointer">
                        Join Waitlist
                        <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button className="inline-flex items-center justify-center px-8 py-4 rounded-full border border-white/20 text-white font-medium hover:bg-white/5 transition-colors gap-2">
                        <Play className="w-5 h-5" />
                        Watch Demo
                    </button>
                </motion.div>
            </div>
        </section>
    );
});

export default HeroSection;
