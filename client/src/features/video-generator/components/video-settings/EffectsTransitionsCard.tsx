import React from 'react';
import { Sparkles } from 'lucide-react';
import { VideoSettingsCardProps } from './types';

/**
 * EffectsTransitionsCard Component
 * 
 * Handles transition styles, zoom effects, color grading, and speed control.
 * Requirements: 2.2
 */
export const EffectsTransitionsCard: React.FC<VideoSettingsCardProps> = ({
  settings,
  setSettings,
  errors,
}) => {
  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-orange-200 dark:hover:border-orange-600 transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-md">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">
          Effects & Transitions
        </h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Transition Style
          </label>
          <select
            value={settings.transitions}
            onChange={(e) => setSettings(prev => ({ ...prev, transitions: e.target.value }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value="smooth">Smooth Fade</option>
            <option value="crossfade">Cross Fade</option>
            <option value="slide">Slide Transition</option>
            <option value="wipe">Wipe Effect</option>
            <option value="zoom">Zoom Transition</option>
          </select>
        </div>
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
          <div>
            <span className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block">
              Zoom Effects
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              Dynamic camera movements
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.zoomEffects}
            onChange={(e) => setSettings(prev => ({ ...prev, zoomEffects: e.target.checked }))}
            className="rounded"
          />
        </div>
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
          <div>
            <span className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block">
              Color Grading
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              Cinematic color correction
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.enableColorGrading}
            onChange={(e) => setSettings(prev => ({ ...prev, enableColorGrading: e.target.checked }))}
            className="rounded"
          />
        </div>
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Speed Control
          </label>
          <select
            value={settings.speedControl}
            onChange={(e) => setSettings(prev => ({ ...prev, speedControl: parseFloat(e.target.value) }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value={0.5}>0.5x (Slow Motion)</option>
            <option value={0.75}>0.75x (Slow)</option>
            <option value={1.0}>1.0x (Normal)</option>
            <option value={1.25}>1.25x (Fast)</option>
            <option value={1.5}>1.5x (Faster)</option>
            <option value={2.0}>2.0x (Time-lapse)</option>
          </select>
          {errors.speedControl && (
            <p className="text-red-500 text-xs mt-1">{errors.speedControl}</p>
          )}
        </div>
      </div>
    </div>
  );
};
