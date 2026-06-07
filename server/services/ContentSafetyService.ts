/**
 * Content Safety Service
 * 
 * Provides content safety filtering for caption generation to prevent inappropriate content.
 * 
 * Task 22.1: Integrate content safety filters
 * Task 22.2: Safety flag system with user feedback and calibration
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 * 
 * This service checks captions for:
 * - Profanity and offensive language
 * - Hate speech and discriminatory content
 * - Spam patterns
 * - Misleading claims
 * - Copyright violations
 * - Personal information exposure
 * - Edgy/opinionated content (with review recommendation)
 * 
 * Implementation approach: Rule-based filtering with user calibration and extensibility
 */

import { safetyFeedbackService } from './SafetyFeedbackService';
import type { SafetyCalibration } from '../domain/types';

export interface ContentSafetyResult {
  isSafe: boolean;
  issues: string[];
  filteredCaption: string;
  safetyScore: number; // 0-100
  flags: {
    profanity: boolean;
    hateSpeech: boolean;
    spam: boolean;
    misleadingClaims: boolean;
    copyrightViolation: boolean;
    personalInfoExposure: boolean;
  };
  // Task 22.2: Safety flag system for edgy content
  reviewRecommended: boolean;       // True if content is edgy but matches user's voice
  reviewReason?: string;            // Why review is recommended
  edgyContentTypes?: string[];      // Types of edgy content detected (controversial, opinionated, etc.)
}

export class ContentSafetyService {
  // Profanity and offensive language patterns
  private readonly PROFANITY_PATTERNS = [
    // Mild profanity
    /\b(damn|hell|crap|sucks|stupid|idiot|dumb|moron)\b/gi,
    // Moderate profanity (add more as needed)
    /\b(wtf|omfg|bullsh[i\*]t|b[i\*]tch|a[s\*]{2}hole)\b/gi,
  ];

  // Hate speech and discriminatory patterns
  private readonly HATE_SPEECH_PATTERNS = [
    /\b(racist|sexist|homophobic|transphobic|xenophobic)\b/gi,
    /\b(hate|hater|hating on|trash talk)\b/gi,
    // Add slurs and discriminatory terms (be careful with false positives)
  ];

  // Spam patterns
  private readonly SPAM_PATTERNS = [
    /\b(click here|buy now|limited time|act now|free money|get rich quick)\b/gi,
    /\b(dm me|dm for|link in bio)\s*(for|to)\s*(buy|purchase|order)/gi,
    /\b(follow me|follow back|follow for follow|f4f|l4l)\b/gi,
    /(\u{1F4B0}|\u{1F4B5}|\u{1F4B8}){3,}/gu, // Money emoji spam (3+ in a row)
  ];

  // Misleading claims patterns
  private readonly MISLEADING_CLAIMS_PATTERNS = [
    /\b(guaranteed|100% guaranteed|miracle cure|instant results|lose \d+ pounds? in \d+ days?)\b/gi,
    /\b(doctors hate|one weird trick|secret|they don't want you to know)\b/gi,
    /\b(proven to|scientifically proven|clinically proven)\b/gi, // Unless backed by actual studies
  ];

  // Copyright violation indicators
  private readonly COPYRIGHT_PATTERNS = [
    /\b(©|copyright|™|®)\s*\d{4}/gi, // Copyright symbols with years
    // Add known brand names that might indicate unauthorized use
  ];

  // Personal information patterns
  private readonly PERSONAL_INFO_PATTERNS = [
    /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, // SSN pattern
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card pattern
    /\b\d{10,11}\b/g, // Phone numbers
    /\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g, // Email addresses (can be legitimate, flag for review)
    /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|way|court|ct)\b/gi, // Physical addresses
  ];

  // Controversial topics (for review recommendation)
  private readonly CONTROVERSIAL_TOPICS = [
    'politics', 'political', 'election', 'government', 'legislation',
    'religion', 'religious', 'faith', 'belief',
    'abortion', 'gun control', 'immigration',
    'pandemic', 'vaccine', 'vaccination',
  ];

  /**
   * Filter caption for safety issues
   * 
   * Task 22.2: Updated to support calibration and review recommendations
   * 
   * @param caption - Caption text to check
   * @param safetyLevel - Safety level: 'off' | 'standard' | 'strict'
   * @param brandValues - Optional user's brand values
   * @param prohibitedTopics - Optional user's prohibited topics
   * @param voiceProfile - Optional user's voice profile for edgy content detection
   * @param calibration - Optional user's safety calibration settings
   * @returns Content safety result with issues and filtered caption
   */
  public filterCaption(
    caption: string,
    safetyLevel: 'off' | 'standard' | 'strict' = 'standard',
    brandValues?: string[],
    prohibitedTopics?: string[],
    voiceProfile?: any,  // VoiceProfile type - optional for edgy content detection
    calibration?: SafetyCalibration | null  // Task 22.2: User's learned preferences
  ): ContentSafetyResult {
    console.log('[ContentSafetyService] Filtering caption', {
      captionLength: caption.length,
      safetyLevel,
      hasBrandValues: !!brandValues?.length,
      hasProhibitedTopics: !!prohibitedTopics?.length,
    });

    const issues: string[] = [];
    const flags = {
      profanity: false,
      hateSpeech: false,
      spam: false,
      misleadingClaims: false,
      copyrightViolation: false,
      personalInfoExposure: false,
    };

    let filteredCaption = caption;
    let safetyScore = 100;
    let reviewRecommended = false;
    let reviewReason: string | undefined = undefined;
    let edgyContentTypes: string[] = [];

    // Safety level 'off' only checks prohibited topics
    if (safetyLevel === 'off') {
      if (prohibitedTopics && prohibitedTopics.length > 0) {
        const prohibitedIssues = this.checkProhibitedTopics(caption, prohibitedTopics);
        if (prohibitedIssues.length > 0) {
          issues.push(...prohibitedIssues);
          safetyScore -= 50;
        }
      }

      return {
        isSafe: issues.length === 0,
        issues,
        filteredCaption,
        safetyScore: Math.max(0, safetyScore),
        flags,
        reviewRecommended: false,
      };
    }

    // Check for profanity
    const profanityResult = this.checkProfanity(caption, safetyLevel);
    if (profanityResult.found) {
      flags.profanity = true;
      issues.push(...profanityResult.issues);
      filteredCaption = profanityResult.filtered;
      safetyScore -= 15;
    }

    // Check for hate speech
    const hateSpeechResult = this.checkHateSpeech(caption);
    if (hateSpeechResult.found) {
      flags.hateSpeech = true;
      issues.push(...hateSpeechResult.issues);
      safetyScore -= 40; // Major deduction for hate speech
    }

    // Check for spam patterns
    const spamResult = this.checkSpamPatterns(caption);
    if (spamResult.found) {
      flags.spam = true;
      issues.push(...spamResult.issues);
      safetyScore -= 20;
    }

    // Check for misleading claims
    const misleadingResult = this.checkMisleadingClaims(caption);
    if (misleadingResult.found) {
      flags.misleadingClaims = true;
      issues.push(...misleadingResult.issues);
      safetyScore -= 25;
    }

    // Check for copyright violations
    const copyrightResult = this.checkCopyrightViolation(caption);
    if (copyrightResult.found) {
      flags.copyrightViolation = true;
      issues.push(...copyrightResult.issues);
      safetyScore -= 30;
    }

    // Check for personal information exposure
    const personalInfoResult = this.checkPersonalInfo(caption);
    if (personalInfoResult.found) {
      flags.personalInfoExposure = true;
      issues.push(...personalInfoResult.issues);
      filteredCaption = personalInfoResult.filtered;
      safetyScore -= 35;
    }

    // Check brand values
    if (brandValues && brandValues.length > 0) {
      const brandIssues = this.checkBrandValues(caption, brandValues);
      if (brandIssues.length > 0) {
        issues.push(...brandIssues);
        safetyScore -= 15 * brandIssues.length; // Significant deduction per brand conflict
      }
    }

    // Check prohibited topics
    if (prohibitedTopics && prohibitedTopics.length > 0) {
      const prohibitedIssues = this.checkProhibitedTopics(caption, prohibitedTopics);
      if (prohibitedIssues.length > 0) {
        issues.push(...prohibitedIssues);
        safetyScore -= 50; // Major deduction for prohibited topics
      }
    }

    // Check controversial topics (for standard and strict levels)
    if (safetyLevel === 'standard' || safetyLevel === 'strict') {
      const controversialResult = this.checkControversialTopics(caption);
      if (controversialResult.found) {
        // Task 22.2: Mark as "review recommended" instead of adding to issues directly
        // This allows authentic edgy content that matches the user's voice
        edgyContentTypes.push('controversial topics');
        reviewRecommended = true;
        
        if (safetyLevel === 'strict') {
          // In strict mode, still add to issues
          issues.push(...controversialResult.issues.map(issue => `⚠️ REVIEW RECOMMENDED: ${issue}`));
          safetyScore -= 15;
        } else {
          // In standard mode, just flag for review without penalizing
          reviewReason = `Contains controversial topics: ${controversialResult.issues.join(', ')}`;
        }
      }
    }

    // Task 22.2: Detect edgy/opinionated content that matches user's voice
    // This allows authentic content while still alerting user for review
    if (voiceProfile) {
      const edgyResult = this.detectEdgyContentMatchingVoice(caption, voiceProfile);
      if (edgyResult.isEdgy) {
        reviewRecommended = true;
        edgyContentTypes.push(...edgyResult.types);
        if (!reviewReason) {
          reviewReason = edgyResult.reason;
        } else {
          reviewReason += ` | ${edgyResult.reason}`;
        }
        // Don't penalize safetyScore if it matches user's voice - just flag for awareness
      }
    }

    const isSafe = safetyScore >= 70; // Threshold for safe content

    // Task 22.2: Apply user calibration to filter false positives
    // This respects user's learned preferences while maintaining core safety
    let finalIssues = issues;
    if (calibration) {
      finalIssues = safetyFeedbackService.applyCalibrationToIssues(issues, calibration);
      
      // Log if calibration filtered any issues
      if (finalIssues.length < issues.length) {
        console.log('[ContentSafetyService] Calibration filtered issues', {
          originalCount: issues.length,
          filteredCount: finalIssues.length,
          removed: issues.length - finalIssues.length,
        });
      }
    }

    console.log('[ContentSafetyService] Filtering complete', {
      isSafe,
      safetyScore,
      issueCount: finalIssues.length,
      flags,
      reviewRecommended,
      edgyContentTypes,
      calibrationApplied: !!calibration,
    });

    return {
      isSafe,
      issues: finalIssues,
      filteredCaption,
      safetyScore: Math.max(0, safetyScore),
      flags,
      reviewRecommended,
      reviewReason,
      edgyContentTypes: edgyContentTypes.length > 0 ? edgyContentTypes : undefined,
    };
  }

  /**
   * Check for profanity
   */
  private checkProfanity(
    caption: string,
    safetyLevel: 'standard' | 'strict'
  ): { found: boolean; issues: string[]; filtered: string } {
    const issues: string[] = [];
    let filtered = caption;
    let found = false;

    for (const pattern of this.PROFANITY_PATTERNS) {
      const matches = caption.match(pattern);
      if (matches) {
        found = true;
        const uniqueMatches = [...new Set(matches)];
        
        if (safetyLevel === 'strict') {
          issues.push(`Profanity detected: ${uniqueMatches.join(', ')}`);
          // Filter out profanity
          filtered = filtered.replace(pattern, '[filtered]');
        } else {
          issues.push(`Mild language detected: ${uniqueMatches.join(', ')} - Consider family-friendly alternatives`);
        }
      }
    }

    return { found, issues, filtered };
  }

  /**
   * Check for hate speech
   */
  private checkHateSpeech(caption: string): { found: boolean; issues: string[] } {
    const issues: string[] = [];
    let found = false;

    for (const pattern of this.HATE_SPEECH_PATTERNS) {
      const matches = caption.match(pattern);
      if (matches) {
        found = true;
        const uniqueMatches = [...new Set(matches)];
        issues.push(`Potential hate speech or discriminatory language: ${uniqueMatches.join(', ')}`);
      }
    }

    return { found, issues };
  }

  /**
   * Check for spam patterns
   */
  private checkSpamPatterns(caption: string): { found: boolean; issues: string[] } {
    const issues: string[] = [];
    let found = false;

    for (const pattern of this.SPAM_PATTERNS) {
      const matches = caption.match(pattern);
      if (matches) {
        found = true;
        const uniqueMatches = [...new Set(matches)];
        issues.push(`Spam-like pattern detected: ${uniqueMatches.join(', ')}`);
      }
    }

    return { found, issues };
  }

  /**
   * Check for misleading claims
   */
  private checkMisleadingClaims(caption: string): { found: boolean; issues: string[] } {
    const issues: string[] = [];
    let found = false;

    for (const pattern of this.MISLEADING_CLAIMS_PATTERNS) {
      const matches = caption.match(pattern);
      if (matches) {
        found = true;
        const uniqueMatches = [...new Set(matches)];
        issues.push(`Potentially misleading claim: ${uniqueMatches.join(', ')}`);
      }
    }

    return { found, issues };
  }

  /**
   * Check for copyright violations
   */
  private checkCopyrightViolation(caption: string): { found: boolean; issues: string[] } {
    const issues: string[] = [];
    let found = false;

    for (const pattern of this.COPYRIGHT_PATTERNS) {
      if (pattern.test(caption)) {
        found = true;
        issues.push('Potential copyright symbol usage detected - Ensure you have rights to use this content');
      }
    }

    return { found, issues };
  }

  /**
   * Check for personal information exposure
   */
  private checkPersonalInfo(caption: string): { found: boolean; issues: string[]; filtered: string } {
    const issues: string[] = [];
    let filtered = caption;
    let found = false;

    // Check SSN
    if (this.PERSONAL_INFO_PATTERNS[0].test(caption)) {
      found = true;
      issues.push('Potential SSN detected - Remove sensitive personal information');
      filtered = filtered.replace(this.PERSONAL_INFO_PATTERNS[0], '[SSN REMOVED]');
    }

    // Check credit card
    if (this.PERSONAL_INFO_PATTERNS[1].test(caption)) {
      found = true;
      issues.push('Potential credit card number detected - Remove sensitive financial information');
      filtered = filtered.replace(this.PERSONAL_INFO_PATTERNS[1], '[CARD NUMBER REMOVED]');
    }

    // Check phone numbers
    const phoneMatches = caption.match(this.PERSONAL_INFO_PATTERNS[2]);
    if (phoneMatches && phoneMatches.length > 0) {
      // Phone numbers might be intentional for business contact
      found = true;
      issues.push('Phone number detected - Verify this is intentional business contact info');
    }

    // Check email addresses
    const emailMatches = caption.match(this.PERSONAL_INFO_PATTERNS[3]);
    if (emailMatches && emailMatches.length > 0) {
      // Emails might be intentional for business contact
      found = true;
      issues.push('Email address detected - Verify this is intentional business contact info');
    }

    // Check physical addresses
    if (this.PERSONAL_INFO_PATTERNS[4].test(caption)) {
      found = true;
      issues.push('Physical address detected - Verify this is safe to share publicly');
    }

    return { found, issues, filtered };
  }

  /**
   * Check brand values alignment
   */
  private checkBrandValues(caption: string, brandValues: string[]): string[] {
    const issues: string[] = [];
    const lowerCaption = caption.toLowerCase();

    // Define opposite values mapping
    const valueConflicts: Record<string, string[]> = {
      'professional': ['unprofessional', 'sloppy', 'lazy'],
      'luxury': ['cheap', 'budget', 'discount', 'low-cost'],
      'sustainable': ['wasteful', 'disposable', 'unsustainable', 'single-use'],
      'eco-friendly': ['wasteful', 'disposable', 'unsustainable', 'single-use', 'polluting'],
      'inclusive': ['exclusive', 'elitist', 'discriminatory'],
      'authentic': ['fake', 'artificial', 'manufactured', 'inauthentic'],
      'innovative': ['outdated', 'old-fashioned', 'obsolete'],
      'family-friendly': ['adult', 'mature', 'explicit'],
      'premium': ['cheap', 'low-quality', 'inferior', 'subpar'],
      'ethical': ['unethical', 'immoral', 'dishonest'],
      'transparent': ['hidden', 'secretive', 'opaque'],
    };

    for (const brandValue of brandValues) {
      const lowerValue = brandValue.toLowerCase();
      const conflictingTerms = valueConflicts[lowerValue] || [];

      for (const term of conflictingTerms) {
        if (lowerCaption.includes(term)) {
          issues.push(`Caption conflicts with brand value "${brandValue}": contains "${term}"`);
        }
      }
    }

    return issues;
  }

  /**
   * Check prohibited topics
   */
  private checkProhibitedTopics(caption: string, prohibitedTopics: string[]): string[] {
    const issues: string[] = [];
    const lowerCaption = caption.toLowerCase();

    for (const topic of prohibitedTopics) {
      const lowerTopic = topic.toLowerCase();
      if (lowerCaption.includes(lowerTopic)) {
        issues.push(`Caption contains prohibited topic: "${topic}"`);
      }
    }

    return issues;
  }

  /**
   * Check controversial topics
   */
  private checkControversialTopics(caption: string): { found: boolean; issues: string[] } {
    const issues: string[] = [];
    const lowerCaption = caption.toLowerCase();
    let found = false;

    for (const topic of this.CONTROVERSIAL_TOPICS) {
      if (lowerCaption.includes(topic)) {
        found = true;
        issues.push(`Controversial topic detected: "${topic}" - Review for brand appropriateness`);
      }
    }

    return { found, issues };
  }

  /**
   * Task 22.2: Detect edgy/opinionated content that matches user's voice
   * 
   * This detects content that:
   * - Is opinionated or polarizing
   * - Uses strong language or bold claims
   * - Challenges common beliefs or norms
   * - But still matches the user's authentic voice
   * 
   * The goal is to allow authentic edgy content while alerting the user for review
   * 
   * @param caption - Caption text
   * @param voiceProfile - User's voice profile
   * @returns Detection result with types and reason
   */
  private detectEdgyContentMatchingVoice(
    caption: string,
    voiceProfile: any
  ): { isEdgy: boolean; types: string[]; reason: string } {
    const types: string[] = [];
    let reason = '';
    const lowerCaption = caption.toLowerCase();

    // Opinionated language patterns
    const OPINIONATED_PATTERNS = [
      /\b(honestly|truthfully|real talk|let's be real|no cap|facts|period)\b/gi,
      /\b(unpopular opinion|hot take|controversial|debate me)\b/gi,
      /\b(everyone|nobody|always|never) (says|thinks|does|believes)/gi,
      /\b(tired of|sick of|done with|over it)\b/gi,
    ];

    // Bold/strong claims
    const BOLD_CLAIM_PATTERNS = [
      /\b(the truth is|the reality is|here's the deal)\b/gi,
      /\b(you need to|you should|you must|stop|start)\b/gi,
      /\b(the problem with|what's wrong with|why .+ is broken)\b/gi,
    ];

    // Challenging norms/beliefs
    const CHALLENGE_PATTERNS = [
      /\b(actually|contrary to|despite what|ignore what)\b/gi,
      /\b(myth|misconception|lie|wrong about)\b/gi,
      /\b(why I don't|why you shouldn't|stop doing)\b/gi,
    ];

    // Check for opinionated language
    let opinionatedMatches = 0;
    for (const pattern of OPINIONATED_PATTERNS) {
      if (pattern.test(caption)) {
        opinionatedMatches++;
      }
    }
    if (opinionatedMatches >= 1) {
      types.push('opinionated');
    }

    // Check for bold claims
    let boldClaimMatches = 0;
    for (const pattern of BOLD_CLAIM_PATTERNS) {
      if (pattern.test(caption)) {
        boldClaimMatches++;
      }
    }
    if (boldClaimMatches >= 1) {
      types.push('bold claims');
    }

    // Check for challenging norms
    let challengeMatches = 0;
    for (const pattern of CHALLENGE_PATTERNS) {
      if (pattern.test(caption)) {
        challengeMatches++;
      }
    }
    if (challengeMatches >= 1) {
      types.push('challenges norms');
    }

    // Check if tone matches voice profile
    // If the caption is edgy but matches the user's typical tone, it's authentic edginess
    const isEdgy = types.length > 0;
    
    if (isEdgy) {
      // Check if this edginess aligns with user's voice
      const userToneMarkers = voiceProfile?.toneMarkers || {};
      const isAuthenticEdgy = 
        (userToneMarkers.casual && userToneMarkers.casual > 0.6) ||
        (userToneMarkers.conversational && userToneMarkers.conversational > 0.6) ||
        (userToneMarkers.humorous && userToneMarkers.humorous > 0.5);

      if (isAuthenticEdgy) {
        reason = `Edgy content (${types.join(', ')}) matches your authentic voice style - review for brand appropriateness`;
      } else {
        reason = `Edgy content detected (${types.join(', ')}) - review to ensure it aligns with your brand`;
      }
    }

    return { isEdgy, types, reason };
  }

  /**
   * Add safety metadata to caption
   * 
   * Adds safety score and flags to caption metadata for tracking and logging
   * 
   * @param caption - Caption text
   * @param safetyResult - Safety check result
   * @returns Caption with safety metadata
   */
  public addSafetyMetadata(
    caption: string,
    safetyResult: ContentSafetyResult
  ): {
    caption: string;
    safetyMetadata: {
      score: number;
      flags: typeof safetyResult.flags;
      issues: string[];
      checkedAt: Date;
    };
  } {
    return {
      caption: safetyResult.filteredCaption,
      safetyMetadata: {
        score: safetyResult.safetyScore,
        flags: safetyResult.flags,
        issues: safetyResult.issues,
        checkedAt: new Date(),
      },
    };
  }
}

// Singleton instance
export const contentSafetyService = new ContentSafetyService();
