import React from 'react';
import { User } from 'lucide-react';
import { VideoSettingsCardProps } from './types';

/**
 * AvatarVisualCard Component
 * 
 * Handles avatar settings, captions, and on-screen text configuration.
 * Requirements: 2.2
 */
export const AvatarVisualCard: React.FC<VideoSettingsCardProps> = ({
  settings,
  setSettings,
}) => {
  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-indigo-200 dark:hover:border-indigo-600 transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md">
          <User className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">
          Avatar & Visual Features
        </h3>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
          <div>
            <span className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block">
              AI Avatar
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              Talking head with lip sync
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.avatar}
            onChange={(e) => setSettings(prev => ({ ...prev, avatar: e.target.checked }))}
            className="rounded"
          />
        </div>
        {settings.avatar && (
          <>
            <div>
              <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
                Avatar Style
              </label>
              <select
                value={settings.avatarStyle}
                onChange={(e) => setSettings(prev => ({ ...prev, avatarStyle: e.target.value }))}
                className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
              >
                <option value="realistic">Realistic</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="animated">Animated</option>
              </select>
            </div>
            <div>
              <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
                Avatar Position
              </label>
              <select
                value={settings.avatarPosition}
                onChange={(e) => setSettings(prev => ({ ...prev, avatarPosition: e.target.value }))}
                className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
              >
                <option value="corner">Corner Overlay</option>
                <option value="intro-only">Intro Only (5-10s)</option>
                <option value="fullscreen">Full Screen</option>
                <option value="cutins">Story Cut-ins</option>
              </select>
            </div>
          </>
        )}
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
          <div>
            <span className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block">
              Auto Captions
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              AI-generated subtitles
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.captions}
            onChange={(e) => setSettings(prev => ({ ...prev, captions: e.target.checked }))}
            className="rounded"
          />
        </div>
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
          <div>
            <span className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block">
              On-Screen Text
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              Key quotes & highlights
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.onScreenText}
            onChange={(e) => setSettings(prev => ({ ...prev, onScreenText: e.target.checked }))}
            className="rounded"
          />
        </div>
      </div>
    </div>
  );
};
