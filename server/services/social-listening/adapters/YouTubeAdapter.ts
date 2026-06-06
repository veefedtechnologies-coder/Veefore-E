import { ISourceAdapter, FetchResult } from './ISourceAdapter';
import { IListeningSource } from '../../../models/SocialListening/ListeningSource';
import ytSearch from 'yt-search';

export class YouTubeAdapter implements ISourceAdapter {
  platform = 'youtube';

  async fetchLatest(source: IListeningSource, cursor?: string, niche?: string): Promise<FetchResult> {
    try {
      const strictNiche = niche?.trim();
      if (!strictNiche) {
        throw new Error('Niche is required for authentic YouTube ingestion.');
      }
      const searchTerm = `${strictNiche} trending`;
      console.log(`[YouTubeAdapter] Fetching latest for ${searchTerm}`);
      
      const searchResult = await ytSearch(searchTerm);
      const videos = searchResult.videos.slice(0, 25);
      const nicheLower = strictNiche.toLowerCase();

      const posts = videos.map((video) => {
        return {
          platform: 'youtube',
          externalId: `yt_${video.videoId}`,
          url: video.url,
          title: video.title,
          content: video.description || '',
          author: {
            username: video.author?.name || 'Unknown Channel',
          },
          metrics: {
            likes: 0, // yt-search doesn't provide exact likes in basic search
            comments: 0,
            shares: 0,
            views: video.views || 0
          },
          // Fallback to relative time or now if unavailable
          publishedAt: new Date()
        };
      }); // Removed strict .includes() filter to trust YouTube's native semantic search

      return {
        posts,
        nextCursor: undefined // yt-search doesn't natively support pagination cursors easily here
      };
    } catch (error) {
      console.error(`[YouTubeAdapter] Error fetching for ${source.value}:`, error);
      return { posts: [], nextCursor: undefined };
    }
  }

  async fetchComments(externalId: string, max: number = 50): Promise<any[]> {
    // Note: yt-search doesn't fetch comments. We would need youtube-comment-scraper 
    // or official API. For now, returning empty so it doesn't crash.
    return [];
  }
}
