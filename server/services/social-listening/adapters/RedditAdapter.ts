import { ISourceAdapter, FetchResult } from './ISourceAdapter';
import { IListeningSource } from '../../../models/SocialListening/ListeningSource';
import axios from 'axios';

export class RedditAdapter implements ISourceAdapter {
  platform = 'reddit';

  async fetchLatest(source: IListeningSource, cursor?: string, niche?: string): Promise<FetchResult> {
    try {
      const strictNiche = niche?.trim();
      if (!strictNiche) {
        throw new Error('Niche is required for authentic Reddit ingestion.');
      }
      console.log(`[RedditAdapter] Fetching latest for ${source.value} in niche: ${strictNiche}`);
      
      const isSubreddit = source.type === 'hashtag' || source.value.startsWith('r/');
      const query = source.value.replace('r/', '');
      
      let url = '';
      if (isSubreddit) {
        url = `https://www.reddit.com/r/${query}/top.json?t=day&limit=25`;
      } else {
        url = `https://www.reddit.com/search.json?q=${encodeURIComponent(strictNiche)}&sort=top&t=day&limit=25`;
      }

      if (cursor) {
        url += `&after=${cursor}`;
      }

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Veefore-Social-Intelligence/1.0.0 (by Arpit)'
        }
      });

      const children = response.data?.data?.children || [];
      const after = response.data?.data?.after;

      const nicheLower = strictNiche.toLowerCase();
      const posts = children.map((child: any) => {
        const postData = child.data;
        return {
          platform: 'reddit',
          externalId: `reddit_${postData.id}`,
          url: `https://reddit.com${postData.permalink}`,
          title: postData.title || `Reddit post in ${postData.subreddit_name_prefixed}`,
          content: postData.selftext || '',
          author: {
            username: postData.author,
          },
          metrics: {
            likes: postData.score || 0,
            comments: postData.num_comments || 0,
            shares: 0,
            views: 0
          },
          publishedAt: new Date(postData.created_utc * 1000)
        };
      }); // Removed strict .includes() filter to trust Reddit's native semantic search

      return {
        posts,
        nextCursor: after
      };
    } catch (error) {
      console.error(`[RedditAdapter] Error fetching for ${source.value}:`, error);
      return { posts: [], nextCursor: undefined };
    }
  }

  async fetchComments(externalId: string, max: number = 50): Promise<any[]> {
    try {
      const redditId = externalId.replace('reddit_', '');
      const url = `https://www.reddit.com/comments/${redditId}.json?limit=${max}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Veefore-Social-Intelligence/1.0.0 (by Arpit)'
        }
      });

      const children = response.data?.[1]?.data?.children || [];
      
      return children
        .filter((child: any) => child.kind === 't1')
        .map((child: any) => {
          const commentData = child.data;
          return {
            platform: 'reddit',
            externalId: `reddit_comment_${commentData.id}`,
            url: `https://reddit.com${commentData.permalink}`,
            content: commentData.body || '',
            author: { username: commentData.author },
            metrics: { likes: commentData.score || 0, replies: commentData.replies ? 1 : 0 },
            publishedAt: new Date(commentData.created_utc * 1000)
          };
        });
    } catch (error) {
      console.error(`[RedditAdapter] Error fetching comments for ${externalId}:`, error);
      return [];
    }
  }
}
