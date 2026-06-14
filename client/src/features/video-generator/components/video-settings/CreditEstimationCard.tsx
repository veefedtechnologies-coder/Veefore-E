import React from 'react';
import { DollarSign, Info } from 'lucide-react';
import { VideoSettings } from '../../types';

interface CreditEstimationCardProps {
  settings: VideoSettings;
}

/**
 * CreditEstimationCard Component
 * 
 * Displays estimated credit cost based on video settings.
 * Requirements: 2.2
 */
export const CreditEstimationCard: React.FC<CreditEstimationCardProps> = ({ settings }) => {
  // Calculate estimated credits based on settings
  const calculateEstimatedCredits = (): number => {
    let creditsPerScene = 0;
    
    switch (settings.motionEngine) {
      case 'Runway Gen-2':
        creditsPerScene = 15; // Average of 10-20
        break;
      case 'AnimateDiff':
        creditsPerScene = 3.5; // Average of 2-5
        break;
      default: // Auto
        creditsPerScene = 8; // Middle ground
    }

    // Estimate number of scenes based on duration
    const estimatedScenes = Math.ceil(settings.duration / 15); // ~15s per scene
    let totalCredits = creditsPerScene * estimatedScenes;

    // Add credits for avatar
    if (settings.avatar) {
      totalCredits += 10 * estimatedScenes; // Avatar adds ~10 credits per scene
    }

    // Add credits for high resolution
    if (settings.resolution === '4K') {
      totalCredits *= 1.5; // 4K costs 50% more
    }

    return Math.ceil(totalCredits);
  };

  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-yellow-200 dark:hover:border-yellow-600 transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
          <DollarSign className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">
          Cost Estimation
        </h3>
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Motion Engine:</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{settings.motionEngine}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Est. Credits per Scene:</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">
            {settings.motionEngine === 'Runway Gen-2' ? '10-20' : 
             settings.motionEngine === 'AnimateDiff' ? '2-5' : 
             'Auto (varies)'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Duration:</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{settings.duration}s</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Estimated Scenes:</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">
            {Math.ceil(settings.duration / 15)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Avatar:</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">
            {settings.avatar ? '+10 credits/scene' : 'Disabled'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Resolution:</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">
            {settings.resolution === '4K' ? '4K (+50%)' : settings.resolution}
          </span>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 dark:text-gray-300 font-semibold">Total Estimate:</span>
            <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {calculateEstimatedCredits()} credits
            </span>
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          <Info className="w-3 h-3 inline mr-1" />
          Actual cost may vary based on final script complexity
        </div>
      </div>
    </div>
  );
};
