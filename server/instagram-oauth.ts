import { IStorage } from './storage';

export class InstagramOAuthService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;

  constructor(private storage: IStorage) {
    this.appId = process.env.INSTAGRAM_APP_ID!;
    this.appSecret = process.env.INSTAGRAM_APP_SECRET!;
    // Environment-agnostic URL generation
    const getBaseUrl = () => {
      if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
      if (process.env.REPL_SLUG && process.env.REPL_OWNER) return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      if (process.env.VITE_APP_URL) return process.env.VITE_APP_URL;
      return process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5000';
    };
    
    this.redirectUri = `${getBaseUrl()}/api/instagram/callback`;
  }

  getAuthUrl(workspaceId: string): string {
    // Use Instagram Business API scopes for Comment→DM automation
    const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights';
    const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64');
    
    // Use Instagram Business OAuth endpoint with proper scopes for messaging
    return `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
  }

  async exchangeCodeForToken(code: string, workspaceId: string): Promise<any> {
    try {
      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.appId,
          client_secret: this.appSecret,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
          code: code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json();
      
      // Get long-lived access token
      const longLivedResponse = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${this.appSecret}&access_token=${tokenData.access_token}`
      );

      if (!longLivedResponse.ok) {
        throw new Error(`Long-lived token exchange failed: ${longLivedResponse.status}`);
      }

      const longLivedData = await longLivedResponse.json();

      // Fetch user profile data
      const userProfile = await this.fetchUserProfile(longLivedData.access_token);

      // UNIQUE CONSTRAINT: Check if Instagram account is already connected elsewhere
      const { checkInstagramAccountExists, validateInstagramConnection } = await import('./utils/instagram-validation');
      const existingConnection = await checkInstagramAccountExists(userProfile.id);
      const validation = validateInstagramConnection(existingConnection, workspaceId);
      
      if (!validation.isValid) {
        console.log(`🚨 Instagram account @${userProfile.username} already connected to workspace ${existingConnection.workspaceId}`);
        throw new Error(validation.errorMessage);
      }

      console.log(`✅ Instagram account @${userProfile.username} is available for connection`);

      // Store or update social account
      const accountData = {
        ...userProfile,
        accessToken: longLivedData.access_token,
        expiresAt: new Date(Date.now() + longLivedData.expires_in * 1000),
      };
      
      await this.storeSocialAccount(workspaceId, accountData);

      // Immediately sync real Instagram data (followers, posts, engagement, etc.)
      try {
        console.log('[INSTAGRAM OAUTH] 🔄 Triggering immediate sync for newly connected account...');
        const { InstagramDirectSync } = await import('./instagram-direct-sync');
        const sync = new InstagramDirectSync(this.storage);
        await sync.syncInstagramAccount(userProfile.accountId, longLivedData.access_token);
        console.log('[INSTAGRAM OAUTH] ✅ Initial sync completed successfully');
      } catch (syncError) {
        console.error('[INSTAGRAM OAUTH] ⚠️ Initial sync failed (will retry via smart polling):', syncError);
        // Don't fail the OAuth flow if sync fails - smart polling will retry
      }

      return userProfile;

    } catch (error) {
      console.error('[INSTAGRAM OAUTH] Error exchanging code for token:', error);
      throw error;
    }
  }

  private async fetchUserProfile(accessToken: string): Promise<any> {
    try {
      // Step 1: Get basic Instagram profile
      const response = await fetch(
        `https://graph.instagram.com/me?fields=id,username,account_type,media_count,profile_picture_url&access_token=${accessToken}`
      );

      if (!response.ok) {
        throw new Error(`Profile fetch failed: ${response.status}`);
      }

      const profileData = await response.json();
      
      // Step 2: Get connected Facebook Page ID for Business accounts (required for DMs)
      let pageId = null;
      if (profileData.account_type === 'BUSINESS') {
        try {
          console.log('[INSTAGRAM OAUTH] 🔥 Business account detected - fetching Page ID for DMs...');
          const pageResponse = await fetch(
            `https://graph.facebook.com/v21.0/${profileData.id}?fields=connected_instagram_account&access_token=${accessToken}`
          );
          
          if (pageResponse.ok) {
            const pageData = await pageResponse.json();
            pageId = pageData.id; // This is the Facebook Page ID
            console.log('[INSTAGRAM OAUTH] ✅ Found Page ID for DMs:', pageId);
          } else {
            // Try alternative method for Page ID
            const pagesResponse = await fetch(
              `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
            );
            
            if (pagesResponse.ok) {
              const pagesData = await pagesResponse.json();
              const page = pagesData.data?.find((p: any) => p.instagram_business_account?.id === profileData.id);
              if (page) {
                pageId = page.id;
                console.log('[INSTAGRAM OAUTH] ✅ Found Page ID via Pages API:', pageId);
              }
            }
          }
        } catch (pageError) {
          console.log('[INSTAGRAM OAUTH] ⚠️ Could not fetch Page ID:', pageError);
        }
      }
      
      return {
        accountId: profileData.id,
        username: profileData.username,
        accountType: profileData.account_type,
        mediaCount: profileData.media_count,
        profilePictureUrl: profileData.profile_picture_url,
        pageId: pageId, // 🎯 Critical for Instagram Business DMs
        platform: 'instagram',
      };

    } catch (error) {
      console.error('[INSTAGRAM OAUTH] Error fetching user profile:', error);
      throw error;
    }
  }

  private async storeSocialAccount(workspaceId: string, accountData: any): Promise<void> {
    try {
      // Check if account already exists
      const existingAccounts = await this.storage.getSocialAccountsByWorkspace(workspaceId);
      const existingInstagram = existingAccounts.find(acc => acc.platform === 'instagram');

      if (existingInstagram) {
        // Update existing account with all profile data
        await this.storage.updateSocialAccount(existingInstagram.id, {
          username: accountData.username,
          accountId: accountData.accountId,
          accessToken: accountData.accessToken,
          expiresAt: accountData.expiresAt,
          mediaCount: accountData.mediaCount || 0,
          profilePictureUrl: accountData.profilePictureUrl,
          pageId: accountData.pageId,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        // Create new account
        await this.storage.createSocialAccount({
          workspaceId: parseInt(workspaceId),
          platform: 'instagram',
          username: accountData.username,
          accountId: accountData.accountId,
          accessToken: accountData.accessToken,
          refreshToken: null,
          expiresAt: accountData.expiresAt,
          isActive: true,
          followersCount: 0,
          followingCount: 0,
          mediaCount: accountData.mediaCount || 0,
          biography: null,
          website: null,
          profilePictureUrl: accountData.profilePictureUrl,
          verificationStatus: null,
          businessCategoryId: null,
          businessCategoryName: null,
          avgLikes: 0,
          avgComments: 0,
          avgEngagement: 0,
          totalReach: 0,
          pageId: accountData.pageId,
          lastSyncAt: new Date(),
        });
      }

      console.log('[INSTAGRAM OAUTH] Social account stored successfully');

    } catch (error) {
      console.error('[INSTAGRAM OAUTH] Error storing social account:', error);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      const response = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${refreshToken}`
      );

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();
      return data.access_token;

    } catch (error) {
      console.error('[INSTAGRAM OAUTH] Error refreshing access token:', error);
      throw error;
    }
  }
}