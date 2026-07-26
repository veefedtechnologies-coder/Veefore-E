import { ISourceAdapter, FetchResult } from './ISourceAdapter';
import { IListeningSource } from '../../../models/SocialListening/ListeningSource';
import { scoreRelevance } from '../relevance';
import axios from 'axios';

/**
 * Google News adapter via the public RSS feed (no API key required).
 * Provides fresh, broad coverage of what the press is publishing about a niche.
 */
export class GoogleNewsAdapter implements ISourceAdapter {
  platform = 'news';

  async fetchLatest(source: IListeningSource, cursor?: string, niche?: string): Promise<FetchResult> {
    try {
      const strictNiche = niche?.trim();
      if (!strictNiche) {
        throw new Error('Niche is required for authentic news ingestion.');
      }
      console.log(`[GoogleNewsAdapter] Fetching for term: ${strictNiche}`);

      // Multiple query angles widen coverage: the core niche, news/updates,
      // and trends. Google News RSS returns up to ~100 items per feed.
      const angles = [strictNiche, `${strictNiche} news`, `${strictNiche} trends`, `${strictNiche} update`];
      const responses = await Promise.allSettled(
        angles.map((a) =>
          axios.get(
            `https://news.google.com/rss/search?q=${encodeURIComponent(a)}&hl=en-US&gl=US&ceid=US:en`,
            {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Veefore-Social-Intelligence/1.0)' },
              timeout: 15000,
              responseType: 'text',
            }
          )
        )
      );

      const seen = new Set<string>();
      const items: Array<{ title: string; link: string; description: string; pubDate: string; guid: string; source: string }> = [];
      for (const r of responses) {
        if (r.status !== 'fulfilled') continue;
        for (const item of this.parseRssItems(r.value.data || '')) {
          const dedupeKey = (item.guid || item.link || item.title || '').trim();
          if (!dedupeKey || seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          items.push(item);
        }
      }

      const posts = items.slice(0, 120).map((item, idx) => {
        const cleanTitle = this.decode(item.title);
        const cleanDesc = this.stripHtml(this.decode(item.description));
        const relevance = scoreRelevance(`${cleanTitle} ${cleanDesc}`, strictNiche);
        const externalId = item.guid
          ? `news_${this.hash(item.guid)}`
          : `news_${this.hash(item.link || cleanTitle || String(idx))}`;
        return {
          platform: 'news',
          externalId,
          url: item.link || '',
          title: cleanTitle,
          content: cleanDesc || cleanTitle,
          author: { username: item.source || 'News' },
          metrics: { likes: 0, comments: 0, shares: 0, views: 0, engagementRate: 0 },
          relevanceScore: relevance,
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date()
        };
      });

      console.log(`[GoogleNewsAdapter] Collected ${posts.length} articles for term: ${strictNiche}`);
      return { posts, nextCursor: undefined };
    } catch (error) {
      console.error(`[GoogleNewsAdapter] Error fetching for ${source.value}:`, error);
      return { posts: [], nextCursor: undefined };
    }
  }

  async fetchComments(): Promise<any[]> {
    return [];
  }

  private parseRssItems(xml: string): Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    guid: string;
    source: string;
  }> {
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      items.push({
        title: this.extractTag(block, 'title'),
        link: this.extractTag(block, 'link'),
        description: this.extractTag(block, 'description'),
        pubDate: this.extractTag(block, 'pubDate'),
        guid: this.extractTag(block, 'guid'),
        source: this.extractTag(block, 'source')
      });
    }
    return items;
  }

  private extractTag(block: string, tag: string): string {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = block.match(re);
    if (!m) return '';
    return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  }

  private stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private decode(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  private hash(input: string): string {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = (h << 5) - h + input.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }
}
