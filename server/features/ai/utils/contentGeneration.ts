/**
 * AI Utility: Content Generation
 * 
 * Provides reusable utilities for text formatting, caption optimization,
 * and content post-processing across all AI services.
 * 
 * Requirements: 12.4 (content generation utilities)
 */

export interface CaptionOptimizationResult {
  optimizedCaption: string;
  improvements: string[];
  characterCount: number;
  wordCount: number;
  hashtagCount: number;
  emojiCount: number;
}

export interface HashtagExtractionResult {
  caption: string;
  hashtags: string[];
}

export interface ContentMetrics {
  characterCount: number;
  wordCount: number;
  sentenceCount: number;
  hashtagCount: number;
  emojiCount: number;
  mentionCount: number;
  linkCount: number;
}

/**
 * Extracts hashtags from caption text and returns them separately
 */
export function extractHashtags(text: string): HashtagExtractionResult {
  if (!text) {
    return { caption: '', hashtags: [] };
  }

  // Extract all hashtags using regex
  const hashtagRegex = /#[\w\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF]+/g;
  const hashtags = text.match(hashtagRegex) || [];

  // Remove hashtags from caption to get clean caption
  const caption = text.replace(hashtagRegex, '').trim();

  // Remove duplicate hashtags (case-insensitive)
  const uniqueHashtags = Array.from(
    new Set(hashtags.map(tag => tag.toLowerCase()))
  ).map(tag => {
    // Find the original casing from the first occurrence
    return hashtags.find(h => h.toLowerCase() === tag) || tag;
  });

  return {
    caption: caption.replace(/\s+/g, ' ').trim(), // Normalize whitespace
    hashtags: uniqueHashtags
  };
}

/**
 * Formats hashtags into a standardized format
 */
export function formatHashtags(hashtags: string[]): string[] {
  return hashtags
    .map(tag => {
      // Ensure hashtag starts with #
      const formatted = tag.startsWith('#') ? tag : `#${tag}`;
      
      // Remove spaces and special characters except underscore
      return formatted.replace(/[^\w#]/g, '');
    })
    .filter(tag => tag.length > 1) // Remove empty or single-character tags
    .filter((tag, index, self) => 
      // Remove duplicates (case-insensitive)
      self.findIndex(t => t.toLowerCase() === tag.toLowerCase()) === index
    );
}

/**
 * Parses hashtag text from AI response and extracts individual hashtags
 */
export function parseHashtagsFromText(text: string): string[] {
  if (!text) return [];

  // Split by spaces and newlines
  const tokens = text.split(/[\s\n]+/);
  
  // Filter to get only hashtags
  const hashtags = tokens
    .filter(token => token.startsWith('#'))
    .slice(0, 15); // Limit to 15 hashtags
  
  return formatHashtags(hashtags);
}

/**
 * Optimizes caption for platform-specific requirements
 */
export function optimizeCaption(
  caption: string,
  platform: string = 'instagram',
  options: {
    maxLength?: number;
    removeExcessiveEmojis?: boolean;
    removeExcessiveHashtags?: boolean;
    addLineBreaks?: boolean;
  } = {}
): CaptionOptimizationResult {
  const {
    maxLength = 2200, // Instagram limit
    removeExcessiveEmojis = false,
    removeExcessiveHashtags = false,
    addLineBreaks = true
  } = options;

  let optimized = caption;
  const improvements: string[] = [];

  // Extract hashtags first
  const { caption: cleanCaption, hashtags } = extractHashtags(optimized);
  optimized = cleanCaption;

  // Trim to max length
  if (optimized.length > maxLength) {
    optimized = optimized.substring(0, maxLength - 3) + '...';
    improvements.push(`Trimmed to ${maxLength} characters`);
  }

  // Remove excessive emojis (more than 3 consecutive)
  if (removeExcessiveEmojis) {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
    const consecutiveEmojiRegex = /([\u{1F300}-\u{1F9FF}]\s*){4,}/gu;
    if (consecutiveEmojiRegex.test(optimized)) {
      optimized = optimized.replace(consecutiveEmojiRegex, (match) => {
        const emojis = match.match(emojiRegex) || [];
        return emojis.slice(0, 3).join(' ') + ' ';
      });
      improvements.push('Reduced excessive emoji usage');
    }
  }

  // Limit hashtags if too many
  let finalHashtags = hashtags;
  if (removeExcessiveHashtags && hashtags.length > 12) {
    finalHashtags = hashtags.slice(0, 12);
    improvements.push(`Limited hashtags to 12 (from ${hashtags.length})`);
  }

  // Add line breaks for readability
  if (addLineBreaks && platform.toLowerCase() === 'instagram') {
    // Add double line break after first sentence (hook)
    optimized = optimized.replace(/^([^.!?]+[.!?])\s*/, '$1\n\n');
    improvements.push('Added line breaks for readability');
  }

  // Combine caption and hashtags
  const finalCaption = finalHashtags.length > 0
    ? `${optimized}\n\n${finalHashtags.join(' ')}`
    : optimized;

  // Calculate metrics
  const metrics = calculateContentMetrics(finalCaption);

  return {
    optimizedCaption: finalCaption,
    improvements,
    characterCount: metrics.characterCount,
    wordCount: metrics.wordCount,
    hashtagCount: metrics.hashtagCount,
    emojiCount: metrics.emojiCount
  };
}

/**
 * Calculates comprehensive content metrics
 */
export function calculateContentMetrics(text: string): ContentMetrics {
  if (!text) {
    return {
      characterCount: 0,
      wordCount: 0,
      sentenceCount: 0,
      hashtagCount: 0,
      emojiCount: 0,
      mentionCount: 0,
      linkCount: 0
    };
  }

  // Character count (excluding hashtags)
  const { caption } = extractHashtags(text);
  const characterCount = caption.length;

  // Word count
  const words = caption.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Sentence count
  const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = sentences.length;

  // Hashtag count
  const hashtagRegex = /#[\w\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF]+/g;
  const hashtags = text.match(hashtagRegex) || [];
  const hashtagCount = hashtags.length;

  // Emoji count
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
  const emojis = text.match(emojiRegex) || [];
  const emojiCount = emojis.length;

  // Mention count (@username)
  const mentionRegex = /@[\w.]+/g;
  const mentions = text.match(mentionRegex) || [];
  const mentionCount = mentions.length;

  // Link count
  const linkRegex = /https?:\/\/[^\s]+/g;
  const links = text.match(linkRegex) || [];
  const linkCount = links.length;

  return {
    characterCount,
    wordCount,
    sentenceCount,
    hashtagCount,
    emojiCount,
    mentionCount,
    linkCount
  };
}

/**
 * Formats caption with proper line breaks and spacing
 */
export function formatCaptionWithLineBreaks(
  caption: string,
  style: 'compact' | 'spaced' | 'paragraph' = 'spaced'
): string {
  let formatted = caption.trim();

  if (style === 'compact') {
    // Single line breaks only
    formatted = formatted.replace(/\n{2,}/g, '\n');
  } else if (style === 'spaced') {
    // Double line breaks between sections
    formatted = formatted.replace(/\n+/g, '\n\n');
  } else if (style === 'paragraph') {
    // Paragraph style with clear separation
    const sentences = formatted.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length > 3) {
      // First sentence (hook) standalone
      // Middle sentences grouped
      // Last sentence (CTA) standalone
      formatted = `${sentences[0].trim()}.\n\n${sentences.slice(1, -1).join('. ').trim()}.\n\n${sentences[sentences.length - 1].trim()}.`;
    }
  }

  return formatted;
}

/**
 * Removes AI tells and generic phrases that make content sound robotic
 */
export function removeAITells(text: string): {
  cleaned: string;
  removedPhrases: string[];
} {
  const aiTells = [
    /\b(as an AI|I'm an AI|I am an AI)\b/gi,
    /\b(delve into|dive deep|elevate your|unlock the|embark on a journey)\b/gi,
    /\b(in conclusion|to summarize|in summary)\b/gi,
    /\b(it's important to note|it's worth noting|bear in mind)\b/gi,
    /\b(furthermore|moreover|additionally|nevertheless)\b/gi,
    /\b(leverage|utilize|optimize|maximize)\b/gi,
    /\b(cutting-edge|game-changing|revolutionary|groundbreaking)\b/gi,
    /\b(seamless|robust|comprehensive|holistic)\b/gi
  ];

  let cleaned = text;
  const removedPhrases: string[] = [];

  aiTells.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        if (!removedPhrases.includes(match.toLowerCase())) {
          removedPhrases.push(match.toLowerCase());
        }
      });
      cleaned = cleaned.replace(pattern, '');
    }
  });

  // Clean up extra spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return { cleaned, removedPhrases };
}

/**
 * Adds engaging CTAs (Call-to-Action) to caption
 */
export function addEngagingCTA(
  caption: string,
  ctaType: 'comment' | 'share' | 'save' | 'tag' | 'question' | 'auto' = 'auto'
): string {
  const ctas: Record<string, string[]> = {
    comment: [
      '\n\nWhat do you think? Drop a comment! 💭',
      '\n\nShare your thoughts below! 👇',
      '\n\nLet me know in the comments! 💬'
    ],
    share: [
      '\n\nShare this with someone who needs to see it! 🔄',
      '\n\nTag a friend who would love this! 👥',
      '\n\nSend this to your bestie! 💌'
    ],
    save: [
      '\n\nSave this for later! 🔖',
      '\n\nBookmark this for future reference! 📌',
      '\n\nDon\'t forget to save this! ⭐'
    ],
    tag: [
      '\n\nTag someone who needs this! 🏷️',
      '\n\nWho comes to mind? Tag them! 👇',
      '\n\nTag your squad! 👯'
    ],
    question: [
      '\n\nWhat\'s your experience with this? 🤔',
      '\n\nHave you tried this before? Let me know! 💭',
      '\n\nYour turn - what would you do? 👇'
    ]
  };

  // Auto-select based on caption content
  let selectedType = ctaType;
  if (ctaType === 'auto') {
    if (caption.includes('?')) {
      selectedType = 'comment';
    } else if (caption.includes('tip') || caption.includes('advice')) {
      selectedType = 'save';
    } else {
      selectedType = 'share';
    }
  }

  const ctaOptions = ctas[selectedType] || ctas.comment;
  const randomCTA = ctaOptions[Math.floor(Math.random() * ctaOptions.length)];

  return caption + randomCTA;
}

/**
 * Truncates text to a specific length while preserving words
 */
export function truncateText(
  text: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to break at last space before maxLength
  const truncated = text.substring(0, maxLength - suffix.length);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + suffix;
  }

  return truncated + suffix;
}

/**
 * Validates caption meets platform requirements
 */
export function validateCaption(
  caption: string,
  platform: string = 'instagram'
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const metrics = calculateContentMetrics(caption);

  // Platform-specific validation
  if (platform.toLowerCase() === 'instagram') {
    if (metrics.characterCount > 2200) {
      errors.push('Caption exceeds Instagram limit of 2,200 characters');
    }
    
    if (metrics.hashtagCount > 30) {
      errors.push('Too many hashtags (Instagram limit: 30)');
    }

    if (metrics.hashtagCount > 15) {
      warnings.push('More than 15 hashtags may reduce reach');
    }

    if (metrics.emojiCount > 10) {
      warnings.push('Excessive emoji usage may appear unprofessional');
    }
  }

  // General validation
  if (metrics.characterCount === 0) {
    errors.push('Caption is empty');
  }

  if (metrics.wordCount < 3) {
    warnings.push('Caption is very short - consider adding more context');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generates caption variations by applying different styles
 */
export function generateCaptionVariation(
  baseCaption: string,
  variationType: 'shorter' | 'longer' | 'more-emojis' | 'fewer-emojis' | 'more-formal' | 'more-casual'
): string {
  let variation = baseCaption;

  switch (variationType) {
    case 'shorter':
      // Take first 2 sentences and add CTA
      const sentences = baseCaption.split(/[.!?]+/).filter(s => s.trim());
      variation = sentences.slice(0, 2).join('. ') + '.';
      break;

    case 'longer':
      // Add more context (placeholder - would need AI in real implementation)
      variation = baseCaption + '\n\nWant to learn more? Check out the full story!';
      break;

    case 'more-emojis':
      // Add relevant emojis at sentence ends
      variation = baseCaption.replace(/\./g, '. ✨').replace(/!/g, '! 🎉');
      break;

    case 'fewer-emojis':
      // Remove emojis
      variation = baseCaption.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
      break;

    case 'more-formal':
      // Remove casual language markers
      variation = baseCaption
        .replace(/\b(gonna|wanna|gotta)\b/gi, match => {
          const replacements: Record<string, string> = {
            gonna: 'going to',
            wanna: 'want to',
            gotta: 'have to'
          };
          return replacements[match.toLowerCase()] || match;
        });
      break;

    case 'more-casual':
      // Add casual language markers
      variation = baseCaption
        .replace(/going to/gi, 'gonna')
        .replace(/want to/gi, 'wanna');
      break;
  }

  return variation.trim();
}
