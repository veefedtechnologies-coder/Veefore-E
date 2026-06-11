/**
 * CSS Animations Demo
 * 
 * This component demonstrates the CSS animations implemented for Task 7.4
 * Use this to visually verify that all animations are working correctly
 * 
 * To test:
 * 1. Import this component in a test page
 * 2. Open Chrome DevTools → Performance
 * 3. Record while animations are running
 * 4. Verify 60fps and GPU activity on the timeline
 * 5. Check the Layers panel to see composite layers
 * 
 * To test reduced motion:
 * 1. Open Chrome DevTools → Rendering
 * 2. Enable "Emulate CSS media feature prefers-reduced-motion"
 * 3. Verify continuous animations stop
 * 4. Verify entrance animations become instant
 */

import React from 'react';
import { Sparkles, CheckCircle, Zap } from 'lucide-react';
import GradientOrb from './GradientOrb';
import FloatingStatusBadge from './FloatingStatusBadge';

const CSSAnimationsDemo: React.FC = () => {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto space-y-16">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">CSS Animations Demo</h1>
          <p className="text-gray-400">Task 7.4: CSS animations for continuous effects</p>
        </div>

        {/* 1. GradientOrb Demo */}
        <section className="border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">1. GradientOrb Animation</h2>
          <p className="text-gray-400 mb-8">
            Pulsing gradient orbs with <code>orb-pulse</code> animation (4s infinite)
          </p>
          
          <div className="relative h-96 bg-gradient-to-b from-gray-900 to-black rounded-xl overflow-hidden">
            {/* Animated orbs */}
            <GradientOrb 
              color="blue" 
              animate={true} 
              className="w-64 h-64 -top-8 -left-8"
            />
            <GradientOrb 
              color="purple" 
              animate={true} 
              className="w-48 h-48 top-8 right-8"
            />
            <GradientOrb 
              color="indigo" 
              animate={true} 
              className="w-56 h-56 bottom-8 left-1/3"
            />
            
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-gray-400">✅ Pulsing opacity + scale</p>
                <p className="text-sm text-gray-400">✅ GPU-accelerated transforms</p>
                <p className="text-sm text-gray-400">✅ Respects prefers-reduced-motion</p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <p className="text-gray-500"><strong>CSS Keyframes:</strong> orb-pulse</p>
            <p className="text-gray-500"><strong>Duration:</strong> 4s</p>
            <p className="text-gray-500"><strong>Properties:</strong> opacity (0.4 → 0.6), scale (1 → 1.05)</p>
          </div>
        </section>

        {/* 2. FloatingStatusBadge Demo */}
        <section className="border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">2. FloatingStatusBadge Animation</h2>
          <p className="text-gray-400 mb-8">
            Combined animations: <code>fade-in-up</code> (entrance) + <code>breathing</code> (continuous)
          </p>
          
          <div className="relative h-96 bg-gradient-to-b from-gray-900 to-black rounded-xl overflow-hidden">
            <FloatingStatusBadge
              text="AI is actively engaging"
              icon={Sparkles}
              position={{ top: '10%', left: '5%' }}
              color="blue"
              animationDelay={0}
            />
            
            <FloatingStatusBadge
              text="24/7 Automation Active"
              icon={CheckCircle}
              position={{ top: '15%', right: '5%' }}
              color="green"
              animationDelay={0.2}
            />
            
            <FloatingStatusBadge
              text="Growth Mode Enabled"
              icon={Zap}
              position={{ bottom: '10%', left: '50%', right: 'auto' }}
              color="purple"
              animationDelay={0.4}
            />
            
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-gray-400">✅ Fade in from bottom (0.8s)</p>
                <p className="text-sm text-gray-400">✅ Breathing scale animation (3s infinite)</p>
                <p className="text-sm text-gray-400">✅ Staggered delays</p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <p className="text-gray-500"><strong>CSS Keyframes:</strong> fade-in-up, breathing</p>
            <p className="text-gray-500"><strong>Duration:</strong> 0.8s entrance, 3s breathing</p>
            <p className="text-gray-500"><strong>Properties:</strong> opacity, translateY, scale</p>
          </div>
        </section>

        {/* 3. Gradient Pulse Demo */}
        <section className="border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">3. Gradient Pulse Animation</h2>
          <p className="text-gray-400 mb-8">
            Center orb pulsing gradient with <code>gradient-pulse</code> animation (3s infinite)
          </p>
          
          <div className="relative h-96 bg-gradient-to-b from-gray-900 to-black rounded-xl overflow-hidden flex items-center justify-center">
            <div className="relative w-48 h-48">
              {/* Orbit rings */}
              <div className="absolute inset-0 rounded-full border border-dashed border-indigo-500/20 animate-[spin_30s_linear_infinite]" />
              <div className="absolute inset-8 rounded-full border border-dotted border-cyan-500/20 animate-[spin_40s_linear_infinite_reverse]" />
              
              {/* Center orb with pulsing gradient */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-24 h-24 rounded-full bg-black/80 backdrop-blur-sm border border-indigo-500/30 flex items-center justify-center overflow-hidden">
                  {/* Pulsing gradient background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-cyan-500/20 animate-[gradient-pulse_3s_ease-in-out_infinite]" />
                  
                  <div className="relative z-10 text-center">
                    <div className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1">Central</div>
                    <div className="text-sm font-bold text-white">Intelligence</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-8 left-0 right-0 text-center">
              <p className="text-sm text-gray-400">✅ Gradient opacity pulse (0.2 → 0.4)</p>
              <p className="text-sm text-gray-400">✅ 3s smooth animation</p>
              <p className="text-sm text-gray-400">✅ GPU-accelerated</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <p className="text-gray-500"><strong>CSS Keyframes:</strong> gradient-pulse</p>
            <p className="text-gray-500"><strong>Duration:</strong> 3s</p>
            <p className="text-gray-500"><strong>Properties:</strong> opacity (0.2 → 0.4)</p>
          </div>
        </section>

        {/* Performance Info */}
        <section className="border border-green-500/20 bg-green-500/5 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4 text-green-400">Performance Benefits</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold mb-2">Before (Framer Motion)</h3>
              <ul className="space-y-1 text-sm text-gray-400">
                <li>❌ JavaScript-driven animations</li>
                <li>❌ React re-renders on every frame</li>
                <li>❌ Higher CPU usage</li>
                <li>❌ Battery drain on mobile</li>
                <li>❌ Complex animation objects</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-2 text-green-400">After (CSS)</h3>
              <ul className="space-y-1 text-sm text-gray-300">
                <li>✅ GPU-accelerated transforms</li>
                <li>✅ No React re-renders</li>
                <li>✅ Lower CPU usage (&lt;5%)</li>
                <li>✅ Better battery life</li>
                <li>✅ Simple, declarative CSS</li>
              </ul>
            </div>
          </div>
        </section>

        {/* How to Test */}
        <section className="border border-blue-500/20 bg-blue-500/5 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">How to Verify GPU Acceleration</h2>
          <div className="space-y-4 text-sm text-gray-300">
            <div>
              <h3 className="font-bold mb-2">1. Chrome DevTools → Performance</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>Click Record button</li>
                <li>Let animations run for 3-5 seconds</li>
                <li>Stop recording</li>
                <li>Look for "GPU" track - should show activity</li>
                <li>Check for green "Composite Layers" sections</li>
                <li>Verify 60fps in the FPS chart</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold mb-2">2. Chrome DevTools → Layers</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>More Tools → Layers</li>
                <li>Animated elements should appear as separate layers</li>
                <li>Check "Compositing Reasons" - should include "Animation"</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold mb-2">3. Test Reduced Motion</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>DevTools → Rendering → Emulate CSS prefers-reduced-motion</li>
                <li>Select "prefers-reduced-motion: reduce"</li>
                <li>Verify continuous animations stop</li>
                <li>Verify entrance animations become instant</li>
              </ul>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default CSSAnimationsDemo;
