/**
 * PromptConstructorService
 * 
 * Implements the 6-layer prompt architecture for authentic Instagram caption generation:
 * 1. Base Context - Platform-native writing principles and current viral formulas
 * 2. Voice Layer - User's unique writing style and patterns
 * 3. Viral Patterns - Proven high-engagement caption structures and hooks
 * 4. Niche Context - Industry-specific language, slang, and cultural references
 * 5. Examples - Real high-performing captions as few-shot learning samples
 * 6. Constraints - Task-specific instructions and content safety guidelines
 * 
 * Requirements: 1.4, 2.4, 3.4, 7.4
 */

import { VoiceProfileService, VoiceProfile } from './VoiceProfileService';
import { viralPatternService } from './ViralPatternService';
import { nicheContextService } from './NicheContextService';
import { exampleCaptionService } from './ExampleCaptionService';
import type { ViralPattern, ViralHook, NicheContext, ExampleCaption } from '../domain/types';
import type { UserAIPreferences } from './AIServiceManager';

export interface PromptConstructionParams {
  userId: string;
  workspaceId: string;
  mediaAnalysis?: string;
  existingCaption?: string;
  postType: 'post' | 'story' | 'reel';
  platform: string;
  aiPreferences: UserAIPreferences & { 
    contentNiche?: string;
    brandValues?: string[];
    prohibitedTopics?: string[];
  };
}

export interface PromptQualityScore {
  overallScore: number;  // 0-100
  tokenCount: number;
  estimatedTokens: number;
  layerBreakdown: {
    layer1: number;
    layer2: number;
    layer3: number;
    layer4: number;
    layer5: number;
    layer6: number;
  };
  redundancyScore: number;  // 0-100 (higher is less redundant)
  clarityScore: number;  // 0-100
  completenessScore: number;  // 0-100
  recommendations: string[];
}

export class PromptConstructorService {
  private voiceProfileService: VoiceProfileService | null = null;

  constructor(voiceProfileService?: VoiceProfileService) {
    this.voiceProfileService = voiceProfileService || null;
  }

  /**
   * Build comprehensive generation prompt with all 6 layers
   * 
   * This is the main orchestration method that coordinates loading all context
   * and assembling the layered prompt architecture.
   * 
   * Requirements: 1.4, 2.4, 3.4, 7.4
   * 
   * @param params - Prompt construction parameters
   * @returns Complete multi-layered prompt for AI generation
   */
  async buildGenerationPrompt(params: PromptConstructionParams): Promise<string> {
    const {
      userId,
      workspaceId,
      mediaAnalysis,
      existingCaption,
      postType,
      platform,
      aiPreferences,
    } = params;

    console.log('[PromptConstructorService] Building generation prompt', {
      userId,
      workspaceId,
      postType,
      platform,
      niche: aiPreferences.contentNiche,
    });

    try {
      // Load all context in parallel for efficiency
      const [voiceProfile, viralPatterns, viralHooks, nicheContext, examples] = await Promise.all([
        this.loadVoiceProfile(userId, workspaceId),
        this.loadViralPatterns(aiPreferences.contentNiche || 'lifestyle', postType),
        this.loadViralHooks(aiPreferences.contentNiche || 'lifestyle'),
        this.loadNicheContext(aiPreferences.contentNiche || 'lifestyle'),
        this.loadExamples(aiPreferences.contentNiche || 'lifestyle', postType),
      ]);

      // Build layered prompt
      const layer1 = this.buildBaseInstructions(platform, postType);
      const layer2 = this.buildVoiceLayer(voiceProfile);
      const layer3 = this.buildViralPatternsLayer(viralPatterns, viralHooks);
      const layer4 = this.buildNicheContextLayer(nicheContext);
      const layer5 = this.buildExamplesLayer(examples, postType);
      const layer6 = this.buildConstraintsLayer(params);

      // Combine all layers with clear separation
      let completePrompt = `
${layer1}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${layer2}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${layer3}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${layer4}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${layer5}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${layer6}
`.trim();

      // Apply optimization to stay within 7,000-8,500 character range
      completePrompt = this.optimizePromptTokens(completePrompt, 8500);

      // Score prompt quality
      const qualityScore = this.scorePromptQuality(completePrompt);

      console.log('[PromptConstructorService] Prompt built successfully', {
        totalLength: completePrompt.length,
        layers: 6,
        qualityScore: qualityScore.overallScore,
        estimatedTokens: qualityScore.estimatedTokens,
      });

      // Log quality recommendations if score is below 80
      if (qualityScore.overallScore < 80) {
        console.warn('[PromptConstructorService] Prompt quality below threshold', {
          score: qualityScore.overallScore,
          recommendations: qualityScore.recommendations,
        });
      }

      return completePrompt;
    } catch (error) {
      console.error('[PromptConstructorService] Error building prompt:', error);
      throw new Error(`Failed to build generation prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================================================
  // LAYER 1: BASE CONTEXT
  // ============================================================================

  /**
   * Layer 1: Base system instructions with platform-native principles
   * 
   * Provides foundational guidance on writing authentic, platform-appropriate content
   * with current viral formulas and "what NOT to do" guidelines.
   * 
   * @param platform - Social media platform (Instagram, etc.)
   * @param postType - Type of post (post, story, reel)
   * @returns Base instruction layer
   */
  private buildBaseInstructions(platform: string, postType: 'post' | 'story' | 'reel'): string {
    const platformGuidelines = this.getPlatformGuidelines(platform, postType);
    
    return `
═══════════════════════════════════════════════════════════════════
LAYER 1: BASE CONTEXT - Platform-Native Writing Principles
═══════════════════════════════════════════════════════════════════

You are an expert ${platform} content creator specializing in authentic, high-engagement ${postType}s that sound genuinely human, never robotic or AI-generated.

CORE PRINCIPLES:
${platformGuidelines}

WHAT TO AVOID (AI Tells - Never use these):
❌ Corporate jargon: "synergy", "leverage", "optimize", "revolutionize", "disrupt", "paradigm"
❌ AI vocabulary: "delve", "explore deeply", "journey", "unlock", "transform", "robust"
❌ Generic marketing phrases: "Let's dive in", "In today's digital age", "Are you ready to"
❌ Overly formal language: "therefore", "moreover", "furthermore", "consequently"
❌ Emoji clusters: Never use 3+ emojis in a row
❌ Lecture-style writing: Avoid sounding like a textbook or corporate announcement
❌ Template-like openings: No clichéd hooks or predictable structures

AUTHENTIC WRITING CHARACTERISTICS:
✓ Natural conversational tone with direct address ("you", "your", "we")
✓ Varied sentence lengths (mix short punchy sentences with longer flowing ones)
✓ Casual contractions ("it's", "don't", "you're", "gonna", "wanna")
✓ Rhetorical questions and asides that create connection
✓ Specific details, numbers, and personal moments (not generic statements)
✓ Emotional vulnerability and relatability
✓ Platform-native terminology and current slang (used naturally, not forced)
✓ Strategic line breaks for mobile readability
`.trim();
  }

  /**
   * Get platform-specific guidelines
   */
  private getPlatformGuidelines(platform: string, postType: string): string {
    if (platform.toLowerCase() === 'instagram') {
      if (postType === 'story') {
        return `
• Ultra-casual, 1-2 sentences max
• Use interactive elements language ("swipe up", "tap for more", "DM me")
• Heavy emoji usage is acceptable for stories
• Direct, immediate, conversational
• Focus on urgency and FOMO`;
      } else if (postType === 'reel') {
        return `
• Hook-first structure (first 3 seconds matter)
• Short, punchy, high-energy
• CTA for saves and shares
• Include payoff/resolution
• Mobile-first vertical format language`;
      } else {
        return `
• Story-Insight-Question structure works best
• 1-2 sentence paragraphs with line breaks
• 2-5 emojis placed naturally within text (not at end)
• End with specific, easy-to-answer engagement question
• Mobile-first readability (frequent line breaks)
• Never include hashtags in caption body (generate separately)`;
      }
    }
    
    return `
• Platform-native language and terminology
• Mobile-first readability
• Authentic conversational tone
• Strategic emoji placement
• Clear engagement mechanics`;
  }

  // ============================================================================
  // LAYER 2: VOICE PROFILE
  // ============================================================================

  /**
   * Layer 2: User's unique voice profile
   * 
   * Converts the voice profile analysis into specific instructions for matching
   * the user's authentic writing style.
   * 
   * Requirements: 1.4
   * 
   * @param profile - User's voice profile
   * @returns Voice profile layer
   */
  private buildVoiceLayer(profile: VoiceProfile | null): string {
    const formattedProfile = this.voiceProfileToPrompt(profile);
    
    return `
═══════════════════════════════════════════════════════════════════
LAYER 2: VOICE PROFILE - User's Unique Writing Style
═══════════════════════════════════════════════════════════════════

${formattedProfile}
`.trim();
  }

  /**
   * Format voice profile into prompt instructions
   * 
   * Public method that converts a voice profile into formatted prompt text.
   * Can be used independently or as part of the layered prompt construction.
   * 
   * Requirements: 1.4
   * 
   * @param profile - User's voice profile (or null)
   * @returns Formatted voice profile instructions
   */
  public voiceProfileToPrompt(profile: VoiceProfile | null): string {
    if (!profile || profile.sampleSize === 0) {
      return `
[No voice profile available - using general authentic Instagram voice]

Default Voice Guidelines:
• Conversational and relatable tone
• Mix of short and medium sentences
• Moderate emoji usage (2-5 per caption)
• Direct address to audience
• Natural, unforced language
`.trim();
    }

    const topVocab = Object.entries(profile.vocabularyFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);

    return `
CRITICAL: Match this user's EXACT writing style. This is their authentic voice.

VOCABULARY: ${topVocab.length > 0 ? `"${topVocab.join('", "')}"` : 'General conversational words'}
SIGNATURE PHRASES: ${profile.signaturePhrases.length > 0 ? `"${profile.signaturePhrases.join('", "')}"` : 'None identified'}
SENTENCE LENGTH: ${profile.sentenceLengthDistribution.short}% short, ${profile.sentenceLengthDistribution.medium}% medium, ${profile.sentenceLengthDistribution.long}% long
PARAGRAPH STRUCTURE: ${profile.paragraphStructure}
EMOJIS: ${profile.emojiUsagePattern.topEmojis.join(' ') || 'Minimal usage'}
EMOJI PATTERN: ${profile.emojiUsagePattern.frequency} frequency, ${profile.emojiUsagePattern.placement} placement
PUNCTUATION: Exclamations (${profile.punctuationStyle.exclamationUsage}), Questions (${profile.punctuationStyle.questionUsage})${profile.punctuationStyle.ellipsisUsage ? ', Uses ellipsis' : ''}
TONE: ${this.getDominantTones(profile.toneMarkers)}
STORYTELLING: ${profile.storytellingStructure}
HOOK PATTERNS: ${profile.hookPatterns.length > 0 ? `"${profile.hookPatterns.slice(0, 3).join('", "')}"` : 'Various'}

VOICE MATCHING REQUIREMENTS:
• Use the specified vocabulary frequency patterns
• Match sentence length distribution exactly
• Follow the paragraph structure preference
• Place emojis according to their pattern (${profile.emojiUsagePattern.frequency}, ${profile.emojiUsagePattern.placement})
• Match punctuation style (exclamations: ${profile.punctuationStyle.exclamationUsage}, questions: ${profile.punctuationStyle.questionUsage})
• Embody the tone markers (dominant: ${this.getDominantTones(profile.toneMarkers)})
• Use similar hook patterns and engagement question styles

This voice profile has ${(profile.confidence * 100).toFixed(0)}% confidence based on ${profile.sampleSize} analyzed captions.
`.trim();
  }

  /**
   * Format voice profile when voiceProfileService is not available
   * 
   * @deprecated Use voiceProfileToPrompt() instead
   */
  private formatVoiceProfile(profile: VoiceProfile): string {
    const topVocab = Object.entries(profile.vocabularyFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);

    return `
VOCABULARY: ${topVocab.length > 0 ? `"${topVocab.join('", "')}"` : 'General conversational words'}
SIGNATURE PHRASES: ${profile.signaturePhrases.length > 0 ? `"${profile.signaturePhrases.join('", "')}"` : 'None identified'}
SENTENCE LENGTH: ${profile.sentenceLengthDistribution.short}% short, ${profile.sentenceLengthDistribution.medium}% medium, ${profile.sentenceLengthDistribution.long}% long
EMOJIS: ${profile.emojiUsagePattern.topEmojis.join(' ') || 'Minimal usage'}
STORYTELLING: ${profile.storytellingStructure}
`.trim();
  }

  /**
   * Get dominant tone markers
   */
  private getDominantTones(toneMarkers: VoiceProfile['toneMarkers']): string {
    return Object.entries(toneMarkers)
      .filter(([, score]) => score > 0.3)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([tone]) => tone)
      .join(', ') || 'neutral';
  }

  // ============================================================================
  // LAYER 3: VIRAL PATTERNS
  // ============================================================================

  /**
   * Layer 3: Viral patterns and hooks
   * 
   * Provides proven high-engagement caption structures and hooks to adapt
   * to the user's voice (not copy verbatim).
   * 
   * Requirements: 2.4
   * 
   * @param patterns - Relevant viral patterns
   * @param hooks - Viral hooks
   * @returns Viral patterns layer
   */
  private buildViralPatternsLayer(patterns: ViralPattern[], hooks: ViralHook[]): string {
    const formattedPatterns = this.viralPatternsToPrompt(patterns, hooks);
    
    return `
═══════════════════════════════════════════════════════════════════
LAYER 3: VIRAL PATTERNS - Proven High-Engagement Structures
═══════════════════════════════════════════════════════════════════

${formattedPatterns}
`.trim();
  }

  /**
   * Format viral patterns and hooks into prompt instructions
   * 
   * Public method that converts viral patterns and hooks into formatted prompt text.
   * Can be used independently or as part of the layered prompt construction.
   * 
   * Requirements: 2.4
   * 
   * @param patterns - Array of relevant viral patterns
   * @param hooks - Array of viral hooks
   * @returns Formatted viral patterns instructions
   */
  public viralPatternsToPrompt(patterns: ViralPattern[], hooks: ViralHook[]): string {
    const patternsText = patterns.length > 0
      ? patterns.slice(0, 3).map((pattern, idx) => `
${idx + 1}. ${pattern.name} (${pattern.avgEngagementRate.toFixed(1)}% avg engagement)
   Category: ${pattern.category}
   Structure: ${pattern.pattern}
   Example: "${pattern.exampleCaptions[0] || 'N/A'}"
   Description: ${pattern.description}`).join('\n')
      : 'No specific patterns available - use general viral principles';

    const hooksText = hooks.length > 0
      ? hooks.slice(0, 5).map((hook, idx) => `
   ${idx + 1}. "${hook.hookText}" (+${hook.avgEngagementBoost.toFixed(1)}% engagement boost)`).join('\n')
      : 'Use strong opening statements or questions';

    return `
IMPORTANT: ADAPT these patterns to the user's voice. Do NOT copy them verbatim.
Study the structure and energy, then apply it with the user's unique style.

VIRAL PATTERNS TO ADAPT:
${patternsText}

VIRAL HOOKS TO CONSIDER (adapt to user's voice):
${hooksText}

PATTERN ADAPTATION RULES:
• Use the structural framework but insert user's vocabulary and phrasing
• Maintain the engagement mechanics (question, controversy, curiosity) 
• Match the energy level to user's typical tone
• Blend pattern with user's signature phrases where natural
`.trim();
  }

  // ============================================================================
  // LAYER 4: NICHE CONTEXT
  // ============================================================================

  /**
   * Layer 4: Niche-specific context
   * 
   * Provides industry-specific language, trending topics, slang, and cultural
   * references to ensure authentic niche resonance.
   * 
   * Requirements: 3.4
   * 
   * @param context - Niche context data
   * @returns Niche context layer
   */
  private buildNicheContextLayer(context: NicheContext | null): string {
    const formattedContext = this.nicheContextToPrompt(context);
    
    return `
═══════════════════════════════════════════════════════════════════
LAYER 4: NICHE CONTEXT - Industry-Specific Language
═══════════════════════════════════════════════════════════════════

${formattedContext}
`.trim();
  }

  /**
   * Format niche context into prompt instructions
   * 
   * Public method that converts niche context into formatted prompt text.
   * Can be used independently or as part of the layered prompt construction.
   * 
   * Requirements: 3.4
   * 
   * @param context - Niche context data (or null)
   * @returns Formatted niche context instructions
   */
  public nicheContextToPrompt(context: NicheContext | null): string {
    if (!context) {
      return `
[No niche context available - use general Instagram language]
`.trim();
    }

    const trendingTopicsText = context.trendingTopics.length > 0
      ? context.trendingTopics.slice(0, 5).join(', ')
      : 'None available';

    const vocabularyText = context.vocabulary.length > 0
      ? context.vocabulary.slice(0, 25).join(', ')
      : 'General terms';

    const slangText = Object.entries(context.slangTerms).length > 0
      ? Object.entries(context.slangTerms)
          .slice(0, 8)
          .map(([term, meaning]) => `"${term}" (${meaning})`)
          .join(', ')
      : 'None available';

    const emojisText = context.typicalEmojis.length > 0
      ? context.typicalEmojis.join(' ')
      : '✨ 💯 🔥';

    return `
${context.niche.toUpperCase()} NICHE CONTEXT

CURRENT TRENDING TOPICS (last 30 days):
${trendingTopicsText}

NICHE-SPECIFIC VOCABULARY (use naturally, don't force):
${vocabularyText}

CURRENT SLANG & PHRASES:
${slangText}

TYPICAL EMOJIS FOR THIS NICHE:
${emojisText}

TONE GUIDELINES:
${context.toneGuidelines}

NICHE LANGUAGE RULES:
• Incorporate niche vocabulary naturally in context
• Use current slang only where it fits organically
• Reference trending topics when relevant to content
• Avoid outdated terms or forced niche-speak
• Match the authentic communication style of this community
`.trim();
  }

  // ============================================================================
  // LAYER 5: EXAMPLES (FEW-SHOT LEARNING)
  // ============================================================================

  /**
   * Layer 5: Real high-performing examples
   * 
   * Provides few-shot learning samples from actual successful captions
   * in the target niche.
   * 
   * Requirements: 7.4
   * 
   * @param examples - High-performing example captions
   * @param postType - Type of post
   * @returns Examples layer
   */
  private buildExamplesLayer(examples: ExampleCaption[], postType: string): string {
    const formattedExamples = this.examplesToPrompt(examples, postType);
    
    return `
═══════════════════════════════════════════════════════════════════
LAYER 5: EXAMPLES - Real High-Performing Captions
═══════════════════════════════════════════════════════════════════

${formattedExamples}
`.trim();
  }

  /**
   * Format example captions into prompt instructions
   * 
   * Public method that converts example captions into formatted prompt text
   * for few-shot learning. Can be used independently or as part of the
   * layered prompt construction.
   * 
   * Requirements: 7.4
   * 
   * @param examples - Array of high-performing example captions
   * @param postType - Type of post (post, story, reel)
   * @returns Formatted examples instructions
   */
  public examplesToPrompt(examples: ExampleCaption[], postType: string): string {
    if (examples.length === 0) {
      return `
[No examples available for this niche/post type combination]

Study general Instagram best practices for authentic ${postType} content.
`.trim();
    }

    const examplesText = examples.map((example, idx) => `
EXAMPLE ${idx + 1} (${example.engagementRate.toFixed(2)}% engagement):
"${example.caption}"

[Hook: ${example.hookType} | Style: ${example.style} | ${example.hasQuestion ? 'Includes question' : 'Statement-based'}]
`).join('\n');

    return `
Study these REAL successful captions from this niche. Learn from their:
• Hook structure and opening energy
• Storytelling flow and pacing
• Engagement question format
• Overall authentic tone

Real High-Performing ${postType.toUpperCase()}S in This Niche:

${examplesText}

LEARNING INSTRUCTIONS:
• Analyze the STRUCTURE and ENERGY of these examples
• Notice how they create connection and engagement
• Observe the natural language flow and authenticity
• Study the hook-to-question progression
• DO NOT copy content - generate unique captions with similar FEEL
`.trim();
  }

  // ============================================================================
  // LAYER 6: CONSTRAINTS & TASK
  // ============================================================================

  /**
   * Layer 6: Task-specific instructions and constraints
   * 
   * Provides the specific generation task, content safety guidelines,
   * and optimization parameters.
   * 
   * Requirements: 11.1, 11.4, 11.5
   * 
   * @param params - Prompt construction parameters
   * @returns Constraints and task layer
   */
  private buildConstraintsLayer(params: PromptConstructionParams): string {
    const taskInstructions = this.buildTaskInstructions(params);
    
    return `
═══════════════════════════════════════════════════════════════════
LAYER 6: YOUR SPECIFIC TASK
═══════════════════════════════════════════════════════════════════

${taskInstructions}
`.trim();
  }

  /**
   * Build task-specific instructions and constraints
   * 
   * Public method that creates detailed task instructions including content
   * context, variation requirements, safety guidelines, and output format.
   * Can be used independently or as part of the layered prompt construction.
   * 
   * Requirements: 11.1, 11.4, 11.5
   * 
   * @param params - Prompt construction parameters
   * @returns Formatted task instructions
   */
  public buildTaskInstructions(params: PromptConstructionParams): string {
    const {
      mediaAnalysis,
      existingCaption,
      postType,
      platform,
      aiPreferences,
    } = params;

    const contentContext = mediaAnalysis
      ? `VISUAL CONTENT ANALYSIS:\n${mediaAnalysis}\n\n`
      : '';

    const improvementContext = existingCaption
      ? `EXISTING CAPTION TO IMPROVE:\n"${existingCaption}"\n\n`
      : '';

    const optimizationGoals = aiPreferences.optimizationGoals || 'Engagement';
    const contentSafety = aiPreferences.contentSafety || 'standard';
    const brandValues = aiPreferences.brandValues || [];
    const prohibitedTopics = aiPreferences.prohibitedTopics || [];

    // Build brand values section if provided
    const brandValuesSection = brandValues.length > 0
      ? `\nBRAND VALUES TO EMBODY:\n${brandValues.map(v => `• ${v}`).join('\n')}\n`
      : '';

    // Build prohibited topics section if provided
    const prohibitedTopicsSection = prohibitedTopics.length > 0
      ? `\nPROHIBITED TOPICS (MUST AVOID):\n${prohibitedTopics.map(t => `• ${t}`).join('\n')}\n`
      : '';

    return `
${contentContext}${improvementContext}POST TYPE: ${postType}
PLATFORM: ${platform}
OPTIMIZATION GOAL: ${optimizationGoals}
CONTENT SAFETY LEVEL: ${contentSafety}${brandValuesSection}${prohibitedTopicsSection}

GENERATION REQUIREMENTS:

Generate 3 DISTINCT VARIATIONS that embody different strategic approaches:

VARIATION 1 - Maximum Virality:
• Aggressive viral hook from Layer 3
• High-energy, scroll-stopping opening
• Incorporates trending patterns and topics
• Bold, confident tone
• Strong emotional trigger
• MUST maintain user's voice while being more assertive

VARIATION 2 - Authentic Storytelling:
• Personal, relatable narrative approach
• Vulnerable and human
• Story-insight-question structure
• User's natural voice at 100%
• Emotional connection over virality
• Genuine, unfiltered authenticity

VARIATION 3 - Balanced Engagement:
• Proven formula + unique voice blend
• Strategic viral elements woven naturally
• Optimized for saves and shares
• Balances authenticity with performance
• Data-informed but feels organic
• Best of both worlds

UNIVERSAL REQUIREMENTS FOR ALL 3 VARIATIONS:
✓ Score minimum 80/100 on authenticity (sound HUMAN, not AI)
✓ Match user's voice profile from Layer 2 exactly
✓ Use niche-specific language naturally from Layer 4
✓ Incorporate adapted patterns from Layer 3 (don't copy)
✓ Follow platform formatting from Layer 1
✓ Include specific, easy-to-answer engagement question at end
✓ Mobile-first formatting with strategic line breaks
✓ 2-5 emojis placed naturally (not clustered)
✓ Length: ${this.getPostTypeLengthGuideline(postType)}
✓ NO hashtags in caption body
✓ NO corporate jargon, AI vocabulary, or generic marketing phrases

CONTENT SAFETY REQUIREMENTS (${contentSafety} level):
${this.getContentSafetyGuidelines(contentSafety, brandValues, prohibitedTopics)}

OUTPUT FORMAT:
Provide the 3 variations clearly labeled:

VARIATION 1: [caption text]

VARIATION 2: [caption text]

VARIATION 3: [caption text]

Remember: These must sound like REAL HUMAN captions, not AI-generated content.
The user's followers should never suspect AI involvement.
`.trim();
  }

  /**
   * Get post type length guideline
   */
  private getPostTypeLengthGuideline(postType: string): string {
    switch (postType) {
      case 'story':
        return '1-2 sentences (ultra-short)';
      case 'reel':
        return '50-150 characters (hook-focused)';
      case 'post':
      default:
        return '150-300 words (full caption)';
    }
  }

  /**
   * Get content safety guidelines based on level
   */
  private getContentSafetyGuidelines(
    level: string,
    brandValues?: string[],
    prohibitedTopics?: string[]
  ): string {
    let guidelines = '';

    if (level === 'strict') {
      guidelines = `
• Avoid ANY potentially controversial statements
• No sensitive topics (politics, religion, health claims)
• Family-friendly language only
• No edgy humor or sarcasm
• Brand-safe and advertiser-friendly`;
    } else if (level === 'off') {
      guidelines = `
• Creative freedom with user's authentic voice
• Allow edgy content if it matches voice profile
• No illegal content or hate speech (platform TOS still applies)
• User takes responsibility for content`;
    } else {
      guidelines = `
• Allow authentic voice with reasonable boundaries
• Avoid highly controversial or divisive topics
• Balance authenticity with brand protection
• Flag potentially sensitive content for user review
• Maintain trust and reputation`;
    }

    // Add brand values alignment if provided
    if (brandValues && brandValues.length > 0) {
      guidelines += `\n• CRITICAL: Align caption language with brand values: ${brandValues.join(', ')}`;
      guidelines += `\n• Use language that reflects and reinforces these brand values`;
    }

    // Add prohibited topics if provided
    if (prohibitedTopics && prohibitedTopics.length > 0) {
      guidelines += `\n• STRICTLY FORBIDDEN: Do NOT mention or reference: ${prohibitedTopics.join(', ')}`;
      guidelines += `\n• These topics are completely off-limits for this brand`;
    }

    return guidelines;
  }

  // ============================================================================
  // OPTIMIZATION AND SAFETY LAYERS
  // ============================================================================

  /**
   * Optimize prompt for token efficiency
   * 
   * Manages token count to stay within 7,000-8,500 character range and
   * removes redundancy while preserving essential information.
   * 
   * Task 9.3: Prompt optimization logic
   * 
   * @param prompt - Original prompt text
   * @param maxCharacters - Maximum character limit (default 8500)
   * @returns Optimized prompt
   */
  public optimizePromptTokens(prompt: string, maxCharacters: number = 8500): string {
    console.log('[PromptConstructorService] Optimizing prompt tokens', {
      originalLength: prompt.length,
      maxCharacters,
    });

    // If prompt is already under limit and above minimum, return as-is
    if (prompt.length >= 7000 && prompt.length <= maxCharacters) {
      console.log('[PromptConstructorService] Prompt within optimal range');
      return prompt;
    }

    // If prompt is too short, no optimization needed
    if (prompt.length < 7000) {
      console.log('[PromptConstructorService] Prompt under minimum length, no optimization needed');
      return prompt;
    }

    // If prompt exceeds maximum, apply optimization strategies
    let optimizedPrompt = prompt;

    // Strategy 1: Remove excessive whitespace and empty lines
    optimizedPrompt = this.removeRedundantWhitespace(optimizedPrompt);

    // Strategy 2: Compress repetitive instructions
    optimizedPrompt = this.compressRepetitiveContent(optimizedPrompt);

    // Strategy 3: If still too long, trim less critical examples
    if (optimizedPrompt.length > maxCharacters) {
      optimizedPrompt = this.trimExamples(optimizedPrompt, maxCharacters);
    }

    // Strategy 4: If still too long, reduce pattern descriptions
    if (optimizedPrompt.length > maxCharacters) {
      optimizedPrompt = this.reducePatternDescriptions(optimizedPrompt, maxCharacters);
    }

    // Strategy 5: Last resort - trim vocabulary lists
    if (optimizedPrompt.length > maxCharacters) {
      optimizedPrompt = this.trimVocabularyLists(optimizedPrompt, maxCharacters);
    }

    console.log('[PromptConstructorService] Prompt optimized', {
      originalLength: prompt.length,
      optimizedLength: optimizedPrompt.length,
      reduction: prompt.length - optimizedPrompt.length,
      reductionPercent: ((1 - optimizedPrompt.length / prompt.length) * 100).toFixed(2) + '%',
    });

    return optimizedPrompt;
  }

  /**
   * Remove redundant whitespace while preserving structure
   */
  private removeRedundantWhitespace(prompt: string): string {
    return prompt
      .replace(/\n{4,}/g, '\n\n\n')  // Max 3 consecutive newlines
      .replace(/[ \t]+\n/g, '\n')    // Remove trailing whitespace
      .replace(/\n[ \t]+/g, '\n')    // Remove leading whitespace (except intentional indentation)
      .trim();
  }

  /**
   * Compress repetitive content and instructions
   */
  private compressRepetitiveContent(prompt: string): string {
    // Remove duplicate instruction blocks (case-insensitive)
    const lines = prompt.split('\n');
    const seenInstructions = new Set<string>();
    const compressedLines: string[] = [];

    for (const line of lines) {
      const normalized = line.trim().toLowerCase();
      
      // Keep structural elements (headers, separators)
      if (line.startsWith('═') || line.startsWith('━') || line.startsWith('LAYER')) {
        compressedLines.push(line);
        continue;
      }

      // Check for duplicate instructions
      if (normalized.length > 20) {  // Only check substantial lines
        if (!seenInstructions.has(normalized)) {
          seenInstructions.add(normalized);
          compressedLines.push(line);
        } else {
          // Skip duplicate instruction
          console.log('[PromptConstructorService] Removed duplicate instruction:', normalized.substring(0, 50));
        }
      } else {
        compressedLines.push(line);
      }
    }

    return compressedLines.join('\n');
  }

  /**
   * Trim examples to fit within character limit
   */
  private trimExamples(prompt: string, maxCharacters: number): string {
    // Find the examples section
    const examplesSectionMatch = prompt.match(/(LAYER 5:.*?EXAMPLES.*?)(━{20,})/s);
    
    if (!examplesSectionMatch) {
      return prompt;
    }

    const examplesSection = examplesSectionMatch[1];
    const exampleMatches = examplesSection.match(/EXAMPLE \d+.*?".*?"/gs);

    if (!exampleMatches || exampleMatches.length <= 1) {
      return prompt;
    }

    // Keep only first 2 examples instead of 3
    const trimmedExamples = exampleMatches.slice(0, 2).join('\n\n');
    const newExamplesSection = examplesSection.replace(
      /EXAMPLE \d+.*?".*?"/gs,
      ''
    ).replace(/\n{3,}/g, '\n\n') + '\n\n' + trimmedExamples;

    return prompt.replace(examplesSectionMatch[1], newExamplesSection);
  }

  /**
   * Reduce pattern descriptions to save space
   */
  private reducePatternDescriptions(prompt: string, maxCharacters: number): string {
    // Find patterns section and truncate long descriptions
    return prompt.replace(
      /Description: (.{100,})/g,
      (match, description) => {
        return 'Description: ' + description.substring(0, 80) + '...';
      }
    );
  }

  /**
   * Trim vocabulary lists to essential items
   */
  private trimVocabularyLists(prompt: string, maxCharacters: number): string {
    // Reduce vocabulary lists to top 10-15 items
    return prompt.replace(
      /VOCABULARY: "([^"]+(?:", "[^"]+)*)"/g,
      (match, vocabList) => {
        const words = vocabList.split('", "');
        if (words.length <= 15) {
          return match;
        }
        const trimmed = words.slice(0, 15).join('", "');
        return `VOCABULARY: "${trimmed}"`;
      }
    );
  }

  /**
   * Apply content safety filters
   * 
   * Detects and flags inappropriate content, controversial statements,
   * and brand-inappropriate language in generated captions.
   * 
   * Task 9.3: Content safety filters
   * Requirements: 11.1, 11.2, 11.3
   * 
   * @param caption - Caption text to check
   * @param safetyLevel - Content safety level
   * @param brandValues - User's brand values (optional)
   * @param prohibitedTopics - User's prohibited topics (optional)
   * @returns Safety check result
   */
  public checkContentSafety(
    caption: string,
    safetyLevel: string = 'standard',
    brandValues?: string[],
    prohibitedTopics?: string[]
  ): {
    isSafe: boolean;
    flags: string[];
    recommendations: string[];
    reviewRecommended: boolean;
  } {
    const flags: string[] = [];
    const recommendations: string[] = [];
    let reviewRecommended = false;

    const lowerCaption = caption.toLowerCase();

    // Inappropriate content detection
    const inappropriateTerms = [
      'hate', 'violence', 'explicit', 'nsfw', 'offensive',
      'racist', 'sexist', 'discriminatory',
    ];

    for (const term of inappropriateTerms) {
      if (lowerCaption.includes(term)) {
        flags.push(`Contains potentially inappropriate term: "${term}"`);
        recommendations.push(`Remove or rephrase content containing "${term}"`);
      }
    }

    // Controversial topics detection (if safety level is standard or strict)
    if (safetyLevel === 'standard' || safetyLevel === 'strict') {
      const controversialTopics = [
        'politics', 'political', 'election', 'government',
        'religion', 'religious', 'god', 'jesus', 'allah', 'buddha',
        'medical', 'health claim', 'cure', 'treatment',
        'weight loss', 'diet pill', 'supplement claim',
      ];

      for (const topic of controversialTopics) {
        if (lowerCaption.includes(topic)) {
          flags.push(`Contains potentially controversial topic: "${topic}"`);
          reviewRecommended = true;
          
          if (safetyLevel === 'strict') {
            recommendations.push(`Avoid controversial topic: "${topic}"`);
          } else {
            recommendations.push(`Review controversial topic: "${topic}" for brand appropriateness`);
          }
        }
      }
    }

    // Profanity and offensive language (if safety level is strict)
    if (safetyLevel === 'strict') {
      const profanityIndicators = [
        'damn', 'hell', 'crap', 'sucks', 'stupid', 'idiot',
        // Add more mild profanity as needed
      ];

      for (const word of profanityIndicators) {
        if (lowerCaption.includes(word)) {
          flags.push(`Contains language that may not be family-friendly: "${word}"`);
          recommendations.push(`Consider more family-friendly language instead of "${word}"`);
        }
      }
    }

    // Brand values check
    if (brandValues && brandValues.length > 0) {
      const brandConflicts = this.checkBrandValueConflicts(caption, brandValues);
      if (brandConflicts.length > 0) {
        flags.push(...brandConflicts);
        recommendations.push('Review caption for alignment with brand values');
        reviewRecommended = true;
      }
    }

    // Prohibited topics check
    if (prohibitedTopics && prohibitedTopics.length > 0) {
      for (const topic of prohibitedTopics) {
        if (lowerCaption.includes(topic.toLowerCase())) {
          flags.push(`Contains prohibited topic: "${topic}"`);
          recommendations.push(`Remove content related to prohibited topic: "${topic}"`);
        }
      }
    }

    // Sensitive personal information detection
    const sensitivePatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/g,  // SSN pattern
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,  // Credit card pattern
      /\b[\w.]+@[\w.]+\.\w+\b/g,  // Email pattern (may be intentional)
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(caption)) {
        flags.push('Contains potential sensitive personal information');
        recommendations.push('Remove any personal identification numbers or sensitive data');
        reviewRecommended = true;
      }
    }

    const isSafe = flags.length === 0 || (safetyLevel === 'off' && !prohibitedTopics?.some(topic => 
      lowerCaption.includes(topic.toLowerCase())
    ));

    console.log('[PromptConstructorService] Content safety check', {
      isSafe,
      flagCount: flags.length,
      reviewRecommended,
      safetyLevel,
    });

    return {
      isSafe,
      flags,
      recommendations,
      reviewRecommended,
    };
  }

  /**
   * Check for brand value conflicts
   */
  private checkBrandValueConflicts(caption: string, brandValues: string[]): string[] {
    const conflicts: string[] = [];
    const lowerCaption = caption.toLowerCase();

    // Define opposite values (simplified mapping)
    const valueConflicts: Record<string, string[]> = {
      'professional': ['casual', 'unprofessional', 'sloppy'],
      'luxury': ['cheap', 'budget', 'discount', 'affordable'],
      'sustainable': ['wasteful', 'disposable', 'unsustainable'],
      'inclusive': ['exclusive', 'elitist', 'discriminatory'],
      'authentic': ['fake', 'artificial', 'manufactured'],
      'innovative': ['outdated', 'traditional', 'old-fashioned'],
      'family-friendly': ['adult', 'mature', 'explicit'],
      'premium': ['cheap', 'low-quality', 'inferior'],
    };

    for (const brandValue of brandValues) {
      const lowerValue = brandValue.toLowerCase();
      const conflictingTerms = valueConflicts[lowerValue] || [];

      for (const term of conflictingTerms) {
        if (lowerCaption.includes(term)) {
          conflicts.push(`Caption language conflicts with brand value "${brandValue}": contains "${term}"`);
        }
      }
    }

    return conflicts;
  }

  /**
   * Validate brand safety
   * 
   * Comprehensive brand safety validation to ensure captions align with
   * user's brand identity and protection requirements.
   * 
   * Task 9.3: Brand safety validation
   * Requirements: 11.3, 11.4
   * 
   * @param caption - Caption text to validate
   * @param brandValues - User's brand values
   * @param prohibitedTopics - User's prohibited topics
   * @param safetyLevel - Content safety level
   * @returns Brand safety validation result
   */
  public validateBrandSafety(
    caption: string,
    brandValues?: string[],
    prohibitedTopics?: string[],
    safetyLevel: string = 'standard'
  ): {
    isBrandSafe: boolean;
    score: number;  // 0-100
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Run content safety check first
    const safetyCheck = this.checkContentSafety(caption, safetyLevel, brandValues, prohibitedTopics);
    
    if (!safetyCheck.isSafe) {
      score -= 30;
      issues.push(...safetyCheck.flags);
      suggestions.push(...safetyCheck.recommendations);
    }

    // Check for brand value alignment
    if (brandValues && brandValues.length > 0) {
      const valueScore = this.scoreBrandValueAlignment(caption, brandValues);
      score = Math.min(score, score * (valueScore / 100));

      if (valueScore < 70) {
        issues.push('Caption may not strongly reflect brand values');
        suggestions.push(`Incorporate language that emphasizes: ${brandValues.join(', ')}`);
      }
    }

    // Check for prohibited topics
    if (prohibitedTopics && prohibitedTopics.length > 0) {
      const lowerCaption = caption.toLowerCase();
      for (const topic of prohibitedTopics) {
        if (lowerCaption.includes(topic.toLowerCase())) {
          score -= 40;
          issues.push(`Contains prohibited topic: "${topic}"`);
          suggestions.push(`Completely avoid mentioning: "${topic}"`);
        }
      }
    }

    // Check for controversial or polarizing language
    const controversialWords = [
      'always', 'never', 'everyone', 'nobody', 'best', 'worst',
      'hate', 'love', 'perfect', 'terrible',
    ];

    let controversialCount = 0;
    for (const word of controversialWords) {
      if (caption.toLowerCase().includes(word)) {
        controversialCount++;
      }
    }

    if (controversialCount > 2) {
      score -= 10;
      issues.push('Caption uses potentially polarizing absolute language');
      suggestions.push('Consider more balanced and inclusive language');
    }

    const isBrandSafe = score >= 80;

    console.log('[PromptConstructorService] Brand safety validation', {
      isBrandSafe,
      score,
      issueCount: issues.length,
    });

    return {
      isBrandSafe,
      score,
      issues,
      suggestions,
    };
  }

  /**
   * Score brand value alignment
   */
  private scoreBrandValueAlignment(caption: string, brandValues: string[]): number {
    const lowerCaption = caption.toLowerCase();
    let alignmentScore = 50;  // Start at neutral

    // Positive alignment keywords for common brand values
    const alignmentKeywords: Record<string, string[]> = {
      'professional': ['expert', 'professional', 'quality', 'excellence', 'expertise'],
      'luxury': ['premium', 'exclusive', 'luxury', 'elegant', 'sophisticated'],
      'sustainable': ['eco', 'green', 'sustainable', 'environment', 'conscious'],
      'inclusive': ['everyone', 'all', 'inclusive', 'diverse', 'welcome'],
      'authentic': ['real', 'genuine', 'honest', 'authentic', 'true'],
      'innovative': ['new', 'innovative', 'cutting-edge', 'revolutionary', 'modern'],
      'family-friendly': ['family', 'kids', 'safe', 'wholesome', 'friendly'],
      'premium': ['premium', 'high-quality', 'superior', 'finest', 'top-tier'],
    };

    for (const brandValue of brandValues) {
      const lowerValue = brandValue.toLowerCase();
      const keywords = alignmentKeywords[lowerValue] || [lowerValue];

      let valueFound = false;
      for (const keyword of keywords) {
        if (lowerCaption.includes(keyword)) {
          alignmentScore += 10;
          valueFound = true;
          break;
        }
      }

      if (!valueFound) {
        alignmentScore -= 5;
      }
    }

    return Math.max(0, Math.min(100, alignmentScore));
  }

  /**
   * Score prompt quality
   * 
   * Evaluates the quality of the constructed prompt across multiple dimensions
   * including token efficiency, redundancy, clarity, and completeness.
   * 
   * Task 9.3: Prompt quality scoring system
   * 
   * @param prompt - Constructed prompt text
   * @returns Quality score breakdown
   */
  public scorePromptQuality(prompt: string): PromptQualityScore {
    const tokenCount = prompt.length;
    const estimatedTokens = Math.ceil(tokenCount / 4);  // Rough estimate: ~4 chars per token

    // Calculate layer breakdown
    const layerBreakdown = this.calculateLayerBreakdown(prompt);

    // Calculate redundancy score (higher is better)
    const redundancyScore = this.calculateRedundancyScore(prompt);

    // Calculate clarity score
    const clarityScore = this.calculateClarityScore(prompt);

    // Calculate completeness score
    const completenessScore = this.calculateCompletenessScore(prompt);

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      redundancyScore * 0.25 +
      clarityScore * 0.35 +
      completenessScore * 0.40
    );

    // Generate recommendations
    const recommendations = this.generateQualityRecommendations(
      tokenCount,
      redundancyScore,
      clarityScore,
      completenessScore
    );

    console.log('[PromptConstructorService] Prompt quality score', {
      overallScore,
      tokenCount,
      estimatedTokens,
      redundancyScore,
      clarityScore,
      completenessScore,
    });

    return {
      overallScore,
      tokenCount,
      estimatedTokens,
      layerBreakdown,
      redundancyScore,
      clarityScore,
      completenessScore,
      recommendations,
    };
  }

  /**
   * Calculate character count breakdown by layer
   */
  private calculateLayerBreakdown(prompt: string): PromptQualityScore['layerBreakdown'] {
    const layers = prompt.split(/LAYER \d:/);
    
    return {
      layer1: layers[1]?.length || 0,
      layer2: layers[2]?.length || 0,
      layer3: layers[3]?.length || 0,
      layer4: layers[4]?.length || 0,
      layer5: layers[5]?.length || 0,
      layer6: layers[6]?.length || 0,
    };
  }

  /**
   * Calculate redundancy score (0-100, higher is less redundant)
   */
  private calculateRedundancyScore(prompt: string): number {
    const lines = prompt.split('\n').filter(line => line.trim().length > 20);
    const uniqueLines = new Set(lines.map(line => line.trim().toLowerCase()));

    const redundancyRatio = uniqueLines.size / lines.length;
    const score = Math.round(redundancyRatio * 100);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate clarity score (0-100)
   */
  private calculateClarityScore(prompt: string): number {
    let score = 100;

    // Check for clear section headers
    const layerHeaders = (prompt.match(/LAYER \d+:/g) || []).length;
    if (layerHeaders < 6) {
      score -= 15;
    }

    // Check for clear instructions
    const instructionMarkers = (prompt.match(/REQUIREMENTS?:|INSTRUCTIONS?:|RULES?:/gi) || []).length;
    if (instructionMarkers < 5) {
      score -= 10;
    }

    // Check for examples
    const hasExamples = prompt.includes('EXAMPLE');
    if (!hasExamples) {
      score -= 10;
    }

    // Check for bullet points and structure
    const bulletPoints = (prompt.match(/[•✓❌]/g) || []).length;
    if (bulletPoints < 10) {
      score -= 10;
    }

    // Check for visual separators
    const separators = (prompt.match(/[═━]{20,}/g) || []).length;
    if (separators < 5) {
      score -= 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate completeness score (0-100)
   */
  private calculateCompletenessScore(prompt: string): number {
    let score = 0;

    // Check for essential components (each worth points)
    const components = {
      'base instructions': /LAYER 1.*?BASE CONTEXT/s,
      'voice profile': /LAYER 2.*?VOICE PROFILE/s,
      'viral patterns': /LAYER 3.*?VIRAL PATTERNS/s,
      'niche context': /LAYER 4.*?NICHE CONTEXT/s,
      'examples': /LAYER 5.*?EXAMPLES/s,
      'task instructions': /LAYER 6.*?YOUR SPECIFIC TASK/s,
      'safety guidelines': /CONTENT SAFETY|SAFETY REQUIREMENTS/i,
      'output format': /OUTPUT FORMAT/i,
      'what to avoid': /WHAT TO AVOID|WHAT NOT TO DO/i,
      'authenticity requirements': /AUTHENTICITY|AUTHENTIC/i,
    };

    for (const [component, pattern] of Object.entries(components)) {
      if (pattern.test(prompt)) {
        score += 10;
      } else {
        console.log(`[PromptConstructorService] Missing component: ${component}`);
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate quality improvement recommendations
   */
  private generateQualityRecommendations(
    tokenCount: number,
    redundancyScore: number,
    clarityScore: number,
    completenessScore: number
  ): string[] {
    const recommendations: string[] = [];

    // Token count recommendations
    if (tokenCount > 8500) {
      recommendations.push('Prompt exceeds optimal length - apply optimization to reduce token count');
    } else if (tokenCount < 7000) {
      recommendations.push('Prompt may be too brief - consider adding more context or examples');
    }

    // Redundancy recommendations
    if (redundancyScore < 70) {
      recommendations.push('High redundancy detected - remove duplicate instructions or examples');
    }

    // Clarity recommendations
    if (clarityScore < 70) {
      recommendations.push('Clarity could be improved - add more structure, headers, and visual separators');
    }

    // Completeness recommendations
    if (completenessScore < 80) {
      recommendations.push('Prompt may be incomplete - ensure all 6 layers are present with essential components');
    }

    if (recommendations.length === 0) {
      recommendations.push('Prompt quality is excellent - no improvements needed');
    }

    return recommendations;
  }

  // ============================================================================
  // CONTEXT LOADING METHODS
  // ============================================================================

  /**
   * Load voice profile with error handling
   */
  private async loadVoiceProfile(userId: string, workspaceId: string): Promise<VoiceProfile | null> {
    try {
      if (!this.voiceProfileService) {
        console.warn('[PromptConstructorService] VoiceProfileService not available');
        return null;
      }
      return await this.voiceProfileService.getProfile(userId, workspaceId);
    } catch (error) {
      console.error('[PromptConstructorService] Error loading voice profile:', error);
      return null;
    }
  }

  /**
   * Load viral patterns with error handling
   */
  private async loadViralPatterns(niche: string, postType: 'post' | 'story' | 'reel'): Promise<ViralPattern[]> {
    try {
      return await viralPatternService.getRelevantPatterns(niche, postType, 3);
    } catch (error) {
      console.error('[PromptConstructorService] Error loading viral patterns:', error);
      return [];
    }
  }

  /**
   * Load viral hooks with error handling
   */
  private async loadViralHooks(niche: string): Promise<ViralHook[]> {
    try {
      return await viralPatternService.getViralHooks(niche, 5);
    } catch (error) {
      console.error('[PromptConstructorService] Error loading viral hooks:', error);
      return [];
    }
  }

  /**
   * Load niche context with error handling
   */
  private async loadNicheContext(niche: string): Promise<NicheContext | null> {
    try {
      return await nicheContextService.getNicheContext(niche);
    } catch (error) {
      console.error('[PromptConstructorService] Error loading niche context:', error);
      return null;
    }
  }

  /**
   * Load example captions with error handling
   */
  private async loadExamples(niche: string, postType: string): Promise<ExampleCaption[]> {
    try {
      return await exampleCaptionService.getExamplesForGeneration(niche, postType, 3);
    } catch (error) {
      console.error('[PromptConstructorService] Error loading examples:', error);
      return [];
    }
  }
}

// Export singleton instance
export const promptConstructorService = new PromptConstructorService();
