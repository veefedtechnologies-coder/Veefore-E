import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Layers, BarChart3, Users, LucideIcon } from 'lucide-react';

/**
 * FeaturesGrid Component
 * 
 * Displays product features in a responsive bento-style grid layout with entrance animations.
 * Implements Requirements 21.1 (Landing Page Refactoring) and 5.4 (Component Architecture Optimization)
 * 
 * Features:
 * - Responsive grid layout (1 column mobile, 3 columns desktop)
 * - Hover effects with gradient glows
 * - Framer Motion entrance animations
 * - FeatureCard sub-component for consistent styling
 */

interface FeatureCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  badgeColor?: 'indigo' | 'amber';
  colSpan?: 1 | 2; // Grid column span (1/3 or 2/3 width)
  mockContent?: React.ReactNode; // Optional visual mock content
  teamMembers?: number; // For collaboration card
}

/**
 * FeatureCard Sub-component
 * 
 * Individual feature card with icon, title, description, and optional badge.
 * Includes hover effects and gradient glow animations.
 */
const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  icon: Icon,
  badge,
  badgeColor = 'indigo',
  colSpan = 1,
  mockContent,
  teamMembers,
}) => {
  const badgeStyles = {
    indigo: 'bg-white/5 border-white/10 text-zinc-300',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`${
        colSpan === 2 ? 'lg:col-span-2' : ''
      } group relative overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl bg-zinc-900/30 border border-white/5 p-4 sm:p-6 md:p-8 backdrop-blur-sm transition-colors hover:bg-zinc-900/50`}
    >
      {/* Hidden glow that reveals on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 sm:w-96 h-64 sm:h-96 bg-indigo-500/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10">
        {/* Header: Icon and Badge */}
        <div className={`flex items-start ${badge ? 'justify-between' : 'justify-start'} mb-3 sm:mb-4 md:mb-6`}>
          <div className={`w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg ${
            badge && badgeColor === 'amber' ? 'bg-white/5 border-white/10' : 'bg-indigo-500/10 border-indigo-500/20'
          } flex items-center justify-center`}>
            <Icon className={`w-4.5 h-4.5 sm:w-5 sm:h-5 md:w-6 md:h-6 ${
              badge && badgeColor === 'amber' ? 'text-white' : 'text-indigo-400'
            }`} />
          </div>
          {badge && (
            <span
              className={`${badgeStyles[badgeColor]} rounded-full px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-0.5 md:py-1 text-[9px] sm:text-[10px] md:text-xs`}
            >
              {badge}
            </span>
          )}
        </div>

        {/* Content: Title and Description */}
        <h3 className={`${
          colSpan === 2 ? 'text-lg sm:text-xl md:text-2xl' : 'text-base sm:text-lg md:text-xl'
        } font-semibold text-white mb-1.5 sm:mb-2 md:mb-3 tracking-tight`}>
          {title}
        </h3>
        <p className={`${
          colSpan === 2 ? 'text-xs sm:text-sm md:text-base' : 'text-xs sm:text-xs md:text-sm'
        } text-zinc-400 leading-relaxed ${mockContent || teamMembers ? 'mb-3 sm:mb-4 md:mb-6' : ''}`}>
          {description}
        </p>

        {/* Optional Mock Content */}
        {mockContent}

        {/* Team Members Display (for collaboration card) */}
        {teamMembers && (
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <div className="flex -space-x-2">
              {Array.from({ length: Math.min(teamMembers, 4) }).map((_, i) => (
                <div
                  key={i}
                  className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full bg-zinc-800 border-2 border-zinc-900"
                />
              ))}
            </div>
            {teamMembers > 4 && (
              <span className="text-[9px] sm:text-[10px] md:text-xs text-zinc-500 ml-1 sm:ml-2">
                +{teamMembers - 4} team members
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

/**
 * AIEngineMockContent
 * 
 * Visual mock interface for the AI Engine feature card
 */
const AIEngineMockContent: React.FC = () => (
  <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2.5 sm:p-3 md:p-4 space-y-1.5 sm:space-y-2 md:space-y-3">
    <div className="flex items-center space-x-1.5 sm:space-x-2">
      <div className="w-1.5 h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-green-500" />
      <span className="text-[9px] sm:text-[10px] md:text-xs text-zinc-500 uppercase tracking-widest">
        Operational
      </span>
    </div>
    <div className="space-y-1 sm:space-y-1.5 md:space-y-2">
      <div className="h-1.5 sm:h-1.5 md:h-2 bg-zinc-800 rounded-full w-full" />
      <div className="h-1.5 sm:h-1.5 md:h-2 bg-zinc-800 rounded-full w-4/5" />
      <div className="h-1.5 sm:h-1.5 md:h-2 bg-indigo-500/20 rounded-full w-3/5" />
    </div>
  </div>
);

/**
 * FeaturesGrid Component
 * 
 * Main features grid component displaying product features in a bento-style layout
 */
export const FeaturesGrid: React.FC = () => {
  return (
    <section className="relative py-12 sm:py-16 md:py-24 lg:py-32 px-3 sm:px-4 md:px-6 lg:px-8">
      <div className="w-full max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center mb-8 sm:mb-12 md:mb-16"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-semibold tracking-tight text-white mb-3 sm:mb-4 px-2 sm:px-4">
            A complete growth engine,
            <br />
            <span className="text-zinc-400">Powered by intelligence.</span>
          </h2>
        </motion.div>

        {/* Bento Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 sm:gap-3 md:gap-4 auto-rows-fr">
          {/* Large Card 1: AI Generation (2/3 width) */}
          <FeatureCard
            title="Context-Aware AI Engine"
            description="Our AI understands your niche, audience demographics, and content style to generate perfectly tailored captions, hashtags, and posting strategies that resonate with your unique brand voice."
            icon={Brain}
            badge="AI-Powered"
            badgeColor="indigo"
            colSpan={2}
            mockContent={<AIEngineMockContent />}
          />

          {/* Small Card 1: Multi-platform (1/3 width) */}
          <FeatureCard
            title="Multi-platform"
            description="Publish across Instagram, TikTok, and YouTube from one unified dashboard."
            icon={Layers}
          />

          {/* Small Card 2: Analytics (1/3 width) */}
          <FeatureCard
            title="Analytics"
            description="Deep insights into engagement, reach, and audience growth patterns."
            icon={BarChart3}
          />

          {/* Large Card 2: Collaboration (2/3 width) */}
          <FeatureCard
            title="Seamless Collaboration"
            description="Work together with your team in real-time. Assign roles, share workspaces, and maintain brand consistency across all your content creation workflows."
            icon={Users}
            badge="Team Ready"
            badgeColor="amber"
            colSpan={2}
            teamMembers={16}
          />
        </div>
      </div>
    </section>
  );
};

export default FeaturesGrid;
