import React from 'react'
import { motion } from 'framer-motion'
import {
    Shield, Globe, UserCheck, FileText, Trash2,
    Download, AlertCircle, CheckCircle, Mail
} from 'lucide-react'
import { MainNavigation } from '../components/MainNavigation'
import { useIsMobile } from '../hooks/use-is-mobile';
import { SEO } from '../lib/seo-optimization'
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

// Right Card
const RightCard = ({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>, title: string, description: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="flex gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/10"
    >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-blue-400" />
        </div>
        <div>
            <h3 className="font-semibold text-white mb-1">{title}</h3>
            <p className="text-white/50 text-sm leading-relaxed">{description}</p>
        </div>
    </motion.div>
)

// Section Component
const GDPRSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-10"
    >
        <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
        <div className="text-white/60 leading-relaxed space-y-4">
            {children}
        </div>
    </motion.div>
)

const GDPR = () => {
    const isMobile = useIsMobile()


    // Your rights under GDPR
    const gdprRights = [
        {
            icon: FileText,
            title: 'Right to Access',
            description: 'Request a copy of all personal data we hold about you.'
        },
        {
            icon: UserCheck,
            title: 'Right to Rectification',
            description: 'Request correction of inaccurate or incomplete personal data.'
        },
        {
            icon: Trash2,
            title: 'Right to Erasure',
            description: 'Request deletion of your personal data ("Right to be Forgotten").'
        },
        {
            icon: AlertCircle,
            title: 'Right to Restriction',
            description: 'Request restriction of processing of your personal data.'
        },
        {
            icon: Download,
            title: 'Right to Data Portability',
            description: 'Receive your data in a machine-readable format.'
        },
        {
            icon: Shield,
            title: 'Right to Object',
            description: 'Object to processing of your personal data for certain purposes.'
        },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="GDPR Compliance - Veefore | Data Protection"
                description="Learn about Veefore's GDPR compliance. We are committed to protecting your data rights under the General Data Protection Regulation."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[500vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[50%] -right-[100px]`} color="purple" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Navigation */}
            {/* Navigation */}
            <MainNavigation />

            {/* Hero Section */}
            <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
                            <Globe className="w-4 h-4 mr-2" />
                            Data Protection
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                    >
                        <span className="text-white">GDPR </span>
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Compliance
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto"
                    >
                        We are committed to protecting your privacy and ensuring compliance with the General Data Protection Regulation (GDPR) for our European users.
                    </motion.p>
                </div>
            </section>

            {/* GDPR Overview */}
            <section className="py-12 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="p-6 md:p-8 rounded-2xl bg-gradient-to-br from-blue-600/20 via-purple-600/10 to-pink-600/20 border border-white/10"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                <Shield className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white mb-2">Our Commitment</h2>
                                <p className="text-white/60 leading-relaxed">
                                    Veefore, a product of Veefed Technologies Private Limited, is committed to complying with GDPR
                                    and other applicable data protection laws. We respect your privacy rights and ensure that your
                                    personal data is processed lawfully, fairly, and transparently.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Your Rights */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Your Rights Under GDPR
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            As a data subject, you have the following rights regarding your personal data
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-4">
                        {gdprRights.map((right, i) => (
                            <RightCard key={i} {...right} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Data Processing Information */}
            <section className="py-16 md:py-24 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            How We Process Your Data
                        </h2>
                    </motion.div>

                    <GDPRSection title="Lawful Basis for Processing">
                        <p>We process your personal data based on the following lawful bases:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-4">
                            <li><strong className="text-white">Consent:</strong> When you explicitly agree to the processing of your data for specific purposes.</li>
                            <li><strong className="text-white">Contract:</strong> When processing is necessary to fulfill our contractual obligations to you.</li>
                            <li><strong className="text-white">Legitimate Interest:</strong> When we have a legitimate business interest that doesn't override your rights.</li>
                            <li><strong className="text-white">Legal Obligation:</strong> When we are required by law to process certain data.</li>
                        </ul>
                    </GDPRSection>

                    <GDPRSection title="Data We Collect">
                        <p>We collect and process the following categories of personal data:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-4">
                            <li><strong className="text-white">Identity Data:</strong> Name, username, email address</li>
                            <li><strong className="text-white">Account Data:</strong> Login credentials (encrypted), account preferences</li>
                            <li><strong className="text-white">Technical Data:</strong> IP address, browser type, device information</li>
                            <li><strong className="text-white">Usage Data:</strong> How you interact with our Services</li>
                            <li><strong className="text-white">Social Media Data:</strong> Data from connected social accounts (with your consent)</li>
                        </ul>
                    </GDPRSection>

                    <GDPRSection title="Data Retention">
                        <p>
                            We retain your personal data only for as long as necessary to fulfill the purposes for which
                            it was collected, including legal, accounting, or reporting requirements. When data is no
                            longer needed, it is securely deleted or anonymized.
                        </p>
                        <p className="mt-4">
                            Account data is retained while your account is active. Upon account deletion, we delete or
                            anonymize your data within 30 days, unless legally required to retain it longer.
                        </p>
                    </GDPRSection>

                    <GDPRSection title="International Data Transfers">
                        <p>
                            If we transfer your data outside the European Economic Area (EEA), we ensure appropriate
                            safeguards are in place, such as:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 mt-4">
                            <li>Standard Contractual Clauses approved by the European Commission</li>
                            <li>Transfers to countries with adequate data protection laws</li>
                            <li>Other appropriate safeguards as required by GDPR</li>
                        </ul>
                    </GDPRSection>
                </div>
            </section>

            {/* Data Protection Officer */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            Exercise Your Rights
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            To exercise any of your GDPR rights, please contact our Data Protection team
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="p-8 rounded-3xl bg-white/[0.03] border border-white/10"
                    >
                        <div className="grid md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <Mail className="w-5 h-5 text-blue-400" />
                                    Contact Information
                                </h3>
                                <div className="space-y-3 text-white/60">
                                    <p><strong className="text-white/80">Data Protection Officer</strong></p>
                                    <p>Veefed Technologies Private Limited</p>
                                    <p>South City, Kargaina<br />Bareilly, Uttar Pradesh<br />India - 243001</p>
                                    <p className="pt-2">
                                        <strong className="text-white/80">Email:</strong>{' '}
                                        <a href="mailto:privacy@veefore.com" className="text-blue-400 hover:underline">privacy@veefore.com</a>
                                    </p>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-400" />
                                    What to Include
                                </h3>
                                <ul className="space-y-2 text-white/60">
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-1" />
                                        Your full name and email address
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-1" />
                                        The specific right you wish to exercise
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-1" />
                                        Any relevant details or documentation
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-1" />
                                        Proof of identity (if required)
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/10">
                            <p className="text-white/50 text-sm">
                                We will respond to your request within <strong className="text-white">30 days</strong>.
                                In complex cases, we may extend this by an additional 60 days with prior notice.
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Supervisory Authority */}
            <section className="py-12 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center"
                    >
                        <h3 className="text-lg font-bold text-white mb-2">Right to Lodge a Complaint</h3>
                        <p className="text-white/60 text-sm">
                            If you are unsatisfied with our response or believe we are processing your data unlawfully,
                            you have the right to lodge a complaint with your local data protection supervisory authority.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <MainFooter />
        </div>
    )
}

export default GDPR
