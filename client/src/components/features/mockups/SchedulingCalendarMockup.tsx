import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Instagram } from 'lucide-react';
import { ResponsiveMockupWrapper, MockupAnimationContext } from '../shared/ResponsiveMockupWrapper';

export const SchedulingCalendarMockup = React.memo(() => {
    return (
        <ResponsiveMockupWrapper
            color="rose"
            desktopBorderColor="border-rose-500/20"
            desktopGradient="from-rose-500/30 via-pink-500/20 to-red-500/30"
            desktopClassName="grid lg:grid-cols-3 gap-8 mb-16"
        >
            <SchedulingContent />
        </ResponsiveMockupWrapper>
    );
});

const SchedulingContent = () => {
    const isInView = React.useContext(MockupAnimationContext);

    return (
        <>
            {/* Calendar View */}
            <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
                className="w-full mb-8 lg:mb-0 lg:col-span-2"
            >
                <div>
                    <div className={`relative rounded-2xl overflow-hidden border border-rose-500/20 bg-[#0a0a0a] shadow-2xl`}>
                        {/* Calendar Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                    <ChevronLeft className="w-4 h-4 text-white/50" />
                                </button>
                                <h3 className="font-semibold text-white">January 2026</h3>
                                <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                    <ChevronRight className="w-4 h-4 text-white/50" />
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-xs px-2 py-1 rounded bg-rose-500/20 text-rose-400">Week View</span>
                                <span className="hidden md:inline-block text-xs px-2 py-1 rounded bg-white/5 text-white/50">Month View</span>
                            </div>
                        </div>

                        {/* Calendar Grid */}
                        <div className="p-4">
                            {/* Days Header */}
                            <div className="grid grid-cols-7 gap-2 mb-2">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                                    <div key={i} className="text-center text-xs text-white/40 py-2">
                                        <span className="md:hidden">{day.charAt(0)}</span>
                                        <span className="hidden md:inline">{day}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Calendar Days */}
                            <div className="grid grid-cols-7 gap-2">
                                {Array.from({ length: 35 }, (_, i) => {
                                    const day = i - 3 // Start from Wednesday (offset)
                                    const hasPost = [3, 5, 8, 12, 15, 19, 22, 26].includes(i)
                                    const isOptimal = [5, 12, 19, 26].includes(i) // Tuesdays
                                    const isToday = i === 15

                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0 }}
                                            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                                            transition={{ delay: i * 0.01 }}
                                            className={`aspect-square rounded-lg flex flex-col items-center justify-center relative cursor-pointer transition-colors ${day < 1 || day > 31 ? 'opacity-30' :
                                                isToday ? 'bg-rose-500 text-white' :
                                                    isOptimal ? 'bg-rose-500/20 border border-rose-500/30' :
                                                        'bg-white/[0.02] hover:bg-white/[0.05]'
                                                } `}
                                        >
                                            <span className={`text-sm ${isToday ? 'font-bold' : 'text-white/70'} `}>
                                                {day > 0 && day <= 31 ? day : ''}
                                            </span>
                                            {hasPost && day > 0 && day <= 31 && (
                                                <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isOptimal ? 'bg-green-400' : 'bg-rose-400'} `} />
                                            )}
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Scheduled Posts Preview */}
                        <div className="px-4 pb-4 space-y-2">
                            <div className="text-xs text-white/40 mb-2">Scheduled for Today</div>
                            {[
                                { time: '6:00 PM', title: 'Behind the scenes reel', type: 'Reel', optimal: true },
                                { time: '8:30 PM', title: 'Product showcase carousel', type: 'Carousel', optimal: false },
                            ].map((post, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0 }}
                                    animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                                        <Instagram className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm text-white truncate max-w-[120px]">{post.title}</div>
                                        <div className="text-xs text-white/50">{post.time} • {post.type}</div>
                                    </div>
                                    {post.optimal && (
                                        <span className="text-[10px] px-2 py-1 rounded bg-green-500/20 text-green-400">Optimal</span>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Content Queue */}
            <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
                transition={{ delay: 0.2 }}
                className="w-full"
            >
                <div className="relative h-full">
                    {/* Background blur only on desktop */}
                    <div className="hidden md:block absolute inset-0 bg-gradient-to-br from-pink-500/30 via-rose-500/20 to-red-500/30 blur-3xl" />

                    <div className="relative rounded-2xl overflow-hidden border border-pink-500/20 bg-[#0a0a0a] shadow-2xl h-full">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                            <h3 className="font-semibold text-white">Content Queue</h3>
                            <span className="text-xs px-2 py-1 rounded-full bg-rose-500/20 text-rose-400">12 drafts</span>
                        </div>

                        <div className="p-4 space-y-3">
                            {[
                                { title: 'Morning motivation post', status: 'ready', time: 'Tomorrow 7:00 AM' },
                                { title: 'Tutorial: Quick tips', status: 'ready', time: 'Wed 6:00 PM' },
                                { title: 'Weekly Q&A story', status: 'draft', time: 'Thu 12:00 PM' },
                                { title: 'Product launch teaser', status: 'review', time: 'Fri 5:00 PM' },
                                { title: 'Weekend vibes reel', status: 'ready', time: 'Sat 10:00 AM' },
                            ].map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-rose-500/30 transition-colors cursor-grab"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm text-white truncate">{item.title}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                                            item.status === 'review' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-white/10 text-white/50'
                                            } `}>
                                            {item.status}
                                        </span>
                                    </div>
                                    <div className="text-xs text-white/40">{item.time}</div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="px-4 pb-4">
                            <button className="w-full py-2 rounded-xl border border-dashed border-rose-500/30 text-rose-400 text-sm hover:bg-rose-500/10 transition-colors">
                                + Add to Queue
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </>
    );
};

export default SchedulingCalendarMockup;


