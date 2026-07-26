import { ISourceAdapter, FetchResult } from './ISourceAdapter';
import { IListeningSource } from '../../../models/SocialListening/ListeningSource';
import { scoreRelevance } from '../relevance';
import axios from 'axios';

/**
 * Hacker News adapter via the public Algolia HN Search API (no API key required).
 * Great for tech, startup, AI, and product-related niches.
 * Docs: https://hn.algolia.com/api
 */
export class HackerNewsAdapter implements ISourceAdapter {
  platform = 'hackernews';

  async fetchLatest(source: IListeningSource, cursor?: string, niche?: string): Promise<FetchResult> {
    try {
      const strictNiche = niche?.trim();
      if (!strictNiche) {
        throw new Error('Niche is required for authentic Hacker News ingestion.');
      }
      console.log(`[HackerNewsAdapter] Fetching for term: ${strictNiche}`);

      // Pull both relevance-ranked stories AND the latest stories, plus matching
      // comments, for much broader coverage of the conversation around a niche.
      const q = encodeURIComponent(strictNiche);
      const urls = [
        `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=100`,
        `https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=story&hitsPerPage=100`,
        `https://hn.algolia.com/api/v1/search?query=${q}&tags=comment&hitsPerPage=50`,
      ];

      const responses = await Promise.allSettled(
        urls.map((u) => axios.get(u, { timeout: 15000 }))
      );

      const seen = new Set<string>();
      const hits: any[] = [];
      for (const r of responses) {
        if (r.status !== 'fulfilled') continue;
        for (const hit of r.value.data?.hits || []) {
          const id = hit.objectID;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          hits.push(hit);
        }
      }

      const posts = hits
        .filter((hit: any) => hit.title || hit.story_text || hit.comment_text)
        .map((hit: any) => {
          const title = hit.title || '';
          const body = hit.story_text || hit.comment_text || '';
          const relevance = scoreRelevance(`${title} ${body}`, strictNiche);
          return {
            platform: 'hackernews',
            externalId: `hn_${hit.objectID}`,
            url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            title,
            content: body || title,
            author: { username: hit.author || 'unknown' },
            metrics: {
              likes: hit.points || 0,
              comments: hit.num_comments || 0,
              shares: 0,
              views: 0,
              engagementRate: 0
            },
            relevanceScore: relevance,
            publishedAt: hit.created_at ? new Date(hit.created_at) : new Date()
          };
        });

      posts.sort((a: any, b: any) => (b.metrics.likes + b.metrics.comments) - (a.metrics.likes + a.metrics.comments));

      console.log(`[HackerNewsAdapter] Collected ${posts.length} stories for term: ${strictNiche}`);
      return { posts, nextCursor: undefined };
    } catch (error) {
      console.error(`[HackerNewsAdapter] Error fetching for ${source.value}:`, error);
      return { posts: [], nextCursor: undefined };
    }
  }

  async fetchComments(externalId: string, max: number = 100): Promise<any[]> {
    try {
      const id = externalId.replace('hn_', '');
      const url = `https://hn.algolia.com/api/v1/items/${id}`;
      const response = await axios.get(url, { timeout: 15000 });
      const children = response.data?.children || [];
      return children
        .filter((c: any) => c.text)
        .slice(0, max)
        .map((c: any) => ({
          platform: 'hackernews',
          externalId: `hn_comment_${c.id}`,
          url: `https://news.ycombinator.com/item?id=${c.id}`,
          content: c.text || '',
          author: { username: c.author || 'unknown' },
          metrics: { likes: c.points || 0, replies: c.children?.length || 0 },
          publishedAt: c.created_at ? new Date(c.created_at) : new Date()
        }));
    } catch (error) {
      console.error(`[HackerNewsAdapter] Error fetching comments for ${externalId}:`, error);
      return [];
    }
  }
}
