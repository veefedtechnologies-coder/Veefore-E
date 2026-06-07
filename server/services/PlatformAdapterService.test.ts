import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformAdapterService } from './PlatformAdapterService';
import { VoiceProfile } from './VoiceProfileService';

describe('PlatformAdapterService', () => {
  let service: PlatformAdapterService;
  let mockVoiceProfile: VoiceProfile;

  beforeEach(() => {
    service = new PlatformAdapterService();

    // Mock voice profile
    mockVoiceProfile = {
      userId: 'user123',
      workspaceId: 'workspace123',
      vocabularyFrequency: { 'love': 5, 'great': 3, 'awesome': 4 },
      signaturePhrases: ['lets be real', 'heres the thing'],
      sentenceLengthDistribution: { short: 30, medium: 50, long: 20 },
      paragraphStructure: 'short-breaks',
      emojiUsagePattern: {
        frequency: 'moderate',
        placement: 'inline',
        topEmojis: ['❤️', '✨', '🔥']
      },
      punctuationStyle: {
        exclamationUsage: 'moderate',
        questionUsage: 'moderate',
        ellipsisUsage: false
      },
      toneMarkers: {
        casual: 0.7,
        professional: 0.3,
        humorous: 0.5,
        inspirational: 0.4,
        educational: 0.3,
        conversational: 0.8
      },
      hookPatterns: ['Ever wonder', 'Heres why'],
      engagementQuestionStyle: ['What do you think?', 'Have you tried this?'],
      storytellingStructure: 'buildup',
      sampleSize: 10,
      confidence: 0.85,
      lastUpdated: new Date(),
      createdAt: new Date()
    };
  });

  describe('getPlatformConstraints', () => {
    it('should return Instagram constraints', () => {
      const constraints = service.getPlatformConstraints('instagram');
      
      expect(constraints.platform).toBe('instagram');
      expect(constraints.characterLimit).toBe(2200);
      expect(constraints.hashtagLimit).toBe(30);
      expect(constraints.emojiStyle).toBe('friendly');
    });

    it('should return Facebook constraints', () => {
      const constraints = service.getPlatformConstraints('facebook');
      
      expect(constraints.platform).toBe('facebook');
      expect(constraints.characterLimit).toBe(63206);
      expect(constraints.hashtagLimit).toBe(50);
      expect(constraints.emojiStyle).toBe('moderate');
    });

    it('should return Twitter constraints', () => {
      const constraints = service.getPlatformConstraints('twitter');
      
      expect(constraints.platform).toBe('twitter');
      expect(constraints.characterLimit).toBe(280);
      expect(constraints.hashtagLimit).toBe(100);
      expect(constraints.emojiStyle).toBe('minimal');
    });

    it('should return LinkedIn constraints', () => {
      const constraints = service.getPlatformConstraints('linkedin');
      
      expect(constraints.platform).toBe('linkedin');
      expect(constraints.characterLimit).toBe(3000);
      expect(constraints.hashtagLimit).toBe(30);
      expect(constraints.emojiStyle).toBe('professional');
    });

    it('should return TikTok constraints', () => {
      const constraints = service.getPlatformConstraints('tiktok');
      
      expect(constraints.platform).toBe('tiktok');
      expect(constraints.characterLimit).toBe(2200);
      expect(constraints.hashtagLimit).toBe(30);
      expect(constraints.emojiStyle).toBe('friendly');
    });

    it('should throw error for unsupported platform', () => {
      expect(() => service.getPlatformConstraints('snapchat')).toThrow('Unsupported platform');
    });

    it('should handle case-insensitive platform names', () => {
      const constraints1 = service.getPlatformConstraints('INSTAGRAM');
      const constraints2 = service.getPlatformConstraints('Instagram');
      const constraints3 = service.getPlatformConstraints('instagram');
      
      expect(constraints1.platform).toBe('instagram');
      expect(constraints2.platform).toBe('instagram');
      expect(constraints3.platform).toBe('instagram');
    });
  });

  describe('validateForPlatform', () => {
    it('should validate Instagram caption within limits', () => {
      const caption = 'This is a great post about social media! 🚀✨ #socialmedia #marketing #content';
      const validation = service.validateForPlatform(caption, 'instagram');
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.characterCount).toBeLessThan(2200);
      expect(validation.hashtagCount).toBe(3);
    });

    it('should flag Instagram caption exceeding character limit', () => {
      const longCaption = 'a'.repeat(2300) + ' #test';
      const validation = service.validateForPlatform(longCaption, 'instagram');
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('exceeds');
    });

    it('should flag Instagram caption exceeding hashtag limit', () => {
      const manyHashtags = Array.from({ length: 35 }, (_, i) => `#tag${i}`).join(' ');
      const caption = `Test caption ${manyHashtags}`;
      const validation = service.validateForPlatform(caption, 'instagram');
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('hashtag'))).toBe(true);
      expect(validation.hashtagCount).toBe(35);
    });

    it('should validate Twitter caption within 280 characters', () => {
      const caption = 'Short and punchy tweet! 🚀 #twitter #content';
      const validation = service.validateForPlatform(caption, 'twitter');
      
      expect(validation.isValid).toBe(true);
      expect(validation.characterCount).toBeLessThan(280);
    });

    it('should flag Twitter caption exceeding 280 characters', () => {
      const longCaption = 'a'.repeat(300) + ' #test';
      const validation = service.validateForPlatform(longCaption, 'twitter');
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('280'))).toBe(true);
    });

    it('should warn about too many hashtags on Twitter', () => {
      const caption = 'Tweet with many hashtags #tag1 #tag2 #tag3 #tag4 #tag5';
      const validation = service.validateForPlatform(caption, 'twitter');
      
      expect(validation.warnings.some(w => w.includes('2-3 hashtags'))).toBe(true);
    });

    it('should warn about informal language on LinkedIn', () => {
      const caption = 'Yeah, gonna share this awesome post! #linkedin';
      const validation = service.validateForPlatform(caption, 'linkedin');
      
      expect(validation.warnings.some(w => w.includes('informal'))).toBe(true);
    });

    it('should suggest adding line breaks for Instagram', () => {
      const caption = 'This is a long caption without any line breaks just one continuous stream of text. #instagram';
      const validation = service.validateForPlatform(caption, 'instagram');
      
      expect(validation.suggestions.some(s => s.includes('line breaks'))).toBe(true);
    });
  });

  describe('adaptForPlatform', () => {
    it('should adapt Instagram caption for Twitter (concise)', async () => {
      const instagramCaption = `This is an amazing post about social media marketing! 🚀✨

I've been learning so much about content creation lately. The key is authenticity and consistency.

What's your biggest social media challenge? Let me know in the comments! 💬

#socialmedia #marketing #content #digitalmarketing #contentcreation`;

      const adapted = await service.adaptForPlatform(instagramCaption, 'twitter', mockVoiceProfile);
      
      expect(adapted.platform).toBe('twitter');
      expect(adapted.characterCount).toBeLessThanOrEqual(280);
      expect(adapted.caption.length).toBeLessThan(instagramCaption.length);
      expect(adapted.hashtags.length).toBeLessThanOrEqual(3);
      expect(adapted.adaptationNotes).toContain('Adapted for Twitter: concise and direct tone');
    });

    it('should adapt Instagram caption for LinkedIn (professional)', async () => {
      const instagramCaption = `Yeah! This is gonna be awesome! 😎✨🚀🔥💯

Just learned this cool trick about content creation. You wanna know the secret?

It's all about being real and authentic, ya know?

Drop a comment if you agree! 👇

#content #marketing`;

      const adapted = await service.adaptForPlatform(instagramCaption, 'linkedin', mockVoiceProfile);
      
      expect(adapted.platform).toBe('linkedin');
      expect(adapted.caption).not.toContain('gonna');
      expect(adapted.caption).not.toContain('wanna');
      expect(adapted.caption).not.toContain('ya know');
      expect(adapted.adaptationNotes).toContain('Adapted for LinkedIn: professional tone and business focus');
      
      // Should reduce emojis for professional tone
      const emojiCount = (adapted.caption.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
      expect(emojiCount).toBeLessThanOrEqual(3);
    });

    it('should adapt Instagram caption for Facebook', async () => {
      const instagramCaption = `Amazing content strategy! ✨

Check this out! 🚀

#marketing #content`;

      const adapted = await service.adaptForPlatform(instagramCaption, 'facebook', mockVoiceProfile);
      
      expect(adapted.platform).toBe('facebook');
      expect(adapted.adaptationNotes).toContain('Adapted for Facebook: conversational and storytelling-focused');
    });

    it('should adapt Instagram caption for TikTok (ultra-casual)', async () => {
      const instagramCaption = `This is an amazing post about social media marketing! 🚀✨

I've been learning so much about content creation lately. The key is authenticity and consistency. However, you need to understand the algorithms.

What's your biggest social media challenge? Let me know in the comments! 💬

#socialmedia #marketing #content #digitalmarketing #contentcreation`;

      const adapted = await service.adaptForPlatform(instagramCaption, 'tiktok', mockVoiceProfile);
      
      expect(adapted.platform).toBe('tiktok');
      expect(adapted.characterCount).toBeLessThanOrEqual(300);
      expect(adapted.caption.length).toBeLessThan(instagramCaption.length);
      expect(adapted.adaptationNotes).toContain('Adapted for TikTok: ultra-casual and trending-focused');
    });

    it('should maintain Instagram caption unchanged', async () => {
      const instagramCaption = `Great post about content! ✨ #marketing`;

      const adapted = await service.adaptForPlatform(instagramCaption, 'instagram', mockVoiceProfile);
      
      expect(adapted.platform).toBe('instagram');
      expect(adapted.adaptationNotes).toContain('Original Instagram format maintained');
    });

    it('should extract and separate hashtags', async () => {
      const caption = `Amazing post! #marketing #content #social`;
      const adapted = await service.adaptForPlatform(caption, 'twitter', mockVoiceProfile);
      
      expect(adapted.caption).not.toContain('#');
      expect(adapted.hashtags).toContain('#marketing');
      expect(adapted.hashtags).toContain('#content');
      expect(adapted.hashtags).toContain('#social');
    });

    it('should limit hashtags based on platform', async () => {
      const manyHashtags = Array.from({ length: 50 }, (_, i) => `#tag${i}`).join(' ');
      const caption = `Test caption ${manyHashtags}`;
      
      const twitterAdapted = await service.adaptForPlatform(caption, 'twitter');
      expect(twitterAdapted.hashtags.length).toBeLessThanOrEqual(3);
      
      const linkedinAdapted = await service.adaptForPlatform(caption, 'linkedin');
      expect(linkedinAdapted.hashtags.length).toBeLessThanOrEqual(30);
    });

    it('should truncate caption if exceeds character limit', async () => {
      const veryLongCaption = 'a'.repeat(500) + ' #test';
      const adapted = await service.adaptForPlatform(veryLongCaption, 'twitter');
      
      expect(adapted.characterCount).toBeLessThanOrEqual(280);
      expect(adapted.warnings.some(w => w.includes('exceeded') || w.includes('exceeds'))).toBe(true);
      expect(adapted.adaptationNotes.some(n => n.includes('truncated') || n.includes('condensed'))).toBe(true);
    });

    it('should reduce emojis for LinkedIn', async () => {
      const emojiHeavyCaption = 'Amazing post! 😎✨🚀🔥💯👍🎉❤️ #linkedin';
      const adapted = await service.adaptForPlatform(emojiHeavyCaption, 'linkedin', mockVoiceProfile);
      
      const emojiCount = (adapted.caption.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/gu) || []).length;
      expect(emojiCount).toBeLessThanOrEqual(3);
    });

    it('should provide optimization tips', async () => {
      const shortCaption = 'Hi #test';
      const adapted = await service.adaptForPlatform(shortCaption, 'instagram');
      
      expect(adapted.optimizationTips.length).toBeGreaterThan(0);
    });

    it('should handle captions without hashtags', async () => {
      const caption = 'This is a post without any hashtags at all.';
      const adapted = await service.adaptForPlatform(caption, 'twitter');
      
      expect(adapted.hashtags).toHaveLength(0);
      expect(adapted.caption).toBe(caption);
    });
  });

  describe('Platform-specific adaptations', () => {
    it('should make Twitter captions more concise', async () => {
      const verboseCaption = 'I really just wanted to actually say that this is very literally amazing!';
      const adapted = await service.adaptForPlatform(verboseCaption, 'twitter');
      
      // Should remove filler words like "really", "just", "actually", "very", "literally"
      expect(adapted.caption.length).toBeLessThan(verboseCaption.length);
      expect(adapted.caption).not.toContain('really');
      expect(adapted.caption).not.toContain('just');
    });

    it('should apply professional tone for LinkedIn', async () => {
      const casualCaption = 'Yeah, gonna share this kinda cool thing. Wanna learn more?';
      const adapted = await service.adaptForPlatform(casualCaption, 'linkedin');
      
      expect(adapted.caption).toContain('going to');
      expect(adapted.caption).toContain('want to');
      expect(adapted.caption).not.toContain('gonna');
      expect(adapted.caption).not.toContain('wanna');
    });

    it('should apply appropriate line break styles', async () => {
      const caption = 'Sentence one. Sentence two. Sentence three.';
      
      const twitterAdapted = await service.adaptForPlatform(caption, 'twitter');
      // Twitter should be compact
      expect(twitterAdapted.caption.split('\n\n').length).toBeLessThanOrEqual(2);
      
      const instagramAdapted = await service.adaptForPlatform(caption, 'instagram');
      // Instagram should have mobile-first breaks
      expect(instagramAdapted.caption.includes('\n')).toBe(true);
    });

    it('should handle voice profile emoji preferences', async () => {
      const caption = 'Great post 😎✨🚀🔥💯👍';
      
      // Profile with moderate emoji usage
      const adapted = await service.adaptForPlatform(caption, 'linkedin', mockVoiceProfile);
      
      const emojiCount = (adapted.caption.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/gu) || []).length;
      expect(emojiCount).toBeLessThanOrEqual(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty caption', async () => {
      const adapted = await service.adaptForPlatform('', 'twitter');
      
      expect(adapted.caption).toBe('');
      expect(adapted.hashtags).toHaveLength(0);
    });

    it('should handle caption with only hashtags', async () => {
      const caption = '#tag1 #tag2 #tag3';
      const adapted = await service.adaptForPlatform(caption, 'twitter');
      
      expect(adapted.caption.trim()).toBe('');
      expect(adapted.hashtags.length).toBeGreaterThan(0);
    });

    it('should handle caption with special characters', async () => {
      const caption = 'Great post! @mention #hashtag https://example.com 💯';
      const adapted = await service.adaptForPlatform(caption, 'twitter');
      
      expect(adapted.caption).toContain('@mention');
      expect(adapted.caption).toContain('https://example.com');
    });

    it('should handle very long words', async () => {
      const caption = 'This is a verylongwordthatdoesnotfitanywherereasonably #test';
      const adapted = await service.adaptForPlatform(caption, 'twitter');
      
      expect(adapted.characterCount).toBeLessThanOrEqual(280);
    });

    it('should handle caption without voice profile', async () => {
      const caption = 'Test caption #marketing';
      const adapted = await service.adaptForPlatform(caption, 'linkedin');
      
      expect(adapted.platform).toBe('linkedin');
      expect(adapted.caption).toBeDefined();
    });
  });

  describe('Warning and optimization messages', () => {
    it('should warn when content exceeds optimal length', async () => {
      const veryLongCaption = 'a'.repeat(3500) + ' #test';
      const adapted = await service.adaptForPlatform(veryLongCaption, 'linkedin');
      
      expect(adapted.optimizationTips.some(tip => tip.includes('quite long'))).toBe(true);
    });

    it('should suggest expansion for very short captions', async () => {
      const shortCaption = 'Hi #test';
      const adapted = await service.adaptForPlatform(shortCaption, 'linkedin');
      
      expect(adapted.optimizationTips.some(tip => tip.includes('expanding'))).toBe(true);
    });

    it('should warn about platform compatibility issues', async () => {
      const longCaption = 'a'.repeat(500) + ' #test';
      const adapted = await service.adaptForPlatform(longCaption, 'twitter');
      
      expect(adapted.warnings.length).toBeGreaterThan(0);
      expect(adapted.warnings.some(w => w.includes('exceeded'))).toBe(true);
    });
  });
});
