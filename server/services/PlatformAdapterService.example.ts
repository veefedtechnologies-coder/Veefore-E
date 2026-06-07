/**
 * PlatformAdapterService Usage Examples
 * 
 * This file demonstrates how to use the PlatformAdapterService
 * to adapt captions for different social media platforms.
 */

import { PlatformAdapterService } from './PlatformAdapterService';
import { VoiceProfile } from './VoiceProfileService';

// Initialize the service
const platformAdapter = new PlatformAdapterService();

/**
 * Example 1: Get platform constraints
 */
async function example1_GetPlatformConstraints() {
  console.log('=== Example 1: Get Platform Constraints ===\n');

  // Get Twitter constraints
  const twitterConstraints = platformAdapter.getPlatformConstraints('twitter');
  console.log('Twitter Constraints:');
  console.log(`- Character Limit: ${twitterConstraints.characterLimit}`);
  console.log(`- Hashtag Limit: ${twitterConstraints.hashtagLimit} (practical: 2-3)`);
  console.log(`- Emoji Style: ${twitterConstraints.emojiStyle}`);
  console.log(`- Tone: ${twitterConstraints.toneGuidelines}\n`);

  // Get LinkedIn constraints
  const linkedinConstraints = platformAdapter.getPlatformConstraints('linkedin');
  console.log('LinkedIn Constraints:');
  console.log(`- Character Limit: ${linkedinConstraints.characterLimit}`);
  console.log(`- Hashtag Limit: ${linkedinConstraints.hashtagLimit}`);
  console.log(`- Emoji Style: ${linkedinConstraints.emojiStyle}`);
  console.log(`- Tone: ${linkedinConstraints.toneGuidelines}\n`);
}

/**
 * Example 2: Validate a caption for a platform
 */
async function example2_ValidateCaption() {
  console.log('=== Example 2: Validate Caption ===\n');

  const longCaption = `
This is a really long caption that might exceed Twitter's character limit!

I'm sharing all these amazing insights about content marketing, social media strategy, and how to grow your audience organically.

There are so many things I want to tell you about building an authentic online presence and creating content that resonates with your target audience.

#marketing #socialmedia #content #digital #strategy #growth #business #entrepreneur #smallbusiness #contentcreator
  `.trim();

  const validation = platformAdapter.validateForPlatform(longCaption, 'twitter');

  console.log('Caption Validation for Twitter:');
  console.log(`- Valid: ${validation.isValid}`);
  console.log(`- Character Count: ${validation.characterCount}/280`);
  console.log(`- Hashtag Count: ${validation.hashtagCount}`);
  console.log(`- Errors: ${validation.errors.length > 0 ? validation.errors.join(', ') : 'None'}`);
  console.log(`- Warnings: ${validation.warnings.length > 0 ? validation.warnings.join(', ') : 'None'}`);
  console.log(`- Suggestions: ${validation.suggestions.length > 0 ? validation.suggestions.join(', ') : 'None'}\n`);
}

/**
 * Example 3: Adapt Instagram caption for Twitter
 */
async function example3_AdaptForTwitter() {
  console.log('=== Example 3: Adapt for Twitter ===\n');

  const instagramCaption = `
Just launched my new online course! 🚀✨

I've been working on this project for the past 6 months and I'm so excited to finally share it with all of you!

This course will teach you:
• Content strategy fundamentals
• Engagement tactics that actually work
• Proven growth hacks for organic reach

Link in bio to learn more! Drop a comment below if you have any questions! 👇

#contentmarketing #socialmedia #digitalmarketing #marketing #contentcreation #socialmediamarketing #marketingstrategy #onlinebusiness #entrepreneurship #smallbusiness
  `.trim();

  console.log('Original Instagram Caption:');
  console.log(instagramCaption);
  console.log(`\nCharacter count: ${instagramCaption.length}\n`);

  const adapted = await platformAdapter.adaptForPlatform(instagramCaption, 'twitter');

  console.log('Adapted for Twitter:');
  console.log(adapted.caption);
  console.log(`\nCharacter count: ${adapted.characterCount}/280`);
  console.log(`Hashtags: ${adapted.hashtags.join(', ')}`);
  
  if (adapted.warnings.length > 0) {
    console.log(`\nWarnings:`);
    adapted.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  if (adapted.adaptationNotes.length > 0) {
    console.log(`\nAdaptation Notes:`);
    adapted.adaptationNotes.forEach(n => console.log(`  - ${n}`));
  }
  
  if (adapted.optimizationTips.length > 0) {
    console.log(`\nOptimization Tips:`);
    adapted.optimizationTips.forEach(t => console.log(`  - ${t}`));
  }
  console.log();
}

/**
 * Example 4: Adapt Instagram caption for LinkedIn
 */
async function example4_AdaptForLinkedIn() {
  console.log('=== Example 4: Adapt for LinkedIn ===\n');

  const casualInstagramCaption = `
Yeah! Just gonna drop this here! 😎✨🚀🔥💯

So I've been thinking about something kinda cool lately... You wanna know what it is?

It's about how we can, ya know, really authentically connect with our audience without being all corporate and boring! 

Like, let's be real - people can tell when you're just trying to sell them stuff, ya know?

What do you think? Drop your thoughts below! 👇

#business #marketing #authentic #realness
  `.trim();

  console.log('Original Instagram Caption (Very Casual):');
  console.log(casualInstagramCaption);
  console.log();

  // Create a mock voice profile (in real usage, this would come from VoiceProfileService)
  const mockVoiceProfile: VoiceProfile = {
    userId: 'user123',
    workspaceId: 'workspace123',
    vocabularyFrequency: {},
    signaturePhrases: [],
    sentenceLengthDistribution: { short: 40, medium: 40, long: 20 },
    paragraphStructure: 'short-breaks',
    emojiUsagePattern: {
      frequency: 'heavy',
      placement: 'inline',
      topEmojis: ['😎', '✨', '🚀', '🔥', '💯']
    },
    punctuationStyle: {
      exclamationUsage: 'frequent',
      questionUsage: 'frequent',
      ellipsisUsage: true
    },
    toneMarkers: {
      casual: 0.9,
      professional: 0.2,
      humorous: 0.7,
      inspirational: 0.4,
      educational: 0.3,
      conversational: 0.9
    },
    hookPatterns: [],
    engagementQuestionStyle: [],
    storytellingStructure: 'buildup',
    sampleSize: 10,
    confidence: 0.85,
    lastUpdated: new Date(),
    createdAt: new Date()
  };

  const adapted = await platformAdapter.adaptForPlatform(
    casualInstagramCaption,
    'linkedin',
    mockVoiceProfile
  );

  console.log('Adapted for LinkedIn:');
  console.log(adapted.caption);
  console.log(`\nCharacter count: ${adapted.characterCount}`);
  console.log(`Hashtags: ${adapted.hashtags.join(', ')}`);
  
  if (adapted.warnings.length > 0) {
    console.log(`\nWarnings:`);
    adapted.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  if (adapted.adaptationNotes.length > 0) {
    console.log(`\nAdaptation Notes:`);
    adapted.adaptationNotes.forEach(n => console.log(`  - ${n}`));
  }
  
  if (adapted.optimizationTips.length > 0) {
    console.log(`\nOptimization Tips:`);
    adapted.optimizationTips.forEach(t => console.log(`  - ${t}`));
  }
  console.log();
}

/**
 * Example 5: Adapt Instagram caption for Facebook
 */
async function example5_AdaptForFacebook() {
  console.log('=== Example 5: Adapt for Facebook ===\n');

  const instagramCaption = `
New blog post is live! ✨

Check out my latest thoughts on content strategy.

#blogging #content #writing
  `.trim();

  console.log('Original Instagram Caption (Short):');
  console.log(instagramCaption);
  console.log();

  const adapted = await platformAdapter.adaptForPlatform(instagramCaption, 'facebook');

  console.log('Adapted for Facebook:');
  console.log(adapted.caption);
  console.log(`\nCharacter count: ${adapted.characterCount}`);
  console.log(`Hashtags: ${adapted.hashtags.join(', ')}`);
  
  if (adapted.warnings.length > 0) {
    console.log(`\nWarnings:`);
    adapted.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  if (adapted.adaptationNotes.length > 0) {
    console.log(`\nAdaptation Notes:`);
    adapted.adaptationNotes.forEach(n => console.log(`  - ${n}`));
  }
  
  if (adapted.optimizationTips.length > 0) {
    console.log(`\nOptimization Tips:`);
    adapted.optimizationTips.forEach(t => console.log(`  - ${t}`));
  }
  console.log();
}

/**
 * Example 6: Adapt Instagram caption for TikTok
 */
async function example6_AdaptForTikTok() {
  console.log('=== Example 6: Adapt for TikTok ===\n');

  const instagramCaption = `
Just discovered this amazing productivity hack! 🚀✨

I've been using this method for the past month and it has completely transformed how I work. However, you need to understand that consistency is key. Moreover, you have to be patient with the process.

The results are incredible! Let me know if you want me to make a detailed tutorial about this!

Drop a comment if you're interested! 👇

#productivity #lifehack #workfromhome #entrepreneur #business #motivation #success #tips #tutorial #productivitytips
  `.trim();

  console.log('Original Instagram Caption (Long & Formal):');
  console.log(instagramCaption);
  console.log(`\nCharacter count: ${instagramCaption.length}\n`);

  const adapted = await platformAdapter.adaptForPlatform(instagramCaption, 'tiktok');

  console.log('Adapted for TikTok:');
  console.log(adapted.caption);
  console.log(`\nCharacter count: ${adapted.characterCount} (optimal: 50-150)`);
  console.log(`Hashtags: ${adapted.hashtags.join(', ')}`);
  
  if (adapted.warnings.length > 0) {
    console.log(`\nWarnings:`);
    adapted.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  if (adapted.adaptationNotes.length > 0) {
    console.log(`\nAdaptation Notes:`);
    adapted.adaptationNotes.forEach(n => console.log(`  - ${n}`));
  }
  
  if (adapted.optimizationTips.length > 0) {
    console.log(`\nOptimization Tips:`);
    adapted.optimizationTips.forEach(t => console.log(`  - ${t}`));
  }
  console.log();
}

/**
 * Example 7: Handle edge cases
 */
async function example7_EdgeCases() {
  console.log('=== Example 6: Edge Cases ===\n');

  // Very long caption that needs truncation
  const veryLongCaption = 'a'.repeat(500) + ' This is important! #test #marketing';
  
  console.log('Very Long Caption (500+ characters):');
  const twitterAdapted = await platformAdapter.adaptForPlatform(veryLongCaption, 'twitter');
  console.log(`Original length: 500+ characters`);
  console.log(`Adapted length: ${twitterAdapted.characterCount} characters`);
  console.log(`Truncated: ${twitterAdapted.adaptationNotes.some(n => n.includes('truncated') || n.includes('condensed'))}`);
  console.log();

  // Caption with many hashtags
  const manyHashtagsCaption = Array.from({ length: 50 }, (_, i) => `#tag${i}`).join(' ') + ' Great post!';
  
  console.log('Caption with 50 Hashtags:');
  const hashtagAdapted = await platformAdapter.adaptForPlatform(manyHashtagsCaption, 'twitter');
  console.log(`Original hashtags: 50`);
  console.log(`Adapted hashtags: ${hashtagAdapted.hashtags.length}`);
  console.log(`Limited for readability: ${hashtagAdapted.hashtags.length <= 3}`);
  console.log();

  // Caption with only hashtags
  const onlyHashtags = '#marketing #socialmedia #content';
  
  console.log('Caption with Only Hashtags:');
  const onlyHashtagsAdapted = await platformAdapter.adaptForPlatform(onlyHashtags, 'linkedin');
  console.log(`Caption text: "${onlyHashtagsAdapted.caption.trim() || '(empty)'}"`);
  console.log(`Hashtags preserved: ${onlyHashtagsAdapted.hashtags.join(', ')}`);
  console.log();
}

/**
 * Example 8: Platform-specific best practices
 */
async function example8_BestPractices() {
  console.log('=== Example 8: Platform-Specific Best Practices ===\n');

  const caption = 'Check out my new post about marketing strategy! 🚀 #marketing #strategy #business #content #digital';

  console.log('Same Caption Adapted for Different Platforms:\n');

  // Twitter
  const twitter = await platformAdapter.adaptForPlatform(caption, 'twitter');
  console.log('Twitter:');
  console.log(`- Character count: ${twitter.characterCount}/280`);
  console.log(`- Hashtags: ${twitter.hashtags.length} (recommended: 2-3)`);
  console.log(`- Emoji count: ${(twitter.caption.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length}`);
  console.log();

  // LinkedIn
  const linkedin = await platformAdapter.adaptForPlatform(caption, 'linkedin');
  console.log('LinkedIn:');
  console.log(`- Character count: ${linkedin.characterCount}/3000`);
  console.log(`- Hashtags: ${linkedin.hashtags.length} (max: 30)`);
  console.log(`- Emoji count: ${(linkedin.caption.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length} (recommended: 2-3)`);
  console.log(`- Professional tone applied: ${linkedin.adaptationNotes.some(n => n.includes('professional'))}`);
  console.log();

  // Facebook
  const facebook = await platformAdapter.adaptForPlatform(caption, 'facebook');
  console.log('Facebook:');
  console.log(`- Character count: ${facebook.characterCount}/63206`);
  console.log(`- Hashtags: ${facebook.hashtags.length} (max: 50)`);
  console.log(`- Emoji count: ${(facebook.caption.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length}`);
  console.log(`- Storytelling format: ${facebook.adaptationNotes.some(n => n.includes('storytelling'))}`);
  console.log();

  // TikTok
  const tiktok = await platformAdapter.adaptForPlatform(caption, 'tiktok');
  console.log('TikTok:');
  console.log(`- Character count: ${tiktok.characterCount} (optimal: 50-150)`);
  console.log(`- Hashtags: ${tiktok.hashtags.length} (max: 30)`);
  console.log(`- Emoji count: ${(tiktok.caption.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length}`);
  console.log(`- Ultra-casual style: ${tiktok.adaptationNotes.some(n => n.includes('casual'))}`);
  console.log();

  // Instagram (no adaptation)
  const instagram = await platformAdapter.adaptForPlatform(caption, 'instagram');
  console.log('Instagram:');
  console.log(`- Character count: ${instagram.characterCount}/2200`);
  console.log(`- Hashtags: ${instagram.hashtags.length} (max: 30)`);
  console.log(`- Emoji count: ${(instagram.caption.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length}`);
  console.log(`- No adaptation needed: ${instagram.adaptationNotes.some(n => n.includes('maintained'))}`);
  console.log();
}

/**
 * Run all examples
 */
async function runAllExamples() {
  await example1_GetPlatformConstraints();
  await example2_ValidateCaption();
  await example3_AdaptForTwitter();
  await example4_AdaptForLinkedIn();
  await example5_AdaptForFacebook();
  await example6_AdaptForTikTok();
  await example7_EdgeCases();
  await example8_BestPractices();
}

// Uncomment to run examples
// runAllExamples().catch(console.error);

export {
  example1_GetPlatformConstraints,
  example2_ValidateCaption,
  example3_AdaptForTwitter,
  example4_AdaptForLinkedIn,
  example5_AdaptForFacebook,
  example6_AdaptForTikTok,
  example7_EdgeCases,
  example8_BestPractices,
  runAllExamples
};
