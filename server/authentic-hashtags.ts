import { storage } from './storage';

interface AuthenticHashtag {
  tag: string;
  platforms: string[];
  engagement: number;
  source: string;
  realData: boolean;
  category: string;
  popularity: number;
  growthPotential: number;
}

export async function getAuthenticHashtags(workspaceId: string, category: string = 'all'): Promise<AuthenticHashtag[]> {
  console.log('[AUTHENTIC HASHTAGS] Starting real data analysis for workspace:', workspaceId);
  
  const authenticHashtags = new Map<string, any>();

  try {
    // Get connected social accounts
    const socialAccounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    const instagramAccount = socialAccounts.find(acc => acc.platform === 'instagram');
    
    if (!instagramAccount || !instagramAccount.accessToken) {
      console.log('[AUTHENTIC HASHTAGS] No Instagram account connected - cannot provide authentic hashtag data');
      return [];
    }

    console.log('[AUTHENTIC HASHTAGS] Analyzing Instagram account:', instagramAccount.username);

    // 1. Extract hashtags from user's recent Instagram posts
    const postsResponse = await fetch(
      `https://graph.instagram.com/me/media?fields=caption,like_count,comments_count,timestamp,media_type&limit=50&access_token=${instagramAccount.accessToken}`
    );

    if (postsResponse.ok) {
      const postsData = await postsResponse.json();
      const posts = postsData.data || [];
      
      console.log('[AUTHENTIC HASHTAGS] Analyzing', posts.length, 'Instagram posts');

      for (const post of posts) {
        const caption = post.caption || '';
        const hashtagMatches = caption.match(/#[\w]+/g);
        
        if (hashtagMatches) {
          for (const hashtag of hashtagMatches) {
            const tag = hashtag.substring(1).toLowerCase();
            if (tag.length >= 3 && tag.length <= 30) {
              const current = authenticHashtags.get(tag) || {
                count: 0,
                platforms: new Set(['instagram']),
                engagement: 0,
                source: 'user_posts',
                realData: true
              };
              
              current.count += 1;
              const realEngagement = (post.like_count || 0) + (post.comments_count || 0);
              current.engagement = Math.max(current.engagement, realEngagement);
              authenticHashtags.set(tag, current);
            }
          }
        }
      }
    }

    // 2. Get hashtags from Instagram's hashtag search endpoint
    if (category !== 'all') {
      try {
        const hashtagSearchResponse = await fetch(
          `https://graph.instagram.com/ig_hashtag_search?user_id=${instagramAccount.accountId}&q=${category}&access_token=${instagramAccount.accessToken}`
        );

        if (hashtagSearchResponse.ok) {
          const searchData = await hashtagSearchResponse.json();
          const hashtags = searchData.data || [];
          
          console.log('[AUTHENTIC HASHTAGS] Found', hashtags.length, 'category hashtags');

          for (const hashtagObj of hashtags) {
            const tag = hashtagObj.name?.toLowerCase();
            if (tag && tag.length >= 3) {
              // Get detailed hashtag information
              try {
                const hashtagInfoResponse = await fetch(
                  `https://graph.instagram.com/${hashtagObj.id}?fields=name,media_count&access_token=${instagramAccount.accessToken}`
                );
                
                if (hashtagInfoResponse.ok) {
                  const hashtagInfo = await hashtagInfoResponse.json();
                  const current = authenticHashtags.get(tag) || {
                    count: 0,
                    platforms: new Set(['instagram']),
                    engagement: 0,
                    source: 'instagram_search',
                    realData: true
                  };
                  
                  current.count += 2;
                  current.engagement = Math.max(current.engagement, hashtagInfo.media_count || 0);
                  authenticHashtags.set(tag, current);
                }
              } catch (detailError) {
                console.log('[AUTHENTIC HASHTAGS] Failed to get hashtag details for:', tag);
              }
            }
          }
        }
      } catch (searchError) {
        const errorMessage = searchError instanceof Error ? searchError.message : 'Unknown search error occurred';
        console.log('[AUTHENTIC HASHTAGS] Hashtag search failed:', errorMessage);
      }
    }

    // Convert to final format
    const finalHashtags: AuthenticHashtag[] = Array.from(authenticHashtags.entries())
      .filter(([tag, data]) => data.count > 0)
      .map(([tag, data]) => {
        const platforms = Array.from(data.platforms);
        const popularity = Math.min(100, Math.max(10, data.engagement > 0 ? Math.log10(data.engagement + 1) * 15 : 20));
        const growthPotential = Math.min(100, popularity + (data.count * 5));
        
        // Categorize based on common hashtag patterns
        let hashtagCategory = 'general';
        if (['fitness', 'workout', 'gym', 'health', 'training', 'wellness', 'sport'].some(w => tag.includes(w))) {
          hashtagCategory = 'fitness';
        } else if (['food', 'recipe', 'cooking', 'foodie', 'delicious', 'eat'].some(w => tag.includes(w))) {
          hashtagCategory = 'food';
        } else if (['travel', 'vacation', 'adventure', 'explore', 'wanderlust', 'trip'].some(w => tag.includes(w))) {
          hashtagCategory = 'travel';
        } else if (['fashion', 'style', 'ootd', 'outfit', 'trendy', 'clothing'].some(w => tag.includes(w))) {
          hashtagCategory = 'fashion';
        } else if (['business', 'entrepreneur', 'startup', 'leadership', 'networking', 'work'].some(w => tag.includes(w))) {
          hashtagCategory = 'business';
        } else if (['tech', 'technology', 'ai', 'coding', 'innovation', 'software'].some(w => tag.includes(w))) {
          hashtagCategory = 'technology';
        } else if (['lifestyle', 'life', 'daily', 'mindfulness', 'selfcare', 'wellness'].some(w => tag.includes(w))) {
          hashtagCategory = 'lifestyle';
        }

        return {
          tag,
          platforms,
          engagement: data.engagement,
          source: data.source,
          realData: true,
          category: hashtagCategory,
          popularity: Math.round(popularity),
          growthPotential: Math.round(growthPotential)
        };
      })
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 25);

    console.log('[AUTHENTIC HASHTAGS] Returning', finalHashtags.length, 'authentic hashtags with real engagement data');
    return finalHashtags;

  } catch (error) {
    console.error('[AUTHENTIC HASHTAGS] Error analyzing authentic hashtags:', error);
    return [];
  }
}