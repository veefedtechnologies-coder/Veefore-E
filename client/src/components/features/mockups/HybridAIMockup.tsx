import React from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';
import { ResponsiveMockupWrapper, MockupAnimationContext } from '../shared/ResponsiveMockupWrapper';

export const HybridAIMockup = React.memo(() => {
    return (
        <ResponsiveMockupWrapper
            color="blue"
            desktopBorderColor="border-white/10"
            desktopGradient="from-blue-500/30 via-purple-500/30 to-pink-500/30"
            desktopClassName=""
        >
            <HybridAIContent />
        </ResponsiveMockupWrapper>
    );
});

const HybridAIContent = () => {
    const isInView = React.useContext(MockupAnimationContext);

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-white mb-2">Hybrid AI Engine</h3>
                <p className="text-xs text-white/50">Automatically selects the best model for your query</p>
            </div>

            {/* Query Analysis */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
                className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4"
            >
                <div className="text-xs text-white/50 mb-2">Your Query</div>
                <p className="text-sm text-white">"Create a viral marketing campaign for my new product launch"</p>
            </motion.div>

            {/* AI Models */}
            <div className="space-y-3">
                {[
                    { name: 'GPT-4o', color: 'from-green-500 to-emerald-500', match: 92, desc: 'Best for creative strategy', selected: true },
                    { name: 'Claude 3.5', color: 'from-orange-500 to-amber-500', match: 78, desc: 'Great for detailed analysis' },
                    { name: 'Gemini Pro', color: 'from-blue-500 to-cyan-500', match: 71, desc: 'Good for research' },
                ].map((model, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                        transition={{ delay: i * 0.1 }}
                        className={`p-3 rounded-xl flex items-center gap-3 ${model.selected ? 'bg-gradient-to-r ' + model.color + ' bg-opacity-20 border-2 border-green-500' : 'bg-white/5 border border-white/5'}`}
                    >
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${model.color} flex items-center justify-center flex-shrink-0`}>
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white">{model.name}</span>
                                {model.selected && <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-500 text-white">Selected</span>}
                            </div>
                            <p className="text-xs text-white/50">{model.desc}</p>
                        </div>
                        <div className="text-right">
                            <div className={`text-lg font-bold ${model.selected ? 'text-green-400' : 'text-white/40'}`}>{model.match}%</div>
                            <div className="text-[10px] text-white/40">Match</div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>

    );
};

export default HybridAIMockup;


