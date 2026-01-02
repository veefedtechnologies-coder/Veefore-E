import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Cookie, Shield, Settings, Eye, BarChart3, Megaphone,
    Clock, Lock, Globe, CheckCircle, AlertCircle, ChevronDown,
    ChevronUp, ExternalLink, Mail
} from 'lucide-react';
import { useIsMobile } from '../hooks/use-is-mobile';
import { SEO } from '../lib/seo-optimization';
import { Link } from 'wouter';
import { MainNavigation } from '../components/MainNavigation';
import MainFooter from '../components/MainFooter';

// Gradient Orb Component
const GradientOrb = ({ className, color = 'blue' }: { className?: string, color?: string }) => {
    const isMobile = useIsMobile();
    const colors = {
        blue: isMobile ? 'bg-blue-600/10' : 'from-blue-500/30 via-blue-600/20 to-transparent',
        purple: isMobile ? 'bg-purple-600/10' : 'from-purple-500/30 via-purple-600/20 to-transparent',
        indigo: isMobile ? 'bg-indigo-500/8' : 'from-indigo-500/30 via-indigo-600/20 to-transparent',
    };

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />;
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    );
};

// Expandable Section Component
const ExpandableSection = ({ title, icon: Icon, children, defaultOpen = false }: {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02]"
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-6 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
            >
                <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                        <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                </div>
                {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-white/40" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-white/40" />
                )}
            </button>
            {isOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="px-6 pb-6 text-white/60 text-sm leading-relaxed space-y-4"
                >
                    {children}
                </motion.div>
            )}
        </motion.div>
    );
};

// Cookie Type Card
const CookieTypeCard = ({ icon: Icon, name, duration, description, examples, color }: {
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    duration: string;
    description: string;
    examples: string[];
    color: string;
}) => {
    const colorClasses = {
        blue: 'from-blue-500/20 to-blue-600/10 text-blue-400',
        green: 'from-green-500/20 to-green-600/10 text-green-400',
        orange: 'from-orange-500/20 to-orange-600/10 text-orange-400',
        purple: 'from-purple-500/20 to-purple-600/10 text-purple-400',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all duration-300"
        >
            <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]}`}>
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                    <h4 className="text-lg font-semibold text-white mb-1">{name}</h4>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <Clock className="w-3 h-3" />
                        <span>Duration: {duration}</span>
                    </div>
                </div>
            </div>
            <p className="text-sm text-white/60 mb-4 leading-relaxed">{description}</p>
            <div className="space-y-2">
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Examples:</p>
                <div className="flex flex-wrap gap-2">
                    {examples.map((example, i) => (
                        <span key={i} className="px-3 py-1 rounded-full bg-white/5 text-xs text-white/50">
                            {example}
                        </span>
                    ))}
                </div>
            </div>
        </motion.div>
    );
};

const CookiePolicy = () => {
    const isMobile = useIsMobile();
    const lastUpdated = 'January 2, 2026';

    const cookieTypes = [
        {
            icon: Lock,
            name: 'Essential Cookies',
            duration: 'Session / 1 year',
            description: 'These cookies are strictly necessary for the website to function and cannot be switched off. They are usually set in response to actions made by you such as setting your privacy preferences, logging in, or filling in forms.',
            examples: ['Session ID', 'CSRF Token', 'Authentication', 'Security'],
            color: 'blue',
        },
        {
            icon: BarChart3,
            name: 'Analytics Cookies',
            duration: '2 years',
            description: 'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site. They help us understand which pages are the most and least popular.',
            examples: ['Page Views', 'Session Duration', 'Bounce Rate', 'Traffic Source'],
            color: 'green',
        },
        {
            icon: Megaphone,
            name: 'Marketing Cookies',
            duration: '90 days',
            description: 'These cookies may be set through our site by advertising partners. They may be used by those companies to build a profile of your interests and show you relevant advertisements.',
            examples: ['Ad Targeting', 'Retargeting', 'Conversion Tracking', 'Social Ads'],
            color: 'orange',
        },
        {
            icon: Settings,
            name: 'Preference Cookies',
            duration: '1 year',
            description: 'These cookies enable the website to provide enhanced functionality and personalization. They may be set by us or by third-party providers whose services we have added to our pages.',
            examples: ['Language', 'Theme', 'Region', 'UI Settings'],
            color: 'purple',
        },
    ];

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Cookie Policy - VeeFore | How We Use Cookies"
                description="Learn about how VeeFore uses cookies and similar technologies to enhance your experience, provide security, and analyze our traffic."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[600vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
                <GradientOrb className={`${isMobile ? 'w-[250px] h-[250px]' : 'w-[500px] h-[500px]'} top-[60%] left-[20%]`} color="indigo" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
            </div>

            {/* Navigation */}
            <MainNavigation />

            {/* Hero Section */}
            <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="text-center"
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
                            <Cookie className="w-4 h-4 mr-2" />
                            Cookie Policy
                        </span>

                        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-6">
                            <span className="text-white">How We Use </span>
                            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                Cookies
                            </span>
                        </h1>

                        <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto mb-6">
                            This Cookie Policy explains how VeeFore uses cookies and similar technologies to
                            recognize you when you visit our platform. It explains what these technologies are
                            and why we use them.
                        </p>

                        <div className="flex items-center justify-center gap-4 text-sm text-white/40">
                            <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                Last updated: {lastUpdated}
                            </span>
                            <span className="hidden sm:block">•</span>
                            <span className="hidden sm:flex items-center gap-1">
                                <Shield className="w-4 h-4" />
                                GDPR Compliant
                            </span>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Quick Summary */}
            <section className="py-12 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="p-8 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10"
                    >
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-2.5 rounded-xl bg-blue-500/20">
                                <Eye className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white mb-2">Quick Summary</h2>
                                <p className="text-white/50 text-sm">The key points you need to know:</p>
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {[
                                { icon: CheckCircle, text: 'We use essential cookies for security and functionality' },
                                { icon: CheckCircle, text: 'Analytics cookies help us improve our service' },
                                { icon: CheckCircle, text: 'You can control non-essential cookies at any time' },
                                { icon: CheckCircle, text: 'We never sell your data to third parties' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <item.icon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                                    <span className="text-sm text-white/70">{item.text}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Cookie Types */}
            <section className="py-12 md:py-16 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                            Types of Cookies We Use
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            We use different types of cookies for various purposes
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 gap-6">
                        {cookieTypes.map((cookie, i) => (
                            <CookieTypeCard key={i} {...cookie} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Detailed Sections */}
            <section className="py-12 md:py-16 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-7xl mx-auto space-y-4">
                    <ExpandableSection title="What are Cookies?" icon={Cookie} defaultOpen>
                        <p>
                            Cookies are small text files that are placed on your computer or mobile device when you visit a website.
                            They are widely used to make websites work more efficiently and to provide information to the website owners.
                        </p>
                        <p>
                            Cookies set by the website owner (in this case, VeeFore) are called "first-party cookies."
                            Cookies set by parties other than the website owner are called "third-party cookies."
                        </p>
                    </ExpandableSection>

                    <ExpandableSection title="How to Control Cookies" icon={Settings}>
                        <p>
                            You can control and manage cookies in various ways. Please note that removing or blocking cookies
                            may impact your user experience and some parts of our website may no longer be fully accessible.
                        </p>
                        <div className="mt-4 space-y-3">
                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                                <h4 className="font-medium text-white mb-2">Browser Settings</h4>
                                <p className="text-xs text-white/50">
                                    Most browsers allow you to control cookies through their settings. Look for "Cookies"
                                    or "Privacy" in your browser's settings or preferences menu.
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                                <h4 className="font-medium text-white mb-2">Our Cookie Settings</h4>
                                <p className="text-xs text-white/50">
                                    You can manage your cookie preferences at any time by clicking the cookie settings
                                    in our website footer or contacting us directly.
                                </p>
                            </div>
                        </div>
                    </ExpandableSection>

                    <ExpandableSection title="Third-Party Services" icon={Globe}>
                        <p>
                            We may use third-party services that set their own cookies. These services help us understand
                            how our platform is being used and improve your experience.
                        </p>
                        <div className="mt-4">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-white/60 border-b border-white/10">
                                        <th className="text-left py-2 font-medium">Service</th>
                                        <th className="text-left py-2 font-medium">Purpose</th>
                                        <th className="text-left py-2 font-medium">Privacy Policy</th>
                                    </tr>
                                </thead>
                                <tbody className="text-white/50">
                                    <tr className="border-b border-white/5">
                                        <td className="py-3">Google Analytics</td>
                                        <td className="py-3">Traffic analysis</td>
                                        <td className="py-3">
                                            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                                                View <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </td>
                                    </tr>
                                    <tr className="border-b border-white/5">
                                        <td className="py-3">Firebase</td>
                                        <td className="py-3">Authentication</td>
                                        <td className="py-3">
                                            <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                                                View <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </ExpandableSection>

                    <ExpandableSection title="Your Rights" icon={Shield}>
                        <p>
                            Under GDPR and similar privacy regulations, you have certain rights regarding cookies and your personal data:
                        </p>
                        <ul className="mt-4 space-y-2">
                            {[
                                'The right to be informed about how we use cookies',
                                'The right to access information about what cookies we have set',
                                'The right to request deletion of analytics and marketing cookies',
                                'The right to withdraw consent at any time',
                                'The right to lodge a complaint with a supervisory authority',
                            ].map((right, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>{right}</span>
                                </li>
                            ))}
                        </ul>
                    </ExpandableSection>

                    <ExpandableSection title="Updates to This Policy" icon={AlertCircle}>
                        <p>
                            We may update this Cookie Policy from time to time to reflect changes in our practices or for other
                            operational, legal, or regulatory reasons. When we make changes, we will update the "Last updated"
                            date at the top of this page.
                        </p>
                        <p>
                            We encourage you to review this Cookie Policy periodically to stay informed about our use of cookies.
                        </p>
                    </ExpandableSection>
                </div>
            </section>

            {/* Contact Section */}
            <section className="py-12 md:py-16 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 text-center"
                    >
                        <Mail className="w-10 h-10 text-blue-400 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Questions About Cookies?</h3>
                        <p className="text-white/50 text-sm mb-6 max-w-md mx-auto">
                            If you have any questions about our use of cookies or this Cookie Policy,
                            please don't hesitate to contact us.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <a
                                href="mailto:privacy@veefore.com"
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all"
                            >
                                <Mail className="w-4 h-4" />
                                privacy@veefore.com
                            </a>
                            <Link
                                href="/contact"
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white font-medium transition-all"
                            >
                                Contact Form
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Related Links */}
            <section className="py-12 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-wrap items-center justify-center gap-4">
                        <Link href="/privacy-policy" className="text-sm text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                            Privacy Policy <ExternalLink className="w-3 h-3" />
                        </Link>
                        <span className="text-white/20">•</span>
                        <Link href="/terms-of-service" className="text-sm text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                            Terms of Service <ExternalLink className="w-3 h-3" />
                        </Link>
                        <span className="text-white/20">•</span>
                        <Link href="/gdpr" className="text-sm text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                            GDPR Compliance <ExternalLink className="w-3 h-3" />
                        </Link>
                        <span className="text-white/20">•</span>
                        <Link href="/security" className="text-sm text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                            Security <ExternalLink className="w-3 h-3" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <MainFooter />
        </div>
    );
};

export default CookiePolicy;
