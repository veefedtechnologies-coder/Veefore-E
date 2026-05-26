import axios from 'axios';

export class InstagramDiagnostics {
  static async checkAccountStatus(accessToken: string): Promise<{
    isValid: boolean;
    rateLimitStatus: string;
    permissions: string[];
    accountInfo: any;
    recommendations: string[];
  }> {
    try {
      console.log('[INSTAGRAM DIAGNOSTICS] Checking account status and permissions...');
      
      // Test basic account access
      const accountResponse = await axios.get(`https://graph.instagram.com/me`, {
        params: {
          fields: 'id,username,account_type,media_count,followers_count',
          access_token: accessToken
        }
      });

      const recommendations: string[] = [];
      
      // Check rate limit headers if available
      const rateLimitRemaining = accountResponse.headers['x-app-usage'] || 
                                accountResponse.headers['x-business-use-case-usage'];
      
      console.log('[INSTAGRAM DIAGNOSTICS] Rate limit headers:', {
        'x-app-usage': accountResponse.headers['x-app-usage'],
        'x-business-use-case-usage': accountResponse.headers['x-business-use-case-usage']
      });

      // Determine account capabilities
      const accountType = accountResponse.data.account_type;
      
      if (accountType === 'PERSONAL') {
        recommendations.push('Upgrade to Instagram Business or Creator account for better API access');
        recommendations.push('Personal accounts have very limited publishing capabilities');
      }

      // Check if this is a basic or advanced Instagram API setup
      if (!rateLimitRemaining || rateLimitRemaining.includes('100')) {
        recommendations.push('You appear to be using Instagram Basic Display API (very limited)');
        recommendations.push('Upgrade to Instagram Graph API for business accounts');
        recommendations.push('Apply for advanced Instagram Graph API permissions');
      }

      recommendations.push('Current Instagram Basic API limits: ~200 requests per hour');
      recommendations.push('Instagram Graph API for Business: ~4800 requests per hour');
      recommendations.push('Wait 10-15 minutes between publishing attempts');

      return {
        isValid: true,
        rateLimitStatus: rateLimitRemaining || 'Unknown - likely at limit',
        permissions: ['instagram_graph_user_profile', 'instagram_graph_user_media'], // Basic permissions
        accountInfo: accountResponse.data,
        recommendations
      };

    } catch (error: any) {
      console.error('[INSTAGRAM DIAGNOSTICS] Account check failed:', error.response?.data || error.message);
      
      const recommendations: string[] = [];
      
      if (error.response?.data?.error?.code === 4) {
        recommendations.push('CRITICAL: Instagram API rate limit exceeded');
        recommendations.push('Your app has made too many requests in the last hour');
        recommendations.push('Instagram Basic API: ~200 requests/hour limit');
        recommendations.push('Solution 1: Wait 60 minutes before trying again');
        recommendations.push('Solution 2: Apply for Instagram Graph API Business permissions');
        recommendations.push('Solution 3: Reduce publishing frequency to max 1 post per 5 minutes');
      }

      if (error.response?.data?.error?.code === 190) {
        recommendations.push('Access token is invalid or expired');
        recommendations.push('Reconnect your Instagram account in Settings > Integrations');
      }

      return {
        isValid: false,
        rateLimitStatus: 'Rate Limited',
        permissions: [],
        accountInfo: null,
        recommendations
      };
    }
  }

  static generateInstagramSetupGuide(): string {
    return `
# Instagram API Setup Guide

## Current Issue: Rate Limits
Your Instagram app is hitting API rate limits, preventing content publishing.

## Instagram API Tiers:

### 1. Instagram Basic Display API (Current - Limited)
- ~200 requests per hour
- Limited publishing capabilities
- Suitable only for basic profile access

### 2. Instagram Graph API (Recommended)
- ~4800 requests per hour  
- Full publishing capabilities
- Requires business verification

## Immediate Solutions:

### Option 1: Wait and Retry
- Wait 60 minutes for rate limits to reset
- Limit publishing to 1 post every 5 minutes
- Monitor usage carefully

### Option 2: Upgrade to Instagram Graph API
1. Convert Instagram account to Business/Creator
2. Connect to Facebook Business account
3. Apply for Instagram Graph API access
4. Request advanced permissions:
   - instagram_graph_user_profile
   - instagram_graph_user_media
   - publish_video (for reels)

### Option 3: Alternative Publishing
- Use Instagram's Creator Studio
- Schedule posts through Meta Business Suite
- Reduce automated posting frequency

## Rate Limit Best Practices:
- Max 1 API call per 5 seconds
- Batch operations when possible
- Implement exponential backoff
- Monitor rate limit headers

## Next Steps:
1. Check your Instagram app settings at developers.facebook.com
2. Verify your app's rate limit tier
3. Apply for higher rate limits if using basic tier
4. Consider professional Instagram API access for production use
`;
  }
}