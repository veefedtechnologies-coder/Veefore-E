import { useState } from 'react'
import { motion } from 'framer-motion'
import {
    ArrowRight, Clock,
    TrendingUp
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile';
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
    }

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    )
}

// Blog Post Card
const BlogPostCard = ({ title, excerpt, category, readTime, date, featured }: {
    title: string,
    excerpt: string,
    category: string,
    readTime: string,
    date: string,
    featured?: boolean,
    image?: string
}) => (
    <motion.article
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className={`group cursor-pointer ${featured ? 'md:col-span-2' : ''}`}
    >
        <div className={`relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all ${featured ? 'md:flex' : ''}`}>
            {/* Image placeholder */}
            <div className={`relative overflow-hidden ${featured ? 'md:w-1/2 h-64 md:h-auto' : 'h-48'}`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${category === 'Growth Tips' ? 'from-green-600/30 to-emerald-600/20' :
                    category === 'Product Updates' ? 'from-blue-600/30 to-purple-600/20' :
                        category === 'Creator Stories' ? 'from-pink-600/30 to-rose-600/20' :
                            'from-amber-600/30 to-orange-600/20'
                    }`} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl opacity-20">📝</span>
                </div>
                <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-white text-xs font-medium">
                        {category}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className={`p-6 ${featured ? 'md:w-1/2 md:flex md:flex-col md:justify-center' : ''}`}>
                <div className="flex items-center gap-4 text-sm text-white/40 mb-3">
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {readTime}
                    </span>
                    <span>{date}</span>
                </div>
                <h3 className={`font-bold text-white mb-2 group-hover:text-blue-400 transition-colors ${featured ? 'text-2xl' : 'text-lg'}`}>
                    {title}
                </h3>
                <p className="text-white/50 text-sm line-clamp-2 mb-4">{excerpt}</p>
                <span className="inline-flex items-center text-blue-400 text-sm font-medium group-hover:gap-2 transition-all">
                    Read More <ArrowRight className="w-4 h-4 ml-1" />
                </span>
            </div>
        </div>
    </motion.article>
)

// Category Tag
const CategoryTag = ({ name, count, active, onClick }: { name: string, count: number, active?: boolean, onClick: () => void }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${active
            ? 'bg-blue-500 text-white'
            : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
    >
        {name} <span className="opacity-60">({count})</span>
    </button>
)

const Blog = () => {
    const isMobile = useIsMobile()
    const [activeCategory, setActiveCategory] = useState('All')

    // Blog categories
    const categories = [
        { name: 'All', count: 8 },
        { name: 'Growth Tips', count: 3 },
        { name: 'Product Updates', count: 2 },
        { name: 'Creator Stories', count: 2 },
        { name: 'AI & Automation', count: 1 },
    ]

    // Blog posts
    const blogPosts = [
        {
            title: 'Why Engagement is the New Currency for Creators',
            excerpt: 'In the algorithm-driven social media landscape, engagement has become more valuable than follower count. Learn why and how to leverage this for growth.',
            category: 'Growth Tips',
            readTime: '5 min read',
            date: 'Coming Soon',
            featured: true
        },
        {
            title: 'Introducing Veefore: AI-Powered Growth for Creators',
            excerpt: 'We are excited to announce the launch of Veefore, a revolutionary platform that uses AI to automate and optimize your social media engagement.',
            category: 'Product Updates',
            readTime: '3 min read',
            date: 'Coming Soon',
        },
        {
            title: 'The Psychology Behind Viral Hooks',
            excerpt: 'Understanding what makes content shareable is key to growth. Dive into the psychology of hooks that capture attention in the first 3 seconds.',
            category: 'Growth Tips',
            readTime: '7 min read',
            date: 'Coming Soon',
        },
        {
            title: 'How AI is Changing the Creator Economy',
            excerpt: 'From content generation to engagement automation, AI is reshaping how creators work. Here is what you need to know to stay ahead.',
            category: 'AI & Automation',
            readTime: '6 min read',
            date: 'Coming Soon',
        },
        {
            title: 'From 1K to 100K: A Creator Growth Story',
            excerpt: 'How one creator used strategic engagement and consistent content to grow their audience 100x in just 12 months.',
            category: 'Creator Stories',
            readTime: '8 min read',
            date: 'Coming Soon',
        },
        {
            title: 'The Science of Perfect Posting Times',
            excerpt: 'When you post matters almost as much as what you post. Our data analysis reveals the best times to maximize engagement.',
            category: 'Growth Tips',
            readTime: '4 min read',
            date: 'Coming Soon',
        },
    ]

    const filteredPosts = activeCategory === 'All'
        ? blogPosts
        : blogPosts.filter(post => post.category === activeCategory)

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Blog - Veefore | Creator Growth Insights & Tips"
                description="Explore insights, tips, and stories about creator growth, AI automation, and social media engagement strategies from the Veefore team."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[400vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[50%] -right-[100px]`} color="purple" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Navigation */}
            <MainNavigation />

            {/* Hero Section */}
            <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
                            <TrendingUp className="w-4 h-4 mr-2" />
                            Creator Growth Insights
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                    >
                        <span className="text-white">The Veefore </span>
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Blog
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base md:text-lg text-white/50 max-w-2xl mx-auto"
                    >
                        Insights, tips, and stories to help you grow your audience with AI-powered engagement automation.
                    </motion.p>
                </div>
            </section>

            {/* Categories & Search */}
            <section className="py-8 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="flex flex-wrap items-center gap-3 mb-8">
                        {categories.map((cat) => (
                            <CategoryTag
                                key={cat.name}
                                name={cat.name}
                                count={cat.count}
                                active={activeCategory === cat.name}
                                onClick={() => setActiveCategory(cat.name)}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* Coming Soon Notice */}
            <section className="py-8 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="p-6 rounded-2xl bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 border border-white/10 text-center"
                    >
                        <h3 className="text-xl font-bold text-white mb-2">🚀 Blog Coming Soon!</h3>
                        <p className="text-white/60 max-w-xl mx-auto">
                            We're preparing amazing content about creator growth, AI automation, and engagement strategies.
                            Join our waitlist to be notified when we publish our first articles.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Blog Posts Grid */}
            <section className="py-12 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-6">
                        {filteredPosts.map((post, i) => (
                            <BlogPostCard key={i} {...post} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Newsletter CTA */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative p-10 md:p-14 rounded-3xl bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 border border-white/10 overflow-hidden"
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-gradient-to-b from-blue-500/30 to-transparent rounded-full blur-[100px]" />

                        <div className="relative z-10">
                            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                                Stay Updated
                            </h2>
                            <p className="text-white/60 mb-8 max-w-lg mx-auto">
                                Get the latest growth tips, product updates, and creator insights delivered to your inbox.
                            </p>

                            <Link
                                href="/waitlist"
                                className="inline-flex items-center px-8 py-4 rounded-full bg-white text-black font-semibold text-lg hover:bg-white/90 transition-all group"
                            >
                                Join Waitlist
                                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <MainFooter />
        </div>
    )
}

export default Blog
