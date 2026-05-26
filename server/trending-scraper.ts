import axios from 'axios';

interface TrendingVideo {
  title: string;
  views: number;
  engagement: number;
  hashtags: string[];
  category: string;
}

interface ViralMetrics {
  minViews: number;
  minEngagement: number;
  timeframe: string;
}

export class TrendingScraper {
  private youtubeApiKey: string;
  private perplexityApiKey: string;

  constructor() {
    this.youtubeApiKey = process.env.YOUTUBE_API_KEY!;
    this.perplexityApiKey = process.env.PERPLEXITY_API_KEY!;
  }

  async getViralContentFromMultipleSources(niche: string, interests: string[]): Promise<string[]> {
    const viralContent: string[] = [];

    try {
      // Get viral trends from Perplexity with real-time search
      const perplexityTrends = await this.getPerplexityViralTrends(niche, interests);
      viralContent.push(...perplexityTrends);

      // Get trending YouTube content
      const youtubeTrends = await this.getYouTubeTrendingContent(niche, interests);
      viralContent.push(...youtubeTrends);

      // Get viral hashtags and topics
      const hashtagTrends = await this.getViralHashtagContent(niche);
      viralContent.push(...hashtagTrends);

      // Remove duplicates and return top viral content
      const uniqueContent = [...new Set(viralContent)];
      return uniqueContent.slice(0, 10);
    } catch (error) {
      console.log('[TRENDING SCRAPER] Error fetching viral content:', error);
      return this.getFallbackViralContent(niche, interests);
    }
  }

  private async getPerplexityViralTrends(niche: string, interests: string[]): Promise<string[]> {
    try {
      const interestString = interests.join(', ');
      
      const prompt = `Find the most viral content from the last 48 hours specifically for ${niche} and ${interestString} professionals.

      Search for content that has:
      - 1M+ views on YouTube, Instagram, or TikTok
      - High engagement rates (10%+ likes/comments ratio)
      - Trending hashtags with millions of uses
      - Popular formats: "How I...", "Day in the life...", "X mistakes...", "Behind the scenes..."

      Focus on these viral categories:
      - Social media growth stories with real numbers
      - Business success/failure stories  
      - App development journey content
      - Tech entrepreneur lifestyle content
      - Professional productivity and tools
      - Industry insights and predictions

      Return ONLY a JSON array of specific viral content titles that are currently trending with proven metrics.
      Example: ["How I grew my SaaS from $0 to $100k MRR", "Why I quit my $300k tech job", "Social media manager reveals industry secrets"]`;

      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [
            { role: 'system', content: 'You are a viral content analyst with access to real-time social media data. Focus on current trending content with proven viral metrics.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500,
          temperature: 0.3,
          search_recency_filter: 'day'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.perplexityApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        const trends = JSON.parse(jsonMatch[0]);
        return Array.isArray(trends) ? trends : [];
      }

      return [];
    } catch (error) {
      console.log('[PERPLEXITY SCRAPER] Error:', error);
      return [];
    }
  }

  private async getYouTubeTrendingContent(niche: string, interests: string[]): Promise<string[]> {
    try {
      const searchTerms = [
        `${niche} viral`,
        `${interests[0]} million views`,
        'social media manager success story',
        'app developer journey',
        'tech entrepreneur day in life',
        'business growth hack'
      ];

      const viralTitles: string[] = [];

      for (const term of searchTerms.slice(0, 3)) {
        const response = await axios.get(
          `https://www.googleapis.com/youtube/v3/search`,
          {
            params: {
              part: 'snippet',
              q: term,
              type: 'video',
              order: 'viewCount',
              publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              maxResults: 5,
              key: this.youtubeApiKey
            }
          }
        );

        for (const video of response.data.items) {
          // Get video statistics to check if it's truly viral
          const statsResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos`,
            {
              params: {
                part: 'statistics',
                id: video.id.videoId,
                key: this.youtubeApiKey
              }
            }
          );

          const stats = statsResponse.data.items[0]?.statistics;
          if (stats && parseInt(stats.viewCount) > 100000) {
            viralTitles.push(video.snippet.title);
          }
        }
      }

      return viralTitles;
    } catch (error) {
      console.log('[YOUTUBE SCRAPER] Error:', error);
      return [];
    }
  }

  private async getViralHashtagContent(niche: string): Promise<string[]> {
    try {
      const prompt = `Find viral hashtag trends and content themes for ${niche} from the last 24 hours.

      Look for:
      - Hashtags with 1M+ uses
      - Trending content formats in business/tech space
      - Viral challenges related to professional growth
      - Popular "day in the life" content for professionals
      - Success story formats getting high engagement

      Return content ideas based on these viral patterns.`;

      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 300,
          search_recency_filter: 'day'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.perplexityApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      
      // Extract content ideas from the response
      const ideas = content.split('\n')
        .filter(line => line.includes('How') || line.includes('Why') || line.includes('Day in'))
        .map(line => line.replace(/^[-*•]\s*/, '').trim())
        .filter(line => line.length > 10);

      return ideas.slice(0, 5);
    } catch (error) {
      console.log('[HASHTAG SCRAPER] Error:', error);
      return [];
    }
  }

  private getFallbackViralContent(niche: string, interests: string[]): string[] {
    const socialMediaViralContent = [
      'How I grew my Instagram to 1M followers in 6 months',
      'Social media manager salary reality check 2025',
      'I tried every social media scheduling tool',
      'Behind the scenes of viral content creation',
      'Day in the life managing 100+ social accounts',
      'Why I quit my agency job to freelance',
      'Social media mistakes that cost me clients',
      'How I charge $10k per month for social media'
    ];

    const appDevViralContent = [
      'How I built a $1M app with no code',
      'App developer vs reality expectations',
      'I spent $50k on app development and failed',
      'From idea to app store in 30 days',
      'Why 90% of apps fail in the first year',
      'Junior vs senior developer productivity',
      'I got 1M downloads with this marketing hack',
      'App store optimization secrets exposed'
    ];

    const techBusinessViralContent = [
      'How I built a $10M SaaS in my garage',
      'Tech startup founder morning routine',
      'Why I turned down a $100M acquisition',
      'From coding bootcamp to $200k salary',
      'Tech industry layoffs what they don\'t tell you',
      'I interviewed at 50 tech companies',
      'Remote work productivity secrets',
      'How I negotiated a $50k salary increase'
    ];

    if (niche.includes('social media') || interests.includes('social media')) {
      return socialMediaViralContent;
    } else if (niche.includes('app development') || interests.includes('app development')) {
      return appDevViralContent;
    } else {
      return techBusinessViralContent;
    }
  }
}

export const trendingScraper = new TrendingScraper();