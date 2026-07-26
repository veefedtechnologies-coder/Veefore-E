import { ISourceAdapter, FetchResult } from './ISourceAdapter';
import { IListeningSource } from '../../../models/SocialListening/ListeningSource';
import { scoreRelevance } from '../relevance';
import ytSearch from 'yt-search';

/**
 * Convert yt-search relative "ago" strings (e.g. "3 days ago", "2 weeks ago")
 * into an approximate Date. Falls back to now when not parseable.
 */
function parseAgo(ago?: string): Date {
  if (!ago) return new Date();
  const match = ago.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!match) return new Date();

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = Date.now();
  const ms: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000
  };
  return new Date(now - amount * (ms[unit] || 0));
}

export class YouTubeAdapter implements ISourceAdapter {
  platform = 'youtube';

  async fetchLatest(source: IListeningSource, cursor?: string, niche?: string): Promise<FetchResult> {
    try {
      const strictNiche = niche?.trim();
      if (!strictNiche) {
        throw new Error('Niche is required for authentic YouTube ingestion.');
      }

      // Search many query variants so we capture trending, evergreen, tutorial,
      // review, news and opinion angles — far wider coverage than before.
      const queries = [
        strictNiche,
        `${strictNiche} tips`,
        `${strictNiche} trending`,
        `${strictNiche} 2025`,
        `${strictNiche} how to`,
        `${strictNiche} review`,
        `best ${strictNiche}`,
        `${strictNiche} explained`,
      ];
      console.log(`[YouTubeAdapter] Fetching for term: ${strictNiche}`);

      const results = await Promise.allSettled(queries.map((q) => ytSearch(q)));

      const seen = new Set<string>();
      const posts: any[] = [];

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const videos = (r.value.videos || []).slice(0, 40);
        for (const video of videos) {
          const externalId = `yt_${video.videoId}`;
          if (seen.has(externalId)) continue;
          seen.add(externalId);

          const title = video.title || '';
          const description = video.description || '';
          const relevance = scoreRelevance(`${title} ${description} ${video.author?.name || ''}`, strictNiche);

          posts.push({
            platform: 'youtube',
            externalId,
            url: video.url,
            title,
            content: description || title,
            author: {
              username: video.author?.name || 'Unknown Channel',
              profileUrl: video.author?.url
            },
            metrics: {
              likes: 0,
              comments: 0,
              shares: 0,
              views: video.views || 0,
              engagementRate: 0
            },
            relevanceScore: relevance,
            publishedAt: parseAgo(video.ago)
          });
        }
      }

      // Most-viewed first.
      posts.sort((a, b) => (b.metrics.views || 0) - (a.metrics.views || 0));

      console.log(`[YouTubeAdapter] Collected ${posts.length} unique videos for term: ${strictNiche}`);
      return { posts, nextCursor: undefined };
    } catch (error) {
      console.error(`[YouTubeAdapter] Error fetching for ${source.value}:`, error);
      return { posts: [], nextCursor: undefined };
    }
  }

  async fetchComments(externalId: string, max: number = 50): Promise<any[]> {
    // yt-search doesn't expose comments; would require the official Data API.
    return [];
  }
}
