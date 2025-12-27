import React, { useState, useEffect, Suspense, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { 
  ArrowRight, Play, Star, Zap, Shield, Target, Globe, 
  CheckCircle, MessageSquare, Bot, BarChart3, TrendingUp, 
  Users, Sparkles, Brain, Lock, Rocket, ChevronDown, Plus, Minus,
  MousePointer2, Palette, Video, Image, Database, Code, Cloud, Activity,
  ChevronRight, Laptop, Smartphone, Layout
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEO, seoConfig } from '@/lib/seo-optimization'

// Assets
import DashboardMockup from '@assets/generated_images/modern_ai_dashboard_mockup_for_veefore_app.png'
import StoryMockup from '@assets/generated_images/ai_story_generation_preview_mockup_for_veefore.png'
import EngagementMockup from '@assets/generated_images/engagement_automation_visualizer_mockup_for_veefore.png'

// 3D Background Component
const Landing3D = React.lazy(() => import('./Landing3D'))

const Landing = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null)
  const [activeSlide, setActiveFSlide] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-cycle slide show
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFSlide(prev => (prev + 1) % 3)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const slides = [
    {
      title: "Active Growth Engine",
      subtitle: "VeeFore participates in your growth, it doesn't just assist it.",
      image: DashboardMockup,
      features: ["Real-time Engagement", "Algorithm Alignment", "Momentum Building"]
    },
    {
      title: "AI Content Studio",
      subtitle: "Generate viral-ready stories and posts in seconds.",
      image: StoryMockup,
      features: ["Story Generation", "Hook Intelligence", "Brand Voice Sync"]
    },
    {
      title: "Smart DM Funnels",
      subtitle: "Turn attention into interaction and interaction into sales.",
      image: EngagementMockup,
      features: ["Keyword Triggers", "Contextual Replies", "Lead Qualification"]
    }
  ]

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <SEO {...seoConfig.landing} />
      
      {/* Navigation - Beautiful.ai Style */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.05] bg-black/80 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-12">
            <div className="flex items-center space-x-2 cursor-pointer" onClick={() => onNavigate('/')}>
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold tracking-tight bg-white bg-clip-text text-transparent">VeeFore</span>
            </div>
            
            <div className="hidden lg:flex items-center space-x-8 text-[15px] font-medium text-white/60">
              <div className="group relative">
                <button className="flex items-center space-x-1 hover:text-white transition-colors">
                  <span>Product</span>
                  <ChevronDown className="w-4 h-4 group-hover:rotate-180 transition-transform" />
                </button>
              </div>
              <a href="#features" className="hover:text-white transition-colors">Solutions</a>
              <a href="#usp" className="hover:text-white transition-colors">How it Works</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button 
              className="text-[15px] font-medium text-white/70 hover:text-white transition-colors px-4 py-2"
              onClick={() => onNavigate('signin')}
            >
              Login
            </button>
            <Button 
              className="bg-white text-black hover:bg-white/90 rounded-full px-7 py-6 text-[15px] font-semibold transition-all shadow-xl shadow-white/5"
              onClick={() => onNavigate('signup')}
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Suspense fallback={<div className="w-full h-full bg-black" />}>
            <Landing3D />
          </Suspense>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black pointer-events-none" />
        </div>
        
        <div className="container max-w-[1200px] mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center space-x-2 px-5 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-blue-400 mb-10 backdrop-blur-md shadow-2xl">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Growth Engine</span>
            </div>
            
            <h1 className="text-6xl md:text-[100px] font-extrabold tracking-[-0.04em] leading-[0.95] mb-10">
              The faster way to <br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Active Growth.
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-white/50 max-w-3xl mx-auto mb-12 leading-relaxed font-medium">
              Most tools help you post. VeeFore helps you <span className="text-white">engage</span>. 
              Our AI actively grows your authority using hook intelligence and smart automation.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-full px-12 py-8 text-xl font-bold group shadow-2xl shadow-blue-600/30 transition-all active:scale-95"
                onClick={() => onNavigate('signup')}
              >
                Try it Free
                <ArrowRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                size="lg" 
                variant="ghost" 
                className="rounded-full px-12 py-8 text-xl font-semibold border border-white/10 hover:bg-white/5 transition-all"
              >
                <Play className="mr-3 w-6 h-6 fill-current" />
                Watch Showreel
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Showreel Section - Animated Dashboard Slides */}
      <section className="py-24 relative overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="relative aspect-video rounded-[32px] border border-white/10 bg-[#0A0A0A] shadow-[0_0_100px_rgba(59,130,246,0.15)] overflow-hidden group">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                className="absolute inset-0"
              >
                <img 
                  src={slides[activeSlide].image} 
                  alt={slides[activeSlide].title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                
                <div className="absolute bottom-12 left-12 right-12 flex justify-between items-end">
                  <div className="max-w-xl">
                    <motion.h3 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-4xl font-bold mb-4"
                    >
                      {slides[activeSlide].title}
                    </motion.h3>
                    <motion.p 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="text-xl text-white/60 mb-6"
                    >
                      {slides[activeSlide].subtitle}
                    </motion.p>
                    <div className="flex flex-wrap gap-3">
                      {slides[activeSlide].features.map((f, i) => (
                        <span key={i} className="px-4 py-1.5 rounded-full bg-white/10 border border-white/10 text-sm font-medium">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex space-x-3">
                    {slides.map((_, i) => (
                      <button 
                        key={i}
                        onClick={() => setActiveFSlide(i)}
                        className={`w-3 h-3 rounded-full transition-all ${activeSlide === i ? 'bg-blue-500 w-10' : 'bg-white/20 hover:bg-white/40'}`}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Core USP - The Philosophy */}
      <section id="usp" className="py-32 relative bg-[#050505]">
        <div className="container max-w-[1200px] mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-24 items-center">
            <div>
              <div className="text-blue-500 font-bold tracking-widest text-sm uppercase mb-6">The Growth-First Philosophy</div>
              <h2 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-10">
                Engagement is <br />the new <span className="text-blue-500">Posting.</span>
              </h2>
              <p className="text-xl text-white/50 mb-12 leading-relaxed">
                Creators don't fail because they lack tools. They fail because they lose algorithm momentum. 
                VeeFore automates the exact signals platforms reward: fast replies, meaningful depth, and consistent interaction.
              </p>
              
              <div className="space-y-8">
                {[
                  { title: "Engagement before volume", desc: "Interact first, post second. Algorithm favor follows quality depth." },
                  { title: "Interaction before impressions", desc: "Vanilla reach is dead. We help you turn eyeballs into conversations." },
                  { title: "Momentum before aesthetics", desc: "Keep the wheel turning automatically while you focus on the big picture." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="w-12 h-12 shrink-0 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-2">{item.title}</h4>
                      <p className="text-white/40 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-blue-600/10 blur-[120px] rounded-full" />
              <div className="relative p-10 rounded-[40px] border border-white/10 bg-white/[0.02] backdrop-blur-3xl">
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-blue-400" /></div>
                      <span className="font-bold">Comment Replies</span>
                    </div>
                    <span className="text-green-400 font-mono text-sm">Automated</span>
                  </div>
                  <div className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center"><Bot className="w-5 h-5 text-purple-400" /></div>
                      <span className="font-bold">Hook Intelligence</span>
                    </div>
                    <span className="text-blue-400 font-mono text-sm">Predicting...</span>
                  </div>
                  <div className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center"><Zap className="w-5 h-5 text-indigo-400" /></div>
                      <span className="font-bold">DM Funnels</span>
                    </div>
                    <span className="text-white/20 font-mono text-sm">Scanning Leads</span>
                  </div>
                </div>
                
                <div className="mt-10 pt-10 border-t border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white/40 text-sm font-medium uppercase tracking-widest">Growth Velocity</span>
                    <span className="text-blue-400 font-bold">+124%</span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      whileInView={{ width: "85%" }}
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Credit System Section */}
      <section className="py-32 relative">
        <div className="container max-w-[1200px] mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-bold mb-8">Pay only for what <span className="text-blue-500">grows</span> you.</h2>
          <p className="text-xl text-white/50 max-w-2xl mx-auto mb-20">
            Our precision credit system ensures you only use AI when it provides the most value. 
            No wasted subscription fees, just pure growth tokens.
          </p>
          
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { label: "1 Conversation", cost: "1 Credit", icon: MessageSquare },
              { label: "Viral Hook", cost: "5 Credits", icon: Sparkles },
              { label: "Story Generate", cost: "10 Credits", icon: Play },
              { label: "Full Campaign", cost: "50 Credits", icon: Rocket }
            ].map((item, i) => (
              <div key={i} className="p-8 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-blue-500/50 transition-all group">
                <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mb-6 mx-auto group-hover:bg-blue-500/20 transition-all">
                  <item.icon className="w-7 h-7 text-white/40 group-hover:text-blue-400" />
                </div>
                <div className="text-lg font-bold mb-1">{item.label}</div>
                <div className="text-blue-500 font-mono text-sm font-bold uppercase">{item.cost}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing - Strategic Gating */}
      <section id="pricing" className="py-32 bg-[#050505]">
        <div className="container max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-24">
            <h2 className="text-5xl md:text-7xl font-bold mb-6">Choose your velocity.</h2>
            <p className="text-xl text-white/40">7-day precision trial included. No credit card required to start.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="p-12 rounded-[40px] bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] transition-all flex flex-col">
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <p className="text-white/40 mb-8">For emerging creators & specialists.</p>
              <div className="text-6xl font-bold mb-10 tracking-tight">$29<span className="text-xl text-white/20 font-normal">/mo</span></div>
              
              <div className="space-y-5 mb-12 flex-1">
                {[
                  "100 AI Conversations / mo",
                  "Standard Engagement Automation",
                  "2 Social Accounts",
                  "Hook Intelligence (Basic)",
                  "7-Day Free Trial",
                  "Discord Community Access"
                ].map((f, i) => (
                  <div key={i} className="flex items-center space-x-3 text-[15px] font-medium text-white/70">
                    <CheckCircle className="w-5 h-5 text-blue-500" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full rounded-full py-8 text-lg font-bold border-white/10 hover:bg-white/5 active:scale-[0.98]"
                onClick={() => onNavigate('signup')}
              >
                Start Starter Trial
              </Button>
            </div>
            
            {/* Professional */}
            <div className="p-12 rounded-[40px] bg-gradient-to-br from-blue-600 to-indigo-700 border border-white/10 shadow-[0_0_80px_rgba(59,130,246,0.3)] relative overflow-hidden flex flex-col scale-105 z-10">
              <div className="absolute top-6 right-6 bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border border-white/10">Most Popular</div>
              <h3 className="text-2xl font-bold mb-2">Professional</h3>
              <p className="text-white/70 mb-8">For serious creators & scale agencies.</p>
              <div className="text-6xl font-bold mb-10 tracking-tight">$79<span className="text-xl text-white/60 font-normal">/mo</span></div>
              
              <div className="space-y-5 mb-12 flex-1">
                {[
                  "500 AI Conversations / mo",
                  "Advanced Interaction Engine",
                  "Unlimited DM Keyword Funnels",
                  "Full Hook Intelligence Suite",
                  "Competitor Momentum Tracking",
                  "Priority Human Support",
                  "Advanced Multi-Tenant Workspaces"
                ].map((f, i) => (
                  <div key={i} className="flex items-center space-x-3 text-[15px] font-medium">
                    <CheckCircle className="w-5 h-5 text-white" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              
              <Button 
                size="lg" 
                className="w-full bg-white text-black hover:bg-white/90 rounded-full py-8 text-lg font-bold active:scale-[0.98] shadow-2xl"
                onClick={() => onNavigate('signup')}
              >
                Start Growing Now
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-32 relative">
        <div className="container max-w-[800px] mx-auto px-6">
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-20 tracking-tight">Got questions?</h2>
          <div className="space-y-4">
            {[
              {
                q: "How does VeeFore differ from other social media schedulers?",
                a: "Most tools just post content. VeeFore actively grows your account by automating high-quality engagement, detecting viral hook patterns, and managing DM funnels to turn followers into customers. We follow a Growth-First philosophy."
              },
              {
                q: "Is the automation safe for my accounts?",
                a: "Absolutely. VeeFore uses context-aware AI and strictly adheres to platform rate limits. Our growth-first philosophy prioritizes momentum and account health over spam. We mimic human behavior patterns."
              },
              {
                q: "What is Hook Intelligence?",
                a: "It's our proprietary AI system that analyzes millions of viral data points to suggest the exact opening lines (hooks) that will stop the scroll for your specific audience. It removes the guesswork from creation."
              },
              {
                q: "How does the 7-day trial work?",
                a: "You get full access to the platform for 7 days. We track your engagement results and credit usage. If you find value (and our data shows you will), you can easily upgrade to keep the momentum going."
              }
            ].map((faq, i) => (
              <div key={i} className="rounded-[24px] border border-white/5 bg-white/[0.02] overflow-hidden transition-all hover:bg-white/[0.04]">
                <button 
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  className="w-full p-8 flex items-center justify-between text-left transition-colors"
                >
                  <span className="text-lg font-bold">{faq.q}</span>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    {activeFaq === i ? <Minus className="w-4 h-4 text-white/40" /> : <Plus className="w-4 h-4 text-white/40" />}
                  </div>
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-8 pb-8 text-white/50 text-[16px] leading-relaxed"
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

      {/* Footer - Beautiful.ai Style */}
      <footer className="py-24 border-t border-white/[0.05] bg-black">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid md:grid-cols-4 lg:grid-cols-6 gap-16 mb-20">
            <div className="lg:col-span-2">
              <div className="flex items-center space-x-2 mb-8 cursor-pointer" onClick={() => onNavigate('/')}>
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight">VeeFore</span>
              </div>
              <p className="text-white/40 leading-relaxed max-w-xs mb-8">
                The AI-powered Growth Engine for modern creators. Actively scaling your authority across the digital landscape.
              </p>
              <div className="flex space-x-4">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all"><Globe className="w-5 h-5 text-white/40" /></div>
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all"><Users className="w-5 h-5 text-white/40" /></div>
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all"><Activity className="w-5 h-5 text-white/40" /></div>
              </div>
            </div>
            
            <div>
              <h5 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/30">Product</h5>
              <ul className="space-y-4 text-white/50 text-[15px]">
                <li className="hover:text-white transition-colors cursor-pointer">How it Works</li>
                <li className="hover:text-white transition-colors cursor-pointer">Engagement Engine</li>
                <li className="hover:text-white transition-colors cursor-pointer">Hook Intelligence</li>
                <li className="hover:text-white transition-colors cursor-pointer">DM Funnels</li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/30">Company</h5>
              <ul className="space-y-4 text-white/50 text-[15px]">
                <li className="hover:text-white transition-colors cursor-pointer">About Us</li>
                <li className="hover:text-white transition-colors cursor-pointer">Privacy Policy</li>
                <li className="hover:text-white transition-colors cursor-pointer">Terms of Service</li>
                <li className="hover:text-white transition-colors cursor-pointer">Status</li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/30">Resources</h5>
              <ul className="space-y-4 text-white/50 text-[15px]">
                <li className="hover:text-white transition-colors cursor-pointer">Blog</li>
                <li className="hover:text-white transition-colors cursor-pointer">Creator Guide</li>
                <li className="hover:text-white transition-colors cursor-pointer">Support</li>
                <li className="hover:text-white transition-colors cursor-pointer">API Docs</li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/30">Legal</h5>
              <ul className="space-y-4 text-white/50 text-[15px]">
                <li className="hover:text-white transition-colors cursor-pointer">GDPR</li>
                <li className="hover:text-white transition-colors cursor-pointer">Security</li>
                <li className="hover:text-white transition-colors cursor-pointer">Terms</li>
              </ul>
            </div>
          </div>
          
          <div className="pt-12 border-t border-white/[0.05] flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-white/20 text-sm">© 2025 VeeFore AI. Built for the next generation of creators.</p>
            <div className="flex space-x-8 text-xs font-bold uppercase tracking-widest text-white/20">
              <span className="hover:text-white transition-colors cursor-pointer">Status: All Systems Operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing