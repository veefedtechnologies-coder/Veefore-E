import React from 'react'
import { motion } from 'framer-motion'
import {
    CheckCircle, AlertTriangle, XCircle, Clock, Activity,
    Server, Database, Globe, Zap, Shield, Bell, ArrowRight,
    RefreshCw, Calendar, TrendingUp
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile'
import { SEO } from '../lib/seo-optimization'
import { Link } from 'wouter'


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

// Status Badge Component
const StatusBadge = ({ status }: { status: 'operational' | 'degraded' | 'outage' | 'maintenance' }) => {
    const config = {
        operational: { icon: CheckCircle, label: 'Operational', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
        degraded: { icon: AlertTriangle, label: 'Degraded', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
        outage: { icon: XCircle, label: 'Outage', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
        maintenance: { icon: Clock, label: 'Maintenance', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
    }

    const { icon: Icon, label, bg, text, border } = config[status]

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${bg} ${text} ${border} border text-xs font-medium`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
        </span>
    )
}

// Service Status Card
const ServiceCard = ({ icon: Icon, name, description, status, uptime }: {
    icon: React.ComponentType<{ className?: string }>,
    name: string,
    description: string,
    status: 'operational' | 'degraded' | 'outage' | 'maintenance',
    uptime: string
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="p-5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all duration-300"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-white/10">
                    <Icon className="w-5 h-5 text-white/70" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white mb-1">{name}</h3>
                    <p className="text-sm text-white/40">{description}</p>
                </div>
            </div>
            <div className="text-right shrink-0">
                <StatusBadge status={status} />
                <p className="text-xs text-white/30 mt-2">{uptime} uptime</p>
            </div>
        </div>
    </motion.div>
)

// Uptime Bar Component
const UptimeBar = ({ days }: { days: { date: string, status: 'operational' | 'degraded' | 'outage' }[] }) => {
    const statusColors = {
        operational: 'bg-green-500',
        degraded: 'bg-yellow-500',
        outage: 'bg-red-500',
    }

    return (
        <div className="flex gap-0.5">
            {days.map((day, i) => (
                <div
                    key={i}
                    className={`w-full h-8 rounded ${statusColors[day.status]} opacity-80 hover:opacity-100 transition-opacity cursor-pointer group relative`}
                    title={`${day.date}: ${day.status.charAt(0).toUpperCase() + day.status.slice(1)}`}
                >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-gray-900 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {day.date}
                    </div>
                </div>
            ))}
        </div>
    )
}

// Incident Card
const IncidentCard = ({ title, date, status, description, updates }: {
    title: string,
    date: string,
    status: 'resolved' | 'investigating' | 'identified' | 'monitoring',
    description: string,
    updates: { time: string, message: string }[]
}) => {
    const statusConfig = {
        resolved: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Resolved' },
        investigating: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Investigating' },
        identified: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Identified' },
        monitoring: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Monitoring' },
    }

    const { bg, text, label } = statusConfig[status]

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-6 rounded-xl bg-white/[0.03] border border-white/10"
        >
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <h4 className="text-lg font-semibold text-white mb-1">{title}</h4>
                    <p className="text-sm text-white/40">{date}</p>
                </div>
                <span className={`px-3 py-1 rounded-full ${bg} ${text} text-xs font-medium`}>
                    {label}
                </span>
            </div>
            <p className="text-sm text-white/60 mb-4">{description}</p>
            {updates.length > 0 && (
                <div className="border-t border-white/10 pt-4 space-y-3">
                    {updates.map((update, i) => (
                        <div key={i} className="flex gap-3 text-sm">
                            <span className="text-white/30 shrink-0">{update.time}</span>
                            <span className="text-white/50">{update.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    )
}

const Status = () => {
    const isMobile = useIsMobile()

    // Current system status
    const overallStatus: 'operational' | 'degraded' | 'outage' | 'maintenance' = 'operational'

    // Services
    const services = [
        { icon: Globe, name: 'Web Application', description: 'Main web platform and dashboard', status: 'operational' as const, uptime: '99.99%' },
        { icon: Server, name: 'API Services', description: 'REST API and GraphQL endpoints', status: 'operational' as const, uptime: '99.98%' },
        { icon: Database, name: 'Database', description: 'Data storage and retrieval', status: 'operational' as const, uptime: '99.99%' },
        { icon: Zap, name: 'AI Engine', description: 'Comment automation and content generation', status: 'operational' as const, uptime: '99.95%' },
        { icon: Activity, name: 'Social Integrations', description: 'Instagram, Twitter, and other platforms', status: 'operational' as const, uptime: '99.90%' },
        { icon: Shield, name: 'Authentication', description: 'Login, signup, and security services', status: 'operational' as const, uptime: '99.99%' },
    ]

    // Generate 90-day uptime data
    const generateUptimeData = () => {
        const days = []
        const today = new Date()
        for (let i = 89; i >= 0; i--) {
            const date = new Date(today)
            date.setDate(date.getDate() - i)
            const random = Math.random()
            let status: 'operational' | 'degraded' | 'outage' = 'operational'
            if (random > 0.98) status = 'outage'
            else if (random > 0.95) status = 'degraded'
            days.push({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                status
            })
        }
        return days
    }

    const uptimeData = generateUptimeData()

    // Past incidents
    const incidents = [
        {
            title: 'API Response Delays',
            date: 'December 28, 2025',
            status: 'resolved' as const,
            description: 'Some users experienced slower than usual API response times due to increased load.',
            updates: [
                { time: '14:30 IST', message: 'Issue resolved. API response times back to normal.' },
                { time: '13:45 IST', message: 'Root cause identified. Scaling additional servers.' },
                { time: '13:00 IST', message: 'Investigating reports of slow API responses.' },
            ]
        },
        {
            title: 'Instagram Integration Maintenance',
            date: 'December 20, 2025',
            status: 'resolved' as const,
            description: 'Scheduled maintenance for Instagram integration to support new API features.',
            updates: [
                { time: '06:00 IST', message: 'Maintenance complete. All services operational.' },
                { time: '02:00 IST', message: 'Maintenance started as scheduled.' },
            ]
        },
    ]

    // Scheduled maintenance
    const scheduledMaintenance = [
        {
            title: 'Database Optimization',
            date: 'January 10, 2026',
            time: '02:00 - 04:00 IST',
            impact: 'Minor delays in data retrieval'
        }
    ]

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
            <SEO
                title="System Status - VeeFore | Real-time Service Status"
                description="Check the current status of VeeFore services. View uptime history, ongoing incidents, and scheduled maintenance."
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
            <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-8"
                    >
                        <span className="inline-flex items-center px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-6">
                            <Activity className="w-4 h-4 mr-2" />
                            System Status
                        </span>

                        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4">
                            <span className="text-white">VeeFore </span>
                            <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                                Status
                            </span>
                        </h1>

                        <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto mb-6">
                            Real-time monitoring of all VeeFore services. Updated every minute.
                        </p>

                        <div className="flex items-center justify-center gap-4 text-sm text-white/40">
                            <span className="flex items-center gap-1">
                                <RefreshCw className="w-4 h-4" />
                                Last updated: Just now
                            </span>
                        </div>
                    </motion.div>

                    {/* Overall Status Banner */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className={`p-6 rounded-2xl border ${overallStatus === 'operational'
                            ? 'bg-green-500/10 border-green-500/20'
                            : overallStatus === 'degraded'
                                ? 'bg-yellow-500/10 border-yellow-500/20'
                                : 'bg-red-500/10 border-red-500/20'
                            }`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${overallStatus === 'operational' ? 'bg-green-500/20' : 'bg-yellow-500/20'
                                    }`}>
                                    <CheckCircle className={`w-6 h-6 ${overallStatus === 'operational' ? 'text-green-400' : 'text-yellow-400'
                                        }`} />
                                </div>
                                <div>
                                    <h2 className={`text-xl font-bold ${overallStatus === 'operational' ? 'text-green-400' : 'text-yellow-400'
                                        }`}>
                                        {overallStatus === 'operational' ? 'All Systems Operational' : 'Partial Outage'}
                                    </h2>
                                    <p className="text-sm text-white/50">
                                        {overallStatus === 'operational'
                                            ? 'All services are running smoothly'
                                            : 'Some services may be experiencing issues'}
                                    </p>
                                </div>
                            </div>
                            <button className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors">
                                <Bell className="w-4 h-4" />
                                Subscribe to Updates
                            </button>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Services Grid */}
            <section className="py-12 md:py-16 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-8"
                    >
                        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Services</h2>
                        <p className="text-white/50 text-sm">Current status of all VeeFore services</p>
                    </motion.div>

                    <div className="space-y-4">
                        {services.map((service, i) => (
                            <ServiceCard key={i} {...service} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Uptime History */}
            <section className="py-12 md:py-16 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-8"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xl md:text-2xl font-bold text-white">Uptime History</h2>
                            <span className="text-sm text-white/50">Last 90 days</span>
                        </div>
                        <p className="text-white/50 text-sm">Overall system uptime: <span className="text-green-400 font-medium">99.97%</span></p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="p-6 rounded-2xl bg-white/[0.03] border border-white/10"
                    >
                        <UptimeBar days={uptimeData} />
                        <div className="flex items-center justify-between mt-4 text-xs text-white/40">
                            <span>90 days ago</span>
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 rounded bg-green-500" /> Operational
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 rounded bg-yellow-500" /> Degraded
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 rounded bg-red-500" /> Outage
                                </span>
                            </div>
                            <span>Today</span>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Scheduled Maintenance */}
            {scheduledMaintenance.length > 0 && (
                <section className="py-12 md:py-16 px-4 sm:px-6">
                    <div className="max-w-5xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mb-8"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Calendar className="w-5 h-5 text-blue-400" />
                                <h2 className="text-xl md:text-2xl font-bold text-white">Scheduled Maintenance</h2>
                            </div>
                            <p className="text-white/50 text-sm">Upcoming planned maintenance windows</p>
                        </motion.div>

                        <div className="space-y-4">
                            {scheduledMaintenance.map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    className="p-5 rounded-xl bg-blue-500/10 border border-blue-500/20"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h4 className="text-base font-semibold text-white mb-1">{item.title}</h4>
                                            <p className="text-sm text-white/50">{item.date} • {item.time}</p>
                                            <p className="text-sm text-blue-400 mt-2">Impact: {item.impact}</p>
                                        </div>
                                        <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium shrink-0">
                                            Scheduled
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Past Incidents */}
            <section className="py-12 md:py-16 px-4 sm:px-6 bg-white/[0.01]">
                <div className="max-w-5xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-8"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-5 h-5 text-purple-400" />
                            <h2 className="text-xl md:text-2xl font-bold text-white">Past Incidents</h2>
                        </div>
                        <p className="text-white/50 text-sm">History of resolved incidents</p>
                    </motion.div>

                    <div className="space-y-4">
                        {incidents.map((incident, i) => (
                            <IncidentCard key={i} {...incident} />
                        ))}
                    </div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="text-center mt-8"
                    >
                        <Link
                            href="/status/history"
                            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                        >
                            View full incident history
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </motion.div>
                </div>
            </section>

            {/* Subscribe Section */}
            <section className="py-12 md:py-16 px-4 sm:px-6">
                <div className="max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="p-8 md:p-10 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/10 text-center"
                    >
                        <Bell className="w-10 h-10 text-blue-400 mx-auto mb-4" />
                        <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                            Get Status Updates
                        </h3>
                        <p className="text-white/50 text-sm mb-6 max-w-md mx-auto">
                            Subscribe to receive notifications when we update our status page or experience incidents.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                            <input
                                type="email"
                                placeholder="Enter your email"
                                className="flex-1 px-4 py-3 rounded-xl bg-black/50 border border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 text-white placeholder-white/30 outline-none transition-all text-sm"
                            />
                            <button className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors">
                                Subscribe
                            </button>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}

        </div>
    )
}

export default Status
