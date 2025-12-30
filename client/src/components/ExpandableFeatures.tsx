import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowRight } from 'lucide-react';
import GlassCard from './GlassCard';

interface Feature {
  id: string;
  icon: any;
  title: string;
  tagline: string;
  description: string;
  details: string[];
  gradient: string;
  visual?: React.ReactNode;
}

interface ExpandableFeaturesProps {
  features: Feature[];
}

export const ExpandableFeatures = ({ features }: ExpandableFeaturesProps) => {
  const [activeId, setActiveId] = useState<string | null>(features[0].id);

  return (
    <div className="w-full max-w-[1200px] mx-auto h-[650px] flex flex-col lg:flex-row gap-4">
      {features.map((feature) => {
        const isActive = activeId === feature.id;
        
        return (
          <motion.div
            key={feature.id}
            layout
            onHoverStart={() => setActiveId(feature.id)}
            onClick={() => setActiveId(feature.id)}
            className={`relative rounded-[32px] overflow-hidden cursor-pointer group ${
              isActive ? 'lg:flex-[3]' : 'lg:flex-1'
            } flex-1 transition-all duration-500 ease-out border border-white/10`}
          >
            {/* Background Gradient & Image */}
            <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-500`} />
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
            
            {/* Animated Grid Background */}
            <div 
              className="absolute inset-0 opacity-[0.03]" 
              style={{ 
                backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', 
                backgroundSize: '24px 24px' 
              }} 
            />

            {/* Content Container */}
            <div className="relative h-full flex flex-col p-6 sm:p-8 z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center shadow-lg ring-1 ring-white/20 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                
                <motion.div 
                  animate={{ rotate: isActive ? 0 : -45, opacity: isActive ? 1 : 0.5 }}
                  className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/5"
                >
                  <ArrowRight className="w-5 h-5 text-white" />
                </motion.div>
              </div>

              {/* Title Section */}
              <div className={isActive ? 'mb-6' : 'mb-auto'}>
                <motion.h3 
                  layout="position" 
                  className={`font-bold text-white mb-2 leading-tight ${isActive ? 'text-2xl sm:text-3xl' : 'text-xl'}`}
                >
                  {feature.title}
                </motion.h3>
                <motion.p 
                  layout="position"
                  className={`text-white/60 font-medium ${isActive ? 'text-lg' : 'text-sm line-clamp-2'}`}
                >
                  {feature.tagline}
                </motion.p>
              </div>

              {/* Expanded Content */}
              <AnimatePresence mode="wait">
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex-1 flex flex-col lg:flex-row gap-8 overflow-hidden"
                  >
                    {/* Left Column: Text Content */}
                    <div className="flex-1 flex flex-col">
                      <motion.p 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-white/80 text-base mb-6 leading-relaxed border-l-2 border-white/20 pl-4"
                      >
                        {feature.description}
                      </motion.p>

                      <div className="space-y-3 mt-auto">
                        {feature.details.map((detail, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + (idx * 0.05) }}
                            className="flex items-center space-x-3 bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors"
                          >
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                              <CheckCircle className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-sm text-white/90 font-medium">{detail}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* Right Column: Visual / Media */}
                    {feature.visual && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, x: 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="flex-1 hidden lg:block h-full min-h-[300px]"
                      >
                        {feature.visual}
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Collapsed State Indicator (Desktop Only) */}
              {!isActive && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hidden lg:block absolute bottom-8 left-8"
                >
                  <span className="text-sm font-bold tracking-widest text-white/30 uppercase writing-vertical-lr rotate-180">
                    Explore Feature
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
