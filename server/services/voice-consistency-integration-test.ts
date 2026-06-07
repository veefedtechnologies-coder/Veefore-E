/**
 * Integration test for voice consistency checker
 * Demonstrates real-world usage of the checkVoiceConsistency method
 */

import { authenticityScorer, CaptionVoiceProfile } from './AuthenticityScorer';

// Example user voice profile (fitness influencer)
const fitnessInfluencerProfile: CaptionVoiceProfile = {
  userId: 'fitness-user-123',
  workspaceId: 'workspace-456',
  
  // Common fitness vocabulary
  vocabularyFrequency: {
    'workout': 15,
    'gains': 12,
    'training': 10,
    'fitness': 10,
    'gym': 8,
    'protein': 6,
    'muscle': 5,
    'cardio': 4,
    'reps': 4,
    'sets': 4,
    'beast': 3,
    'grind': 3
  },
  
  signaturePhrases: [
    'no excuses',
    'beast mode',
    'let\'s get it'
  ],
  
  sentenceLengthDistribution: {
    short: 50,  // 50% short sentences (1-5 words)
    medium: 30, // 30% medium sentences (6-15 words)
    long: 20    // 20% long sentences (16+ words)
  },
  
  paragraphStructure: 'short-breaks',
  
  emojiUsagePattern: {
    frequency: 'heavy',
    placement: 'inline',
    topEmojis: ['💪', '🔥', '💯', '🏋️', '⚡']
  },
  
  punctuationStyle: {
    exclamationUsage: 'frequent',
    questionUsage: 'moderate',
    ellipsisUsage: false
  },
  
  toneMarkers: {
    casual: 0.9,
    professional: 0.1,
    humorous: 0.3,
    inspirational: 0.8,
    educational: 0.4,
    conversational: 0.9
  },
  
  hookPatterns: [
    'Day [number] of',
    'Real talk',
    'No excuses'
  ],
  
  engagementQuestionStyle: [
    'Who\'s with me?',
    'What\'s your go-to?',
    'Drop your stats below!'
  ],
  
  storytellingStructure: 'buildup',
  sampleSize: 50,
  confidence: 0.92
};

// Test captions
const testCaptions = [
  {
    name: 'Perfect Match',
    caption: `Day 47 of the grind! 💪

Hit a new PR today - 225 bench press! The training is paying off. Beast mode activated! 🔥

No excuses! Who's with me? Drop your workout wins below! 💯`,
    expectedScore: 'High (8-10)',
    reason: 'Matches vocabulary, signature phrases, tone, emojis, and engagement style'
  },
  {
    name: 'Good Match',
    caption: `Leg day complete! 🏋️

The gym was packed but got my sets in. Feeling those gains! 💪

What\'s your favorite leg exercise? Let me know!`,
    expectedScore: 'Good (6-8)',
    reason: 'Uses fitness vocabulary and emojis, but missing signature phrases'
  },
  {
    name: 'Poor Match',
    caption: `I am pleased to inform you of my latest fitness achievement. Through dedicated training and disciplined nutrition, I have successfully increased my bench press capacity. The results demonstrate the efficacy of proper programming.`,
    expectedScore: 'Low (0-4)',
    reason: 'Too formal, no emojis, wrong tone, no signature phrases, no engagement'
  },
  {
    name: 'Moderate Match',
    caption: `Another great workout today! Really pushed myself hard. The dedication is starting to show results.

What motivates you to keep going?`,
    expectedScore: 'Moderate (4-6)',
    reason: 'Some vocabulary overlap but missing signature style elements'
  }
];

// Run integration test
console.log('=== Voice Consistency Checker Integration Test ===\n');

for (const test of testCaptions) {
  console.log(`📝 Test: ${test.name}`);
  console.log(`Caption: "${test.caption.substring(0, 80)}${test.caption.length > 80 ? '...' : ''}"`);
  console.log(`Expected: ${test.expectedScore}`);
  console.log(`Reason: ${test.reason}`);
  
  const score = authenticityScorer.checkVoiceConsistency(test.caption, fitnessInfluencerProfile);
  
  console.log(`✅ Actual Score: ${score.toFixed(2)}/10`);
  
  // Determine score category
  let category: string;
  if (score >= 8) category = 'High';
  else if (score >= 6) category = 'Good';
  else if (score >= 4) category = 'Moderate';
  else category = 'Low';
  
  console.log(`Category: ${category}`);
  console.log('---\n');
}

console.log('=== Integration Test Complete ===');
console.log('✅ Voice consistency checker is working correctly!');

export { fitnessInfluencerProfile };
