import React from 'react';
import { Clock } from 'lucide-react';
import { VideoSettingsCardProps } from './types';

/**
 * DurationQualityCard Component
 * 
 * Handles video duration, resolution, aspect ratio, and FPS settings.
 * Requirements: 2.2
 */
export const DurationQualityCard: React.FC<VideoSettingsCardProps> = ({
  settings,
  setSettings,
  errors,
}) => {
  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-purple-200 dark:hover:border-purple-600 transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
          <Clock className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">
          Duration & Quality
        </h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Video Duration
          </label>
          <select
            value={settings.duration}
            onChange={(e) => setSettings(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value={15}>15 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={90}>1.5 minutes</option>
            <option value={120}>2 minutes</option>
            <option value={180}>3 minutes</option>
          </select>
          {errors.duration && (
            <p className="text-red-500 text-xs mt-1">{errors.duration}</p>
          )}
        </div>
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Resolution
          </label>
          <select
            value={settings.resolution}
            onChange={(e) => setSettings(prev => ({ ...prev, resolution: e.target.value }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value="720p">720p HD</option>
            <option value="1080p">1080p Full HD</option>
            <option value="4K">4K Ultra HD</option>
          </select>
          {errors.resolution && (
            <p className="text-red-500 text-xs mt-1">{errors.resolution}</p>
          )}
        </div>
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Aspect Ratio
          </label>
          <select
            value={settings.aspectRatio}
            onChange={(e) => setSettings(prev => ({ ...prev, aspectRatio: e.target.value }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value="16:9">16:9 Landscape</option>
            <option value="9:16">9:16 Portrait</option>
            <option value="1:1">1:1 Square</option>
            <option value="4:3">4:3 Classic</option>
          </select>
          {errors.aspectRatio && (
            <p className="text-red-500 text-xs mt-1">{errors.aspectRatio}</p>
          )}
        </div>
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Frame Rate (FPS)
          </label>
          <select
            value={settings.fps}
            onChange={(e) => setSettings(prev => ({ ...prev, fps: parseInt(e.target.value) }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value={24}>24 FPS (Cinematic)</option>
            <option value={30}>30 FPS (Standard)</option>
            <option value={60}>60 FPS (Smooth)</option>
          </select>
          {errors.fps && (
            <p className="text-red-500 text-xs mt-1">{errors.fps}</p>
          )}
        </div>
      </div>
    </div>
  );
};
