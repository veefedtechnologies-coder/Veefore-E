import React from 'react';
import { Video, Settings } from 'lucide-react';
import { VideoSettings } from '../types';
import {
  DurationQualityCard,
  MotionEngineCard,
  VoiceAudioCard,
  AvatarVisualCard,
  EffectsTransitionsCard,
  BackgroundMusicCard,
  CreditEstimationCard,
} from './video-settings';

interface VideoSettingsStepProps {
  settings: VideoSettings;
  setSettings: React.Dispatch<React.SetStateAction<VideoSettings>>;
  onNext: () => void;
  onBack: () => void;
}

/**
 * VideoSettingsStep Component
 * 
 * Displays comprehensive video configuration interface with validation.
 * Features:
 * - Duration, aspect ratio, resolution, and FPS settings
 * - Motion engine selection with cost estimation
 * - Voice and audio configuration (ElevenLabs integration)
 * - Avatar settings (Hedra integration)
 * - Effects, transitions, and advanced features
 * - Form validation for settings constraints
 * - Credit cost estimation display
 * 
 * Requirements: 2.2, 2.4
 * Validates: Requirements as specified in design.md
 */
export const VideoSettingsStep: React.FC<VideoSettingsStepProps> = ({
  settings,
  setSettings,
  onNext,
  onBack,
}) => {
  // Form validation
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const validateSettings = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Duration validation (5-180 seconds)
    if (settings.duration < 5 || settings.duration > 180) {
      newErrors.duration = 'Duration must be between 5 and 180 seconds';
    }

    // Aspect ratio validation
    const validAspectRatios = ['16:9', '9:16', '1:1', '4:3'];
    if (!validAspectRatios.includes(settings.aspectRatio)) {
      newErrors.aspectRatio = 'Invalid aspect ratio selected';
    }

    // Resolution validation
    const validResolutions = ['720p', '1080p', '4K'];
    if (!validResolutions.includes(settings.resolution)) {
      newErrors.resolution = 'Invalid resolution selected';
    }

    // FPS validation (24, 30, 60)
    const validFps = [24, 30, 60];
    if (!validFps.includes(settings.fps)) {
      newErrors.fps = 'FPS must be 24, 30, or 60';
    }

    // Voice stability validation (0-1)
    if (settings.voiceStability < 0 || settings.voiceStability > 1) {
      newErrors.voiceStability = 'Voice stability must be between 0 and 1';
    }

    // Voice similarity validation (0-1)
    if (settings.voiceSimilarity < 0 || settings.voiceSimilarity > 1) {
      newErrors.voiceSimilarity = 'Voice similarity must be between 0 and 1';
    }

    // Music volume validation (0-1)
    if (settings.musicVolume < 0 || settings.musicVolume > 1) {
      newErrors.musicVolume = 'Music volume must be between 0 and 1';
    }

    // Speed control validation (0.5-2.0)
    if (settings.speedControl < 0.5 || settings.speedControl > 2.0) {
      newErrors.speedControl = 'Speed control must be between 0.5x and 2.0x';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateSettings()) {
      onNext();
    }
  };

  return (
    <div 
      className="relative flex size-full min-h-screen flex-col bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300"
      style={{ fontFamily: '"Space Grotesk", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex min-h-screen flex-col">
        {/* Header */}
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-gray-200 dark:border-gray-700 px-10 py-3 bg-white dark:bg-gray-800 shadow-sm transition-colors duration-300">
          <div className="flex items-center gap-4 text-gray-900 dark:text-gray-100">
            <div className="size-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg">
              <Video className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">
              VeeFore Studio
            </h2>
          </div>
        </header>

        {/* Main content area */}
        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col max-w-[960px] flex-1">
            {/* Title section */}
            <div className="text-center mb-8 animate-fade-in-up">
              <div className="inline-flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 via-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg animate-pulse">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-gray-900 dark:text-gray-100 tracking-light text-[32px] font-bold leading-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Configure Your Video Settings
                </h1>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-base font-normal leading-normal max-w-2xl mx-auto">
                Customize every aspect of your video creation with our advanced AI-powered settings.
              </p>
              
              {/* Progress indicator */}
              <div className="flex items-center justify-center gap-2 mt-6">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <div className="w-8 h-2 bg-purple-500 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Step 2 of 5 - Video Configuration</p>
            </div>

            {/* Settings Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 px-4 animate-fade-in-up">
              
              <DurationQualityCard settings={settings} setSettings={setSettings} errors={errors} />

              <MotionEngineCard settings={settings} setSettings={setSettings} errors={errors} />

              <VoiceAudioCard settings={settings} setSettings={setSettings} errors={errors} />

              <AvatarVisualCard settings={settings} setSettings={setSettings} errors={errors} />

              <EffectsTransitionsCard settings={settings} setSettings={setSettings} errors={errors} />

              <BackgroundMusicCard settings={settings} setSettings={setSettings} errors={errors} />

              <CreditEstimationCard settings={settings} />
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center mt-12 px-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200"
              >
                Continue to Script
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

