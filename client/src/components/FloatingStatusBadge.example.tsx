/**
 * FloatingStatusBadge Component - Usage Examples
 * 
 * This file demonstrates how to use the FloatingStatusBadge component
 * in different scenarios within the landing page.
 */

import React from 'react';
import FloatingStatusBadge from './FloatingStatusBadge';
import { Zap, CheckCircle, Clock, Sparkles } from 'lucide-react';

export const Example1_BlueTheme = () => (
  <div className="relative w-full h-96 bg-black">
    <FloatingStatusBadge
      text="24/7 Automation Active"
      icon={Zap}
      position={{ bottom: '20px', right: '20px' }}
      color="blue"
      animationDelay={0.5}
    />
  </div>
);

export const Example2_GreenTheme = () => (
  <div className="relative w-full h-96 bg-black">
    <FloatingStatusBadge
      text="AI is actively engaging"
      icon={CheckCircle}
      position={{ bottom: '20px', left: '20px' }}
      color="green"
      animationDelay={0.6}
    />
  </div>
);

export const Example3_PurpleTheme = () => (
  <div className="relative w-full h-96 bg-black">
    <FloatingStatusBadge
      text="Processing Content"
      icon={Sparkles}
      position={{ top: '20px', right: '20px' }}
      color="purple"
    />
  </div>
);

export const Example4_MultipleBadges = () => (
  <div className="relative w-full h-96 bg-black">
    <FloatingStatusBadge
      text="Smart Scheduler Active"
      icon={Clock}
      position={{ top: '20px', left: '20px' }}
      color="blue"
      animationDelay={0}
    />
    
    <FloatingStatusBadge
      text="AI Optimizing"
      icon={Sparkles}
      position={{ top: '20px', right: '20px' }}
      color="purple"
      animationDelay={0.3}
    />
    
    <FloatingStatusBadge
      text="Live Engagement"
      icon={CheckCircle}
      position={{ bottom: '20px', left: '20px' }}
      color="green"
      animationDelay={0.6}
    />
    
    <FloatingStatusBadge
      text="24/7 Automation"
      icon={Zap}
      position={{ bottom: '20px', right: '20px' }}
      color="blue"
      animationDelay={0.9}
    />
  </div>
);

/**
 * Integration with Landing Page - Live Dashboard Section
 * 
 * Replace the existing motion.div floating elements with FloatingStatusBadge:
 * 
 * Before:
 * <motion.div
 *   initial={{ opacity: 0, scale: 0.8 }}
 *   animate={{ opacity: 1, scale: 1 }}
 *   transition={{ delay: 0.5, duration: 0.5 }}
 *   className="absolute -bottom-3 sm:-bottom-6 left-0 sm:-left-6 px-2 sm:px-4 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 backdrop-blur-xl z-20"
 * >
 *   <div className="flex items-center space-x-1.5 sm:space-x-2">
 *     <CheckCircle className="w-3 h-3 sm:w-5 sm:h-5 text-green-400" />
 *     <span className="text-[10px] sm:text-sm font-medium text-green-300">AI is actively engaging</span>
 *   </div>
 * </motion.div>
 * 
 * After:
 * <FloatingStatusBadge
 *   text="AI is actively engaging"
 *   icon={CheckCircle}
 *   position={{ bottom: '-24px', left: '-24px' }}
 *   color="green"
 *   animationDelay={0.5}
 * />
 */
