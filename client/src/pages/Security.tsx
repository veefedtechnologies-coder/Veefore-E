import React from 'react'
import { motion } from 'framer-motion'
import {
    Shield, Lock, Eye, Server, Key, RefreshCw, AlertTriangle,
    CheckCircle, Fingerprint
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
        green: isMobile ? 'bg-green-600/10' : 'from-green-500/30 via-green-600/20 to-transparent',
    }

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    )
}

// Security Feature Card
const SecurityFeatureCard = ({ icon: Icon, title, description, gradient }: {
    icon: React.ComponentType<{ className?: string }>,
    title: string,
    description: string,
    gradient: string
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-green-500/30 transition-all group"
    >
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-white/50 text-sm leading-relaxed">{description}</p>
    </motion.div>
)

// Compliance Badge
const ComplianceBadge = ({ title, description }: { title: string, description: string }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="flex items-start gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20"
    >
        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
        <div>
            <h4 className="text-white font-medium">{title}</h4>
            <p className="text-white/50 text-sm">{description}</p>
        </div>
    </motion.div>
)

const Security = () => {
    const isMobile = useIsMobile()

    // Security features
    const securityFeatures = [
        {
            icon: Lock,
            title: 'End-to-End Encryption',
            description: 'All data transmitted between your device and our servers is encrypted using TLS 1.3, the most secure protocol available.',
            gradient: 'from-green-500 to-emerald-600'
        },
        {
            icon: Key,
            title: 'Secure Authentication',
            description: 'Industry-standard authentication with secure password hashing, session management, and optional two-factor authentication.',
            gradient: 'from-blue-500 to-cyan-600'
        },
        {
            icon: Server,
            title: 'Data Protection',
            description: 'Your data is stored in secure, encrypted databases with regular backups and geographic redundancy.',
            gradient: 'from-purple-500 to-violet-600'
        },
        {
            icon: Eye,
            title: 'Privacy by Design',
            description: 'We collect only what\'s necessary and never sell your data. Your privacy is built into our architecture.',
            gradient: 'from-pink-500 to-rose-600'
        },
        {
            icon: RefreshCw,
            title: 'Regular Security Audits',
            description: 'We conduct regular security assessments and penetration testing to identify and fix vulnerabilities.',
            gradient: 'from-amber-500 to-orange-600'
        },
        {
            icon: Fingerprint,
            title: 'Access Controls',
            description: 'Strict role-based access controls ensure that only authorized personnel can access sensitive systems.',
            gradient: 'from-teal-500 to-cyan-600'
        },
    ]

    // Security practices
    const securityPractices = [
        {
            title: 'Secure Development',
            items: [
                'Code reviews for all changes',
                'Automated security scanning',
                'Dependency vulnerability monitoring',
                'Secure coding guidelines'
            ]
        },
        {
            title: 'Infrastructure Security',
            items: [
                'Cloud security best practices',
                'Network segmentation',
                'DDoS protection',
                'Intrusion detection systems'
            ]
        },
        {
            title: 'Data Handling',
            items: [
                'Encryption at rest and in transit',
                'Regular data backups',
                'Secure data deletion',
                'Data access logging'
            ]
        },
        {
            title: 'Incident Response',
            items: [
                '24/7 monitoring',
                'Incident response plan',
                'Breach notification procedures',
                'Post-incident analysis'
            ]
        },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-green-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Security - Veefore | How We Protect Your Data"
                description="Learn about Veefore's security practices. We use industry-leading security measures to protect your data and ensure platform safety."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[500vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="green" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[50%] -right-[100px]`} color="blue" />
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
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-6">
                            <Shield className="w-4 h-4 mr-2" />
                            Enterprise-Grade Security
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                    >
                        <span className="text-white">Your Security is Our </span>
                        <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent">
                            Priority
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base md:text-lg text-white/50 max-w-2xl mx-auto"
                    >
                        We take security seriously. Learn about the measures we take to protect your data and ensure the safety of our platform.
                    </motion.p>
                </div>
            </section>

            {/* Security Features */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Security Features
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Industry-leading security measures protect your data at every level
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {securityFeatures.map((feature, i) => (
                            <SecurityFeatureCard key={i} {...feature} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Security Commitment */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-4xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-2xl md:text-4xl font-bold text-white mb-6">
                                Our Security Commitment
                            </h2>
                            <p className="text-white/60 leading-relaxed mb-6">
                                At Veefed Technologies, security isn't an afterthought—it's foundational to everything we build.
                                We understand that you're trusting us with your data and your growth, and we take that responsibility seriously.
                            </p>
                            <p className="text-white/60 leading-relaxed">
                                Our team follows industry best practices and continuously monitors for new threats. We're committed
                                to maintaining the highest standards of security and transparency.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="relative p-8 rounded-3xl bg-gradient-to-br from-green-600/20 via-emerald-600/10 to-teal-600/20 border border-green-500/20"
                        >
                            <div className="text-center">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-4">
                                    <Shield className="w-10 h-10 text-white" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Zero Breaches</h3>
                                <p className="text-white/60 text-sm">
                                    We maintain a strong security record with no data breaches since our founding.
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Security Practices */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Security Practices
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            How we keep your data safe across all areas
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 gap-6">
                        {securityPractices.map((practice, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10"
                            >
                                <h3 className="text-lg font-semibold text-white mb-4">{practice.title}</h3>
                                <ul className="space-y-2">
                                    {practice.items.map((item, j) => (
                                        <li key={j} className="flex items-center gap-2 text-white/60 text-sm">
                                            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Compliance */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Compliance & Standards
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            We adhere to industry standards and best practices
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <ComplianceBadge
                            title="Data Protection Laws"
                            description="Compliant with IT Act 2000 and applicable data protection regulations"
                        />
                        <ComplianceBadge
                            title="Secure Development"
                            description="Following OWASP guidelines for secure software development"
                        />
                        <ComplianceBadge
                            title="Cloud Security"
                            description="Hosted on secure, certified cloud infrastructure"
                        />
                        <ComplianceBadge
                            title="API Security"
                            description="OAuth 2.0 compliant API authentication and authorization"
                        />
                    </div>
                </div>
            </section>

            {/* Report a Vulnerability */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative p-8 md:p-12 rounded-3xl bg-gradient-to-br from-amber-600/20 via-orange-600/20 to-red-600/20 border border-amber-500/20 text-center"
                    >
                        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                            Report a Security Vulnerability
                        </h2>
                        <p className="text-white/60 mb-6 max-w-lg mx-auto">
                            Found a security issue? We appreciate responsible disclosure. Please report any
                            security vulnerabilities to our security team.
                        </p>
                        <a
                            href="mailto:security@veefore.com"
                            className="inline-flex items-center px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-all"
                        >
                            security@veefore.com
                        </a>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <MainFooter />
        </div>
    )
}

export default Security
