import React from 'react';
import { Mic } from 'lucide-react';
import { VideoSettingsCardProps } from './types';

/**
 * VoiceAudioCard Component
 * 
 * Handles voice gender, language, tone, and background music settings.
 * Requirements: 2.2
 */
export const VoiceAudioCard: React.FC<VideoSettingsCardProps> = ({
  settings,
  setSettings,
}) => {
  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-emerald-200 dark:hover:border-emerald-600 transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md">
          <Mic className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">
          Voice & Audio
        </h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Voice Gender
          </label>
          <select
            value={settings.voiceGender}
            onChange={(e) => setSettings(prev => ({ ...prev, voiceGender: e.target.value }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Language & Accent
          </label>
          <select
            value={settings.voiceLanguage}
            onChange={(e) => setSettings(prev => ({ ...prev, voiceLanguage: e.target.value }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value="English">English (American)</option>
            <option value="English-UK">English (British)</option>
            <option value="English-AU">English (Australian)</option>
            <option value="Hindi">Hindi (Indian)</option>
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
          </select>
        </div>
        <div>
          <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal block mb-2">
            Voice Tone
          </label>
          <select
            value={settings.voiceTone}
            onChange={(e) => setSettings(prev => ({ ...prev, voiceTone: e.target.value }))}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 border-none p-3 text-gray-900 dark:text-gray-100 focus:outline-0 focus:ring-0"
          >
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="energetic">Energetic</option>
            <option value="calm">Calm</option>
          </select>
        </div>
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
          <span className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal">
            Background Music
          </span>
          <input
            type="checkbox"
            checked={settings.backgroundMusic}
            onChange={(e) => setSettings(prev => ({ ...prev, backgroundMusic: e.target.checked }))}
            className="rounded"
          />
        </div>
      </div>
    </div>
  );
};
