import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
    ArrowRight, Mail, MapPin, Clock, MessageSquare,
    Send, HelpCircle, Twitter, Instagram, Linkedin
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

// Contact Card
const ContactCard = ({ icon: Icon, title, description, action, actionText, gradient }: {
    icon: React.ComponentType<{ className?: string }>,
    title: string,
    description: string,
    action: string,
    actionText: string,
    gradient: string
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all"
    >
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-white/50 text-sm mb-4">{description}</p>
        <a
            href={action}
            className="inline-flex items-center text-blue-400 text-sm font-medium hover:text-blue-300 transition-colors"
        >
            {actionText}
            <ArrowRight className="w-4 h-4 ml-1" />
        </a>
    </motion.div>
)

const Contact = () => {
    const isMobile = useIsMobile()
    const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        // In production, this would send to a backend
        const mailtoLink = `mailto:hello@veefore.com?subject=${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(`Name: ${formData.name}\nEmail: ${formData.email}\n\n${formData.message}`)}`
        window.location.href = mailtoLink
    }

    // Contact options
    const contactOptions = [
        {
            icon: Mail,
            title: 'General Inquiries',
            description: 'For general questions about Veefore and our services.',
            action: 'mailto:hello@veefore.com',
            actionText: 'hello@veefore.com',
            gradient: 'from-blue-500 to-blue-600'
        },
        {
            icon: HelpCircle,
            title: 'Support',
            description: 'Need help with your account or have technical issues?',
            action: 'mailto:support@veefore.com',
            actionText: 'support@veefore.com',
            gradient: 'from-green-500 to-emerald-600'
        },
        {
            icon: MessageSquare,
            title: 'Partnerships',
            description: 'Interested in partnering with us? Let\'s talk.',
            action: 'mailto:partners@veefore.com',
            actionText: 'partners@veefore.com',
            gradient: 'from-purple-500 to-pink-600'
        },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Contact Us - Veefore | Get in Touch"
                description="Have questions about Veefore? Get in touch with our team. We are here to help you grow your audience with AI-powered engagement automation."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[300vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
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
                            <Mail className="w-4 h-4 mr-2" />
                            Get in Touch
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                    >
                        <span className="text-white">We'd Love to </span>
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Hear From You
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base md:text-lg text-white/50 max-w-2xl mx-auto"
                    >
                        Have questions, feedback, or just want to say hello? Our team is here to help.
                    </motion.p>
                </div>
            </section>

            {/* Contact Options */}
            <section className="py-12 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
                    {contactOptions.map((option, i) => (
                        <ContactCard key={i} {...option} />
                    ))}
                </div>
            </section>

            {/* Contact Form & Info */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
                    {/* Contact Form */}
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-2xl font-bold text-white mb-6">Send a Message</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-white/60 mb-2">Your Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-blue-500/50 focus:outline-none transition-colors"
                                    placeholder="John Doe"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-white/60 mb-2">Email Address</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-blue-500/50 focus:outline-none transition-colors"
                                    placeholder="john@example.com"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-white/60 mb-2">Subject</label>
                                <input
                                    type="text"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-blue-500/50 focus:outline-none transition-colors"
                                    placeholder="How can we help?"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-white/60 mb-2">Message</label>
                                <textarea
                                    value={formData.message}
                                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                    rows={5}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-blue-500/50 focus:outline-none transition-colors resize-none"
                                    placeholder="Tell us more..."
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                            >
                                <Send className="w-5 h-5" />
                                Send Message
                            </button>
                        </form>
                    </motion.div>

                    {/* Company Info */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="space-y-8"
                    >
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-6">Our Office</h2>
                            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                                        <MapPin className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white mb-2">Veefed Technologies Pvt. Ltd.</h3>
                                        <p className="text-white/50 text-sm leading-relaxed">
                                            South City, Kargaina<br />
                                            Bareilly, Uttar Pradesh<br />
                                            India - 243001
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-white mb-4">Response Time</h3>
                            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                <Clock className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                                <p className="text-white/60 text-sm">
                                    We typically respond within <span className="text-white font-medium">24-48 hours</span> during business days.
                                </p>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-white mb-4">Follow Us</h3>
                            <div className="flex gap-3">
                                <a href="#" className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                    <Twitter className="w-5 h-5 text-white/60" />
                                </a>
                                <a href="#" className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                    <Instagram className="w-5 h-5 text-white/60" />
                                </a>
                                <a href="#" className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                    <Linkedin className="w-5 h-5 text-white/60" />
                                </a>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <MainFooter />
        </div>
    )
}

export default Contact
