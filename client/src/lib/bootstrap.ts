/**
 * Client reader for the server-injected auth bootstrap.
 *
 * The server inlines `window.__VEEFORE_BOOTSTRAP__ = { authed: boolean }` into
 * the HTML document before the bundle runs (see `server/lib/html-bootstrap.ts`).
 * Because it reflects the session at the moment the HTML was served, it is a
 * RELIABLE first-paint auth signal — unlike a stale client-side localStorage
 * guess — and we use it to decide, on the app's root entry, whether to paint the
 * dashboard shell immediately (returning user) or the public landing page
 * (logged-out visitor), with no flash either way.
 */

export interface VeeforeBootstrap {
  authed: boolean;
  /** Auth cookies were present on the request (even if verification failed). */
  cookied?: boolean;
  /** `{ success, data: user }` envelope matching `/api/user`, when present. */
  user?: unknown;
  /** `{ success, data: workspaces }` envelope matching `/api/workspaces`. */
  workspaces?: unknown;
  /**
   * Social-accounts arrays seeded for first-byte render, keyed by workspace id
   * (token blobs stripped). Seeding every workspace means whichever one is active
   * on the client hits the seeded cache.
   */
  dashboard?: {
    workspaceId: string;
    accountsByWorkspace: Record<string, unknown[]>;
    /** Aggregated dashboard analytics per workspace id (mirrors /api/dashboard/analytics). */
    analyticsByWorkspace?: Record<string, unknown>;
    /** Historical analytics (default 'month'/30d) per workspace id. */
    historicalByWorkspace?: Record<string, unknown[]>;
    /** Follower analytics per workspace id. */
    followerByWorkspace?: Record<string, unknown>;
  };
  /** VeeGPT conversation list for the active workspace (mirrors /api/chat/conversations). */
  chat?: { workspaceId: string; conversations: unknown[] };
}

declare global {
  interface Window {
    __VEEFORE_BOOTSTRAP__?: VeeforeBootstrap;
  }
}

export function getBootstrap(): VeeforeBootstrap | null {
  if (typeof window === 'undefined') return null;
  return window.__VEEFORE_BOOTSTRAP__ ?? null;
}

/** True only when the server confirmed an authenticated session for this load. */
export function isBootstrapAuthed(): boolean {
  return getBootstrap()?.authed === true;
}

/**
 * True when the server EXPLICITLY says this load is logged-out (a bootstrap was
 * injected with authed=false AND cookied=false). Used so the optimistic-auth hint
 * acts only as a tiebreaker when the server's answer is absent/uncertain — never
 * to override a definitive logged-out result.
 */
export function isBootstrapExplicitlyLoggedOut(): boolean {
  const boot = getBootstrap();
  return boot != null && boot.authed !== true && boot.cookied !== true;
}

/**
 * True when the request carried auth cookies (even if the server couldn't fully
 * verify them). Used to avoid ever painting the public landing for a logged-in
 * user on `/` while the client Firebase session restores.
 */
export function isBootstrapCookied(): boolean {
  const boot = getBootstrap();
  return boot?.authed === true || boot?.cookied === true;
}

// ---------------------------------------------------------------------------
// Optimistic-auth hint (anti landing-flash).
//
// The server bootstrap is the primary signal, but it can occasionally be absent
// or unverified on a given request (cold edge, verification miss, build-budget
// timeout). Without a fallback, a returning user can briefly see the PUBLIC
// LANDING on `/` before Firebase restores. We persist a tiny, non-sensitive
// "this browser was recently authed" flag and use it as an ADDITIONAL signal so
// the app paints the shell (never the landing) for a returning user. It carries
// NO PII and only affects which loading view shows for a few hundred ms; the
// real auth check still runs and redirects a genuinely logged-out user.
// ---------------------------------------------------------------------------
const AUTH_HINT_KEY = 'veefore_authed_hint';

export function setAuthHint(): void {
  try { localStorage.setItem(AUTH_HINT_KEY, String(Date.now())); } catch { /* ignore */ }
}

export function clearAuthHint(): void {
  try { localStorage.removeItem(AUTH_HINT_KEY); } catch { /* ignore */ }
}

/** True if this browser was authed within the last 30 days (optimistic signal). */
export function hasAuthHint(): boolean {
  try {
    const raw = localStorage.getItem(AUTH_HINT_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < 30 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** The inner user object from the seeded `{ success, data }` envelope, if present. */
export function getBootstrapUserData(): any | null {
  const boot = getBootstrap();
  const u = boot?.user as any;
  return u && typeof u === 'object' && 'data' in u ? u.data : null;
}

// ---------------------------------------------------------------------------
// Shell chrome (first-paint header identity).
//
// The static app-shell renders the REAL header on first byte. The header's
// identity bits (welcome name, avatar initials, the active workspace pill) come
// from the seeded bootstrap so they're correct on the very first paint — no
// placeholder→real swap. The SAME shape is produced server-side (for the SSR
// shell) and client-side (for the loading shell), from the SAME bootstrap data,
// so the two renders are identical. The active workspace is the DEFAULT one
// (the server can't see the per-tab localStorage selection); the real
// WorkspaceSwitcher reconciles to the actual active workspace when it mounts.
// ---------------------------------------------------------------------------
export interface ShellChrome {
  /** Raw `userData.displayName` (the header derives the final label from this/email). */
  displayName?: string;
  email?: string;
  /** Subscription plan label (used by the VeeGPT sidebar user row). */
  plan?: string;
  workspace?: {
    name?: string;
    theme?: string;
    credits?: number;
    isDefault?: boolean;
    aiPersonality?: string;
  };
  /**
   * First-paint VeeGPT data so the conversation sidebar renders REAL (no
   * placeholder→real swap on dissolve): the layout hint plus the actual seeded
   * conversation titles (the user's own data; titles only).
   */
  veegpt?: {
    hasConversations: boolean;
    conversations?: Array<{ id: number; title: string }>;
    /** Server-resolved layout (from the `vf_vg` cookie the page mirrors) so the
     *  SSR overlay predicts the EXACT welcome-vs-chat variant the page renders. */
    variant?: 'welcome' | 'chat';
    showSidebar?: boolean;
  };
}

/**
 * Active-workspace cookie. Mirrors the per-tab `currentWorkspaceId` localStorage
 * value into a (non-httpOnly, non-sensitive) cookie so the SERVER can render the
 * CORRECT workspace pill in the SSR shell — eliminating the brief placeholder
 * flash on reload. Just a workspace id; the server still validates it against the
 * user's own workspaces, so it can't leak another account's data.
 */
export const ACTIVE_WS_COOKIE = 'vf_ws';

export function setActiveWorkspaceCookie(id: string | null | undefined): void {
  try {
    if (!id || id === 'undefined' || id === 'null') return;
    const maxAge = 60 * 60 * 24 * 365; // 1 year
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ACTIVE_WS_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
}

export function clearActiveWorkspaceCookie(): void {
  try { document.cookie = `${ACTIVE_WS_COOKIE}=; path=/; max-age=0; SameSite=Lax`; } catch { /* ignore */ }
}

/**
 * VeeGPT layout cookie. Mirrors the page's resolved welcome-vs-chat variant and
 * whether the conversation sidebar shows, so the SERVER renders the SSR shell
 * overlay with the EXACT same VeeGPT layout the live page will — eliminating a
 * variant-mismatch flicker on the overlay dissolve (the server can't read the
 * page's `localStorage` chat-state). Value is a compact 2-char code: variant
 * (`c`=chat / `w`=welcome) + sidebar (`1`/`0`), e.g. `w1`, `c1`, `w0`.
 */
export const VEEGPT_LAYOUT_COOKIE = 'vf_vg';

export function setVeegptLayoutCookie(variant: 'welcome' | 'chat', showSidebar: boolean): void {
  try {
    const val = `${variant === 'chat' ? 'c' : 'w'}${showSidebar ? '1' : '0'}`;
    const maxAge = 60 * 60 * 24 * 365; // 1 year
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${VEEGPT_LAYOUT_COOKIE}=${val}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
}

/** Active-workspace list from the injected bootstrap (`/api/workspaces` envelope). */
function bootstrapWorkspaceList(): any[] {
  const boot = getBootstrap();
  const wsEnvelope = boot?.workspaces as any;
  return Array.isArray(wsEnvelope?.data)
    ? wsEnvelope.data
    : Array.isArray(wsEnvelope) ? wsEnvelope : [];
}

/**
 * Resolve the ACTIVE workspace id the same way the real WorkspaceSwitcher does
 * (`getValidWorkspaceId`): the per-tab localStorage selection if valid, else the
 * default, else the first. Returns null when there are no seeded workspaces.
 */
export function resolveActiveWorkspaceId(): string | null {
  const boot = getBootstrap();
  if (!boot) return null;
  const list = bootstrapWorkspaceList();
  if (list.length === 0) return null;

  let activeId: string | null = null;
  try { activeId = localStorage.getItem('currentWorkspaceId'); } catch { /* ignore */ }
  if (activeId === 'undefined' || activeId === 'null' || activeId === '') activeId = null;

  const defId = boot.dashboard?.workspaceId;
  const ws =
    (activeId && list.find((w) => String(w?._id || w?.id) === activeId)) ||
    list.find((w) => String(w?._id || w?.id) === String(defId)) ||
    list.find((w) => w?.isDefault) ||
    list[0];
  return ws ? String(ws?._id || ws?.id) : null;
}

/**
 * Write the `vf_ws` cookie from the current bootstrap + localStorage selection.
 * Called once at startup (hydration) so the cookie is present for the NEXT
 * load's SSR shell — the server then renders the correct workspace pill with no
 * placeholder flash. Safe no-op when logged out / no workspaces.
 */
export function syncActiveWorkspaceCookie(): void {
  const id = resolveActiveWorkspaceId();
  if (id) setActiveWorkspaceCookie(id);
}

/** Derive the first-paint header chrome from the injected bootstrap (client). */
export function getBootstrapChrome(): ShellChrome | null {
  const boot = getBootstrap();
  if (!boot) return null;
  const userData = getBootstrapUserData();
  const list = bootstrapWorkspaceList();
  const activeId = resolveActiveWorkspaceId();
  const ws = activeId ? list.find((w) => String(w?._id || w?.id) === activeId) : undefined;

  const chrome: ShellChrome = {};
  if (userData?.displayName) chrome.displayName = userData.displayName;
  if (userData?.email) chrome.email = userData.email;
  if (userData?.plan) chrome.plan = userData.plan;
  if (ws) {
    chrome.workspace = {
      name: ws.name,
      theme: ws.theme,
      credits: ws.credits,
      isDefault: ws.isDefault,
      aiPersonality: ws.aiPersonality,
    };
  }
  const chatSeed = boot.chat;
  if (chatSeed && Array.isArray(chatSeed.conversations)) {
    const conversations = (chatSeed.conversations as any[])
      .map((c) => ({ id: Number(c?.id), title: String(c?.title ?? '') }))
      .filter((c) => Number.isFinite(c.id));
    chrome.veegpt = { hasConversations: chatSeed.conversations.length > 0, conversations };
  }
  return (chrome.displayName || chrome.email || chrome.workspace || chrome.veegpt) ? chrome : null;
}

/**
 * True when the server injected a verified, ONBOARDED user. This is the safe
 * signal to mount the authenticated dashboard immediately (with seeded data),
 * before the client Firebase session has finished restoring.
 */
export function isBootstrapOnboarded(): boolean {
  return getBootstrapUserData()?.isOnboarded === true;
}

/**
 * Seed React Query from the server-injected bootstrap (Phase 4) so the real
 * dashboard renders on the first byte without a `/api/user` round-trip. The
 * injected values are the EXACT `{ success, data }` envelopes the endpoints
 * return, so a seeded cache entry is indistinguishable from a fetched one.
 * No-op when the server didn't inject data (logged-out, dev, or fail-open).
 */
export function hydrateQueryCacheFromBootstrap(queryClient: {
  setQueryData: (key: unknown[], data: unknown, options?: { updatedAt?: number }) => void;
}): void {
  try {
    const boot = getBootstrap();
    if (!boot) return;
    if (boot.user !== undefined && boot.user !== null) {
      queryClient.setQueryData(['/api/user'], boot.user);
    }
    if (boot.workspaces !== undefined && boot.workspaces !== null) {
      queryClient.setQueryData(['/api/workspaces'], boot.workspaces);
    }
    // Seed the social-accounts query for EVERY workspace with the ARRAY directly
    // (the `useSocialAccounts` query stores `response.data`, i.e. the array), so
    // whichever workspace is active on the client renders real data on first byte.
    //
    // The seed comes from the SAME service call the live API uses
    // (`getActiveAccountsByWorkspace`) and we only seed NON-EMPTY arrays, so a
    // seeded entry equals what a fetch would return — safe to treat as fresh and
    // cache across page switches (no forced refetch). Freshness is maintained by
    // the query's invalidations (connect/disconnect, webhooks), its 10-min
    // refetchInterval, and refetchOnReconnect.
    if (boot.dashboard && boot.dashboard.accountsByWorkspace) {
      for (const [wsId, accounts] of Object.entries(boot.dashboard.accountsByWorkspace)) {
        if (wsId && Array.isArray(accounts) && accounts.length > 0) {
          queryClient.setQueryData(['/api/social-accounts', wsId], accounts);
        }
      }
    }
    // Seed dashboard analytics per workspace (Performance Overview metrics). The
    // `usePerformanceData` query stores `response.data`, i.e. the result object,
    // so we seed the object directly — keyed the same as the hook
    // (`['/api/dashboard/analytics', wsId]`).
    if (boot.dashboard && boot.dashboard.analyticsByWorkspace) {
      for (const [wsId, analytics] of Object.entries(boot.dashboard.analyticsByWorkspace)) {
        if (wsId && analytics && typeof analytics === 'object') {
          queryClient.setQueryData(['/api/dashboard/analytics', wsId], analytics);
        }
      }
    }
    // Seed historical analytics for the DEFAULT period ('month') the Performance
    // Overview opens on — the `useHistoricalData` query stores `response.data`
    // (the array) and keys by ['/api/analytics/historical', period, wsId].
    if (boot.dashboard && boot.dashboard.historicalByWorkspace) {
      for (const [wsId, rows] of Object.entries(boot.dashboard.historicalByWorkspace)) {
        if (wsId && Array.isArray(rows)) {
          queryClient.setQueryData(['/api/analytics/historical', 'month', wsId], rows);
        }
      }
    }
    // Seed follower analytics — the `useFollowerAnalytics` query stores the raw
    // `response` and keys by ['/api/workspaces/metrics/followers', wsId].
    if (boot.dashboard && boot.dashboard.followerByWorkspace) {
      for (const [wsId, follower] of Object.entries(boot.dashboard.followerByWorkspace)) {
        if (wsId && follower && typeof follower === 'object') {
          queryClient.setQueryData(['/api/workspaces/metrics/followers', wsId], follower);
        }
      }
    }
    // Seed the VeeGPT conversation list so its sidebar renders instantly. The
    // `useQuery` in pages/VeeGPT.tsx keys it workspace-agnostically as
    // ['/api/chat/conversations'] and stores the array directly. Also mirror the
    // page's `veegpt-has-conversations` hint so the VeeGPT Page_Skeleton predicts
    // the sidebar correctly on the next navigation.
    if (boot.chat && Array.isArray(boot.chat.conversations)) {
      queryClient.setQueryData(['/api/chat/conversations'], boot.chat.conversations);
      try {
        localStorage.setItem(
          'veegpt-has-conversations',
          boot.chat.conversations.length > 0 ? '1' : '0',
        );
      } catch { /* ignore */ }
    }
  } catch {
    /* fail-open: fall back to normal fetching */
  }
}
