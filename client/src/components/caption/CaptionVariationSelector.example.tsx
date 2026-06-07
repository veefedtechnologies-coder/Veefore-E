import React, { useState } from 'react';
import { CaptionVariationSelector, CaptionVariation } from './CaptionVariationSelector';

/**
 * Example component demonstrating CaptionVariationSelector usage
 * This file serves as a reference for implementation and testing
 */

const mockVariations: CaptionVariation[] = [
  {
    caption: "POV: You finally found the perfect recipe that doesn't require 47 ingredients 🎉\n\nYes, this is THAT easy. No fancy equipment, no mystery ingredients, just pure deliciousness. Made it 3 times this week already and my family is OBSESSED.\n\nSave this for later and try it this weekend! 👇\n\nWhat's your go-to easy dinner? Drop it below! 👇",
    hashtags: ['#EasyRecipes', '#QuickDinner', '#FoodiesOfInstagram', '#HomeCooking'],
    authenticityScore: 92,
    engagementPrediction: {
      likeRate: 0.065,
      commentRate: 0.028,
      saveRate: 0.042,
      shareRate: 0.015,
      confidence: 0.87
    },
    styleCharacteristics: {
      type: 'viral',
      description: 'Maximum virality with trending hook pattern and strong call-to-action',
      patterns: ['POV Hook', 'Story-Insight-Question'],
      hooks: ['POV:', 'Drop it below']
    }
  },
  {
    caption: "I used to spend hours stressing about what to make for dinner. Then I discovered this simple approach that changed everything.\n\nThis recipe isn't fancy. It's not going to win awards. But it's become my family's favorite weeknight meal, and that matters more than anything else.\n\nThe best part? You probably have most ingredients already. No special trips to specialty stores. No complicated techniques. Just real food that brings people together.\n\nThat's what cooking should be about, right? Not perfection, but connection.\n\nWhat's a simple recipe that means a lot to your family?",
    hashtags: ['#RealFood', '#FamilyDinner', '#SimpleCooking', '#HomeChef'],
    authenticityScore: 95,
    engagementPrediction: {
      likeRate: 0.048,
      commentRate: 0.035,
      saveRate: 0.038,
      shareRate: 0.012,
      confidence: 0.82
    },
    styleCharacteristics: {
      type: 'authentic',
      description: 'Personal storytelling that emphasizes connection and relatability over virality',
      patterns: ['Personal Journey', 'Vulnerable Sharing'],
      hooks: ['I used to...', 'Then I discovered...']
    }
  },
  {
    caption: "Easy weeknight dinner that actually lives up to the promise ✨\n\nThis one's been on repeat at our house lately. Quick enough for busy nights, but tastes like you put in way more effort than you did.\n\nHere's why it works:\n→ Minimal prep time (seriously)\n→ Ingredients you probably have\n→ Leftovers taste even better\n\nThe trick is [technique tip here]. Makes all the difference.\n\nSwipe to see the full recipe → or save this for later when you need dinner inspiration.\n\nAny requests for next week's recipe?",
    hashtags: ['#WeekNightDinner', '#EasyCooking', '#RecipeIdeas', '#HomemadeMeals'],
    authenticityScore: 88,
    engagementPrediction: {
      likeRate: 0.055,
      commentRate: 0.030,
      saveRate: 0.045,
      shareRate: 0.013,
      confidence: 0.85
    },
    styleCharacteristics: {
      type: 'balanced',
      description: 'Proven engagement formula balanced with authentic voice and useful structure',
      patterns: ['Listicle Format', 'Benefit Stack'],
      hooks: ['Here\'s why it works', 'The trick is...']
    }
  }
];

export function CaptionVariationSelectorExample() {
  const [variations, setVariations] = useState<CaptionVariation[]>(mockVariations);
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectVariation = (index: number, variation: CaptionVariation) => {
    setSelectedIndex(index);
    console.log('Selected variation:', {
      index,
      type: variation.styleCharacteristics.type,
      authenticityScore: variation.authenticityScore,
      caption: variation.caption.substring(0, 50) + '...'
    });
  };

  const handleRegenerateAll = () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      // In real implementation, this would fetch new variations from API
      console.log('Regenerating variations...');
      setSelectedIndex(undefined);
      setIsLoading(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Caption Variation Selector - Example
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Interactive example demonstrating the CaptionVariationSelector component with mock data
          </p>
        </div>

        {/* Debug Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Debug Information
          </h2>
          <div className="space-y-1 text-xs font-mono text-gray-600 dark:text-gray-400">
            <div>Selected Index: {selectedIndex ?? 'None'}</div>
            <div>Variations Count: {variations.length}</div>
            <div>Loading: {isLoading ? 'Yes' : 'No'}</div>
            {selectedIndex !== undefined && (
              <>
                <div>Selected Type: {variations[selectedIndex].styleCharacteristics.type}</div>
                <div>Authenticity Score: {variations[selectedIndex].authenticityScore}</div>
              </>
            )}
          </div>
        </div>

        {/* Component */}
        <CaptionVariationSelector
          variations={variations}
          onSelectVariation={handleSelectVariation}
          onRegenerateAll={handleRegenerateAll}
          isLoading={isLoading}
          selectedIndex={selectedIndex}
        />

        {/* Selected Caption Display */}
        {selectedIndex !== undefined && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-3">
              ✓ Selected Caption Applied
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-green-800 dark:text-green-200">
                  Caption Text:
                </label>
                <p className="mt-1 text-sm text-green-700 dark:text-green-300 whitespace-pre-wrap">
                  {variations[selectedIndex].caption}
                </p>
              </div>
              {variations[selectedIndex].hashtags && (
                <div>
                  <label className="text-sm font-medium text-green-800 dark:text-green-200">
                    Suggested Hashtags:
                  </label>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                    {variations[selectedIndex].hashtags?.join(' ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Usage Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
            How to Use in Your Application
          </h2>
          <ol className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
            <li>1. Generate caption variations from your AI API</li>
            <li>2. Pass the variations array to the component</li>
            <li>3. Handle the onSelectVariation callback to apply the chosen caption</li>
            <li>4. Handle the onRegenerateAll callback to fetch new variations</li>
            <li>5. Optionally track which variation was selected for learning purposes</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default CaptionVariationSelectorExample;
