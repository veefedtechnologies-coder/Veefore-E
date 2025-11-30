import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PerformanceSnapshotService, PerformanceComparison } from './performance-snapshot-service';

/*
<important_code_snippet_instructions>
The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
If the user doesn't specify a model, always prefer using "claude-sonnet-4-20250514" as it is the latest model.
</important_code_snippet_instructions>
*/

// <important_do_not_delete>
const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";
// </important_do_not_delete>

// Lazy-load clients
let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }
  return anthropic;
}

function getOpenAI(): OpenAI {
  if (!openai && process.env.OPENAI_API_KEY) {
    console.log('[AI STORY] 🔑 Initializing OpenAI client with API key (length:', process.env.OPENAI_API_KEY.length, 'chars)');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  if (!openai) {
    console.error('[AI STORY] ❌ OpenAI API key not configured! process.env.OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'exists' : 'MISSING');
    throw new Error('OpenAI API key not configured');
  }
  return openai;
}

export interface AIStory {
  id: string;
  emoji: string;
  title: string;
  story: string;
  working: string;       // What's working well
  attention: string;     // What needs attention
  suggestion: string;    // Actionable suggestion
  priority: 'high' | 'medium' | 'low';
  confidence: number;
}

export interface TrendAnalysis {
  isGrowing: boolean;
  isSteady: boolean;
  isDeclining: boolean;
  majorChanges: PerformanceComparison[];
  moderateChanges: PerformanceComparison[];
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
}

export class AIStoryGenerator {
  private snapshotService: PerformanceSnapshotService;

  constructor(snapshotService: PerformanceSnapshotService) {
    this.snapshotService = snapshotService;
  }

  /**
   * Generate AI-powered story banners with real trend analysis
   */
  async generateStoriesForPeriod(
    workspaceId: string,
    socialAccountId: string,
    period: 'day' | 'week' | 'month',
    currentMetrics: any,
    username: string
  ): Promise<AIStory[]> {
    try {
      console.log(`[AI STORY] Generating stories for @${username}, period: ${period}`);

      // Get snapshot comparison data
      const comparison = await this.snapshotService.getSnapshotsWithComparison(
        workspaceId,
        socialAccountId,
        period
      );

      // Analyze trends
      const trends = this.analyzeTrends(comparison);

      // Build comprehensive analysis prompt
      const prompt = this.buildAnalysisPrompt(
        currentMetrics,
        comparison,
        trends,
        period,
        username
      );

      // Generate AI stories
      const stories = await this.generateAIStories(prompt, period, username);

      console.log(`[AI STORY] Generated ${stories.length} stories for @${username}`);
      return stories;
    } catch (error: any) {
      console.error(`[AI STORY] Error generating stories:`, error.message);
      // Return fallback stories
      return this.generateFallbackStories(currentMetrics, period, username);
    }
  }

  /**
   * Analyze performance trends from comparison data
   */
  private analyzeTrends(comparison: any): TrendAnalysis {
    const { comparisons } = comparison;

    if (!comparisons || comparisons.length === 0) {
      return {
        isGrowing: false,
        isSteady: true,
        isDeclining: false,
        majorChanges: [],
        moderateChanges: [],
        strengths: [],
        weaknesses: [],
        opportunities: []
      };
    }

    const majorChanges = comparisons.filter((c: PerformanceComparison) => c.significance === 'major');
    const moderateChanges = comparisons.filter((c: PerformanceComparison) => c.significance === 'moderate');

    const upTrends = comparisons.filter((c: PerformanceComparison) => c.trend === 'up');
    const downTrends = comparisons.filter((c: PerformanceComparison) => c.trend === 'down');

    const isGrowing = upTrends.length > downTrends.length && majorChanges.some((c: PerformanceComparison) => c.trend === 'up');
    const isDeclining = downTrends.length > upTrends.length && majorChanges.some((c: PerformanceComparison) => c.trend === 'down');
    const isSteady = !isGrowing && !isDeclining;

    // Identify strengths (positive changes)
    const strengths = comparisons
      .filter((c: PerformanceComparison) => c.trend === 'up' && c.significance !== 'minor')
      .map((c: PerformanceComparison) => `${c.metric}: +${c.changePercent.toFixed(1)}%`)
      .slice(0, 3);

    // Identify weaknesses (negative changes)
    const weaknesses = comparisons
      .filter((c: PerformanceComparison) => c.trend === 'down' && c.significance !== 'minor')
      .map((c: PerformanceComparison) => `${c.metric}: ${c.changePercent.toFixed(1)}%`)
      .slice(0, 3);

    // Identify opportunities (areas with potential)
    const opportunities = comparisons
      .filter((c: PerformanceComparison) => c.current < c.previous || c.significance === 'minor')
      .map((c: PerformanceComparison) => c.metric)
      .slice(0, 2);

    return {
      isGrowing,
      isSteady,
      isDeclining,
      majorChanges,
      moderateChanges,
      strengths,
      weaknesses,
      opportunities
    };
  }

  /**
   * Build comprehensive analysis prompt for AI
   */
  private buildAnalysisPrompt(
    currentMetrics: any,
    comparison: any,
    trends: TrendAnalysis,
    period: 'day' | 'week' | 'month',
    username: string
  ): string {
    const { current, previous, comparisons } = comparison;

    let periodContext = '';
    if (period === 'day') {
      periodContext = 'TODAY\'S PERFORMANCE - Focus on immediate tactical insights, daily momentum, and today\'s specific opportunities';
    } else if (period === 'week') {
      periodContext = 'THIS WEEK\'S PERFORMANCE - Focus on content patterns, weekly consistency, and short-term growth strategies';
    } else {
      periodContext = 'THIS MONTH\'S PERFORMANCE - Focus on strategic growth, long-term trends, and monthly planning opportunities';
    }

    let comparisonText = '';
    if (previous && comparisons && comparisons.length > 0) {
      comparisonText = `
PERFORMANCE COMPARISON (vs. previous ${period}):
${comparisons.map((c: PerformanceComparison) => 
  `- ${c.metric}: ${c.current.toLocaleString()} (${c.trend === 'up' ? '+' : ''}${c.changePercent.toFixed(1)}%, ${c.significance} change)`
).join('\n')}

TREND ANALYSIS:
- Overall Status: ${trends.isGrowing ? '📈 GROWING' : trends.isDeclining ? '📉 DECLINING' : '➡️ STEADY'}
- Strengths: ${trends.strengths.length > 0 ? trends.strengths.join(', ') : 'Building foundation'}
- Weaknesses: ${trends.weaknesses.length > 0 ? trends.weaknesses.join(', ') : 'None identified'}
- Growth Opportunities: ${trends.opportunities.length > 0 ? trends.opportunities.join(', ') : 'All metrics strong'}
- Major Changes: ${trends.majorChanges.length} significant shifts detected
`;
    } else {
      comparisonText = `
BASELINE METRICS (No previous data for comparison):
- This is early-stage growth tracking
- Focus on establishing consistent performance patterns
`;
    }

    // Calculate realistic benchmarks
    const isLowReach = currentMetrics.reach < currentMetrics.posts * 10; // Reach should be at least 10x posts
    const isLowFollowers = currentMetrics.followers < 100; // Under 100 is very small audience
    const isLowEngagement = currentMetrics.engagement < currentMetrics.reach * 0.05; // Under 5% of reach
    const postToFollowerRatio = currentMetrics.posts / Math.max(currentMetrics.followers, 1);
    const isOverposting = postToFollowerRatio > 3; // Posting more than 3x follower count

    let performanceContext = '';
    if (isLowFollowers && isLowReach) {
      performanceContext = '⚠️ EARLY STAGE / STRUGGLING: Very small audience and low reach. This account needs fundamental growth strategies.';
    } else if (trends.isDeclining) {
      performanceContext = '📉 DECLINING: Performance is dropping. Critical issues need immediate attention.';
    } else if (trends.isGrowing) {
      performanceContext = '📈 GROWING: Positive momentum detected. Keep optimizing what\'s working.';
    } else {
      performanceContext = '➡️ STEADY: Performance is stable but not growing. Time to experiment and scale.';
    }

    return `You are a BRUTALLY HONEST social media analyst. Your job is to tell the TRUTH, not sugarcoat bad performance.

ACCOUNT: @${username}
${periodContext}

CURRENT METRICS:
- Followers: ${currentMetrics.followers?.toLocaleString() || 0} ${isLowFollowers ? '⚠️ VERY LOW AUDIENCE' : ''}
- Posts: ${currentMetrics.posts || 0} ${isOverposting ? '⚠️ OVERPOSTING FOR AUDIENCE SIZE' : ''}
- Reach: ${currentMetrics.reach?.toLocaleString() || 0} ${isLowReach ? '⚠️ CRITICALLY LOW REACH' : ''}
- Engagement: ${currentMetrics.engagement?.toLocaleString() || 0} ${isLowEngagement ? '⚠️ LOW ENGAGEMENT' : ''}
- Engagement Rate: ${currentMetrics.engagementRate?.toFixed(2) || 0}%
- Likes: ${currentMetrics.likes?.toLocaleString() || 0}
- Comments: ${currentMetrics.comments?.toLocaleString() || 0}

PERFORMANCE ASSESSMENT:
${performanceContext}

${comparisonText}

REALITY CHECK:
- If followers < 100: This is a TINY audience - focus on GROWTH first
- If reach < posts × 10: Content distribution is FAILING - algorithm issues or bad content
- If reach is declining: Something is WRONG - Instagram is showing content to fewer people
- If followers not growing: Current strategy is NOT WORKING
- If posting 15 times but only reaching 2-4 people: This is EXTREMELY BAD - complete strategy overhaul needed

Generate exactly 3 HONEST story banners as a JSON array. NO FAKE POSITIVITY. Tell the TRUTH about performance:

${period === 'day' ? `
1. First story: TODAY'S REALITY - What actually happened today? (Use comparison data if available)
2. Second story: DAILY INSIGHT - What today's metrics reveal about immediate performance
3. Third story: TODAY'S ACTION - Specific steps to improve TODAY'S performance (not generic advice)
` : period === 'week' ? `
1. First story: WEEKLY REALITY - What's the actual weekly performance? (Use comparison data if available)
2. Second story: WEEKLY PATTERN - What this week's trends reveal about content strategy
3. Third story: WEEKLY ACTION - Specific steps to improve THIS WEEK'S performance (not generic advice)
` : `
1. First story: MONTHLY REALITY - What's the actual monthly performance? (Use comparison data if available)
2. Second story: MONTHLY TREND - What this month's data reveals about long-term strategy
3. Third story: MONTHLY ACTION - Specific steps to improve THIS MONTH'S performance (not generic advice)
`}

Each story must include:
- id: unique identifier
- emoji: Match the mood (🚀📈✨ for good, ⚠️💡🎯 for needs work, 📉⛔ for serious issues)
- title: HONEST headline (max 4 words) - "Growth Stalled", "Need More Reach", "Audience Too Small", etc.
- story: TRUTHFUL narrative (2-3 sentences with REAL numbers and comparison to previous ${period}) - ${period === 'day' ? 'focus on today\'s specific performance' : period === 'week' ? 'focus on this week\'s patterns and trends' : 'focus on this month\'s strategic performance'}
- working: If ANYTHING is actually working, mention it. If NOTHING is working, say "Nothing standing out yet - need to test new approaches"
- attention: Be SPECIFIC about the BIGGEST problem with NUMBERS - ${period === 'day' ? 'focus on today\'s critical issues' : period === 'week' ? 'focus on weekly challenges' : 'focus on monthly strategic gaps'}
- suggestion: ONE clear, specific action (not "post more" - be tactical) - ${period === 'day' ? 'what to do TODAY' : period === 'week' ? 'what to do THIS WEEK' : 'what to do THIS MONTH'}
- priority: 'high' (if metrics are bad), 'medium' (if declining), 'low' (if growing well)
- confidence: 0-100 (based on data quality and comparison availability)

TONE RULES:
- If metrics are BAD (low reach, low followers, declining): Be HONEST but CONSTRUCTIVE. Use words like "struggling", "needs improvement", "critical issue"
- If metrics are GOOD (growing, high engagement): Be POSITIVE and SPECIFIC about what's working
- If metrics are STEADY: Be NEUTRAL and focus on opportunities
- NEVER say "impressive" or "crushing it" unless there's ACTUAL growth or high performance vs. previous period
- ALWAYS compare current vs. previous ${period} when data is available - "up from X to Y" or "down from X to Y"

Return ONLY the JSON array, no other text:`;
  }

  /**
   * Generate AI stories using OpenAI/Claude
   */
  private async generateAIStories(
    prompt: string,
    period: string,
    username: string
  ): Promise<AIStory[]> {
    // Try OpenAI first (user preference)
    try {
      console.log(`[AI STORY] 🤖 Attempting OpenAI generation for @${username}, period: ${period}...`);
      console.log(`[AI STORY] 🔑 Checking OpenAI API key...`);
      
      const openaiClient = getOpenAI();
      console.log(`[AI STORY] ✅ OpenAI client created successfully`);
      
      const response = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert social media analyst. Provide responses in valid JSON format only. Generate unique, insightful stories based on the metrics provided."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      const responseText = response.choices[0].message.content || '[]';
      const stories = JSON.parse(responseText);
      
      console.log(`[AI STORY] ✅ OpenAI generated ${stories.length} stories`);
      return this.validateStories(stories);
    } catch (openaiError: any) {
      console.error(`[AI STORY] ❌ OpenAI failed:`, openaiError.message);
      
      // Fallback to Claude if available
      try {
        console.log(`[AI STORY] Trying Claude fallback...`);
        const response = await getAnthropic().messages.create({
          model: DEFAULT_MODEL_STR,
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        });

        const responseText = response.content[0].text;
        const stories = JSON.parse(responseText);
        
        console.log(`[AI STORY] Claude generated ${stories.length} stories`);
        return this.validateStories(stories);
      } catch (claudeError: any) {
        console.error(`[AI STORY] Both AI services failed. OpenAI: ${openaiError.message}, Claude: ${claudeError.message}`);
        throw new Error(`AI generation failed: ${openaiError.message}`);
      }
    }
  }

  /**
   * Validate and normalize AI-generated stories
   */
  private validateStories(stories: any[]): AIStory[] {
    return stories.map((story, index) => ({
      id: story.id || `story-${index}-${Date.now()}`,
      emoji: story.emoji || '📊',
      title: story.title || 'Performance Update',
      story: story.story || 'Analyzing your account performance...',
      working: story.working || 'Building consistent presence',
      attention: story.attention || 'Monitor key metrics regularly',
      suggestion: story.suggestion || 'Keep posting quality content consistently',
      priority: story.priority || 'medium',
      confidence: story.confidence || 75
    }));
  }

  /**
   * Generate fallback stories when AI is unavailable
   */
  private generateFallbackStories(
    currentMetrics: any,
    period: string,
    username: string
  ): AIStory[] {
    const followers = currentMetrics.followers || 0;
    const reach = currentMetrics.reach || 0;
    const engagement = currentMetrics.engagement || 0;
    const engagementRate = currentMetrics.engagementRate || 0;
    const posts = currentMetrics.posts || 0;

    // Realistic assessment
    const isLowFollowers = followers < 100;
    const isLowReach = reach < posts * 10;
    const isVeryLowReach = reach < posts * 2;
    const isCritical = isLowFollowers && isVeryLowReach;

    // Period-specific context
    const periodContext = {
      day: {
        timeframe: 'today',
        focus: 'daily performance',
        urgency: 'immediate',
        scope: 'today\'s specific results',
        action: 'today'
      },
      week: {
        timeframe: 'this week',
        focus: 'weekly patterns',
        urgency: 'short-term',
        scope: 'weekly trends and consistency',
        action: 'this week'
      },
      month: {
        timeframe: 'this month',
        focus: 'monthly strategy',
        urgency: 'long-term',
        scope: 'monthly growth and planning',
        action: 'this month'
      }
    };

    const context = periodContext[period as keyof typeof periodContext] || periodContext.month;

    const stories: AIStory[] = [
      {
        id: `fallback-reality-${period}-${Date.now()}`,
        emoji: isCritical ? '⚠️' : isVeryLowReach ? '📉' : isLowReach ? '💡' : '📊',
        title: isCritical ? `${context.timeframe.charAt(0).toUpperCase() + context.timeframe.slice(1)} Crisis` : 
               isVeryLowReach ? `${context.timeframe.charAt(0).toUpperCase() + context.timeframe.slice(1)} Visibility Issue` : 
               isLowFollowers ? `${context.timeframe.charAt(0).toUpperCase() + context.timeframe.slice(1)} Audience` : 
               `${context.timeframe.charAt(0).toUpperCase() + context.timeframe.slice(1)} Performance`,
        story: `@${username} has ${followers.toLocaleString()} followers with ${posts} posts ${context.timeframe}. ${isVeryLowReach ? `Critical issue: Only ${reach} people reached despite ${posts} posts ${context.timeframe}. This means Instagram's algorithm isn't showing your content ${context.timeframe}.` : isLowReach ? `Reach of ${reach} is low for ${posts} posts ${context.timeframe} - ${context.focus} needs improvement.` : `Reach of ${reach.toLocaleString()} is moderate ${context.timeframe} but could be better.`}`,
        working: isCritical ? `Posting consistently (${posts} posts ${context.timeframe}) - that's the foundation` : engagementRate > 10 ? `${engagementRate.toFixed(1)}% engagement shows your followers are engaged ${context.timeframe}` : `Some audience interaction happening ${context.timeframe}`,
        attention: isVeryLowReach ? `Only ${reach} people seeing ${posts} posts ${context.timeframe} - Instagram algorithm is the main blocker` : isLowFollowers ? `${followers} followers is very small ${context.timeframe} - this limits reach significantly` : `Content reach needs to scale with your posting effort ${context.timeframe}`,
        suggestion: isVeryLowReach ? `Switch to Reels (90% of reach), use 5-10 trending hashtags, post at 8-11am or 7-9pm` : isLowFollowers ? `Collaborate with similar accounts, use location tags, engage with 50+ accounts daily` : `Test Reels vs. Posts to see what gets better reach`,
        priority: isCritical ? 'high' : 'medium',
        confidence: 70
      },
      {
        id: `fallback-engagement-${period}-${Date.now()}`,
        emoji: engagementRate > 10 ? '💬' : '⏱️',
        title: engagementRate > 10 ? `${context.timeframe.charAt(0).toUpperCase() + context.timeframe.slice(1)} Engagement` : `${context.timeframe.charAt(0).toUpperCase() + context.timeframe.slice(1)} Interaction`,
        story: `${followers} followers generated ${engagement.toLocaleString()} total engagements ${context.timeframe}. ${engagementRate > 10 ? `This ${engagementRate.toFixed(1)}% engagement rate is solid ${context.timeframe} - your followers are active.` : `With ${engagementRate.toFixed(1)}% engagement ${context.timeframe}, most followers aren't interacting.`}`,
        working: engagement > 50 ? `Getting ${engagement} interactions ${context.timeframe} shows some content resonance` : `Followers are following but not engaging much ${context.timeframe}`,
        attention: engagementRate < 5 ? `${engagementRate.toFixed(1)}% engagement is too low ${context.timeframe} - content isn't prompting interaction` : `Engagement could be higher ${context.timeframe} with better CTAs`,
        suggestion: engagementRate < 5 ? `End posts with questions, create polls in Stories, ask followers to tag friends` : `Add clear calls-to-action: "Double tap if you agree" or "Comment your thoughts"`,
        priority: engagementRate < 5 ? 'high' : 'medium',
        confidence: 75
      },
      {
        id: `fallback-action-${period}-${Date.now()}`,
        emoji: isLowFollowers ? '🎯' : '🚀',
        title: isLowFollowers ? `${context.timeframe.charAt(0).toUpperCase() + context.timeframe.slice(1)} Growth` : `${context.timeframe.charAt(0).toUpperCase() + context.timeframe.slice(1)} Strategy`,
        story: `With ${followers.toLocaleString()} followers and ${posts} posts ${context.timeframe}, ${isLowFollowers ? `you're in early growth stage ${context.timeframe}. The priority is building your audience base to unlock better reach.` : `you have a foundation ${context.timeframe}. Focus on converting reach into followers.`}`,
        working: posts > 10 ? `Posting ${posts} times ${context.timeframe} shows commitment to content creation` : `Consistent posting is happening ${context.timeframe}`,
        attention: isLowFollowers ? `${followers} followers means limited network effects ${context.timeframe} - each new follower matters a lot` : `Follower growth rate needs to accelerate ${context.timeframe}`,
        suggestion: isLowFollowers ? `Follow 50-100 accounts in your niche daily, comment genuinely on their posts, use niche hashtags` : `Create shareable content (tips, quotes, tutorials) that followers want to repost`,
        priority: isLowFollowers ? 'high' : 'medium',
        confidence: 72
      }
    ];

    return stories;
  }
}


