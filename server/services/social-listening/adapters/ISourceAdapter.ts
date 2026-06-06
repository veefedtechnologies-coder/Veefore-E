import { IListeningSource } from '../../../models/SocialListening/ListeningSource';
import { IListeningPost } from '../../../models/SocialListening/ListeningPost';

export interface FetchResult {
  posts: Partial<IListeningPost>[];
  nextCursor?: string;
}

export interface ISourceAdapter {
  platform: string;
  
  /**
   * Fetch latest posts for a given source
   * @param source The ListeningSource containing keywords or topics
   * @param cursor Pagination cursor
   */
  fetchLatest(source: IListeningSource, cursor?: string, niche?: string): Promise<FetchResult>;
  
  /**
   * Fetch comments for a specific post
   * @param externalId The post ID on the origin platform
   */
  fetchComments(externalId: string, max?: number): Promise<any[]>;
}
