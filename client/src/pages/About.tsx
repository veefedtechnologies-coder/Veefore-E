import React from 'react'
import { motion } from 'framer-motion'
import { 
  Sparkles, Clock, Brain, BarChart3, Users, TrendingUp, 
  Shield, CheckCircle, ArrowRight, Instagram, Zap
} from 'lucide-react'
import { SEO } from '../lib/seo-optimization'

/**
 * About Page - Specifically designed for Google OAuth Verification
 * 
 * This page clearly explains:
 * - What Veefore is
 * - Who it's for
 * - What features it provides
 * - Why we need Google Sign-In access
 * 
 * Purpose: Meet Google's OAuth verification requirement for a clear app description page
 */
const About = () => {
  return (
    <div className="min-h-screen bg-[#030303] text-white font-sans">
      <SEO
        title="About Veefore - AI-Powered Instagram Growth Platform"
        description="Veefore is an AI-powered Instagram growth platform that helps content creators, influencers, and businesses automate their social media presence with smart scheduling, AI-generated captions, and data-driven engagement strategies."
      />

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 bg-gradient-to-b from-[#0a0520] via-[#030303] to-[#030303]">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
              <Sparkles className="w-4 h-4 mr-2" />
              About Veefore
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight"
          >
            AI-Powered Instagram Growth Platform
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-white/80 leading-relaxed max-w-3xl mx-auto"
          >
            Veefore helps <strong className="text-white">content creators, influencers, and businesses</strong> grow their Instagram presence through intelligent automation, AI-powered content optimization, and data-driven engagement strategies.
          </motion.p>
        </div>
      </section>

      {/* What is Veefore */}
      <section className="relative py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-6 text-center">What is Veefore?</h2>
          <div className="prose prose-lg prose-invert max-w-none">
            <p className="text-lg text-white/70 leading-relaxed mb-6">
              Veefore is a comprehensive social media management platform specifically designed for Instagram growth. 
              Our platform combines artificial intelligence, automation, and data analytics to help you:
            </p>
            <ul className="space-y-3 text-white/70">
              <li className="flex items-start">
                <CheckCircle className="w-6 h-6 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">Save time</strong> with automated content scheduling and posting</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-6 h-6 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">Increase engagement</strong> with AI-generated captions and hooks</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-6 h-6 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">Grow your audience</strong> with data-driven posting strategies</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-6 h-6 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">Understand your performance</strong> with detailed analytics and insights</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="relative py-16 px-4 sm:px-6 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">Core Features</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="p-6 rounded-2xl bg-white/[0.03] border border-white/10"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Smart Content Scheduling</h3>
              <p className="text-white/60 leading-relaxed">
                AI-powered scheduler that analyzes your audience behavior and Instagram analytics to identify optimal posting times for maximum engagement and reach.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="p-6 rounded-2xl bg-white/[0.03] border border-white/10"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">AI Caption Generation</h3>
              <p className="text-white/60 leading-relaxed">
                Generate viral-worthy captions instantly using advanced AI language models. Get hook suggestions, trending patterns, and engagement-optimized copy tailored to your content.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="p-6 rounded-2xl bg-white/[0.03] border border-white/10"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-600/10 flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-pink-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Growth Analytics</h3>
              <p className="text-white/60 leading-relaxed">
                Track performance metrics, audience growth, engagement rates, and content effectiveness with comprehensive analytics dashboards and detailed reports.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="relative py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">Who is Veefore For?</h2>
          
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            <div>
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Content Creators</h3>
              <p className="text-white/60">
                Influencers and creators looking to grow their audience, increase engagement, and save time on content management.
              </p>
            </div>

            <div>
              <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Small Businesses</h3>
              <p className="text-white/60">
                Brands and businesses wanting to build an authentic social media presence and connect with their target audience.
              </p>
            </div>

            <div>
              <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-pink-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Marketing Agencies</h3>
              <p className="text-white/60">
                Agencies managing multiple client accounts who need efficient tools to scale their Instagram marketing efforts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Google Sign-In Section */}
      <section className="relative py-16 px-4 sm:px-6 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent">
        <div className="max-w-4xl mx-auto">
          <div className="p-8 rounded-2xl bg-white/[0.03] border border-blue-500/20">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">Why We Use Google Sign-In</h2>
                <p className="text-white/70">Secure authentication for your Veefore account</p>
              </div>
            </div>

            <div className="space-y-4 text-white/70">
              <p>
                Veefore uses <strong className="text-white">Google Sign-In</strong> to provide a secure, passwordless authentication experience for our users. This allows you to quickly create an account and sign in without having to remember another password.
              </p>

              <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <h3 className="font-semibold text-white mb-2">What We Access from Your Google Account:</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center">
                    <CheckCircle className="w-4 h-4 text-green-400 mr-2" />
                    Your name (to personalize your dashboard)
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="w-4 h-4 text-green-400 mr-2" />
                    Your email address (for account communication)
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="w-4 h-4 text-green-400 mr-2" />
                    Your profile photo (for your Veefore profile)
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="w-4 h-4 text-green-400 mr-2" />
                    Your Google Account ID (unique identifier for authentication)
                  </li>
                </ul>
              </div>

              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <h3 className="font-semibold text-white mb-2">What We DO NOT Access:</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center">
                    <X className="w-4 h-4 text-red-400 mr-2" />
                    Gmail messages or email content
                  </li>
                  <li className="flex items-center">
                    <X className="w-4 h-4 text-red-400 mr-2" />
                    Google Drive files or documents
                  </li>
                  <li className="flex items-center">
                    <X className="w-4 h-4 text-red-400 mr-2" />
                    Google Calendar events
                  </li>
                  <li className="flex items-center">
                    <X className="w-4 h-4 text-red-400 mr-2" />
                    Google Photos or any other Google services
                  </li>
                </ul>
              </div>

              <p className="text-sm">
                You can revoke Veefore's access to your Google account at any time by visiting your{' '}
                <a 
                  href="https://myaccount.google.com/permissions" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-400 hover:underline"
                >
                  Google Account Permissions page
                </a>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">How Veefore Works</h2>
          
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-400 font-bold">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Connect Your Instagram Account</h3>
                <p className="text-white/60">
                  Securely link your Instagram account to Veefore. We use Instagram's official API to ensure your account remains safe and compliant with Instagram's terms of service.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 text-purple-400 font-bold">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Create and Schedule Content</h3>
                <p className="text-white/60">
                  Use our AI-powered tools to generate engaging captions, create content calendars, and schedule posts for optimal times based on your audience's activity patterns.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0 text-pink-400 font-bold">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Analyze and Optimize</h3>
                <p className="text-white/60">
                  Track your growth metrics, engagement rates, and content performance. Use our insights to refine your strategy and continuously improve your Instagram presence.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-16 px-4 sm:px-6 bg-gradient-to-b from-transparent via-[#0a0520] to-[#030303]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to Grow Your Instagram Presence?
          </h2>
          <p className="text-lg text-white/70 mb-8">
            Join thousands of content creators and businesses using Veefore to automate their social media growth.
          </p>
          <a 
            href="/"
            className="inline-flex items-center px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:from-blue-600 hover:to-purple-600 transition-all"
          >
            Get Started
            <ArrowRight className="w-5 h-5 ml-2" />
          </a>
        </div>
      </section>
    </div>
  )
}

// Add X icon component if not imported
const X = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
)

export default About
