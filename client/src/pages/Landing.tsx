import React, { useState, useEffect, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowRight, Play, Star, Zap, Shield, Target, Globe, 
  CheckCircle, MessageSquare, Bot, BarChart3, TrendingUp, 
  Users, Sparkles, Brain, Lock, Rocket, ChevronDown, Plus, Minus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEO, seoConfig } from '@/lib/seo-optimization'
import DashboardMockup from '@assets/generated_images/modern_ai_dashboard_mockup_for_veefore_app.png'

// 3D Background Component (Integrated from Landing3D)
const Landing3D = React.lazy(() => import('./Landing3D'))

const Landing = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  const faqs = [
    {
      q: "How does VeeFore differ from other social media schedulers?",
      a: "Most tools just post content. VeeFore actively grows your account by automating high-quality engagement, detecting viral hook patterns, and managing DM funnels to turn followers into customers."
    },
    {
      q: "Is the automation safe for my accounts?",
      a: "Yes. VeeFore uses context-aware AI and strictly adheres to platform rate limits. Our growth-first philosophy prioritizes momentum and account health over spam."
    },
    {
      q: "What is Hook Intelligence?",
      a: "It's our proprietary AI that analyzes millions of viral posts to suggest the exact opening lines (hooks) that will stop the scroll for your specific audience."
    }
  ]

  return (
    <div className="min-h-screen bg-[#030712] text-white selection:bg-blue-500/30">
      <SEO {...seoConfig.landing} />
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#030712]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">VeeFore</span>
          </div>
          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-white/70">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#usp" className="hover:text-white transition-colors">USP</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Button variant="ghost" className="text-white/70 hover:text-white" onClick={() => onNavigate('signin')}>Login</Button>
            <Button className="bg-white text-black hover:bg-white/90 rounded-full px-6" onClick={() => onNavigate('signup')}>Get Started</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section with 3D Integration */}
      <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-40">
          <Suspense fallback={<div className="w-full h-full bg-slate-950" />}>
            <Landing3D />
          </Suspense>
        </div>
        
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-blue-400 mb-8">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Growth Engine</span>
            </div>
            <h1 className="text-5xl md:text-8xl font-extrabold tracking-tight mb-8">
              Actively Grow Your <br />
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Social Authority
              </span>
            </h1>
            <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
              VeeFore doesn't just schedule posts. It participates in your growth using AI-driven engagement automation, hook intelligence, and smart DM funnels.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-10 py-7 text-lg group" onClick={() => onNavigate('signup')}>
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-10 py-7 text-lg border-white/10 hover:bg-white/5">
                <Play className="mr-2 w-5 h-5 fill-current" />
                Watch Demo
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl font-bold mb-6">Automated Engagement <br /><span className="text-blue-500">Velocity</span></h2>
              <p className="text-lg text-white/60 mb-8">
                Algorithms reward fast, meaningful interaction. VeeFore automates your comment replies and DM keyword triggers with context-aware AI that matches your brand tone perfectly.
              </p>
              <ul className="space-y-4">
                {[
                  "Smart DM Keyword Funnels",
                  "Context-Aware Comment Replies",
                  "Viral Hook Pattern Detection",
                  "Competitor Momentum Insights"
                ].map((item, i) => (
                  <li key={i} className="flex items-center space-x-3 text-white/80">
                    <CheckCircle className="w-5 h-5 text-blue-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="absolute inset-0 bg-blue-500/20 blur-[100px] rounded-full" />
              <img 
                src={DashboardMockup} 
                alt="VeeFore Dashboard" 
                className="rounded-2xl border border-white/10 shadow-2xl relative z-10"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* USP Section */}
      <section id="usp" className="py-32 bg-white/[0.02] border-y border-white/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-4">Why VeeFore?</h2>
            <p className="text-white/60 max-w-2xl mx-auto">Built for creators who value time and scale without the spam.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: "Engagement First", desc: "Posting isn't growth. Interaction is. We automate the signals algorithms crave." },
              { icon: Brain, title: "Hook Intelligence", desc: "No more guessing. Our AI predicts which hooks will stop the scroll for your niche." },
              { icon: Target, title: "Conversion Ready", desc: "Smart DM funnels turn engagement into interaction and interaction into sales." }
            ].map((usp, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -10 }}
                className="p-8 rounded-3xl bg-white/5 border border-white/10"
              >
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-6">
                  <usp.icon className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold mb-3">{usp.title}</h3>
                <p className="text-white/60 leading-relaxed">{usp.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-4">Straightforward Pricing</h2>
            <p className="text-white/60">Choose the plan that fits your growth ambitions.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Starter Plan */}
            <div className="p-10 rounded-3xl bg-white/5 border border-white/10 flex flex-col">
              <h3 className="text-xl font-bold mb-2">Starter</h3>
              <div className="text-4xl font-bold mb-6">$29<span className="text-lg text-white/40 font-normal">/mo</span></div>
              <ul className="space-y-4 mb-10 flex-1">
                {["100 AI Conversations", "Basic Engagement Automation", "2 Social Accounts", "7-Day Free Trial"].map((f, i) => (
                  <li key={i} className="flex items-center space-x-3 text-sm text-white/70">
                    <CheckCircle className="w-4 h-4 text-blue-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full rounded-full border-white/10 hover:bg-white/5" onClick={() => onNavigate('signup')}>Start Free Trial</Button>
            </div>
            
            {/* Professional Plan */}
            <div className="p-10 rounded-3xl bg-gradient-to-br from-blue-600 to-purple-700 border border-white/10 shadow-xl relative overflow-hidden flex flex-col">
              <div className="absolute top-4 right-4 bg-white/20 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded">Most Popular</div>
              <h3 className="text-xl font-bold mb-2">Professional</h3>
              <div className="text-4xl font-bold mb-6">$79<span className="text-lg text-white/60 font-normal">/mo</span></div>
              <ul className="space-y-4 mb-10 flex-1">
                {["500 AI Conversations", "Advanced Hook Intelligence", "Unlimited DM Funnels", "Competitor Tracking", "Priority Support"].map((f, i) => (
                  <li key={i} className="flex items-center space-x-3 text-sm">
                    <CheckCircle className="w-4 h-4 text-white" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-white text-black hover:bg-white/90 rounded-full" onClick={() => onNavigate('signup')}>Start Growing Now</Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-32 bg-white/[0.01]">
        <div className="container mx-auto px-6 max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-16">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden">
                <button 
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                >
                  <span className="font-medium">{faq.q}</span>
                  {activeFaq === i ? <Minus className="w-5 h-5 text-white/40" /> : <Plus className="w-5 h-5 text-white/40" />}
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-6 pb-6 text-white/60 text-sm leading-relaxed"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/5 bg-black">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-10">
            <div className="flex items-center space-x-2">
              <Rocket className="w-6 h-6 text-blue-500" />
              <span className="text-xl font-bold">VeeFore</span>
            </div>
            <div className="flex space-x-8 text-sm text-white/40">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Contact Support</a>
            </div>
            <p className="text-sm text-white/20">© 2025 VeeFore AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing