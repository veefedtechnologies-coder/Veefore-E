
import { motion } from 'framer-motion'
import {
    ArrowRight, Sparkles, Rocket, Zap, Bug,
    Calendar, Tag
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile';
import { SEO } from '../lib/seo-optimization'
import { Link } from 'wouter'


// Mobile-optimized gradient orbs
const GradientOrb = ({ className, color = 'blue' }: { className?: string, color?: string }) => {
    const isMobile = useIsMobile()
    const colors = {
        blue: isMobile ? 'bg-blue-600/10' : 'from-blue-500/30 via-blue-600/20 to-transparent',
        purple: isMobile ? 'bg-purple-600/10' : 'from-purple-500/30 via-purple-600/20 to-transparent',
    }

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    )
}

// Change type badges
const ChangeTypeBadge = ({ type }: { type: 'feature' | 'improvement' | 'fix' | 'beta' }) => {
    const config = {
        feature: { icon: Sparkles, text: 'New Feature', bg: 'bg-green-500/20', border: 'border-green-500/30', color: 'text-green-400' },
        improvement: { icon: Zap, text: 'Improvement', bg: 'bg-blue-500/20', border: 'border-blue-500/30', color: 'text-blue-400' },
        fix: { icon: Bug, text: 'Bug Fix', bg: 'bg-amber-500/20', border: 'border-amber-500/30', color: 'text-amber-400' },
        beta: { icon: Rocket, text: 'Beta', bg: 'bg-purple-500/20', border: 'border-purple-500/30', color: 'text-purple-400' },
    }
    const { icon: Icon, text, bg, border, color } = config[type]

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${bg} border ${border} ${color} text-xs font-medium`}>
            <Icon className="w-3 h-3" />
            {text}
        </span>
    )
}

// Changelog Entry Component
const ChangelogEntry = ({ version, date, title, description, changes, isBeta }: {
    version: string,
    date: string,
    title: string,
    description: string,
    changes: { type: 'feature' | 'improvement' | 'fix' | 'beta', text: string }[],
    isBeta?: boolean
}) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        className="relative"
    >
        {/* Timeline dot */}
        <div className="absolute left-0 top-0 w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 border-4 border-[#030303] -translate-x-1/2" />

        <div className="pl-8 pb-12">
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-sm font-mono text-white/40">{version}</span>
                <span className="flex items-center gap-1.5 text-sm text-white/30">
                    <Calendar className="w-3 h-3" />
                    {date}
                </span>
                {isBeta && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs">
                        Beta
                    </span>
                )}
            </div>

            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">{title}</h3>
            <p className="text-white/50 mb-6 max-w-2xl">{description}</p>

            <div className="space-y-3">
                {changes.map((change, i) => (
                    <div key={i} className="flex items-start gap-3">
                        <ChangeTypeBadge type={change.type} />
                        <span className="text-white/70 pt-0.5">{change.text}</span>
                    </div>
                ))}
            </div>
        </div>
    </motion.div>
)

const Changelog = () => {
    const isMobile = useIsMobile()

    // Changelog entries
    const changelogEntries = [
        {
            version: 'v0.9.0',
            date: 'Coming Soon',
            title: 'Public Beta Launch',
            description: 'The public beta release with core features available to all beta users.',
            isBeta: true,
            changes: [
                { type: 'feature' as const, text: 'AI Comment Automation with context-aware replies' },
                { type: 'feature' as const, text: 'Smart DM Automation with keyword triggers' },
                { type: 'feature' as const, text: 'Hook Intelligence with competitor analysis' },
                { type: 'feature' as const, text: 'Growth-Aware Scheduler with best-time recommendations' },
                { type: 'improvement' as const, text: 'Revamped dashboard with real-time analytics' },
            ]
        },
        {
            version: 'v0.8.0',
            date: 'December 2024',
            title: 'Private Alpha',
            description: 'Internal testing phase with core team and select creators.',
            isBeta: true,
            changes: [
                { type: 'feature' as const, text: 'Basic AI Hook Generator' },
                { type: 'feature' as const, text: 'Caption & CTA Engine' },
                { type: 'feature' as const, text: 'Instagram integration' },
                { type: 'improvement' as const, text: 'Performance optimizations for AI responses' },
                { type: 'fix' as const, text: 'Fixed authentication edge cases' },
            ]
        },
        {
            version: 'v0.5.0',
            date: 'November 2024',
            title: 'Foundation Release',
            description: 'Initial internal build with core infrastructure.',
            isBeta: true,
            changes: [
                { type: 'feature' as const, text: 'User authentication and workspace management' },
                { type: 'feature' as const, text: 'Basic analytics dashboard' },
                { type: 'feature' as const, text: 'Credit system implementation' },
                { type: 'improvement' as const, text: 'API architecture finalized' },
            ]
        },
    ]

    // Roadmap items
    const roadmapItems = [
        { title: 'Multi-platform Support', description: 'Twitter/X, LinkedIn, and TikTok integration', status: 'In Progress' },
        { title: 'Advanced DM Funnels', description: 'Multi-step automated conversation flows', status: 'Planned' },
        { title: 'Team Collaboration', description: 'Workspace sharing and role-based access', status: 'Planned' },
        { title: 'Mobile App', description: 'iOS and Android companion apps', status: 'Planned' },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Changelog - Veefore | Product Updates & Releases"
                description="Stay updated with the latest Veefore releases, new features, improvements, and bug fixes. See what's new and what's coming next."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[300vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[50%] -right-[100px]`} color="purple" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Navigation */}


            {/* Hero Section */}
            <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
                            <Tag className="w-4 h-4 mr-2" />
                            Product Updates
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                    >
                        <span className="text-white">What's New in </span>
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Veefore
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base md:text-lg text-white/50 max-w-2xl mx-auto"
                    >
                        Stay updated with our latest releases, new features, and improvements. We're constantly building to help you grow faster.
                    </motion.p>
                </div>
            </section>

            {/* Changelog Timeline */}
            <section className="py-12 md:py-16 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    {/* Timeline line */}
                    <div className="relative border-l-2 border-white/10 ml-2">
                        {changelogEntries.map((entry, i) => (
                            <ChangelogEntry key={i} {...entry} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Roadmap Preview */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Coming Soon
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Here's a glimpse of what we're working on next
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 gap-6">
                        {roadmapItems.map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold text-white">{item.title}</h3>
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${item.status === 'In Progress'
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : 'bg-white/10 text-white/50 border border-white/10'
                                        }`}>
                                        {item.status}
                                    </span>
                                </div>
                                <p className="text-sm text-white/50">{item.description}</p>
                            </motion.div>
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
                                Be Part of the Journey
                            </h2>
                            <p className="text-white/60 mb-8 max-w-lg mx-auto">
                                Join our beta program to get early access and help shape the future of Veefore.
                            </p>

                            <Link
                                href="/waitlist"
                                className="inline-flex items-center px-8 py-4 rounded-full bg-white text-black font-semibold text-lg hover:bg-white/90 transition-all group"
                            >
                                Join Beta
                                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}

        </div>
    )
}

export default Changelog
