import React from 'react';
import TiltCard from './TiltCard';

/**
 * TiltCard Component Examples
 * 
 * Demonstrates various usage patterns for the TiltCard component.
 */

// Example 1: Basic usage with default settings
export const BasicTiltCard = () => (
  <TiltCard>
    <div className="p-8 bg-white/[0.02] border border-white/10 rounded-2xl backdrop-blur-md">
      <h3 className="text-xl font-bold text-white mb-2">Basic Tilt Card</h3>
      <p className="text-white/70">
        Hover over this card to see the 3D tilt effect in action.
        Uses default settings (maxTilt: 8deg, scale: 1.02).
      </p>
    </div>
  </TiltCard>
);

// Example 2: Increased tilt effect
export const StrongTiltCard = () => (
  <TiltCard maxTilt={15} scale={1.05}>
    <div className="p-8 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 rounded-2xl backdrop-blur-md">
      <h3 className="text-xl font-bold text-white mb-2">Strong Tilt Effect</h3>
      <p className="text-white/70">
        This card has a stronger tilt effect (maxTilt: 15deg) and larger scale (1.05).
      </p>
    </div>
  </TiltCard>
);

// Example 3: Subtle tilt effect
export const SubtleTiltCard = () => (
  <TiltCard maxTilt={4} scale={1.01}>
    <div className="p-8 bg-white/[0.02] border border-white/10 rounded-2xl backdrop-blur-md">
      <h3 className="text-xl font-bold text-white mb-2">Subtle Tilt Effect</h3>
      <p className="text-white/70">
        A more subtle effect perfect for professional interfaces (maxTilt: 4deg).
      </p>
    </div>
  </TiltCard>
);

// Example 4: Feature card with tilt (typical use case)
export const FeatureCardWithTilt = () => (
  <TiltCard className="w-full max-w-md">
    <div className="relative p-6 bg-white/[0.02] border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden">
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/5 opacity-0 hover:opacity-100 transition-opacity duration-500" />
      
      {/* Content */}
      <div className="relative z-10">
        <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">AI Caption Engine</h3>
        <p className="text-white/70 text-sm">
          Hook-aligned captions with CTA optimization powered by advanced AI algorithms.
        </p>
      </div>
    </div>
  </TiltCard>
);

// Example 5: Disabled tilt (for comparison)
export const DisabledTiltCard = () => (
  <TiltCard disableTilt>
    <div className="p-8 bg-white/[0.02] border border-white/10 rounded-2xl backdrop-blur-md">
      <h3 className="text-xl font-bold text-white mb-2">Tilt Disabled</h3>
      <p className="text-white/70">
        This card has the tilt effect disabled. No 3D transform on hover.
      </p>
    </div>
  </TiltCard>
);

// Example 6: Grid of tilt cards
export const TiltCardGrid = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-8">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <TiltCard key={i}>
        <div className="p-6 bg-white/[0.02] border border-white/10 rounded-2xl backdrop-blur-md">
          <h4 className="text-lg font-bold text-white mb-2">Card {i}</h4>
          <p className="text-white/60 text-sm">
            Each card responds independently to mouse position.
          </p>
        </div>
      </TiltCard>
    ))}
  </div>
);

// Full demo page
export const TiltCardDemo = () => (
  <div className="min-h-screen bg-black p-8">
    <div className="max-w-6xl mx-auto space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">TiltCard Component</h1>
        <p className="text-white/70">
          A React component that implements 3D tilt effects with spring physics.
          Automatically disabled on mobile devices for optimal performance.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Basic Example</h2>
        <BasicTiltCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Tilt Intensity Variations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <SubtleTiltCard />
          <StrongTiltCard />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Feature Card Use Case</h2>
        <div className="flex justify-center">
          <FeatureCardWithTilt />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Multiple Cards</h2>
        <TiltCardGrid />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Disabled State</h2>
        <DisabledTiltCard />
      </section>
    </div>
  </div>
);

export default TiltCardDemo;
