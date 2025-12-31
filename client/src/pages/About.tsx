import React from 'react'
import { motion } from 'framer-motion'
import {
    ArrowRight, Heart, Target, Lightbulb, Users, Rocket,
    MapPin, Building2, Calendar
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
        indigo: isMobile ? 'bg-indigo-500/8' : 'from-indigo-500/30 via-indigo-600/20 to-transparent',
    }

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    )
}

// Value Card Component
const ValueCard = ({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>, title: string, description: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center"
    >
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-7 h-7 text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-white/50 leading-relaxed">{description}</p>
    </motion.div>
)

// Team Member Card
const TeamMemberCard = ({ name, role, description }: { name: string, role: string, description: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative p-8 rounded-3xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10 text-center"
    >
        {/* Avatar placeholder */}
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 text-3xl font-bold text-white">
            {name.charAt(0)}
        </div>
        <h3 className="text-xl font-bold text-white mb-1">{name}</h3>
        <p className="text-blue-400 text-sm font-medium mb-4">{role}</p>
        <p className="text-white/50 text-sm leading-relaxed">{description}</p>
    </motion.div>
)

// Timeline Item
const TimelineItem = ({ year, title, description, isLast }: { year: string, title: string, description: string, isLast?: boolean }) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="relative pl-8 pb-10"
    >
        {/* Timeline dot */}
        <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
        {/* Timeline line */}
        {!isLast && <div className="absolute left-[5px] top-4 w-0.5 h-full bg-white/10" />}

        <span className="text-blue-400 text-sm font-medium">{year}</span>
        <h4 className="text-white font-semibold mt-1 mb-2">{title}</h4>
        <p className="text-white/50 text-sm leading-relaxed">{description}</p>
    </motion.div>
)

const About = () => {
    const isMobile = useIsMobile()

    // Company values
    const values = [
        { icon: Target, title: 'Growth First', description: 'We believe engagement drives growth. Every feature we build prioritizes active growth over passive presence.' },
        { icon: Lightbulb, title: 'Innovation', description: 'We push the boundaries of AI to create tools that genuinely transform how creators engage with their audience.' },
        { icon: Users, title: 'Creator Success', description: 'Your success is our success. We measure our impact by the growth stories of our users.' },
        { icon: Heart, title: 'Authenticity', description: 'AI should enhance human connection, not replace it. Our automation maintains your unique voice and style.' },
    ]

    // Leadership team
    const team = [
        {
            name: 'Arpit Choudhary',
            role: 'Founder & Director',
            description: 'Visionary entrepreneur with a passion for leveraging AI to solve real-world problems. Leading Veefed Technologies to revolutionize creator growth automation.'
        },
        {
            name: 'Kavita',
            role: 'Co-Founder & Director',
            description: 'Strategic leader driving business operations and company growth. Focused on building sustainable technology solutions for the creator economy.'
        }
    ]

    // Company timeline
    const timeline = [
        { year: 'July 2025', title: 'Company Incorporated', description: 'Veefed Technologies Private Limited was officially incorporated on 22nd July 2025, marking the beginning of our journey.' },
        { year: 'August 2025', title: 'Vision & Research', description: 'Extensive market research and product ideation. Identified the gap in AI-powered engagement automation for creators.' },
        { year: 'November 2025', title: 'Development Begins', description: 'Started building the core infrastructure and AI models that power Veefore\'s engagement automation engine.' },
        { year: 'December 2025', title: 'Private Alpha', description: 'Launched private alpha testing with select creators to validate our AI automation capabilities.' },
        { year: '2026', title: 'Public Beta Launch', description: 'Opening Veefore to the public with a limited beta program. Building the future of creator growth, together.' },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="About Us - Veefed Technologies | The Company Behind Veefore"
                description="Learn about Veefed Technologies, the creators of Veefore. Our mission is to empower creators with AI-powered growth automation technology."
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

            {/* Hero Section */}
            <section className="relative pt-28 pb-16 md:pt-36 md:pb-20 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
                            <Building2 className="w-4 h-4 mr-2" />
                            Veefed Technologies Pvt. Ltd.
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6"
                    >
                        <span className="text-white">Building the Future of </span>
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
                        We're on a mission to empower every creator with AI-powered tools that turn engagement into growth. Veefore is our flagship product, revolutionizing how creators connect with their audience.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/40"
                    >
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>Est. July 2025</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            <span>Bareilly, India</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Rocket className="w-4 h-4" />
                            <span>Building in Public</span>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Mission Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <span className="text-blue-400 text-sm font-medium uppercase tracking-wider">Our Mission</span>
                            <h2 className="text-2xl md:text-4xl font-bold text-white mt-2 mb-6">
                                Democratizing Growth for Every Creator
                            </h2>
                            <p className="text-white/60 leading-relaxed mb-6">
                                In a world where algorithms favor consistency and engagement, we believe every creator deserves the tools to compete. Veefore isn't just a product—it's our commitment to leveling the playing field.
                            </p>
                            <p className="text-white/60 leading-relaxed">
                                We're building AI that understands the nuances of social engagement, responds with authentic human-like interaction, and actively participates in your growth journey. Because great content deserves great reach.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="relative p-8 rounded-3xl bg-gradient-to-br from-blue-600/20 via-purple-600/10 to-pink-600/20 border border-white/10"
                        >
                            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/10 to-transparent rounded-3xl" />
                            <div className="relative z-10">
                                <h3 className="text-xl font-bold text-white mb-4">Our Vision</h3>
                                <p className="text-white/70 leading-relaxed mb-6">
                                    "To become the trusted AI partner for every creator's growth journey—making intelligent engagement automation accessible, effective, and authentic."
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                        A
                                    </div>
                                    <div>
                                        <p className="text-white font-medium">Arpit Choudhary</p>
                                        <p className="text-white/50 text-sm">Founder, Veefed Technologies</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Values Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Our Core Values
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            The principles that guide everything we build
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {values.map((value, i) => (
                            <ValueCard key={i} {...value} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Leadership Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Leadership Team
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Meet the founders driving Veefed Technologies forward
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-8">
                        {team.map((member, i) => (
                            <TeamMemberCard key={i} {...member} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Timeline Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Our Journey
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            From idea to impact—our story so far
                        </p>
                    </motion.div>

                    <div className="ml-4">
                        {timeline.map((item, i) => (
                            <TimelineItem key={i} {...item} isLast={i === timeline.length - 1} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Company Info Section */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative p-8 md:p-12 rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10"
                    >
                        <div className="grid md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-blue-400" />
                                    Company Details
                                </h3>
                                <div className="space-y-3 text-white/60">
                                    <p><span className="text-white/40">Legal Name:</span> Veefed Technologies Private Limited</p>
                                    <p><span className="text-white/40">Type:</span> Private Limited Company</p>
                                    <p><span className="text-white/40">Incorporated:</span> 22nd July 2025</p>
                                    <p><span className="text-white/40">Industry:</span> Software & Technology</p>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <MapPin className="w-5 h-5 text-purple-400" />
                                    Registered Office
                                </h3>
                                <p className="text-white/60 leading-relaxed">
                                    South City, Kargaina<br />
                                    Bareilly, Uttar Pradesh<br />
                                    India - 243001
                                </p>
                            </div>
                        </div>
                    </motion.div>
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
                                Join Us on This Journey
                            </h2>
                            <p className="text-white/60 mb-8 max-w-lg mx-auto">
                                Be part of the creator revolution. Try Veefore and experience the future of AI-powered growth.
                            </p>

                            <Link
                                href="/waitlist"
                                className="inline-flex items-center px-8 py-4 rounded-full bg-white text-black font-semibold text-lg hover:bg-white/90 transition-all group"
                            >
                                Get Started Free
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

export default About
