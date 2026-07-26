import { IStorage } from './storage';


export class InstagramOAuthService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly fbAppId: string;
  private readonly fbAppSecret: string;
  private readonly redirectUri: string;

  constructor(private storage: IStorage) {
    this.appId = process.env.INSTAGRAM_APP_ID!;
    this.appSecret = process.env.INSTAGRAM_APP_SECRET!;
    this.fbAppId = process.env.FACEBOOK_APP_ID || this.appId;
    this.fbAppSecret = process.env.FACEBOOK_APP_SECRET || this.appSecret;

    // Environment-agnostic URL generation
    const getRedirectUri = () => {
      const ngrokBase = process.env.SOCIAL_AUTH_BASE_URL;
      const legacyRedirect = process.env.INSTAGRAM_REDIRECT_URL;

      // PRIORITY 1: Use SOCIAL_AUTH_BASE_URL (Ngrok) if provided, as per user requirement
      if (ngrokBase) {
        return `${ngrokBase}/api/v1/social-auth/instagram/callback`;
      }

      // PRIORITY 2: If legacy redirect exists and is NOT the veefore-webhook domain, use it
      if (legacyRedirect && !legacyRedirect.includes('veefore-webhook.veefore.com')) {
        return legacyRedirect;
      }

      // PRIORITY 3: Fallback discovery logic
      const baseDiscovery = (() => {
        if (process.env.BASE_URL) return process.env.BASE_URL;
        if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
        if (process.env.CF_TUNNEL_HOSTNAME) return `https://${process.env.CF_TUNNEL_HOSTNAME}`;
        if (process.env.VITE_APP_URL) return process.env.VITE_APP_URL;
        if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
        if (process.env.REPL_SLUG && process.env.REPL_OWNER) return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
        return process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5000';
      })();

      return `${baseDiscovery}/api/v1/social-auth/instagram/callback`;
    };

    this.redirectUri = getRedirectUri();
    console.log('🔗 [INSTAGRAM OAUTH] Using redirect URI:', this.redirectUri);
  }

  getAuthUrl(workspaceId: string): string {
    // STANDARD FLOW: Pure Instagram Login
    // When in Phase 1 Review mode, only request safe publishing/insights scopes.
    // DM (instagram_business_manage_messages) and Comment (instagram_business_manage_comments)
    // permissions are EXCLUDED to comply with Meta's Phase 1 App Review policy.
    const isPhase1Review = process.env.META_PHASE_1_REVIEW_MODE === 'true';

    const scopes = isPhase1Review
      ? 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights'
      : 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights';

    const state = Buffer.from(JSON.stringify({ workspaceId, flow: 'standard' })).toString('base64');

    const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
    console.log(`🔗 [INSTAGRAM OAUTH] Generated STANDARD auth URL. Phase1Review=${isPhase1Review}. Scopes: ${scopes}`);

    return authUrl;
  }

  getAdvancedAuthUrl(workspaceId: string): string {
    // ADVANCED FLOW: Facebook Login for Business
    // When in Phase 1 Review mode, only request safe publishing/insights scopes.
    // DM (instagram_manage_messages, pages_messaging) and Comment (instagram_manage_comments)
    // permissions are EXCLUDED to comply with Meta's Phase 1 App Review policy.
    const isPhase1Review = process.env.META_PHASE_1_REVIEW_MODE === 'true';

    const state = Buffer.from(JSON.stringify({ workspaceId, flow: 'advanced' })).toString('base64');

    // Fallback to the classic scope-based Facebook Login
    const scopes = isPhase1Review
      ? 'public_profile,email,instagram_basic,instagram_manage_insights,instagram_content_publish,pages_read_engagement,pages_manage_posts,pages_show_list'
      : 'public_profile,email,instagram_basic,instagram_manage_insights,instagram_content_publish,instagram_manage_comments,instagram_manage_messages,pages_read_engagement,pages_manage_posts,pages_show_list,pages_messaging,pages_manage_metadata';

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${this.fbAppId}&display=page&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
    
    console.log(`🔗 [INSTAGRAM OAUTH] Generated ADVANCED auth URL. Phase1Review=${isPhase1Review}. Scopes: ${scopes}`);
    console.log('🔗 [INSTAGRAM OAUTH] Facebook App ID:', this.fbAppId);
    console.log('🔗 [INSTAGRAM OAUTH] Redirect URI:', this.redirectUri);

    return authUrl;
  }



  async exchangeCodeForToken(code: string, workspaceId: string, customRedirectUri?: string): Promise<any> {
    try {
      const finalRedirectUri = customRedirectUri || this.redirectUri;
      console.log(`[INSTAGRAM OAUTH] Exchanging INSTAGRAM code for token using redirect_uri: ${finalRedirectUri}`);

      // Exchange authorization code for access token (Standard Flow)
      const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.appId,
          client_secret: this.appSecret,
          grant_type: 'authorization_code',
          redirect_uri: finalRedirectUri,
          code: code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Instagram token exchange failed: ${tokenResponse.status}`);
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

      return this.processAndStoreAccount(workspaceId, userProfile, longLivedData.access_token, longLivedData.expires_in);

    } catch (error) {
      console.error('[INSTAGRAM OAUTH] Error in Standard Instagram exchange:', error);
      throw error;
    }
  }

  async exchangeFacebookCodeForToken(code: string, workspaceId: string, customRedirectUri?: string): Promise<any> {
    const log = console.log;

    try {
      log('🔵 STARTING exchangeFacebookCodeForToken', { workspaceId, hasCode: !!code });

      const finalRedirectUri = customRedirectUri || this.redirectUri;
      log(`Redirect URI: ${finalRedirectUri}`);

      // 1. Exchange Facebook authorization code for access token
      log('1. Exchanging code for token...');
      const tokenResponse = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.fbAppId,
          redirect_uri: finalRedirectUri,
          client_secret: this.fbAppSecret,
          code: code,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        log('❌ Facebook token exchange failed:', errorData);
        throw new Error(`Facebook token exchange failed: ${JSON.stringify(errorData)}`);
      }

      const tokenData = await tokenResponse.json();
      log('✅ Got initial token');
      const userToken = tokenData.access_token;

      // 2. Get long-lived USER access token (valid for 60 days)
      log('2. Exchanging for long-lived user token...');
      const longLivedResponse = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${this.fbAppId}&client_secret=${this.fbAppSecret}&fb_exchange_token=${userToken}`);

      if (!longLivedResponse.ok) {
        log('❌ Long-lived token exchange failed:', longLivedResponse.status);
        throw new Error(`Facebook long-lived token exchange failed: ${longLivedResponse.status}`);
      }

      const longLivedData = await longLivedResponse.json();
      const fbUserAccessToken = longLivedData.access_token;
      log('✅ Got long-lived user token');

      // 3. Page Discovery: Find the linked Instagram Business account
      log('3. Fetching accounts/pages...');
      const pagesResponse = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{id,username,profile_picture_url,followers_count,media_count},name,access_token&access_token=${fbUserAccessToken}`);

      if (!pagesResponse.ok) {
        log('❌ Failed to fetch pages:', pagesResponse.status);
        throw new Error(`Failed to fetch linked Facebook Pages: ${pagesResponse.status}`);
      }

      const pagesData = await pagesResponse.json();
      const pages = pagesData.data || [];
      log(`Found ${pages.length} pages`);

      // Find first page with a linked Instagram Business Account
      const pageWithIg = pages.find((p: any) => p.instagram_business_account);

      if (!pageWithIg) {
        log('❌ No Instagram account found linked to pages');
        throw new Error('No Instagram Business account found linked to your Facebook Pages. Ensure your Instagram account is a Professional account and linked to a Facebook Page.');
      }

      const igAccount = pageWithIg.instagram_business_account;
      const pageId = pageWithIg.id;
      // The Page Access Token is already returned in step 3 from /me/accounts
      // (requires pages_show_list only — no pages_manage_metadata needed).
      // We still attempt to get a long-lived version, but fall back to the
      // step-3 token if that call fails (403 = missing pages_manage_metadata).
      const shortLivedPageToken: string = pageWithIg.access_token || fbUserAccessToken;

      log(`✅ Found Instagram Business Account: @${igAccount.username} (Page ID: ${pageId})`);

      // 4. Try to get the long-lived Page Access Token via /{pageId}?fields=access_token.
      //    This requires pages_manage_metadata. If the app doesn't have that permission
      //    (403), fall back to the long-lived USER access token instead — it works
      //    equally well for IG Business Account queries with instagram_manage_insights.
      log('4. Getting Page Access Token (with fallback to User token)...');
      let finalToken = fbUserAccessToken; // safe fallback: long-lived user token
      try {
        const longLivedPageResponse = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${fbUserAccessToken}`
        );
        if (longLivedPageResponse.ok) {
          const longLivedPageData = await longLivedPageResponse.json();
          if (longLivedPageData.access_token) {
            finalToken = longLivedPageData.access_token;
            log('✅ Got long-lived Page Access Token');
          } else {
            log('⚠️ Page token response had no access_token field — using short-lived page token from step 3');
            finalToken = shortLivedPageToken || fbUserAccessToken;
          }
        } else {
          log(`⚠️ Could not get Page token (HTTP ${longLivedPageResponse.status}) — falling back to long-lived User token. This is fine for IG Business queries.`);
          // Use the short-lived page token from /me/accounts if available,
          // otherwise fall back to the long-lived user token.
          finalToken = shortLivedPageToken || fbUserAccessToken;
        }
      } catch (pageTokenErr: any) {
        log(`⚠️ Page token fetch failed: ${pageTokenErr.message} — using User token`);
        finalToken = shortLivedPageToken || fbUserAccessToken;
      }

      const userProfile = {
        accountId: String(igAccount.id),
        username: igAccount.username,
        accountType: 'BUSINESS', // Demographics flow implies business/professional
        mediaCount: igAccount.media_count ?? 0, // From IG field expansion (for reconnect change detection)
        followersCount: igAccount.followers_count || 0,
        profilePictureUrl: igAccount.profile_picture_url,
        accessToken: finalToken,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        pageId: pageId
      };

      log('Storing user profile...', { username: userProfile.username, accountId: userProfile.accountId, tokenPrefix: finalToken?.slice(0, 12) });

      return this.processAndStoreAccount(workspaceId, userProfile, finalToken, 60 * 24 * 60 * 60);

    } catch (error) {
      log('❌ ERROR in exchangeFacebookCodeForToken:', {
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      throw error;
    }
  }

  private async processAndStoreAccount(workspaceId: string, userProfile: any, accessToken: string, expiresIn: number): Promise<any> {
    const log = console.log;

    try {
      log('🔵 STARTING processAndStoreAccount', { workspaceId, username: userProfile.username, accountId: userProfile.accountId });

      const { checkInstagramAccountExists, validateInstagramConnection } = await import('./utils/instagram-validation');
      log('Imported validation utils');

      const existingConnection = await checkInstagramAccountExists(userProfile.accountId);
      log('Checked existing connection:', existingConnection ? 'Found' : 'None');

      const validation = validateInstagramConnection(existingConnection, workspaceId);
      log('Validation result:', validation);

      if (!validation.isValid) {
        log('❌ Validation failed:', validation.errorMessage);
        console.log(`🚨 Instagram account @${userProfile.username} already connected: ${validation.errorMessage}`);
        throw new Error(validation.errorMessage);
      }

      console.log(`✅ Instagram account @${userProfile.username} is available for connection`);
      log('✅ Validation passed');

      // Store or update social account
      const accountData = {
        ...userProfile,
        accessToken: accessToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };

      log(' calling storeSocialAccount...');
      await this.storeSocialAccount(workspaceId, accountData);
      log('✅ storeSocialAccount returned successfully');

      // Hand the connect/reconnect initialization to a BullMQ worker (Redis-backed)
      // instead of doing it inline in the OAuth web request. The worker decides:
      //   restore-from-DB (no changes) | incremental sync | full backfill.
      (async () => {
        try {
          const { MetricsQueueManager } = await import('./queues/metricsQueue');
          const connectInitPayload = {
            workspaceId,
            instagramAccountId: String(userProfile.accountId),
            token: accessToken,
            username: userProfile.username,
            mediaCount: typeof userProfile.mediaCount === 'number' ? userProfile.mediaCount : undefined,
            followersCount: typeof userProfile.followersCount === 'number' ? userProfile.followersCount : undefined,
          };

          const enqueued = await MetricsQueueManager.enqueueConnectInit(connectInitPayload);
          if (enqueued) {
            console.log('[INSTAGRAM OAUTH] 📥 connect-init queued to BullMQ worker');
          } else {
            // Redis/queue unavailable — run inline as a graceful fallback.
            console.log('[INSTAGRAM OAUTH] ⚠️ Queue unavailable, running connect-init inline (fallback)');
            const { ConnectInitService } = await import('./services/ConnectInitService');
            await ConnectInitService.run({
              workspaceId,
              instagramAccountId: String(userProfile.accountId),
              accessToken,
              username: userProfile.username,
              mediaCount: connectInitPayload.mediaCount,
              followersCount: connectInitPayload.followersCount,
            });
            try {
              const { CachingSystem } = await import('./performance/caching-system');
              await CachingSystem.invalidateWorkspace(workspaceId);
            } catch { /* non-critical */ }
          }
        } catch (initError) {
          console.error('[INSTAGRAM OAUTH] ⚠️ Failed to dispatch connect-init (will retry via smart polling):', initError);
        }
      })();

      return userProfile;
    } catch (error) {
      log('❌ ERROR in processAndStoreAccount:', {
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      throw error;
    }
  }

  private async fetchUserProfile(accessToken: string): Promise<any> {
    try {
      const { InstagramApiService } = await import('./services/instagramApi');

      // Step 1: Get basic Instagram profile using centralized service
      const profileData = await InstagramApiService.getAccountInfo(accessToken);

      console.log('[INSTAGRAM OAUTH] Profile data received via Service:', {
        id: profileData.id,
        username: profileData.username,
        account_type: profileData.account_type
      });

      // Step 2: Get connected Facebook Page ID for Business accounts (required for DMs)
      // This is specific to OAuth/Setup and not part of general metrics, so we keep it here but use sanitized checks
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
        accountId: String(profileData.id), // Ensure ID is always a string
        username: profileData.username,
        accountType: profileData.account_type,
        mediaCount: profileData.media_count,
        followersCount: profileData.followers_count || 0,
        profilePictureUrl: profileData.profile_picture_url,
        pageId: pageId ? String(pageId) : null, // Ensure Page ID is also a string
        platform: 'instagram',
      };

    } catch (error) {
      console.error('[INSTAGRAM OAUTH] Error fetching user profile:', error);
      throw error;
    }
  }

  private async storeSocialAccount(workspaceId: string, accountData: any): Promise<void> {
    const log = console.log;

    try {
      log('🔵 STARTING storeSocialAccount', {
        workspaceId,
        username: accountData.username,
        accountId: accountData.accountId,
        hasAccessToken: !!accountData.accessToken,
        tokenLength: accountData.accessToken?.length
      });

      // P1-FIX: Search for existing account by accountId AND workspaceId
      // to ensure we update the correct connection if multiple exist or if it's new.
      const existingAccounts = await this.storage.getSocialAccountsByWorkspace(workspaceId);
      log('Found existing accounts:', existingAccounts.length);

      const existingInstagram = existingAccounts.find(acc =>
        acc.platform === 'instagram' && acc.accountId === accountData.accountId
      );

      if (existingInstagram) {
        log('🔄 UPDATING existing account:', existingInstagram.id);

        // Update existing account with all profile data
        const updateResult = await this.storage.updateSocialAccount(existingInstagram.id, {
          username: accountData.username,
          accountId: accountData.accountId,
          accessToken: accountData.accessToken,
          expiresAt: accountData.expiresAt,
          mediaCount: accountData.mediaCount || 0,
          followersCount: accountData.followersCount || 0,
          profilePictureUrl: accountData.profilePictureUrl,
          pageId: accountData.pageId,
          // P1-FIX: Persist account type!
          accountType: accountData.accountType,
          isBusinessAccount: accountData.accountType === 'BUSINESS' || accountData.accountType === 'CREATOR',
          tokenStatus: 'valid',
          isActive: true, // Reactivate if it was disconnected (P2-FIX)
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        });

        log('✅ UPDATE COMPLETE:', updateResult ? 'Success' : 'Failed!');
      } else {
        log('🆕 CREATING new account for @' + accountData.username);

        const createData = {
          workspaceId: workspaceId,
          platform: 'instagram' as const,
          username: accountData.username,
          accountId: accountData.accountId,
          accessToken: accountData.accessToken,
          refreshToken: undefined,
          expiresAt: accountData.expiresAt,
          isActive: true,
          pageId: accountData.pageId,
          // P1-FIX: Persist account type!
          accountType: accountData.accountType,
          followersCount: accountData.followersCount || 0,
          isBusinessAccount: accountData.accountType === 'BUSINESS' || accountData.accountType === 'CREATOR',
        };

        log('Create payload:', createData);

        let createResult;
        try {
          createResult = await this.storage.createSocialAccount(createData);
          log('✅ REPO CREATE SUCCESS:', { id: createResult?.id });
        } catch (repoError) {
          log('❌ REPO CREATE FAILED:', { error: (repoError as Error).message });

          // Debug fallback: Try direct model creation
          try {
            const { SocialAccountModel } = await import('./models/Social');
            log('⚠️ Attempting direct model creation fallback...');
            const fallbackResult = await SocialAccountModel.create(createData);
            createResult = fallbackResult;
            log('✅ DIRECT MODEL CREATE SUCCESS:', { id: fallbackResult._id });
          } catch (modelError) {
            log('❌ DIRECT MODEL CREATE FAILED:', { error: (modelError as Error).message });
            throw repoError; // Throw original error
          }
        }

        log('✅ CREATE COMPLETE:', {
          id: createResult?.id,
          username: createResult?.username,
          platform: createResult?.platform
        });
      }

      log('✅ Social account stored successfully');

    } catch (error) {
      log('❌ ERROR storing social account:', {
        message: (error as Error).message,
        stack: (error as Error).stack
      });
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
