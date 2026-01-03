import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { ResponsiveMockupWrapper, MockupAnimationContext } from '../shared/ResponsiveMockupWrapper';

export const AnalyticsDashboardMockup = React.memo(() => {
    // Note: We access context inside the child component, but ResponsiveMockupWrapper renders children.
    // However, the children passed to wrapper are NOT inside the provider yet in the parent's scope.
    // Wait, this is a problem. 
    // ResponsiveMockupWrapper usage:
    // <ResponsiveMockupWrapper>{children}</ResponsiveMockupWrapper>
    // The `children` are instantiated in the Parent (AnalyticsDashboardMockup).
    // The Parent is NOT inside the Provider. The Provider is inside ResponsiveMockupWrapper.
    // So `useContext` here will NOT work.

    // I need to refactor. The content of the mockup needs to be a separate component or 
    // ResponsiveMockupWrapper should accept a render prop?
    // Or I move the content into a sub-component defined here?

    // Let's refactor `AnalyticsDashboardMockup` to have a `Content` component.
    return (
        <ResponsiveMockupWrapper
            color="green"
            desktopBorderColor="border-green-500/20"
            desktopGradient="from-green-500/30 via-emerald-500/20 to-teal-500/30"
        >
            <DashboardContent />
        </ResponsiveMockupWrapper>
    );
});

const DashboardContent = () => {
    const isInView = React.useContext(MockupAnimationContext);

    return (
        <>
            {/* Dashboard Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-green-600/10 to-emerald-600/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Analytics Dashboard</h3>
                        <p className="text-xs text-white/50">Last updated: Just now</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        Live
                    </div>
                    <span className="hidden md:inline text-xs text-white/40">Last 30 days</span>
                </div>
            </div>

            {/* Dashboard Content */}
            <div className="p-6">
                {/* Top Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Total Followers', value: '24,847', change: '+12.3%', up: true },
                        { label: 'Engagement Rate', value: '8.7%', change: '+2.1%', up: true },
                        { label: 'Avg. Reach', value: '45.2K', change: '+18.5%', up: true },
                        { label: 'Profile Visits', value: '3,521', change: '-3.2%', up: false },
                    ].map((stat, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0 }}

                            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="p-4 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                            <div className="text-xs text-white/50 mb-1">{stat.label}</div>
                            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                            <div className={`text-xs font-medium ${stat.up ? 'text-green-400' : 'text-red-400'} `}>
                                {stat.up ? '↑' : '↓'} {stat.change}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Chart Area */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {/* Main Chart */}
                    <div className="lg:col-span-2 p-5 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-medium text-white">Engagement Over Time</h4>
                            <div className="flex gap-2">
                                <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">Likes</span>
                                <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">Comments</span>
                            </div>
                        </div>
                        {/* Animated Chart Bars */}
                        <div className="flex items-end justify-between h-44 gap-2">
                            {[35, 52, 45, 68, 55, 72, 48, 85, 62, 78, 55, 92, 68, 88].map((h, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ scaleY: 0 }}

                                    animate={isInView ? { scaleY: h / 100 } : { scaleY: 0 }}
                                    transition={{ delay: i * 0.05, duration: 0.5 }}
                                    style={{ originY: 1 }}
                                    className={`flex-1 h-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t relative group ${i >= 8 ? 'hidden md:block' : ''}`}
                                >
                                    <div style={{ height: '100%' }} />
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white bg-black/50 px-1 rounded">
                                        {h * 12}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        <div className="hidden md:flex justify-between mt-2 text-[10px] text-white/30">
                            {['Jan 1', 'Jan 7', 'Jan 14', 'Jan 21', 'Jan 28'].map((d, i) => (
                                <span key={i}>{d}</span>
                            ))}
                        </div>
                    </div>

                    {/* Best Posting Times */}
                    <div className="p-5 rounded-xl bg-white/[0.02] border border-white/5">
                        <h4 className="font-medium text-white mb-4">Best Posting Times</h4>
                        <div className="space-y-3">
                            {[
                                { day: 'Tuesday', time: '6:00 PM', engagement: '92%' },
                                { day: 'Thursday', time: '12:00 PM', engagement: '87%' },
                                { day: 'Saturday', time: '10:00 AM', engagement: '84%' },
                                { day: 'Friday', time: '7:00 PM', engagement: '79%' },
                            ].map((slot, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: 10 }}

                                    animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]"
                                >
                                    <div>
                                        <div className="text-sm text-white">{slot.day}</div>
                                        <div className="text-xs text-white/50">{slot.time}</div>
                                    </div>
                                    <div className="text-sm font-semibold text-green-400">{slot.engagement}</div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>


        </>
    );
};

export default AnalyticsDashboardMockup;
