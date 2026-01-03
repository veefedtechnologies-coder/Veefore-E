import React from 'react';
import { motion } from 'framer-motion';
import { Zap, CheckCircle } from 'lucide-react';
import { ResponsiveMockupWrapper, MockupAnimationContext } from '../shared/ResponsiveMockupWrapper';

export const AgentTasksMockup = React.memo(() => {
    return (
        <ResponsiveMockupWrapper
            color="cyan"
            desktopBorderColor="border-white/10"
            desktopGradient="from-cyan-500/30 via-blue-500/30 to-teal-500/30"
            desktopClassName=""
        >
            <TasksContent />
        </ResponsiveMockupWrapper>
    );
});

const TasksContent = () => {
    const isInView = React.useContext(MockupAnimationContext);

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Agent Tasks</h3>
                        <p className="text-xs text-white/50">VeeGPT working for you</p>
                    </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-medium">
                    4 Active
                </div>
            </div>

            <div className="space-y-3">
                {[
                    { task: 'Responding to 12 new comments', status: 'running', progress: 75 },
                    { task: 'Scheduling posts for next week', status: 'done', progress: 100 },
                    { task: 'Analyzing competitor strategies', status: 'running', progress: 45 },
                    { task: 'Generating content ideas', status: 'queued', progress: 0 },
                ].map((item, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="p-3 rounded-xl bg-white/5 border border-white/5"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-white">{item.task}</span>
                            {item.status === 'running' && (
                                <div className="flex items-center gap-1.5 align-middle">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse bg-green-400" />
                                    <span className="text-[10px] text-green-400 font-medium uppercase tracking-wider">Running</span>
                                </div>
                            )}
                            {item.status === 'done' && (
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                    <span className="text-[10px] text-green-500 font-medium uppercase tracking-wider">Done</span>
                                </div>
                            )}
                            {item.status === 'queued' && (
                                <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Queued</span>
                            )}
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <motion.div
                                initial={{ scaleX: 0 }}
                                animate={isInView ? { scaleX: item.progress / 100 } : { scaleX: 0 }}
                                transition={{ duration: 1, delay: i * 0.2 }}
                                style={{ originX: 0, width: '100%' }}
                                className={`h-full rounded-full ${item.status === 'running' ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : item.status === 'done' ? 'bg-green-500' : 'bg-transparent'}`}
                            />
                        </div>
                    </motion.div>
                ))}
            </div>

        </div>
    );
};

export default AgentTasksMockup;
