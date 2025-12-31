import React from 'react'
import { motion } from 'framer-motion'
import {
    ArrowRight, Heart, Rocket, Users, Zap, Coffee, Globe,
    MapPin, Briefcase
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
    }

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    )
}

// Perk Card
const PerkCard = ({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>, title: string, description: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center"
    >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-6 h-6 text-blue-400" />
        </div>
        <h3 className="font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-white/50">{description}</p>
    </motion.div>
)

// Value Card
const ValueCard = ({ title, description }: { title: string, description: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="p-6 rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10"
    >
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-white/50 text-sm leading-relaxed">{description}</p>
    </motion.div>
)

const Careers = () => {
    const isMobile = useIsMobile()

    // Perks
    const perks = [
        { icon: Rocket, title: 'Early Stage Impact', description: 'Join at the ground floor and shape the future of creator growth technology.' },
        { icon: Globe, title: 'Remote First', description: 'Work from anywhere. We believe great work happens where you are most comfortable.' },
        { icon: Users, title: 'Small Team', description: 'Direct access to founders. Your ideas matter and get implemented quickly.' },
        { icon: Coffee, title: 'Flexible Hours', description: 'We focus on results, not hours. Work when you are most productive.' },
        { icon: Zap, title: 'Learning Budget', description: 'Continuous learning is encouraged with resources for courses and conferences.' },
        { icon: Heart, title: 'Equity Options', description: 'Be an owner, not just an employee. ESOPs available for early team members.' },
    ]

    // Values
    const values = [
        { title: 'Move Fast, Learn Faster', description: 'We ship quickly, iterate based on feedback, and embrace failures as learning opportunities.' },
        { title: 'Creator Obsessed', description: 'Every decision is filtered through: "Does this help creators grow?" If not, we reconsider.' },
        { title: 'Transparent by Default', description: 'Open communication, honest feedback, and shared knowledge. No politics, no silos.' },
        { title: 'Own Your Work', description: 'Take initiative, make decisions, and be accountable. We trust you to do great work.' },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Careers - Veefed Technologies | Join Our Team"
                description="Join Veefed Technologies and help build the future of AI-powered creator growth. We are looking for passionate people to join our mission."
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
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
                            <Briefcase className="w-4 h-4 mr-2" />
                            Join Our Team
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                    >
                        <span className="text-white">Build the Future of </span>
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Creator Growth
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base md:text-lg text-white/50 max-w-2xl mx-auto mb-8"
                    >
                        We're on a mission to empower every creator with AI-powered growth tools. Join our early-stage team and make a real impact.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex items-center justify-center gap-4 text-sm text-white/40"
                    >
                        <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            Remote First
                        </span>
                        <span>•</span>
                        <span>Early Stage Startup</span>
                        <span>•</span>
                        <span>Bareilly, India (HQ)</span>
                    </motion.div>
                </div>
            </section>

            {/* No Openings Notice */}
            <section className="py-12 px-4 sm:px-6">
                <div className="max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="p-8 rounded-3xl bg-gradient-to-r from-amber-600/20 via-orange-600/20 to-red-600/20 border border-amber-500/20 text-center"
                    >
                        <h3 className="text-2xl font-bold text-white mb-3">🚀 We're Just Getting Started</h3>
                        <p className="text-white/60 max-w-xl mx-auto mb-6">
                            Veefed Technologies was incorporated in July 2025. While we don't have formal openings right now,
                            we're always excited to hear from talented individuals who share our vision.
                        </p>
                        <a
                            href="mailto:careers@veefore.com"
                            className="inline-flex items-center px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-all group"
                        >
                            Send Your Resume
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </a>
                    </motion.div>
                </div>
            </section>

            {/* Why Join Us */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Why Join Veefed?
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Building something new is hard, but it's also incredibly rewarding
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {perks.map((perk, i) => (
                            <PerkCard key={i} {...perk} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Our Values */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            How We Work
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Our culture is defined by these principles
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-6">
                        {values.map((value, i) => (
                            <ValueCard key={i} {...value} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Who We're Looking For */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Who We're Looking For
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            As we grow, we'll be hiring across these areas
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                            'Full Stack Engineers',
                            'AI/ML Engineers',
                            'Product Designers',
                            'Growth Marketing',
                            'Customer Success',
                            'Content Creators'
                        ].map((role, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-center"
                            >
                                <span className="text-white/70">{role}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative p-10 md:p-14 rounded-3xl bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 border border-white/10 overflow-hidden"
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-gradient-to-b from-purple-500/30 to-transparent rounded-full blur-[100px]" />

                        <div className="relative z-10">
                            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                                Interested in Joining?
                            </h2>
                            <p className="text-white/60 mb-8 max-w-lg mx-auto">
                                Send us your resume and tell us why you're excited about the creator economy and AI.
                            </p>

                            <a
                                href="mailto:careers@veefore.com"
                                className="inline-flex items-center px-8 py-4 rounded-full bg-white text-black font-semibold text-lg hover:bg-white/90 transition-all group"
                            >
                                Email Us
                                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                            </a>
                            <p className="text-white/40 text-sm mt-4">
                                careers@veefore.com
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <MainFooter />
        </div>
    )
}

export default Careers
