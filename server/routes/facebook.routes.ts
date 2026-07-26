/**
 * Facebook OAuth and Page Connection Routes
 *
 * Three endpoints:
 *
 *  GET  /api/facebook/auth           (requireAuth)
 *    Returns { authUrl } — the Facebook OAuth dialog URL for the given workspaceId.
 *
 *  GET  /api/facebook/callback       (no auth — Meta redirects here)
 *    Exchanges the authorization code for a long-lived User Access Token,
 *    retrieves all managed Pages, stores them in a short-lived page-selection
 *    session, and redirects the browser to /connect/facebook/pages?token=...
 *    On any error it redirects to /connect/facebook/error?reason=...
 *    NEVER creates a SocialAccount record here.
 *
 *  POST /api/facebook/pages/connect  (requireAuth, validated body)
 *    For each selected page ID: exchanges the page's short-lived token for a
 *    long-lived Page Access Token, then upserts a SocialAccount record with
 *    platform: "facebook". Deletes the session after a successful save.
 *    Returns { connected: [{ pageId, pageName }] }.
 *    Returns 409 Conflict on duplicate (compound unique index violation).
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.3, 3.4
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/require-auth';
import { FacebookProvider } from '../features/facebook/providers/FacebookProvider';
import { mapFacebookApiError } from '../features/facebook/providers/error-mapper';
import {
  createSession,
  getSession,
  deleteSession,
} from '../features/facebook/oauth/FacebookOAuthService';
import { SocialAccountModel } from '../models/Social/SocialAccount';

// Graph API base for fetching IG Business Account profile during auto-connect
const FB_GRAPH_BASE = 'https://graph.facebook.com';
const FB_API_VERSION = 'v19.0';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The redirect URI registered in the Meta App Dashboard.
 * Must match EXACTLY what was submitted to Meta — path, protocol, and host.
 */
const FACEBOOK_REDIRECT_URI =
  process.env.FACEBOOK_REDIRECT_URI ||
  `${process.env.APP_URL || 'http://localhost:5001'}/api/facebook/callback`;

// ---------------------------------------------------------------------------
// Singleton provider
// ---------------------------------------------------------------------------

const facebookProvider = new FacebookProvider();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// ─── GET /api/facebook/auth/start ─────────────────────────────────────────
/**
 * Onboarding-friendly Meta OAuth start endpoint.
 *
 * Used by OnboardingConnectMeta when ?context=onboarding is present.
 * Also works for post-onboarding reconnects via the settings page.
 *
 * Behaviour:
 *  - Authenticates via auth_token cookie (falls back to requireAuth).
 *  - Resolves the user's first workspace (or falls back to Firebase UID as state).
 *  - Builds the Meta OAuth URL with state = workspaceId:context.
 *  - Does a full 302 redirect to Meta — the browser follows it directly.
 *
 * This is a redirect, NOT a JSON response, so the browser follows it even
 * when the client calls it via `window.location.href = '/api/facebook/auth/start'`.
 */
router.get('/auth/start', async (req: Request, res: Response) => {
  try {
    const context = String(req.query.context ?? 'settings'); // 'onboarding' | 'settings'
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // ── Auth: resolve the current user from auth_token cookie or __session cookie ──
    let firebaseUid = '';
    let userId = '';

    const authToken = (req as any).cookies?.auth_token;
    if (authToken) {
      try {
        const { getFirebaseAdmin } = await import('../firebase-admin');
        const admin = getFirebaseAdmin();
        // Try to verify as an ID token first
        const decoded = await admin.auth().verifyIdToken(authToken).catch(async () => {
          // Might be a custom token — decode without verification just for uid
          try {
            const parts = authToken.split('.');
            if (parts.length >= 2) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
              return { uid: payload.uid || payload.user_id || payload.sub };
            }
          } catch { /* ignore */ }
          return null;
        });
        if (decoded?.uid) {
          firebaseUid = decoded.uid;
        }
      } catch { /* ignore */ }
    }

    // Fallback: try the __session cookie (SSR / session-cookie path)
    if (!firebaseUid) {
      const sessionCookie = (req as any).cookies?.__session;
      if (sessionCookie) {
        try {
          const { getFirebaseAdmin } = await import('../firebase-admin');
          const admin = getFirebaseAdmin();
          const decoded = await admin.auth().verifySessionCookie(sessionCookie, false);
          if (decoded?.uid) firebaseUid = decoded.uid;
        } catch { /* ignore */ }
      }
    }

    if (!firebaseUid) {
      // No valid auth — redirect to error/login
      console.warn('[facebook/auth/start] No authenticated user found in cookies');
      return res.redirect(`${frontendUrl}/signup?meta_error=${encodeURIComponent('Please sign in before connecting Meta.')}`);
    }

    // Resolve MongoDB user to get user ID
    try {
      const { storage } = await import('../mongodb-storage');
      const mongoUser = await storage.getUserByFirebaseUid(firebaseUid).catch(() => null);
      userId = mongoUser?.id?.toString() || firebaseUid;
    } catch { userId = firebaseUid; }

    // Resolve workspace ID (needed as OAuth state for non-onboarding flows)
    let workspaceId = String(req.query.workspaceId ?? '');

    if (!workspaceId && userId && context !== 'onboarding') {
      try {
        const { storage } = await import('../mongodb-storage');
        const workspaces = await storage.getWorkspacesByUserId(userId);
        if (workspaces && workspaces.length > 0) {
          workspaceId = workspaces[0].id?.toString() ?? '';
        }
      } catch (lookupErr) {
        console.warn('[facebook/auth/start] Workspace lookup failed:', (lookupErr as Error).message);
      }
    }

    // During onboarding (no workspace yet): use Firebase UID as workspaceId in state.
    // The callback will use it as ownerId for AuthorizedBrand upserts.
    const stateWorkspaceId = workspaceId || firebaseUid;

    // Build state string: workspaceId:context (matches what callback parses)
    const state = `${stateWorkspaceId}:${context}`;

    // Build the Meta OAuth URL
    const SCOPES = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
      'business_management',
      'read_insights',
    ].join(',');

    const authUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
    authUrl.searchParams.set('client_id', process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || '');
    authUrl.searchParams.set('redirect_uri', FACEBOOK_REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    console.log(`[facebook/auth/start] Redirecting user ${firebaseUid} to Meta OAuth (context=${context}, workspaceId=${stateWorkspaceId})`);

    return res.redirect(authUrl.toString());
  } catch (err) {
    console.error('[facebook/auth/start] Unexpected error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/signup?meta_error=oauth_init_failed`);
  }
});

// ─── GET /api/facebook/auth ────────────────────────────────────────────────
/**
 * Returns { authUrl } for the requesting workspace.
 * The frontend redirects the user's browser to this URL to start the OAuth flow.
 * Requirements: 2.1
 */
router.get('/auth', requireAuth, (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.query.workspaceId ?? '');
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId query parameter is required' });
    }

    const { authUrl } = facebookProvider.initiateOAuth(workspaceId, FACEBOOK_REDIRECT_URI);
    return res.json({ authUrl });
  } catch (err) {
    console.error('[facebook/auth] Unexpected error:', err);
    return res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// ─── GET /api/facebook/callback ───────────────────────────────────────────
/**
 * Meta redirects here after the user approves (or denies) the OAuth dialog.
 *
 * Success path:
 *   1. Exchange code → long-lived User Access Token
 *   2. Retrieve managed Pages via /me/accounts
 *   3. Store everything in a short-lived page-selection session
 *   4. Redirect to /connect/facebook/pages?token=<sessionToken>
 *
 * Error path (missing code, denied permission, API failure):
 *   Redirect to /connect/facebook/error?reason=<human-readable-reason>
 *
 * NEVER creates a SocialAccount record.
 * Requirements: 2.2, 2.3, 2.4
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state: rawState, error: oauthError } = req.query;

  // Facebook returned an error (e.g. user denied access)
  if (oauthError || !code) {
    const reason = encodeURIComponent(
      String(oauthError ?? 'Authorization was denied or the authorization code is missing')
    );
    return res.redirect(`/connect/facebook/error?reason=${reason}`);
  }

  // Extract workspaceId and context from the state param.
  // State format: "workspaceId:context" (e.g. "abc123:onboarding" or "abc123:settings")
  const stateParts = rawState ? String(rawState).split(':') : [];
  const workspaceId = stateParts[0]?.trim() ?? '';
  const oauthContext = stateParts[1]?.trim() ?? 'settings'; // 'onboarding' | 'settings'

  if (!workspaceId) {
    const reason = encodeURIComponent('Session expired — workspaceId missing from OAuth state. Please try connecting again.');
    if (oauthContext === 'onboarding') {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/signup?meta_error=${encodeURIComponent(reason)}`);
    }
    return res.redirect(`/connect/facebook/error?reason=${reason}`);
  }

  try {
    // Step 1: code → long-lived User Access Token
    const callbackResult = await facebookProvider.handleOAuthCallback(
      String(code),
      FACEBOOK_REDIRECT_URI
    );

    // Step 2: retrieve all Pages the user manages
    const allPages = await facebookProvider.getManagedPages(callbackResult.longLivedToken);

    console.log(`[facebook/callback] Found ${allPages.length} pages for workspace ${workspaceId}. IG-linked: ${allPages.filter(p => !!p.linkedInstagramAccountId).length}`);

    // If pages have linked Instagram accounts use those only; otherwise use all pages
    // (handles the case where the app doesn't have instagram_basic permission yet)
    const igLinkedPages = allPages.filter(p => !!p.linkedInstagramAccountId);
    const pages = igLinkedPages.length > 0 ? igLinkedPages : allPages;

    if (pages.length === 0) {
      const reason = encodeURIComponent(
        'No Facebook Pages found. Please make sure you have admin access to at least one Page, then try again.'
      );
      if (oauthContext === 'onboarding') {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/signup?authorizedBrandCount=0`);
      }
      return res.redirect(`/connect/facebook/error?reason=${reason}`);
    }

    // Step 3: Auto-connect all pages (only for non-onboarding flows)
    // During onboarding the user has no real workspace yet — skip SocialAccount creation.
    // importAuthorizedBrand (called from the frontend) creates the workspace + SocialAccounts.
    //
    // For settings context: also skip auto-connect. The brand selection modal lets the user
    // pick exactly ONE brand to connect to the current workspace. Auto-connecting all brands
    // violates the one-workspace-one-brand design.
    const connected: Array<{ pageId: string; pageName: string }> = [];
    const errors: string[] = [];

    if (oauthContext !== 'onboarding' && oauthContext !== 'settings') {
    for (const page of pages) {
      let longLivedToken: string = page.accessToken;
      // Default to 60 days from now — overridden by token refresh if it succeeds
      const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      let tokenExpiresAt: Date = sixtyDaysFromNow;

      try {
        const refreshResult = await facebookProvider.refreshToken(page.accessToken);
        longLivedToken = refreshResult.accessToken;
        // Only use the refresh result's expiry if it's a valid date
        if (refreshResult.expiresAt instanceof Date && !isNaN(refreshResult.expiresAt.getTime())) {
          tokenExpiresAt = refreshResult.expiresAt;
        }
      } catch (refreshErr) {
        console.warn(`[facebook/callback] Token refresh failed for page ${page.pageId}, using original:`, (refreshErr as Error).message);
        // Use original token with 60-day default expiry
      }

      try {
        await SocialAccountModel.findOneAndUpdate(
          { workspaceId, platform: 'facebook' as const, accountId: page.pageId },
          {
            $set: {
              workspaceId,
              platform: 'facebook' as const,
              accountId: page.pageId,
              pageId: page.pageId,
              pageName: page.pageName,
              username: page.pageName,
              profilePictureUrl: page.profilePictureUrl,
              pageCategory: page.pageCategory,
              accessToken: longLivedToken,
              tokenExpiresAt,
              tokenStatus: 'valid',
              permissions: page.permissions ?? [],
              connectionStatus: 'ACTIVE' as const,
              connectedAt: new Date(),
              lastSyncAt: new Date(),
              isActive: true,
              platformMetadata: {
                pageCategory: page.pageCategory,
                pageFanCount: undefined,
                metaBusinessId: page.metaBusinessId,
                linkedInstagramAccountId: page.linkedInstagramAccountId,
              },
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        connected.push({ pageId: page.pageId, pageName: page.pageName });
        console.log(`[facebook/callback] Saved FB page ${page.pageId} (${page.pageName}) for workspace ${workspaceId}`);
      } catch (saveErr: any) {
        if (saveErr?.code === 11000) {
          // Already connected — count as success
          connected.push({ pageId: page.pageId, pageName: page.pageName });
        } else {
          console.error(`[facebook/callback] Failed to save page ${page.pageId}:`, saveErr?.message ?? saveErr);
          errors.push(`${page.pageName}: ${saveErr?.message ?? 'Unknown error'}`);
        }
      }

      // Auto-connect the linked Instagram Business Account
      if (page.linkedInstagramAccountId) {
        try {
          const igId = page.linkedInstagramAccountId;

          // Try fetching the IG profile with the Page token first (most reliable for
          // IG Business Accounts linked to FB Pages), then fall back to the UAT.
          const igTokensToTry = [longLivedToken, callbackResult.longLivedToken].filter(
            (t, i, arr) => t && arr.indexOf(t) === i  // deduplicate
          );

          let igProfile: {
            id: string; username?: string; name?: string; biography?: string;
            website?: string; account_type?: string; media_count?: number;
            followers_count?: number; profile_picture_url?: string;
          } = { id: igId };

          for (const token of igTokensToTry) {
            try {
              const igProfileUrl = new URL(`${FB_GRAPH_BASE}/${FB_API_VERSION}/${igId}`);
              igProfileUrl.searchParams.set(
                'fields',
                'id,username,name,biography,website,account_type,media_count,followers_count,profile_picture_url'
              );
              igProfileUrl.searchParams.set('access_token', token);
              const fetchRes = await fetch(igProfileUrl.toString(), { signal: AbortSignal.timeout(10_000) });
              if (fetchRes.ok) {
                const data = await fetchRes.json() as typeof igProfile;
                if (data.username) {
                  igProfile = data;
                  console.log(`[facebook/callback] IG profile fetched: @${data.username} (${igId})`);
                  break;
                } else {
                  console.warn(`[facebook/callback] IG profile response missing username:`, JSON.stringify(data));
                }
              } else {
                const errBody = await fetchRes.text().catch(() => '');
                console.warn(`[facebook/callback] IG profile fetch ${fetchRes.status} for ${igId}: ${errBody.slice(0, 200)}`);
              }
            } catch (tokenFetchErr) {
              console.warn(`[facebook/callback] IG profile fetch attempt failed:`, (tokenFetchErr as Error).message);
            }
          }

          await SocialAccountModel.findOneAndUpdate(
            { workspaceId, platform: 'instagram' as const, accountId: igId },
            {
              $set: {
                workspaceId,
                platform: 'instagram' as const,
                accountId: igId,
                username: igProfile.username ?? igId,
                accessToken: callbackResult.longLivedToken,
                ...(callbackResult.tokenExpiresAt instanceof Date && !isNaN(callbackResult.tokenExpiresAt.getTime())
                  ? { tokenExpiresAt: callbackResult.tokenExpiresAt }
                  : { tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) }),
                tokenStatus: 'valid',
                connectionStatus: 'ACTIVE' as const,
                connectedAt: new Date(),
                lastSyncAt: new Date(),
                isActive: true,
                followersCount: igProfile.followers_count ?? 0,
                mediaCount: igProfile.media_count ?? 0,
                biography: igProfile.biography,
                website: igProfile.website,
                profilePictureUrl: igProfile.profile_picture_url,
                accountType: igProfile.account_type ?? 'BUSINESS',
                isBusinessAccount: true,
                platformMetadata: {
                  metaBusinessId: page.metaBusinessId,
                  linkedFacebookPageId: page.pageId,
                },
                updatedAt: new Date(),
              },
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          console.log(`[facebook/callback] Auto-connected Instagram ${igId} (${igProfile.username ?? igId}) for workspace ${workspaceId}`);
        } catch (igErr) {
          console.warn(`[facebook/callback] Could not auto-connect Instagram for page ${page.pageId}:`, (igErr as Error).message);
          // Non-fatal — the Facebook Page was still connected
        }
      }
    }
    } // end if (oauthContext !== 'onboarding')
    // During onboarding or settings context, mark all pages as "connected" so the flow proceeds
    if (oauthContext === 'onboarding' || oauthContext === 'settings') {
      for (const page of pages) {
        connected.push({ pageId: page.pageId, pageName: page.pageName });
      }
    }

    if (connected.length === 0) {
      const reason = encodeURIComponent(
        errors.length > 0
          ? `Failed to connect: ${errors.join('; ')}`
          : 'Failed to save the Facebook Page. Please try again.'
      );
      if (oauthContext === 'onboarding') {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/signup?authorizedBrandCount=0&meta_error=${reason}`);
      }
      return res.redirect(`/connect/facebook/error?reason=${reason}`);
    }

    // ── Upsert AuthorizedBrand records for each page (Requirements: 3.1, 3.4, 3.6, 3.8) ──
    // Called only after pages are successfully fetched and saved. Non-fatal.
    let authorizedBrandCount = 0;
    try {
      const { workspaceService } = await import('../services/WorkspaceService');
      const mongoose = await import('mongoose');

      // During onboarding, workspaceId in state is the user's Firebase UID (no workspace yet).
      // For non-onboarding, look up workspace to get the owner's UID.
      let ownerId: string = '';

      if (oauthContext === 'onboarding') {
        // workspaceId holds the Firebase UID during onboarding
        ownerId = workspaceId;
      } else {
        const { WorkspaceModel } = await import('../models/Workspace/WorkspaceModel');
        const workspace = await WorkspaceModel.findById(workspaceId).lean();
        ownerId = (workspace as any)?.ownerId ?? '';
      }

      if (ownerId) {
        // For onboarding, fetch Instagram usernames so brand cards show @username
        const metaPagesWithUsernames = await Promise.all(pages.map(async (page: any) => {
          let igUsername: string | null = page.linkedInstagramUsername ?? null;
          if (!igUsername && page.linkedInstagramAccountId) {
            try {
              const igUrl = new URL(`${FB_GRAPH_BASE}/${FB_API_VERSION}/${page.linkedInstagramAccountId}`);
              igUrl.searchParams.set('fields', 'id,username');
              igUrl.searchParams.set('access_token', page.accessToken || callbackResult.longLivedToken);
              const igRes = await fetch(igUrl.toString(), { signal: AbortSignal.timeout(8_000) });
              if (igRes.ok) {
                const igData = await igRes.json() as { id?: string; username?: string };
                igUsername = igData.username ?? null;
              }
            } catch { /* non-fatal */ }
          }
          return {
            pageId: page.pageId,
            pageName: page.pageName,
            pageProfilePictureUrl: page.profilePictureUrl ?? '',
            linkedInstagramAccountId: page.linkedInstagramAccountId ?? null,
            linkedInstagramUsername: igUsername,
            accessToken: page.accessToken,
            userAccessToken: callbackResult.longLivedToken,
            tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            tokenRef: new mongoose.Types.ObjectId(),
          };
        }));
        const upserted = await workspaceService.upsertAuthorizedBrands(ownerId, metaPagesWithUsernames);
        authorizedBrandCount = upserted.length;
        console.log(`[facebook/callback] Upserted ${authorizedBrandCount} authorized brand(s) for user ${ownerId}`);
      } else {
        console.warn('[facebook/callback] Could not resolve ownerId for workspace:', workspaceId);
      }
    } catch (upsertError) {
      console.error('[Facebook OAuth] Failed to upsert authorized brands:', upsertError);
      // Non-fatal — don't break the OAuth flow
    }

    // Trigger background analytics sync and BullMQ polling for all connected accounts
    // so data shows up immediately without waiting for the next scheduled poll.
    // Skip this during onboarding or settings context — SocialAccount records don't exist yet.
    if (oauthContext !== 'onboarding' && oauthContext !== 'settings') {
    try {
      const { socialAccountRepository } = await import('../repositories/SocialAccountRepository');
      const { MetricsQueueManager } = await import('../queues/metricsQueue');

      for (const page of pages) {
        // 1. Enqueue Facebook Page sync via BullMQ
        // Facebook pages use their pageId as the "instagramAccountId" field in the queue
        // (the worker resolves the DB record using socialAccountService.findByInstagramAccountId
        //  which searches by accountId field, so this works for facebook too)
        const fbAccount = await socialAccountRepository.findOne({
          workspaceId,
          platform: 'facebook',
          accountId: page.pageId,
        }).catch(() => null);

        if (fbAccount) {
          const fbToken = (fbAccount as any).accessToken || page.accessToken;
          // Schedule smart polling for Facebook Page
          MetricsQueueManager.scheduleMetricsFetch(
            workspaceId,
            'system',
            page.pageId,
            fbToken,
            'all',
            { forceRefresh: true, priority: 5 }
          ).catch((err: Error) => console.warn('[facebook/callback] FB polling schedule failed:', err.message));
          console.log(`[facebook/callback] Scheduled FB Page sync for ${page.pageId}`);
        }

        // 2. Enqueue Instagram account sync via connect-init (uses existing ConnectInitService)
        if (page.linkedInstagramAccountId) {
          try {
            const igAccount = await socialAccountRepository.findOne({
              workspaceId,
              platform: 'instagram',
              accountId: page.linkedInstagramAccountId,
            });
            if (igAccount) {
              const igToken = (igAccount as any).accessToken || callbackResult.longLivedToken;
              const enqueued = await MetricsQueueManager.enqueueConnectInit({
                workspaceId,
                instagramAccountId: page.linkedInstagramAccountId,
                token: igToken,
                username: (igAccount as any).username || page.linkedInstagramAccountId,
                followersCount: (igAccount as any).followersCount,
              });
              if (enqueued) {
                console.log(`[facebook/callback] Enqueued IG connect-init for ${page.linkedInstagramAccountId}`);
              } else {
                // Inline fallback
                const { ConnectInitService } = await import('../services/ConnectInitService');
                ConnectInitService.run({
                  workspaceId,
                  instagramAccountId: page.linkedInstagramAccountId,
                  accessToken: igToken,
                  username: (igAccount as any).username || page.linkedInstagramAccountId,
                  followersCount: (igAccount as any).followersCount,
                }).catch((err: Error) => console.warn('[facebook/callback] IG connect-init inline failed:', err.message));
              }
            }
          } catch (igSyncErr) {
            console.warn(`[facebook/callback] IG sync dispatch failed:`, (igSyncErr as Error).message);
          }
        }
      }
    } catch (syncErr) {
      console.warn(`[facebook/callback] Post-connect sync failed:`, (syncErr as Error).message);
    }
    } // end if (oauthContext !== 'onboarding')

    // Trigger the 24-month phased Facebook Insights history backfill (4 × 6 months).
    // Skip during onboarding or settings — the real workspace/accounts don't exist yet.
    if (oauthContext !== 'onboarding' && oauthContext !== 'settings') {
    try {
      const { prewarmFacebookInsightsForWorkspace } = await import('../features/facebook/analytics/facebookInsightsHistory');
      prewarmFacebookInsightsForWorkspace(workspaceId)
        .catch((err: Error) => console.warn('[facebook/callback] FB insights prewarm failed:', err.message));
      console.log(`[facebook/callback] Enqueued Facebook 24-month history backfill for workspace ${workspaceId}`);
    } catch (prewarmErr) {
      console.warn('[facebook/callback] Could not start FB prewarm:', (prewarmErr as Error).message);
    }
    } // end if (oauthContext !== 'onboarding')

    // Redirect straight to Social Accounts settings with cache-bust signal
    // For onboarding context, redirect back to the signup flow so OnboardingConnectMeta can handle it.
    // For settings context, redirect to brand selection modal.
    if (oauthContext === 'onboarding') {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/signup?authorizedBrandCount=${authorizedBrandCount}`);
    }
    // Settings: redirect to brand selection modal — user picks which brand to connect
    return res.redirect(`/settings?tab=social&brand_selection=true&authorizedBrandCount=${authorizedBrandCount}`);
  } catch (err) {
    const fbErr = mapFacebookApiError(err);
    let reason = fbErr.message;

    if (fbErr.type === 'TOKEN_EXPIRED') {
      reason = 'Your session expired during authorization. Please try connecting again.';
    } else if (fbErr.type === 'PERMISSION_DENIED') {
      reason = fbErr.missingPermission
        ? `Required permission "${fbErr.missingPermission}" was not granted. Please try again and accept all permissions.`
        : 'Required permissions were not granted. Please try again and accept all permissions.';
    } else if (fbErr.type === 'RATE_LIMITED') {
      reason = 'Facebook is temporarily unavailable. Please try again in a few minutes.';
    }

    console.error('[facebook/callback] OAuth callback error:', {
      type: fbErr.type,
      code: fbErr.code,
      message: fbErr.message,
      raw: String(err),
    });

    if (oauthContext === 'onboarding') {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/signup?meta_error=${encodeURIComponent(reason)}`);
    }
    return res.redirect(`/connect/facebook/error?reason=${encodeURIComponent(reason)}`);
  }
});

// ─── POST /api/facebook/pages/connect ────────────────────────────────────
/**
 * Legacy endpoint kept for compatibility — the callback now handles connection
 * automatically. This endpoint can still be used for manual page selection flows.
 */
router.post('/pages/connect', requireAuth, async (req: Request, res: Response) => {
  const { sessionToken, pageIds, workspaceId } = req.body;

  // ── Body validation ────────────────────────────────────────────────────
  if (!sessionToken || typeof sessionToken !== 'string') {
    return res.status(400).json({ error: 'sessionToken is required' });
  }
  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    return res.status(400).json({ error: 'pageIds must be a non-empty array' });
  }
  if (!workspaceId || typeof workspaceId !== 'string') {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  // Validate each pageId is a non-empty string
  const invalidIds = pageIds.filter((id: unknown) => typeof id !== 'string' || !id.trim());
  if (invalidIds.length > 0) {
    return res.status(400).json({ error: 'All pageIds must be non-empty strings' });
  }

  // ── Retrieve session ───────────────────────────────────────────────────
  const session = getSession(sessionToken);
  if (!session) {
    return res.status(401).json({
      error: 'Session expired or invalid. Please restart the Facebook connection flow.',
    });
  }

  // ── Connect each selected page ─────────────────────────────────────────
  const connected: Array<{ pageId: string; pageName: string }> = [];

  for (const pageId of pageIds as string[]) {
    // Find the page in the session (proves the user actually authorized this page)
    const page = session.pages.find((p) => p.pageId === pageId);
    if (!page) {
      // Skip unknown page IDs silently — they were not part of the authorized set
      console.warn(
        `[facebook/pages/connect] Page ${pageId} not found in session — skipping`
      );
      continue;
    }

    let longLivedToken: string;
    let tokenExpiresAt: Date;

    try {
      // Exchange the short-lived Page Access Token for a long-lived one
      const refreshResult = await facebookProvider.refreshToken(page.accessToken);
      longLivedToken = refreshResult.accessToken;
      tokenExpiresAt = refreshResult.expiresAt;
    } catch (err) {
      // If the token exchange fails, fall back to the original token from /me/accounts
      // (which is already ~60 days for most Pages returned by the Graph API).
      // Log the failure but continue processing other pages.
      const fbErr = mapFacebookApiError(err);
      console.warn(
        `[facebook/pages/connect] Long-lived token exchange failed for page ${pageId} — using original token:`,
        fbErr.message
      );
      longLivedToken = page.accessToken;
      tokenExpiresAt = page.tokenExpiresAt;
    }

    // Build the SocialAccount upsert document
    const upsertFilter = {
      workspaceId,
      platform: 'facebook' as const,
      accountId: pageId,
    };

    const upsertDoc = {
      $set: {
        workspaceId,
        platform: 'facebook' as const,
        accountId: pageId,
        pageId,
        pageName: page.pageName,
        username: page.pageName,            // username is required by schema; use page name
        profilePictureUrl: page.profilePictureUrl,
        pageCategory: page.pageCategory,
        accessToken: longLivedToken,
        tokenExpiresAt,
        tokenStatus: 'valid',               // ensure old-hook filter picks this up
        permissions: page.permissions ?? [],
        connectionStatus: 'ACTIVE' as const,
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        isActive: true,
        platformMetadata: {
          pageCategory: page.pageCategory,
          pageFanCount: undefined,          // populated on first analytics sync
          metaBusinessId: page.metaBusinessId,
          linkedInstagramAccountId: page.linkedInstagramAccountId,
        },
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    };

    try {
      await SocialAccountModel.findOneAndUpdate(upsertFilter, upsertDoc, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });

      connected.push({ pageId, pageName: page.pageName });

      // ── Auto-connect the linked Instagram Business Account ──────────────
      // If this Facebook Page has a linked Instagram Business Account, create
      // an Instagram SocialAccount record automatically using the same User
      // Access Token from the session. The user only needs one OAuth flow for
      // both platforms.
      if (page.linkedInstagramAccountId) {
        try {
          const igId = page.linkedInstagramAccountId;
          // Fetch IG profile fields via the Graph API
          const igProfileUrl = new URL(
            `${FB_GRAPH_BASE}/${FB_API_VERSION}/${igId}`
          );
          igProfileUrl.searchParams.set(
            'fields',
            'id,username,name,biography,website,account_type,media_count,followers_count,profile_picture_url'
          );
          igProfileUrl.searchParams.set(
            'access_token',
            session.callbackResult.longLivedToken
          );

          let igProfile: {
            id: string;
            username?: string;
            name?: string;
            biography?: string;
            website?: string;
            account_type?: string;
            media_count?: number;
            followers_count?: number;
            profile_picture_url?: string;
          } = { id: igId };

          try {
            const fetchRes = await fetch(igProfileUrl.toString(), {
              signal: AbortSignal.timeout(10_000),
            });
            if (fetchRes.ok) {
              igProfile = await fetchRes.json() as typeof igProfile;
            }
          } catch {
            // Profile fetch failure is non-fatal — still create the record
            // with minimal data so the account is at least tracked
          }

          const igUpsertFilter = {
            workspaceId,
            platform: 'instagram' as const,
            accountId: igId,
          };

          const igUpsertDoc = {
            $set: {
              workspaceId,
              platform: 'instagram' as const,
              accountId: igId,
              username: igProfile.username ?? igId,
              accessToken: session.callbackResult.longLivedToken,
              tokenExpiresAt: session.callbackResult.tokenExpiresAt,
              tokenStatus: 'valid',
              connectionStatus: 'ACTIVE' as const,
              connectedAt: new Date(),
              lastSyncAt: new Date(),
              isActive: true,
              followersCount: igProfile.followers_count ?? 0,
              mediaCount: igProfile.media_count ?? 0,
              biography: igProfile.biography,
              website: igProfile.website,
              profilePictureUrl: igProfile.profile_picture_url,
              accountType: igProfile.account_type ?? 'BUSINESS',
              isBusinessAccount: true,
              platformMetadata: {
                metaBusinessId: page.metaBusinessId,
                linkedFacebookPageId: pageId,
              },
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          };

          await SocialAccountModel.findOneAndUpdate(igUpsertFilter, igUpsertDoc, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          });

          console.log(
            `[facebook/pages/connect] Auto-connected Instagram account ${igId} linked to page ${pageId}`
          );
        } catch (igErr) {
          // IG auto-connect failure is non-fatal — the Facebook Page was
          // still connected successfully. Log and continue.
          console.warn(
            `[facebook/pages/connect] Could not auto-connect Instagram account linked to page ${pageId}:`,
            igErr instanceof Error ? igErr.message : igErr
          );
        }
      }
    } catch (err: any) {
      // MongoDB duplicate key error — compound unique index violation
      if (err?.code === 11000 || (err?.name === 'MongoServerError' && err?.code === 11000)) {
        // Clean up the session before returning so the token doesn't linger
        deleteSession(sessionToken);
        return res.status(409).json({
          error: 'One or more Pages are already connected to this workspace.',
          details: `Page "${page.pageName}" (${pageId}) is already connected.`,
        });
      }

      // Other database errors — log and surface
      console.error(`[facebook/pages/connect] DB error saving page ${pageId}:`, err);
      return res.status(500).json({
        error: 'Failed to save one or more Pages. Please try again.',
      });
    }
  }

  // ── Invalidate the session (one-time use) ──────────────────────────────
  deleteSession(sessionToken);

  if (connected.length === 0) {
    return res.status(400).json({
      error: 'None of the requested page IDs were found in the authorization session.',
    });
  }

  return res.status(200).json({ connected });
});

export default router;
