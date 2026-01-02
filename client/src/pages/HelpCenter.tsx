import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
    Search, MessageCircle, Mail, ArrowRight, ChevronRight,
    HelpCircle, BookOpen, Play, Zap, Settings, Shield, CreditCard,
    Users, Clock, Sparkles
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile'
import { SEO } from '../lib/seo-optimization'
import { Link } from 'wouter'
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

// Help Category Card
const CategoryCard = ({ icon: Icon, title, description, articlesCount, href, color }: {
    icon: React.ComponentType<{ className?: string }>,
    title: string,
    description: string,
    articlesCount: number,
    href: string,
    color: string
}) => {
    const colorClasses = {
        blue: 'from-blue-500/20 to-blue-600/10 hover:border-blue-500/30 group-hover:text-blue-400',
        purple: 'from-purple-500/20 to-purple-600/10 hover:border-purple-500/30 group-hover:text-purple-400',
        green: 'from-green-500/20 to-green-600/10 hover:border-green-500/30 group-hover:text-green-400',
        orange: 'from-orange-500/20 to-orange-600/10 hover:border-orange-500/30 group-hover:text-orange-400',
        pink: 'from-pink-500/20 to-pink-600/10 hover:border-pink-500/30 group-hover:text-pink-400',
        cyan: 'from-cyan-500/20 to-cyan-600/10 hover:border-cyan-500/30 group-hover:text-cyan-400',
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
        >
            <Link href={href} className="block group">
                <div className={`relative p-6 rounded-2xl bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} border border-white/10 hover:border-white/20 transition-all duration-300 h-full`}>
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl bg-white/10 ${colorClasses[color as keyof typeof colorClasses]}`}>
                            <Icon className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-white/90">{title}</h3>
                            <p className="text-sm text-white/50 leading-relaxed mb-3">{description}</p>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-white/40">{articlesCount} articles</span>
                                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-1 transition-all" />
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    )
}

// Popular Article Card
const PopularArticle = ({ title, category, readTime }: { title: string, category: string, readTime: string }) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="group p-4 rounded-xl bg-white/[0.02] border border-white/10 hover:border-white/20 hover:bg-white/[0.04] transition-all duration-300 cursor-pointer"
    >
        <div className="flex items-start justify-between gap-4">
            <div>
                <span className="text-xs text-blue-400 font-medium mb-1 block">{category}</span>
                <h4 className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors">{title}</h4>
            </div>
            <div className="flex items-center gap-1 text-xs text-white/40 shrink-0">
                <Clock className="w-3 h-3" />
                {readTime}
            </div>
        </div>
    </motion.div>
)

const HelpCenter = () => {
    const isMobile = useIsMobile()
    const [searchQuery, setSearchQuery] = useState('')

    // Help categories
    const categories = [
        {
            icon: Zap,
            title: 'Getting Started',
            description: 'Learn the basics of VeeFore and set up your account for success.',
            articlesCount: 12,
            href: '/help/getting-started',
            color: 'blue'
        },
        {
            icon: Settings,
            title: 'Account & Settings',
            description: 'Manage your profile, preferences, and workspace settings.',
            articlesCount: 8,
            href: '/help/account',
            color: 'purple'
        },
        {
            icon: Users,
            title: 'Social Integrations',
            description: 'Connect and manage your social media accounts.',
            articlesCount: 15,
            href: '/help/integrations',
            color: 'green'
        },
        {
            icon: Sparkles,
            title: 'AI Features',
            description: 'Master AI-powered automation, hooks, and content generation.',
            articlesCount: 20,
            href: '/help/ai-features',
            color: 'orange'
        },
        {
            icon: CreditCard,
            title: 'Billing & Plans',
            description: 'Understand pricing, credits, subscriptions, and invoices.',
            articlesCount: 10,
            href: '/help/billing',
            color: 'pink'
        },
        {
            icon: Shield,
            title: 'Security & Privacy',
            description: 'Keep your account secure and understand our data practices.',
            articlesCount: 7,
            href: '/help/security',
            color: 'cyan'
        },
    ]

    // Popular articles
    const popularArticles = [
        { title: 'How to connect your Instagram account', category: 'Integrations', readTime: '3 min' },
        { title: 'Understanding the AI Comment Automation', category: 'AI Features', readTime: '5 min' },
        { title: 'Setting up your first DM Funnel', category: 'Getting Started', readTime: '7 min' },
        { title: 'How credits work and when they renew', category: 'Billing', readTime: '4 min' },
        { title: 'Best practices for AI-generated hooks', category: 'AI Features', readTime: '6 min' },
        { title: 'Troubleshooting connection issues', category: 'Integrations', readTime: '4 min' },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Help Center - VeeFore | Get Support & Learn"
                description="Find answers to your questions, learn how to use VeeFore, and get help from our support team. Comprehensive guides and tutorials for all features."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[400vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
                <GradientOrb className={`${isMobile ? 'w-[250px] h-[250px]' : 'w-[500px] h-[500px]'} top-[60%] left-[20%]`} color="indigo" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Navigation */}
            <MainNavigation />

            {/* Hero Section with Search */}
            <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
                            <HelpCircle className="w-4 h-4 mr-2" />
                            Help Center
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6"
                    >
                        <span className="text-white">How can we </span>
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            help you?
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10"
                    >
                        Search our knowledge base or browse categories to find the answers you need.
                    </motion.p>

                    {/* Search Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="max-w-2xl mx-auto"
                    >
                        <div className="relative">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search for articles, guides, tutorials..."
                                className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white/[0.05] border border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 text-white placeholder-white/30 outline-none transition-all text-base"
                            />
                            <button className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
                                Search
                            </button>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-white/40">
                            <span>Popular:</span>
                            <button className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors">connect Instagram</button>
                            <button className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors">AI automation</button>
                            <button className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors">billing</button>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Categories Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Browse by Category
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Find what you're looking for in our organized help sections
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {categories.map((category, i) => (
                            <CategoryCard key={i} {...category} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Popular Articles Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-start">
                        {/* Popular Articles */}
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <div className="flex items-center gap-2 mb-6">
                                <BookOpen className="w-5 h-5 text-blue-400" />
                                <h3 className="text-xl font-bold text-white">Popular Articles</h3>
                            </div>
                            <div className="space-y-3">
                                {popularArticles.map((article, i) => (
                                    <PopularArticle key={i} {...article} />
                                ))}
                            </div>
                            <Link
                                href="/help/all-articles"
                                className="mt-6 inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                            >
                                View all articles
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </motion.div>

                        {/* Video Tutorials */}
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <div className="flex items-center gap-2 mb-6">
                                <Play className="w-5 h-5 text-purple-400" />
                                <h3 className="text-xl font-bold text-white">Video Tutorials</h3>
                            </div>
                            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-white/10">
                                <div className="aspect-video flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4 cursor-pointer hover:bg-white/20 transition-colors">
                                            <Play className="w-8 h-8 text-white ml-1" />
                                        </div>
                                        <h4 className="text-lg font-semibold text-white mb-2">Getting Started with VeeFore</h4>
                                        <p className="text-sm text-white/50">Learn the basics in under 5 minutes</p>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                            <Play className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">AI Automation</p>
                                            <p className="text-xs text-white/40">8 min</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                            <Play className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">DM Funnels</p>
                                            <p className="text-xs text-white/40">12 min</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Contact Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Still need help?
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Can't find what you're looking for? Our support team is here to help.
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center group hover:border-blue-500/30 transition-all duration-300"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center mx-auto mb-4">
                                <MessageCircle className="w-7 h-7 text-blue-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">Live Chat</h3>
                            <p className="text-sm text-white/50 mb-4">Get instant help from our team</p>
                            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors">
                                Start Chat
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center group hover:border-purple-500/30 transition-all duration-300"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center mx-auto mb-4">
                                <Mail className="w-7 h-7 text-purple-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">Email Support</h3>
                            <p className="text-sm text-white/50 mb-4">We'll respond within 24 hours</p>
                            <a
                                href="mailto:support@veefore.com"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-colors"
                            >
                                Send Email
                                <ArrowRight className="w-4 h-4" />
                            </a>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center group hover:border-green-500/30 transition-all duration-300"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center mx-auto mb-4">
                                <Users className="w-7 h-7 text-green-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">Community</h3>
                            <p className="text-sm text-white/50 mb-4">Join our creator community</p>
                            <Link
                                href="/community"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors"
                            >
                                Join Now
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* FAQ Preview */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Frequently Asked Questions
                        </h2>
                        <p className="text-white/50">
                            Quick answers to common questions
                        </p>
                    </motion.div>

                    <div className="space-y-4">
                        {[
                            { q: 'How do I connect my Instagram account?', a: 'Go to Settings > Integrations, click "Connect Instagram", and follow the OAuth flow to authorize VeeFore.' },
                            { q: 'What happens when I run out of credits?', a: 'AI features will pause until your credits renew on your billing date. You can always purchase additional credits or upgrade your plan.' },
                            { q: 'Is my data secure?', a: 'Absolutely. We use end-to-end encryption, are SOC 2 compliant, and never share your data with third parties.' },
                        ].map((faq, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10"
                            >
                                <h4 className="text-lg font-medium text-white mb-2">{faq.q}</h4>
                                <p className="text-white/50 text-sm leading-relaxed">{faq.a}</p>
                            </motion.div>
                        ))}
                    </div>

                    <div className="text-center mt-8">
                        <Link
                            href="/#faq"
                            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium transition-colors"
                        >
                            View all FAQs
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <MainFooter />
        </div>
    )
}

export default HelpCenter
