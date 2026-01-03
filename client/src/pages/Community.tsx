import React from 'react'
import { motion } from 'framer-motion'
import {
    Users, MessageSquare, Trophy, Star, ArrowRight, Heart,
    Sparkles, Zap, Target, TrendingUp, Calendar, BookOpen,
    Twitter, Instagram, Linkedin, Youtube, ExternalLink
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile'
import { SEO } from '../lib/seo-optimization'
import { Link } from 'wouter'

import { useWaitlist } from '../context/WaitlistContext'

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

// Stats Card
const StatCard = ({ value, label, icon: Icon }: { value: string, label: string, icon: React.ComponentType<{ className?: string }> }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
    >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-3">
            <Icon className="w-6 h-6 text-blue-400" />
        </div>
        <p className="text-3xl md:text-4xl font-bold text-white mb-1">{value}</p>
        <p className="text-sm text-white/50">{label}</p>
    </motion.div>
)

// Community Channel Card
const ChannelCard = ({ icon: Icon, title, description, members, href, color, isExternal }: {
    icon: React.ComponentType<{ className?: string }>,
    title: string,
    description: string,
    members: string,
    href: string,
    color: string,
    isExternal?: boolean
}) => {
    const colorClasses = {
        blue: 'from-blue-500/20 to-blue-600/10 hover:border-blue-500/30 text-blue-400',
        purple: 'from-purple-500/20 to-purple-600/10 hover:border-purple-500/30 text-purple-400',
        pink: 'from-pink-500/20 to-pink-600/10 hover:border-pink-500/30 text-pink-400',
        red: 'from-red-500/20 to-red-600/10 hover:border-red-500/30 text-red-400',
        cyan: 'from-cyan-500/20 to-cyan-600/10 hover:border-cyan-500/30 text-cyan-400',
    }

    const content = (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
            className={`relative p-6 rounded-2xl bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} border border-white/10 hover:border-white/20 transition-all duration-300 h-full group cursor-pointer`}
        >
            <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl bg-white/10`}>
                    <Icon className={`w-6 h-6 ${colorClasses[color as keyof typeof colorClasses].split(' ').pop()}`} />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-white">{title}</h3>
                        {isExternal && <ExternalLink className="w-4 h-4 text-white/30" />}
                    </div>
                    <p className="text-sm text-white/50 leading-relaxed mb-3">{description}</p>
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-white/40 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {members} members
                        </span>
                        <span className={`text-xs font-medium ${colorClasses[color as keyof typeof colorClasses].split(' ').pop()} group-hover:underline`}>
                            Join →
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    )

    if (isExternal) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="block">
                {content}
            </a>
        )
    }

    return <Link href={href} className="block">{content}</Link>
}

// Featured Creator Card
const CreatorCard = ({ name, handle, followers, category, avatar }: {
    name: string,
    handle: string,
    followers: string,
    category: string,
    avatar: string
}) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        whileHover={{ y: -4 }}
        className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all duration-300"
    >
        <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white shrink-0">
                {avatar}
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="text-base font-semibold text-white truncate">{name}</h4>
                <p className="text-sm text-blue-400 truncate">{handle}</p>
                <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-white/40">{followers} followers</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">{category}</span>
                </div>
            </div>
        </div>
    </motion.div>
)

// Event Card
const EventCard = ({ title, date, time, type, isLive }: {
    title: string,
    date: string,
    time: string,
    type: string,
    isLive?: boolean
}) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="p-5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all duration-300"
    >
        <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20">
                <Calendar className="w-5 h-5 text-orange-400" />
            </div>
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-base font-semibold text-white">{title}</h4>
                    {isLive && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            LIVE
                        </span>
                    )}
                </div>
                <p className="text-sm text-white/50">{date} • {time}</p>
                <span className="mt-2 inline-block text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">{type}</span>
            </div>
        </div>
    </motion.div>
)

const Community = () => {
    const isMobile = useIsMobile()
    const { openWaitlist } = useWaitlist()

    // Community channels
    const channels = [
        {
            icon: MessageSquare,
            title: 'Discord Community',
            description: 'Join real-time discussions, get help, and connect with fellow creators.',
            members: '2.5K+',
            href: 'https://discord.gg/veefore',
            color: 'purple',
            isExternal: true
        },
        {
            icon: Twitter,
            title: 'Twitter/X',
            description: 'Follow us for updates, tips, and creator spotlights.',
            members: '5K+',
            href: 'https://x.com/Veefore_inc',
            color: 'blue',
            isExternal: true
        },
        {
            icon: Instagram,
            title: 'Instagram',
            description: 'Behind the scenes, creator stories, and growth tips.',
            members: '3K+',
            href: 'https://www.instagram.com/veefore_inc/',
            color: 'pink',
            isExternal: true
        },
        {
            icon: Youtube,
            title: 'YouTube',
            description: 'Tutorials, case studies, and in-depth feature walkthroughs.',
            members: '1K+',
            href: 'https://youtube.com/@veefore',
            color: 'red',
            isExternal: true
        },
        {
            icon: Linkedin,
            title: 'LinkedIn',
            description: 'Professional updates and industry insights.',
            members: '500+',
            href: 'https://linkedin.com/company/veefore',
            color: 'cyan',
            isExternal: true
        },
    ]

    // Featured creators
    const featuredCreators = [
        { name: 'Sarah Creates', handle: '@sarahcreates', followers: '125K', category: 'Lifestyle', avatar: 'S' },
        { name: 'Tech Mike', handle: '@techmike', followers: '89K', category: 'Tech', avatar: 'T' },
        { name: 'Fitness Julia', handle: '@fitjulia', followers: '200K', category: 'Fitness', avatar: 'F' },
        { name: 'Cook with Raj', handle: '@cookwithraj', followers: '75K', category: 'Food', avatar: 'C' },
    ]

    // Upcoming events
    const upcomingEvents = [
        { title: 'Creator Growth Masterclass', date: 'Jan 15, 2026', time: '6:00 PM IST', type: 'Webinar' },
        { title: 'AI Automation Workshop', date: 'Jan 22, 2026', time: '7:00 PM IST', type: 'Workshop', isLive: true },
        { title: 'Community AMA with Founders', date: 'Jan 30, 2026', time: '5:00 PM IST', type: 'AMA' },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Community - VeeFore | Join Our Creator Community"
                description="Join the VeeFore community of creators. Connect, learn, and grow together with thousands of content creators using AI-powered automation."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[400vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
                <GradientOrb className={`${isMobile ? 'w-[250px] h-[250px]' : 'w-[500px] h-[500px]'} top-[60%] left-[20%]`} color="indigo" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Navigation */}


            {/* Hero Section */}
            <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
                            <Users className="w-4 h-4 mr-2" />
                            Join 10,000+ Creators
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6"
                    >
                        <span className="text-white">Welcome to the </span>
                        <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                            Creator Community
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10"
                    >
                        Connect with fellow creators, share strategies, learn from experts, and grow together. The VeeFore community is where creators thrive.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <a
                            href="https://discord.gg/veefore"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-lg transition-all duration-300 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                        >
                            <MessageSquare className="w-5 h-5" />
                            Join Discord
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </a>
                        <button
                            onClick={openWaitlist}
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold transition-all duration-300"
                        >
                            Join Waitlist
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-12 md:py-16 px-4 sm:px-6 border-y border-white/10 bg-white/[0.01]">
                <div className="max-w-5xl mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        <StatCard value="10K+" label="Community Members" icon={Users} />
                        <StatCard value="500+" label="Success Stories" icon={Trophy} />
                        <StatCard value="50+" label="Weekly Events" icon={Calendar} />
                        <StatCard value="24/7" label="Active Support" icon={Heart} />
                    </div>
                </div>
            </section>

            {/* Community Channels */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Connect With Us Everywhere
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Join our community on your favorite platforms
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {channels.map((channel, i) => (
                            <ChannelCard key={i} {...channel} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Featured Creators & Events */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12">
                        {/* Featured Creators */}
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <div className="flex items-center gap-2 mb-6">
                                <Star className="w-5 h-5 text-yellow-400" />
                                <h3 className="text-xl font-bold text-white">Featured Creators</h3>
                            </div>
                            <p className="text-white/50 text-sm mb-6">
                                Meet some of our amazing community members who are crushing it with VeeFore
                            </p>
                            <div className="grid sm:grid-cols-2 gap-4">
                                {featuredCreators.map((creator, i) => (
                                    <CreatorCard key={i} {...creator} />
                                ))}
                            </div>
                        </motion.div>

                        {/* Upcoming Events */}
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <div className="flex items-center gap-2 mb-6">
                                <Calendar className="w-5 h-5 text-orange-400" />
                                <h3 className="text-xl font-bold text-white">Upcoming Events</h3>
                            </div>
                            <p className="text-white/50 text-sm mb-6">
                                Join live workshops, AMAs, and masterclasses with industry experts
                            </p>
                            <div className="space-y-4">
                                {upcomingEvents.map((event, i) => (
                                    <EventCard key={i} {...event} />
                                ))}
                            </div>
                            <Link
                                href="/events"
                                className="mt-6 inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                            >
                                View all events
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Why Join Our Community?
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            More than just a product—we're building a movement
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: Sparkles, title: 'Early Access', description: 'Be the first to try new features before public release' },
                            { icon: BookOpen, title: 'Exclusive Resources', description: 'Access guides, templates, and strategies from top creators' },
                            { icon: Target, title: 'Accountability', description: 'Join growth challenges and stay motivated with peers' },
                            { icon: TrendingUp, title: 'Networking', description: 'Connect with creators, collaborate, and grow together' },
                        ].map((benefit, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
                                    <benefit.icon className="w-6 h-6 text-blue-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-white mb-2">{benefit.title}</h3>
                                <p className="text-sm text-white/50">{benefit.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative p-10 md:p-14 rounded-3xl bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-pink-600/20 border border-white/10 overflow-hidden text-center"
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-gradient-to-b from-purple-500/30 to-transparent rounded-full blur-[100px]" />

                        <div className="relative z-10">
                            <Zap className="w-12 h-12 text-yellow-400 mx-auto mb-6" />
                            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                                Ready to Join the Movement?
                            </h2>
                            <p className="text-white/60 mb-8 max-w-lg mx-auto">
                                Start connecting with thousands of creators who are transforming their growth with AI-powered automation.
                            </p>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <a
                                    href="https://discord.gg/veefore"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-8 py-4 rounded-full bg-white text-black font-semibold text-lg hover:bg-white/90 transition-all group"
                                >
                                    <MessageSquare className="w-5 h-5 mr-2" />
                                    Join Discord Community
                                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                                </a>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}

        </div>
    )
}

export default Community
