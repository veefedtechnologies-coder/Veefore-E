import React from 'react';
import { Zap, Info } from 'lucide-react';
import { VideoSettingsCardProps } from './types';

/**
 * MotionEngineCard Component
 * 
 * Handles motion engine selection and visual style configuration.
 * Requirements: 2.2
 */
export const MotionEngineCard: React.FC<VideoSettingsCardProps> = ({
  settings,
  setSettings,
}) => {
  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-purple-200 dark:hover:border-purple-600 transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center shadow-md">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">
          Motion Engine
        </h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Generation Method
          </label>
          <select
            value={settings.motionEngine}
            onChange={(e) => setSettings(prev => ({ ...prev, motionEngine: e.target.value }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value="Auto">Auto (AI Decides) - Recommended</option>
            <option value="Runway Gen-2">Runway Gen-2 (Cinematic Quality)</option>
            <option value="AnimateDiff">AnimateDiff + Interpolation (Budget)</option>
          </select>
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
          <Info className="w-3 h-3 inline mr-1" />
          {settings.motionEngine === 'Auto' && 'AI analyzes scene complexity and credits to choose the best engine'}
          {settings.motionEngine === 'Runway Gen-2' && 'Premium cinematic quality. 10-20 credits per scene'}
          {settings.motionEngine === 'AnimateDiff' && 'Budget-friendly with smooth interpolation. 2-5 credits per scene'}
        </div>
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Visual Style
          </label>
          <select
            value={settings.visualStyle}
            onChange={(e) => setSettings(prev => ({ ...prev, visualStyle: e.target.value }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value="cinematic">Cinematic</option>
            <option value="realistic">Realistic</option>
            <option value="stylized">Stylized</option>
            <option value="anime">Anime</option>
            <option value="documentary">Documentary</option>
          </select>
        </div>
      </div>
    </div>
  );
};
