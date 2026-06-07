/**
 * ExampleCaptionService
 * 
 * Service for managing the example caption library used in authentic Instagram caption generation.
 * Provides high-performing real captions as few-shot learning samples for AI generation.
 * 
 * Requirements: 7.1, 7.2, 7.3
 */

import { ExampleCaptionModel, IExampleCaption } from '../models/AI/ExampleCaption';
import type { ExampleCaption, InsertExampleCaption } from '../domain/types';

export interface ExampleCaptionMetrics {
  engagementRate: number;
  likes: number;
  comments: number;
  saves: number;
}

export interface ExtractedPatterns {
  hookStructure: string;
  storytellingTechnique: string;
  engagementFormat: string;
}

export class ExampleCaptionService {
  /**
   * Get high-performing examples for few-shot learning
   * 
   * Requirements: 7.1, 7.2
   * Retrieves verified, high-engagement examples from the specified niche and post type
   * to provide as context for AI caption generation.
   * 
   * @param niche - Content niche (fitness, food, travel, etc.)
   * @param postType - Type of post (post, story, reel)
   * @param limit - Maximum number of examples to return
   * @returns Array of high-performing example captions
   */
  async getExamplesForGeneration(
    niche: string,
    postType: string,
    limit: number = 3
  ): Promise<ExampleCaption[]> {
    try {
      // Query for verified, high-engagement examples
      // Prioritize verified captions, then sort by engagement rate
      const examples = await ExampleCaptionModel.find({
        niche,
        postType,
      })
        .sort({ 
          verified: -1,       // Verified first
          engagementRate: -1  // Then by engagement rate
        })
        .limit(limit)
        .lean()
        .exec();

      // Convert MongoDB documents to domain types
      return examples.map(this.convertToExampleCaption);
    } catch (error) {
      console.error('Error fetching examples for generation:', error);
      throw new Error('Failed to retrieve example captions');
    }
  }

  /**
   * Add caption from user's successful content
   * 
   * Requirements: 7.3
   * Stores successful user-generated captions in the library for learning and
   * future few-shot examples.
   * 
   * @param userId - User ID who created the caption
   * @param caption - The successful caption text
   * @param metrics - Engagement metrics (engagementRate, likes, comments, saves)
   * @param niche - Content niche
   * @param postType - Type of post
   */
  async addUserExample(
    userId: string,
    caption: string,
    metrics: ExampleCaptionMetrics,
    niche: string,
    postType: 'post' | 'story' | 'reel'
  ): Promise<void> {
    try {
      // Analyze caption characteristics
      const characteristics = this.analyzeCaption(caption);

      const exampleData: Partial<IExampleCaption> = {
        caption,
        source: 'user',
        userId,
        niche,
        postType,
        style: characteristics.style,
        engagementRate: metrics.engagementRate,
        likes: metrics.likes,
        comments: metrics.comments,
        saves: metrics.saves,
        shares: 0, // Not tracked in current metrics
        captionLength: caption.length,
        hookType: characteristics.hookType,
        hasQuestion: characteristics.hasQuestion,
        hasEmoji: characteristics.hasEmoji,
        emojiCount: characteristics.emojiCount,
        capturedAt: new Date(),
        verified: false, // User examples need manual verification
      };

      await ExampleCaptionModel.create(exampleData);
    } catch (error) {
      console.error('Error adding user example:', error);
      throw new Error('Failed to add user example caption');
    }
  }

  /**
   * Extract patterns from example caption
   * 
   * Requirements: 7.4, 7.6
   * Analyzes a caption to identify successful patterns including hook structure,
   * storytelling technique, and engagement format. These patterns are used to
   * inform AI caption generation while adapting to the user's unique voice.
   * 
   * Pattern extraction helps the AI understand:
   * - What type of opening hook captures attention (POV, question, controversial, etc.)
   * - How the story unfolds (problem-solution, chronological, emotional journey, etc.)
   * - How engagement is driven (direct question, poll, CTA, etc.)
   * 
   * @param caption - Example caption to analyze
   * @returns Extracted patterns including hookStructure, storytellingTechnique, engagementFormat
   */
  async extractPatterns(caption: ExampleCaption): Promise<ExtractedPatterns> {
    try {
      const text = caption.caption;
      
      // Extract hook structure (first 1-2 sentences)
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const hookStructure = sentences.length > 0 
        ? this.categorizeHook(sentences[0].trim())
        : 'unknown';

      // Determine storytelling technique
      const storytellingTechnique = this.identifyStorytellingTechnique(text);

      // Determine engagement format
      const engagementFormat = this.identifyEngagementFormat(text);

      return {
        hookStructure,
        storytellingTechnique,
        engagementFormat,
      };
    } catch (error) {
      console.error('Error extracting patterns:', error);
      throw new Error('Failed to extract patterns from example caption');
    }
  }

  /**
   * Get pattern statistics from a collection of examples
   * 
   * Requirements: 7.4
   * Analyzes multiple captions to identify the most common successful patterns
   * in a given niche. This helps understand what works best for specific audiences.
   * 
   * @param niche - Content niche to analyze
   * @param postType - Type of post (optional, analyzes all if not provided)
   * @returns Statistics about common patterns
   */
  async getPatternStatistics(
    niche: string,
    postType?: string
  ): Promise<{
    topHooks: Array<{ hook: string; count: number; avgEngagement: number }>;
    topStorytellingTechniques: Array<{ technique: string; count: number; avgEngagement: number }>;
    topEngagementFormats: Array<{ format: string; count: number; avgEngagement: number }>;
  }> {
    try {
      const query: any = { niche, verified: true };
      if (postType) {
        query.postType = postType;
      }

      const examples = await ExampleCaptionModel.find(query).lean().exec();
      
      // Aggregate pattern statistics
      const hookStats = new Map<string, { count: number; totalEngagement: number }>();
      const storyStats = new Map<string, { count: number; totalEngagement: number }>();
      const engagementStats = new Map<string, { count: number; totalEngagement: number }>();

      for (const example of examples) {
        const patterns = await this.extractPatterns(this.convertToExampleCaption(example));
        
        // Track hook patterns
        const hookData = hookStats.get(patterns.hookStructure) || { count: 0, totalEngagement: 0 };
        hookData.count++;
        hookData.totalEngagement += example.engagementRate;
        hookStats.set(patterns.hookStructure, hookData);

        // Track storytelling patterns
        const storyData = storyStats.get(patterns.storytellingTechnique) || { count: 0, totalEngagement: 0 };
        storyData.count++;
        storyData.totalEngagement += example.engagementRate;
        storyStats.set(patterns.storytellingTechnique, storyData);

        // Track engagement patterns
        const engagementData = engagementStats.get(patterns.engagementFormat) || { count: 0, totalEngagement: 0 };
        engagementData.count++;
        engagementData.totalEngagement += example.engagementRate;
        engagementStats.set(patterns.engagementFormat, engagementData);
      }

      // Convert to sorted arrays
      const topHooks = Array.from(hookStats.entries())
        .map(([hook, data]) => ({
          hook,
          count: data.count,
          avgEngagement: data.totalEngagement / data.count,
        }))
        .sort((a, b) => b.avgEngagement - a.avgEngagement);

      const topStorytellingTechniques = Array.from(storyStats.entries())
        .map(([technique, data]) => ({
          technique,
          count: data.count,
          avgEngagement: data.totalEngagement / data.count,
        }))
        .sort((a, b) => b.avgEngagement - a.avgEngagement);

      const topEngagementFormats = Array.from(engagementStats.entries())
        .map(([format, data]) => ({
          format,
          count: data.count,
          avgEngagement: data.totalEngagement / data.count,
        }))
        .sort((a, b) => b.avgEngagement - a.avgEngagement);

      return {
        topHooks,
        topStorytellingTechniques,
        topEngagementFormats,
      };
    } catch (error) {
      console.error('Error getting pattern statistics:', error);
      throw new Error('Failed to get pattern statistics');
    }
  }

  /**
   * Analyze caption characteristics
   * 
   * Private method to extract structural and stylistic features from a caption.
   * 
   * @param caption - Caption text to analyze
   * @returns Object with caption characteristics
   */
  private analyzeCaption(caption: string) {
    // Detect emojis (Unicode emoji ranges)
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojis = caption.match(emojiRegex) || [];
    const hasEmoji = emojis.length > 0;
    const emojiCount = emojis.length;

    // Detect questions
    const hasQuestion = caption.includes('?');

    // Determine hook type based on first few words
    const firstWords = caption.split(/\s+/).slice(0, 5).join(' ').toLowerCase();
    let hookType = 'standard';
    
    if (firstWords.includes('pov:') || firstWords.includes('pov ')) {
      hookType = 'pov';
    } else if (firstWords.includes('hot take:') || firstWords.includes('unpopular opinion')) {
      hookType = 'hot-take';
    } else if (firstWords.match(/\d+\s+(ways|tips|reasons|things)/)) {
      hookType = 'list';
    } else if (hasQuestion && caption.indexOf('?') < 100) {
      hookType = 'question';
    } else if (firstWords.includes('storytime') || firstWords.includes('story time')) {
      hookType = 'story';
    }

    // Determine style based on caption structure
    let style = 'conversational';
    
    if (caption.split('\n\n').length > 3) {
      style = 'storytelling';
    } else if (hasQuestion && caption.length < 200) {
      style = 'question-based';
    } else if (caption.match(/\d+[.)]\s+/g)) {
      style = 'list-format';
    } else if (caption.split('.').length > 5) {
      style = 'educational';
    }

    return {
      hasEmoji,
      emojiCount,
      hasQuestion,
      hookType,
      style,
    };
  }

  /**
   * Categorize hook type
   * 
   * Requirements: 7.4
   * Identifies the type of opening hook used in a caption to understand
   * successful engagement strategies.
   * 
   * @param hookText - First sentence of caption
   * @returns Hook category
   */
  private categorizeHook(hookText: string): string {
    const lower = hookText.toLowerCase();
    
    // POV hooks - perspective-based storytelling
    if (lower.startsWith('pov:') || lower.startsWith('pov ')) {
      return 'POV hook';
    }
    
    // Controversial/opinion hooks
    if (lower.includes('hot take') || lower.includes('unpopular opinion') || 
        lower.includes('controversial') || lower.includes('let\'s be real')) {
      return 'controversial hook';
    }
    
    // List/numbered hooks
    if (lower.match(/\d+\s+(ways|tips|reasons|things|secrets|hacks|mistakes)/)) {
      return 'list hook';
    }
    
    // Question hooks - direct engagement
    if (hookText.includes('?')) {
      return 'question hook';
    }
    
    // Story/narrative hooks
    if (lower.includes('story') || lower.includes('once ') || 
        lower.includes('remember when') || lower.match(/^(yesterday|today|last week|this morning)/)) {
      return 'story hook';
    }
    
    // Visualization/imagination hooks
    if (lower.includes('imagine') || lower.includes('picture') || 
        lower.includes('visualize') || lower.includes('think about')) {
      return 'visualization hook';
    }
    
    // Quote hooks - starting with quotation
    if (lower.startsWith('"') || lower.startsWith('"')) {
      return 'quote hook';
    }
    
    // Challenge/call-out hooks
    if (lower.includes('stop ') || lower.includes('enough ') || 
        lower.includes('why you') || lower.includes('you need to')) {
      return 'challenge hook';
    }
    
    // Relatable/confession hooks
    if (lower.includes('confession:') || lower.includes('truth:') || 
        lower.includes('reality:') || lower.includes('admit it')) {
      return 'confession hook';
    }
    
    // How-to/tutorial hooks
    if (lower.match(/^how (to|i|you)/)) {
      return 'how-to hook';
    }
    
    return 'direct statement';
  }

  /**
   * Identify storytelling technique
   * 
   * Requirements: 7.4
   * Analyzes the narrative structure of a caption to identify
   * storytelling patterns that drive engagement.
   * 
   * @param text - Full caption text
   * @returns Storytelling technique category
   */
  private identifyStorytellingTechnique(text: string): string {
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
    const lower = text.toLowerCase();
    
    // Check for problem-solution structure (most specific, check first)
    // This is a high-engagement pattern showing transformation
    if (text.match(/(struggled|problem|issue|challenge|difficulty|failed).+(then|now|discovered|realized|found|solution|fixed|solved)/gis)) {
      return 'problem-solution';
    }
    
    // Before/after transformation stories
    if (lower.match(/(before|used to|old me).+(after|now|today|current|new me)/)) {
      return 'transformation';
    }
    
    // Chronological storytelling with time markers
    if (text.match(/(first|then|next|finally|after|before|later|eventually)/gi)) {
      return 'chronological';
    }
    
    // Emotional journey - focuses on feelings and realizations
    if (text.match(/(felt|feeling|emotional|realized|learned|discovered|understood)/gi)) {
      return 'emotional-journey';
    }
    
    // Comparison/contrast structure (A vs B)
    if (lower.match(/(vs\.|versus|compared to|rather than|instead of)/)) {
      return 'comparison';
    }
    
    // List format - enumerated points
    if (text.match(/\d+[.)]\s+/g) || paragraphs.length > 3) {
      return 'list-format';
    }
    
    // Anecdote - personal story with specific time reference
    if (text.match(/(remember when|one time|last week|yesterday|this morning|the other day)/gi)) {
      return 'anecdote';
    }
    
    // Behind-the-scenes - process revelation
    if (lower.match(/(behind the scenes|truth is|what you don't see|reality)/)) {
      return 'behind-the-scenes';
    }
    
    // Myth-busting - addressing misconceptions
    if (lower.match(/(myth|misconception|actually|contrary to|surprised|didn't know)/)) {
      return 'myth-busting';
    }
    
    return 'linear';
  }

  /**
   * Identify engagement format
   * 
   * Requirements: 7.4
   * Determines how a caption drives audience engagement and participation,
   * which is critical for Instagram algorithm performance.
   * 
   * @param text - Full caption text
   * @returns Engagement format category
   */
  private identifyEngagementFormat(text: string): string {
    const lower = text.toLowerCase();
    
    // Direct question - asks audience explicitly
    if (lower.match(/what (do you|about you|are your|would you)/)) {
      return 'direct-question';
    }
    
    // Poll/choice - binary or multiple choice engagement
    if (lower.match(/(a or b|option \d|which one|team \w+|yes or no)/)) {
      return 'poll-choice';
    }
    
    // Tag/share - viral spread mechanism
    if (lower.match(/(tag someone|share this|send this to|mention|tag a friend)/)) {
      return 'tag-share';
    }
    
    // Comment CTA - explicit call to comment
    if (lower.match(/(comment|let me know|tell me|drop|share your|leave a|write)/)) {
      return 'comment-cta';
    }
    
    // Double-tap/like request
    if (lower.match(/(double tap|like if|hit that like|tap if you agree)/)) {
      return 'like-cta';
    }
    
    // Save/bookmark CTA - high-value engagement signal
    if (lower.match(/(save this|bookmark|come back to|reference later)/)) {
      return 'save-cta';
    }
    
    // DM/direct engagement
    if (lower.match(/(dm me|send me a message|message me|slide into|inbox)/)) {
      return 'dm-cta';
    }
    
    // Completion/fill-in-the-blank - interactive format
    if (lower.match(/(finish this|complete the|fill in|blank)/)) {
      return 'completion';
    }
    
    // Agree/disagree - polarizing engagement
    if (lower.match(/(agree|disagree|thoughts|yay or nay|hot take)/)) {
      return 'opinion-request';
    }
    
    // Thought-provoking - deeper reflection
    if (lower.match(/(think about|consider|reflect|ponder|wonder)/)) {
      return 'thought-provoking';
    }
    
    // Story continuation - "swipe for more"
    if (lower.match(/(swipe|slide|next|continue|more)/)) {
      return 'continuation';
    }
    
    return 'open-ended';
  }

  /**
   * Convert MongoDB document to domain type
   * 
   * @param doc - MongoDB document
   * @returns ExampleCaption domain object
   */
  private convertToExampleCaption(doc: any): ExampleCaption {
    return {
      id: doc._id.toString(),
      caption: doc.caption,
      source: doc.source,
      sourceAccount: doc.sourceAccount,
      userId: doc.userId,
      niche: doc.niche,
      postType: doc.postType,
      style: doc.style,
      engagementRate: doc.engagementRate,
      likes: doc.likes,
      comments: doc.comments,
      saves: doc.saves,
      shares: doc.shares,
      captionLength: doc.captionLength,
      hookType: doc.hookType,
      hasQuestion: doc.hasQuestion,
      hasEmoji: doc.hasEmoji,
      emojiCount: doc.emojiCount,
      capturedAt: doc.capturedAt,
      verified: doc.verified,
    };
  }
}

// Export singleton instance
export const exampleCaptionService = new ExampleCaptionService();
