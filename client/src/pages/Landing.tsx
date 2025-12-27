import React, { useState, useEffect, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowRight, Play, Zap, CheckCircle, MessageSquare, Bot, TrendingUp, 
  Users, Sparkles, Brain, Rocket, ChevronDown, Plus, Minus,
  Target, Clock, Shield, BarChart3, Send, Layers, Eye, Activity,
  ChevronRight, Star, Crown, Gauge, RefreshCw, Lock, Unlock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEO, seoConfig } from '@/lib/seo-optimization'

import DashboardMockup from '@assets/generated_images/modern_ai_dashboard_mockup_for_veefore_app.png'
import StoryMockup from '@assets/generated_images/ai_story_generation_preview_mockup_for_veefore.png'
import EngagementMockup from '@assets/generated_images/engagement_automation_visualizer_mockup_for_veefore.png'

const Landing3D = React.lazy(() => import('./Landing3D'))

const Landing = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % 3)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const slides = [
    { title: "Active Growth Engine", subtitle: "VeeFore participates in your growth, it doesn't just assist it.", image: DashboardMockup },
    { title: "AI Content Studio", subtitle: "Generate viral-ready stories and posts in seconds.", image: StoryMockup },
    { title: "Smart DM Funnels", subtitle: "Turn attention into interaction and interaction into sales.", image: EngagementMockup }
  ]

  // Layer 1: Hero Growth Features
  const heroFeatures = [
    {
      id: 'engagement-automation',
      icon: MessageSquare,
      title: 'AI Engagement Automation',
      tagline: 'Increase engagement velocity and consistency.',
      description: 'Fast, meaningful engagement directly boosts algorithmic reach. This is VeeFore\'s strongest differentiator.',
      details: [
        'Context-aware comment replies',
        'Priority handling of high-value comments',
        'Human-like tone control',
        'Platform-safe automation limits'
      ],
      color: 'blue'
    },
    {
      id: 'dm-automation',
      icon: Send,
      title: 'Smart DM Automation',
      tagline: 'Turn DMs into scalable growth and monetization channels.',
      description: 'Creators lose opportunities in DMs. VeeFore captures them without spam.',
      details: [
        'Keyword-triggered replies',
        'Lead qualification logic',
        'Creator-defined safety boundaries',
        'Advanced follow-up funnels (Pro)'
      ],
      color: 'purple'
    },
    {
      id: 'hook-intelligence',
      icon: Brain,
      title: 'AI Hook & Trend Intelligence',
      tagline: 'Remove guesswork from content creation.',
      description: 'Creators don\'t need trends. They need explanations. VeeFore provides intelligence, not noise.',
      details: [
        'Competitor hook extraction',
        'Emotional and structural pattern analysis',
        'Niche-specific hook suggestions',
        'Viral pattern prediction'
      ],
      color: 'indigo'
    }
  ]

  // Layer 2: Core Support Systems
  const supportFeatures = [
    {
      id: 'caption-engine',
      icon: Sparkles,
      title: 'AI Caption & CTA Engine',
      tagline: 'Convert attention into interaction.',
      details: ['Hook-aligned captions', 'CTA optimization for comments, saves, DMs', 'Format-aware writing (Reels, Carousels)']
    },
    {
      id: 'scheduler',
      icon: Clock,
      title: 'Growth-Aware Scheduler',
      tagline: 'Consistent posting aligned with growth signals.',
      details: ['Best-time recommendations', 'Auto-attachment of hooks and captions', 'Feedback loop integration']
    },
    {
      id: 'competitor-intel',
      icon: Eye,
      title: 'Competitor Intelligence',
      tagline: 'Guide decisions, not overwhelm users.',
      details: ['Top-performing posts analysis', 'Posting frequency insights', 'Caption style patterns']
    }
  ]

  // Credit System
  const creditActions = [
    { action: 'Generate 1 Hook', credits: 1, icon: Sparkles },
    { action: 'Generate 1 Caption', credits: 1, icon: MessageSquare },
    { action: 'Reply to 1 Comment', credits: 1, icon: Send },
    { action: 'Reply to 1 DM', credits: 1, icon: Bot },
    { action: 'Scan Competitor Batch', credits: 1, icon: Eye }
  ]

  // Pricing Plans (INR)
  const pricingPlans = [
    {
      name: 'Starter',
      price: billingCycle === 'monthly' ? 399 : 3990,
      period: billingCycle === 'monthly' ? '/month' : '/year',
      tagline: 'Testing growth',
      description: 'For new or small creators who want better ideas and posting consistency.',
      credits: 300,
      features: [
        { text: 'AI Hook Generator (limited)', included: true },
        { text: 'AI Caption & CTA Engine', included: true },
        { text: 'Growth-aware Scheduler (limited posts)', included: true },
        { text: 'Basic competitor insight (1 competitor)', included: true },
        { text: 'Read-only performance summary', included: true },
        { text: 'AI Comment Automation', included: false },
        { text: 'AI DM Automation', included: false },
        { text: 'Adaptive AI learning loop', included: false }
      ],
      psychology: 'Users improve content quality but cannot scale growth. This creates upgrade motivation.',
      color: 'gray',
      popular: false
    },
    {
      name: 'Growth',
      price: billingCycle === 'monthly' ? 899 : 8990,
      period: billingCycle === 'monthly' ? '/month' : '/year',
      tagline: 'Scaling engagement',
      description: 'For serious creators (5k–200k followers) who want automation and ROI.',
      credits: 1200,
      features: [
        { text: 'AI Comment Automation', included: true },
        { text: 'Smart DM keyword replies', included: true },
        { text: 'AI Hook & Trend Intelligence', included: true },
        { text: 'AI Caption & CTA Engine (full)', included: true },
        { text: 'Growth-aware Scheduler (unlimited)', included: true },
        { text: 'Competitor intelligence (up to 3)', included: true },
        { text: 'Adaptive AI learning loop', included: true },
        { text: 'Engagement analytics', included: true }
      ],
      psychology: 'This plan feels like a machine working in the background. This is where retention happens.',
      color: 'blue',
      popular: true
    },
    {
      name: 'Pro / Agency',
      price: billingCycle === 'monthly' ? 1999 : 19990,
      period: billingCycle === 'monthly' ? '/month' : '/year',
      tagline: 'Operating at scale',
      description: 'For agencies, teams, and high-volume creators.',
      credits: 3000,
      features: [
        { text: 'Everything in Growth', included: true },
        { text: 'Manage 3–5 social accounts', included: true },
        { text: 'Advanced DM funnels & follow-ups', included: true },
        { text: 'Team access (2–5 users)', included: true },
        { text: 'Priority AI processing', included: true },
        { text: 'Highest credit limits', included: true },
        { text: 'Advanced reports', included: true },
        { text: 'Dedicated support', included: true }
      ],
      psychology: 'This plan anchors value and legitimizes VeeFore as a professional platform.',
      color: 'purple',
      popular: false
    }
  ]

  // Free Trial Details
  const trialTimeline = [
    { day: 'Day 1', title: 'Onboarding', description: 'Connect account, generate first hooks & captions' },
    { day: 'Day 2', title: 'Activation', description: 'Schedule content, enable comment automation' },
    { day: 'Day 3', title: 'First Results', description: 'Engagement results appear, credits start dropping' },
    { day: 'Day 4-5', title: 'Limits Approached', description: 'Feature limits hit, subtle upgrade hints' },
    { day: 'Day 6-7', title: 'Decision Time', description: 'Automation pauses, clear upgrade CTA shown' }
  ]

  // FAQ
  const faqs = [
    {
      q: "What exactly is VeeFore?",
      a: "VeeFore is an AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically. Unlike schedulers or content tools, VeeFore participates in your growth through AI-driven engagement automation, hook intelligence, and smart DM funnels."
    },
    {
      q: "How is VeeFore different from other social media tools?",
      a: "Most tools help you create content, schedule posts, and analyze performance. VeeFore helps you RESPOND faster, ENGAGE at scale, MAINTAIN momentum, and TURN attention into interaction. We follow a Growth-First philosophy: engagement before posting volume, interaction before impressions, momentum before aesthetics."
    },
    {
      q: "Is the automation safe for my accounts?",
      a: "Absolutely. VeeFore uses context-aware AI with human-like tone control and strictly adheres to platform-safe automation limits. Our system mimics natural engagement patterns to protect your account while maximizing growth signals that algorithms reward."
    },
    {
      q: "How does the credit system work?",
      a: "1 Credit = 1 AI Action. Actions include generating a hook, creating a caption, replying to a comment, or sending a DM. Credits reset monthly. Starter gets 300 credits, Growth gets 1,200 credits, and Pro gets 3,000 credits. You can also purchase add-on credit packs."
    },
    {
      q: "What happens during the 7-day free trial?",
      a: "You get access to the Growth plan with limits: 150 total credits, 1 social account, capped automation volume. You'll experience real AI automation working for you. On days 5-7, you'll receive upgrade prompts. After trial ends, automation stops but read-only access remains."
    },
    {
      q: "Who is VeeFore built for?",
      a: "VeeFore is built for Instagram & short-form creators in the 5k–200k follower range who value time and want scale without spam. It's NOT for casual posters, hobby accounts, or people seeking free tools."
    }
  ]

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <SEO {...seoConfig.landing} />
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.05] bg-black/90 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-12">
            <div className="flex items-center space-x-2 cursor-pointer" onClick={() => onNavigate('/')}>
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold tracking-tight">VeeFore</span>
            </div>
            
            <div className="hidden lg:flex items-center space-x-8 text-[15px] font-medium text-white/60">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <a href="#trial" className="hover:text-white transition-colors">Free Trial</a>
              <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button className="text-[15px] font-medium text-white/70 hover:text-white transition-colors px-4 py-2" onClick={() => onNavigate('signin')}>Login</button>
            <Button className="bg-white text-black hover:bg-white/90 rounded-full px-7 py-6 text-[15px] font-semibold" onClick={() => onNavigate('signup')}>Start Free Trial</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Suspense fallback={<div className="w-full h-full bg-black" />}>
            <Landing3D />
          </Suspense>
        </div>
        
        <div className="container max-w-[1200px] mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
            <div className="inline-flex items-center space-x-2 px-5 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-blue-400 mb-10 backdrop-blur-md">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Growth Engine</span>
            </div>
            
            <h1 className="text-5xl md:text-[90px] font-extrabold tracking-[-0.04em] leading-[0.95] mb-8">
              Posting is not growth.<br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Engagement is.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-white/50 max-w-4xl mx-auto mb-6 leading-relaxed font-medium">
              VeeFore actively grows your social media using AI-driven engagement automation, hook intelligence, and smart DM funnels.
            </p>
            
            <p className="text-lg text-white/30 max-w-2xl mx-auto mb-12">
              Most tools help you post. VeeFore helps you <span className="text-blue-400">respond faster</span>, <span className="text-indigo-400">engage at scale</span>, and <span className="text-purple-400">maintain momentum</span>.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white rounded-full px-12 py-8 text-xl font-bold group shadow-2xl shadow-blue-600/30" onClick={() => onNavigate('signup')}>
                Start 7-Day Free Trial
                <ArrowRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="ghost" className="rounded-full px-12 py-8 text-xl font-semibold border border-white/10 hover:bg-white/5">
                <Play className="mr-3 w-6 h-6 fill-current" />
                Watch Demo
              </Button>
            </div>
            
            <div className="mt-12 flex items-center justify-center space-x-8 text-white/40 text-sm">
              <div className="flex items-center space-x-2"><CheckCircle className="w-4 h-4 text-green-500" /><span>No credit card required</span></div>
              <div className="flex items-center space-x-2"><CheckCircle className="w-4 h-4 text-green-500" /><span>150 credits included</span></div>
              <div className="flex items-center space-x-2"><CheckCircle className="w-4 h-4 text-green-500" /><span>Cancel anytime</span></div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Dashboard Showreel */}
      <section className="py-24 relative">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="relative aspect-video rounded-[32px] border border-white/10 bg-[#0A0A0A] shadow-[0_0_100px_rgba(59,130,246,0.15)] overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div key={activeSlide} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0">
                <img src={slides[activeSlide].image} alt={slides[activeSlide].title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90" />
                <div className="absolute bottom-12 left-12 right-12 flex justify-between items-end">
                  <div className="max-w-xl">
                    <h3 className="text-4xl font-bold mb-3">{slides[activeSlide].title}</h3>
                    <p className="text-xl text-white/60">{slides[activeSlide].subtitle}</p>
                  </div>
                  <div className="flex space-x-3">
                    {slides.map((_, i) => (
                      <button key={i} onClick={() => setActiveSlide(i)} className={`w-3 h-3 rounded-full transition-all ${activeSlide === i ? 'bg-blue-500 w-10' : 'bg-white/20 hover:bg-white/40'}`} />
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* The Real Problem Section */}
      <section id="how-it-works" className="py-32 bg-gradient-to-b from-black via-[#050510] to-black">
        <div className="container max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-20">
            <div className="text-blue-500 font-bold tracking-widest text-sm uppercase mb-6">The Growth-First Philosophy</div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8">Why Creators Fail</h2>
            <p className="text-xl text-white/50 max-w-3xl mx-auto">
              Most social media tools focus on posting, scheduling, and analytics. But creators don't fail because they lack tools.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white/40 mb-8">Creators fail because:</h3>
              {[
                'They cannot engage consistently',
                'They miss comments and DMs',
                'They lose algorithm momentum',
                'They burn time on repetitive actions',
                'They do not know why content works'
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-center space-x-4 p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-lg text-white/70">{item}</span>
                </motion.div>
              ))}
            </div>
            
            <div className="p-10 rounded-[32px] bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10">
              <h3 className="text-3xl font-bold mb-6">VeeFore solves this.</h3>
              <p className="text-xl text-white/60 mb-8">We follow a Growth-First philosophy:</p>
              <div className="space-y-6">
                {[
                  { title: 'Engagement before volume', desc: 'Interact first, post second' },
                  { title: 'Interaction before impressions', desc: 'Turn eyeballs into conversations' },
                  { title: 'Momentum before aesthetics', desc: 'Keep the wheel turning automatically' }
                ].map((item, i) => (
                  <div key={i} className="flex items-start space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0 mt-1">
                      <TrendingUp className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold">{item.title}</h4>
                      <p className="text-white/40">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Layer 1: Hero Growth Features */}
      <section id="features" className="py-32">
        <div className="container max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-20">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-sm font-bold text-blue-400 mb-6">
              <Layers className="w-4 h-4" />
              <span>LAYER 1: HERO GROWTH FEATURES</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">The USP Drivers</h2>
            <p className="text-xl text-white/50 max-w-3xl mx-auto">
              These features are VeeFore's public identity. They're what users remember and talk about.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {heroFeatures.map((feature, i) => (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`p-8 rounded-[28px] border transition-all cursor-pointer ${
                  expandedFeature === feature.id 
                    ? 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30' 
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
                onClick={() => setExpandedFeature(expandedFeature === feature.id ? null : feature.id)}
              >
                <div className={`w-14 h-14 rounded-2xl bg-${feature.color}-500/20 flex items-center justify-center mb-6`}>
                  <feature.icon className={`w-7 h-7 text-${feature.color}-400`} />
                </div>
                <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                <p className="text-white/60 mb-4">{feature.tagline}</p>
                
                <AnimatePresence>
                  {expandedFeature === feature.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="text-white/40 text-sm mb-4 border-t border-white/10 pt-4">{feature.description}</p>
                      <ul className="space-y-2">
                        {feature.details.map((detail, j) => (
                          <li key={j} className="flex items-center space-x-2 text-sm text-white/60">
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <button className="flex items-center space-x-1 text-blue-400 text-sm font-medium mt-4">
                  <span>{expandedFeature === feature.id ? 'Show Less' : 'Learn More'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${expandedFeature === feature.id ? 'rotate-180' : ''}`} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Layer 2: Support Systems */}
      <section className="py-24 bg-[#050505]">
        <div className="container max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-sm font-bold text-indigo-400 mb-6">
              <Layers className="w-4 h-4" />
              <span>LAYER 2: CORE SUPPORT SYSTEMS</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Enable Growth</h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">Features that complete workflows and support hero features.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {supportFeatures.map((feature, i) => (
              <div key={feature.id} className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-indigo-400" />
                </div>
                <h4 className="text-xl font-bold mb-2">{feature.title}</h4>
                <p className="text-white/50 text-sm mb-4">{feature.tagline}</p>
                <ul className="space-y-2">
                  {feature.details.map((d, j) => (
                    <li key={j} className="flex items-center space-x-2 text-xs text-white/40">
                      <div className="w-1 h-1 rounded-full bg-indigo-500" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          
          {/* Layer 3: Intelligence Engine */}
          <div className="mt-16 p-8 rounded-[28px] bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-white/10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">LAYER 3: INTELLIGENCE ENGINE</div>
                  <h4 className="text-2xl font-bold">Adaptive AI Growth Loop</h4>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm text-white/50">
                <span className="px-3 py-1 rounded-full bg-white/5">Post Content</span>
                <ChevronRight className="w-4 h-4" />
                <span className="px-3 py-1 rounded-full bg-white/5">Collect Data</span>
                <ChevronRight className="w-4 h-4" />
                <span className="px-3 py-1 rounded-full bg-white/5">AI Learns</span>
                <ChevronRight className="w-4 h-4" />
                <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400">Improve</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Credit System */}
      <section className="py-32">
        <div className="container max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-16">
            <div className="text-amber-500 font-bold tracking-widest text-sm uppercase mb-6">Credit System</div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Pay for growth, not features.</h2>
            <p className="text-xl text-white/50 max-w-3xl mx-auto">
              1 Credit = 1 AI Action. Simple, fair, and predictable. Credits control AI usage fairly and create natural upgrade pressure.
            </p>
          </div>
          
          <div className="grid md:grid-cols-5 gap-4 mb-12">
            {creditActions.map((item, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 text-center hover:border-amber-500/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-amber-400" />
                </div>
                <div className="text-sm text-white/60 mb-2">{item.action}</div>
                <div className="text-2xl font-bold text-amber-400">{item.credits} Credit</div>
              </div>
            ))}
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10">
              <h4 className="font-bold mb-2">Starter</h4>
              <div className="text-3xl font-bold text-white/80">300 <span className="text-sm text-white/40">credits/mo</span></div>
            </div>
            <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <h4 className="font-bold mb-2 text-blue-400">Growth</h4>
              <div className="text-3xl font-bold">1,200 <span className="text-sm text-white/40">credits/mo</span></div>
            </div>
            <div className="p-6 rounded-2xl bg-purple-500/10 border border-purple-500/20">
              <h4 className="font-bold mb-2 text-purple-400">Pro / Agency</h4>
              <div className="text-3xl font-bold">3,000 <span className="text-sm text-white/40">credits/mo</span></div>
            </div>
          </div>
          
          <div className="mt-8 text-center text-white/40 text-sm">
            Need more? Add-on packs available: +200 credits (₹199) • +500 credits (₹399) • +1,000 credits (₹699)
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-32 bg-[#050505]">
        <div className="container max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Choose your growth speed.</h2>
            <p className="text-xl text-white/50 max-w-2xl mx-auto mb-8">
              VeeFore doesn't sell features. We sell saved time, increased engagement, and automation leverage.
            </p>
            
            <div className="inline-flex items-center p-1 rounded-full bg-white/5 border border-white/10">
              <button onClick={() => setBillingCycle('monthly')} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}>Monthly</button>
              <button onClick={() => setBillingCycle('yearly')} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'yearly' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}>Yearly <span className="text-green-500 ml-1">Save 17%</span></button>
            </div>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, i) => (
              <div key={plan.name} className={`p-10 rounded-[32px] border relative flex flex-col ${
                plan.popular 
                  ? 'bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border-blue-500/30 scale-105 z-10 shadow-[0_0_60px_rgba(59,130,246,0.2)]' 
                  : 'bg-white/[0.02] border-white/10'
              }`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-blue-500 text-xs font-bold uppercase tracking-widest">Most Popular</div>
                )}
                
                <div className="mb-8">
                  <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-white/40 text-sm">{plan.tagline}</p>
                </div>
                
                <div className="mb-8">
                  <div className="text-5xl font-bold">₹{plan.price.toLocaleString()}<span className="text-lg text-white/40 font-normal">{plan.period}</span></div>
                  <p className="text-sm text-white/40 mt-2">{plan.credits.toLocaleString()} credits/month</p>
                </div>
                
                <p className="text-sm text-white/50 mb-6">{plan.description}</p>
                
                <div className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, j) => (
                    <div key={j} className={`flex items-center space-x-3 text-sm ${feature.included ? 'text-white/70' : 'text-white/30'}`}>
                      {feature.included ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <Lock className="w-4 h-4 shrink-0" />}
                      <span>{feature.text}</span>
                    </div>
                  ))}
                </div>
                
                <Button 
                  className={`w-full rounded-full py-7 text-lg font-bold ${
                    plan.popular ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 hover:bg-white/10 border border-white/10'
                  }`}
                  onClick={() => onNavigate('signup')}
                >
                  {plan.name === 'Starter' ? 'Start with Starter' : plan.name === 'Growth' ? 'Start Growing' : 'Go Pro'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Free Trial Section */}
      <section id="trial" className="py-32">
        <div className="container max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-sm font-bold text-green-400 mb-6">
              <Unlock className="w-4 h-4" />
              <span>7-DAY FREE TRIAL</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Experience real automation.</h2>
            <p className="text-xl text-white/50 max-w-3xl mx-auto">
              Get access to the Growth plan with limits. 150 credits, 1 social account, capped automation. No credit card required.
            </p>
          </div>
          
          <div className="grid md:grid-cols-5 gap-4 mb-12">
            {trialTimeline.map((item, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 text-center relative">
                <div className="text-xs font-bold text-green-400 mb-2">{item.day}</div>
                <h4 className="font-bold mb-2">{item.title}</h4>
                <p className="text-xs text-white/40">{item.description}</p>
                {i < 4 && <div className="hidden md:block absolute top-1/2 -right-2 w-4 h-0.5 bg-white/10" />}
              </div>
            ))}
          </div>
          
          <div className="text-center">
            <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white rounded-full px-12 py-8 text-xl font-bold shadow-2xl shadow-green-600/30" onClick={() => onNavigate('signup')}>
              Start Your Free Trial Now
              <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-32 bg-[#050505]">
        <div className="container max-w-[800px] mx-auto px-6">
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-16">Frequently Asked</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                <button onClick={() => setActiveFaq(activeFaq === i ? null : i)} className="w-full p-6 flex items-center justify-between text-left">
                  <span className="text-lg font-bold pr-4">{faq.q}</span>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    {activeFaq === i ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </div>
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 pb-6 text-white/50 leading-relaxed">
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32">
        <div className="container max-w-[1000px] mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8">Ready to grow actively?</h2>
          <p className="text-xl text-white/50 max-w-2xl mx-auto mb-12">
            Join serious creators who value time, want scale without spam, and understand that engagement velocity is the key to growth.
          </p>
          <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white rounded-full px-16 py-8 text-xl font-bold shadow-2xl shadow-blue-600/30" onClick={() => onNavigate('signup')}>
            Start Your 7-Day Free Trial
            <ArrowRight className="ml-3 w-6 h-6" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/[0.05]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid md:grid-cols-5 gap-12 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-2 mb-6">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">VeeFore</span>
              </div>
              <p className="text-white/40 text-sm leading-relaxed max-w-xs">
                AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically.
              </p>
            </div>
            <div>
              <h5 className="font-bold mb-4 text-xs uppercase tracking-widest text-white/30">Product</h5>
              <ul className="space-y-3 text-sm text-white/50">
                <li className="hover:text-white cursor-pointer">Features</li>
                <li className="hover:text-white cursor-pointer">Pricing</li>
                <li className="hover:text-white cursor-pointer">Free Trial</li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold mb-4 text-xs uppercase tracking-widest text-white/30">Company</h5>
              <ul className="space-y-3 text-sm text-white/50">
                <li className="hover:text-white cursor-pointer">About</li>
                <li className="hover:text-white cursor-pointer">Blog</li>
                <li className="hover:text-white cursor-pointer">Contact</li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold mb-4 text-xs uppercase tracking-widest text-white/30">Legal</h5>
              <ul className="space-y-3 text-sm text-white/50">
                <li className="hover:text-white cursor-pointer">Privacy</li>
                <li className="hover:text-white cursor-pointer">Terms</li>
                <li className="hover:text-white cursor-pointer">Security</li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/[0.05] text-center text-white/20 text-sm">
            © 2025 VeeFore. Built for serious creators.
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing