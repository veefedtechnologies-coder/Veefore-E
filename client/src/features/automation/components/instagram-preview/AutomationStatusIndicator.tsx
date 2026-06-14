import React from 'react';
import { Target, Hash } from 'lucide-react';

interface AutomationStatusIndicatorProps {
  currentStep: number;
  automationType?: string;
  currentKeywords: string[];
}

/**
 * AutomationStatusIndicator Component
 * Displays the current automation status and configuration at the bottom of the preview
 */
export const AutomationStatusIndicator: React.FC<AutomationStatusIndicatorProps> = ({ 
  currentStep, 
  automationType, 
  currentKeywords 
}) => {
  const automationTypes = [
    { id: 'comment_dm', name: 'Comment to DM' },
    { id: 'dm_only', name: 'DM Only' },
    { id: 'comment_only', name: 'Comment Only' }
  ];

  return (
    <div className={`p-4 rounded-b-3xl ${
      currentStep >= 2 && automationType 
        ? 'bg-gradient-to-r from-emerald-500 to-teal-500' 
        : 'bg-emerald-500'
    }`}>
      <div className="flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4" />
          <span className="text-sm font-medium">
            {currentStep >= 2 && automationType 
              ? `${automationTypes.find(t => t.id === automationType)?.name} Active` 
              : 'Select Automation Type'}
          </span>
        </div>
        {currentStep >= 2 && currentKeywords.length > 0 && (
          <div className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            <span className="text-xs">{currentKeywords.length} triggers</span>
          </div>
        )}
      </div>
      {currentStep >= 2 && automationType && (
        <div className="mt-2 text-xs text-emerald-100">
          Monitoring: {currentKeywords.join(', ') || 'All comments'}
        </div>
      )}
    </div>
  );
};

export default AutomationStatusIndicator;
