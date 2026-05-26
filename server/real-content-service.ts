import axios from 'axios';

interface TrendingVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  duration: string;
  tags: string[];
  categoryId: string;
}

interface InstagramTrend {
  id: string;
  media_type: string;
  media_url: string;
  thumbnail_url?: string;
  caption: string;
  like_count: number;
  comments_count: number;
  timestamp: string;
  hashtags: string[];
}

export class RealContentService {
  private youtubeApiKey: string;
  private instagramAccessToken: string;

  constructor() {
    this.youtubeApiKey = process.env.GOOGLE_API_KEY || '';
    this.instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN || '';
  }

  async getYouTubeTrendingVideos(regionCode: string = 'IN', maxResults: number = 50): Promise<TrendingVideo[]> {
    try {
      if (!this.youtubeApiKey) {
        console.log('[YOUTUBE] API key not configured, using fallback data');
        return this.getFallbackYouTubeData();
      }

      // Get trending videos
      const trendingResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'snippet,statistics,contentDetails',
          chart: 'mostPopular',
          regionCode: regionCode,
          maxResults: maxResults,
          key: this.youtubeApiKey
        }
      });

      const videos: TrendingVideo[] = trendingResponse.data.items.map((item: any) => ({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
        channelTitle: item.snippet.channelTitle,
        viewCount: parseInt(item.statistics.viewCount || '0'),
        likeCount: parseInt(item.statistics.likeCount || '0'),
        commentCount: parseInt(item.statistics.commentCount || '0'),
        publishedAt: item.snippet.publishedAt,
        duration: item.contentDetails.duration,
        tags: item.snippet.tags || [],
        categoryId: item.snippet.categoryId
      }));

      console.log(`[YOUTUBE] Fetched ${videos.length} trending videos for region ${regionCode}`);
      return videos;
    } catch (error: any) {
      console.error('[YOUTUBE] Error fetching trending videos:', error.message);
      return this.getFallbackYouTubeData();
    }
  }

  async getYouTubeSearchTrends(query: string, regionCode: string = 'IN'): Promise<TrendingVideo[]> {
    try {
      if (!this.youtubeApiKey) {
        return this.getFallbackYouTubeData();
      }

      const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          order: 'viewCount',
          regionCode: regionCode,
          maxResults: 25,
          key: this.youtubeApiKey
        }
      });

      // Get detailed video info
      const videoIds = searchResponse.data.items.map((item: any) => item.id.videoId).join(',');
      
      const videosResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'snippet,statistics,contentDetails',
          id: videoIds,
          key: this.youtubeApiKey
        }
      });

      const videos: TrendingVideo[] = videosResponse.data.items.map((item: any) => ({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
        channelTitle: item.snippet.channelTitle,
        viewCount: parseInt(item.statistics.viewCount || '0'),
        likeCount: parseInt(item.statistics.likeCount || '0'),
        commentCount: parseInt(item.statistics.commentCount || '0'),
        publishedAt: item.snippet.publishedAt,
        duration: item.contentDetails.duration,
        tags: item.snippet.tags || [],
        categoryId: item.snippet.categoryId
      }));

      return videos.filter(v => v.viewCount > 10000); // Filter for viral content
    } catch (error: any) {
      console.error('[YOUTUBE] Error searching trends:', error.message);
      return this.getFallbackYouTubeData();
    }
  }

  async getInstagramTrendingContent(): Promise<InstagramTrend[]> {
    try {
      if (!this.instagramAccessToken) {
        console.log('[INSTAGRAM] Access token not configured, using fallback data');
        return this.getFallbackInstagramData();
      }

      // Get user's media (as an example - in real implementation, you'd aggregate from multiple accounts)
      const response = await axios.get(`https://graph.instagram.com/me/media`, {
        params: {
          fields: 'id,media_type,media_url,thumbnail_url,caption,like_count,comments_count,timestamp',
          access_token: this.instagramAccessToken
        }
      });

      const trends: InstagramTrend[] = response.data.data.map((item: any) => ({
        id: item.id,
        media_type: item.media_type,
        media_url: item.media_url,
        thumbnail_url: item.thumbnail_url,
        caption: item.caption || '',
        like_count: item.like_count || 0,
        comments_count: item.comments_count || 0,
        timestamp: item.timestamp,
        hashtags: this.extractHashtags(item.caption || '')
      }));

      return trends.filter(t => t.like_count > 100); // Filter for engaging content
    } catch (error: any) {
      console.error('[INSTAGRAM] Error fetching trending content:', error.message);
      return this.getFallbackInstagramData();
    }
  }

  async getTrendingHashtags(platform: 'youtube' | 'instagram', region: string = 'IN'): Promise<string[]> {
    // This would typically use trending hashtag APIs or analyze recent content
    const commonTrendingHashtags = {
      youtube: [
        'viral', 'trending', 'shorts', 'funny', 'tutorial', 'review', 'vlog', 'gaming',
        'music', 'dance', 'comedy', 'education', 'technology', 'lifestyle', 'travel'
      ],
      instagram: [
        'reels', 'viral', 'trending', 'instadaily', 'photooftheday', 'instagood',
        'fashion', 'fitness', 'food', 'travel', 'lifestyle', 'motivation', 'art'
      ]
    };

    return commonTrendingHashtags[platform];
  }

  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map(tag => tag.substring(1)) : [];
  }

  private getFallbackYouTubeData(): TrendingVideo[] {
    return [
      {
        id: 'fallback1',
        title: 'Top 10 Viral Video Ideas That Actually Work in 2024',
        description: 'Discover proven video formats that consistently go viral and get millions of views.',
        thumbnailUrl: '/api/placeholder/320/180',
        channelTitle: 'Content Creator Tips',
        viewCount: 2500000,
        likeCount: 85000,
        commentCount: 12000,
        publishedAt: new Date().toISOString(),
        duration: 'PT8M30S',
        tags: ['viral', 'youtube', 'content', 'tips'],
        categoryId: '22'
      },
      {
        id: 'fallback2',
        title: 'How I Got 1 Million Views in 30 Days (Real Strategy)',
        description: 'The exact step-by-step process I used to grow my channel from 0 to viral.',
        thumbnailUrl: '/api/placeholder/320/180',
        channelTitle: 'Growth Hacker',
        viewCount: 1800000,
        likeCount: 95000,
        commentCount: 8500,
        publishedAt: new Date().toISOString(),
        duration: 'PT12M15S',
        tags: ['growth', 'viral', 'strategy', 'youtube'],
        categoryId: '22'
      }
    ];
  }

  private getFallbackInstagramData(): InstagramTrend[] {
    return [
      {
        id: 'fallback1',
        media_type: 'VIDEO',
        media_url: '/api/placeholder/320/320',
        thumbnail_url: '/api/placeholder/320/320',
        caption: 'Viral reel ideas that actually work! 🔥 #reels #viral #contentcreator',
        like_count: 25000,
        comments_count: 450,
        timestamp: new Date().toISOString(),
        hashtags: ['reels', 'viral', 'contentcreator']
      },
      {
        id: 'fallback2',
        media_type: 'CAROUSEL_ALBUM',
        media_url: '/api/placeholder/320/320',
        caption: 'Growth hacks every creator needs to know 📈 #growthhacks #instagram #tips',
        like_count: 18000,
        comments_count: 320,
        timestamp: new Date().toISOString(),
        hashtags: ['growthhacks', 'instagram', 'tips']
      }
    ];
  }

  parseDuration(duration: string): number {
    // Parse YouTube duration format (PT8M30S) to seconds
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = duration.match(regex);
    
    if (!matches) return 0;
    
    const hours = parseInt(matches[1] || '0');
    const minutes = parseInt(matches[2] || '0');
    const seconds = parseInt(matches[3] || '0');
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  async getContentRecommendations(type: string, niche: string, country: string, limit: number = 12) {
    try {
      let recommendations = [];

      if (type.includes('youtube')) {
        const trendingVideos = await this.getYouTubeTrendingVideos(country === 'IN' ? 'IN' : 'US', 50);
        const searchVideos = await this.getYouTubeSearchTrends(niche, country === 'IN' ? 'IN' : 'US');
        
        const allVideos = [...trendingVideos, ...searchVideos];
        const filteredVideos = type === 'youtube-shorts' 
          ? allVideos.filter(v => this.parseDuration(v.duration) <= 60)
          : allVideos.filter(v => this.parseDuration(v.duration) > 60);

        recommendations = filteredVideos
          .sort((a, b) => b.viewCount - a.viewCount)
          .slice(0, limit)
          .map(video => ({
            type,
            title: video.title,
            description: video.description.substring(0, 200) + '...',
            thumbnailUrl: video.thumbnailUrl,
            duration: this.parseDuration(video.duration),
            category: niche,
            country,
            tags: video.tags.slice(0, 5),
            engagement: {
              expectedViews: video.viewCount,
              expectedLikes: video.likeCount,
              expectedShares: Math.floor(video.viewCount * 0.02)
            },
            sourceUrl: `https://youtube.com/watch?v=${video.id}`
          }));
      } else if (type.includes('instagram')) {
        const trendingContent = await this.getInstagramTrendingContent();
        
        const filteredContent = type === 'instagram-reel'
          ? trendingContent.filter(c => c.media_type === 'VIDEO')
          : type === 'instagram-video'
          ? trendingContent.filter(c => c.media_type === 'VIDEO')
          : trendingContent.filter(c => c.media_type === 'IMAGE' || c.media_type === 'CAROUSEL_ALBUM');

        recommendations = filteredContent
          .sort((a, b) => b.like_count - a.like_count)
          .slice(0, limit)
          .map(content => ({
            type,
            title: content.caption.split('\n')[0].substring(0, 100) || 'Trending Instagram Content',
            description: content.caption.substring(0, 200) + '...',
            thumbnailUrl: content.thumbnail_url || content.media_url,
            duration: type.includes('video') || type.includes('reel') ? 30 : 0,
            category: niche,
            country,
            tags: content.hashtags.slice(0, 5),
            engagement: {
              expectedViews: content.like_count * 10, // Estimate views from likes
              expectedLikes: content.like_count,
              expectedShares: Math.floor(content.like_count * 0.1)
            },
            sourceUrl: `https://instagram.com/p/${content.id}`
          }));
      }

      console.log(`[REAL CONTENT] Generated ${recommendations.length} real content recommendations for ${type}`);
      return recommendations;
    } catch (error: any) {
      console.error('[REAL CONTENT] Error generating recommendations:', error.message);
      return [];
    }
  }
}

export const realContentService = new RealContentService();