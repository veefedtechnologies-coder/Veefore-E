import React, { useState, useEffect, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowRight, Play, Zap, CheckCircle, MessageSquare, Bot, TrendingUp, 
  Users, Sparkles, Brain, Rocket, ChevronDown, Plus, Minus,
  Target, Clock, Shield, BarChart3, Send, Layers, Eye, Activity,
  ChevronRight, Star, Crown, Gauge, RefreshCw, Lock, Unlock, Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEO, seoConfig } from '@/lib/seo-optimization'

import DashboardMockup from '@assets/generated_images/modern_ai_dashboard_mockup_for_veefore_app.png'

const Landing = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null)

  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
    })
  }

  const features = [
    {
      icon: MessageSquare,
      title: 'AI Engagement Automation',
      description: 'Context-aware comment replies and priority handling of high-value interactions. Human-like tone with platform-safe limits.',
      gradient: 'from-violet-500 to-purple-600'
    },
    {
      icon: Send,
      title: 'Smart DM Funnels',
      description: 'Keyword-triggered replies with lead qualification logic. Turn DMs into scalable growth channels without spam.',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: Brain,
      title: 'Hook Intelligence',
      description: 'Competitor hook extraction and emotional pattern analysis. Get niche-specific suggestions that stop the scroll.',
      gradient: 'from-pink-500 to-rose-500'
    },
    {
      icon: Sparkles,
      title: 'Caption & CTA Engine',
      description: 'Hook-aligned captions with CTA optimization for comments, saves, and DMs. Format-aware writing for Reels and Carousels.',
      gradient: 'from-amber-500 to-orange-500'
    },
    {
      icon: Clock,
      title: 'Growth-Aware Scheduler',
      description: 'Best-time recommendations with auto-attachment of hooks. Feedback loop integration for continuous improvement.',
      gradient: 'from-emerald-500 to-teal-500'
    },
    {
      icon: Eye,
      title: 'Competitor Intelligence',
      description: 'Top-performing posts analysis, posting frequency insights, and caption style patterns. Guide decisions, not overwhelm.',
      gradient: 'from-indigo-500 to-blue-600'
    }
  ]

  const pricingPlans = [
    {
      name: 'Starter',
      price: billingCycle === 'monthly' ? 399 : 3990,
      description: 'For creators testing growth',
      credits: '300 credits/mo',
      features: ['AI Hook Generator (limited)', 'Caption & CTA Engine', 'Scheduler (limited posts)', 'Basic competitor insight', 'Read-only analytics'],
      locked: ['Comment Automation', 'DM Automation', 'Adaptive AI Loop'],
      cta: 'Start Starter',
      popular: false
    },
    {
      name: 'Growth',
      price: billingCycle === 'monthly' ? 899 : 8990,
      description: 'For serious creators scaling engagement',
      credits: '1,200 credits/mo',
      features: ['AI Comment Automation', 'Smart DM keyword replies', 'Full Hook Intelligence', 'Caption Engine (full)', 'Unlimited Scheduler', 'Competitor intel (3)', 'Adaptive AI Loop', 'Engagement analytics'],
      locked: [],
      cta: 'Start Growing',
      popular: true
    },
    {
      name: 'Pro / Agency',
      price: billingCycle === 'monthly' ? 1999 : 19990,
      description: 'For teams operating at scale',
      credits: '3,000 credits/mo',
      features: ['Everything in Growth', '3-5 social accounts', 'Advanced DM funnels', 'Team access (2-5 users)', 'Priority AI processing', 'Advanced reports'],
      locked: [],
      cta: 'Go Pro',
      popular: false
    }
  ]

  const faqs = [
    { q: "What exactly is VeeFore?", a: "VeeFore is an AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically. Unlike schedulers, VeeFore participates in your growth through AI-driven engagement automation, hook intelligence, and smart DM funnels." },
    { q: "How is this different from other tools?", a: "Most tools help you post. VeeFore helps you respond faster, engage at scale, and maintain momentum. We follow a Growth-First philosophy: engagement before volume, interaction before impressions." },
    { q: "Is the automation safe?", a: "Absolutely. VeeFore uses context-aware AI with human-like tone and adheres to platform-safe limits. Our system mimics natural engagement patterns to protect your account." },
    { q: "How does the credit system work?", a: "1 Credit = 1 AI Action (hook, caption, comment reply, DM). Credits reset monthly. Starter: 300, Growth: 1,200, Pro: 3,000. Add-on packs available." },
    { q: "What's in the 7-day trial?", a: "Access to Growth plan with limits: 150 credits, 1 account, capped automation. Experience real AI automation. No credit card required." }
  ]

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-violet-200 overflow-x-hidden">
      <SEO {...seoConfig.landing} />
      
      {/* Gradient Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-violet-200/40 via-purple-200/30 to-transparent rounded-full blur-3xl translate-x-1/3 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-blue-200/40 via-cyan-200/30 to-transparent rounded-full blur-3xl -translate-x-1/4 translate-y-1/4" />
        <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-gradient-to-r from-pink-200/20 to-orange-200/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-12">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onNavigate('/')}>
              <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">VeeFore</span>
            </div>
            
            <div className="hidden lg:flex items-center space-x-8 text-[15px] font-medium text-slate-600">
              <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it Works</a>
              <a href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-slate-900 transition-colors">FAQ</a>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button className="text-[15px] font-medium text-slate-600 hover:text-slate-900 transition-colors px-4 py-2" onClick={() => onNavigate('signin')}>Login</button>
            <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-full px-6 py-5 text-[15px] font-semibold shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30" onClick={() => onNavigate('signup')}>
              Start Free Trial
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Content */}
            <motion.div initial="hidden" animate="visible" className="relative z-10">
              <motion.div variants={fadeUp} custom={0} className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-violet-100 text-violet-700 text-sm font-semibold mb-8">
                <Sparkles className="w-4 h-4" />
                <span>AI-Powered Growth Engine</span>
              </motion.div>
              
              <motion.h1 variants={fadeUp} custom={1} className="text-5xl lg:text-[64px] font-bold tracking-tight leading-[1.1] mb-6 text-slate-900">
                Posting is not growth.{' '}
                <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Engagement is.
                </span>
              </motion.h1>
              
              <motion.p variants={fadeUp} custom={2} className="text-xl text-slate-600 mb-8 leading-relaxed max-w-xl">
                VeeFore actively grows your social media using AI-driven engagement automation, hook intelligence, and smart DM funnels.
              </motion.p>
              
              <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row items-start gap-4 mb-10">
                <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-full px-8 py-7 text-lg font-semibold shadow-xl shadow-violet-500/25 group transition-all hover:shadow-2xl hover:shadow-violet-500/30" onClick={() => onNavigate('signup')}>
                  Start 7-Day Free Trial
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-8 py-7 text-lg font-semibold border-slate-300 hover:bg-slate-100 text-slate-700">
                  <Play className="mr-2 w-5 h-5" />
                  Watch Demo
                </Button>
              </motion.div>
              
              <motion.div variants={fadeUp} custom={4} className="flex items-center space-x-6 text-sm text-slate-500">
                <div className="flex items-center space-x-2"><Check className="w-4 h-4 text-emerald-500" /><span>No credit card</span></div>
                <div className="flex items-center space-x-2"><Check className="w-4 h-4 text-emerald-500" /><span>150 credits free</span></div>
                <div className="flex items-center space-x-2"><Check className="w-4 h-4 text-emerald-500" /><span>Cancel anytime</span></div>
              </motion.div>
            </motion.div>
            
            {/* Right: Product Image */}
            <motion.div 
              initial={{ opacity: 0, x: 40 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-400/20 to-indigo-400/20 rounded-[32px] blur-2xl scale-95" />
              <div className="relative bg-white/60 backdrop-blur-xl rounded-[32px] border border-white/80 shadow-2xl shadow-slate-900/10 overflow-hidden p-2">
                <img src={DashboardMockup} alt="VeeFore Dashboard" className="w-full rounded-[24px]" />
              </div>
              
              {/* Floating Cards */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="absolute -left-8 top-1/4 bg-white/80 backdrop-blur-xl rounded-2xl p-4 shadow-xl shadow-slate-900/10 border border-white"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Engagement</div>
                    <div className="text-lg font-bold text-emerald-600">+127%</div>
                  </div>
                </div>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="absolute -right-4 bottom-1/4 bg-white/80 backdrop-blur-xl rounded-2xl p-4 shadow-xl shadow-slate-900/10 border border-white"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Auto-replies</div>
                    <div className="text-lg font-bold text-violet-600">1.2k/day</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trusted By / Social Proof */}
      <section className="py-16 border-y border-slate-200/50 bg-white/50 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-slate-400 uppercase tracking-widest mb-8">Trusted by 10,000+ creators worldwide</p>
          <div className="flex items-center justify-center space-x-12 opacity-40">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="text-2xl font-bold text-slate-400">Brand {i}</div>
            ))}
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section id="how-it-works" className="py-24 lg:py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-20">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-rose-100 text-rose-700 text-sm font-semibold mb-6">
              <Target className="w-4 h-4" />
              <span>The Real Problem</span>
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Creators don't fail because they lack tools.
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="text-xl text-slate-600">
              They fail because they can't engage consistently, miss comments and DMs, and lose algorithm momentum.
            </motion.p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="space-y-4">
              {['Cannot engage consistently', 'Miss comments and DMs', 'Lose algorithm momentum', 'Burn time on repetitive actions', "Don't know why content works"].map((item, i) => (
                <div key={i} className="flex items-center space-x-4 p-5 rounded-2xl bg-white/60 backdrop-blur-sm border border-slate-200/50 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-lg text-slate-700">{item}</span>
                </div>
              ))}
            </motion.div>
            
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-[32px] p-10 border border-violet-200/50">
              <h3 className="text-2xl font-bold mb-6 text-slate-900">VeeFore follows a Growth-First philosophy:</h3>
              <div className="space-y-6">
                {[
                  { title: 'Engagement before volume', desc: 'Interact first, post second' },
                  { title: 'Interaction before impressions', desc: 'Turn eyeballs into conversations' },
                  { title: 'Momentum before aesthetics', desc: 'Keep the wheel turning automatically' }
                ].map((item, i) => (
                  <div key={i} className="flex items-start space-x-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                      <Check className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{item.title}</h4>
                      <p className="text-slate-600 text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 lg:py-32 bg-white/50 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-20">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-violet-100 text-violet-700 text-sm font-semibold mb-6">
              <Layers className="w-4 h-4" />
              <span>Features</span>
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Everything you need to grow
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="text-xl text-slate-600">
              A complete growth system with AI-powered automation, intelligence, and insights.
            </motion.p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                onMouseEnter={() => setHoveredFeature(i)}
                onMouseLeave={() => setHoveredFeature(null)}
                className={`group p-8 rounded-[28px] bg-white/70 backdrop-blur-xl border border-slate-200/50 shadow-lg shadow-slate-900/5 transition-all duration-300 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 ${hoveredFeature === i ? 'border-violet-300' : ''}`}
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 shadow-lg`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-slate-900">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Credit System */}
      <section className="py-24 lg:py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[40px] p-12 lg:p-20 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/20 rounded-full blur-3xl" />
            
            <div className="relative z-10 max-w-3xl mx-auto text-center mb-16">
              <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-white/10 text-white/80 text-sm font-semibold mb-6">
                <Gauge className="w-4 h-4" />
                <span>Credit System</span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-bold tracking-tight mb-6">
                Pay for growth, not features.
              </h2>
              <p className="text-xl text-white/60">
                1 Credit = 1 AI Action. Simple, fair, and predictable.
              </p>
            </div>
            
            <div className="relative z-10 grid md:grid-cols-5 gap-4">
              {[
                { action: 'Generate Hook', credits: 1, icon: Sparkles },
                { action: 'Create Caption', credits: 1, icon: MessageSquare },
                { action: 'Reply Comment', credits: 1, icon: Send },
                { action: 'Send DM', credits: 1, icon: Bot },
                { action: 'Scan Competitor', credits: 1, icon: Eye }
              ].map((item, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/10">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-6 h-6 text-white/80" />
                  </div>
                  <div className="text-sm text-white/60 mb-1">{item.action}</div>
                  <div className="text-2xl font-bold">{item.credits} Credit</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 lg:py-32 bg-white/50 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Choose your growth speed
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-xl text-slate-600 mb-8">
              VeeFore sells saved time, increased engagement, and automation leverage.
            </motion.p>
            
            <div className="inline-flex items-center p-1.5 rounded-full bg-slate-100 border border-slate-200">
              <button onClick={() => setBillingCycle('monthly')} className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${billingCycle === 'monthly' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>Monthly</button>
              <button onClick={() => setBillingCycle('yearly')} className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${billingCycle === 'yearly' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>
                Yearly <span className="text-emerald-600 ml-1">Save 17%</span>
              </button>
            </div>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {pricingPlans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative p-8 lg:p-10 rounded-[32px] border transition-all ${
                  plan.popular 
                    ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white border-transparent shadow-2xl shadow-violet-500/25 scale-105 z-10' 
                    : 'bg-white/70 backdrop-blur-xl border-slate-200/50 shadow-lg shadow-slate-900/5'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-white text-violet-600 text-xs font-bold uppercase tracking-widest shadow-lg">
                    Most Popular
                  </div>
                )}
                
                <h3 className={`text-2xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-slate-900'}`}>{plan.name}</h3>
                <p className={`text-sm mb-6 ${plan.popular ? 'text-white/70' : 'text-slate-500'}`}>{plan.description}</p>
                
                <div className="mb-2">
                  <span className={`text-5xl font-bold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>₹{plan.price.toLocaleString()}</span>
                  <span className={`text-lg ${plan.popular ? 'text-white/70' : 'text-slate-500'}`}>/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
                <p className={`text-sm mb-8 ${plan.popular ? 'text-white/60' : 'text-slate-400'}`}>{plan.credits}</p>
                
                <Button 
                  className={`w-full rounded-full py-6 text-base font-semibold mb-8 ${
                    plan.popular 
                      ? 'bg-white text-violet-600 hover:bg-white/90 shadow-lg' 
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                  onClick={() => onNavigate('signup')}
                >
                  {plan.cta}
                </Button>
                
                <div className="space-y-3">
                  {plan.features.map((feature, j) => (
                    <div key={j} className={`flex items-center space-x-3 text-sm ${plan.popular ? 'text-white/90' : 'text-slate-700'}`}>
                      <Check className={`w-4 h-4 shrink-0 ${plan.popular ? 'text-white' : 'text-emerald-500'}`} />
                      <span>{feature}</span>
                    </div>
                  ))}
                  {plan.locked.map((feature, j) => (
                    <div key={j} className={`flex items-center space-x-3 text-sm ${plan.popular ? 'text-white/40' : 'text-slate-400'}`}>
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 lg:py-32 relative z-10">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight mb-6">Frequently asked</h2>
          </div>
          
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 shadow-sm overflow-hidden"
              >
                <button onClick={() => setActiveFaq(activeFaq === i ? null : i)} className="w-full p-6 flex items-center justify-between text-left">
                  <span className="text-lg font-semibold text-slate-900 pr-4">{faq.q}</span>
                  <div className={`w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 transition-transform ${activeFaq === i ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-4 h-4 text-slate-600" />
                  </div>
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 pb-6 text-slate-600 leading-relaxed">
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 lg:py-32 relative z-10">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-[40px] p-12 lg:p-20 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-white/10 rounded-full blur-3xl" />
            
            <div className="relative z-10">
              <h2 className="text-4xl lg:text-5xl font-bold mb-6">Ready to grow actively?</h2>
              <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
                Join creators who understand that engagement velocity is the key to growth.
              </p>
              <Button size="lg" className="bg-white text-violet-600 hover:bg-white/90 rounded-full px-10 py-7 text-lg font-semibold shadow-xl" onClick={() => onNavigate('signup')}>
                Start Your 7-Day Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-slate-200/50 bg-white/30 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900">VeeFore</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
                AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators.
              </p>
            </div>
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Free Trial'] },
              { title: 'Company', links: ['About', 'Blog', 'Contact'] },
              { title: 'Legal', links: ['Privacy', 'Terms', 'Security'] }
            ].map((col, i) => (
              <div key={i}>
                <h5 className="font-semibold text-slate-900 mb-4">{col.title}</h5>
                <ul className="space-y-3 text-sm text-slate-500">
                  {col.links.map((link, j) => (
                    <li key={j} className="hover:text-slate-900 cursor-pointer transition-colors">{link}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-slate-200/50 text-center text-slate-400 text-sm">
            © 2025 VeeFore. Built for serious creators.
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing