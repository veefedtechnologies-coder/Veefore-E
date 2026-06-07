/**
 * Manual test script for POST /api/ai/adapt-caption endpoint
 * 
 * This script tests the caption adaptation functionality for different platforms.
 * Run this script with: tsx server/test-adapt-caption-endpoint.ts
 */

import { PlatformAdapterService } from './services/PlatformAdapterService';

async function testAdaptCaptionEndpoint() {
  console.log('='.repeat(80));
  console.log('Testing POST /api/ai/adapt-caption endpoint functionality');
  console.log('='.repeat(80));
  console.log();

  const platformAdapter = new PlatformAdapterService();

  // Sample Instagram caption
  const instagramCaption = `
Just wrapped up an incredible photoshoot! 📸✨

Had the most amazing time capturing these moments with the talented @photographer_name. The energy was unreal and I can't wait to share more behind-the-scenes content with you all! 

What type of content do you want to see more of? Drop a comment below! 👇

#photography #photoshoot #behindthescenes #contentcreator #creative #artistlife #photographer #model #fashion #lifestyle #instagood #photooftheday #instadaily #picoftheday #art #beautiful #style #instaphoto #instamoment #createeveryday #creativelife #artistsoninstagram #photosession #modeling #shootday #fashionphotography #portraitphotography #studiophotography #outdoorphotography #creativephotography
  `.trim();

  console.log('Original Instagram Caption:');
  console.log('─'.repeat(80));
  console.log(instagramCaption);
  console.log('─'.repeat(80));
  console.log(`Character count: ${instagramCaption.length}`);
  console.log();
  console.log();

  // Test adapting to different platforms
  const platforms = ['twitter', 'linkedin', 'facebook'] as const;

  for (const platform of platforms) {
    try {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Adapting for: ${platform.toUpperCase()}`);
      console.log('='.repeat(80));

      const result = await platformAdapter.adaptForPlatform(
        instagramCaption,
        platform
      );

      console.log('\n📝 Adapted Caption:');
      console.log('─'.repeat(80));
      console.log(result.caption);
      console.log('─'.repeat(80));

      console.log('\n📊 Metadata:');
      console.log(`  • Platform: ${result.platform}`);
      console.log(`  • Character count: ${result.characterCount}`);
      console.log(`  • Hashtags: ${result.hashtags.length} tags`);
      if (result.hashtags.length > 0) {
        console.log(`  • Hashtag list: ${result.hashtags.slice(0, 5).join(', ')}${result.hashtags.length > 5 ? '...' : ''}`);
      }

      if (result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach((warning, i) => {
          console.log(`  ${i + 1}. ${warning}`);
        });
      }

      if (result.adaptationNotes.length > 0) {
        console.log('\n📝 Adaptation Notes:');
        result.adaptationNotes.forEach((note, i) => {
          console.log(`  ${i + 1}. ${note}`);
        });
      }

      if (result.optimizationTips.length > 0) {
        console.log('\n💡 Optimization Tips:');
        result.optimizationTips.forEach((tip, i) => {
          console.log(`  ${i + 1}. ${tip}`);
        });
      }

      console.log('\n✅ Successfully adapted caption for', platform);

    } catch (error: any) {
      console.error(`\n❌ Error adapting for ${platform}:`, error.message);
    }
  }

  // Test with a shorter caption
  console.log('\n\n' + '='.repeat(80));
  console.log('Testing with a shorter caption');
  console.log('='.repeat(80));

  const shortCaption = `Just finished an amazing workout session! 💪 Feeling energized and ready to take on the day. Who else loves that post-workout glow? ✨

#fitness #workout #motivation`;

  console.log('\nOriginal short caption:');
  console.log(shortCaption);
  console.log(`Character count: ${shortCaption.length}`);

  try {
    const twitterResult = await platformAdapter.adaptForPlatform(
      shortCaption,
      'twitter'
    );

    console.log('\n📝 Twitter adaptation:');
    console.log(twitterResult.caption);
    console.log(`\nCharacter count: ${twitterResult.characterCount}/280`);
    console.log(`Hashtags: ${twitterResult.hashtags.join(' ')}`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test completed successfully! ✅');
  console.log('='.repeat(80));
}

// Run the test
testAdaptCaptionEndpoint().catch(console.error);
