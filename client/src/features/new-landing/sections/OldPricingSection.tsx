import React, { useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { CheckCircle, Lock } from 'lucide-react';
import GlassCard from '../../../components/GlassCard';
import { PricingScrollAnimation } from '../../../components/PricingScrollAnimation';
import { useIsMobile } from '../../../hooks/use-is-mobile';
import { MOBILE_OPTIMIZED_LAYER } from '../../../lib/animation-performance';

// Types
interface PricingPlan {
  name: string;
  credits: number;
  description: string;
  features: string[];
  locked: string[];
  gradient: string;
  border: string;
  popular?: boolean;
}

interface PricingSectionProps {
  onNavigate: (page: string) => void;
}

// GradientOrb component - GPU accelerated blur effect
const GradientOrb = ({ className, color = 'blue' }: { className?: string; color?: string }) => {
  const colors = {
    blue: 'from-blue-500/30 via-blue-600/20 to-transparent',
    purple: 'from-[#5EE6C4]/25 via-[#5EE6C4]/15 to-transparent',
    indigo: 'from-[#4C82F7]/30 via-[#4C82F7]/20 to-transparent',
    cyan: 'from-cyan-500/20 via-cyan-600/10 to-transparent',
  };

  return (
    <div
      className={`gradient-orb bg-gradient-radial ${colors[color as keyof typeof colors]} blur-3xl ${className}`}
      style={MOBILE_OPTIMIZED_LAYER}
    />
  );
};

// TiltCard component - 3D tilt effect on hover (mobile optimized)
const TiltCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);

  // IMPORTANT: All hooks must be called unconditionally (Rules of Hooks)
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [8, -8]);
  const rotateY = useTransform(x, [-100, 100], [-8, 8]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isMobile || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    x.set(0);
    y.set(0);
  };

  // MOBILE OPTIMIZATION: No tilt effect on mobile devices
  // Return regular div AFTER all hooks have been called
  if (isMobile) {
    return (
      <div ref={ref} className={`${className} transform-gpu`}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`${className} transform-gpu`}
    >
      {children}
    </motion.div>
  );
};

/**
 * PricingSection Component
 * 
 * Displays pricing tiers with feature comparison and signup CTAs.
 * 
 * Features:
 * - Responsive design with mobile sticky stack and desktop scroll animation
 * - Phase 1 vs Phase 2 feature differentiation
 * - 3D tilt effects on desktop
 * - Gradient orb background effects
 * - Plan selection with CTA buttons
 * 
 * Requirements: 21.1
 */
const PricingSection: React.FC<PricingSectionProps> = ({ onNavigate }) => {
  // Phase 1 Review Mode flag
  const isPhase1 = import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true';

  // Pricing plans data - varies by phase
  const pricingPlans: PricingPlan[] = isPhase1
    ? [
        {
          name: 'Starter',
          credits: 300,
          description: 'For new creators testing growth',
          features: [
            'AI Hook Generator',
            'Caption & CTA Engine',
            'Basic Scheduler',
            '1 Competitor',
            'Read-only Analytics',
          ],
          locked: ['Advanced Analytics', 'Bulk Scheduler', 'Adaptive AI'],
          gradient: 'from-slate-500/20 to-slate-600/10',
          border: 'border-white/10',
        },
        {
          name: 'Growth',
          credits: 1200,
          description: 'For serious creators ready to scale',
          features: [
            'Everything in Starter',
            'AI Smart Scheduler',
            'Social Listening',
            'Hook Intelligence',
            'Unlimited Scheduling',
            '3 Competitors',
            'Adaptive AI Loop',
            'Full Analytics',
          ],
          locked: [],
          gradient: 'from-[#4C82F7]/20 to-[#3461C7]/20',
          border: 'border-blue-500/30',
          popular: true,
        },
        {
          name: 'Pro',
          credits: 3000,
          description: 'For agencies and power users',
          features: [
            'Everything in Growth',
            '3-5 Social Accounts',
            'Multi-Account Management',
            'Team Access (2-5)',
            'Priority Processing',
            'Dedicated Support',
          ],
          locked: [],
          gradient: 'from-[#5EE6C4]/15 to-[#4C82F7]/15',
          border: 'border-[#5EE6C4]/30',
        },
      ]
    : [
        {
          name: 'Starter',
          credits: 300,
          description: 'For new creators testing growth',
          features: [
            'AI Hook Generator',
            'Caption & CTA Engine',
            'Basic Scheduler',
            '1 Competitor',
            'Read-only Analytics',
          ],
          locked: ['Comment Automation', 'DM Automation', 'Adaptive AI'],
          gradient: 'from-slate-500/20 to-slate-600/10',
          border: 'border-white/10',
        },
        {
          name: 'Growth',
          credits: 1200,
          description: 'For serious creators ready to scale',
          features: [
            'Everything in Starter',
            'AI Comment Automation',
            'Smart DM Replies',
            'Hook Intelligence',
            'Unlimited Scheduling',
            '3 Competitors',
            'Adaptive AI Loop',
            'Full Analytics',
          ],
          locked: [],
          gradient: 'from-[#4C82F7]/20 to-[#3461C7]/20',
          border: 'border-blue-500/30',
          popular: true,
        },
        {
          name: 'Pro',
          credits: 3000,
          description: 'For agencies and power users',
          features: [
            'Everything in Growth',
            '3-5 Social Accounts',
            'Advanced DM Funnels',
            'Team Access (2-5)',
            'Priority Processing',
            'Dedicated Support',
          ],
          locked: [],
          gradient: 'from-[#5EE6C4]/15 to-[#4C82F7]/15',
          border: 'border-[#5EE6C4]/30',
        },
      ];

  return (
    <section id="pricing" className="pt-32 pb-0 relative">
      <GradientOrb className="w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="blue" />

      <div className="max-w-[1200px] mx-auto px-6 relative">
        {/* Section Header */}
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6">
            Choose your{' '}
            <span className="bg-gradient-to-r from-[#4C82F7] to-[#7FA8FF] bg-clip-text text-transparent">
              growth speed
            </span>
          </h2>
          <p className="text-sm sm:text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-6 sm:mb-10 px-4">
            {isPhase1
              ? "We don't sell features. We sell saved time, increased engagement, and AI-powered content growth."
              : "We don't sell features. We sell saved time, increased engagement, and automation leverage."}
          </p>
        </div>

        {/* Mobile View - Sticky Stack */}
        <div className="md:hidden flex flex-col space-y-6 pb-8">
          {pricingPlans.map((plan, i) => (
            <div
              key={plan.name}
              className="sticky transition-all duration-300"
              style={{
                top: `calc(5rem + ${i * 1.5}rem)`,
                zIndex: i + 1,
              }}
            >
              <TiltCard className="h-full group">
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-auto max-w-full px-3 py-1 rounded-full bg-blue-500 text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-blue-500/30 text-white z-30 whitespace-nowrap pointer-events-none">
                    Most Popular
                  </div>
                )}
                <GlassCard
                  className={`p-4 sm:p-6 h-full flex flex-col bg-gradient-to-br ${plan.gradient} ${plan.border} relative shadow-xl`}
                >
                  {/* Plan Header */}
                  <div className="mb-3 sm:mb-4">
                    <h3 className="text-xl sm:text-2xl font-bold mb-1">{plan.name}</h3>
                    <p className="text-xs sm:text-sm text-white/40">{plan.description}</p>
                  </div>

                  {/* Pricing */}
                  <div className="mb-4 sm:mb-6">
                    {/* Hidden Price - Coming Soon */}
                    <div className="relative mb-1">
                      {/* Blurred price hint */}
                      <div className="flex items-baseline filter blur-sm select-none pointer-events-none opacity-50">
                        <span className="text-2xl sm:text-4xl font-bold">₹???</span>
                        <span className="text-white/40 ml-2 text-sm">/mo</span>
                      </div>
                      {/* Coming Soon Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md">
                          <Lock className="w-3 h-3 text-amber-400" />
                          <span className="text-xs sm:text-sm font-medium text-white/90">Coming Soon</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-white/30 mt-1">
                      {plan.credits.toLocaleString()} credits/month
                    </p>
                  </div>

                  {/* Features List */}
                  <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 flex-1">
                    {plan.features.map((feature, j) => (
                      <div key={j} className="flex items-start space-x-2 text-xs sm:text-sm text-white/60">
                        <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                    {plan.locked.map((feature, j) => (
                      <div key={j} className="flex items-start space-x-2 text-xs sm:text-sm text-white/30">
                        <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA Button */}
                  <button
                    className={`w-full py-2.5 sm:py-3 text-sm sm:text-base btn-brick ${
                      plan.popular ? 'btn-brick-white' : 'btn-brick-dark'
                    }`}
                    onClick={() => onNavigate('signup')}
                  >
                    Get Started
                  </button>
                </GlassCard>
              </TiltCard>
            </div>
          ))}
        </div>

        {/* Desktop View - Scroll Animation */}
        <div className="hidden md:block">
          <PricingScrollAnimation pricingPlans={pricingPlans} />
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
