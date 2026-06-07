import { VoiceProfile } from './VoiceProfileService';

/**
 * Platform-specific constraints and rules
 */
export interface PlatformConstraints {
  platform: 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok';
  characterLimit: number;
  hashtagLimit: number;
  hashtagPlacement: 'inline' | 'end' | 'separate';
  emojiStyle: 'friendly' | 'minimal' | 'moderate' | 'professional';
  toneGuidelines: string;
  lineBreakStyle: 'mobile-first' | 'paragraph' | 'compact';
  typicalLength: {
    min: number;
    optimal: number;
    max: number;
  };
}

/**
 * Validation result for platform-specific captions
 */
export interface PlatformValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  characterCount: number;
  hashtagCount: number;
  suggestions: string[];
}

/**
 * Adapted caption result
 */
export interface AdaptedCaption {
  platform: string;
  caption: string;
  hashtags: string[];
  characterCount: number;
  warnings: string[];
  adaptationNotes: string[];
  optimizationTips: string[];
}

/**
 * PlatformAdapterService
 * 
 * Service for adapting caption generation for different social media platforms.
 * Handles platform-specific constraints, formatting rules, and tone adjustments
 * while preserving the user's unique voice profile characteristics.
 * 
 * Supported Platforms:
 * - Instagram: 2,200 char limit, 30 hashtags max, emoji-friendly
 * - Facebook: 63,206 char limit, 50 hashtags max
 * - Twitter/X: 280 char limit, no hashtag limit (practical: 2-3), concise style
 * - LinkedIn: 3,000 char limit, 30 hashtags max, professional tone
 * - TikTok: 2,200 char limit, 30 hashtags max, ultra-casual Gen Z style
 */
export class PlatformAdapterService {
  private platformConstraints: Map<string, PlatformConstraints>;

  constructor() {
    this.platformConstraints = new Map();
    this.initializePlatformConstraints();
  }

  /**
   * Initialize platform-specific constraints and rules
   */
  private initializePlatformConstraints(): void {
    // Instagram
    this.platformConstraints.set('instagram', {
      platform: 'instagram',
      characterLimit: 2200,
      hashtagLimit: 30,
      hashtagPlacement: 'separate',
      emojiStyle: 'friendly',
      toneGuidelines: 'Casual, authentic, visual-focused. Use line breaks for readability. Emoji-friendly.',
      lineBreakStyle: 'mobile-first',
      typicalLength: {
        min: 100,
        optimal: 300,
        max: 2200
      }
    });

    // Facebook
    this.platformConstraints.set('facebook', {
      platform: 'facebook',
      characterLimit: 63206,
      hashtagLimit: 50,
      hashtagPlacement: 'inline',
      emojiStyle: 'moderate',
      toneGuidelines: 'Conversational, storytelling-focused. Can be longer-form. Moderate emoji use.',
      lineBreakStyle: 'paragraph',
      typicalLength: {
        min: 100,
        optimal: 500,
        max: 2000
      }
    });

    // Twitter/X
    this.platformConstraints.set('twitter', {
      platform: 'twitter',
      characterLimit: 280,
      hashtagLimit: 100, // No technical limit, but practical limit
      hashtagPlacement: 'inline',
      emojiStyle: 'minimal',
      toneGuidelines: 'Concise, punchy, direct. Every word counts. Use 2-3 hashtags max for readability.',
      lineBreakStyle: 'compact',
      typicalLength: {
        min: 50,
        optimal: 200,
        max: 280
      }
    });

    // LinkedIn
    this.platformConstraints.set('linkedin', {
      platform: 'linkedin',
      characterLimit: 3000,
      hashtagLimit: 30,
      hashtagPlacement: 'end',
      emojiStyle: 'professional',
      toneGuidelines: 'Professional, insightful, value-driven. Focus on business context and industry insights.',
      lineBreakStyle: 'paragraph',
      typicalLength: {
        min: 150,
        optimal: 600,
        max: 1500
      }
    });

    // TikTok
    this.platformConstraints.set('tiktok', {
      platform: 'tiktok',
      characterLimit: 2200,
      hashtagLimit: 30,
      hashtagPlacement: 'inline',
      emojiStyle: 'friendly',
      toneGuidelines: 'Ultra-casual, fun, trending. Use Gen Z language, trending sounds/hashtags. Short and snappy.',
      lineBreakStyle: 'compact',
      typicalLength: {
        min: 50,
        optimal: 150,
        max: 300
      }
    });
  }

  /**
   * Get platform constraints
   * Returns character limits, hashtag limits, and formatting rules for a specific platform
   * 
   * @param platform - Target platform (instagram, facebook, twitter, linkedin, tiktok)
   * @returns Platform-specific constraints and rules
   */
  getPlatformConstraints(platform: string): PlatformConstraints {
    const normalizedPlatform = platform.toLowerCase();
    const constraints = this.platformConstraints.get(normalizedPlatform);

    if (!constraints) {
      throw new Error(`Unsupported platform: ${platform}. Supported platforms: instagram, facebook, twitter, linkedin, tiktok`);
    }

    return constraints;
  }

  /**
   * Adapt caption for specific platform
   * Adjusts caption structure, hashtag placement, and tone based on platform requirements
   * while preserving voice profile characteristics
   * 
   * @param caption - Original caption (typically Instagram-formatted)
   * @param platform - Target platform
   * @param voiceProfile - Optional user voice profile to maintain consistency
   * @returns Adapted caption with platform-specific formatting
   */
  async adaptForPlatform(
    caption: string,
    platform: string,
    voiceProfile?: VoiceProfile
  ): Promise<AdaptedCaption> {
    const normalizedPlatform = platform.toLowerCase();
    const constraints = this.getPlatformConstraints(normalizedPlatform);

    // Extract hashtags from original caption
    const { cleanCaption, hashtags } = this.extractHashtags(caption);

    let adaptedCaption = cleanCaption;
    const warnings: string[] = [];
    const adaptationNotes: string[] = [];
    const optimizationTips: string[] = [];

    // Platform-specific adaptations
    switch (normalizedPlatform) {
      case 'twitter':
        adaptedCaption = this.adaptForTwitter(cleanCaption, hashtags, warnings, adaptationNotes, optimizationTips);
        break;

      case 'linkedin':
        adaptedCaption = this.adaptForLinkedIn(cleanCaption, voiceProfile, warnings, adaptationNotes, optimizationTips);
        break;

      case 'facebook':
        adaptedCaption = this.adaptForFacebook(cleanCaption, warnings, adaptationNotes, optimizationTips);
        break;

      case 'instagram':
        // No adaptation needed for Instagram (source platform)
        adaptedCaption = cleanCaption;
        adaptationNotes.push('Original Instagram format maintained');
        break;

      case 'tiktok':
        adaptedCaption = this.adaptForTikTok(cleanCaption, warnings, adaptationNotes, optimizationTips);
        break;

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Apply line break style
    adaptedCaption = this.applyLineBreakStyle(adaptedCaption, constraints.lineBreakStyle);

    // Adjust emoji usage based on platform
    adaptedCaption = this.adjustEmojiUsage(adaptedCaption, constraints.emojiStyle, voiceProfile);

    // Limit hashtags based on platform
    const limitedHashtags = this.limitHashtags(hashtags, constraints.hashtagLimit, normalizedPlatform);

    // Check if caption needs truncation BEFORE applying it
    const needsTruncation = adaptedCaption.length > constraints.characterLimit;
    
    // Add optimization tips BEFORE truncation
    if (adaptedCaption.length < constraints.typicalLength.min) {
      optimizationTips.push(`Consider expanding caption. Typical ${normalizedPlatform} posts are ${constraints.typicalLength.optimal} characters for better engagement.`);
    }

    if (adaptedCaption.length > constraints.typicalLength.max) {
      optimizationTips.push(`Caption is quite long for ${normalizedPlatform}. Consider condensing for better readability.`);
    }
    
    // Validate length and truncate if necessary
    if (needsTruncation) {
      warnings.push(`Caption exceeds ${normalizedPlatform} character limit (${adaptedCaption.length}/${constraints.characterLimit})`);
      // Truncate if necessary
      adaptedCaption = this.truncateCaption(adaptedCaption, constraints.characterLimit, constraints.typicalLength.optimal);
      adaptationNotes.push('Caption truncated to fit character limit');
    }

    return {
      platform: normalizedPlatform,
      caption: adaptedCaption,
      hashtags: limitedHashtags,
      characterCount: adaptedCaption.length,
      warnings,
      adaptationNotes,
      optimizationTips
    };
  }

  /**
   * Validate caption for platform requirements
   * Checks character limits, hashtag limits, and formatting rules
   * 
   * @param caption - Caption to validate
   * @param platform - Target platform
   * @returns Validation result with errors, warnings, and suggestions
   */
  validateForPlatform(caption: string, platform: string): PlatformValidation {
    const normalizedPlatform = platform.toLowerCase();
    const constraints = this.getPlatformConstraints(normalizedPlatform);

    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Extract hashtags
    const { cleanCaption, hashtags } = this.extractHashtags(caption);
    const characterCount = cleanCaption.length;
    const hashtagCount = hashtags.length;

    // Validate character limit
    if (characterCount > constraints.characterLimit) {
      errors.push(`Caption exceeds ${normalizedPlatform} character limit: ${characterCount}/${constraints.characterLimit} characters`);
      suggestions.push(`Remove ${characterCount - constraints.characterLimit} characters to meet platform requirements`);
    }

    // Validate hashtag limit
    if (hashtagCount > constraints.hashtagLimit) {
      errors.push(`Too many hashtags: ${hashtagCount}/${constraints.hashtagLimit} hashtags`);
      suggestions.push(`Remove ${hashtagCount - constraints.hashtagLimit} hashtags`);
    }

    // Platform-specific validation
    switch (normalizedPlatform) {
      case 'twitter':
        if (hashtagCount > 3) {
          warnings.push('Twitter posts perform better with 2-3 hashtags. Consider reducing.');
        }
        if (characterCount > 240) {
          warnings.push('Twitter posts near 280 character limit may appear cluttered. Consider shortening.');
        }
        if (characterCount < 50) {
          suggestions.push('Very short tweets may not provide enough context. Consider expanding.');
        }
        break;

      case 'linkedin':
        const emojiCount = this.countEmojis(caption);
        if (emojiCount > 3) {
          warnings.push('LinkedIn posts should use emojis sparingly for professional tone.');
        }
        if (characterCount < 150) {
          suggestions.push('LinkedIn posts typically perform better with more substantial content (150+ characters).');
        }
        // Check for professional tone
        if (this.hasInformalLanguage(caption)) {
          warnings.push('Caption contains informal language that may not suit LinkedIn\'s professional audience.');
        }
        break;

      case 'facebook':
        if (characterCount > 2000) {
          warnings.push('Very long Facebook posts may see reduced engagement. Consider condensing.');
        }
        break;

      case 'instagram':
        if (hashtagCount < 5) {
          suggestions.push('Instagram posts typically benefit from 10-30 hashtags for better discoverability.');
        }
        if (!this.hasLineBreaks(caption)) {
          suggestions.push('Add line breaks for better mobile readability on Instagram.');
        }
        break;

      case 'tiktok':
        if (characterCount > 200) {
          warnings.push('TikTok captions work best when short and punchy (50-150 characters).');
        }
        if (characterCount < 50) {
          suggestions.push('Very short caption. Consider adding a hook or trending phrase for better engagement.');
        }
        if (hashtagCount < 3) {
          suggestions.push('TikTok discovery relies heavily on hashtags. Consider adding 5-10 relevant hashtags including trending ones.');
        }
        break;
    }

    // Length warnings
    if (characterCount < constraints.typicalLength.min) {
      warnings.push(`Caption is shorter than typical ${normalizedPlatform} posts (${characterCount}/${constraints.typicalLength.optimal} characters)`);
    }

    if (characterCount > constraints.typicalLength.max) {
      warnings.push(`Caption is longer than typical ${normalizedPlatform} posts (${characterCount}/${constraints.typicalLength.optimal} characters)`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      characterCount,
      hashtagCount,
      suggestions
    };
  }

  // ===== Private Helper Methods =====

  /**
   * Extract hashtags from caption
   */
  private extractHashtags(caption: string): { cleanCaption: string; hashtags: string[] } {
    const hashtagRegex = /#[\w]+/g;
    const hashtags = caption.match(hashtagRegex) || [];
    const cleanCaption = caption.replace(hashtagRegex, '').trim();

    return {
      cleanCaption,
      hashtags: hashtags.map(tag => tag.toLowerCase())
    };
  }

  /**
   * Adapt caption for Twitter (concise, punchy, direct)
   */
  private adaptForTwitter(
    caption: string,
    hashtags: string[],
    warnings: string[],
    adaptationNotes: string[],
    optimizationTips: string[]
  ): string {
    let adapted = caption;

    // Remove excessive line breaks (Twitter is more compact)
    adapted = adapted.replace(/\n{3,}/g, '\n\n');

    // Shorten if necessary (leave room for 2-3 hashtags which is about 30-40 chars)
    const targetLength = 240; // Leave room for hashtags
    if (adapted.length > targetLength) {
      // Try to condense
      adapted = this.condenseCaption(adapted, targetLength);
      adaptationNotes.push('Caption condensed for Twitter character limit');
      warnings.push('Original caption exceeded Twitter limit and was condensed');
    }

    // Make more concise and punchy
    adapted = this.makeMoreConcise(adapted);

    // Add optimization tips for hashtags
    if (hashtags.length > 3) {
      optimizationTips.push('Twitter posts perform best with 2-3 targeted hashtags. Consider reducing.');
    }

    adaptationNotes.push('Adapted for Twitter: concise and direct tone');

    return adapted;
  }

  /**
   * Adapt caption for LinkedIn (professional, insightful, value-driven)
   */
  private adaptForLinkedIn(
    caption: string,
    voiceProfile: VoiceProfile | undefined,
    warnings: string[],
    adaptationNotes: string[],
    optimizationTips: string[]
  ): string {
    let adapted = caption;

    // Make more professional tone
    adapted = this.adjustToneToProfessional(adapted);

    // Remove excessive emojis (keep max 2-3)
    const emojiCount = this.countEmojis(adapted);
    if (emojiCount > 3) {
      adapted = this.reduceEmojis(adapted, 3);
      adaptationNotes.push('Reduced emoji usage for professional tone');
    }

    // Add business context if too casual
    if (voiceProfile && voiceProfile.toneMarkers.professional < 0.4) {
      warnings.push('Original caption may be too casual for LinkedIn. Consider adding business insights.');
      optimizationTips.push('Frame your message in terms of business value, industry insights, or professional growth.');
    }

    // Use paragraph breaks for better readability
    adapted = this.applyParagraphBreaks(adapted);

    adaptationNotes.push('Adapted for LinkedIn: professional tone and business focus');

    return adapted;
  }

  /**
   * Adapt caption for Facebook (conversational, storytelling)
   */
  private adaptForFacebook(
    caption: string,
    warnings: string[],
    adaptationNotes: string[],
    optimizationTips: string[]
  ): string {
    let adapted = caption;

    // Facebook allows longer content, so we can keep more storytelling elements
    // Apply paragraph structure for better readability
    adapted = this.applyParagraphBreaks(adapted);

    // Keep conversational tone but make it more story-focused
    adaptationNotes.push('Adapted for Facebook: conversational and storytelling-focused');

    if (adapted.length < 200) {
      optimizationTips.push('Facebook posts can be longer and more detailed. Consider expanding the story.');
    }

    return adapted;
  }

  /**
   * Adapt caption for TikTok (ultra-casual, Gen Z, trending-focused)
   */
  private adaptForTikTok(
    caption: string,
    warnings: string[],
    adaptationNotes: string[],
    optimizationTips: string[]
  ): string {
    let adapted = caption;

    // TikTok captions should be short and punchy
    const targetLength = 150; // Optimal for TikTok
    if (adapted.length > targetLength) {
      adapted = this.condenseCaption(adapted, targetLength);
      adaptationNotes.push('Caption condensed for TikTok optimal length');
    }

    // Apply compact line breaks (TikTok is mobile-only, keep it tight)
    adapted = adapted.replace(/\n{3,}/g, '\n');

    // Make more casual and fun
    adapted = this.makeTikTokStyle(adapted);

    adaptationNotes.push('Adapted for TikTok: ultra-casual and trending-focused');

    if (adapted.length > 200) {
      optimizationTips.push('TikTok captions work best when short and punchy (50-150 chars). Consider condensing.');
    }

    if (adapted.length < 50) {
      optimizationTips.push('Caption is very short. Consider adding a hook or trending phrase to boost engagement.');
    }

    return adapted;
  }

  /**
   * Apply line break style based on platform
   */
  private applyLineBreakStyle(caption: string, style: string): string {
    switch (style) {
      case 'mobile-first':
        // Instagram-style: frequent line breaks for mobile readability
        return caption.replace(/([.!?])\s+/g, '$1\n\n');

      case 'paragraph':
        // LinkedIn/Facebook: paragraph breaks at logical points
        return caption.replace(/\n{3,}/g, '\n\n');

      case 'compact':
        // Twitter: minimal breaks, more compact
        return caption.replace(/\n{2,}/g, '\n');

      default:
        return caption;
    }
  }

  /**
   * Adjust emoji usage based on platform style
   */
  private adjustEmojiUsage(
    caption: string,
    emojiStyle: string,
    voiceProfile?: VoiceProfile
  ): string {
    const currentEmojiCount = this.countEmojis(caption);

    switch (emojiStyle) {
      case 'professional':
        // LinkedIn: keep max 2-3 emojis
        if (currentEmojiCount > 3) {
          return this.reduceEmojis(caption, 3);
        }
        break;

      case 'minimal':
        // Twitter: keep concise, max 1-2 emojis
        if (currentEmojiCount > 2) {
          return this.reduceEmojis(caption, 2);
        }
        break;

      case 'moderate':
        // Facebook: moderate use, max 5 emojis
        if (currentEmojiCount > 5) {
          return this.reduceEmojis(caption, 5);
        }
        break;

      case 'friendly':
        // Instagram: emoji-friendly, keep as is
        break;
    }

    return caption;
  }

  /**
   * Limit hashtags based on platform rules
   */
  private limitHashtags(hashtags: string[], limit: number, platform: string): string[] {
    // For Twitter, recommend only 2-3 hashtags regardless of technical limit
    const practicalLimit = platform === 'twitter' ? Math.min(3, limit) : limit;

    if (hashtags.length <= practicalLimit) {
      return hashtags;
    }

    // Keep most relevant hashtags (assume they're already sorted by relevance)
    return hashtags.slice(0, practicalLimit);
  }

  /**
   * Truncate caption to fit character limit while maintaining readability
   */
  private truncateCaption(caption: string, maxLength: number, optimalLength: number): string {
    if (caption.length <= maxLength) {
      return caption;
    }

    // Try to truncate at sentence boundary near optimal length
    const sentences = caption.match(/[^.!?]+[.!?]+/g) || [];
    let truncated = '';

    for (const sentence of sentences) {
      if ((truncated + sentence).length > optimalLength) {
        break;
      }
      truncated += sentence;
    }

    // If we got something reasonable, use it
    if (truncated.length > maxLength * 0.5) {
      return truncated.trim() + '...';
    }

    // Otherwise, hard truncate at word boundary
    const words = caption.split(' ');
    truncated = '';
    for (const word of words) {
      if ((truncated + ' ' + word).length > optimalLength) {
        break;
      }
      truncated += ' ' + word;
    }

    return truncated.trim() + '...';
  }

  /**
   * Count emojis in text
   */
  private countEmojis(text: string): number {
    // Emoji regex pattern
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const matches = text.match(emojiRegex);
    return matches ? matches.length : 0;
  }

  /**
   * Reduce emoji count in caption
   */
  private reduceEmojis(caption: string, maxEmojis: number): string {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    
    let emojiCount = 0;
    return caption.replace(emojiRegex, (match) => {
      emojiCount++;
      return emojiCount <= maxEmojis ? match : '';
    });
  }

  /**
   * Make caption more concise for Twitter
   */
  private makeMoreConcise(caption: string): string {
    let concise = caption;

    // Remove filler words
    const fillerWords = [
      /\breally\b/gi,
      /\bvery\b/gi,
      /\bjust\b/gi,
      /\bactually\b/gi,
      /\bliterally\b/gi,
    ];

    fillerWords.forEach(pattern => {
      concise = concise.replace(pattern, '');
    });

    // Clean up extra spaces
    concise = concise.replace(/\s{2,}/g, ' ').trim();

    return concise;
  }

  /**
   * Condense caption to target length
   */
  private condenseCaption(caption: string, targetLength: number): string {
    if (caption.length <= targetLength) {
      return caption;
    }

    // Extract first sentence or two
    const sentences = caption.match(/[^.!?]+[.!?]+/g) || [];
    let condensed = sentences[0] || '';

    // Try to add second sentence if room
    if (sentences.length > 1 && (condensed + sentences[1]).length <= targetLength) {
      condensed += sentences[1];
    }

    return condensed.trim();
  }

  /**
   * Adjust tone to be more professional for LinkedIn
   */
  private adjustToneToProfessional(caption: string): string {
    let professional = caption;

    // Replace casual phrases with professional equivalents
    const replacements: Record<string, string> = {
      'gonna': 'going to',
      'wanna': 'want to',
      'gotta': 'need to',
      'kinda': 'kind of',
      'sorta': 'sort of',
      'yeah': 'yes',
      'nope': 'no',
      'ya know': 'you know',
    };

    Object.entries(replacements).forEach(([casual, formal]) => {
      const regex = new RegExp(`\\b${casual}\\b`, 'gi');
      professional = professional.replace(regex, formal);
    });

    return professional;
  }

  /**
   * Apply paragraph breaks for readability
   */
  private applyParagraphBreaks(caption: string): string {
    // Ensure proper spacing between paragraphs
    return caption.replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Make caption more TikTok-style (casual, Gen Z)
   */
  private makeTikTokStyle(caption: string): string {
    let tiktokStyle = caption;

    // Keep it casual and fun - TikTok is very informal
    // Don't need to formalize anything, keep exclamations and energy

    // TikTok loves short, punchy statements
    // Remove unnecessary connecting words to make it punchier
    tiktokStyle = tiktokStyle.replace(/\b(however|therefore|moreover|furthermore|additionally)\b/gi, '');

    // Clean up extra spaces
    tiktokStyle = tiktokStyle.replace(/\s{2,}/g, ' ').trim();

    return tiktokStyle;
  }

  /**
   * Check if caption has informal language
   */
  private hasInformalLanguage(caption: string): boolean {
    const informalPatterns = [
      /\bgonna\b/i,
      /\bwanna\b/i,
      /\bgotta\b/i,
      /\bkinda\b/i,
      /\bsorta\b/i,
      /\byeah\b/i,
      /\bnope\b/i,
      /\blol\b/i,
      /\bomg\b/i,
    ];

    return informalPatterns.some(pattern => pattern.test(caption));
  }

  /**
   * Check if caption has line breaks
   */
  private hasLineBreaks(caption: string): boolean {
    return caption.includes('\n');
  }
}
