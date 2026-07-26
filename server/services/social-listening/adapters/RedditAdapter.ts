import { ISourceAdapter, FetchResult } from './ISourceAdapter';
import { IListeningSource } from '../../../models/SocialListening/ListeningSource';
import { scoreRelevance } from '../relevance';
import axios from 'axios';

/**
 * Reddit adapter — NO-API (RSS) first.
 *
 * Reddit's public JSON endpoints (`/*.json`) now return HTTP 403 for
 * server/datacenter IPs, and app-only OAuth needs valid credentials (which many
 * setups no longer have). What still works WITHOUT any API key is Reddit's
 * Atom/RSS feeds (`/search.rss`, `/r/<sub>/<sort>/.rss`) when requested with a
 * normal browser User-Agent — verified returning real `t3_` post entries.
 *
 * So we lead with RSS. If valid OAuth credentials ARE configured we opportun-
 * istically use the JSON API instead (it carries richer metrics like score /
 * comment counts); otherwise we fall back to RSS, which has the post title,
 * body, author, link and timestamp — everything the AI analysis needs.
 *
 * RSS rate-limits aggressively under bursts (HTTP 429), so RSS requests are
 * issued SEQUENTIALLY with a short delay + a single backoff retry, rather than
 * the parallel fan-out the JSON path used.
 */

// Browser-like UA — required for the RSS feeds to return 200 instead of 429/403.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const OAUTH_UA = 'web:veefore-social-intelligence:v1.0.0 (social listening)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cached app-only OAuth token so we don't re-auth on every request. */
let cachedToken: { token: string; expiresAt: number } | null = null;
// Once we learn OAuth creds are invalid (401), stop retrying for a while so we
// don't waste a request (and log spam) on every sync.
let oauthDisabledUntil = 0;

async function getRedditAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (Date.now() < oauthDisabledUntil) return null;

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const resp = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OAUTH_UA,
        },
        timeout: 15000,
      }
    );
    const token = resp.data?.access_token;
    const expiresIn = resp.data?.expires_in || 3600;
    if (!token) return null;
    cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  } catch (error: any) {
    const status = error?.response?.status;
    // Invalid creds (401/403) → disable OAuth for an hour and use RSS instead.
    if (status === 401 || status === 403) {
      oauthDisabledUntil = Date.now() + 60 * 60_000;
      console.warn('[RedditAdapter] OAuth credentials rejected (HTTP ' + status + '); using no-API RSS for the next hour.');
    } else {
      console.warn('[RedditAdapter] OAuth token request failed:', (error as Error).message);
    }
    return null;
  }
}

export class RedditAdapter implements ISourceAdapter {
  platform = 'reddit';

  /** GET an RSS feed with a browser UA + one backoff retry on 429/5xx. */
  private async fetchRss(url: string): Promise<string | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await axios.get(url, {
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'application/atom+xml,application/xml,text/xml,*/*',
          },
          timeout: 15000,
          responseType: 'text',
          // We handle non-2xx ourselves so a 429 doesn't throw before retry.
          validateStatus: () => true,
        });
        if (resp.status === 200 && typeof resp.data === 'string' && resp.data.includes('<entry>')) {
          return resp.data;
        }
        if (resp.status === 429 || resp.status >= 500) {
          await sleep(2500 * (attempt + 1)); // back off, then retry once
          continue;
        }
        // 403/404/etc. — not retryable.
        console.warn(`[RedditAdapter] RSS ${url} → HTTP ${resp.status}`);
        return null;
      } catch (e) {
        await sleep(1500);
      }
    }
    return null;
  }

  /** Parse Reddit Atom feed XML into post objects (only real `t3_` posts). */
  private parseAtom(xml: string, strictNiche: string): any[] {
    const posts: any[] = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null) {
      const block = m[1];
      const id = this.tag(block, 'id');
      // Skip subreddits (t5_), comments and anything that isn't a post (t3_).
      if (!id.startsWith('t3_')) continue;

      const title = this.decode(this.tag(block, 'title'));
      const contentHtml = this.tag(block, 'content');
      const body = this.stripHtml(this.decode(contentHtml));
      const linkHref = this.attr(block, 'link', 'href') || `https://www.reddit.com/${id}`;
      // <author><name>/u/foo</name></author>
      const authorBlock = (block.match(/<author>([\s\S]*?)<\/author>/) || [, ''])[1];
      const author = this.decode(this.tag(authorBlock, 'name')).replace(/^\/u\//, '') || 'unknown';
      const published = this.tag(block, 'published') || this.tag(block, 'updated');

      const relevance = scoreRelevance(`${title} ${body}`, strictNiche);
      posts.push({
        platform: 'reddit',
        externalId: `reddit_${id.replace('t3_', '')}`,
        url: linkHref,
        title: title || 'Reddit post',
        content: body || title,
        author: {
          username: author,
          profileUrl: author && author !== 'unknown' ? `https://www.reddit.com/user/${author}` : undefined,
        },
        // RSS carries no score/comment counts — those need the JSON API. Zeros
        // here just mean Reddit posts rank by relevance, not raw engagement.
        metrics: { likes: 0, comments: 0, shares: 0, views: 0, engagementRate: 0 },
        relevanceScore: relevance,
        publishedAt: published ? new Date(published) : new Date(),
      });
    }
    return posts;
  }

  async fetchLatest(source: IListeningSource, cursor?: string, niche?: string): Promise<FetchResult> {
    try {
      const strictNiche = niche?.trim();
      if (!strictNiche) {
        throw new Error('Niche is required for authentic Reddit ingestion.');
      }
      console.log(`[RedditAdapter] Fetching "${source.value}" for term: ${strictNiche}`);

      const token = await getRedditAccessToken();
      if (token) {
        const viaJson = await this.fetchViaJson(source, strictNiche, token);
        // If the JSON path actually returned posts, use it (richer metrics).
        if (viaJson.length > 0) {
          viaJson.sort((a, b) => (b.metrics.likes + b.metrics.comments) - (a.metrics.likes + a.metrics.comments));
          console.log(`[RedditAdapter] Collected ${viaJson.length} posts for "${strictNiche}" (OAuth JSON).`);
          return { posts: viaJson, nextCursor: undefined };
        }
        console.warn('[RedditAdapter] OAuth JSON returned 0 posts; falling back to RSS.');
      }

      // ---- No-API RSS path ---------------------------------------------------
      const isSubreddit = source.type === 'hashtag' || source.value.startsWith('r/');
      const q = encodeURIComponent(strictNiche);
      const sub = source.value.replace(/^r\//, '');

      // A small, sequential set of feeds (kept short to avoid RSS rate limits).
      const feeds = isSubreddit
        ? [
            `https://www.reddit.com/r/${sub}/hot/.rss?limit=50`,
            `https://www.reddit.com/r/${sub}/top/.rss?t=month&limit=50`,
          ]
        : [
            `https://www.reddit.com/search.rss?q=${q}&sort=relevance&type=link&limit=50`,
            `https://www.reddit.com/search.rss?q=${q}&sort=top&t=month&type=link&limit=50`,
          ];

      const seen = new Set<string>();
      const posts: any[] = [];
      for (let i = 0; i < feeds.length; i++) {
        if (i > 0) await sleep(1500); // gentle pacing between RSS calls
        const xml = await this.fetchRss(feeds[i]);
        if (!xml) continue;
        for (const p of this.parseAtom(xml, strictNiche)) {
          if (seen.has(p.externalId)) continue;
          seen.add(p.externalId);
          posts.push(p);
        }
      }

      posts.sort((a, b) => b.relevanceScore - a.relevanceScore);
      console.log(`[RedditAdapter] Collected ${posts.length} posts for "${strictNiche}" (no-API RSS).`);
      return { posts, nextCursor: undefined };
    } catch (error) {
      console.error(`[RedditAdapter] Error fetching for ${source.value}:`, (error as Error).message);
      return { posts: [], nextCursor: undefined };
    }
  }

  /** OAuth JSON path (only used when a valid token is available). */
  private async fetchViaJson(source: IListeningSource, strictNiche: string, token: string): Promise<any[]> {
    const host = 'https://oauth.reddit.com';
    const headers = { 'User-Agent': OAUTH_UA, Authorization: `Bearer ${token}` };
    const isSubreddit = source.type === 'hashtag' || source.value.startsWith('r/');
    const query = source.value.replace('r/', '');

    const paths = isSubreddit
      ? [`/r/${query}/top?t=month&limit=100`, `/r/${query}/hot?limit=100`]
      : [
          `/search?q=${encodeURIComponent(strictNiche)}&sort=relevance&t=month&limit=100&type=link`,
          `/search?q=${encodeURIComponent(strictNiche)}&sort=top&t=year&limit=100&type=link`,
        ];

    const responses = await Promise.allSettled(
      paths.map((p) => axios.get(`${host}${p}`, { headers, timeout: 15000 }))
    );

    const seen = new Set<string>();
    const posts: any[] = [];
    for (const r of responses) {
      if (r.status !== 'fulfilled') continue;
      for (const child of r.value.data?.data?.children || []) {
        const d = child.data;
        if (!d || d.over_18) continue;
        const externalId = `reddit_${d.id}`;
        if (seen.has(externalId)) continue;
        seen.add(externalId);
        const title = d.title || '';
        const body = d.selftext || '';
        posts.push({
          platform: 'reddit',
          externalId,
          url: `https://reddit.com${d.permalink}`,
          title: title || `Reddit post in ${d.subreddit_name_prefixed || 'reddit'}`,
          content: body || title,
          author: { username: d.author, profileUrl: d.author ? `https://reddit.com/user/${d.author}` : undefined },
          metrics: { likes: d.score || 0, comments: d.num_comments || 0, shares: 0, views: 0, engagementRate: 0 },
          relevanceScore: scoreRelevance(`${title} ${body} ${d.subreddit || ''}`, strictNiche),
          publishedAt: new Date((d.created_utc || Date.now() / 1000) * 1000),
        });
      }
    }
    return posts;
  }

  async fetchComments(externalId: string, max: number = 100): Promise<any[]> {
    const redditId = externalId.replace('reddit_', '');
    try {
      const token = await getRedditAccessToken();
      if (token) {
        const resp = await axios.get(
          `https://oauth.reddit.com/comments/${redditId}?limit=${max}&sort=top&depth=2`,
          { headers: { 'User-Agent': OAUTH_UA, Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
        const children = resp.data?.[1]?.data?.children || [];
        const out = children
          .filter((c: any) => c.kind === 't1')
          .map((c: any) => ({
            platform: 'reddit',
            externalId: `reddit_comment_${c.data.id}`,
            url: `https://reddit.com${c.data.permalink}`,
            content: c.data.body || '',
            author: { username: c.data.author },
            metrics: { likes: c.data.score || 0, replies: c.data.replies ? 1 : 0 },
            publishedAt: new Date((c.data.created_utc || Date.now() / 1000) * 1000),
          }));
        if (out.length) return out;
      }

      // No-API RSS fallback: a post's `.rss` lists its comments as entries
      // (the first entry is the post itself, which we skip).
      const xml = await this.fetchRss(`https://www.reddit.com/comments/${redditId}/.rss?limit=${max}&sort=top`);
      if (!xml) return [];
      const comments: any[] = [];
      const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
      let m: RegExpExecArray | null;
      let first = true;
      while ((m = entryRe.exec(xml)) !== null) {
        const block = m[1];
        const id = this.tag(block, 'id');
        if (!id.startsWith('t1_')) { first = false; continue; } // only comments
        first = false;
        const body = this.stripHtml(this.decode(this.tag(block, 'content')));
        if (!body) continue;
        const authorBlock = (block.match(/<author>([\s\S]*?)<\/author>/) || [, ''])[1];
        const author = this.decode(this.tag(authorBlock, 'name')).replace(/^\/u\//, '') || 'unknown';
        const published = this.tag(block, 'published') || this.tag(block, 'updated');
        comments.push({
          platform: 'reddit',
          externalId: `reddit_comment_${id.replace('t1_', '')}`,
          url: this.attr(block, 'link', 'href') || `https://www.reddit.com/${id}`,
          content: body,
          author: { username: author },
          metrics: { likes: 0, replies: 0 },
          publishedAt: published ? new Date(published) : new Date(),
        });
        if (comments.length >= max) break;
      }
      return comments;
    } catch (error) {
      console.error(`[RedditAdapter] Error fetching comments for ${externalId}:`, (error as Error).message);
      return [];
    }
  }

  // ---- tiny XML helpers ----------------------------------------------------
  private tag(block: string, tag: string): string {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
  }
  private attr(block: string, tag: string, attr: string): string {
    const m = block.match(new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`, 'i'));
    return m ? m[1] : '';
  }
  private stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  private decode(text: string): string {
    return text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
      // Generic numeric entities (e.g. &#32; → space, &#8217; → ’).
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
      .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ' '; } });
  }
}
