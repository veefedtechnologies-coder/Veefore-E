/**
 * Unit tests for contentGeneration utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractHashtags,
  formatHashtags,
  parseHashtagsFromText,
  optimizeCaption,
  calculateContentMetrics,
  formatCaptionWithLineBreaks,
  removeAITells,
  addEngagingCTA,
  truncateText,
  validateCaption,
  generateCaptionVariation
} from '../contentGeneration';

describe('contentGeneration', () => {
  describe('extractHashtags', () => {
    it('should extract hashtags from caption', () => {
      const text = 'Great post about travel! #travel #adventure #wanderlust';
      const result = extractHashtags(text);

      expect(result.caption).toBe('Great post about travel!');
      expect(result.hashtags).toHaveLength(3);
      expect(result.hashtags).toContain('#travel');
      expect(result.hashtags).toContain('#adventure');
    });

    it('should handle text without hashtags', () => {
      const result = extractHashtags('Just a regular caption');

      expect(result.caption).toBe('Just a regular caption');
      expect(result.hashtags).toHaveLength(0);
    });

    it('should remove duplicate hashtags', () => {
      const text = 'Post #travel #TRAVEL #Travel';
      const result = extractHashtags(text);

      expect(result.hashtags).toHaveLength(1);
    });

    it('should handle empty input', () => {
      const result = extractHashtags('');

      expect(result.caption).toBe('');
      expect(result.hashtags).toHaveLength(0);
    });
  });

  describe('formatHashtags', () => {
    it('should format hashtags correctly', () => {
      const hashtags = ['travel', '#adventure', 'wanderlust'];
      const formatted = formatHashtags(hashtags);

      expect(formatted).toHaveLength(3);
      expect(formatted[0]).toBe('#travel');
      expect(formatted[1]).toBe('#adventure');
      expect(formatted[2]).toBe('#wanderlust');
    });

    it('should remove invalid hashtags', () => {
      const hashtags = ['#valid', '#', '#with spaces'];
      const formatted = formatHashtags(hashtags);

      expect(formatted.length).toBeGreaterThanOrEqual(1);
      expect(formatted).toContain('#valid');
    });

    it('should remove duplicates', () => {
      const hashtags = ['#travel', '#TRAVEL', '#Travel'];
      const formatted = formatHashtags(hashtags);

      expect(formatted).toHaveLength(1);
    });
  });

  describe('parseHashtagsFromText', () => {
    it('should parse hashtags from text', () => {
      const text = '#travel #adventure #wanderlust #explore #nature';
      const hashtags = parseHashtagsFromText(text);

      expect(hashtags).toHaveLength(5);
      expect(hashtags[0]).toBe('#travel');
    });

    it('should handle newlines', () => {
      const text = '#travel\n#adventure\n#wanderlust';
      const hashtags = parseHashtagsFromText(text);

      expect(hashtags).toHaveLength(3);
    });

    it('should limit to 15 hashtags', () => {
      const text = Array.from({ length: 20 }, (_, i) => `#tag${i}`).join(' ');
      const hashtags = parseHashtagsFromText(text);

      expect(hashtags).toHaveLength(15);
    });
  });

  describe('optimizeCaption', () => {
    it('should optimize caption within limits', () => {
      const caption = 'Great post! #travel #adventure';
      const result = optimizeCaption(caption, 'instagram');

      expect(result.optimizedCaption).toBeTruthy();
      expect(result.characterCount).toBeLessThanOrEqual(2200);
      expect(result.improvements).toBeInstanceOf(Array);
    });

    it('should trim long captions', () => {
      const longCaption = 'a'.repeat(3000) + ' #travel';
      const result = optimizeCaption(longCaption, 'instagram', { maxLength: 2200 });

      // Account for hashtags added back and line breaks
      expect(result.optimizedCaption.length).toBeLessThanOrEqual(2220);
      expect(result.improvements.some(i => i.includes('Trimmed'))).toBe(true);
    });

    it('should limit excessive hashtags', () => {
      const caption = 'Post ' + Array.from({ length: 20 }, (_, i) => `#tag${i}`).join(' ');
      const result = optimizeCaption(caption, 'instagram', { removeExcessiveHashtags: true });

      const hashtagCount = (result.optimizedCaption.match(/#/g) || []).length;
      expect(hashtagCount).toBeLessThanOrEqual(12);
    });

    it('should add line breaks', () => {
      const caption = 'First sentence. Second sentence. #travel';
      const result = optimizeCaption(caption, 'instagram', { addLineBreaks: true });

      expect(result.optimizedCaption).toContain('\n');
    });
  });

  describe('calculateContentMetrics', () => {
    it('should calculate metrics correctly', () => {
      const text = 'Hello world! This is a test. @user #hashtag https://example.com 😊';
      const metrics = calculateContentMetrics(text);

      expect(metrics.wordCount).toBeGreaterThan(0);
      expect(metrics.sentenceCount).toBeGreaterThanOrEqual(2);
      expect(metrics.hashtagCount).toBe(1);
      expect(metrics.emojiCount).toBeGreaterThanOrEqual(1);
      expect(metrics.mentionCount).toBe(1);
      expect(metrics.linkCount).toBe(1);
    });

    it('should handle empty text', () => {
      const metrics = calculateContentMetrics('');

      expect(metrics.wordCount).toBe(0);
      expect(metrics.sentenceCount).toBe(0);
      expect(metrics.hashtagCount).toBe(0);
    });

    it('should count multiple emojis', () => {
      const text = 'Test 😊 😃 😍 💯';
      const metrics = calculateContentMetrics(text);

      expect(metrics.emojiCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('formatCaptionWithLineBreaks', () => {
    it('should format in compact style', () => {
      const caption = 'Line 1\n\n\nLine 2';
      const formatted = formatCaptionWithLineBreaks(caption, 'compact');

      expect(formatted).toBe('Line 1\nLine 2');
    });

    it('should format in spaced style', () => {
      const caption = 'Line 1\nLine 2';
      const formatted = formatCaptionWithLineBreaks(caption, 'spaced');

      expect(formatted).toContain('\n\n');
    });

    it('should format in paragraph style', () => {
      const caption = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const formatted = formatCaptionWithLineBreaks(caption, 'paragraph');

      expect(formatted).toContain('\n\n');
    });
  });

  describe('removeAITells', () => {
    it('should remove AI tell phrases', () => {
      const text = 'Let me delve into this topic. As an AI, I can help.';
      const result = removeAITells(text);

      expect(result.cleaned).not.toContain('delve into');
      expect(result.cleaned).not.toContain('As an AI');
      expect(result.removedPhrases.length).toBeGreaterThan(0);
    });

    it('should remove generic business jargon', () => {
      const text = 'We leverage cutting-edge solutions to optimize your workflow.';
      const result = removeAITells(text);

      expect(result.cleaned).not.toContain('leverage');
      expect(result.cleaned).not.toContain('cutting-edge');
      expect(result.removedPhrases).toContain('leverage');
    });

    it('should handle text without AI tells', () => {
      const text = 'This is a normal human sentence.';
      const result = removeAITells(text);

      expect(result.cleaned).toBe(text);
      expect(result.removedPhrases).toHaveLength(0);
    });
  });

  describe('addEngagingCTA', () => {
    it('should add comment CTA', () => {
      const caption = 'Great post about travel';
      const result = addEngagingCTA(caption, 'comment');

      expect(result).toContain(caption);
      expect(result.length).toBeGreaterThan(caption.length);
      expect(result.toLowerCase()).toMatch(/comment|think|thoughts/);
    });

    it('should add share CTA', () => {
      const caption = 'Great tip';
      const result = addEngagingCTA(caption, 'share');

      expect(result.toLowerCase()).toMatch(/share|tag|send/);
    });

    it('should add save CTA', () => {
      const caption = 'Useful information';
      const result = addEngagingCTA(caption, 'save');

      expect(result.toLowerCase()).toMatch(/save|bookmark/);
    });

    it('should auto-select CTA based on content', () => {
      const questionCaption = 'What do you think about this?';
      const result = addEngagingCTA(questionCaption, 'auto');

      expect(result).toBeTruthy();
    });
  });

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const text = 'This is a very long text that needs to be truncated';
      const result = truncateText(text, 20);

      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toContain('...');
    });

    it('should not truncate short text', () => {
      const text = 'Short text';
      const result = truncateText(text, 20);

      expect(result).toBe(text);
    });

    it('should break at word boundary', () => {
      const text = 'This is a long text';
      const result = truncateText(text, 12);

      expect(result).not.toContain('text');
      expect(result).toContain('...');
    });
  });

  describe('validateCaption', () => {
    it('should validate correct caption', () => {
      const caption = 'This is a valid Instagram caption with good length';
      const result = validateCaption(caption, 'instagram');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect too long caption', () => {
      const caption = 'a'.repeat(3000);
      const result = validateCaption(caption, 'instagram');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect too many hashtags', () => {
      const caption = 'Caption ' + Array.from({ length: 35 }, (_, i) => `#tag${i}`).join(' ');
      const result = validateCaption(caption, 'instagram');

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('hashtag'))).toBe(true);
    });

    it('should warn about short caption', () => {
      const caption = 'Hi';
      const result = validateCaption(caption, 'instagram');

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should detect empty caption', () => {
      const result = validateCaption('', 'instagram');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Caption is empty');
    });
  });

  describe('generateCaptionVariation', () => {
    it('should create shorter variation', () => {
      const caption = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const variation = generateCaptionVariation(caption, 'shorter');

      expect(variation.length).toBeLessThan(caption.length);
    });

    it('should create longer variation', () => {
      const caption = 'Short caption.';
      const variation = generateCaptionVariation(caption, 'longer');

      expect(variation.length).toBeGreaterThan(caption.length);
    });

    it('should add more emojis', () => {
      const caption = 'Caption without emojis.';
      const variation = generateCaptionVariation(caption, 'more-emojis');

      // The implementation adds emojis to sentence endings
      expect(variation).toContain('✨');
    });

    it('should remove emojis', () => {
      const caption = 'Caption with 😊 emojis 🎉!';
      const variation = generateCaptionVariation(caption, 'fewer-emojis');

      const emojiCount = (variation.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
      expect(emojiCount).toBe(0);
    });

    it('should make more formal', () => {
      const caption = 'Gonna wanna gotta make this formal.';
      const variation = generateCaptionVariation(caption, 'more-formal');

      expect(variation).toContain('going to');
      expect(variation).toContain('want to');
      expect(variation).toContain('have to');
    });

    it('should make more casual', () => {
      const caption = 'I want to going to do this.';
      const variation = generateCaptionVariation(caption, 'more-casual');

      expect(variation).toContain('wanna');
      expect(variation).toContain('gonna');
    });
  });
});
