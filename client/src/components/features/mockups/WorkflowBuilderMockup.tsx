import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Bell, Brain, Sparkles, Send } from 'lucide-react';
import { ResponsiveMockupWrapper, MockupAnimationContext } from '../shared/ResponsiveMockupWrapper';

export const WorkflowBuilderMockup = React.memo(() => {
    return (
        <ResponsiveMockupWrapper
            color="purple"
            desktopBorderColor="border-purple-500/20"
            desktopGradient="from-purple-500/30 via-pink-500/30 to-rose-500/30"
            desktopClassName=""
        >
            <WorkflowContent />
        </ResponsiveMockupWrapper>
    );
});

const WorkflowContent = () => {
    const isInView = React.useContext(MockupAnimationContext);

    return (
        <div className="p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Workflow Builder</h3>
                        <p className="text-xs text-white/50">Create automations visually</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-400">3 Active Workflows</span>
                </div>
            </div>

            {/* Workflow Timeline */}
            <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500 via-pink-500 to-rose-500" />

                {/* Workflow Steps */}
                <div className="space-y-6">
                    {[
                        { type: 'trigger', label: 'TRIGGER', title: 'New Comment Received', desc: 'When someone comments on any post', icon: Bell, color: 'from-purple-500 to-violet-500' },
                        { type: 'condition', label: 'CONDITION', title: 'Check Sentiment', desc: 'Is the comment positive or question?', icon: Brain, color: 'from-blue-500 to-cyan-500' },
                        { type: 'action', label: 'ACTION', title: 'AI Generates Reply', desc: 'Create personalized response', icon: Sparkles, color: 'from-pink-500 to-rose-500' },
                        { type: 'action', label: 'ACTION', title: 'Post Reply', desc: 'Send reply after 2-5 min delay', icon: Send, color: 'from-green-500 to-emerald-500' },
                    ].map((step, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                            transition={{ delay: i * 0.15 }}
                            className="relative pl-16"
                        >
                            {/* Step Icon */}
                            <div className={`absolute left-0 w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg`}>
                                <step.icon className="w-6 h-6 text-white" />
                            </div>

                            {/* Step Content */}
                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-purple-500/30 transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${step.type === 'trigger' ? 'bg-purple-500/20 text-purple-400' :
                                        step.type === 'condition' ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-green-500/20 text-green-400'
                                        } `}>
                                        {step.label}
                                    </span>
                                </div>
                                <h4 className="font-semibold text-white mb-1">{step.title}</h4>
                                <p className="text-sm text-white/50">{step.desc}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Stats Footer */}
            <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                <div>
                    <div className="text-2xl font-bold text-purple-400">1,247</div>
                    <div className="text-xs text-white/50">Runs today</div>
                </div>
                <div>
                    <div className="text-2xl font-bold text-pink-400">98.5%</div>
                    <div className="text-xs text-white/50">Success rate</div>
                </div>
                <div>
                    <div className="text-2xl font-bold text-green-400">4.2h</div>
                    <div className="text-xs text-white/50">Time saved</div>
                </div>
            </div>
        </div>

    );
};

export default WorkflowBuilderMockup;


