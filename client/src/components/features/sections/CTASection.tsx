import React from 'react';
import { motion } from 'framer-motion';
import { Zap, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';

export const CTASection = React.memo(() => {
    return (
        <section className="py-24 md:py-32 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto text-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="relative p-8 sm:p-10 md:p-12 lg:p-16 rounded-3xl overflow-hidden"
                >
                    {/* Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 via-purple-600/30 to-pink-600/30" />
                    <div className="absolute inset-0 backdrop-blur-sm" />
                    <div className="absolute inset-0 border border-white/10 rounded-3xl" />

                    <div className="relative z-10">
                        <motion.div
                            animate={{ rotate: [0, 360] }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center"
                        >
                            <Zap className="w-10 h-10 text-white" />
                        </motion.div>

                        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6">
                            Ready to Transform Your Growth?
                        </h2>
                        <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto">
                            Join thousands of creators using Veefore to automate their engagement and grow 10x faster.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/waitlist" className="inline-flex items-center justify-center px-10 py-5 rounded-full bg-white text-black font-bold text-lg hover:bg-white/90 transition-all group">
                                Start Free Trial
                                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Link>
                            <Link href="/pricing" className="inline-flex items-center justify-center px-10 py-5 rounded-full border-2 border-white/20 text-white font-semibold text-lg hover:bg-white/10 transition-all">
                                View Pricing
                            </Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
});

export default CTASection;
