import { useState, memo } from 'react'
import { useWaitlist } from '../context/WaitlistContext'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowRight, Check, Zap, Sparkles, Lock,
    HelpCircle
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile';
import { SEO } from '../lib/seo-optimization'

import { MainNavigation } from '../components/MainNavigation'
import MainFooter from '../components/MainFooter'

// Mobile-optimized gradient orbs
const GradientOrb = ({ className, color = 'blue' }: { className?: string, color?: string }) => {
    const isMobile = useIsMobile()
    const colors = {
        blue: isMobile ? 'bg-blue-600/10' : 'from-blue-500/30 via-blue-600/20 to-transparent',
        purple: isMobile ? 'bg-purple-600/10' : 'from-purple-500/30 via-purple-600/20 to-transparent',
        indigo: isMobile ? 'bg-indigo-500/8' : 'from-indigo-500/30 via-indigo-600/20 to-transparent',
    }

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    )
}

// FAQ Accordion Item
const FAQItem = memo(({ question, answer, isOpen, onClick }: { question: string, answer: string, isOpen: boolean, onClick: () => void }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="border border-white/10 rounded-2xl overflow-hidden"
    >
        <button
            onClick={onClick}
            className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
        >
            <span className="text-white font-medium pr-4">{question}</span>
            <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
            >
                <HelpCircle className={`w-5 h-5 ${isOpen ? 'text-blue-400' : 'text-white/40'}`} />
            </motion.div>
        </button>
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <div className="px-6 pb-5 text-white/60 text-sm leading-relaxed">
                        {answer}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </motion.div>
))

const Pricing = () => {
    const isMobile = useIsMobile()
    const { openWaitlist } = useWaitlist()
    const [openFAQ, setOpenFAQ] = useState<number | null>(0)

    // Pricing Plans
    const pricingPlans = [
        {
            name: 'Starter',
            credits: 300,
            description: 'For new creators testing growth',
            features: ['AI Hook Generator', 'Caption & CTA Engine', 'Basic Scheduler', '1 Competitor Analysis', 'Read-only Analytics'],
            locked: ['Comment Automation', 'DM Automation', 'Adaptive AI'],
            gradient: 'from-slate-500/20 to-slate-600/10',
            border: 'border-white/10'
        },
        {
            name: 'Growth',
            credits: 1200,
            description: 'For serious creators ready to scale',
            features: ['Everything in Starter', 'AI Comment Automation', 'Smart DM Replies', 'Hook Intelligence', 'Unlimited Scheduling', '3 Competitors', 'Adaptive AI Loop', 'Full Analytics'],
            locked: [],
            gradient: 'from-blue-500/20 to-indigo-500/20',
            border: 'border-blue-500/30',
            popular: true
        },
        {
            name: 'Pro',
            credits: 3000,
            description: 'For agencies and power users',
            features: ['Everything in Growth', '3-5 Social Accounts', 'Advanced DM Funnels', 'Team Access (2-5)', 'Priority Processing', 'Dedicated Support'],
            locked: [],
            gradient: 'from-purple-500/20 to-pink-500/20',
            border: 'border-purple-500/30'
        }
    ]

    // FAQs
    const faqs = [
        { q: "How does the credit system work?", a: "1 Credit = 1 AI Action. Actions include generating hooks, creating captions, replying to comments or DMs. Credits reset monthly. Starter gets 300, Growth gets 1,200, Pro gets 3,000 credits." },
        { q: "Can I upgrade or downgrade anytime?", a: "Yes! You can change your plan at any time. Upgrades take effect immediately, and downgrades apply at the end of your billing cycle." },
        { q: "Is there a free trial?", a: "Yes! All plans come with a 7-day free trial. No credit card required to start." },
        { q: "What payment methods do you accept?", a: "We accept all major credit cards, debit cards, UPI, and net banking for Indian users." },
        { q: "Can I cancel anytime?", a: "Absolutely. No long-term contracts. Cancel anytime from your dashboard and your access continues until the end of your billing period." }
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Pricing - Veefore | AI-Powered Growth Engine"
                description="Choose the perfect plan for your growth journey. Start with a free trial and scale as you grow with Veefore's AI-powered engagement automation."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[300vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Navigation */}
            <MainNavigation />

            {/* Hero Section - Simpler than landing page */}
            <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
                            <Sparkles className="w-4 h-4 mr-2" />
                            Simple, Transparent Pricing
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                    >
                        <span className="text-white">Choose Your </span>
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Growth Plan
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-8"
                    >
                        Start with a 7-day free trial. No credit card required. Scale as you grow.
                    </motion.p>
                </div>
            </section>

            {/* Pricing Cards - Coming Soon */}
            <section className="py-8 md:py-12 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    {/* Coming Soon Banner */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 text-amber-400 text-sm mb-4">
                            <Sparkles className="w-4 h-4" />
                            Pricing Reveal Coming Soon
                        </div>
                        <p className="text-white/50 max-w-xl mx-auto">
                            We're finalizing our pricing to ensure maximum value. Join the waitlist to be notified when pricing is revealed and get exclusive early-access deals.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-6 md:gap-8">
                        {pricingPlans.map((plan, index) => (
                            <motion.div
                                key={plan.name}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                className={`relative p-6 sm:p-8 rounded-3xl border ${plan.border} bg-gradient-to-br ${plan.gradient} ${plan.popular ? 'ring-2 ring-blue-500/50' : ''}`}
                            >
                                {/* Popular Badge */}
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <span className="px-4 py-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs font-semibold">
                                            Most Popular
                                        </span>
                                    </div>
                                )}

                                {/* Plan Header */}
                                <div className="mb-6">
                                    <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                                    <p className="text-sm text-white/50">{plan.description}</p>
                                </div>

                                {/* Hidden Price - Coming Soon */}
                                <div className="mb-6">
                                    <div className="relative">
                                        {/* Blurred price hint */}
                                        <div className="flex items-baseline gap-1 filter blur-sm select-none pointer-events-none opacity-30">
                                            <span className="text-sm text-white/50">₹</span>
                                            <span className="text-4xl font-bold text-white">???</span>
                                            <span className="text-white/50">/mo</span>
                                        </div>
                                        {/* Coming Soon Overlay */}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                                                <Lock className="w-3.5 h-3.5 text-amber-400" />
                                                <span className="text-sm font-medium text-white/70">Coming Soon</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-4">
                                        <Zap className="w-4 h-4 text-amber-400" />
                                        <span className="text-sm text-white/60">{plan.credits} credits/month</span>
                                    </div>
                                </div>

                                {/* CTA Button */}
                                <button
                                    onClick={openWaitlist}
                                    className={`block w-full py-3 rounded-xl text-center font-medium transition-all mb-6 ${plan.popular
                                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-lg hover:shadow-blue-500/25'
                                        : 'bg-white/10 text-white hover:bg-white/20'
                                        }`}
                                >
                                    Get Notified
                                </button>

                                {/* Features */}
                                <div className="space-y-3">
                                    <p className="text-xs uppercase tracking-wider text-white/30 mb-3">What's included</p>
                                    {plan.features.map((feature, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                                            <span className="text-sm text-white/70">{feature}</span>
                                        </div>
                                    ))}
                                    {plan.locked.map((feature, i) => (
                                        <div key={i} className="flex items-start gap-3 opacity-50">
                                            <Lock className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
                                            <span className="text-sm text-white/40 line-through">{feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Early Access Note */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mt-12"
                    >
                        <p className="text-sm text-white/40">
                            🎁 <span className="text-amber-400">Early Waitlist Members</span> will receive exclusive discounts when pricing is revealed
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Frequently Asked Questions
                        </h2>
                        <p className="text-white/50">Everything you need to know about pricing</p>
                    </motion.div>

                    <div className="space-y-4">
                        {faqs.map((faq, i) => (
                            <FAQItem
                                key={i}
                                question={faq.q}
                                answer={faq.a}
                                isOpen={openFAQ === i}
                                onClick={() => setOpenFAQ(openFAQ === i ? null : i)}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative p-10 md:p-14 rounded-3xl bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 border border-white/10 overflow-hidden"
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-gradient-to-b from-blue-500/30 to-transparent rounded-full blur-[100px]" />

                        <div className="relative z-10">
                            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                                Ready to Start Growing?
                            </h2>
                            <p className="text-white/60 mb-8 max-w-lg mx-auto">
                                Join thousands of creators who are actively growing their audience with AI-powered engagement.
                            </p>

                            <button
                                onClick={openWaitlist}
                                className="inline-flex items-center px-8 py-4 rounded-full bg-white text-black font-semibold text-lg hover:bg-white/90 transition-all group"
                            >
                                Join Waitlist
                                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </motion.div>
                </div>
            </section>

            <MainFooter />
        </div>
    )
}

export default Pricing
