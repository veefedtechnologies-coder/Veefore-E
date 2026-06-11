import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Zap, Target, ArrowRight, Check } from 'lucide-react';

/**
 * COMPLETELY REDESIGNED "How It Works" Section
 * 
 * NEW DESIGN CONCEPT: Horizontal Timeline with Animated Steps
 * - Modern card-based layout with numbered steps
 * - Connecting lines between steps showing flow
 * - Each step reveals on scroll with stagger effect
 * - Large icons with gradient backgrounds
 * - Clean, spacious design inspired by Linear/Stripe
 */

const GrowthEngineSectionNew = () => {
  const steps = [
    {
      number: "01",
      icon: Sparkles,
      title: "Create Your Content",
      description: "Post your content as usual. Our AI analyzes every element—from captions to timing.",
      color: "from-blue-500 to-cyan-500",
      benefits: ["AI Caption Analysis", "Hashtag Optimization", "Visual Quality Check"]
    },
    {
      number: "02",
      icon: TrendingUp,
      title: "AI Analyzes & Learns",
      description: "Machine learning identifies patterns from millions of posts to understand what works.",
      color: "from-purple-500 to-pink-500",
      benefits: ["Pattern Recognition", "Competitor Analysis", "Trend Detection"]
    },
    {
      number: "03",
      icon: Zap,
      title: "Auto-Optimize Everything",
      description: "AI automatically adjusts posting times, captions, and engagement strategies in real-time.",
      color: "from-orange-500 to-red-500",
      benefits: ["Smart Scheduling", "Auto-Engagement", "A/B Testing"]
    },
    {
      number: "04",
      icon: Target,
      title: "Watch Growth Compound",
      description: "Every post gets smarter. Your engagement grows exponentially as the AI learns.",
      color: "from-green-500 to-emerald-500",
      benefits: ["Continuous Learning", "Growth Analytics", "ROI Tracking"]
    }
  ];

  return (
    <section className="relative py-32 overflow-hidden bg-black">
      {/* Background Effects */}
      <div className="absolute inset-0">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-blue-950/10 to-black" />
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
        
        {/* Animated Gradient Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm mb-6"
          >
            <Zap className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-blue-400 uppercase tracking-wider">How It Works</span>
          </motion.div>
          
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6">
            <span className="text-white">From Post to </span>
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Viral Growth
            </span>
          </h2>
          
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Four simple steps. Infinite growth potential. Our AI handles everything automatically.
          </p>
        </motion.div>

        {/* Steps Timeline */}
        <div className="relative">
          {/* Connection Line - Desktop Only */}
          <div className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />

          {/* Steps Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative group"
              >
                {/* Card */}
                <div className="relative h-full bg-gradient-to-b from-white/[0.07] to-white/[0.02] backdrop-blur-xl rounded-3xl border border-white/10 p-8 hover:border-white/20 transition-all duration-500 hover:shadow-[0_20px_80px_-20px_rgba(59,130,246,0.3)] hover:scale-[1.02]">
                  {/* Number Badge */}
                  <div className="absolute -top-4 -left-4 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/50 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-white font-bold text-lg">{step.number}</span>
                  </div>

                  {/* Icon */}
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} p-0.5 mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <div className="w-full h-full rounded-2xl bg-black/90 flex items-center justify-center">
                      <step.icon className="w-8 h-8 text-white" />
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-blue-400 transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-gray-400 mb-6 leading-relaxed">
                    {step.description}
                  </p>

                  {/* Benefits List */}
                  <ul className="space-y-2">
                    {step.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-500">
                        <Check className="w-4 h-4 text-green-400 shrink-0" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Hover Gradient Overlay */}
                  <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${step.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500 pointer-events-none`} />
                </div>

                {/* Arrow Connector - Desktop Only */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-24 -right-4 z-10">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center backdrop-blur-sm border border-blue-500/30">
                      <ArrowRight className="w-4 h-4 text-blue-400" />
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20 text-center"
        >
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 p-6 rounded-2xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-400">Average Result</p>
                <p className="text-2xl font-bold text-white">3x Growth in 30 Days</p>
              </div>
            </div>
            <div className="sm:ml-8">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold shadow-lg shadow-blue-500/50 hover:shadow-blue-500/70 transition-all"
              >
                Start Growing Today →
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default GrowthEngineSectionNew;
