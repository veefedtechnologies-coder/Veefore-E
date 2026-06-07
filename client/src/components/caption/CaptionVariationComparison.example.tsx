import React from 'react';
import { CaptionVariationComparison } from './CaptionVariationComparison';
import { CaptionVariation } from './CaptionVariationSelector';

/**
 * Example usage of CaptionVariationComparison component
 * 
 * This component provides a side-by-side comparison view for caption variations,
 * helping users understand differences and choose the best option.
 */

// Mock data for demonstration
const mockVariations: CaptionVariation[] = [
  {
    caption: `🔥 HOT TAKE: The fitness industry has been lying to you about "quick results"

Here's what 10 years of training taught me:

The secret isn't working harder. It's working smarter.

Your body doesn't care about your New Year's resolution. It cares about consistency.

Stop chasing 30-day transformations. Start building sustainable habits.

The real transformation happens when you stop looking for shortcuts.

What's one fitness myth you wish you knew earlier? 👇`,
    hashtags: [
      '#FitnessReality',
      '#NoQuickFixes',
      '#ConsistencyIsKey',
      '#SmartTraining',
      '#SustainableFitness',
      '#FitnessJourney',
      '#RealTalk',
      '#TransformationTruth',
      '#WorkSmarter',
      '#FitnessMindset',
      '#LongTermGains',
      '#HabitBuilding',
      '#FitnessMyth',
      '#TrainingWisdom',
      '#FitLife'
    ],
    authenticityScore: 92,
    engagementPrediction: {
      likeRate: 0.048,
      commentRate: 0.015,
      saveRate: 0.025,
      shareRate: 0.009,
      confidence: 0.87
    },
    styleCharacteristics: {
      type: 'viral',
      description: 'Maximum virality with aggressive hook and trending patterns',
      patterns: ['Hot-Take-Hook', 'List-Format', 'Question-CTA'],
      hooks: ['HOT TAKE:', "Here's what"]
    }
  },
  {
    caption: `Real talk: I wasted 5 years chasing the "perfect" workout plan.

Then I realized something that changed everything...

The best workout isn't the one with the fanciest exercises. It's the one you'll actually do consistently.

I stopped program-hopping. Started showing up. Even when it was just 20 minutes.

Those "imperfect" sessions? They added up to the best shape of my life.

Progress isn't about perfection. It's about showing up.

Anyone else recovering from program-hopping syndrome? 😅`,
    hashtags: [
      '#FitnessJourney',
      '#ConsistencyWins',
      '#RealTalk',
      '#WorkoutMotivation',
      '#ProgressNotPerfection',
      '#FitnessTransformation',
      '#ShowUpForYourself',
      '#SmallStepsBigResults',
      '#PersonalGrowth',
      '#FitnessReality',
      '#LifestyleChange',
      '#FitnessMindset',
      '#AuthenticFitness',
      '#BestShapeEver',
      '#NoMoreExcuses'
    ],
    authenticityScore: 95,
    engagementPrediction: {
      likeRate: 0.042,
      commentRate: 0.018,
      saveRate: 0.022,
      shareRate: 0.007,
      confidence: 0.91
    },
    styleCharacteristics: {
      type: 'authentic',
      description: 'Personal storytelling with authentic voice',
      patterns: ['Personal-Story', 'Transformation-Arc', 'Relatable-Question'],
      hooks: ['Real talk:', 'Then I realized']
    }
  },
  {
    caption: `After 10 years in the gym, here's what actually works:

✅ Show up 3-4x per week (even if just 30 mins)
✅ Progressive overload on basic movements
✅ Eat enough protein (0.8g per lb bodyweight)
✅ Sleep 7-8 hours consistently
✅ Track your workouts

You don't need:
❌ The latest supplement stack
❌ Perfect meal timing
❌ 2-hour gym sessions
❌ Complicated programs

Focus on the basics. Do them well. Do them consistently.

Results will follow.

Which one of these do you struggle with most? Drop a number 1-5 👇`,
    hashtags: [
      '#FitnessTips',
      '#WorkoutBasics',
      '#ProgressiveOverload',
      '#FitnessAdvice',
      '#GymMotivation',
      '#SimpleFitness',
      '#ConsistencyWins',
      '#FitnessEducation',
      '#TrainingTips',
      '#ResultsMatter',
      '#BasicsMatter',
      '#FitnessSimplified',
      '#GymTips',
      '#StrengthTraining',
      '#HealthyLiving'
    ],
    authenticityScore: 88,
    engagementPrediction: {
      likeRate: 0.045,
      commentRate: 0.014,
      saveRate: 0.028,
      shareRate: 0.008,
      confidence: 0.84
    },
    styleCharacteristics: {
      type: 'balanced',
      description: 'Proven formula with unique voice',
      patterns: ['List-Format', 'Do-Dont-Contrast', 'Numbered-CTA'],
      hooks: ["Here's what", 'After X years']
    }
  }
];

export function CaptionVariationComparisonExample() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Caption Variation Comparison</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Side-by-side comparison view for analyzing and choosing caption variations
        </p>
      </div>

      {/* Example 1: All three variations */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Example 1: Compare All Variations</h2>
        <CaptionVariationComparison
          variations={mockVariations}
          selectedIndices={[0, 1, 2]}
          maxVariations={3}
        />
      </section>

      {/* Example 2: Two variations only */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Example 2: Compare Two Variations</h2>
        <CaptionVariationComparison
          variations={mockVariations}
          selectedIndices={[0, 2]}
          maxVariations={2}
        />
      </section>

      {/* Example 3: With close handler */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Example 3: With Close Handler</h2>
        <CaptionVariationComparison
          variations={mockVariations}
          selectedIndices={[0, 1, 2]}
          onClose={() => console.log('Comparison closed')}
        />
      </section>
    </div>
  );
}

export default CaptionVariationComparisonExample;
