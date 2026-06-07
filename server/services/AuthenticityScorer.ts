/**
 * AuthenticityScorer Service
 * Evaluates AI-generated captions against 12 human-likeness criteria
 * Requirements: 4.1, 4.2, 4.5
 */

// Voice Profile Interface for Caption Generation
export interface CaptionVoiceProfile {
  userId: string;
  workspaceId: string;
  
  // Voice Characteristics
  vocabularyFrequency: Record<string, number>;
  signaturePhrases: string[];
  sentenceLengthDistribution: {
    short: number;   // 1-5 words (percentage)
    medium: number;  // 6-15 words (percentage)
    long: number;    // 16+ words (percentage)
  };
  paragraphStructure: 'single' | 'short-breaks' | 'long-form';
  
  // Emoji & Punctuation
  emojiUsagePattern: {
    frequency: 'none' | 'minimal' | 'moderate' | 'heavy';
    placement: 'inline' | 'end' | 'both';
    topEmojis: string[];
  };
  punctuationStyle: {
    exclamationUsage: 'rare' | 'moderate' | 'frequent';
    questionUsage: 'rare' | 'moderate' | 'frequent';
    ellipsisUsage: boolean;
  };
  
  // Tone & Style
  toneMarkers: {
    casual: number;
    professional: number;
    humorous: number;
    inspirational: number;
    educational: number;
    conversational: number;
  };
  
  // Pattern Recognition
  hookPatterns: string[];
  engagementQuestionStyle: string[];
  storytellingStructure: 'linear' | 'flashback' | 'buildup' | 'revelation';
  
  // Metadata
  sampleSize: number;
  confidence: number;
}

export interface AuthenticityScore {
  overallScore: number;  // 0-100
  
  // Criteria Scores (each 0-10)
  criteriaScores: {
    vocabularyNaturalness: number;
    sentenceFlow: number;
    emojiPlacement: number;
    conversationalTone: number;
    platformAppropriateness: number;
    avoidsCorporateJargon: number;
    avoidsGenericPhrases: number;
    voiceConsistency: number;
    mobileReadability: number;
    hookStrength: number;
    engagementClarity: number;
    emotionalResonance: number;
  };
  
  // Flags
  aiTellsDetected: string[];
  recommendations: string[];
  
  passesThreshold: boolean;  // >= 80
}

/**
 * Detailed voice consistency analysis result
 * Requirement: 4.5
 * Task 7.3: Voice consistency checker with 0-100 scoring
 */
export interface VoiceConsistencyResult {
  overallScore: number;  // 0-100 (normalized from 0-10 dimension scores)
  passesThreshold: boolean;  // Score >= 80 required for voice consistency
  
  // Dimension scores
  dimensions: {
    vocabularyMatch: {
      score: number;  // 0-10
      overlap: number;  // 0-1 percentage
      missingWords: string[];  // User's frequent words not used
      unexpectedWords: string[];  // Words not in user's profile
    };
    toneAlignment: {
      score: number;  // 0-10
      profileTone: Record<string, number>;
      captionTone: Record<string, number>;
      mismatches: string[];  // Which tones are off
    };
    structureMatch: {
      score: number;  // 0-10
      sentenceLengthMatch: boolean;
      paragraphStyleMatch: boolean;
      deviations: string[];
    };
    signaturePhraseUsage: {
      score: number;  // 0-10
      phrasesUsed: string[];
      phrasesMissed: string[];
    };
    punctuationStyle: {
      score: number;  // 0-10
      exclamationMatch: boolean;
      questionMatch: boolean;
      ellipsisMatch: boolean;
      deviations: string[];
    };
    emojiConsistency: {
      score: number;  // 0-10
      frequencyMatch: boolean;
      placementMatch: boolean;
      topEmojisUsed: string[];
      deviations: string[];
    };
    hookPatternMatch: {
      score: number;  // 0-10
      matchFound: boolean;
      matchedPattern: string | null;
    };
    engagementStyleMatch: {
      score: number;  // 0-10
      matchFound: boolean;
      matchedStyle: string | null;
    };
  };
  
  // Specific mismatches for regeneration feedback
  mismatches: string[];
  
  // Actionable recommendations
  recommendations: string[];
  
  // Regeneration suggestions
  regenerationGuidance: {
    vocabularyAdjustments: string[];
    toneAdjustments: string[];
    structureAdjustments: string[];
    styleAdjustments: string[];
  };
}

export class AuthenticityScorer {
  // AI vocabulary blacklist - common words that make text sound AI-generated
  private readonly AI_VOCABULARY_BLACKLIST = [
    'delve', 'explore', 'journey', 'unlock', 'leverage', 'transform',
    'revolutionize', 'optimize', 'synergy', 'paradigm', 'robust',
    'utilize', 'facilitate', 'demonstrate', 'implement', 'comprehensive'
  ];
  
  // Generic phrases that sound templated
  private readonly GENERIC_PHRASE_BLACKLIST = [
    "let's dive in", "in today's digital age", "are you ready to",
    "buckle up", "here's the thing", "let me tell you", "picture this",
    "at the end of the day", "game changer", "next level"
  ];
  
  // Corporate jargon to avoid
  private readonly CORPORATE_JARGON = [
    'synergy', 'leverage', 'optimize', 'revolutionize', 'disrupt',
    'innovate', 'streamline', 'empower', 'solution', 'ecosystem',
    'alignment', 'bandwidth', 'circle back', 'move the needle'
  ];
  
  // Instagram-native terms (bonus for using these)
  private readonly INSTAGRAM_TERMS = [
    'story', 'stories', 'reel', 'reels', 'feed', 'swipe', 'tap',
    'dm', 'dms', 'ig', 'gram', 'link in bio', 'bio', 'post'
  ];

  // Emotional words for resonance scoring
  private readonly EMOTIONAL_WORDS = [
    'love', 'hate', 'fear', 'joy', 'sad', 'happy', 'excited', 'nervous',
    'proud', 'grateful', 'blessed', 'amazing', 'incredible', 'beautiful',
    'struggle', 'overcome', 'dream', 'hope', 'believe', 'inspire'
  ];

  /**
   * Main scoring method - evaluates caption against all 12 criteria
   * Requirements: 4.1, 4.2
   */
  async scoreCaption(
    caption: string,
    voiceProfile: CaptionVoiceProfile,
    platform: string
  ): Promise<AuthenticityScore> {
    const scores = {
      vocabularyNaturalness: this.scoreVocabularyNaturalness(caption, voiceProfile),
      sentenceFlow: this.scoreSentenceFlow(caption),
      emojiPlacement: this.scoreEmojiPlacement(caption, voiceProfile),
      conversationalTone: this.scoreConversationalTone(caption),
      platformAppropriateness: this.scorePlatformAppropriateness(caption, platform),
      avoidsCorporateJargon: this.scoreAvoidsCorporateJargon(caption),
      avoidsGenericPhrases: this.scoreAvoidsGenericPhrases(caption),
      voiceConsistency: this.scoreVoiceConsistency(caption, voiceProfile),
      mobileReadability: this.scoreMobileReadability(caption),
      hookStrength: this.scoreHookStrength(caption),
      engagementClarity: this.scoreEngagementClarity(caption),
      emotionalResonance: this.scoreEmotionalResonance(caption)
    };
    
    // Calculate overall score (sum / 120 * 100 to get 0-100)
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const overallScore = Math.round((totalScore / 120) * 100);
    
    // Detect AI tells and generate recommendations
    const aiTells = this.detectAITells(caption);
    const recommendations = this.generateRecommendations(scores, aiTells);
    
    return {
      overallScore,
      criteriaScores: scores,
      aiTellsDetected: aiTells,
      recommendations,
      passesThreshold: overallScore >= 80
    };
  }

  /**
   * Criterion 1: Vocabulary Naturalness (0-10)
   * Checks for AI vocabulary, voice profile vocabulary overlap, and casual contractions
   * Requirement: 4.4
   */
  private scoreVocabularyNaturalness(caption: string, profile: CaptionVoiceProfile): number {
    const words = caption.toLowerCase().split(/\s+/);
    let score = 10;
    
    // Penalize AI vocabulary blacklist words (heavy penalty)
    const aiWordCount = words.filter(w => this.AI_VOCABULARY_BLACKLIST.includes(w)).length;
    score -= aiWordCount * 2;
    
    // Check vocabulary overlap with user profile
    const vocabularyOverlap = words.filter(w => 
      profile.vocabularyFrequency && profile.vocabularyFrequency[w] > 0
    ).length / words.length;
    
    // Penalize low overlap with user's vocabulary
    if (vocabularyOverlap < 0.3) score -= 2;
    if (vocabularyOverlap < 0.2) score -= 2; // Additional penalty for very low overlap
    
    // Bonus for casual contractions (it's, don't, you're)
    const hasContractions = /\b(it's|don't|you're|can't|won't|isn't|aren't|wasn't|weren't|haven't|hasn't)\b/i.test(caption);
    if (hasContractions) score += 1;
    
    // Penalize overly formal words
    const formalWords = ['furthermore', 'moreover', 'thus', 'hence', 'therefore', 'subsequently'];
    const formalCount = words.filter(w => formalWords.includes(w)).length;
    score -= formalCount * 1.5;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 2: Sentence Flow (0-10)
   * Analyzes sentence length variation and rhythm
   * Requirement: 4.1
   */
  private scoreSentenceFlow(caption: string): number {
    // Split into sentences
    const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) return 0;
    if (sentences.length === 1) return 5; // Single sentence is okay but not ideal
    
    let score = 10;
    
    // Calculate sentence lengths
    const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
    
    // Check for variation in sentence lengths
    const lengthVariance = sentenceLengths.reduce((sum, len) => 
      sum + Math.pow(len - avgLength, 2), 0
    ) / sentenceLengths.length;
    
    // Low variance means all sentences are similar length (not natural)
    if (lengthVariance < 10) score -= 3;
    
    // Penalize run-on sentences (>40 words)
    const runOnSentences = sentenceLengths.filter(len => len > 40).length;
    score -= runOnSentences * 2;
    
    // Penalize if all sentences are very short or very long
    const allShort = sentenceLengths.every(len => len < 5);
    const allLong = sentenceLengths.every(len => len > 20);
    if (allShort || allLong) score -= 2;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 3: Emoji Placement (0-10)
   * Checks emoji frequency, placement style, and contextual relevance
   * Requirement: 4.1
   */
  private scoreEmojiPlacement(caption: string, profile: CaptionVoiceProfile): number {
    // More compatible emoji regex without unicode flag
    const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g;
    const emojis = caption.match(emojiRegex) || [];
    const emojiCount = emojis.length;
    
    let score = 10;
    
    // Check against user's emoji usage pattern
    const userFrequency = profile.emojiUsagePattern?.frequency || 'moderate';
    
    // Score based on matching user's frequency
    if (userFrequency === 'none' && emojiCount > 0) score -= 3;
    if (userFrequency === 'minimal' && emojiCount > 2) score -= 2;
    if (userFrequency === 'moderate' && (emojiCount < 1 || emojiCount > 5)) score -= 2;
    if (userFrequency === 'heavy' && emojiCount < 3) score -= 2;
    
    // Penalize emoji clusters (3+ emojis in a row) - simplified check
    const hasCluster = /(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]){3,}/.test(caption);
    if (hasCluster) score -= 3;
    
    // Check placement style - simplified
    const userPlacement = profile.emojiUsagePattern?.placement || 'inline';
    const hasInlineEmoji = /\w(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])\w/.test(caption);
    const endsWithEmoji = /(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])\s*$/.test(caption.trim());
    
    if (userPlacement === 'inline' && !hasInlineEmoji && emojiCount > 0) score -= 1;
    if (userPlacement === 'end' && !endsWithEmoji && emojiCount > 0) score -= 1;
    
    // Bonus for using user's top emojis
    if (profile.emojiUsagePattern?.topEmojis?.length > 0) {
      const usesTopEmoji = emojis.some(e => profile.emojiUsagePattern.topEmojis.includes(e));
      if (usesTopEmoji) score += 1;
    }
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 4: Conversational Tone (0-10)
   * Checks for direct address, questions, and conversational prompts
   * Requirement: 4.1
   */
  private scoreConversationalTone(caption: string): number {
    let score = 5; // Start at middle
    
    // Check for direct address (you, your)
    const hasDirectAddress = /\b(you|your|you're)\b/i.test(caption);
    if (hasDirectAddress) score += 2;
    
    // Check for questions
    const hasQuestion = caption.includes('?');
    if (hasQuestion) score += 2;
    
    // Check for rhetorical questions or asides
    const rhetoricalPatterns = /\b(right\?|isn't it\?|you know\?|don't you think\?)/i;
    if (rhetoricalPatterns.test(caption)) score += 1;
    
    // Penalize lecture-style writing (formal indicators)
    const lecturePatterns = /\b(firstly|secondly|in conclusion|to summarize|it is important to note)\b/i;
    if (lecturePatterns.test(caption)) score -= 3;
    
    // Bonus for conversational starters
    const conversationalStarters = /\b(hey|so|okay|alright|look|listen)\b/i;
    if (conversationalStarters.test(caption)) score += 1;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 5: Platform Appropriateness (0-10)
   * Verifies Instagram-native terms, mobile readability, and appropriate length
   * Requirement: 4.1
   */
  private scorePlatformAppropriateness(caption: string, platform: string): number {
    let score = 10;
    
    // Only score for Instagram
    if (platform.toLowerCase() !== 'instagram') return score;
    
    const lowerCaption = caption.toLowerCase();
    
    // Bonus for using Instagram-native terms
    const igTermsUsed = this.INSTAGRAM_TERMS.filter(term => 
      lowerCaption.includes(term)
    ).length;
    if (igTermsUsed > 0) score += Math.min(2, igTermsUsed);
    
    // Check for line breaks (mobile-friendly)
    const lineBreaks = (caption.match(/\n/g) || []).length;
    if (lineBreaks === 0 && caption.length > 100) score -= 2; // Long caption without breaks
    
    // Check caption length appropriateness
    const length = caption.length;
    if (length > 2200) score -= 2; // Instagram caption limit is 2200 chars
    if (length < 20) score -= 2; // Too short to be engaging
    
    // Penalize cross-platform generic language
    const crossPlatformTerms = ['click here', 'see more', 'visit our website', 'check out the link'];
    const hasCrossPlatform = crossPlatformTerms.some(term => lowerCaption.includes(term));
    if (hasCrossPlatform) score -= 2;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 6: Avoids Corporate Jargon (0-10)
   * Checks for business buzzwords and marketing speak
   * Requirement: 4.4
   */
  private scoreAvoidsCorporateJargon(caption: string): number {
    const words = caption.toLowerCase().split(/\s+/);
    let score = 10;
    
    // Count corporate jargon words
    const jargonCount = words.filter(w => this.CORPORATE_JARGON.includes(w)).length;
    score -= jargonCount * 2.5; // Heavy penalty for corporate speak
    
    // Penalize marketing buzzwords
    const marketingBuzzwords = ['exclusive', 'limited time', 'act now', 'don\'t miss out', 'special offer'];
    const buzzwordCount = marketingBuzzwords.filter(phrase => 
      caption.toLowerCase().includes(phrase)
    ).length;
    score -= buzzwordCount * 2;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 7: Avoids Generic Phrases (0-10)
   * Checks for cliché openers and template-like structure
   * Requirement: 4.4
   */
  private scoreAvoidsGenericPhrases(caption: string): number {
    const lowerCaption = caption.toLowerCase();
    let score = 10;
    
    // Count generic phrase occurrences
    const genericCount = this.GENERIC_PHRASE_BLACKLIST.filter(phrase => 
      lowerCaption.includes(phrase.toLowerCase())
    ).length;
    score -= genericCount * 3; // Heavy penalty for generic phrases
    
    // Bonus for unique, specific openings (proper nouns, numbers, specific details)
    const hasSpecificOpening = /^[A-Z][a-z]+ (just|really|actually|finally)|\d+|"[^"]+"/;
    if (hasSpecificOpening.test(caption)) score += 1;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 8: Voice Consistency (0-10)
   * Compares caption to user's voice profile for consistency
   * Requirement: 4.5
   */
  private scoreVoiceConsistency(caption: string, profile: CaptionVoiceProfile): number {
    let score = 10;
    const lowerCaption = caption.toLowerCase();
    const words = lowerCaption.split(/\s+/).filter(w => w.length > 0);
    
    // 1. Calculate vocabulary overlap percentage
    if (profile.vocabularyFrequency && Object.keys(profile.vocabularyFrequency).length > 0) {
      const vocabularyWords = words.filter(w => 
        profile.vocabularyFrequency[w] && profile.vocabularyFrequency[w] > 0
      );
      const vocabularyOverlap = vocabularyWords.length / words.length;
      
      // Penalize low vocabulary overlap
      if (vocabularyOverlap < 0.2) score -= 2.5; // Very low overlap - not their voice
      else if (vocabularyOverlap < 0.3) score -= 1.5; // Low overlap
      else if (vocabularyOverlap < 0.4) score -= 0.5; // Moderate overlap
      // 40%+ overlap is good - no penalty
      
      // Bonus for high overlap
      if (vocabularyOverlap >= 0.6) score += 1;
    }
    
    // 2. Check sentence length distribution
    const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
    
    if (sentenceLengths.length > 0) {
      const shortCount = sentenceLengths.filter(len => len <= 5).length;
      const mediumCount = sentenceLengths.filter(len => len > 5 && len <= 15).length;
      const longCount = sentenceLengths.filter(len => len > 15).length;
      const total = sentenceLengths.length;
      
      const actualDistribution = {
        short: (shortCount / total) * 100,
        medium: (mediumCount / total) * 100,
        long: (longCount / total) * 100
      };
      
      // Compare with user's distribution
      if (profile.sentenceLengthDistribution) {
        const shortDiff = Math.abs(actualDistribution.short - profile.sentenceLengthDistribution.short);
        const mediumDiff = Math.abs(actualDistribution.medium - profile.sentenceLengthDistribution.medium);
        const longDiff = Math.abs(actualDistribution.long - profile.sentenceLengthDistribution.long);
        
        const avgDiff = (shortDiff + mediumDiff + longDiff) / 3;
        if (avgDiff > 30) score -= 2; // Significant deviation
        else if (avgDiff > 20) score -= 1.5;
        else if (avgDiff > 10) score -= 0.5;
      }
    }
    
    // 3. Check for signature phrases
    if (profile.signaturePhrases && profile.signaturePhrases.length > 0) {
      const usesSignaturePhrase = profile.signaturePhrases.some(phrase => 
        lowerCaption.includes(phrase.toLowerCase())
      );
      if (usesSignaturePhrase) score += 1.5; // Strong indicator of voice match
    }
    
    // 4. Check tone markers alignment (comprehensive)
    if (profile.toneMarkers) {
      const toneScores = this.detectToneMarkers(caption);
      
      // Calculate alignment score for each tone
      let toneAlignmentScore = 0;
      let toneCount = 0;
      
      for (const [tone, profileScore] of Object.entries(profile.toneMarkers)) {
        const actualScore = toneScores[tone as keyof typeof toneScores] || 0;
        const difference = Math.abs(profileScore - actualScore);
        
        // Weight by profile score (more important if user strongly uses this tone)
        const weight = profileScore;
        toneAlignmentScore += (1 - difference) * weight;
        toneCount += weight;
      }
      
      const avgToneAlignment = toneCount > 0 ? toneAlignmentScore / toneCount : 0.5;
      
      // Penalize poor tone alignment
      if (avgToneAlignment < 0.3) score -= 1.5;
      else if (avgToneAlignment < 0.5) score -= 1;
      else if (avgToneAlignment < 0.7) score -= 0.5;
      // Good alignment (0.7+) - no penalty
      
      // Bonus for excellent alignment
      if (avgToneAlignment >= 0.8) score += 1;
    }
    
    // 5. Check punctuation style consistency
    if (profile.punctuationStyle) {
      const exclamationCount = (caption.match(/!/g) || []).length;
      const questionCount = (caption.match(/\?/g) || []).length;
      const ellipsisCount = (caption.match(/\.\.\./g) || []).length;
      
      const sentenceCount = sentences.length || 1;
      
      // Check exclamation usage
      const exclamationRate = exclamationCount / sentenceCount;
      const expectsExclamations = profile.punctuationStyle.exclamationUsage;
      
      if (expectsExclamations === 'rare' && exclamationRate > 0.3) score -= 0.5;
      if (expectsExclamations === 'frequent' && exclamationRate < 0.2) score -= 0.5;
      
      // Check question usage
      const questionRate = questionCount / sentenceCount;
      const expectsQuestions = profile.punctuationStyle.questionUsage;
      
      if (expectsQuestions === 'rare' && questionRate > 0.3) score -= 0.5;
      if (expectsQuestions === 'frequent' && questionRate < 0.2) score -= 0.5;
      
      // Check ellipsis usage
      const hasEllipsis = ellipsisCount > 0;
      if (profile.punctuationStyle.ellipsisUsage && !hasEllipsis && words.length > 30) score -= 0.3;
      if (!profile.punctuationStyle.ellipsisUsage && hasEllipsis) score -= 0.3;
    }
    
    // 6. Check paragraph structure consistency
    if (profile.paragraphStructure) {
      const paragraphs = caption.split(/\n+/).filter(p => p.trim().length > 0);
      const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / (paragraphs.length || 1);
      
      if (profile.paragraphStructure === 'single' && paragraphs.length > 1) {
        score -= 0.5;
      } else if (profile.paragraphStructure === 'short-breaks' && avgParagraphLength > 200) {
        score -= 0.5;
      } else if (profile.paragraphStructure === 'long-form' && avgParagraphLength < 100 && paragraphs.length > 1) {
        score -= 0.5;
      }
    }
    
    // 7. Check hook pattern matching
    if (profile.hookPatterns && profile.hookPatterns.length > 0) {
      const firstSentence = sentences[0]?.toLowerCase() || '';
      const matchesHookPattern = profile.hookPatterns.some(pattern => {
        // Check if the first sentence is similar to user's typical hooks
        const patternWords = pattern.toLowerCase().split(/\s+/);
        const matchingWords = patternWords.filter(w => firstSentence.includes(w));
        return matchingWords.length >= patternWords.length * 0.5; // 50% word overlap
      });
      
      if (matchesHookPattern) score += 0.5;
    }
    
    // 8. Check engagement question style
    if (profile.engagementQuestionStyle && profile.engagementQuestionStyle.length > 0) {
      const lastSentence = sentences[sentences.length - 1]?.toLowerCase() || '';
      const hasQuestion = caption.includes('?');
      
      if (hasQuestion) {
        const matchesEngagementStyle = profile.engagementQuestionStyle.some(style => {
          const styleWords = style.toLowerCase().split(/\s+/);
          const matchingWords = styleWords.filter(w => lastSentence.includes(w));
          return matchingWords.length >= Math.min(2, styleWords.length * 0.5);
        });
        
        if (matchesEngagementStyle) score += 0.5;
      }
    }
    
    return Math.max(0, Math.min(10, score));
  }
  
  /**
   * Detect tone markers in caption for comprehensive tone analysis
   * Returns normalized scores (0-1) for each tone type
   */
  private detectToneMarkers(caption: string): {
    casual: number;
    professional: number;
    humorous: number;
    inspirational: number;
    educational: number;
    conversational: number;
  } {
    const lowerCaption = caption.toLowerCase();
    
    // Casual indicators
    const casualWords = ['hey', 'yeah', 'nah', 'gonna', 'wanna', 'kinda', 'sorta', 'lol', 'omg', 'tbh'];
    const casualScore = casualWords.filter(w => lowerCaption.includes(w)).length / casualWords.length;
    
    // Professional indicators
    const professionalWords = ['pleased', 'delighted', 'honored', 'opportunity', 'professional', 'expertise', 'collaborate'];
    const professionalScore = professionalWords.filter(w => lowerCaption.includes(w)).length / professionalWords.length;
    
    // Humorous indicators
    const humorousWords = ['lol', 'haha', 'funny', 'hilarious', 'joke', 'kidding', 'seriously though', 'no but really'];
    const humorousScore = humorousWords.filter(w => lowerCaption.includes(w)).length / humorousWords.length;
    
    // Inspirational indicators
    const inspirationalWords = ['inspire', 'dream', 'believe', 'achieve', 'motivate', 'empower', 'transform', 'journey'];
    const inspirationalScore = inspirationalWords.filter(w => lowerCaption.includes(w)).length / inspirationalWords.length;
    
    // Educational indicators
    const educationalWords = ['learn', 'teach', 'tip', 'guide', 'how to', 'steps', 'method', 'technique', 'explained'];
    const educationalScore = educationalWords.filter(w => lowerCaption.includes(w)).length / educationalWords.length;
    
    // Conversational indicators
    const conversationalPatterns = [
      /\b(you|your)\b/i,
      /\?/,
      /\b(i|my|me)\b/i,
      /\b(let me tell you|here's the thing|check this out)\b/i
    ];
    const conversationalScore = conversationalPatterns.filter(p => p.test(caption)).length / conversationalPatterns.length;
    
    return {
      casual: Math.min(1, casualScore * 2), // Amplify scores
      professional: Math.min(1, professionalScore * 2),
      humorous: Math.min(1, humorousScore * 2),
      inspirational: Math.min(1, inspirationalScore * 2),
      educational: Math.min(1, educationalScore * 2),
      conversational: Math.min(1, conversationalScore * 1.5)
    };
  }

  /**
   * Criterion 9: Mobile Readability (0-10)
   * Verifies short paragraphs, line breaks, and scannable structure
   * Requirement: 4.1
   */
  private scoreMobileReadability(caption: string): number {
    let score = 10;
    
    // Split by line breaks
    const paragraphs = caption.split(/\n+/).filter(p => p.trim().length > 0);
    
    // Check paragraph lengths
    for (const para of paragraphs) {
      const sentences = para.split(/[.!?]+/).filter(s => s.trim().length > 0);
      
      // Penalize paragraphs with >3 sentences (too dense for mobile)
      if (sentences.length > 3) score -= 1;
      
      // Penalize very long paragraphs (>300 chars without break)
      if (para.length > 300) score -= 1;
    }
    
    // Bonus for frequent line breaks (good for mobile scanning)
    const lineBreakFrequency = (caption.match(/\n/g) || []).length;
    const wordsPerBreak = caption.split(/\s+/).length / (lineBreakFrequency + 1);
    if (wordsPerBreak < 20) score += 2; // Good break frequency
    
    // Penalize no line breaks in long captions
    if (caption.length > 200 && lineBreakFrequency === 0) score -= 3;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 10: Hook Strength (0-10)
   * Analyzes first 5 words for impact and emotional engagement
   * Requirement: 4.1
   */
  private scoreHookStrength(caption: string): number {
    let score = 5; // Start at middle
    
    const firstFiveWords = caption.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase();
    const firstSentence = caption.split(/[.!?]/)[0].trim();
    
    // Strong hook patterns
    const strongHooks = [
      /^(hot take|unpopular opinion|confession|real talk|truth bomb|pov|fun fact)/i,
      /^(stop|wait|omg|wow|okay|listen|hey)/i,
      /^(i (can't|couldn't|never|always|just|finally))/i,
      /^(this is|here's|there's)/i,
      /^\d+/  // Starting with numbers
    ];
    
    const hasStrongHook = strongHooks.some(pattern => pattern.test(firstSentence));
    if (hasStrongHook) score += 3;
    
    // Check for emotional/curiosity words in opening
    const emotionalOpeners = ['shocking', 'amazing', 'incredible', 'unbelievable', 'secret', 'truth'];
    const hasEmotionalOpener = emotionalOpeners.some(word => firstFiveWords.includes(word));
    if (hasEmotionalOpener) score += 2;
    
    // Penalize weak openings
    const weakOpenings = [
      /^(today i want to|i would like to|let me tell you about)/i,
      /^(in this post|this is a post about)/i,
      /^(hello|hi everyone|hey guys)/i
    ];
    
    const hasWeakOpening = weakOpenings.some(pattern => pattern.test(firstSentence));
    if (hasWeakOpening) score -= 3;
    
    // Bonus for questions as hooks
    if (firstSentence.includes('?')) score += 2;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 11: Engagement Clarity (0-10)
   * Verifies clear CTA or specific question
   * Requirement: 4.1
   */
  private scoreEngagementClarity(caption: string): number {
    let score = 5; // Start at middle
    
    const lowerCaption = caption.toLowerCase();
    const lastSentence = caption.split(/[.!?]/).filter(s => s.trim().length > 0).pop()?.trim() || '';
    
    // Check for clear CTAs
    const ctaPatterns = [
      /\b(comment|share|save|tag|tell me|let me know|drop|what do you think)\b/i,
      /\b(your thoughts|your opinion|agree or disagree)\b/i,
      /\b(have you|do you|did you|will you|would you)\b/i
    ];
    
    const hasCTA = ctaPatterns.some(pattern => pattern.test(lastSentence));
    if (hasCTA) score += 3;
    
    // Check for specific questions (not vague)
    const hasQuestion = caption.includes('?');
    if (hasQuestion) {
      // Penalize vague questions
      const vagueQuestions = ['thoughts?', 'agree?', 'right?'];
      const isVague = vagueQuestions.some(vq => lowerCaption.includes(vq));
      
      if (isVague) {
        score += 1; // At least there's a question
      } else {
        score += 3; // Specific question
      }
    }
    
    // Bonus for multiple engagement prompts
    const engagementCount = (caption.match(/\?/g) || []).length;
    if (engagementCount >= 2) score += 1;
    
    // Penalize no engagement mechanism
    if (!hasCTA && !hasQuestion) score -= 3;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Criterion 12: Emotional Resonance (0-10)
   * Checks for emotional words, personal elements, and specificity
   * Requirement: 4.1
   */
  private scoreEmotionalResonance(caption: string): number {
    let score = 5; // Start at middle
    const lowerCaption = caption.toLowerCase();
    const words = lowerCaption.split(/\s+/);
    
    // Count emotional words
    const emotionalWordCount = words.filter(w => 
      this.EMOTIONAL_WORDS.includes(w)
    ).length;
    score += Math.min(3, emotionalWordCount); // Max +3 for emotional words
    
    // Check for personal/vulnerable elements
    const personalIndicators = /\b(i|my|me|myself|i'm|i've|i'd)\b/i;
    if (personalIndicators.test(caption)) score += 2;
    
    // Check for vulnerability markers
    const vulnerabilityMarkers = [
      'honest', 'truth', 'real', 'struggle', 'hard', 'difficult',
      'scared', 'nervous', 'worried', 'learned', 'mistake', 'failed'
    ];
    const hasVulnerability = vulnerabilityMarkers.some(marker => 
      lowerCaption.includes(marker)
    );
    if (hasVulnerability) score += 2;
    
    // Check for specificity (names, numbers, specific moments)
    const hasNumbers = /\b\d+\b/.test(caption);
    const hasQuotes = /"[^"]+"/.test(caption);
    const hasSpecificTime = /\b(yesterday|today|last week|this morning|3 years ago)\b/i.test(caption);
    
    if (hasNumbers) score += 1;
    if (hasQuotes) score += 1;
    if (hasSpecificTime) score += 1;
    
    // Penalize generic or detached writing
    const detachedIndicators = /\b(one should|people should|it is important|one must)\b/i;
    if (detachedIndicators.test(caption)) score -= 3;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Detect AI tells in caption
   * Requirement: 4.4
   */
  detectAITells(caption: string): string[] {
    const tells: string[] = [];
    const lowerCaption = caption.toLowerCase();
    
    // Check for AI vocabulary
    this.AI_VOCABULARY_BLACKLIST.forEach(word => {
      if (lowerCaption.includes(word)) {
        tells.push(`Uses AI-typical word: "${word}"`);
      }
    });
    
    // Check for corporate jargon
    this.CORPORATE_JARGON.forEach(jargon => {
      if (lowerCaption.includes(jargon)) {
        tells.push(`Contains corporate jargon: "${jargon}"`);
      }
    });
    
    // Check for generic phrases
    this.GENERIC_PHRASE_BLACKLIST.forEach(phrase => {
      if (lowerCaption.includes(phrase.toLowerCase())) {
        tells.push(`Uses generic phrase: "${phrase}"`);
      }
    });
    
    // Check for unnatural emoji usage (clusters) - simplified check
    const hasEmojiCluster = /(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]){3,}/.test(caption);
    if (hasEmojiCluster) {
      tells.push('Unnatural emoji clustering (3+ emojis in a row)');
    }
    
    // Check for overly formal structure
    if (/\bfirstly\b.*\bsecondly\b.*\bfinally\b/i.test(caption)) {
      tells.push('Overly formal list structure');
    }
    
    // Check for AI-typical formal transitions
    const formalTransitions = [
      'furthermore', 'moreover', 'additionally', 'consequently',
      'nevertheless', 'nonetheless', 'in conclusion', 'to summarize'
    ];
    formalTransitions.forEach(transition => {
      if (lowerCaption.includes(transition)) {
        tells.push(`Uses formal transition: "${transition}"`);
      }
    });
    
    // Check for passive voice overuse (AI often uses passive voice)
    const passiveIndicators = /\b(is|are|was|were|be|been|being) (being )?\w+ed\b/gi;
    const passiveMatches = caption.match(passiveIndicators);
    if (passiveMatches && passiveMatches.length >= 3) {
      tells.push('Excessive passive voice usage (sounds formal/detached)');
    }
    
    // Check for overly long sentences without natural breaks
    const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const veryLongSentences = sentences.filter(s => s.split(/\s+/).length > 40);
    if (veryLongSentences.length > 0) {
      tells.push(`Contains ${veryLongSentences.length} overly long sentence(s) (>40 words)`);
    }
    
    // Check for lack of contractions (AI often avoids them)
    const wordCount = caption.split(/\s+/).length;
    const contractionMatches = caption.match(/\b(it's|don't|you're|can't|won't|isn't|aren't|wasn't|weren't|haven't|hasn't|I'm|I've|I'd|we're|we've|they're|that's|what's|who's|where's|there's)\b/gi);
    const hasContractions = contractionMatches && contractionMatches.length > 0;
    if (wordCount > 30 && !hasContractions) {
      tells.push('No contractions used (sounds unnaturally formal)');
    }
    
    // Check for AI hedging language
    const hedgingPhrases = [
      'it is worth noting', 'it should be noted', 'it is important to',
      'one might', 'one could', 'one should', 'it may be',
      'potentially', 'arguably'
    ];
    hedgingPhrases.forEach(phrase => {
      if (lowerCaption.includes(phrase)) {
        tells.push(`Uses AI hedging language: "${phrase}"`);
      }
    });
    
    // Check for unnatural enthusiasm patterns (e.g., "incredibly excited", "truly amazing")
    const unnaturalEnthusiasm = [
      'incredibly excited', 'truly amazing', 'absolutely thrilled',
      'extremely grateful', 'utterly fantastic', 'completely blown away'
    ];
    unnaturalEnthusiasm.forEach(phrase => {
      if (lowerCaption.includes(phrase)) {
        tells.push(`Uses unnatural enthusiasm: "${phrase}"`);
      }
    });
    
    // Check for perfect grammar in casual contexts (too polished)
    // Instagram captions often have intentional informal grammar
    const noCasualMarkers = !/\b(lol|omg|tbh|ngl|ikr|btw|lowkey|highkey|gonna|wanna|kinda|sorta)\b/i.test(caption);
    const noContractions = !contractionMatches || contractionMatches.length === 0;
    const hasPerfectPunctuation = sentences.every(s => {
      const trimmed = s.trim();
      return trimmed.length === 0 || /^[A-Z]/.test(trimmed);
    });
    
    if (wordCount > 40 && hasPerfectPunctuation && noCasualMarkers && noContractions) {
      tells.push('Too polished - lacks natural casual writing markers');
    }
    
    return tells;
  }

  /**
   * Generate recommendations based on scores
   */
  private generateRecommendations(
    scores: AuthenticityScore['criteriaScores'],
    aiTells: string[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Vocabulary naturalness
    if (scores.vocabularyNaturalness < 7) {
      recommendations.push('Use more casual, everyday language instead of formal or AI-typical words');
    }
    
    // Sentence flow
    if (scores.sentenceFlow < 7) {
      recommendations.push('Vary sentence lengths for more natural rhythm and flow');
    }
    
    // Emoji placement
    if (scores.emojiPlacement < 7) {
      recommendations.push('Adjust emoji usage to match your typical style and placement');
    }
    
    // Conversational tone
    if (scores.conversationalTone < 7) {
      recommendations.push('Make it more conversational - use "you", ask questions, or add rhetorical asides');
    }
    
    // Platform appropriateness
    if (scores.platformAppropriateness < 7) {
      recommendations.push('Add Instagram-native language and improve mobile readability with line breaks');
    }
    
    // Corporate jargon
    if (scores.avoidsCorporateJargon < 7) {
      recommendations.push('Remove corporate jargon and business buzzwords');
    }
    
    // Generic phrases
    if (scores.avoidsGenericPhrases < 7) {
      recommendations.push('Replace generic phrases with unique, specific language');
    }
    
    // Voice consistency
    if (scores.voiceConsistency < 7) {
      recommendations.push('Better match your typical writing style and voice characteristics');
    }
    
    // Mobile readability
    if (scores.mobileReadability < 7) {
      recommendations.push('Break into shorter paragraphs (1-2 sentences) for mobile viewing');
    }
    
    // Hook strength
    if (scores.hookStrength < 7) {
      recommendations.push('Strengthen the opening - use a more engaging hook to capture attention');
    }
    
    // Engagement clarity
    if (scores.engagementClarity < 7) {
      recommendations.push('Add a clear call-to-action or specific question to drive engagement');
    }
    
    // Emotional resonance
    if (scores.emotionalResonance < 7) {
      recommendations.push('Add emotional depth with personal stories, specific details, or vulnerable moments');
    }
    
    // Add AI tells to recommendations if present
    if (aiTells.length > 0) {
      recommendations.push(`Fix AI tells: ${aiTells.slice(0, 3).join('; ')}`);
    }
    
    return recommendations;
  }

  /**
   * Check voice consistency against profile
   * Public method for external use
   * Requirement: 4.5
   */
  checkVoiceConsistency(caption: string, profile: CaptionVoiceProfile): number {
    return this.scoreVoiceConsistency(caption, profile);
  }

  /**
   * Comprehensive voice consistency checker
   * Compares generated caption against user's voice profile across multiple dimensions
   * Returns detailed analysis with specific mismatches and regeneration guidance
   * Requirements: 4.5
   * Task 7.3: Implement voice consistency checker
   */
  async compareVoiceProfile(
    caption: string,
    profile: CaptionVoiceProfile
  ): Promise<VoiceConsistencyResult> {
    const lowerCaption = caption.toLowerCase();
    const words = lowerCaption.split(/\s+/).filter(w => w.length > 0);
    const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Initialize result structure
    const result: VoiceConsistencyResult = {
      overallScore: 0,
      passesThreshold: false,
      dimensions: {
        vocabularyMatch: {
          score: 0,
          overlap: 0,
          missingWords: [],
          unexpectedWords: []
        },
        toneAlignment: {
          score: 0,
          profileTone: profile.toneMarkers || {},
          captionTone: {},
          mismatches: []
        },
        structureMatch: {
          score: 0,
          sentenceLengthMatch: false,
          paragraphStyleMatch: false,
          deviations: []
        },
        signaturePhraseUsage: {
          score: 0,
          phrasesUsed: [],
          phrasesMissed: []
        },
        punctuationStyle: {
          score: 0,
          exclamationMatch: false,
          questionMatch: false,
          ellipsisMatch: false,
          deviations: []
        },
        emojiConsistency: {
          score: 0,
          frequencyMatch: false,
          placementMatch: false,
          topEmojisUsed: [],
          deviations: []
        },
        hookPatternMatch: {
          score: 0,
          matchFound: false,
          matchedPattern: null
        },
        engagementStyleMatch: {
          score: 0,
          matchFound: false,
          matchedStyle: null
        }
      },
      mismatches: [],
      recommendations: [],
      regenerationGuidance: {
        vocabularyAdjustments: [],
        toneAdjustments: [],
        structureAdjustments: [],
        styleAdjustments: []
      }
    };

    // 1. Analyze vocabulary match
    this.analyzeVocabularyMatch(words, profile, result);

    // 2. Analyze tone alignment
    this.analyzeToneAlignment(caption, profile, result);

    // 3. Analyze structure match
    this.analyzeStructureMatch(caption, sentences, profile, result);

    // 4. Analyze signature phrase usage
    this.analyzeSignaturePhraseUsage(lowerCaption, profile, result);

    // 5. Analyze punctuation style
    this.analyzePunctuationStyle(caption, sentences, profile, result);

    // 6. Analyze emoji consistency
    this.analyzeEmojiConsistency(caption, profile, result);

    // 7. Analyze hook pattern match
    this.analyzeHookPatternMatch(sentences, profile, result);

    // 8. Analyze engagement style match
    this.analyzeEngagementStyleMatch(sentences, profile, result);

    // Calculate overall score (average of all dimension scores, normalized to 0-100)
    const dimensionScores = [
      result.dimensions.vocabularyMatch.score,
      result.dimensions.toneAlignment.score,
      result.dimensions.structureMatch.score,
      result.dimensions.signaturePhraseUsage.score,
      result.dimensions.punctuationStyle.score,
      result.dimensions.emojiConsistency.score,
      result.dimensions.hookPatternMatch.score,
      result.dimensions.engagementStyleMatch.score
    ];
    
    const avgDimensionScore = dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length;
    result.overallScore = Math.round((avgDimensionScore / 10) * 100); // Normalize 0-10 to 0-100
    result.passesThreshold = result.overallScore >= 80; // 80+ required for voice consistency

    // Generate mismatches summary
    this.generateMismatches(result);

    // Generate recommendations
    this.generateVoiceRecommendations(result);

    // Generate regeneration guidance
    this.generateRegenerationGuidance(result);

    return result;
  }

  /**
   * Analyze vocabulary match dimension
   */
  private analyzeVocabularyMatch(
    words: string[],
    profile: CaptionVoiceProfile,
    result: VoiceConsistencyResult
  ): void {
    let score = 10;
    
    if (profile.vocabularyFrequency && Object.keys(profile.vocabularyFrequency).length > 0) {
      // Calculate overlap
      const vocabularyWords = words.filter(w => 
        profile.vocabularyFrequency[w] && profile.vocabularyFrequency[w] > 0
      );
      result.dimensions.vocabularyMatch.overlap = vocabularyWords.length / words.length;
      
      // Find missing common words (user's top words not used)
      const topUserWords = Object.entries(profile.vocabularyFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([word]) => word);
      
      result.dimensions.vocabularyMatch.missingWords = topUserWords
        .filter(word => !words.includes(word))
        .slice(0, 5);
      
      // Find unexpected words (not in user's vocabulary)
      const unusualWords = words.filter(w => 
        w.length > 3 && 
        (!profile.vocabularyFrequency[w] || profile.vocabularyFrequency[w] === 0)
      );
      result.dimensions.vocabularyMatch.unexpectedWords = unusualWords.slice(0, 5);
      
      // Score based on overlap
      const overlap = result.dimensions.vocabularyMatch.overlap;
      if (overlap < 0.2) score -= 4;
      else if (overlap < 0.3) score -= 2;
      else if (overlap < 0.4) score -= 1;
      else if (overlap >= 0.6) score += 1;
    }
    
    result.dimensions.vocabularyMatch.score = Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze tone alignment dimension
   */
  private analyzeToneAlignment(
    caption: string,
    profile: CaptionVoiceProfile,
    result: VoiceConsistencyResult
  ): void {
    let score = 10;
    
    if (profile.toneMarkers) {
      // Detect tone in caption
      result.dimensions.toneAlignment.captionTone = this.detectToneMarkers(caption);
      
      // Compare each tone
      for (const [tone, profileScore] of Object.entries(profile.toneMarkers)) {
        const captionScore = result.dimensions.toneAlignment.captionTone[tone as keyof typeof result.dimensions.toneAlignment.captionTone] || 0;
        const difference = Math.abs(profileScore - captionScore);
        
        // Flag significant mismatches
        if (difference > 0.4) {
          const direction = captionScore > profileScore ? 'too much' : 'not enough';
          result.dimensions.toneAlignment.mismatches.push(
            `${tone}: ${direction} (profile: ${profileScore.toFixed(2)}, caption: ${captionScore.toFixed(2)})`
          );
        }
        
        // Adjust score based on weighted difference
        score -= difference * profileScore * 2;
      }
    }
    
    result.dimensions.toneAlignment.score = Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze structure match dimension
   */
  private analyzeStructureMatch(
    caption: string,
    sentences: string[],
    profile: CaptionVoiceProfile,
    result: VoiceConsistencyResult
  ): void {
    let score = 10;
    
    // Check sentence length distribution
    if (sentences.length > 0) {
      const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
      const shortCount = sentenceLengths.filter(len => len <= 5).length;
      const mediumCount = sentenceLengths.filter(len => len > 5 && len <= 15).length;
      const longCount = sentenceLengths.filter(len => len > 15).length;
      const total = sentenceLengths.length;
      
      const actualDistribution = {
        short: (shortCount / total) * 100,
        medium: (mediumCount / total) * 100,
        long: (longCount / total) * 100
      };
      
      if (profile.sentenceLengthDistribution) {
        const shortDiff = Math.abs(actualDistribution.short - profile.sentenceLengthDistribution.short);
        const mediumDiff = Math.abs(actualDistribution.medium - profile.sentenceLengthDistribution.medium);
        const longDiff = Math.abs(actualDistribution.long - profile.sentenceLengthDistribution.long);
        
        const avgDiff = (shortDiff + mediumDiff + longDiff) / 3;
        result.dimensions.structureMatch.sentenceLengthMatch = avgDiff <= 20;
        
        if (avgDiff > 30) {
          score -= 3;
          result.dimensions.structureMatch.deviations.push(
            `Sentence length distribution differs significantly (avg diff: ${avgDiff.toFixed(0)}%)`
          );
        } else if (avgDiff > 20) {
          score -= 1.5;
        }
      }
    }
    
    // Check paragraph structure
    if (profile.paragraphStructure) {
      const paragraphs = caption.split(/\n+/).filter(p => p.trim().length > 0);
      const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / (paragraphs.length || 1);
      
      let structureMatch = false;
      if (profile.paragraphStructure === 'single' && paragraphs.length <= 1) {
        structureMatch = true;
      } else if (profile.paragraphStructure === 'short-breaks' && avgParagraphLength <= 200) {
        structureMatch = true;
      } else if (profile.paragraphStructure === 'long-form' && avgParagraphLength >= 100) {
        structureMatch = true;
      }
      
      result.dimensions.structureMatch.paragraphStyleMatch = structureMatch;
      
      if (!structureMatch) {
        score -= 1;
        result.dimensions.structureMatch.deviations.push(
          `Paragraph structure doesn't match profile (expected: ${profile.paragraphStructure})`
        );
      }
    }
    
    result.dimensions.structureMatch.score = Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze signature phrase usage
   */
  private analyzeSignaturePhraseUsage(
    lowerCaption: string,
    profile: CaptionVoiceProfile,
    result: VoiceConsistencyResult
  ): void {
    let score = 6; // Start at neutral
    
    if (profile.signaturePhrases && profile.signaturePhrases.length > 0) {
      result.dimensions.signaturePhraseUsage.phrasesUsed = profile.signaturePhrases.filter(phrase =>
        lowerCaption.includes(phrase.toLowerCase())
      );
      
      result.dimensions.signaturePhraseUsage.phrasesMissed = profile.signaturePhrases.filter(phrase =>
        !lowerCaption.includes(phrase.toLowerCase())
      );
      
      // Reward signature phrase usage strongly
      if (result.dimensions.signaturePhraseUsage.phrasesUsed.length > 0) {
        score += 4; // Strong positive signal
      } else {
        // Don't penalize too much for not using signature phrases
        // They may not fit every caption
        score += 1;
      }
    } else {
      score = 7; // No signature phrases to match, give neutral good score
    }
    
    result.dimensions.signaturePhraseUsage.score = Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze punctuation style consistency
   */
  private analyzePunctuationStyle(
    caption: string,
    sentences: string[],
    profile: CaptionVoiceProfile,
    result: VoiceConsistencyResult
  ): void {
    let score = 10;
    
    if (profile.punctuationStyle && sentences.length > 0) {
      const exclamationCount = (caption.match(/!/g) || []).length;
      const questionCount = (caption.match(/\?/g) || []).length;
      const ellipsisCount = (caption.match(/\.\.\./g) || []).length;
      const sentenceCount = sentences.length;
      
      // Check exclamation usage
      const exclamationRate = exclamationCount / sentenceCount;
      const expectsExclamations = profile.punctuationStyle.exclamationUsage;
      
      if (expectsExclamations === 'rare' && exclamationRate <= 0.3) {
        result.dimensions.punctuationStyle.exclamationMatch = true;
      } else if (expectsExclamations === 'moderate' && exclamationRate > 0.1 && exclamationRate <= 0.5) {
        result.dimensions.punctuationStyle.exclamationMatch = true;
      } else if (expectsExclamations === 'frequent' && exclamationRate >= 0.3) {
        result.dimensions.punctuationStyle.exclamationMatch = true;
      }
      
      if (!result.dimensions.punctuationStyle.exclamationMatch) {
        score -= 1;
        result.dimensions.punctuationStyle.deviations.push(
          `Exclamation usage mismatch (expected: ${expectsExclamations}, actual rate: ${(exclamationRate * 100).toFixed(0)}%)`
        );
      }
      
      // Check question usage
      const questionRate = questionCount / sentenceCount;
      const expectsQuestions = profile.punctuationStyle.questionUsage;
      
      if (expectsQuestions === 'rare' && questionRate <= 0.3) {
        result.dimensions.punctuationStyle.questionMatch = true;
      } else if (expectsQuestions === 'moderate' && questionRate > 0.1 && questionRate <= 0.5) {
        result.dimensions.punctuationStyle.questionMatch = true;
      } else if (expectsQuestions === 'frequent' && questionRate >= 0.3) {
        result.dimensions.punctuationStyle.questionMatch = true;
      }
      
      if (!result.dimensions.punctuationStyle.questionMatch) {
        score -= 1;
        result.dimensions.punctuationStyle.deviations.push(
          `Question usage mismatch (expected: ${expectsQuestions}, actual rate: ${(questionRate * 100).toFixed(0)}%)`
        );
      }
      
      // Check ellipsis usage
      const hasEllipsis = ellipsisCount > 0;
      result.dimensions.punctuationStyle.ellipsisMatch = 
        profile.punctuationStyle.ellipsisUsage === hasEllipsis;
      
      if (!result.dimensions.punctuationStyle.ellipsisMatch) {
        score -= 0.5;
        result.dimensions.punctuationStyle.deviations.push(
          `Ellipsis usage mismatch (expected: ${profile.punctuationStyle.ellipsisUsage ? 'yes' : 'no'}, actual: ${hasEllipsis ? 'yes' : 'no'})`
        );
      }
    }
    
    result.dimensions.punctuationStyle.score = Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze emoji consistency
   */
  private analyzeEmojiConsistency(
    caption: string,
    profile: CaptionVoiceProfile,
    result: VoiceConsistencyResult
  ): void {
    let score = 10;
    
    if (profile.emojiUsagePattern) {
      const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g;
      const emojis = caption.match(emojiRegex) || [];
      const emojiCount = emojis.length;
      
      // Check frequency match
      const userFrequency = profile.emojiUsagePattern.frequency;
      let frequencyMatch = false;
      
      if (userFrequency === 'none' && emojiCount === 0) frequencyMatch = true;
      if (userFrequency === 'minimal' && emojiCount >= 1 && emojiCount <= 2) frequencyMatch = true;
      if (userFrequency === 'moderate' && emojiCount >= 2 && emojiCount <= 5) frequencyMatch = true;
      if (userFrequency === 'heavy' && emojiCount >= 4) frequencyMatch = true;
      
      result.dimensions.emojiConsistency.frequencyMatch = frequencyMatch;
      
      if (!frequencyMatch) {
        score -= 2;
        result.dimensions.emojiConsistency.deviations.push(
          `Emoji frequency mismatch (expected: ${userFrequency}, actual count: ${emojiCount})`
        );
      }
      
      // Check placement
      if (emojiCount > 0) {
        const hasInlineEmoji = /\w(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])\w/.test(caption);
        const endsWithEmoji = /(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])\s*$/.test(caption.trim());
        
        const userPlacement = profile.emojiUsagePattern.placement;
        let placementMatch = false;
        
        if (userPlacement === 'inline' && hasInlineEmoji) placementMatch = true;
        if (userPlacement === 'end' && endsWithEmoji) placementMatch = true;
        if (userPlacement === 'both' && (hasInlineEmoji || endsWithEmoji)) placementMatch = true;
        
        result.dimensions.emojiConsistency.placementMatch = placementMatch;
        
        if (!placementMatch) {
          score -= 1;
          result.dimensions.emojiConsistency.deviations.push(
            `Emoji placement mismatch (expected: ${userPlacement})`
          );
        }
      }
      
      // Check if using user's top emojis
      if (profile.emojiUsagePattern.topEmojis && profile.emojiUsagePattern.topEmojis.length > 0) {
        result.dimensions.emojiConsistency.topEmojisUsed = emojis.filter(e =>
          profile.emojiUsagePattern.topEmojis.includes(e)
        );
        
        if (result.dimensions.emojiConsistency.topEmojisUsed.length > 0) {
          score += 1; // Bonus for using familiar emojis
        }
      }
    }
    
    result.dimensions.emojiConsistency.score = Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze hook pattern match
   */
  private analyzeHookPatternMatch(
    sentences: string[],
    profile: CaptionVoiceProfile,
    result: VoiceConsistencyResult
  ): void {
    let score = 6; // Neutral score
    
    if (profile.hookPatterns && profile.hookPatterns.length > 0 && sentences.length > 0) {
      const firstSentence = sentences[0].toLowerCase();
      
      // Check if first sentence matches user's hook patterns
      for (const pattern of profile.hookPatterns) {
        const patternWords = pattern.toLowerCase().split(/\s+/);
        const matchingWords = patternWords.filter(w => firstSentence.includes(w));
        
        // 50% word overlap indicates a pattern match
        if (matchingWords.length >= patternWords.length * 0.5) {
          result.dimensions.hookPatternMatch.matchFound = true;
          result.dimensions.hookPatternMatch.matchedPattern = pattern;
          score = 10; // Strong match
          break;
        }
      }
      
      if (!result.dimensions.hookPatternMatch.matchFound) {
        score = 5; // Neutral - not matching but not wrong
      }
    } else {
      score = 7; // No patterns to match, neutral good score
    }
    
    result.dimensions.hookPatternMatch.score = Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze engagement style match
   */
  private analyzeEngagementStyleMatch(
    sentences: string[],
    profile: CaptionVoiceProfile,
    result: VoiceConsistencyResult
  ): void {
    let score = 6; // Neutral score
    
    if (profile.engagementQuestionStyle && profile.engagementQuestionStyle.length > 0 && sentences.length > 0) {
      const lastSentence = sentences[sentences.length - 1].toLowerCase();
      
      // Only check if caption has a question
      if (lastSentence.includes('?')) {
        for (const style of profile.engagementQuestionStyle) {
          const styleWords = style.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const matchingWords = styleWords.filter(w => lastSentence.includes(w));
          
          // Check for word overlap
          if (matchingWords.length >= Math.min(2, styleWords.length * 0.5)) {
            result.dimensions.engagementStyleMatch.matchFound = true;
            result.dimensions.engagementStyleMatch.matchedStyle = style;
            score = 10; // Strong match
            break;
          }
        }
        
        if (!result.dimensions.engagementStyleMatch.matchFound) {
          score = 5; // Has question but doesn't match style
        }
      } else {
        score = 7; // No question, neutral score (questions not always needed)
      }
    } else {
      score = 7; // No engagement styles to match
    }
    
    result.dimensions.engagementStyleMatch.score = Math.max(0, Math.min(10, score));
  }

  /**
   * Generate mismatches summary
   */
  private generateMismatches(result: VoiceConsistencyResult): void {
    const mismatches: string[] = [];
    
    // Vocabulary mismatches
    if (result.dimensions.vocabularyMatch.score < 7) {
      if (result.dimensions.vocabularyMatch.overlap < 0.3) {
        mismatches.push(`Low vocabulary overlap (${(result.dimensions.vocabularyMatch.overlap * 100).toFixed(0)}%)`);
      }
      if (result.dimensions.vocabularyMatch.unexpectedWords.length > 0) {
        mismatches.push(`Using unexpected words: ${result.dimensions.vocabularyMatch.unexpectedWords.slice(0, 3).join(', ')}`);
      }
    }
    
    // Tone mismatches
    if (result.dimensions.toneAlignment.score < 7 && result.dimensions.toneAlignment.mismatches.length > 0) {
      mismatches.push(...result.dimensions.toneAlignment.mismatches.slice(0, 2));
    }
    
    // Structure mismatches
    if (result.dimensions.structureMatch.score < 7 && result.dimensions.structureMatch.deviations.length > 0) {
      mismatches.push(...result.dimensions.structureMatch.deviations);
    }
    
    // Punctuation mismatches
    if (result.dimensions.punctuationStyle.score < 7 && result.dimensions.punctuationStyle.deviations.length > 0) {
      mismatches.push(...result.dimensions.punctuationStyle.deviations.slice(0, 2));
    }
    
    // Emoji mismatches
    if (result.dimensions.emojiConsistency.score < 7 && result.dimensions.emojiConsistency.deviations.length > 0) {
      mismatches.push(...result.dimensions.emojiConsistency.deviations);
    }
    
    result.mismatches = mismatches;
  }

  /**
   * Generate voice-specific recommendations
   */
  private generateVoiceRecommendations(result: VoiceConsistencyResult): void {
    const recommendations: string[] = [];
    
    if (result.dimensions.vocabularyMatch.score < 7) {
      recommendations.push('Use more of your typical vocabulary and phrases');
      if (result.dimensions.vocabularyMatch.missingWords.length > 0) {
        recommendations.push(`Consider using words like: ${result.dimensions.vocabularyMatch.missingWords.slice(0, 3).join(', ')}`);
      }
    }
    
    if (result.dimensions.toneAlignment.score < 7) {
      recommendations.push('Adjust the tone to better match your typical style');
    }
    
    if (result.dimensions.structureMatch.score < 7) {
      recommendations.push('Adjust sentence and paragraph structure to match your usual writing style');
    }
    
    if (result.dimensions.signaturePhraseUsage.score < 7) {
      recommendations.push('Consider incorporating your signature phrases');
    }
    
    if (result.dimensions.punctuationStyle.score < 7) {
      recommendations.push('Adjust punctuation usage (exclamations, questions, ellipsis) to match your style');
    }
    
    if (result.dimensions.emojiConsistency.score < 7) {
      recommendations.push('Adjust emoji usage to match your typical frequency and placement');
    }
    
    if (result.dimensions.hookPatternMatch.score < 7) {
      recommendations.push('Try using one of your typical opening patterns');
    }
    
    if (result.dimensions.engagementStyleMatch.score < 7) {
      recommendations.push('Use your typical engagement question style');
    }
    
    result.recommendations = recommendations;
  }

  /**
   * Generate regeneration guidance
   */
  private generateRegenerationGuidance(result: VoiceConsistencyResult): void {
    // Vocabulary adjustments
    if (result.dimensions.vocabularyMatch.score < 7) {
      if (result.dimensions.vocabularyMatch.missingWords.length > 0) {
        result.regenerationGuidance.vocabularyAdjustments.push(
          `Incorporate these words: ${result.dimensions.vocabularyMatch.missingWords.slice(0, 5).join(', ')}`
        );
      }
      if (result.dimensions.vocabularyMatch.unexpectedWords.length > 0) {
        result.regenerationGuidance.vocabularyAdjustments.push(
          `Replace unusual words: ${result.dimensions.vocabularyMatch.unexpectedWords.slice(0, 3).join(', ')}`
        );
      }
    }
    
    // Tone adjustments
    if (result.dimensions.toneAlignment.score < 7) {
      for (const mismatch of result.dimensions.toneAlignment.mismatches) {
        const toneName = mismatch.split(':')[0];
        const direction = mismatch.includes('too much') ? 'reduce' : 'increase';
        result.regenerationGuidance.toneAdjustments.push(`${direction} ${toneName} tone`);
      }
    }
    
    // Structure adjustments
    if (result.dimensions.structureMatch.score < 7) {
      result.regenerationGuidance.structureAdjustments.push(...result.dimensions.structureMatch.deviations);
    }
    
    // Style adjustments
    if (result.dimensions.signaturePhraseUsage.score < 7 && result.dimensions.signaturePhraseUsage.phrasesMissed.length > 0) {
      result.regenerationGuidance.styleAdjustments.push(
        `Try using: ${result.dimensions.signaturePhraseUsage.phrasesMissed.slice(0, 2).join(' or ')}`
      );
    }
    
    if (result.dimensions.punctuationStyle.score < 7) {
      result.regenerationGuidance.styleAdjustments.push(...result.dimensions.punctuationStyle.deviations);
    }
    
    if (result.dimensions.emojiConsistency.score < 7) {
      result.regenerationGuidance.styleAdjustments.push(...result.dimensions.emojiConsistency.deviations);
    }
    
    if (!result.dimensions.hookPatternMatch.matchFound) {
      result.regenerationGuidance.styleAdjustments.push('Use one of your typical opening patterns');
    }
    
    if (!result.dimensions.engagementStyleMatch.matchFound) {
      result.regenerationGuidance.styleAdjustments.push('Use your typical engagement question style');
    }
  }
}

// Export singleton instance
export const authenticityScorer = new AuthenticityScorer();
