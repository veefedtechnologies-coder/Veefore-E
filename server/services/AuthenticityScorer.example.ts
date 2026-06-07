/**
 * Example usage of AuthenticityScorer
 * Demonstrates how to score captions for authenticity
 */

import { authenticityScorer, CaptionVoiceProfile } from './AuthenticityScorer';

// Example voice profile
const exampleVoiceProfile: CaptionVoiceProfile = {
  userId: 'user-123',
  workspaceId: 'workspace-456',
  vocabularyFrequency: {
    'love': 15,
    'amazing': 12,
    'excited': 8,
    'awesome': 10,
    'grateful': 6
  },
  signaturePhrases: ['here\'s the thing', 'real talk'],
  sentenceLengthDistribution: {
    short: 35,
    medium: 45,
    long: 20
  },
  paragraphStructure: 'short-breaks',
  emojiUsagePattern: {
    frequency: 'moderate',
    placement: 'inline',
    topEmojis: ['❤️', '🔥', '✨', '💯', '🙌']
  },
  punctuationStyle: {
    exclamationUsage: 'moderate',
    questionUsage: 'frequent',
    ellipsisUsage: false
  },
  toneMarkers: {
    casual: 0.85,
    professional: 0.15,
    humorous: 0.6,
    inspirational: 0.7,
    educational: 0.3,
    conversational: 0.9
  },
  hookPatterns: ['Real talk:', 'Okay so', 'Hot take:'],
  engagementQuestionStyle: ['What do you think?', 'Have you tried this?', 'Let me know!'],
  storytellingStructure: 'buildup',
  sampleSize: 25,
  confidence: 0.88
};

// Example 1: High-quality authentic caption
async function scoreAuthenticCaption() {
  const caption = `Real talk: I just tried this new recipe and I'm OBSESSED! 🔥

The secret? Using fresh ingredients and letting it marinate overnight. Game changer.

Have you ever tried making this at home? Drop your tips below! 💬`;

  const result = await authenticityScorer.scoreCaption(
    caption,
    exampleVoiceProfile,
    'instagram'
  );

  console.log('=== Authentic Caption Score ===');
  console.log(`Overall Score: ${result.overallScore}/100`);
  console.log(`Passes Threshold: ${result.passesThreshold ? 'YES ✓' : 'NO ✗'}`);
  console.log('\nCriteria Breakdown:');
  Object.entries(result.criteriaScores).forEach(([criterion, score]) => {
    console.log(`  ${criterion}: ${score}/10`);
  });
  console.log(`\nAI Tells Detected: ${result.aiTellsDetected.length}`);
  if (result.recommendations.length > 0) {
    console.log('Recommendations:');
    result.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
  console.log('\n');
}

// Example 2: AI-sounding caption (should score low)
async function scoreAICaption() {
  const caption = `Let's delve into the revolutionary journey of optimizing your Instagram strategy.

In today's digital age, it is important to leverage cutting-edge techniques and paradigm shifts to unlock your potential. This comprehensive solution will transform your social media ecosystem and facilitate unprecedented growth.

Are you ready to explore this opportunity?`;

  const result = await authenticityScorer.scoreCaption(
    caption,
    exampleVoiceProfile,
    'instagram'
  );

  console.log('=== AI-Sounding Caption Score ===');
  console.log(`Overall Score: ${result.overallScore}/100`);
  console.log(`Passes Threshold: ${result.passesThreshold ? 'YES ✓' : 'NO ✗'}`);
  console.log('\nCriteria Breakdown:');
  Object.entries(result.criteriaScores).forEach(([criterion, score]) => {
    console.log(`  ${criterion}: ${score}/10`);
  });
  console.log(`\nAI Tells Detected: ${result.aiTellsDetected.length}`);
  result.aiTellsDetected.forEach(tell => console.log(`  - ${tell}`));
  if (result.recommendations.length > 0) {
    console.log('\nRecommendations:');
    result.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
  console.log('\n');
}

// Example 3: Check voice consistency
function checkVoiceConsistency() {
  const caption1 = 'Love this amazing thing! So excited. What do you think?';
  const caption2 = 'We are pleased to announce this revolutionary product.';

  const score1 = authenticityScorer.checkVoiceConsistency(caption1, exampleVoiceProfile);
  const score2 = authenticityScorer.checkVoiceConsistency(caption2, exampleVoiceProfile);

  console.log('=== Voice Consistency Check ===');
  console.log(`Caption 1: "${caption1}"`);
  console.log(`  Voice Consistency: ${score1}/10\n`);
  console.log(`Caption 2: "${caption2}"`);
  console.log(`  Voice Consistency: ${score2}/10\n`);
}

// Run examples
async function runExamples() {
  await scoreAuthenticCaption();
  await scoreAICaption();
  checkVoiceConsistency();
}

// Uncomment to run examples
// runExamples().catch(console.error);

export { runExamples };
