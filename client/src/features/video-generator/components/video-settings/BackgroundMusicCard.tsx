import React from 'react';
import { Music } from 'lucide-react';
import { VideoSettingsCardProps } from './types';

/**
 * BackgroundMusicCard Component
 * 
 * Handles background music settings including genre and volume.
 * Requirements: 2.2
 */
export const BackgroundMusicCard: React.FC<VideoSettingsCardProps> = ({
  settings,
  setSettings,
  errors,
}) => {
  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-pink-200 dark:hover:border-pink-600 transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-600 rounded-lg flex items-center justify-center shadow-md">
          <Music className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">
          Background Music
        </h3>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
          <div>
            <span className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block">
              Enable Music
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              Add background soundtrack
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.backgroundMusic}
            onChange={(e) => setSettings(prev => ({ ...prev, backgroundMusic: e.target.checked }))}
            className="rounded"
          />
        </div>
        {settings.backgroundMusic && (
          <>
            <div>
              <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
                Music Genre
              </label>
              <select
                value={settings.musicGenre}
                onChange={(e) => setSettings(prev => ({ ...prev, musicGenre: e.target.value }))}
                className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
              >
                <option value="corporate">Corporate</option>
                <option value="cinematic">Cinematic</option>
                <option value="upbeat">Upbeat</option>
                <option value="ambient">Ambient</option>
                <option value="emotional">Emotional</option>
                <option value="tech">Tech/Electronic</option>
              </select>
            </div>
            <div>
              <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
                Music Volume
              </label>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.1"
                value={settings.musicVolume}
                onChange={(e) => setSettings(prev => ({ ...prev, musicVolume: parseFloat(e.target.value) }))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>Quiet</span>
                <span>{Math.round(settings.musicVolume * 100)}%</span>
                <span>Loud</span>
              </div>
              {errors.musicVolume && (
                <p className="text-red-500 text-xs mt-1">{errors.musicVolume}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
