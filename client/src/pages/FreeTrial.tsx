
import { motion } from 'framer-motion'
import {
    ArrowRight, Check, Zap, Gift, Clock, Star,
    Shield, Users, Crown
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
        green: isMobile ? 'bg-green-600/10' : 'from-green-500/30 via-green-600/20 to-transparent',
    }

    if (isMobile) {
        return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
    }

    return (
        <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
    )
}

// Trial Card Component
const TrialCard = ({ type, days, features, badge, gradient, highlight }: {
    type: string,
    days: number,
    features: string[],
    badge?: string,
    gradient: string,
    highlight?: boolean
}) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className={`relative p-8 md:p-10 rounded-3xl border ${highlight ? 'border-green-500/30 ring-2 ring-green-500/20' : 'border-white/10'} bg-gradient-to-br ${gradient}`}
    >
        {badge && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-semibold flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    {badge}
                </span>
            </div>
        )}

        <div className="text-center mb-8">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${highlight ? 'bg-gradient-to-br from-green-500 to-emerald-500' : 'bg-white/10'} mb-4`}>
                {highlight ? <Star className="w-8 h-8 text-white" /> : <Gift className="w-8 h-8 text-white" />}
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{type}</h3>
            <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold text-white">{days}</span>
                <span className="text-white/60">days free</span>
            </div>
        </div>

        <ul className="space-y-4 mb-8">
            {features.map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 mt-0.5 flex-shrink-0 ${highlight ? 'text-green-400' : 'text-blue-400'}`} />
                    <span className="text-white/70">{feature}</span>
                </li>
            ))}
        </ul>

        <Link
            href={highlight ? "/waitlist" : "/signup"}
            className={`block w-full py-4 rounded-xl text-center font-semibold transition-all ${highlight
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-lg hover:shadow-green-500/25'
                : 'bg-white text-black hover:bg-white/90'
                }`}
        >
            {highlight ? 'Join Beta Waitlist' : 'Start Free Trial'}
            <ArrowRight className="w-4 h-4 inline ml-2" />
        </Link>
    </motion.div>
)

const FreeTrial = () => {
    const isMobile = useIsMobile()

    // What's included in trial
    const trialFeatures = [
        { icon: Zap, title: 'Full Feature Access', description: 'Access all Growth plan features during your trial' },
        { icon: Shield, title: 'No Credit Card Required', description: 'Start immediately without payment details' },
        { icon: Users, title: 'Full Support', description: 'Get help from our team whenever you need it' },
        { icon: Clock, title: 'Seamless Upgrade', description: 'Keep all your data when you subscribe' },
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="Free Trial - Veefore | Start Growing Today"
                description="Try Veefore free for 7 days. Beta users get 30 days free! No credit card required. Full access to AI-powered engagement automation."
            />

            {/* Ambient Background */}
            <div className={`${isMobile ? 'absolute h-[250vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
                <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="green" />
                <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
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
                            <Gift className="w-4 h-4 mr-2" />
                            No Credit Card Required
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                    >
                        <span className="text-white">Try Veefore </span>
                        <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent">
                            Completely Free
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base md:text-lg text-white/50 max-w-2xl mx-auto"
                    >
                        Experience the full power of AI-driven growth automation. Start with a free trial and see the results for yourself.
                    </motion.p>
                </div>
            </section>

            {/* Trial Options */}
            <section className="py-12 md:py-16 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">
                    <TrialCard
                        type="Standard Trial"
                        days={7}
                        features={[
                            'Full access to Growth plan features',
                            'AI Comment & DM Automation',
                            'Hook Intelligence & Analytics',
                            '150 AI credits included',
                            'Email support',
                            'Available after launch'
                        ]}
                        gradient="from-slate-500/10 to-slate-600/5"
                    />
                    <TrialCard
                        type="Beta User Trial"
                        days={30}
                        features={[
                            'Everything in Standard Trial',
                            '500 bonus AI credits',
                            'Exclusive beta features',
                            'Priority support',
                            'Shape the product with feedback',
                            'Early access before launch'
                        ]}
                        badge="Limited Time"
                        gradient="from-green-600/20 to-emerald-600/10"
                        highlight={true}
                    />
                </div>
            </section>

            {/* What's Included */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            What's Included in Your Trial
                        </h2>
                        <p className="text-white/50 max-w-xl mx-auto">
                            Get full access to all features during your trial period
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {trialFeatures.map((feature, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
                                    <feature.icon className="w-6 h-6 text-blue-400" />
                                </div>
                                <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                                <p className="text-sm text-white/50">{feature.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Beta CTA */}
            <section className="py-16 md:py-24 px-4 sm:px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative p-10 md:p-14 rounded-3xl bg-gradient-to-br from-green-600/20 via-emerald-600/20 to-teal-600/20 border border-green-500/20 overflow-hidden"
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-gradient-to-b from-green-500/30 to-transparent rounded-full blur-[100px]" />

                        <div className="relative z-10">
                            <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-sm mb-6">
                                <Star className="w-4 h-4 mr-2" />
                                Beta Program
                            </div>
                            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                                Get 30 Days Free as a Beta User
                            </h2>
                            <p className="text-white/60 mb-8 max-w-lg mx-auto">
                                Join our exclusive beta program. Be among the first to experience Veefore and help shape the future of AI-powered growth automation.
                            </p>

                            <Link
                                href="/waitlist"
                                className="inline-flex items-center px-8 py-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold text-lg hover:shadow-lg hover:shadow-green-500/25 transition-all group"
                            >
                                Join Beta Waitlist
                                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Link>

                            <p className="text-white/40 text-sm mt-4">
                                Limited spots available
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

export default FreeTrial
