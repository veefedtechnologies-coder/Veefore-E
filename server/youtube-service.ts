/**
 * YouTube Data API Service - Live Data Integration
 * Fetches real-time subscriber counts, video statistics, and channel analytics
 */

import axios from 'axios';

interface YouTubeChannelStats {
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  channelTitle: string;
  channelId: string;
}

interface YouTubeVideoStats {
  videoId: string;
  title: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
}

class YouTubeService {
  private apiKey: string;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[YOUTUBE SERVICE] API key not found');
    } else {
      console.log('[YOUTUBE SERVICE] ✓ API key configured');
    }
  }

  /**
   * Get authenticated user's channel statistics using OAuth token
   */
  async getAuthenticatedChannelStats(accessToken: string): Promise<YouTubeChannelStats | null> {
    try {
      console.log('[YOUTUBE OAUTH] Fetching authenticated channel data');
      
      // First get the authenticated user's channel
      const channelResponse = await axios.get(`${this.baseUrl}/channels`, {
        params: {
          part: 'statistics,snippet',
          mine: 'true',
          key: this.apiKey
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        console.log('[YOUTUBE OAUTH] No authenticated channel found');
        return null;
      }

      const channel = channelResponse.data.items[0];
      const stats = channel.statistics;

      const channelStats: YouTubeChannelStats = {
        subscriberCount: parseInt(stats.subscriberCount || '0'),
        videoCount: parseInt(stats.videoCount || '0'),
        viewCount: parseInt(stats.viewCount || '0'),
        channelTitle: channel.snippet.title,
        channelId: channel.id
      };

      console.log(`[YOUTUBE OAUTH] ✓ Authenticated channel: ${channelStats.channelTitle}`);
      console.log(`[YOUTUBE OAUTH] ✓ Stats: ${channelStats.subscriberCount} subscribers, ${channelStats.videoCount} videos, ${channelStats.viewCount} views`);

      return channelStats;
      
    } catch (error: any) {
      console.error('[YOUTUBE OAUTH] Error fetching authenticated channel stats:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get channel statistics by channel ID
   */
  async getChannelStats(channelId: string): Promise<YouTubeChannelStats | null> {
    try {
      console.log(`[YOUTUBE API] Fetching channel stats for: ${channelId}`);
      
      const response = await axios.get(`${this.baseUrl}/channels`, {
        params: {
          part: 'statistics,snippet',
          id: channelId,
          key: this.apiKey
        }
      });

      if (!response.data.items || response.data.items.length === 0) {
        console.log(`[YOUTUBE API] No channel found for ID: ${channelId}`);
        return null;
      }

      const channel = response.data.items[0];
      const stats = channel.statistics;
      const snippet = channel.snippet;

      const channelStats = {
        subscriberCount: parseInt(stats.subscriberCount || '0'),
        videoCount: parseInt(stats.videoCount || '0'),
        viewCount: parseInt(stats.viewCount || '0'),
        channelTitle: snippet.title,
        channelId: channel.id
      };

      console.log(`[YOUTUBE API] ✓ Channel stats retrieved:`, {
        title: channelStats.channelTitle,
        subscribers: channelStats.subscriberCount,
        videos: channelStats.videoCount,
        views: channelStats.viewCount
      });

      return channelStats;
    } catch (error: any) {
      console.error(`[YOUTUBE API] Error fetching channel stats:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Search for channel by username/handle
   */
  async findChannelByUsername(username: string): Promise<string | null> {
    try {
      console.log(`[YOUTUBE API] Searching for channel: ${username}`);
      
      // Try search by username
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          q: username,
          type: 'channel',
          maxResults: 1,
          key: this.apiKey
        }
      });

      if (!response.data.items || response.data.items.length === 0) {
        console.log(`[YOUTUBE API] No channel found for username: ${username}`);
        return null;
      }

      const channelId = response.data.items[0].snippet.channelId;
      console.log(`[YOUTUBE API] ✓ Found channel ID: ${channelId} for ${username}`);
      
      return channelId;
    } catch (error: any) {
      console.error(`[YOUTUBE API] Error searching channel:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get recent videos from channel
   */
  async getChannelVideos(channelId: string, maxResults: number = 10): Promise<YouTubeVideoStats[]> {
    try {
      console.log(`[YOUTUBE API] Fetching videos for channel: ${channelId}`);
      
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          channelId: channelId,
          type: 'video',
          order: 'date',
          maxResults: maxResults,
          key: this.apiKey
        }
      });

      if (!response.data.items || response.data.items.length === 0) {
        console.log(`[YOUTUBE API] No videos found for channel: ${channelId}`);
        return [];
      }

      const videoIds = response.data.items.map((item: any) => item.id.videoId);
      
      // Get video statistics
      const statsResponse = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'statistics,snippet',
          id: videoIds.join(','),
          key: this.apiKey
        }
      });

      const videos: YouTubeVideoStats[] = statsResponse.data.items.map((video: any) => ({
        videoId: video.id,
        title: video.snippet.title,
        viewCount: parseInt(video.statistics.viewCount || '0'),
        likeCount: parseInt(video.statistics.likeCount || '0'),
        commentCount: parseInt(video.statistics.commentCount || '0'),
        publishedAt: video.snippet.publishedAt
      }));

      console.log(`[YOUTUBE API] ✓ Retrieved ${videos.length} videos`);
      return videos;
    } catch (error: any) {
      console.error(`[YOUTUBE API] Error fetching videos:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Update YouTube account data with live API data
   */
  async syncYouTubeAccount(accountId: string, channelId?: string, username?: string): Promise<YouTubeChannelStats | null> {
    try {
      console.log(`[YOUTUBE SYNC] Starting sync for account: ${accountId}`);
      
      let targetChannelId = channelId;
      
      // If no channel ID provided, try to find by username
      if (!targetChannelId && username) {
        targetChannelId = await this.findChannelByUsername(username);
      }

      if (!targetChannelId) {
        console.log(`[YOUTUBE SYNC] No channel ID found for account: ${accountId}`);
        return null;
      }

      // Get live channel statistics
      const stats = await this.getChannelStats(targetChannelId);
      
      if (!stats) {
        console.log(`[YOUTUBE SYNC] Failed to retrieve stats for channel: ${targetChannelId}`);
        return null;
      }

      console.log(`[YOUTUBE SYNC] ✓ Live data retrieved for ${stats.channelTitle}:`, {
        subscribers: stats.subscriberCount,
        videos: stats.videoCount,
        views: stats.viewCount
      });

      return stats;
    } catch (error: any) {
      console.error(`[YOUTUBE SYNC] Error syncing account:`, error.message);
      return null;
    }
  }
}

export const youtubeService = new YouTubeService();
export default youtubeService;