/**
 * Voice Consistency Checker Example
 * Task 7.3: Demonstrate multi-dimensional voice matching with 0-100 scoring
 * 
 * This example shows how the voice consistency checker compares generated captions
 * against a user's voice profile across 8+ dimensions and provides actionable feedback
 * for regeneration when consistency score is below 80.
 */

import { AuthenticityScorer, CaptionVoiceProfile } from './AuthenticityScorer';

// Example user voice profile (learned from past captions)
const userVoiceProfile: CaptionVoiceProfile = {
  userId: 'fitness-creator-123',
  workspaceId: 'workspace-456',
  
  // Vocabulary characteristics
  vocabularyFrequency: {
    'love': 15,
    'workout': 12,
    'gains': 10,
    'grind': 8,
    'progress': 7,
    'fitness': 6,
    'healthy': 5,
    'crushing': 5,
    'motivation': 4,
    'beast': 4
  },
  
  signaturePhrases: [
    'let me tell you',
    'real talk',
    'no excuses'
  ],
  
  // Sentence structure patterns
  sentenceLengthDistribution: {
    short: 40,   // 40% short sentences (1-5 words)
    medium: 45,  // 45% medium sentences (6-15 words)
    long: 15     // 15% long sentences (16+ words)
  },
  
  paragraphStructure: 'short-breaks',
  
  // Emoji usage patterns
  emojiUsagePattern: {
    frequency: 'moderate',  // 2-5 emojis per caption
    placement: 'inline',    // Emojis within text
    topEmojis: ['💪', '🔥', '💯', '🏋️', '⚡']
  },
  
  // Punctuation style
  punctuationStyle: {
    exclamationUsage: 'frequent',  // Uses ! often for energy
    questionUsage: 'moderate',     // Occasional questions
    ellipsisUsage: false           // Doesn't use ...
  },
  
  // Tone characteristics (0-1 scores)
  toneMarkers: {
    casual: 0.9,          // Very casual
    professional: 0.1,    // Not professional
    humorous: 0.4,        // Somewhat humorous
    inspirational: 0.8,   // Very inspirational
    educational: 0.5,     // Moderately educational
    conversational: 0.9   // Very conversational
  },
  
  // Opening patterns
  hookPatterns: [
    'Real talk...',
    'Let me tell you something',
    'No excuses today'
  ],
  
  // Engagement question styles
  engagementQuestionStyle: [
    'What about you?',
    'Who\'s with me?',
    'Drop your progress below!'
  ],
  
  storytellingStructure: 'buildup',
  sampleSize: 50,
  confidence: 0.92
};

async function demonstrateVoiceConsistencyChecker() {
  const scorer = new AuthenticityScorer();
  
  console.log('🎯 Voice Consistency Checker Demo\n');
  console.log('=' .repeat(80));
  
  // Test 1: Good voice-matched caption
  console.log('\n📝 Test 1: VOICE-MATCHED Caption (Should score 80+)\n');
  
  const goodCaption = `Real talk... I'm crushing these workouts! 💪

The grind is paying off and I love seeing the progress. No excuses today!

Who's with me? Drop your progress below! 🔥`;
  
  const goodResult = await scorer.compareVoiceProfile(goodCaption, userVoiceProfile);
  
  console.log(`Overall Score: ${goodResult.overallScore}/100 ${goodResult.passesThreshold ? '✅' : '❌'}`);
  console.log(`Passes Threshold (80+): ${goodResult.passesThreshold}\n`);
  
  console.log('Dimension Scores (0-10 each):');
  console.log(`  📚 Vocabulary Match: ${goodResult.dimensions.vocabularyMatch.score.toFixed(1)}/10`);
  console.log(`     - Overlap: ${(goodResult.dimensions.vocabularyMatch.overlap * 100).toFixed(0)}%`);
  console.log(`  🎭 Tone Alignment: ${goodResult.dimensions.toneAlignment.score.toFixed(1)}/10`);
  console.log(`  📐 Structure Match: ${goodResult.dimensions.structureMatch.score.toFixed(1)}/10`);
  console.log(`  ✍️  Signature Phrases: ${goodResult.dimensions.signaturePhraseUsage.score.toFixed(1)}/10`);
  console.log(`     - Used: ${goodResult.dimensions.signaturePhraseUsage.phrasesUsed.join(', ') || 'none'}`);
  console.log(`  ❗ Punctuation Style: ${goodResult.dimensions.punctuationStyle.score.toFixed(1)}/10`);
  console.log(`  😊 Emoji Consistency: ${goodResult.dimensions.emojiConsistency.score.toFixed(1)}/10`);
  console.log(`     - Top emojis used: ${goodResult.dimensions.emojiConsistency.topEmojisUsed.join(' ')}`);
  console.log(`  🎣 Hook Pattern Match: ${goodResult.dimensions.hookPatternMatch.score.toFixed(1)}/10`);
  console.log(`     - Matched: ${goodResult.dimensions.hookPatternMatch.matchedPattern || 'none'}`);
  console.log(`  💬 Engagement Style: ${goodResult.dimensions.engagementStyleMatch.score.toFixed(1)}/10`);
  
  if (goodResult.mismatches.length > 0) {
    console.log(`\n⚠️  Mismatches: ${goodResult.mismatches.length}`);
    goodResult.mismatches.forEach(m => console.log(`   - ${m}`));
  }
  
  // Test 2: Poor voice-mismatched caption
  console.log('\n\n' + '='.repeat(80));
  console.log('\n📝 Test 2: VOICE-MISMATCHED Caption (Should score <80)\n');
  
  const badCaption = `I am delighted to inform you about this revolutionary fitness methodology.

Utilizing advanced paradigms, we can optimize your training regimen to unlock unprecedented results. 

It is worth noting that consistent implementation facilitates transformative outcomes.`;
  
  const badResult = await scorer.compareVoiceProfile(badCaption, userVoiceProfile);
  
  console.log(`Overall Score: ${badResult.overallScore}/100 ${badResult.passesThreshold ? '✅' : '❌'}`);
  console.log(`Passes Threshold (80+): ${badResult.passesThreshold}\n`);
  
  console.log('Dimension Scores (0-10 each):');
  console.log(`  📚 Vocabulary Match: ${badResult.dimensions.vocabularyMatch.score.toFixed(1)}/10`);
  console.log(`     - Overlap: ${(badResult.dimensions.vocabularyMatch.overlap * 100).toFixed(0)}%`);
  console.log(`  🎭 Tone Alignment: ${badResult.dimensions.toneAlignment.score.toFixed(1)}/10`);
  console.log(`  📐 Structure Match: ${badResult.dimensions.structureMatch.score.toFixed(1)}/10`);
  console.log(`  ✍️  Signature Phrases: ${badResult.dimensions.signaturePhraseUsage.score.toFixed(1)}/10`);
  console.log(`  ❗ Punctuation Style: ${badResult.dimensions.punctuationStyle.score.toFixed(1)}/10`);
  console.log(`  😊 Emoji Consistency: ${badResult.dimensions.emojiConsistency.score.toFixed(1)}/10`);
  console.log(`  🎣 Hook Pattern Match: ${badResult.dimensions.hookPatternMatch.score.toFixed(1)}/10`);
  console.log(`  💬 Engagement Style: ${badResult.dimensions.engagementStyleMatch.score.toFixed(1)}/10`);
  
  console.log(`\n⚠️  Mismatches Detected: ${badResult.mismatches.length}`);
  badResult.mismatches.forEach(m => console.log(`   - ${m}`));
  
  console.log(`\n💡 Recommendations (${badResult.recommendations.length}):`);
  badResult.recommendations.forEach(r => console.log(`   - ${r}`));
  
  console.log('\n🔄 Regeneration Guidance:');
  
  if (badResult.regenerationGuidance.vocabularyAdjustments.length > 0) {
    console.log('\n   Vocabulary:');
    badResult.regenerationGuidance.vocabularyAdjustments.forEach(adj => 
      console.log(`     - ${adj}`)
    );
  }
  
  if (badResult.regenerationGuidance.toneAdjustments.length > 0) {
    console.log('\n   Tone:');
    badResult.regenerationGuidance.toneAdjustments.forEach(adj => 
      console.log(`     - ${adj}`)
    );
  }
  
  if (badResult.regenerationGuidance.structureAdjustments.length > 0) {
    console.log('\n   Structure:');
    badResult.regenerationGuidance.structureAdjustments.forEach(adj => 
      console.log(`     - ${adj}`)
    );
  }
  
  if (badResult.regenerationGuidance.styleAdjustments.length > 0) {
    console.log('\n   Style:');
    badResult.regenerationGuidance.styleAdjustments.forEach(adj => 
      console.log(`     - ${adj}`)
    );
  }
  
  // Test 3: Edge case - different niche vocabulary
  console.log('\n\n' + '='.repeat(80));
  console.log('\n📝 Test 3: DIFFERENT NICHE Caption (Wrong vocabulary domain)\n');
  
  const differentNiche = `Just finished this amazing recipe! 🍳

The flavors are incredible and it's so easy to make. Cooking is my passion!

Have you tried meal prepping? Share your favorite recipes below! 🥗`;
  
  const nicheResult = await scorer.compareVoiceProfile(differentNiche, userVoiceProfile);
  
  console.log(`Overall Score: ${nicheResult.overallScore}/100 ${nicheResult.passesThreshold ? '✅' : '❌'}`);
  console.log(`Passes Threshold (80+): ${nicheResult.passesThreshold}\n`);
  
  console.log('Key Issue: Wrong vocabulary domain (cooking vs. fitness)');
  console.log(`Vocabulary Overlap: ${(nicheResult.dimensions.vocabularyMatch.overlap * 100).toFixed(0)}%`);
  console.log(`Unexpected Words: ${nicheResult.dimensions.vocabularyMatch.unexpectedWords.slice(0, 5).join(', ')}`);
  
  console.log('\n\n' + '='.repeat(80));
  console.log('\n✅ Summary\n');
  console.log('The voice consistency checker:');
  console.log('  ✓ Compares captions across 8+ dimensions');
  console.log('  ✓ Provides 0-100 scoring with 80+ threshold');
  console.log('  ✓ Detects specific mismatches for each dimension');
  console.log('  ✓ Generates actionable regeneration guidance');
  console.log('  ✓ Flags deviations so system can regenerate if needed\n');
}

// Run the demo
demonstrateVoiceConsistencyChecker().catch(console.error);
