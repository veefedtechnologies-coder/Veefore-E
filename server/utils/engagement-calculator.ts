/**
 * Social Media Engagement Rate Calculator
 * 
 * This utility module provides different engagement rate calculations
 * optimized for different account sizes and use cases.
 */

// TypeScript interfaces for type safety
export interface EngagementData {
  likes: number;
  comments: number;
  shares?: number;
  saves?: number;
  followers: number;
  reach?: number;
}

export interface PostEngagementData {
  likes: number;
  comments: number;
  shares?: number;
  saves?: number;
}

export interface MultiPostEngagementData {
  posts: PostEngagementData[];
  followers: number;
  reach?: number;
}

export interface EngagementResult {
  rate: number;
  method: 'ERF' | 'AER' | 'ERR';
  totalEngagements: number;
  description: string;
}

/**
 * Calculate Engagement Rate by Followers (ERF)
 * Industry standard for accounts with substantial follower base
 * Formula: (Likes + Comments + Shares + Saves) / Followers * 100
 */
export function calculateERF(data: EngagementData): number {
  const { likes, comments, shares = 0, saves = 0, followers } = data;
  
  if (followers < 0) {
    throw new Error('Followers count cannot be negative');
  }
  
  // Handle edge case of 0 followers with a special approach
  if (followers === 0) {
    console.log('[ENGAGEMENT CALC] ⚠️ Account with 0 followers detected');
    return 0; // 0% engagement rate for accounts with no followers
  }
  
  const totalEngagements = likes + comments + shares + saves;
  const engagementRate = (totalEngagements / followers) * 100;
  
  return Math.round(engagementRate * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate Average Engagement Rate (AER)
 * Useful for measuring account health over multiple posts
 * Formula: (Total Engagements across N posts) / (N × Followers) * 100
 */
export function calculateAER(data: MultiPostEngagementData): number {
  const { posts, followers } = data;
  
  if (followers < 0) {
    throw new Error('Followers count cannot be negative');
  }
  
  // Handle edge case of 0 followers with a special approach
  if (followers === 0) {
    console.log('[ENGAGEMENT CALC] ⚠️ Account with 0 followers detected');
    return 0; // 0% engagement rate for accounts with no followers
  }
  
  if (posts.length === 0) {
    throw new Error('At least one post is required');
  }
  
  const totalEngagements = posts.reduce((sum, post) => {
    return sum + post.likes + post.comments + (post.shares || 0) + (post.saves || 0);
  }, 0);
  
  const averageEngagementRate = (totalEngagements / (posts.length * followers)) * 100;
  
  return Math.round(averageEngagementRate * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate Engagement Rate by Reach (ERR)
 * Best for small accounts where follower-based rate looks unrealistic
 * Formula: (Engagements / Reach) * 100
 */
export function calculateERR(data: EngagementData): number {
  const { likes, comments, shares = 0, saves = 0, reach } = data;
  
  if (!reach || reach <= 0) {
    throw new Error('Reach must be provided and greater than 0');
  }
  
  const totalEngagements = likes + comments + shares + saves;
  const engagementRate = (totalEngagements / reach) * 100;
  
  return Math.round(engagementRate * 100) / 100; // Round to 2 decimal places
}

/**
 * Smart Engagement Calculator
 * Automatically chooses the best engagement rate method based on account size
 * and available data
 */
export function calculateSmartEngagement(data: EngagementData): EngagementResult {
  const { likes, comments, shares = 0, saves = 0, followers, reach } = data;
  const totalEngagements = likes + comments + shares + saves;
  
  // Data quality check: If reach is suspiciously low compared to engagements, the data is wrong
  const isReachDataSuspicious = reach && reach > 0 && totalEngagements > reach * 2;
  
  // For small accounts (0-100 followers), prefer ERR if reach is available and reliable
  // This includes very small accounts (0+ followers) when they have reach data
  if (followers >= 0 && followers <= 100 && reach && reach > 0 && !isReachDataSuspicious) {
    const errRate = calculateERR(data);
    // Cap at 100% - anything over 100% means data quality issues
    const cappedRate = Math.min(errRate, 100);
    return {
      rate: cappedRate,
      method: 'ERR',
      totalEngagements,
      description: `Engagement Rate by Reach: ${cappedRate}% (${totalEngagements} engagements from ${reach} people reached)${errRate > 100 ? ' - capped at 100% due to data anomaly' : ''}`
    };
  }
  
  // For larger accounts, suspicious reach data, or when reach is not available, use ERF
  const erfRate = calculateERF(data);
  // Cap at 100% for sanity
  const cappedErfRate = Math.min(erfRate, 100);
  return {
    rate: cappedErfRate,
    method: isReachDataSuspicious ? 'ERF (reach data unreliable)' : 'ERF',
    totalEngagements,
    description: `Engagement Rate by Followers: ${cappedErfRate}% (${totalEngagements} engagements from ${followers} followers)${isReachDataSuspicious ? ' - using follower-based rate due to suspicious reach data' : ''}`
  };
}

/**
 * Calculate engagement for multiple posts with user-selected post count
 * Allows users to analyze engagement for last N posts
 */
export function calculateEngagementForLastPosts(
  data: MultiPostEngagementData, 
  postCount: number
): EngagementResult {
  const { posts, followers, reach } = data;
  
  if (postCount <= 0 || postCount > posts.length) {
    throw new Error(`Post count must be between 1 and ${posts.length}`);
  }
  
  // Get the last N posts
  const lastPosts = posts.slice(-postCount);
  
  // Calculate total engagements for selected posts
  const totalEngagements = lastPosts.reduce((sum, post) => {
    return sum + post.likes + post.comments + (post.shares || 0) + (post.saves || 0);
  }, 0);
  
  // Use smart calculation based on account size
  const avgEngagementPerPost = totalEngagements / postCount;
  const smartResult = calculateSmartEngagement({
    likes: avgEngagementPerPost * 0.7, // Estimate likes as 70% of engagement
    comments: avgEngagementPerPost * 0.3, // Estimate comments as 30% of engagement
    followers,
    reach
  });
  
  return {
    rate: smartResult.rate,
    method: smartResult.method,
    totalEngagements,
    description: `Average Engagement Rate for last ${postCount} posts: ${smartResult.rate}% (${totalEngagements} total engagements)`
  };
}

/**
 * Compare engagement rates across different methods
 * Useful for understanding which metric best represents account performance
 */
export function compareEngagementMethods(data: EngagementData): {
  erf: number;
  err?: number;
  comparison: string;
} {
  const erf = calculateERF(data);
  let err: number | undefined;
  let comparison = '';
  
  if (data.reach && data.reach > 0) {
    err = calculateERR(data);
    
    if (data.followers >= 0 && data.followers <= 100) {
      comparison = `For small accounts (${data.followers} followers), ERR (${err}%) is more realistic than ERF (${erf}%)`;
    } else {
      comparison = `For larger accounts (${data.followers} followers), ERF (${erf}%) is industry standard. ERR (${err}%) shows engagement from people who actually saw the content.`;
    }
  } else {
    comparison = `Only ERF (${erf}%) available - reach data not provided`;
  }
  
  return { erf, err, comparison };
}

/* 
EXAMPLE USAGE:

// Example 1: Small account with reach data
const smallAccountData: EngagementData = {
  likes: 45,
  comments: 12,
  shares: 3,
  saves: 8,
  followers: 50,
  reach: 120
};

console.log('Small Account Analysis:');
console.log('ERF:', calculateERF(smallAccountData), '%'); // 136% - unrealistic
console.log('ERR:', calculateERR(smallAccountData), '%'); // 56.67% - realistic
console.log('Smart:', calculateSmartEngagement(smallAccountData));

// Example 2: Large account
const largeAccountData: EngagementData = {
  likes: 1250,
  comments: 89,
  shares: 45,
  saves: 120,
  followers: 10000,
  reach: 8500
};

console.log('\nLarge Account Analysis:');
console.log('ERF:', calculateERF(largeAccountData), '%'); // 15.04% - industry standard
console.log('ERR:', calculateERR(largeAccountData), '%'); // 17.65% - from people who saw it
console.log('Smart:', calculateSmartEngagement(largeAccountData));

// Example 3: Multiple posts analysis
const multiPostData: MultiPostEngagementData = {
  posts: [
    { likes: 100, comments: 15, shares: 5, saves: 10 },
    { likes: 85, comments: 12, shares: 3, saves: 8 },
    { likes: 120, comments: 18, shares: 7, saves: 12 },
    { likes: 95, comments: 14, shares: 4, saves: 9 }
  ],
  followers: 2000,
  reach: 1800
};

console.log('\nMulti-Post Analysis:');
console.log('AER (all posts):', calculateAER(multiPostData), '%');
console.log('Last 2 posts:', calculateEngagementForLastPosts(multiPostData, 2));
console.log('Last 4 posts:', calculateEngagementForLastPosts(multiPostData, 4));

// Example 4: Method comparison
console.log('\nMethod Comparison:');
console.log(compareEngagementMethods(smallAccountData));
console.log(compareEngagementMethods(largeAccountData));
*/
