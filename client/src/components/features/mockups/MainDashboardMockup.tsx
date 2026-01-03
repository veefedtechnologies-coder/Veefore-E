import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, MessageSquare, Users, Bell, Clock, Target, Sparkles, Heart, Eye, Zap } from 'lucide-react';
import { ResponsiveMockupWrapper, MockupAnimationContext } from '../shared/ResponsiveMockupWrapper';

export const MainDashboardMockup = React.memo(() => {
    return (
        <ResponsiveMockupWrapper
            color="blue"
            desktopBorderColor="border-blue-500/20"
            desktopGradient="from-blue-500/30 via-purple-500/20 to-violet-500/30"
        >
            <DashboardContent />
        </ResponsiveMockupWrapper>
    );
});

const DashboardContent = () => {
    const isInView = React.useContext(MockupAnimationContext);

    return (
        <>
            <div className="flex h-full">
                {/* Sidebar - Hidden on mobile, visible on desktop */}
                <div className="hidden md:flex w-16 flex-col items-center py-6 border-r border-white/10 bg-white/[0.02]">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center mb-8">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    {[BarChart3, MessageSquare, Users, Bell, Clock, Target].map((Icon, i) => (
                        <div key={i} className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 cursor-pointer transition-all ${i === 0 ? 'bg-blue-500/20 text-blue-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}>
                            <Icon className="w-5 h-5" />
                        </div>
                    ))}
                </div>

                {/* Main Content */}
                <div className="flex-1 p-6 overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white">Dashboard Overview</h3>
                            <p className="text-xs text-white/50">Welcome back! Here's your growth summary.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                                All Systems Operational
                            </div>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                V
                            </div>
                        </div>
                    </div>

                    {/* Metric Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                        {[
                            { label: 'Total Followers', value: '24.5K', change: '+12.3%', icon: Users, color: 'blue' },
                            { label: 'Engagement', value: '8.7%', change: '+2.1%', icon: Heart, color: 'pink' },
                            { label: 'Comments', value: '847', change: '+34%', icon: MessageSquare, color: 'purple' },
                            { label: 'Reach', value: '156K', change: '+18%', icon: Eye, color: 'green' },
                        ].map((metric, i) => (

                            <motion.div
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="p-4 rounded-xl bg-white/[0.03] border border-white/5"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <metric.icon className={`w-4 h-4 ${metric.color === 'blue' ? 'text-blue-400' : metric.color === 'pink' ? 'text-pink-400' : metric.color === 'purple' ? 'text-purple-400' : 'text-green-400'}`} />
                                    <span className="text-xs text-green-400">{metric.change}</span>
                                </div>
                                <div className="text-xl font-bold text-white">{metric.value}</div>
                                <div className="text-xs text-white/50">{metric.label}</div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Main Grid */}
                    <div className="grid gap-4 lg:grid-cols-3">
                        {/* Chart Area */}
                        <div className="lg:col-span-2 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-medium text-white">Growth Overview</h4>
                                <div className="flex gap-2">
                                    <span className="text-[10px] px-2 py-1 rounded bg-blue-500/20 text-blue-400">7D</span>
                                    <span className="hidden md:inline text-[10px] px-2 py-1 rounded bg-white/5 text-white/40">30D</span>
                                    <span className="hidden md:inline text-[10px] px-2 py-1 rounded bg-white/5 text-white/40">90D</span>
                                </div>
                            </div>
                            {/* Mini Chart */}
                            <div className="flex items-end justify-between h-32 gap-1">
                                {[40, 55, 45, 70, 65, 80, 75, 90, 85, 95, 88, 100].map((h, i) => (

                                    <motion.div
                                        key={i}
                                        initial={{ scaleY: 0 }}
                                        animate={isInView ? { scaleY: h / 100 } : { scaleY: 0 }}
                                        transition={{ delay: i * 0.05, duration: 0.4 }}
                                        style={{ originY: 1 }}
                                        className={`flex-1 h-full bg-gradient-to-t from-blue-500 to-purple-500 rounded-t opacity-70 ${i >= 8 ? 'hidden md:block' : ''}`}
                                    >
                                        <div style={{ height: '100%' }} />
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Activity Feed */}
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                            <h4 className="text-sm font-medium text-white mb-3">Recent Activity</h4>
                            <div className="space-y-3">
                                {[
                                    { text: 'New follower milestone: 24K', time: '2m ago', icon: Users },
                                    { text: 'AI replied to 5 comments', time: '15m ago', icon: MessageSquare },
                                    { text: 'Automation triggered', time: '1h ago', icon: Zap },
                                    { text: 'Post scheduled', time: '2h ago', icon: Clock },
                                ].map((activity, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                            <activity.icon className="w-3 h-3 text-blue-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white/70 truncate">{activity.text}</p>
                                            <p className="text-[10px] text-white/30">{activity.time}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="grid gap-4 mt-4 md:grid-cols-2">
                        {/* Goals */}
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                            <h4 className="text-sm font-medium text-white mb-3">Monthly Goals</h4>
                            <div className="space-y-3">
                                {[
                                    { goal: 'Reach 25K followers', progress: 98, target: '24.5K / 25K' },
                                    { goal: '5% engagement rate', progress: 100, target: '8.7% ✓' },
                                    { goal: 'Post 30 times', progress: 73, target: '22 / 30' },
                                ].map((item, i) => (
                                    <div key={i}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-white/70">{item.goal}</span>
                                            <span className="text-white/40">{item.target}</span>
                                        </div>
                                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">

                                            <motion.div
                                                initial={{ scaleX: 0 }}
                                                animate={isInView ? { scaleX: item.progress / 100 } : { scaleX: 0 }}
                                                transition={{ delay: i * 0.1, duration: 0.5 }}
                                                style={{ originX: 0, height: '100%', width: '100%' }}
                                                className={`rounded-full ${item.progress >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 to-purple-500'}`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Automations Status */}
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                            <h4 className="text-sm font-medium text-white mb-3">Active Automations</h4>
                            <div className="space-y-2">
                                {[
                                    { name: 'Comment Auto-Reply', status: 'active', runs: '247 today' },
                                    { name: 'DM Responder', status: 'active', runs: '89 today' },
                                    { name: 'Welcome Messages', status: 'active', runs: '34 today' },
                                ].map((auto, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                            <span className="text-xs text-white">{auto.name}</span>
                                        </div>
                                        <span className="text-[10px] text-white/40">{auto.runs}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default MainDashboardMockup;
