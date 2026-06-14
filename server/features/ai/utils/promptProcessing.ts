/**
 * AI Utility: Prompt Processing
 * 
 * Provides reusable utilities for building AI prompts, injecting context,
 * and managing prompt templates across all AI services.
 * 
 * Requirements: 12.4 (prompt processing utilities)
 */

export interface PromptTemplate {
  systemContext: string;
  userPrompt: string;
  metadata?: Record<string, any>;
}

export interface ContextInjectionParams {
  aiPersona?: string;
  captionStyle?: string;
  responseLength?: string;
  multilingual?: string;
  aiMemory?: string;
  optimizationGoals?: string;
  contentSafety?: string;
}

export interface CaptionPromptParams {
  topic: string;
  platform?: string;
  postType?: 'post' | 'story' | 'reel';
  mediaAnalysis?: string;
  existingCaption?: string;
  autoHashtags?: boolean;
  style?: 'viral' | 'authentic' | 'balanced';
}

export interface ScriptPromptParams {
  prompt: string;
  platform?: string;
  contentType?: string;
  style?: string;
  duration?: string | number;
  dimensions?: {
    width?: number;
    height?: number;
    ratio?: string;
  };
}

/**
 * Builds a global system context that can be injected into any AI prompt
 * to enforce brand guidelines, persona, and user preferences
 */
export function buildSystemContext(context: ContextInjectionParams): string {
  const parts: string[] = ['[SYSTEM CONFIGURATION OVERRIDE]'];
  
  if (context.aiPersona) {
    parts.push(`- Persona: ${context.aiPersona}`);
  }
  
  if (context.captionStyle) {
    parts.push(`- Tone/Style: ${context.captionStyle}`);
  }
  
  if (context.responseLength) {
    parts.push(`- Response Length constraint: ${context.responseLength}`);
  }
  
  if (context.multilingual && context.multilingual !== 'auto') {
    parts.push(`- Target Language: ${context.multilingual}`);
  }
  
  if (context.aiMemory === 'long-term') {
    parts.push('- Memory Context: Retain continuity with typical brand interactions.');
  }
  
  if (context.optimizationGoals) {
    parts.push(`- Optimization Goal: ${context.optimizationGoals}`);
  }
  
  if (context.contentSafety) {
    parts.push(`- Content Safety Level: ${context.contentSafety}`);
  }
  
  parts.push('[/SYSTEM CONFIGURATION OVERRIDE]\n\n');
  
  return parts.join('\n');
}

/**
 * Applies system context to a user prompt
 */
export function injectSystemContext(
  userPrompt: string,
  context: ContextInjectionParams
): string {
  const systemContext = buildSystemContext(context);
  return systemContext + userPrompt;
}

/**
 * Builds a complete prompt template for Instagram caption generation
 */
export function buildCaptionPrompt(params: CaptionPromptParams): PromptTemplate {
  const {
    topic,
    platform = 'Instagram',
    postType = 'post',
    mediaAnalysis,
    existingCaption,
    autoHashtags = true,
    style = 'balanced'
  } = params;

  let systemContext = `You are a professional social media manager creating content for ${platform}.`;
  
  // Add style-specific instructions
  if (style === 'viral') {
    systemContext += `\nStyle: VIRAL - Create attention-grabbing content optimized for maximum reach and engagement.`;
    systemContext += `\n- Use trending phrases and hooks`;
    systemContext += `\n- Create curiosity gaps that drive clicks`;
    systemContext += `\n- Include viral content patterns`;
  } else if (style === 'authentic') {
    systemContext += `\nStyle: AUTHENTIC - Create genuine, relatable content that sounds human-written.`;
    systemContext += `\n- Use conversational language`;
    systemContext += `\n- Avoid AI tells and generic phrases`;
    systemContext += `\n- Sound like a real person sharing their experience`;
  } else {
    systemContext += `\nStyle: BALANCED - Create engaging content that balances authenticity with viral potential.`;
    systemContext += `\n- Mix authentic voice with strategic engagement tactics`;
    systemContext += `\n- Sound natural while optimizing for performance`;
  }

  let userPrompt = `Create an engaging ${postType} caption about: "${topic}"`;
  
  if (mediaAnalysis) {
    userPrompt += `\n\nMedia Context: ${mediaAnalysis}`;
  }
  
  if (existingCaption) {
    userPrompt += `\n\nExisting Caption (for reference/improvement): ${existingCaption}`;
  }
  
  if (autoHashtags) {
    userPrompt += `\n\nInclude 5-8 relevant trending hashtags at the end of the caption.`;
  }
  
  userPrompt += `\n\nMake sure it perfectly embodies the ${style} style requested.`;

  return {
    systemContext,
    userPrompt,
    metadata: { platform, postType, style }
  };
}

/**
 * Builds a complete prompt template for video script generation
 */
export function buildScriptPrompt(params: ScriptPromptParams): PromptTemplate {
  const {
    prompt,
    platform = 'Instagram',
    contentType = 'video',
    style = 'professional',
    duration = 30,
    dimensions
  } = params;

  const dimensionInfo = dimensions 
    ? `${dimensions.width}x${dimensions.height} (${dimensions.ratio})`
    : 'Standard dimensions';

  const systemContext = `You are an expert content creator and scriptwriter. Generate professional scripts optimized for ${platform} ${contentType}.

Platform specs:
- ${platform} ${contentType}: ${dimensionInfo}
- Duration: ${duration} seconds
- Style: ${style}

Create engaging, platform-optimized content that drives engagement and views.`;

  const userPrompt = `Create a ${duration}-second ${style} script for ${platform} ${contentType} about: "${prompt}"

Include:
1. Hook (first 3 seconds)
2. Main content structure
3. Call-to-action
4. Engaging caption with emojis
5. 10-15 trending hashtags for ${platform}

Format as JSON with: script, caption, hashtags`;

  return {
    systemContext,
    userPrompt,
    metadata: { platform, contentType, style, duration }
  };
}

/**
 * Builds a prompt for hashtag generation
 */
export function buildHashtagPrompt(params: {
  title?: string;
  description?: string;
  type?: string;
  platform?: string;
}): string {
  const { title, description, type, platform = 'social media' } = params;
  
  return `Generate relevant hashtags for this ${platform} ${type || 'post'}:
Title: ${title || ''}
Description: ${description || ''}

Generate 8-12 relevant hashtags that are:
- Popular but not oversaturated
- Relevant to the content
- Mix of broad and niche tags
- Appropriate for ${platform}

Return only the hashtags with # symbols, separated by spaces.`;
}

/**
 * Builds a prompt for chat/conversational AI
 */
export function buildChatPrompt(params: {
  message: string;
  brandVoice?: string;
}): PromptTemplate {
  const { message, brandVoice = 'professional' } = params;

  const brandVoicePrompts: Record<string, string> = {
    professional: "You are a professional business AI assistant. Respond in a formal, authoritative tone with clear, actionable advice.",
    casual: "You are a friendly, casual AI assistant. Respond in a conversational, approachable tone like talking to a friend.",
    creative: "You are a creative AI assistant. Respond with innovative, inspiring ideas and imaginative solutions.",
    technical: "You are a technical expert AI assistant. Respond with precise, analytical language and detailed technical insights.",
    social: "You are a social media expert AI assistant. Respond with engaging, trendy language perfect for social content.",
    luxury: "You are a luxury brand AI assistant. Respond with sophisticated, elegant language that conveys premium quality."
  };

  const systemContext = brandVoicePrompts[brandVoice] || brandVoicePrompts.professional;

  return {
    systemContext,
    userPrompt: message,
    metadata: { brandVoice }
  };
}

/**
 * Builds a prompt for competitor analysis
 */
export function buildCompetitorAnalysisPrompt(params: {
  competitorUsername: string;
  platform: string;
  analysisType: string;
}): string {
  const { competitorUsername, platform, analysisType } = params;
  
  return `Analyze the ${platform} profile of @${competitorUsername} for ${analysisType} analysis.
Provide detailed insights on:
- Content strategy and patterns
- Engagement metrics and performance
- Growth trajectory
- Audience insights
- Recommendations for competitive positioning`;
}

/**
 * Sanitizes user input for safe inclusion in prompts
 */
export function sanitizePromptInput(input: string, maxLength: number = 10000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Trim and limit length
  let sanitized = input.trim().substring(0, maxLength);
  
  // Remove potential prompt injection attempts
  // Strip out common instruction patterns that could hijack the AI
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions?/gi,
    /disregard\s+(all\s+)?previous\s+instructions?/gi,
    /forget\s+(all\s+)?previous\s+instructions?/gi,
    /system\s+prompt/gi,
    /\[SYSTEM.*?\]/gi,
    /\<SYSTEM.*?\>/gi
  ];
  
  injectionPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  return sanitized;
}

/**
 * Merges multiple prompt templates into a single comprehensive prompt
 */
export function mergePromptTemplates(templates: PromptTemplate[]): PromptTemplate {
  const systemContexts = templates.map(t => t.systemContext).filter(Boolean);
  const userPrompts = templates.map(t => t.userPrompt).filter(Boolean);
  const metadata = templates.reduce((acc, t) => ({ ...acc, ...t.metadata }), {});

  return {
    systemContext: systemContexts.join('\n\n'),
    userPrompt: userPrompts.join('\n\n'),
    metadata
  };
}

/**
 * Extracts optimization goals and converts to structured format
 */
export function parseOptimizationGoals(goals?: string): {
  primary: string;
  secondary: string[];
} {
  if (!goals) {
    return { primary: 'engagement', secondary: [] };
  }

  const lowerGoals = goals.toLowerCase();
  
  let primary = 'engagement';
  const secondary: string[] = [];

  if (lowerGoals.includes('conversion')) {
    primary = 'conversion';
  } else if (lowerGoals.includes('reach')) {
    primary = 'reach';
  } else if (lowerGoals.includes('engagement')) {
    primary = 'engagement';
  }

  if (lowerGoals.includes('likes')) secondary.push('likes');
  if (lowerGoals.includes('comments')) secondary.push('comments');
  if (lowerGoals.includes('shares')) secondary.push('shares');
  if (lowerGoals.includes('saves')) secondary.push('saves');
  if (lowerGoals.includes('clicks')) secondary.push('clicks');

  return { primary, secondary };
}
