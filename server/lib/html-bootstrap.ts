import type { Request } from 'express';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Server-side auth bootstrap + app-shell SSR for the SPA's index.html.
 *
 * Phases 1/2 (reliable auth on first byte): the server resolves whether the
 * request carries a valid authenticated session (from the existing httpOnly
 * `auth_token` cookie) and inlines a small, NON-SENSITIVE flag into the HTML:
 *
 *     window.__VEEFORE_BOOTSTRAP__ = { authed: true|false }
 *
 * Phase 3 (real shell pixels in the first byte): when the client's first paint
 * for this request would be the app-shell skeleton (authed root, or any
 * protected route), the server renders the route-aware `AppShellSkeleton` to a
 * static HTML string and inlines it INSIDE `<div id="root">…</div>`. The client
 * mounts with `createRoot` (not hydrate) and immediately renders the SAME
 * skeleton, so the static markup is replaced seamlessly with no hydration
 * coupling and no layout shift.
 *
 * Everything here is best-effort and FAIL-OPEN: any error leaves the HTML
 * unchanged (or just omits the shell), so it can never break page serving.
 */

interface BootstrapData {
  authed: boolean;
  /** Auth cookies were present on the request (even if verification failed). */
  cookied?: boolean;
  /** `{ success, data: user }` envelope matching `/api/user`, when verified. */
  user?: unknown;
  /** `{ success, data: workspaces }` envelope matching `/api/workspaces`. */
  workspaces?: unknown;
  /**
   * Social-accounts arrays seeded for first-byte render, keyed by workspace id
   * (token blobs stripped). `workspaceId` is the default workspace. Seeding every
   * workspace means whichever one is active on the client hits the seeded cache.
   */
  dashboard?: {
    workspaceId: string;
    accountsByWorkspace: Record<string, unknown[]>;
    /** Aggregated dashboard analytics per workspace id (mirrors /api/dashboard/analytics). */
    analyticsByWorkspace?: Record<string, unknown>;
    /** Historical analytics (default 'month'/30d) per workspace id (mirrors /api/analytics/historical). */
    historicalByWorkspace?: Record<string, unknown[]>;
    /** Follower analytics per workspace id (mirrors /api/workspaces/:id/metrics/followers). */
    followerByWorkspace?: Record<string, unknown>;
  };
  /**
   * VeeGPT conversation list for the ACTIVE workspace (mirrors
   * /api/chat/conversations). Fetched fresh per request (NOT cached) because it's
   * workspace-specific; seeds the conversation sidebar so it renders instantly.
   */
  chat?: { workspaceId: string; conversations: unknown[] };
  /**
   * Non-sensitive diagnostic describing which verification path produced this
   * bootstrap (so first-byte seeding issues can be diagnosed in production via
   * `window.__VEEFORE_BOOTSTRAP__.reason`). Never contains PII.
   */
  reason?: string;
}

/** Sensitive fields never inlined into HTML (the widgets don't use them). */
const SOCIAL_ACCOUNT_SECRET_FIELDS = [
  'encryptedAccessToken', 'encryptedRefreshToken', 'accessToken', 'refreshToken',
];

function sanitizeAccount(acc: any): any {
  if (!acc || typeof acc !== 'object') return acc;
  // Mirror how the API serializes the doc: the route JSON-stringifies the Mongoose
  // document via toJSON (which includes the `id` virtual), so the seed matches the
  // live `/api/social-accounts` response shape exactly. Fall back to toObject/spread.
  const plain =
    typeof acc.toJSON === 'function' ? acc.toJSON()
      : typeof acc.toObject === 'function' ? acc.toObject()
        : { ...acc };
  for (const f of SOCIAL_ACCOUNT_SECRET_FIELDS) delete plain[f];
  return plain;
}

/**
 * Aggregate dashboard analytics from a workspace's social accounts. MUST mirror
 * the `/api/dashboard/analytics` handler exactly (same fields, same rounding) so
 * the seeded value equals what a fetch would return — otherwise the Performance
 * Overview metrics would flicker when the background refetch reconciles.
 */
function computeDashboardAnalytics(accounts: any[]): Record<string, unknown> {
  let totalFollowers = 0, totalLikes = 0, totalComments = 0, totalViews = 0;
  let totalReach = 0, totalPosts = 0, totalEngagement = 0, accountCount = 0;
  for (const acc of accounts) {
    const a = acc as any;
    if (a?.platform === 'instagram') {
      totalFollowers += a.followersCount || 0;
      totalLikes += a.totalLikes || 0;
      totalComments += a.totalComments || 0;
      totalViews += a.totalViews || 0;
      totalReach += a.totalReach || 0;
      totalPosts += a.mediaCount || a.posts || 0;
      totalEngagement += a.engagementRate || a.avgEngagement || 0;
      accountCount++;
    }
  }
  const avgEngagement = accountCount > 0 ? totalEngagement / accountCount : 0;
  return {
    totalFollowers, totalLikes, totalComments, totalViews, totalReach, totalPosts,
    avgEngagement: Math.round(avgEngagement * 100) / 100,
    accountCount,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Map raw analytics rows to the historical-data shape the client expects. MUST
 * mirror the `/api/analytics/historical` route's mapping so the seed equals a
 * fetched response (the `useHistoricalData` query stores `response.data`).
 */
function mapHistorical(rows: any[]): unknown[] {
  return rows.map((a: any) => ({
    date: a.date || a.createdAt,
    platform: a.platform,
    accountId: a.accountId,
    followers: a.followers || 0,
    likes: a.likes || 0,
    comments: a.comments || 0,
    shares: a.shares || 0,
    reach: a.reach || 0,
    reachDay: a.reachDay || 0,
    reachWeek: a.reachWeek || 0,
    reachDays28: a.reachDays28 || 0,
    viewsDay: a.viewsDay || 0,
    viewsWeek: a.viewsWeek || 0,
    viewsDays28: a.viewsDays28 || 0,
    engagement: a.engagement || 0,
    views: a.views || 0,
    posts: a.posts || 0,
    metrics: {
      posts: a.customMetrics?.posts || 0,
      contentScore: { score: a.engagement || 5 },
    },
  }));
}

/**
 * Public routes — MUST mirror `client/src/App.tsx`'s `publicRoutes`. Used to
 * decide whether the client's first paint is the shell (so the SSR shell only
 * appears when the client agrees, never causing a wrong-page flash).
 */
const PUBLIC_ROUTES = [
  '/', '/features', '/pricing', '/changelog', '/about', '/blog', '/careers',
  '/contact', '/security', '/gdpr', '/privacy-policy', '/terms-of-service',
  '/free-trial', '/help', '/community', '/status', '/cookies', '/waitlist',
  '/signup', '/signin', '/admin-login', '/landing', '/auth/reset-password',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}

/**
 * Whether the client's first paint for this request would be the app-shell
 * skeleton — mirrors the `loading` branch in `client/src/App.tsx`:
 *   - protected routes always paint the shell while auth resolves;
 *   - the root entry (`/` or `/landing`) paints the shell only for a
 *     server-confirmed authenticated session.
 */
export function shouldRenderShell(pathname: string, authed: boolean): boolean {
  if (!isPublicRoute(pathname)) return true;
  if (authed && (pathname === '/' || pathname === '/landing')) return true;
  return false;
}

export function getRequestPathname(req: Request): string {
  const raw = (req.originalUrl || req.url || '/').split('?')[0];
  return raw || '/';
}

/**
 * Resolve whether the request carries a valid-looking authenticated session.
 * Mirrors the uid-resolution used by `AuthController.getSession`. Fail-safe.
 */
export async function resolveAuthedFromRequest(req: Request): Promise<boolean> {
  try {
    const authToken = (req as any).cookies?.auth_token;
    if (!authToken || typeof authToken !== 'string') return false;

    const { getFirebaseAdmin } = await import('../firebase-admin');
    const admin = getFirebaseAdmin();

    let uid: string | undefined;
    try {
      const decoded = await admin.auth().verifyIdToken(authToken);
      uid = decoded.uid;
    } catch {
      try {
        const parts = authToken.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          uid = payload.uid || payload.user_id || payload.sub;
        }
      } catch {
        /* ignore malformed token */
      }
    }
    if (!uid) return false;

    const { User } = await import('../models/User/User');
    const user = await User.findById(uid).select('_id').lean();
    return !!user;
  } catch {
    return false;
  }
}

/**
 * Resolve a promise but give up after `ms`, returning `fallback` instead. Used to
 * keep the bootstrap OFF the critical path: if the DB/cache is slow, we fall back
 * to a boolean-only bootstrap and let the client fetch, rather than delaying the
 * first byte. The slow promise is left to settle on its own (no leak of rejection).
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); },
    );
  });
}

// Per-user bootstrap cache (Redis). Short TTL: repeat HTML loads (reloads, tabs,
// navigation) skip the DB work entirely. Safe to be briefly stale because the
// client reconciles on mount (social-accounts seed is marked stale) and all
// mutations invalidate their queries client-side.
const BOOTSTRAP_CACHE_TTL_SEC = 60;
const BOOTSTRAP_CACHE_PREFIX = 'veefore:bootstrap:';
// VeeGPT conversation-list seed is workspace-specific, so it's cached under a
// SEPARATE per-(uid,workspace) key (not in the per-uid bootstrap blob) with a
// short TTL. This keeps the seed fresh while ensuring the DB query does NOT run
// on every HTML load (including bootstrap cache hits) — which was adding up to
// BOOTSTRAP_CHAT_BUDGET_MS to TTFB on every VeeGPT navigation and causing a
// white navigation flash before the shell.
const BOOTSTRAP_CHAT_CACHE_PREFIX = 'veefore:chatseed:';
const BOOTSTRAP_CHAT_CACHE_TTL_SEC = 30;
const BOOTSTRAP_CHAT_CACHE_READ_MS = 40; // Redis read budget for the chat seed
// Hard budgets (ms) so a slow dependency can NEVER block the first byte. The
// build budget is generous enough for the typical authenticated build (user +
// workspaces + per-workspace social accounts ≈ a few sequential DB round-trips
// in production) so the FIRST load usually seeds; if it still exceeds the budget
// we fall back to boolean-only AND the in-flight build warms the cache (see
// buildVerifiedBootstrap) so the next load is seeded.
const BOOTSTRAP_BUILD_BUDGET_MS = 2000; // total DB build budget
const BOOTSTRAP_CACHE_READ_MS = 40;    // Redis read budget
const BOOTSTRAP_CHAT_BUDGET_MS = 150;  // VeeGPT conversation-list fetch budget

async function readBootstrapCache(uid: string): Promise<BootstrapData | null> {
  try {
    const { getRedisClient } = await import('./redis');
    const redis = getRedisClient();
    const raw = await withTimeout(
      redis.get(BOOTSTRAP_CACHE_PREFIX + uid),
      BOOTSTRAP_CACHE_READ_MS,
      null,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BootstrapData;
    parsed.reason = 'cache-hit';
    return parsed;
  } catch {
    return null;
  }
}

function writeBootstrapCache(uid: string, data: BootstrapData): void {
  // Fire-and-forget: never block the response on the cache write.
  (async () => {
    try {
      const { getRedisClient } = await import('./redis');
      const redis = getRedisClient();
      const { reason, ...cacheable } = data; // don't persist the diagnostic field
      await redis.set(
        BOOTSTRAP_CACHE_PREFIX + uid,
        JSON.stringify(cacheable),
        'EX',
        BOOTSTRAP_CACHE_TTL_SEC,
      );
    } catch {
      /* non-fatal */
    }
  })();
}

/**
 * Invalidate a user's cached bootstrap so the NEXT HTML load rebuilds it fresh.
 * Call this from mutations that change what the bootstrap seeds (connect /
 * disconnect a social account, create / switch a workspace, complete onboarding).
 * Fire-and-forget + fail-open. `uid` is the user's id (== Firebase uid).
 */
export async function invalidateBootstrapCache(uid: string | undefined | null): Promise<void> {
  if (!uid) return;
  try {
    const { getRedisClient } = await import('./redis');
    const redis = getRedisClient();
    await redis.del(BOOTSTRAP_CACHE_PREFIX + String(uid));
  } catch {
    /* non-fatal */
  }
}

/** Fetch user + workspaces + per-workspace accounts from the DB (the slow part). */
async function buildBootstrapFromDb(uid: string): Promise<BootstrapData | null> {
  const { userService, workspaceService } = await import('../services');
  const user = await userService.getUserById(uid).catch(() => null);
  if (!user) return null;

  let workspaces: unknown = undefined;
  let workspaceList: any[] = [];
  try {
    const ws = await workspaceService.getWorkspacesByUserId(uid);
    if (ws != null) {
      workspaces = { success: true, data: ws };
      workspaceList = Array.isArray(ws) ? ws : [];
    }
  } catch {
    /* workspaces are optional for the bootstrap */
  }

  // Seed EVERY workspace's social-accounts array (parallel, so latency ≈ one
  // query) so the dashboard widgets render real data on the first byte regardless
  // of which workspace is active. Token blobs stripped. Fail-open.
  //
  // CRITICAL: use the EXACT same service call the live `/api/social-accounts`
  // endpoint uses (`getActiveAccountsByWorkspace` = tolerant lookup + isActive
  // filter). If the seed used a different query/shape, the on-mount reconcile
  // would disagree with the seed and the account could flicker to "not connected".
  let dashboard: BootstrapData['dashboard'] = undefined;
  try {
    if (workspaceList.length > 0) {
      const def = workspaceList.find((w) => w?.isDefault === true) || workspaceList[0];
      const defId = String(def?._id || def?.id || '');
      const { socialAccountService, analyticsService } = await import('../services');
      const accountsByWorkspace: Record<string, unknown[]> = {};
      const analyticsByWorkspace: Record<string, unknown> = {};
      const historicalByWorkspace: Record<string, unknown[]> = {};
      const followerByWorkspace: Record<string, unknown> = {};

      // Default period the Performance Overview opens on (mirrors the client's
      // `selectedPeriod` initial state). Only this period is seeded for instant
      // first paint; switching to day/week fetches normally.
      const HIST_DAYS = 30;

      await Promise.all(
        workspaceList.map(async (w) => {
          const wsId = String(w?._id || w?.id || '');
          if (!wsId) return;
          // Run the three reads for this workspace in parallel; each is
          // independent and fail-open so one slow/erroring query never blocks the
          // others or the whole seed.
          await Promise.all([
            (async () => {
              try {
                const accounts = await socialAccountService.getActiveAccountsByWorkspace(wsId);
                const raw = Array.isArray(accounts) ? accounts : [];
                accountsByWorkspace[wsId] = raw.map(sanitizeAccount);
                analyticsByWorkspace[wsId] = computeDashboardAnalytics(raw);
              } catch { /* skip */ }
            })(),
            (async () => {
              try {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - HIST_DAYS);
                const rows = await analyticsService.getAnalyticsByDateRange({
                  workspaceId: wsId, startDate: start, endDate: end,
                });
                historicalByWorkspace[wsId] = mapHistorical(Array.isArray(rows) ? rows : []);
              } catch { /* skip */ }
            })(),
            (async () => {
              try {
                const fd = await analyticsService.getFollowerAnalytics(wsId);
                if (fd != null) followerByWorkspace[wsId] = fd;
              } catch { /* skip */ }
            })(),
          ]);
        })
      );
      if (Object.keys(accountsByWorkspace).length > 0) {
        dashboard = {
          workspaceId: defId,
          accountsByWorkspace,
          analyticsByWorkspace,
          historicalByWorkspace,
          followerByWorkspace,
        };
      }
    }
  } catch {
    /* dashboard seed is optional */
  }

  return { authed: true, user: { success: true, data: user }, workspaces, dashboard };
}

/**
 * Build the `{ authed, user, workspaces, dashboard }` bootstrap for a VERIFIED
 * uid. Fast path: a Redis cache hit (repeat loads/tabs) skips the DB entirely.
 * The DB build runs under a hard timeout so a slow dependency can never delay the
 * first byte — on timeout we return a boolean-only bootstrap and the client
 * fetches normally. Always returns at least `{ authed: true }`.
 */
async function buildVerifiedBootstrap(uid: string, activeWsId?: string): Promise<BootstrapData> {
  // 1) Fast path: cached bootstrap from a recent load.
  const cached = await readBootstrapCache(uid);
  if (cached) {
    cached.chat = await fetchChatSeed(uid, activeWsId, cached);
    return cached;
  }

  // 2) Build from DB under a hard time budget so a slow dependency can never
  //    delay the first byte. CRITICAL: start the build ONCE and ALWAYS cache its
  //    result when it settles — even if THIS response times out and falls back to
  //    boolean-only. Previously a build that exceeded the budget was discarded
  //    (never cached), so if the build consistently ran slightly over budget the
  //    bootstrap NEVER seeded user/dashboard data and every load showed the cold
  //    skeleton instead of seeded data. Now the slow build still warms the cache,
  //    so the very next load (reload / tab / navigation within the TTL) is seeded
  //    and instant.
  const buildPromise = buildBootstrapFromDb(uid);
  buildPromise.then(
    (built) => { if (built) writeBootstrapCache(uid, built); },
    () => { /* non-fatal */ },
  );

  const built = await withTimeout(buildPromise, BOOTSTRAP_BUILD_BUDGET_MS, null);
  if (!built) {
    return { authed: true, reason: 'verified-build-timeout' };
  }
  // Attach the fresh (workspace-specific, never-cached) VeeGPT conversation seed.
  built.chat = await fetchChatSeed(uid, activeWsId, built);
  return built;
}

/**
 * Fetch the VeeGPT conversation list for the user's ACTIVE workspace (the `vf_ws`
 * cookie id if it's one of the user's workspaces, else their default). Kept OUT
 * of the per-uid bootstrap cache because it's workspace-specific (caching it
 * would leak one workspace's chats into another tab). Time-boxed + fail-open so
 * it can never delay or break the first byte.
 */
async function fetchChatSeed(
  uid: string,
  activeWsId: string | undefined,
  boot: BootstrapData,
): Promise<BootstrapData['chat'] | undefined> {
  try {
    const list: any[] = Array.isArray((boot.workspaces as any)?.data)
      ? (boot.workspaces as any).data
      : [];
    if (list.length === 0) return undefined;

    const inList = (id?: string) => !!id && list.some((w) => String(w?._id || w?.id) === id);
    const def = list.find((w) => w?.isDefault) || list[0];
    const convWsId = inList(activeWsId)
      ? String(activeWsId)
      : String(def?._id || def?.id || '');
    if (!convWsId) return undefined;

    // Fast path: a recent per-(uid,workspace) cached seed. This avoids running
    // the ChatConversation query on EVERY HTML load (which would add latency to
    // TTFB even on bootstrap cache hits) — the prime cause of the white flash
    // before the VeeGPT shell on navigation/refresh.
    const chatCacheKey = `${BOOTSTRAP_CHAT_CACHE_PREFIX}${uid}:${convWsId}`;
    try {
      const { getRedisClient } = await import('./redis');
      const redis = getRedisClient();
      const cachedRaw = await withTimeout(
        redis.get(chatCacheKey),
        BOOTSTRAP_CHAT_CACHE_READ_MS,
        null,
      );
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed && Array.isArray(parsed.conversations)) {
          return { workspaceId: convWsId, conversations: parsed.conversations };
        }
      }
    } catch {
      /* cache read is best-effort; fall through to the DB query */
    }

    const conversations = await withTimeout(
      (async () => {
        const { ChatConversation } = await import('../models/Chat');
        const rows = await ChatConversation.find({
          userId: uid,
          isArchived: { $ne: true },
          workspaceId: convWsId,
        })
          .sort({ lastMessageAt: -1, updatedAt: -1 })
          .limit(40)
          .lean();
        return Array.isArray(rows) ? rows : [];
      })(),
      BOOTSTRAP_CHAT_BUDGET_MS,
      null,
    );

    if (!conversations) return undefined;

    // Fire-and-forget cache write so the next load within the TTL skips the DB.
    (async () => {
      try {
        const { getRedisClient } = await import('./redis');
        const redis = getRedisClient();
        await redis.set(
          chatCacheKey,
          JSON.stringify({ workspaceId: convWsId, conversations }),
          'EX',
          BOOTSTRAP_CHAT_CACHE_TTL_SEC,
        );
      } catch {
        /* non-fatal */
      }
    })();

    return { workspaceId: convWsId, conversations };
  } catch {
    return undefined;
  }
}

/**
 * Resolve the full bootstrap state for a request (Phase 4): authed flag plus,
 * when we can obtain a CRYPTOGRAPHICALLY VERIFIED uid (from the `__session`
 * session cookie OR a still-valid `auth_token` ID token), the user + workspaces
 * in the EXACT `{ success, data }` envelopes that `/api/user` and
 * `/api/workspaces` return — so the client seeds React Query and renders the
 * real dashboard on the first byte. PII is injected ONLY on verification; an
 * unverified-but-decodable `auth_token` yields the boolean flag only. Fail-safe.
 */
export async function resolveBootstrapState(req: Request): Promise<BootstrapData> {
  const cookies = (req as any).cookies || {};
  const hasSession = !!(cookies.__session && typeof cookies.__session === 'string');
  const hasAuthToken = !!(cookies.auth_token && typeof cookies.auth_token === 'string');
  // Active workspace (per-tab) mirrored into the `vf_ws` cookie — used to seed the
  // VeeGPT conversation list for the workspace the user is actually viewing.
  const activeWsId = typeof cookies.vf_ws === 'string' && cookies.vf_ws ? cookies.vf_ws : undefined;

  // 1) Verified Firebase session cookie (durable, 14d) → inject data.
  try {
    const session = cookies.__session;
    if (session && typeof session === 'string') {
      const { getFirebaseAdmin } = await import('../firebase-admin');
      const admin = getFirebaseAdmin();
      const decoded = await admin.auth().verifySessionCookie(session, false);
      if (decoded?.uid) {
        const boot = await buildVerifiedBootstrap(decoded.uid, activeWsId);
        boot.reason = boot.user ? 'session-verified' : 'session-verified-no-user';
        return boot;
      }
    }
  } catch (e) {
    if (hasSession) {
      console.warn('[bootstrap] __session verification failed:',
        e instanceof Error ? e.message : 'unknown');
    }
  }

  // 2) Verified auth_token ID token (short-lived, ~1h) → inject data too.
  //    NOTE: after OAuth the auth_token holds a CUSTOM token, which is NOT an ID
  //    token and always fails verifyIdToken — so this path only works once the
  //    client has swapped in an ID token via /update-token. The durable
  //    `__session` (path 1) is the reliable seeding mechanism.
  try {
    const authToken = cookies.auth_token;
    if (authToken && typeof authToken === 'string') {
      const { getFirebaseAdmin } = await import('../firebase-admin');
      const admin = getFirebaseAdmin();
      const decoded = await admin.auth().verifyIdToken(authToken);
      if (decoded?.uid) {
        const boot = await buildVerifiedBootstrap(decoded.uid, activeWsId);
        boot.reason = boot.user ? 'idtoken-verified' : 'idtoken-verified-no-user';
        return boot;
      }
    }
  } catch {
    /* fall through — expected when auth_token is a custom token */
  }

  // 3) Fallback: boolean authed flag only (unverified token / custom token).
  const authed = await resolveAuthedFromRequest(req);
  return {
    authed,
    reason: authed
      ? (hasSession ? 'flag-only-session-unverified'
        : hasAuthToken ? 'flag-only-customtoken' : 'flag-only')
      : 'unauthed',
  };
}

/** Serialize the bootstrap object safely for inlining inside a <script> tag. */
function serializeBootstrap(data: BootstrapData): string {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script data-cfasync="false">window.__VEEFORE_BOOTSTRAP__=${json};</script>`;
}

/**
 * No-flash theme/background script, injected into <head> ONLY for app-shell
 * loads. Runs synchronously before the body paints: applies the user's theme
 * class to <html> and overrides the landing's `#root { background:#000 }`
 * critical CSS with the SHELL's own background (`bg-gray-50` / `dark:bg-gray-900`)
 * up-front — so the dashboard shell never flashes black before the Tailwind
 * bundle loads. Mirrors `getStoredTheme`/`applyTheme` in client/src/lib/theme.ts.
 */
const APP_SHELL_THEME_SCRIPT =
  // data-cfasync="false" keeps Cloudflare Rocket Loader from deferring/rewriting
  // this script — it MUST run synchronously before first paint to set the bg.
  '<script data-cfasync="false">(function(){try{' +
  "var t=localStorage.getItem('theme')||'system';" +
  "if(t==='system'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}" +
  "var d=document.documentElement;d.classList.add(t);" +
  "var dark=(t!=='light');if(dark)d.classList.add('dark');" +
  "var bg=dark?'#111827':'#f9fafb';" +
  "var s=document.createElement('style');s.setAttribute('data-vf-app-bg','');" +
  "s.textContent='html,body,#root,#vf-ssr-shell{background-color:'+bg+' !important}';" +
  "document.head.appendChild(s);" +
  "}catch(e){}})();</script>";

/**
 * Removes the SSR shell OVERLAY once React has painted into #root. The shell is
 * rendered as a fixed overlay (NOT inside #root) so the client's `createRoot`
 * renders into an EMPTY #root — never tearing down server DOM (the cause of the
 * mount flash). Once #root has content (React committed) we wait two frames for
 * it to paint, then remove the overlay to reveal the live app underneath. A
 * safety timeout guarantees the overlay can never get stuck.
 */
const SHELL_REMOVE_SCRIPT =
  // data-cfasync="false" keeps Cloudflare Rocket Loader from deferring/rewriting
  // this script — its timing (defining __vfRemoveShell + dissolving the overlay)
  // is critical and must not be reordered after the app bundle runs.
  '<script data-cfasync="false">(function(){try{' +
  "var root=document.getElementById('root');var shell=document.getElementById('vf-ssr-shell');" +
  "if(!root||!shell)return;var done=false;" +
  // Remove the overlay. The dissolve is gated (fadeWhenReady) until #root has
  // painted real, full-height content that matches the skeleton — so we remove
  // INSTANTLY rather than cross-fading. A 260ms opacity cross-fade of two
  // near-identical layers produced a subtle ghosting/double-image morph that read
  // as a flicker; an instant removal onto matching content is seamless.
  "function fade(){if(done)return;done=true;shell.style.pointerEvents='none';" +
  "if(shell&&shell.parentNode)shell.parentNode.removeChild(shell);}" +
  // The overlay must NOT be removed until #root has actually PAINTED real content
  // that fills the viewport. The app's React "settled" signal fires a few frames
  // before the DOM lays out at full height, so removing on it alone revealed an
  // empty #root (the near-white body bg = a blank flash). Gate on #root's OWN
  // rendered height (this accounts for content nested under display:contents
  // wrappers, unlike measuring children).
  "function rootReady(){try{return root.getBoundingClientRect().height>=(window.innerHeight*0.6);}catch(e){return true;}}" +
  "function fadeWhenReady(tries){if(done)return;" +
  "if(rootReady()||tries<=0){fade();return;}" +
  "requestAnimationFrame(function(){fadeWhenReady(tries-1);});}" +
  // Preferred trigger: the real app signals it has mounted (so we dissolve from
  // the skeleton straight to the live page, not to an interim skeleton).
  "window.__vfRemoveShell=function(){fadeWhenReady(120);};" +
  // VeeGPT is a SEPARATE heavy lazy chunk that mounts LATER than the rest of the
  // app tree (and its ProtectedRoute renders nothing while Firebase auth
  // resolves). The generic "#root got content" fallback below would therefore
  // remove the overlay BEFORE VeeGPT paints — revealing an empty route while
  // auth/chunk are still resolving. So on /veegpt we DON'T auto-dissolve on first
  // content; we wait for VeeGPT's own __vfRemoveShell signal (it calls it once
  // its view has settled), with only the safety timeout as a backstop.
  "var isVeegpt=((location.pathname||'').indexOf('/veegpt')===0);" +
  // Fallback: once React has painted SOMETHING into #root, dissolve a bit later.
  // Generous delay so it never pre-empts a page's own (faster) trigger above —
  // it only matters if a route never signals readiness.
  "if(!isVeegpt){" +
  "function onContent(){if(root.childNodes.length>0){try{obs.disconnect();}catch(e){}setTimeout(fade,1500);}}" +
  "var obs=new MutationObserver(onContent);obs.observe(root,{childList:true});onContent();" +
  "}" +
  // Safety: never let the overlay get stuck.
  "setTimeout(fade,5000);" +
  "}catch(e){var x=document.getElementById('vf-ssr-shell');if(x&&x.parentNode)x.parentNode.removeChild(x);}})();</script>";

// ---------------------------------------------------------------------------
// App-shell SSR (Phase 3)
// ---------------------------------------------------------------------------

type ShellRenderer = (pathname: string, chrome?: unknown) => string | Promise<string>;

/** Cached prod renderer loaded from the Vite SSR build artifact (dist/ssr). */
let prodRenderer: ShellRenderer | null | undefined;

async function getProdShellRenderer(): Promise<ShellRenderer | null> {
  if (prodRenderer !== undefined) return prodRenderer;
  try {
    const artifactPath = path.join(process.cwd(), 'dist', 'ssr', 'shell-ssr.js');
    if (!fs.existsSync(artifactPath)) {
      prodRenderer = null;
      return null;
    }
    const mod = await import(pathToFileURL(artifactPath).href);
    prodRenderer = typeof mod.renderAppShell === 'function' ? mod.renderAppShell : null;
  } catch {
    prodRenderer = null;
  }
  return prodRenderer ?? null;
}

/**
 * Render the app-shell skeleton HTML for a pathname from the prod build
 * artifact. Returns '' on any failure (fail-open → empty #root, client renders
 * normally).
 */
async function renderShellHtml(pathname: string, chrome?: unknown): Promise<string> {
  try {
    const renderer = await getProdShellRenderer();
    if (!renderer) return '';
    return (await renderer(pathname, chrome)) || '';
  } catch {
    return '';
  }
}

/**
 * Build the first-paint header chrome (welcome name + avatar + active workspace
 * pill) from the resolved bootstrap state, so the SSR shell renders a REAL
 * header. The welcome name + avatar are user-level and always correct.
 *
 * Active WORKSPACE selection (no placeholder flash, no fake data):
 *  - The client mirrors its per-tab `currentWorkspaceId` into the `vf_ws` cookie
 *    (on switch, on validation, and at startup hydration), so a non-default
 *    selection is ALWAYS captured. We read+VALIDATE that cookie against the
 *    user's own seeded workspaces and render it.
 *  - If the cookie is absent/invalid we fall back to the user's DEFAULT
 *    workspace. This is correct, not a guess: the only way to be on a
 *    non-default workspace is to have switched, which sets the cookie — so
 *    "no cookie" ⇒ the user is on their default. This guarantees the pill is
 *    never omitted (no loading flash).
 */
function buildShellChrome(state: BootstrapData, req: Request): unknown {
  const userData = (state.user as any)?.data;
  const chrome: any = {};
  if (userData?.displayName) chrome.displayName = userData.displayName;
  if (userData?.email) chrome.email = userData.email;
  if (userData?.plan) chrome.plan = userData.plan;

  const wsEnvelope = state.workspaces as any;
  const list: any[] = Array.isArray(wsEnvelope?.data) ? wsEnvelope.data : [];
  if (list.length > 0) {
    const cookieWsId = (req as any).cookies?.vf_ws;
    const defId = state.dashboard?.workspaceId;
    const ws =
      (typeof cookieWsId === 'string' && cookieWsId
        ? list.find((w) => String(w?._id || w?.id) === cookieWsId)
        : undefined) ||
      list.find((w) => String(w?._id || w?.id) === String(defId)) ||
      list.find((w) => w?.isDefault) ||
      list[0];
    if (ws) {
      chrome.workspace = {
        name: ws.name,
        theme: ws.theme,
        credits: ws.credits,
        isDefault: ws.isDefault,
        aiPersonality: ws.aiPersonality,
      };
    }
  }

  // VeeGPT first-paint layout. The conversation titles come from the seed (so the
  // sidebar renders identical to the live page), but the welcome-vs-chat variant
  // + whether the sidebar shows come from the `vf_vg` cookie the page mirrors
  // (compact `<variant><sidebar>`, e.g. `c1`/`w1`/`w0`). CRITICAL: the cookie is
  // read INDEPENDENTLY of the seed — if the seed is empty/slow, we must STILL
  // honor the cookie, otherwise an active-chat user gets mispredicted as
  // welcome-without-sidebar and sees "welcome first, then the sidebar/chat".
  const chatSeed = state.chat;
  const vg = (req as any).cookies?.vf_vg;
  const hasCookie = typeof vg === 'string' && vg.length >= 1;
  let veegpt: any = undefined;

  if (chatSeed && Array.isArray(chatSeed.conversations)) {
    const conversations = (chatSeed.conversations as any[])
      .map((c) => ({ id: Number(c?.id), title: String(c?.title ?? '') }))
      .filter((c) => Number.isFinite(c.id));
    veegpt = { hasConversations: chatSeed.conversations.length > 0, conversations };
  }

  if (hasCookie) {
    veegpt = veegpt || { hasConversations: vg.length >= 2 && vg[1] === '1' };
    veegpt.variant = vg[0] === 'c' ? 'chat' : 'welcome';
    if (vg.length >= 2) veegpt.showSidebar = vg[1] === '1';
  }

  if (veegpt) chrome.veegpt = veegpt;

  return (chrome.displayName || chrome.email || chrome.workspace || chrome.veegpt) ? chrome : undefined;
}
// logged-out visitors (instant paint + SEO). Cached in-memory since the output
// is identical for all logged-out users on a given route.
// ---------------------------------------------------------------------------

const PUBLIC_SSR_ROUTES = new Set<string>([
  '/', '/landing',
  '/features', '/pricing', '/free-trial', '/changelog', '/about', '/blog',
  '/careers', '/contact', '/security', '/gdpr', '/privacy-policy',
  '/terms-of-service', '/help', '/community', '/status', '/cookies',
]);

/** Whether a route has a server-rendered public page available. */
export function isPublicSSRRoute(pathname: string): boolean {
  return PUBLIC_SSR_ROUTES.has(pathname);
}

/**
 * Whether the request carries ANY auth cookie. A request with auth cookies is a
 * (probably) logged-in user — we must NOT serve them the marketing landing
 * (even if token verification fails or an intermediary cached a logged-out
 * copy), or they'd see the public page flash/flap on the authenticated app.
 */
export function hasAuthCookies(req: Request): boolean {
  const c = (req as any).cookies || {};
  return !!(c.__session || c.auth_token);
}

let prodPublicRenderer: ShellRenderer | null | undefined;

async function getProdPublicRenderer(): Promise<ShellRenderer | null> {
  if (prodPublicRenderer !== undefined) return prodPublicRenderer;
  try {
    const artifactPath = path.join(process.cwd(), 'dist', 'ssr', 'public-ssr.js');
    if (!fs.existsSync(artifactPath)) {
      prodPublicRenderer = null;
      return null;
    }
    const mod = await import(pathToFileURL(artifactPath).href);
    prodPublicRenderer = typeof mod.renderPublic === 'function' ? mod.renderPublic : null;
  } catch {
    prodPublicRenderer = null;
  }
  return prodPublicRenderer ?? null;
}

const publicHtmlCache = new Map<string, string>();

async function renderPublicHtml(pathname: string): Promise<string> {
  try {
    const cached = publicHtmlCache.get(pathname);
    if (cached !== undefined) return cached;
    const renderer = await getProdPublicRenderer();
    if (!renderer) return '';
    const html = (await renderer(pathname)) || '';
    if (html) publicHtmlCache.set(pathname, html);
    return html;
  } catch {
    return '';
  }
}

/**
 * Inject the auth bootstrap flag (always) and, in PRODUCTION, the SSR app-shell
 * skeleton into the HTML document. FAIL-OPEN.
 *
 * SSR shell injection is intentionally production-only: it relies on the
 * `dist/ssr/shell-ssr.js` build artifact and on the prod CSS `<link>` (in dev,
 * CSS is injected by Vite at runtime and the dev server can't SSR-evaluate
 * React's CJS jsx runtime, so we skip it and let the client paint the skeleton).
 *
 * @param opts.ssrShell  when true, inline the SSR app-shell from the build artifact.
 */
export async function injectAuthBootstrap(
  html: string,
  req: Request,
  opts?: { ssrShell?: boolean }
): Promise<string> {
  try {
    const state = await resolveBootstrapState(req);
    state.cookied = hasAuthCookies(req);
    const authed = state.authed;
    let out = html;

    const pathname = getRequestPathname(req);
    const isAuthedShellRoute = shouldRenderShell(pathname, authed);
    const willRenderShell =
      !!opts?.ssrShell && out.includes('<div id="root"></div>') && isAuthedShellRoute;

    // 1) Inject into <head> before </head>:
    //    - the auth bootstrap (flag + optional verified user/workspaces),
    //    - and, for any authenticated app-shell route, a tiny no-flash theme
    //      script. The page's critical CSS forces `#root { background:#000 }`
    //      (the black landing background), so until the Tailwind bundle paints
    //      the shell's `bg-gray-50 dark:bg-gray-900`, #root flashes BLACK. This
    //      script runs synchronously in <head> (before the body paints), applies
    //      the user's theme class, and overrides #root's background with the
    //      shell's background up-front — eliminating the black flash. Injected for
    //      all shell routes (even dev / non-SSR), since it's the background that
    //      matters; the landing keeps its black bg.
    let head = serializeBootstrap(state);
    if (isAuthedShellRoute) head += '\n' + APP_SHELL_THEME_SCRIPT;
    out = out.includes('</head>') ? out.replace('</head>', `${head}\n</head>`) : head + out;

    // 2) SSR into #root (prod only). Authenticated routes get the app-shell
    //    skeleton; logged-out public routes get the real marketing page. Both
    //    are gated to match the client's first paint (no wrong-page flash).
    if (opts?.ssrShell && out.includes('<div id="root"></div>')) {
      if (willRenderShell) {
        const shellHtml = await renderShellHtml(pathname, buildShellChrome(state, req));
        if (shellHtml) {
          // Render the shell as a FIXED OVERLAY sibling, NOT inside #root. This
          // keeps #root EMPTY so the client's `createRoot` mounts into an empty
          // container — it never tears down server-rendered DOM (which caused the
          // shell to flash/blink on every refresh as React recreated the nodes).
          // SHELL_REMOVE_SCRIPT removes the overlay once React has painted #root.
          const overlay =
            `<div id="vf-ssr-shell" aria-hidden="true" style="position:fixed;inset:0;z-index:2147483646;overflow:hidden">${shellHtml}</div>` +
            SHELL_REMOVE_SCRIPT;
          out = out.replace('<div id="root"></div>', `<div id="root"></div>${overlay}`);
        }
      } else if (!authed && !hasAuthCookies(req) && isPublicSSRRoute(pathname)) {
        // Only SSR the marketing landing for a genuinely logged-out request (no
        // auth cookies). A request WITH auth cookies is a logged-in user — never
        // serve them the public landing, even if verification just failed.
        const publicHtml = await renderPublicHtml(pathname);
        if (publicHtml) {
          out = out.replace('<div id="root"></div>', `<div id="root">${publicHtml}</div>`);
        }
      }
    }

    return out;
  } catch {
    return html;
  }
}

/**
 * Whether a request path should receive the bootstrap-injected HTML document
 * (i.e. an SPA navigation, not an API call or a static asset request).
 */
export function isHtmlDocumentRequest(pathname: string): boolean {
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uploads/') ||
    pathname.startsWith('/metrics/') ||
    pathname.startsWith('/.well-known/') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname.startsWith('/@')
  ) {
    return false;
  }
  const lastSegment = pathname.split('/').pop() || '';
  return !lastSegment.includes('.');
}
