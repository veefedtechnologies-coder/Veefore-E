/**
 * Content Safety Service Tests
 * 
 * Tests for Task 22.1: Integrate content safety filters
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContentSafetyService } from './ContentSafetyService';

describe('ContentSafetyService', () => {
  let service: ContentSafetyService;

  beforeEach(() => {
    service = new ContentSafetyService();
  });

  describe('filterCaption - Profanity Detection', () => {
    it('should detect and flag profanity in standard mode', () => {
      const caption = 'This product is damn good and everyone who hates it is stupid!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.profanity).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(issue => issue.toLowerCase().includes('language'))).toBe(true);
    });

    it('should filter profanity in strict mode', () => {
      const caption = 'This is some bullshit right here!';
      const result = service.filterCaption(caption, 'strict');

      expect(result.flags.profanity).toBe(true);
      expect(result.filteredCaption).toContain('[filtered]');
      expect(result.safetyScore).toBeLessThan(100);
    });

    it('should allow clean language', () => {
      const caption = 'This amazing product will transform your life! Check it out today 🌟';
      const result = service.filterCaption(caption, 'strict');

      expect(result.isSafe).toBe(true);
      expect(result.flags.profanity).toBe(false);
      expect(result.safetyScore).toBe(100);
    });
  });

  describe('filterCaption - Hate Speech Detection', () => {
    it('should detect hate speech', () => {
      const caption = 'Stop hating on people who are different!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.hateSpeech).toBe(true);
      expect(result.safetyScore).toBeLessThan(100);
    });

    it('should flag discriminatory language', () => {
      const caption = 'This racist comment is unacceptable';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.hateSpeech).toBe(true);
      expect(result.issues.some(issue => issue.toLowerCase().includes('hate speech'))).toBe(true);
    });
  });

  describe('filterCaption - Spam Detection', () => {
    it('should detect spam patterns', () => {
      const caption = 'Click here now for limited time offer! Buy now before it\'s gone!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.spam).toBe(true);
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.issues.some(issue => issue.toLowerCase().includes('spam'))).toBe(true);
    });

    it('should detect follow-for-follow spam', () => {
      const caption = 'Follow me for more content! F4F L4L follow back!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.spam).toBe(true);
    });

    it('should allow genuine calls to action', () => {
      const caption = 'Love this? Let me know in the comments below! 💬';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.spam).toBe(false);
      expect(result.isSafe).toBe(true);
    });
  });

  describe('filterCaption - Misleading Claims Detection', () => {
    it('should detect misleading health claims', () => {
      const caption = 'This miracle cure is guaranteed to work 100%! Lose 20 pounds in 7 days!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.misleadingClaims).toBe(true);
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.issues.some(issue => issue.toLowerCase().includes('misleading'))).toBe(true);
    });

    it('should detect "one weird trick" patterns', () => {
      const caption = 'Doctors hate this one weird trick that they don\'t want you to know!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.misleadingClaims).toBe(true);
    });

    it('should allow genuine testimonials', () => {
      const caption = 'I\'ve been using this product for 3 months and love the results!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.misleadingClaims).toBe(false);
      expect(result.isSafe).toBe(true);
    });
  });

  describe('filterCaption - Personal Information Detection', () => {
    it('should detect and filter SSN', () => {
      const caption = 'My SSN is 123-45-6789 if you need it';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.personalInfoExposure).toBe(true);
      expect(result.filteredCaption).toContain('[SSN REMOVED]');
      expect(result.safetyScore).toBeLessThan(100);
    });

    it('should detect and filter credit card numbers', () => {
      const caption = 'Card number: 1234 5678 9012 3456';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.personalInfoExposure).toBe(true);
      expect(result.filteredCaption).toContain('[CARD NUMBER REMOVED]');
    });

    it('should flag but not filter business phone numbers', () => {
      const caption = 'Call us at 5551234567 for more info!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.personalInfoExposure).toBe(true);
      expect(result.issues.some(issue => issue.toLowerCase().includes('phone number'))).toBe(true);
      // Phone numbers are flagged but not filtered (might be intentional)
      expect(result.filteredCaption).toBe(caption);
    });

    it('should flag email addresses', () => {
      const caption = 'Contact me at test@example.com for inquiries';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.personalInfoExposure).toBe(true);
      expect(result.issues.some(issue => issue.toLowerCase().includes('email'))).toBe(true);
    });
  });

  describe('filterCaption - Brand Values Check', () => {
    it('should detect conflicts with luxury brand values', () => {
      const caption = 'Get this cheap, budget-friendly product now!';
      const brandValues = ['luxury', 'premium'];
      const result = service.filterCaption(caption, 'standard', brandValues);

      expect(result.isSafe).toBe(false);
      expect(result.issues.some(issue => issue.toLowerCase().includes('brand value'))).toBe(true);
      expect(result.safetyScore).toBeLessThan(100);
    });

    it('should detect conflicts with sustainable brand values', () => {
      const caption = 'Our disposable, single-use products are so convenient!';
      const brandValues = ['sustainable', 'eco-friendly'];
      const result = service.filterCaption(caption, 'standard', brandValues);

      expect(result.isSafe).toBe(false);
      expect(result.issues.some(issue => issue.toLowerCase().includes('sustainable'))).toBe(true);
    });

    it('should pass when aligned with brand values', () => {
      const caption = 'Experience authentic craftsmanship with our premium, sustainable products';
      const brandValues = ['authentic', 'premium', 'sustainable'];
      const result = service.filterCaption(caption, 'standard', brandValues);

      expect(result.isSafe).toBe(true);
      expect(result.safetyScore).toBe(100);
    });
  });

  describe('filterCaption - Prohibited Topics Check', () => {
    it('should detect prohibited topics', () => {
      const caption = 'Let\'s talk about cryptocurrency investments today!';
      const prohibitedTopics = ['cryptocurrency', 'investment'];
      const result = service.filterCaption(caption, 'standard', undefined, prohibitedTopics);

      expect(result.isSafe).toBe(false);
      expect(result.issues.some(issue => issue.toLowerCase().includes('prohibited topic'))).toBe(true);
      expect(result.safetyScore).toBeLessThan(70);
    });

    it('should work even with safety level off', () => {
      const caption = 'This political statement is controversial';
      const prohibitedTopics = ['political', 'politics'];
      const result = service.filterCaption(caption, 'off', undefined, prohibitedTopics);

      expect(result.isSafe).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should pass when no prohibited topics present', () => {
      const caption = 'Beautiful sunset views from our latest adventure!';
      const prohibitedTopics = ['politics', 'religion'];
      const result = service.filterCaption(caption, 'standard', undefined, prohibitedTopics);

      expect(result.isSafe).toBe(true);
      expect(result.safetyScore).toBe(100);
    });
  });

  describe('filterCaption - Controversial Topics', () => {
    it('should flag controversial topics in standard mode', () => {
      const caption = 'Let\'s discuss the upcoming election and political changes';
      const result = service.filterCaption(caption, 'standard');

      expect(result.issues.some(issue => issue.includes('⚠️ REVIEW RECOMMENDED'))).toBe(true);
      expect(result.issues.some(issue => issue.toLowerCase().includes('controversial'))).toBe(true);
    });

    it('should reduce score for controversial topics in strict mode', () => {
      const caption = 'Religious beliefs are personal and should be respected';
      const result = service.filterCaption(caption, 'strict');

      expect(result.safetyScore).toBeLessThan(100);
    });

    it('should not flag controversial topics with safety off', () => {
      const caption = 'Let\'s discuss the political situation';
      const result = service.filterCaption(caption, 'off');

      expect(result.isSafe).toBe(true);
      expect(result.safetyScore).toBe(100);
    });
  });

  describe('filterCaption - Safety Levels', () => {
    it('should be most permissive with safety off', () => {
      const caption = 'This damn product is pretty good!';
      const result = service.filterCaption(caption, 'off');

      expect(result.isSafe).toBe(true);
      expect(result.safetyScore).toBe(100);
    });

    it('should flag issues in standard mode', () => {
      const caption = 'This damn product is pretty good!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.profanity).toBe(true);
      expect(result.safetyScore).toBeLessThan(100);
    });

    it('should be strictest in strict mode', () => {
      const caption = 'This damn product is pretty good!';
      const result = service.filterCaption(caption, 'strict');

      expect(result.flags.profanity).toBe(true);
      expect(result.filteredCaption).toContain('[filtered]');
      expect(result.safetyScore).toBeLessThan(100);
    });
  });

  describe('filterCaption - Overall Safety Score', () => {
    it('should calculate correct safety score with multiple issues', () => {
      const caption = 'Click here now for this damn miracle cure guaranteed to work 100%!';
      const result = service.filterCaption(caption, 'standard');

      expect(result.flags.profanity).toBe(true);
      expect(result.flags.spam).toBe(true);
      expect(result.flags.misleadingClaims).toBe(true);
      expect(result.safetyScore).toBeLessThan(70);
      expect(result.isSafe).toBe(false);
    });

    it('should return 100 for completely safe content', () => {
      const caption = 'Loving this beautiful sunset! What\'s your favorite time of day? 🌅✨';
      const result = service.filterCaption(caption, 'strict');

      expect(result.safetyScore).toBe(100);
      expect(result.isSafe).toBe(true);
      expect(result.issues.length).toBe(0);
    });
  });

  describe('addSafetyMetadata', () => {
    it('should add safety metadata to caption', () => {
      const caption = 'Test caption';
      const safetyResult = service.filterCaption(caption, 'standard');
      const result = service.addSafetyMetadata(caption, safetyResult);

      expect(result.caption).toBe(caption);
      expect(result.safetyMetadata).toBeDefined();
      expect(result.safetyMetadata.score).toBe(100);
      expect(result.safetyMetadata.flags).toBeDefined();
      expect(result.safetyMetadata.issues).toEqual([]);
      expect(result.safetyMetadata.checkedAt).toBeInstanceOf(Date);
    });

    it('should include filtered caption in metadata', () => {
      const caption = 'My SSN is 123-45-6789';
      const safetyResult = service.filterCaption(caption, 'standard');
      const result = service.addSafetyMetadata(caption, safetyResult);

      expect(result.caption).toContain('[SSN REMOVED]');
      expect(result.safetyMetadata.flags.personalInfoExposure).toBe(true);
      expect(result.safetyMetadata.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Real-world Caption Scenarios', () => {
    it('should pass authentic fitness caption', () => {
      const caption = `Morning workout complete! 💪 
      
Hit a new PR on deadlifts today - 225lbs! The consistency is really paying off.

What's your favorite lift? Drop it in the comments! 👇`;
      const result = service.filterCaption(caption, 'standard');

      expect(result.isSafe).toBe(true);
      expect(result.safetyScore).toBe(100);
    });

    it('should pass authentic food caption', () => {
      const caption = `Homemade pasta night 🍝✨

There's something magical about making pasta from scratch. It's messy, it's time-consuming, but wow - the taste is unbeatable.

Have you tried making your own pasta? Let me know if you want the recipe!`;
      const result = service.filterCaption(caption, 'standard');

      expect(result.isSafe).toBe(true);
      expect(result.safetyScore).toBe(100);
    });

    it('should flag inappropriate influencer caption', () => {
      const caption = `OMG this is such bullshit! Click here NOW for my exclusive weight loss miracle that doctors don't want you to know! Guaranteed 100% results or your money back! DM me to buy now! 💰💰💰💰`;
      const result = service.filterCaption(caption, 'standard');

      expect(result.isSafe).toBe(false);
      expect(result.flags.profanity).toBe(true);
      expect(result.flags.spam).toBe(true);
      expect(result.flags.misleadingClaims).toBe(true);
      expect(result.safetyScore).toBeLessThan(50);
    });

    it('should handle edge case with legitimate business contact', () => {
      const caption = `New studio location! 📍

Visit us at our new space. For bookings, email hello@studio.com or call (555) 123-4567

Can't wait to see you there!`;
      const result = service.filterCaption(caption, 'standard');

      // Should flag for review but still be relatively safe
      expect(result.flags.personalInfoExposure).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      // But should still pass overall because these are legitimate business contacts
      expect(result.safetyScore).toBeGreaterThan(60);
    });
  });
});
