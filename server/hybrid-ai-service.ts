import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

// Types for AI responses and routing
export interface AIProvider {
  name: 'openai' | 'perplexity' | 'gemini';
  confidence: number;
  reasoning: string;
}

export interface AIResponse {
  content: string;
  provider: string;
  metadata?: {
    sources?: string[];
    citations?: string[];
    confidence?: number;
    reasoning?: string;
  };
}

export interface HybridResponse {
  content: string;
  providers: AIProvider[];
  strategy: 'single' | 'hybrid' | 'enhanced';
  reasoning: string;
  sources?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class HybridAIService {
  private openai: OpenAI;
  private genAI: GoogleGenerativeAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  /**
   * Analyze user question and determine optimal AI strategy
   */
  private analyzeQuestion(userMessage: string): {
    complexity: 'simple' | 'moderate' | 'complex';
    requiresResearch: boolean;
    requiresTrending: boolean;
    requiresDeepAnalysis: boolean;
    recommendedStrategy: 'single' | 'hybrid' | 'enhanced';
    primaryProvider: 'openai' | 'perplexity' | 'gemini';
    reasoning: string;
  } {
    const message = userMessage.toLowerCase();
    
    // Trending and research indicators
    const trendingKeywords = [
      'trending', 'latest', 'current', 'recent', 'new', 'today', 'this week',
      'viral', 'popular', 'hot topic', 'breaking', 'news', 'update'
    ];
    
    const researchKeywords = [
      'research', 'study', 'analysis', 'compare', 'statistics', 'data',
      'survey', 'report', 'findings', 'evidence', 'facts', 'sources'
    ];
    
    const complexKeywords = [
      'strategy', 'comprehensive', 'detailed', 'step-by-step', 'complete guide',
      'advanced', 'professional', 'enterprise', 'scale', 'framework'
    ];
    
    const requiresResearch = researchKeywords.some(keyword => message.includes(keyword));
    const requiresTrending = trendingKeywords.some(keyword => message.includes(keyword));
    const requiresDeepAnalysis = complexKeywords.some(keyword => message.includes(keyword));
    
    // Question complexity analysis
    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (message.length > 100 || requiresDeepAnalysis) complexity = 'complex';
    else if (message.length > 50 || requiresResearch || requiresTrending) complexity = 'moderate';
    
    // Strategy determination
    let recommendedStrategy: 'single' | 'hybrid' | 'enhanced' = 'single';
    let primaryProvider: 'openai' | 'perplexity' | 'gemini' = 'openai';
    let reasoning = '';
    
    if (requiresTrending && requiresDeepAnalysis) {
      recommendedStrategy = 'hybrid';
      primaryProvider = 'perplexity';
      reasoning = 'Question requires trending data research + comprehensive analysis';
    } else if (requiresTrending) {
      recommendedStrategy = 'single';
      primaryProvider = 'perplexity';
      reasoning = 'Question asks for trending/current information';
    } else if (complexity === 'complex' && requiresResearch) {
      recommendedStrategy = 'enhanced';
      primaryProvider = 'openai';
      reasoning = 'Complex question requiring detailed research and analysis';
    } else if (complexity === 'complex') {
      recommendedStrategy = 'single';
      primaryProvider = 'openai';
      reasoning = 'Complex question best handled by advanced reasoning';
    } else if (message.includes('creative') || message.includes('content ideas')) {
      recommendedStrategy = 'single';
      primaryProvider = 'gemini';
      reasoning = 'Creative content generation suited for Gemini';
    } else {
      recommendedStrategy = 'single';
      primaryProvider = 'openai';
      reasoning = 'Standard question well-suited for OpenAI';
    }
    
    return {
      complexity,
      requiresResearch,
      requiresTrending,
      requiresDeepAnalysis,
      recommendedStrategy,
      primaryProvider,
      reasoning
    };
  }

  /**
   * Gemini Streaming Response
   */
  async* generateGeminiStreamingResponse(userMessage: string): AsyncGenerator<string, void, unknown> {
    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      const prompt = `You are VeeGPT, an AI assistant specifically designed to help content creators and social media professionals. You specialize in:

1. Content Strategy & Planning
2. Social Media Marketing  
3. Video Content Creation
4. Brand Building
5. Audience Engagement
6. Content Optimization
7. Analytics & Insights
8. Platform-specific advice (Instagram, YouTube, TikTok, etc.)

Always provide practical, actionable advice tailored to content creation and social media growth. Be conversational, helpful, and specific in your recommendations.

User question: ${userMessage}`;

      const result = await model.generateContentStream(prompt);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      console.error('Gemini streaming error:', error);
      yield 'I apologize, but I encountered an error generating a response. Please try again.';
    }
  }

  /**
   * OpenAI Streaming Response
   */
  async* generateOpenAIStreamingResponse(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
    try {
      const stream = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are VeeGPT, an AI assistant specifically designed to help content creators and social media professionals. You specialize in:

1. Content Strategy & Planning
2. Social Media Marketing
3. Video Content Creation
4. Brand Building
5. Audience Engagement
6. Content Optimization
7. Analytics & Insights
8. Platform-specific advice (Instagram, YouTube, TikTok, etc.)

Always provide practical, actionable advice tailored to content creation and social media growth. Be conversational, helpful, and specific in your recommendations.`
          },
          ...messages
        ],
        max_tokens: 1000,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('OpenAI streaming error:', error);
      yield 'I apologize, but I encountered an error generating a response. Please try again.';
    }
  }

  /**
   * Perplexity API Call (Research & Trending Data)
   */
  private async getPerplexityResponse(userMessage: string): Promise<AIResponse> {
    console.log('[PERPLEXITY] Starting API call for message:', userMessage.substring(0, 50) + '...');
    console.log('[PERPLEXITY] API Key configured:', !!process.env.PERPLEXITY_API_KEY);
    console.log('[PERPLEXITY] API Key length:', process.env.PERPLEXITY_API_KEY?.length || 0);
    
    try {
      const requestBody = {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a research-focused AI assistant specializing in current trends, data, and up-to-date information for content creators and social media professionals. Provide well-sourced, current information with citations when possible.'
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_tokens: 800,
        temperature: 0.3,
        top_p: 0.9,
        return_images: false,
        return_related_questions: false,
        search_recency_filter: 'month',
        stream: false
      };
      
      console.log('[PERPLEXITY] Making fetch request to Perplexity API...');
      
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('[PERPLEXITY] Response status:', response.status);
      console.log('[PERPLEXITY] Response statusText:', response.statusText);
      console.log('[PERPLEXITY] Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PERPLEXITY] API error response:', errorText.substring(0, 200) + '...');
        
        // Provide clean error handling without exposing HTML error pages
        if (response.status === 401) {
          console.error('[PERPLEXITY] Authentication failed - API key may be invalid or expired');
          throw new Error('External research data temporarily unavailable due to authentication issues.');
        } else if (response.status === 429) {
          console.error('[PERPLEXITY] Rate limit exceeded');
          throw new Error('External research data temporarily unavailable due to rate limiting.');
        } else if (response.status >= 500) {
          console.error('[PERPLEXITY] Server error');
          throw new Error('External research service temporarily unavailable.');
        } else {
          throw new Error('Unable to access current research data at the moment.');
        }
      }

      const data = await response.json() as any;
      console.log('[PERPLEXITY] Response data received, keys:', Object.keys(data));
      console.log('[PERPLEXITY] Full response:', JSON.stringify(data, null, 2));
      
      const content = data.choices?.[0]?.message?.content;
      console.log('[PERPLEXITY] Extracted content:', content ? content.substring(0, 100) + '...' : 'No content');
      
      return {
        content: content || 'Unable to fetch research data from Perplexity.',
        provider: 'perplexity',
        metadata: {
          sources: data.citations || [],
          confidence: 0.9,
          reasoning: 'Perplexity research with current data'
        }
      };
    } catch (error: any) {
      console.error('[PERPLEXITY] API error occurred:', error);
      console.error('[PERPLEXITY] Error name:', error.name);
      console.error('[PERPLEXITY] Error message:', error.message);
      console.error('[PERPLEXITY] Error stack:', error.stack);
      
      return {
        content: `I encountered an issue accessing current research data: ${error.message}. Please try again.`,
        provider: 'perplexity',
        metadata: { confidence: 0, reasoning: 'API error: ' + error.message }
      };
    }
  }

  /**
   * Gemini Response (Creative & Content Generation)
   */
  private async getGeminiResponse(userMessage: string): Promise<AIResponse> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const prompt = `You are VeeGPT, a creative AI assistant specializing in content creation, social media strategy, and innovative marketing ideas. 

User Question: ${userMessage}

Provide creative, actionable insights focused on content creation and social media growth.`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return {
        content: text,
        provider: 'gemini',
        metadata: {
          confidence: 0.85,
          reasoning: 'Gemini creative content generation'
        }
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      return {
        content: 'I encountered an issue with creative content generation. Please try again.',
        provider: 'gemini',
        metadata: { confidence: 0, reasoning: 'API error' }
      };
    }
  }

  /**
   * OpenAI Response (Non-streaming for hybrid combinations)
   */
  private async getOpenAIResponse(messages: ChatMessage[]): Promise<AIResponse> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are VeeGPT, an AI assistant specifically designed to help content creators and social media professionals. Provide practical, actionable advice.`
          },
          ...messages
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      return {
        content: response.choices[0]?.message?.content || 'Unable to generate response.',
        provider: 'openai',
        metadata: {
          confidence: 0.9,
          reasoning: 'OpenAI advanced reasoning'
        }
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      return {
        content: 'I encountered an issue generating a response. Please try again.',
        provider: 'openai',
        metadata: { confidence: 0, reasoning: 'API error' }
      };
    }
  }

  /**
   * Combine multiple AI responses intelligently
   */
  private combineResponses(responses: AIResponse[], strategy: string): string {
    if (responses.length === 1) {
      return responses[0].content;
    }

    // For hybrid responses, intelligently combine insights
    const perplexityResponse = responses.find(r => r.provider === 'perplexity');
    const openaiResponse = responses.find(r => r.provider === 'openai');
    const geminiResponse = responses.find(r => r.provider === 'gemini');

    let combinedContent = '';

    if (perplexityResponse && perplexityResponse.metadata?.sources?.length) {
      combinedContent += `**Current Research & Trends:**\n${perplexityResponse.content}\n\n`;
      
      if (perplexityResponse.metadata.sources.length > 0) {
        combinedContent += `**Sources:**\n${perplexityResponse.metadata.sources.slice(0, 3).map(source => `• ${source}`).join('\n')}\n\n`;
      }
    }

    if (openaiResponse) {
      combinedContent += `**Strategic Analysis:**\n${openaiResponse.content}\n\n`;
    }

    if (geminiResponse) {
      combinedContent += `**Creative Insights:**\n${geminiResponse.content}`;
    }

    return combinedContent.trim();
  }

  /**
   * Main hybrid AI generation with streaming and status updates
   */
  async* generateHybridStreamingResponse(messages: ChatMessage[], statusCallback?: (status: string) => void): AsyncGenerator<string, void, unknown> {
    try {
      const userMessage = messages[messages.length - 1]?.content || '';
      
      // Send immediate status callback - no delays
      statusCallback?.('🔍 Analyzing question complexity and optimal AI routing...');
      
      // Analyze the question to determine strategy (fast analysis)
      const analysis = this.analyzeQuestion(userMessage);
      
      console.log(`[HYBRID AI] Analysis:`, analysis);
      
      // Determine which AIs will be used and provide detailed status
      const aiProviders = [];
      if (analysis.primaryProvider === 'perplexity' || analysis.requiresTrending) {
        aiProviders.push('Perplexity AI (Real-time Research)');
      }
      if (analysis.primaryProvider === 'openai' || analysis.requiresDeepAnalysis || analysis.recommendedStrategy !== 'single') {
        aiProviders.push('GPT-4o (Strategic Analysis)');
      }
      if (analysis.primaryProvider === 'gemini' || userMessage.toLowerCase().includes('creative') || userMessage.toLowerCase().includes('ideas')) {
        aiProviders.push('Gemini (Creative Generation)');
      }
      
      const aiCount = aiProviders.length;
      const strategyType = analysis.recommendedStrategy === 'single' ? 'Focused' : 
                          analysis.recommendedStrategy === 'hybrid' ? 'Hybrid' : 'Enhanced Multi-AI';
      
      // Show intelligent routing decision
      if (aiCount === 1) {
        statusCallback?.(`🎯 ${strategyType} Strategy: ${aiProviders[0]} selected for optimal results`);
      } else {
        statusCallback?.(`⚡ ${strategyType} Strategy: Coordinating ${aiCount} AIs for comprehensive analysis`);
      }
      
      // Single AI strategy - stream directly
      if (analysis.recommendedStrategy === 'single') {
        if (analysis.primaryProvider === 'openai') {
          statusCallback?.('🚀 OpenAI GPT-4o processing your request with advanced reasoning and comprehensive analysis...');
          yield* this.generateOpenAIStreamingResponse(messages);
        } else if (analysis.primaryProvider === 'perplexity') {
          statusCallback?.('🔍 Perplexity AI connecting to internet for real-time research and trending data...');
          const response = await this.getPerplexityResponse(userMessage);
          
          // Stream immediately without extra status
          const words = response.content.split(' ');
          for (const word of words) {
            yield word + ' ';
          }
        } else if (analysis.primaryProvider === 'gemini') {
          statusCallback?.('✨ Google Gemini generating creative insights and innovative content ideas...');
          yield* this.generateGeminiStreamingResponse(userMessage);
        }
        return;
      }

      // Hybrid/Enhanced strategy - combine multiple AIs
      console.log(`[HYBRID AI] Using ${analysis.recommendedStrategy} strategy with multiple AIs`);
      
      // Calculate how many AIs will be used for detailed status
      const totalAIs = [
        analysis.requiresTrending,
        analysis.requiresDeepAnalysis,
        userMessage.toLowerCase().includes('creative') || userMessage.toLowerCase().includes('ideas')
      ].filter(Boolean).length;
      
      const finalAICount = Math.max(totalAIs, 1); // Ensure at least 1 AI
      statusCallback?.(`⚡ Hybrid ${finalAICount}-AI Strategy Activated | Coordinating ${finalAICount === 2 ? 'dual' : finalAICount === 3 ? 'triple' : 'multiple'} AI providers for comprehensive analysis...`);
      
      const responses: AIResponse[] = [];
      let currentStep = 1;
      
      // Get responses from multiple AIs based on strategy
      if (analysis.requiresTrending) {
        statusCallback?.(`🔍 AI ${currentStep}/${finalAICount}: Perplexity AI connecting to internet to fetch real-time trending data, social media insights, and current market information...`);
        console.log('[HYBRID AI] Fetching trending data from Perplexity...');
        const perplexityResponse = await this.getPerplexityResponse(userMessage);
        responses.push(perplexityResponse);
        currentStep++;
      }
      
      if (analysis.requiresDeepAnalysis) {
        statusCallback?.(`🚀 AI ${currentStep}/${finalAICount}: OpenAI GPT-4o processing strategic analysis, evaluating patterns, and generating intelligent recommendations based on advanced reasoning...`);
        console.log('[HYBRID AI] Getting strategic analysis from OpenAI...');
        const openaiResponse = await this.getOpenAIResponse(messages);
        responses.push(openaiResponse);
        currentStep++;
      }
      
      if (userMessage.toLowerCase().includes('creative') || userMessage.toLowerCase().includes('ideas')) {
        statusCallback?.(`✨ AI ${currentStep}/${finalAICount}: Google Gemini generating creative insights, innovative content ideas, and artistic perspectives using multimodal intelligence...`);
        console.log('[HYBRID AI] Adding creative insights from Gemini...');
        const geminiResponse = await this.getGeminiResponse(userMessage);
        responses.push(geminiResponse);
        currentStep++;
      }
      
      // If no specific responses, default to OpenAI
      if (responses.length === 0) {
        statusCallback?.('🚀 Single AI Strategy: OpenAI GPT-4o analyzing your request with advanced reasoning and comprehensive knowledge processing...');
        console.log('[HYBRID AI] Defaulting to OpenAI for comprehensive response');
        const openaiResponse = await this.getOpenAIResponse(messages);
        responses.push(openaiResponse);
      }
      
      // Combine and stream the final response
      const aiNames = responses.map(r => {
        if (r.provider === 'perplexity') return 'Perplexity AI';
        if (r.provider === 'openai') return 'OpenAI GPT-4o';
        if (r.provider === 'gemini') return 'Google Gemini';
        return r.provider;
      });
      statusCallback?.(`🤖 Synthesizing insights from ${responses.length} AI${responses.length > 1 ? 's' : ''} (${aiNames.join(' + ')}) | Merging research data, strategic analysis, and creative insights into unified response...`);
      const combinedContent = this.combineResponses(responses, analysis.recommendedStrategy);
      
      statusCallback?.('📝 Streaming comprehensive multi-AI response...');
      // Stream the combined response immediately without artificial delays
      const words = combinedContent.split(' ');
      for (const word of words) {
        yield word + ' ';
        // No delays - stream as fast as possible
      }
      
    } catch (error) {
      console.error('[HYBRID AI] Error:', error);
      statusCallback?.('❌ Error occurred - attempting fallback response...');
      yield 'I apologize, but I encountered an error processing your request. Please try again.';
    }
  }

  /**
   * Generate chat title using OpenAI
   */
  async generateChatTitle(content: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Generate a concise, descriptive title (max 60 characters) for this chat conversation based on the user's first message. Focus on the main topic or question."
          },
          {
            role: "user", 
            content: `Generate a title for this message: "${content}"`
          }
        ],
        max_tokens: 20,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content?.trim() || 'New Chat';
    } catch (error) {
      console.error('Error generating chat title:', error);
      return 'New Chat';
    }
  }
}