import React, { memo } from 'react';
import { ArrowRight, Users, Star, TrendingUp } from 'lucide-react';

/**
 * CTASection - Final Call-to-Action Section
 * 
 * Displays the final call-to-action with signup button and social proof elements.
 * Encourages visitors to sign up for the beta launch with limited spots messaging.
 * 
 * Features:
 * - Prominent CTA headline with gradient text
 * - Social proof indicators (user count, ratings, growth stats)
 * - Primary action button with hover effects
 * - Trust signals and scarcity messaging
 * 
 * Requirements: 21.1
 * 
 * @component
 * @example
 * ```tsx
 * <CTASection onNavigate={(page) => console.log('Navigate to:', page)} />
 * ```
 */

// Gradient orb component for background visual effects
const GradientOrb = memo(({ className, color = 'blue' }: { className?: string; color?: string }) => {
  const colors = {
    blue: 'from-blue-500/30 via-blue-600/20 to-transparent',
    purple: 'from-purple-500/30 via-purple-600/20 to-transparent',
    indigo: 'from-indigo-500/30 via-indigo-600/20 to-transparent',
    cyan: 'from-cyan-500/20 via-cyan-600/10 to-transparent'
  };

  return (
    <div
      className={`gradient-orb bg-gradient-radial ${colors[color as keyof typeof colors]} blur-3xl ${className}`}
      style={{
        position: 'absolute',
        borderRadius: '50%',
        pointerEvents: 'none',
        willChange: 'transform'
      }}
    />
  );
});

GradientOrb.displayName = 'GradientOrb';

// Social proof stats data
const socialProofStats = [
  {
    icon: Users,
    value: '10,000+',
    label: 'Active Users',
    color: 'text-blue-400'
  },
  {
    icon: Star,
    value: '4.9/5',
    label: 'User Rating',
    color: 'text-yellow-400'
  },
  {
    icon: TrendingUp,
    value: '3x',
    label: 'Avg Growth',
    color: 'text-green-400'
  }
];

interface CTASectionProps {
  /**
   * Navigation handler function to redirect to different pages
   */
  onNavigate: (page: string) => void;
}

/**
 * CTASection Component
 * 
 * Final call-to-action section with signup form/button and social proof elements.
 * Displays compelling messaging to encourage sign-ups with trust indicators.
 */
const CTASection: React.FC<CTASectionProps> = ({ onNavigate }) => {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden">
      {/* Background gradient orb */}
      <GradientOrb 
        className="w-[600px] h-[600px] md:w-[800px] md:h-[800px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" 
        color="purple" 
      />

      <div className="max-w-[900px] mx-auto px-4 sm:px-6 text-center relative z-10">
        {/* Main CTA Content */}
        <div className="mb-8 md:mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 md:mb-8">
            Don't miss the{' '}
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              beta launch
            </span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-8 md:mb-12 px-4">
            Be among the first creators to experience VeeFore. Limited spots available for early adopters who want to grow smarter.
          </p>

          {/* Primary CTA Button */}
          <button
            className="group btn-brick btn-brick-brand px-10 sm:px-12 md:px-14 py-4 sm:py-5 md:py-6 text-lg sm:text-xl transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/20"
            onClick={() => onNavigate('signup')}
            aria-label="Get started with VeeFore beta"
          >
            <span className="relative z-10 flex items-center">
              Get Started Now
              <ArrowRight className="ml-2 sm:ml-3 w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </div>

        {/* Social Proof Elements */}
        <div className="mt-12 md:mt-16 pt-8 md:pt-12 border-t border-white/10">
          <p className="text-xs sm:text-sm text-white/30 uppercase tracking-wider mb-6 md:mb-8 font-semibold">
            Join thousands of growing creators
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 md:gap-8 max-w-3xl mx-auto">
            {socialProofStats.map((stat, index) => {
              const IconComponent = stat.icon;
              return (
                <div
                  key={index}
                  className="flex flex-col items-center p-4 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-sm hover:bg-white/[0.05] transition-all duration-300"
                >
                  <IconComponent className={`w-6 h-6 sm:w-8 sm:h-8 ${stat.color} mb-2 sm:mb-3`} />
                  <div className="text-2xl sm:text-3xl font-bold text-white mb-1">
                    {stat.value}
                  </div>
                  <div className="text-xs sm:text-sm text-white/50">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust Badge */}
          <div className="mt-8 md:mt-10 flex items-center justify-center space-x-2 text-white/40 text-xs sm:text-sm">
            <svg 
              className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" 
              fill="currentColor" 
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path 
                fillRule="evenodd" 
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" 
                clipRule="evenodd" 
              />
            </svg>
            <span>Trusted by creators worldwide</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
