import express from 'express';
import InstagramApiService from '../services/instagramApi';
import { checkTokenHealth } from '../middleware/tokenHealthCheck.js';
const router = express.Router();
// POST /api/diagnostics/instagram
// Body: { accessToken: string, limit?: number }
router.post('/instagram', checkTokenHealth, async (req, res) => {
    const accessToken = (req.body?.accessToken || '').trim();
    const useStoredToken = !!req.body?.useStoredToken;
    const workspaceId = (req.body?.workspaceId || '').trim();
    const limit = Math.max(1, Math.min(parseInt(req.body?.limit) || 6, 25));
    // Option A: use provided token (existing behavior)
    // Option B: use stored token for the connected Instagram account in this workspace
    let tokenToUse = accessToken;
    let igAccount = null;
    if (useStoredToken) {
        if (!workspaceId) {
            return res.status(400).json({ ok: false, error: 'Missing workspaceId for stored token' });
        }
        try {
            const { MongoStorage } = await import('../mongodb-storage');
            const storage = new MongoStorage();
            const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
            igAccount = accounts.find((a) => a.platform === 'instagram' && a.hasAccessToken);
            if (!igAccount)
                return res.status(404).json({ ok: false, error: 'No connected Instagram account for this workspace' });
            // Use the accessToken provided by converted account (derived from encrypted storage)
            tokenToUse = igAccount.accessToken || null;
            if (!tokenToUse) {
                return res.status(400).json({
                    ok: false,
                    error: 'No valid encrypted token found. Please reconnect your Instagram account in Settings.',
                    requiresReconnection: true
                });
            }
        }
        catch (e) {
            return res.status(500).json({ ok: false, error: 'Failed to load stored token: ' + (e?.message || 'unknown') });
        }
    }
    if (!tokenToUse) {
        return res.status(400).json({ ok: false, error: 'Missing access token' });
    }
    try {
        // Token validation: Use a live call to /me as a reliable check (debug_token requires app token)
        let tokenValid = false;
        try {
            const me = await InstagramApiService.getAccountInfo(tokenToUse);
            tokenValid = !!me?.id;
        }
        catch (e) {
            tokenValid = false;
        }
        // If token is invalid, return a clear error instead of continuing and spamming per-row errors
        if (!tokenValid) {
            return res.status(401).json({
                ok: false,
                tokenValid: false,
                error: 'Invalid or expired Instagram access token. Please reconnect your Instagram account in Settings to refresh the token.',
            });
        }
        // Fetch account info to detect token/app type (Insights require Business/Creator)
        const acct = await InstagramApiService.getAccountInfo(tokenToUse);
        const supportsInsights = acct?.account_type === 'BUSINESS' || acct?.account_type === 'CREATOR';
        // Compatibility check: Prefer Instagram Graph v22, fall back to Facebook Graph
        const igGraphCompatible = await InstagramApiService.isInstagramGraphCompatible(tokenToUse);
        const fbGraphCompatible = igGraphCompatible ? true : await InstagramApiService.isFacebookGraphCompatible(tokenToUse);
        // Fetch last N media
        const mediaResp = await InstagramApiService.getUserMedia(tokenToUse, limit);
        const items = mediaResp?.data || [];
        // Also fetch Stories separately (they have a different endpoint)
        const storiesResp = await InstagramApiService.getUserStories(tokenToUse);
        // Tag story items so we can normalize mediaType reliably
        const stories = (storiesResp?.data || []).map((s) => ({ ...s, __source: 'stories' }));
        // Selection policy:
        // - Always include the latest `limit` posts (default 6)
        // - If stories are available, include up to the latest 4 stories in addition
        const postItems = items
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);
        const storyItems = stories
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 4);
        const allItems = [...storyItems, ...postItems];
        const diagnostics = [];
        for (const m of allItems) {
            try {
                // Map Instagram API media_type to our expected format
                let mediaType = 'IMAGE';
                if (m.media_type === 'VIDEO')
                    mediaType = 'VIDEO';
                else if (m.media_type === 'CAROUSEL_ALBUM')
                    mediaType = 'CAROUSEL_ALBUM';
                else if (m.media_type === 'STORY')
                    mediaType = 'STORY';
                // Treat Instagram Reels (media_product_type=REELS) as REEL for metric selection
                if (m.media_product_type === 'REELS')
                    mediaType = 'REEL';
                // Items that came from the stories endpoint should be treated as STORY regardless of media_type
                if (m.__source === 'stories')
                    mediaType = 'STORY';
                // Some Stories can appear with media_type VIDEO but product type STORY; normalize to STORY
                if (m.media_product_type === 'STORY')
                    mediaType = 'STORY';
                console.log(`[DIAGNOSTICS] Processing media ${m.id} (${m.media_type} -> ${mediaType})`);
                const insights = (supportsInsights && (igGraphCompatible || fbGraphCompatible))
                    ? await InstagramApiService.getMediaInsights(m.id, tokenToUse, mediaType, m.media_product_type)
                    : undefined;
                diagnostics.push({
                    id: m.id,
                    type: mediaType,
                    like_count: m.like_count ?? null,
                    comments_count: m.comments_count ?? null,
                    insights: {
                        likes: insights?.likes ?? null,
                        comments: insights?.comments ?? null,
                        shares: insights?.shares ?? null,
                        replies: insights?.replies ?? null,
                        saved: insights?.saves ?? null,
                        reach: insights?.reach ?? null,
                        impressions: insights?.impressions ?? null,
                    },
                    error: supportsInsights ? ((igGraphCompatible || fbGraphCompatible) ? undefined : 'Token is not compatible with Instagram Graph v22 or Facebook Graph insights endpoints') : 'Insights require Business/Creator account token'
                });
            }
            catch (e) {
                diagnostics.push({ id: m.id, type: m.media_type, error: e?.message || 'Failed to fetch insights' });
            }
        }
        // Quick reasoning hints per Meta docs
        const hints = [];
        const hasStory = allItems.some((i) => i.media_type === 'STORY' || i?.media_product_type === 'STORY' || i?.__source === 'stories');
        if (!hasStory)
            hints.push('No recent Stories found. Story insights expire after 24h.');
        if (!diagnostics.some(d => d.insights?.shares))
            hints.push('Shares often only appear for Reels/Stories; photos may return none.');
        if (!diagnostics.some(d => d.insights?.saved))
            hints.push('Saved is returned as saved and may legitimately be 0.');
        if (!supportsInsights)
            hints.push('Your token is Basic Display. Media insights (shares/saves/reach) require Instagram Business/Creator via Facebook Graph and the instagram_manage_insights permission.');
        // If we used the stored token, update the connected account with the computed totals (no extra API cost)
        if (useStoredToken && igAccount) {
            const totals = diagnostics.reduce((acc, row) => {
                const sh = Number(row?.insights?.shares || 0);
                const sv = Number(row?.insights?.saved || 0);
                const lk = Number(row?.like_count || 0);
                const cm = Number(row?.comments_count || 0);
                acc.totalShares += sh;
                acc.totalSaves += sv;
                acc.totalLikes += lk;
                acc.totalComments += cm;
                acc.postsAnalyzed += 1;
                return acc;
            }, { totalShares: 0, totalSaves: 0, totalLikes: 0, totalComments: 0, postsAnalyzed: 0 });
            try {
                const { MongoStorage } = await import('../mongodb-storage');
                const storage = new MongoStorage();
                await storage.updateSocialAccount(igAccount.id || igAccount._id, {
                    totalShares: totals.totalShares,
                    totalSaves: totals.totalSaves,
                    totalLikes: totals.totalLikes,
                    totalComments: totals.totalComments,
                    postsAnalyzed: totals.postsAnalyzed,
                    lastSyncAt: new Date(),
                    updatedAt: new Date()
                });
            }
            catch { }
        }
        // Calculate totals for response (whether or not we update the database)
        const totals = diagnostics.reduce((acc, row) => {
            const sh = Number(row?.insights?.shares || 0);
            const sv = Number(row?.insights?.saved || 0);
            const lk = Number(row?.like_count || 0);
            const cm = Number(row?.comments_count || 0);
            acc.totalShares += sh;
            acc.totalSaves += sv;
            acc.totalLikes += lk;
            acc.totalComments += cm;
            acc.postsAnalyzed += 1;
            return acc;
        }, { totalShares: 0, totalSaves: 0, totalLikes: 0, totalComments: 0, postsAnalyzed: 0 });
        return res.json({
            ok: true,
            tokenValid: true,
            count: allItems.length,
            diagnostics,
            hints,
            usedStoredToken: useStoredToken,
            totalShares: totals.totalShares,
            totalSaves: totals.totalSaves,
            totalLikes: totals.totalLikes,
            totalComments: totals.totalComments,
            postsAnalyzed: totals.postsAnalyzed
        });
    }
    catch (error) {
        return res.status(500).json({ ok: false, error: error?.message || 'Diagnostics failed' });
    }
});
export default router;
// GET /api/diagnostics/instagram/account?workspaceId=...
// Returns what the database currently stores for totals so we can verify persistence
router.get('/instagram/account', checkTokenHealth, async (req, res) => {
    try {
        const workspaceId = String(req.query.workspaceId || '').trim();
        if (!workspaceId)
            return res.status(400).json({ ok: false, error: 'Missing workspaceId' });
        const { MongoStorage } = await import('../mongodb-storage');
        const storage = new MongoStorage();
        const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
        const ig = accounts.find((a) => a.platform === 'instagram');
        if (!ig)
            return res.status(404).json({ ok: false, error: 'No Instagram account found for workspace' });
        return res.json({
            ok: true,
            account: {
                id: ig.id || ig._id,
                username: ig.username,
                totalLikes: ig.totalLikes || 0,
                totalComments: ig.totalComments || 0,
                totalShares: ig.totalShares || 0,
                totalSaves: ig.totalSaves || 0,
                postsAnalyzed: ig.postsAnalyzed || 0,
                lastSyncAt: ig.lastSyncAt || null
            }
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'Failed to read account' });
    }
});
