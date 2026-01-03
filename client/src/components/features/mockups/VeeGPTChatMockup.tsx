import React from 'react';
import { motion } from 'framer-motion';
import { Bot, Sparkles, CheckCircle, RefreshCw, Clock } from 'lucide-react';
import { ResponsiveMockupWrapper, MockupAnimationContext } from '../shared/ResponsiveMockupWrapper';

const Header = ({ showActive = true }: { showActive?: boolean }) => (
    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
                <div className="font-semibold text-white flex items-center gap-2">
                    VeeGPT
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-500/20 text-green-400 font-medium">AI Agent</span>
                </div>
                <div className="text-xs text-white/50">Your growth assistant</div>
            </div>
        </div>
        {showActive && (
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400">Active</span>
            </div>
        )}
    </div>
);

const Messages = ({ hasMaxHeight = false }: { hasMaxHeight?: boolean }) => {
    const isInView = React.useContext(MockupAnimationContext);

    return (
        <div className={`p-5 space-y-4 ${hasMaxHeight ? 'max-h-80 overflow-y-auto' : ''}`}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                className="flex justify-end"
            >
                <div className="max-w-[85%] p-4 rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                    <p className="text-sm">Analyze my last 10 posts and tell me what's working</p>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ delay: 0.2 }}
                className="flex justify-start"
            >
                <div className="max-w-[100%] p-4 rounded-2xl rounded-tl-sm bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs text-cyan-400 font-medium">Analyzing with GPT-4o</span>
                    </div>
                    <p className="text-sm text-white mb-3">I've analyzed your recent posts. Here's what I found:</p>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-white/70">Reels get 3.2x more engagement</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-white/70">Best time: 6-8 PM gets 40% more views</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-white/70">Carousel posts drive 2x saves</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ delay: 0.4 }}
                className="flex justify-end"
            >
                <div className="max-w-[85%] p-4 rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                    <p className="text-sm">Create a content strategy for next week</p>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ delay: 0.6 }}
                className="flex justify-start"
            >
                <div className="max-w-[100%] p-4 rounded-2xl rounded-tl-sm bg-white/5 border border-cyan-500/30">
                    <div className="flex items-center gap-2 mb-3">
                        <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                        <span className="text-xs text-cyan-400 font-medium">Agent working...</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-xs text-white/70">Analyzing audience trends</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-xs text-white/70">Creating 7-day content plan</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-cyan-500/20 flex items-center justify-center animate-pulse flex-shrink-0">
                                <Clock className="w-3 h-3 text-cyan-400" />
                            </div>
                            <span className="text-xs text-white/70">Scheduling posts...</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    )
};

export const VeeGPTChatMockup = React.memo(() => {
    return (
        <ResponsiveMockupWrapper
            color="cyan"
            desktopBorderColor="border-cyan-500/30"
            desktopGradient="from-cyan-500/40 via-blue-500/30 to-teal-500/40"
        >
            {/* 
                We render slightly different props for mobile/desktop but contained within the same structure.
                The wrapper handles the layout switching using CSS.
            */}
            <div className="md:hidden">
                <Header showActive={false} />
                <Messages hasMaxHeight={false} />
            </div>
            <div className="hidden md:block">
                <Header showActive={true} />
                <Messages hasMaxHeight={true} />
            </div>
        </ResponsiveMockupWrapper>
    );
});

export default VeeGPTChatMockup;
