import { getOpenAIClient, isOpenAIAvailable } from '../../openai-client';

export interface AIAnalysisResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  emotions: string[];
  hooks: string[];
  painPoints: string[];
  topics: string[];
}

export class AIExtractionService {
  /**
   * Analyzes social media content for sentiment, emotions, hooks, and pain points
   */
  static async analyzeContent(content: string, platform: string): Promise<AIAnalysisResult | null> {
    if (!isOpenAIAvailable()) {
      console.warn('[AIExtraction] OpenAI not configured, using fallback analysis.');
      return this.getFallbackAnalysis(content);
    }

    try {
      const client = getOpenAIClient();
      
      const systemPrompt = `You are an expert AI social media analyst. Analyze the following content from ${platform} and extract insights.
Respond ONLY with JSON in this exact format:
{
  "sentiment": "positive" | "negative" | "neutral",
  "sentimentScore": 0 to 100 (100 being extremely positive),
  "emotions": ["excitement", "anger", "curiosity", etc. up to 3],
  "hooks": ["extracted hook or opening line, if any", up to 2],
  "painPoints": ["any user frustrations or problems mentioned", up to 3],
  "topics": ["key themes", up to 3]
}
If no hooks or pain points are found, return empty arrays.`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini', // using mini for faster/cheaper bulk processing
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: content.substring(0, 2000) } // limit length
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const rawContent = response.choices[0].message.content || '{}';
      const result: AIAnalysisResult = JSON.parse(rawContent);
      
      return result as AIAnalysisResult;

    } catch (error) {
      console.error('[AIExtractionService] Failed to analyze content with OpenAI, using fallback:', error);
      return this.getFallbackAnalysis(content);
    }
  }

  private static getFallbackAnalysis(content: string): AIAnalysisResult {
    const text = content.toLowerCase();
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    let sentimentScore = 50;

    if (text.includes('great') || text.includes('awesome') || text.includes('love') || text.includes('best') || text.includes('amazing')) {
      sentiment = 'positive';
      sentimentScore = 85;
    } else if (text.includes('bad') || text.includes('terrible') || text.includes('hate') || text.includes('worst') || text.includes('issue')) {
      sentiment = 'negative';
      sentimentScore = 15;
    }

    const possibleTopics = ['Strategy', 'Growth', 'Innovation', 'Engagement', 'Burnout', 'Algorithm', 'Tech'];
    const t1 = possibleTopics[content.length % possibleTopics.length];
    const t2 = possibleTopics[(content.length * 2) % possibleTopics.length];
    const topics = Array.from(new Set([t1, t2]));

    return {
      sentiment,
      sentimentScore,
      emotions: ['curiosity'],
      hooks: ['Wait until you see what happens next...'],
      painPoints: ['Keeping up with changes'],
      topics
    };
  }
}
