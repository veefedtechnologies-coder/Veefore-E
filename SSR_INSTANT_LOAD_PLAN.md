# SSR / Instant-Load Plan (Authenticated App)

> **Status: IMPLEMENTED (all phases).**
> Phase 2 (auth flag), Phase 3 (SSR app-shell into `#root`), and now Phase 1
> (Firebase session cookie) + Phase 4 (real user/workspace DATA on first byte)
> are all implemented. Needs a live login test pass before fully relied upon.

## Implemented

### Public-page SSR (marketing / landing) — ALL marketing routes
All public marketing/content pages are server-rendered to real HTML and inlined
into `#root` for logged-out visitors — instant first paint + SEO. The client
mounts with `createRoot` (replace), so no hydration coupling.
- Routes covered: `/`, `/landing`, `/features`, `/pricing`, `/free-trial`,
  `/changelog`, `/about`, `/blog`, `/careers`, `/contact`, `/security`, `/gdpr`,
  `/privacy-policy`, `/terms-of-service`, `/help`, `/community`, `/status`,
  `/cookies`. (Auth flows — signin/signup/waitlist/reset/admin — are excluded:
  no SEO value, interactive, risky to SSR.)
- `client/src/ssr/public-ssr.tsx` — `renderPublic(pathname)` renders the page
  (landing bare; marketing pages inside `PublicPageLayout`) within
  `<Router ssrPath><P6Provider><WaitlistProvider>`. Fail-open.
- `vite.ssr.config.ts` — builds `shell-ssr` + `public-ssr` to `dist/ssr/`. NO
  react aliases (one consistent React for SSR; client replaces via createRoot so
  versions need not match) — fixes the dual-React invalid-hook error.
- `server/lib/html-bootstrap.ts` — `renderPublicHtml` (in-memory cached per
  route) injected into `#root` for `!authed && isPublicSSRRoute`.
- SSR-hardened landing source: guarded the module-level `gsap.registerPlugin`
  calls (`useLenis`, `useScrollPath`, `FeaturesSection`) behind
  `typeof window !== 'undefined'`.
- Validated: all 18 routes render real HTML in Node (0 failures); full client
  build, SSR build, and server build all pass.


- `POST /api/auth/session-login` ({ idToken }) → `verifyIdToken` →
  `createSessionCookie` → httpOnly `__session` (14d). `POST /api/auth/session-logout`
  clears it. `server/controllers/AuthController.ts` + `server/routes/v1/auth.routes.ts`.
- Client `client/src/lib/session.ts` (`ensureSessionCookie` / `clearSessionCookie`),
  wired into `useFirebaseAuth`: created (throttled) when a Firebase user is
  present, cleared on logout. Self-healing — existing sessions gain the cookie on
  next load. ADDITIVE: the existing `auth_token` flow is untouched.

### Phase 4 — real data on first byte
- `server/lib/html-bootstrap.ts` `resolveBootstrapState`: when a VERIFIED
  `__session` exists, fetch user + workspaces via the SAME services the API uses
  and inline them in the EXACT `{ success, data }` envelopes that `/api/user` and
  `/api/workspaces` return:
  `window.__VEEFORE_BOOTSTRAP__ = { authed, user, workspaces }`. PII is injected
  ONLY on cryptographic verification; the unverified `auth_token` path yields the
  boolean flag only.
- Client seeds React Query from the bootstrap (`hydrateQueryCacheFromBootstrap`
  in `client/src/lib/bootstrap.ts`, called from `client/src/lib/queryClient.ts`),
  so a seeded cache entry is indistinguishable from a fetched one → the dashboard
  renders with real data on the first byte, no `/api/user` round-trip.

### Phase 4c — seed default-workspace social accounts (dashboard widgets)
Seeding user + workspaces let the shell mount instantly, but the dashboard
widgets (best-time, performance-score, social-accounts, analytics) still showed
long skeletons while `/api/social-accounts` fetched. Fixed by seeding the
default workspace's accounts into the bootstrap:
- `server/lib/html-bootstrap.ts` `buildVerifiedBootstrap`: after fetching
  workspaces, pick the default workspace (`isDefault === true` else first), call
  `storage.getSocialAccountsByWorkspace(wsId)`, strip token blobs via
  `sanitizeAccount` (`encryptedAccessToken`/`encryptedRefreshToken`/`accessToken`/
  `refreshToken` removed — never inline secrets into HTML), and inline
  `window.__VEEFORE_BOOTSTRAP__.dashboard = { workspaceId, accounts }`. Fail-open.
- `client/src/lib/bootstrap.ts` `hydrateQueryCacheFromBootstrap`: seeds
  `queryClient.setQueryData(['/api/social-accounts', workspaceId], accounts)` with
  the ARRAY directly (the `useSocialAccounts` query stores `response.data`), so
  the widgets render real data on the first byte instead of skeletons.

### Phase 4d — seed ALL workspaces + stale-while-revalidate (cross-tab fix)
Two problems surfaced after 4c:
1. Seeding only the DEFAULT workspace meant the active workspace (from
   `currentWorkspaceId` in localStorage) often missed the seed → still skeletoned.
   Fix: `buildVerifiedBootstrap` now seeds EVERY workspace's accounts, keyed by id
   (`dashboard.accountsByWorkspace: { [wsId]: accounts[] }`), so whichever
   workspace is active hits the seed.
2. CROSS-TAB BUG: some tabs showed "0 accounts connected" for the same
   workspace. Cause: `useSocialAccounts` had `refetchOnMount: false` + 5-min
   staleTime, so a seeded entry was treated as authoritative-and-fresh and NEVER
   reconciled. A per-request `verifySessionCookie` miss (or empty/partial seed)
   would then STICK — the same "stale empty array blocks fresh data" class of bug
   that got localStorage persistence removed earlier. Fix (stale-while-revalidate):
   - `bootstrap.ts`: seed ONLY non-empty arrays, and mark the seed already-stale
     (`setQueryData(key, data, { updatedAt: now - 10min })`) so it can never be a
     sticky false "no accounts" state.
   - `client/src/hooks/useSocialAccounts.ts`: `refetchOnMount: false` → `true`
     (respects staleTime, so fresh client-fetched data is NOT cold-refetched on
     navigation — preserves the data-speed work — but a stale SEED reconciles with
     the server on mount). Instant paint from the seed + guaranteed correctness.

### Phase 4e — keep the bootstrap OFF the critical path (fast TTFB)
Seeding did blocking DB work (verify + user + workspaces + every workspace's
accounts) before the first byte, raising TTFB. Made it fast in
`server/lib/html-bootstrap.ts` `buildVerifiedBootstrap`:
- **Per-user Redis cache** (`veefore:bootstrap:<uid>`, 30s TTL): repeat loads,
  reloads, and extra tabs skip the DB entirely. Safe to be briefly stale because
  the client reconciles on mount and mutations invalidate their queries.
- **Hard time budget** (`BOOTSTRAP_BUILD_BUDGET_MS = 250ms`) via `withTimeout`:
  if the DB build is slow, the request returns a boolean-only bootstrap
  (`reason: 'verified-build-timeout'`) and the client fetches normally — the
  first byte is NEVER delayed by a slow query.
- **Redis read budget** (40ms) so a slow cache also can't block.
- Account fetches across workspaces run in parallel (`Promise.all`), so latency ≈
  one query, not N.
- Timing logs (`[bootstrap] cache hit/built … in Nms`) so real numbers are visible
  in production. The non-sensitive `reason` is also on `window.__VEEFORE_BOOTSTRAP__`.

Note: 30s cache TTL means a just-completed onboarding or a just-connected account
can be briefly absent from the seed on an immediate reload; the client reconciles
within that same load (and onboarding/account flows invalidate client-side), so
it self-corrects. Cache entries expire on their own; logout clears the cookie so
a stale entry is never served.

### Phase 5 — fast refresh: immutable assets + service worker
Two changes so a browser REFRESH is fast and stops re-downloading the bundle:
- **Immutable asset caching** (`server/vite.ts` `serveStatic`): Vite emits
  content-hashed asset names, so `express.static` now serves them with
  `Cache-Control: max-age=1y, immutable`. `index.html` is forced `no-store` (it
  carries the per-user bootstrap) and `sw.js` is `no-cache` (so SW updates are
  detected). This is the #1 fix for "loads every time on refresh".
- **Service worker** (`client/public/sw.js` → served at `/sw.js`, registered in
  `client/src/main.tsx` PROD-only after `load`): conservative, authed-SPA-safe
  runtime asset cache. HARD RULES: never caches HTML/navigations (bootstrap must
  be fresh per user), never caches `/api`, `/uploads`, `/metrics`, cross-origin,
  or non-GET. Cache-first for immutable `/assets/*`; stale-while-revalidate for
  unhashed static files (favicon/logos). Versioned cache name + `skipWaiting` +
  `clients.claim` + delete-other-caches on activate, so a new deploy never strands
  a user on stale assets. DEV continues to unregister SWs (existing block in
  `main.tsx`) so code changes are never masked by a cached SW.

### Phase 4b — render the dashboard before the client Firebase restore
Seeding alone wasn't enough: the app gated the whole dashboard on the CLIENT
Firebase `user`, so the shell still showed during the (sometimes slow, e.g.
incognito) Firebase session restore. Fixed by letting the dashboard mount on the
server-verified, onboarded session:
- `client/src/App.tsx` — `mountAppEarly`: when `SERVER_AUTHED && SERVER_ONBOARDED`
  (from the injected, verified user), mount `AuthenticatedApp` during the Firebase
  `loading` window instead of the shell (root/authenticated routes only).
- `client/src/AuthenticatedApp.tsx` — home gate relaxed from `user && userData`
  to `userData` (seeded), so the real frame renders immediately.
- `server/middleware/require-auth.ts` — accepts the verified `__session` cookie
  when there's no Bearer token yet, so the dashboard's first data fetches succeed
  before the Firebase client token is ready. ADDITIVE (Bearer path untouched).
- `client/src/lib/queryClient.ts` — `apiRequest` proceeds with cookie auth (no
  Bearer) when bootstrap injected verified user data but Firebase isn't ready.

### Phase 2 — server-injected auth bootstrap (boolean flag)
The server resolves the session from the existing httpOnly `auth_token` cookie on
each SPA HTML request and inlines a NON-SENSITIVE flag before the bundle runs:

```html
<script>window.__VEEFORE_BOOTSTRAP__={"authed":true}</script>
```

### Phase 3 — server-rendered app-shell into #root
When the client's first paint would be the app shell (authed root, or any
protected route — mirrored by `shouldRenderShell`), the server renders the
route-aware `AppShellSkeleton` to static HTML and inlines it INSIDE
`<div id="root">…</div>`, so real shell pixels arrive in the first byte. The
client mounts with `createRoot` (NOT hydrate) and re-renders the same skeleton,
so the static markup is replaced seamlessly — no hydration coupling, no layout
shift, no wrong-page flash (injection is gated to match the client decision).

Files:
- `client/src/ssr/shell-ssr.tsx` — SSR entry: `renderAppShell(pathname)` →
  `renderToStaticMarkup(<AppShellSkeleton/>)`. Fail-open (returns '' on error).
- `vite.ssr.config.ts` — Vite SSR build (Node built-ins external) →
  `dist/ssr/shell-ssr.js`. Wired into `client:build` via `client:build:ssr`.
- `server/lib/html-bootstrap.ts` — `resolveAuthedFromRequest`,
  `shouldRenderShell` (mirrors App.tsx `publicRoutes`), `injectAuthBootstrap`
  (flag + shell), prod artifact loader + dev `ssrLoadModule` path. FAIL-OPEN.
- `server/vite.ts` — dev (`setupVite`, via `vite.ssrLoadModule`) + prod
  (`serveStatic`, via the build artifact); `Cache-Control: no-store`.
- `server/index.ts` — prod fallback HTML handler.
- `client/src/lib/bootstrap.ts` + `client/src/App.tsx` — `SERVER_AUTHED` drives
  the root-entry shell-vs-landing decision.

Validated: SSR build compiles (78 modules), the artifact renders correct
route-aware markup in Node (`/`, `/analytics`, `/veegpt`, `/settings`,
`/security-dashboard`), and the `#root` injection transform works.
**Still needs a live in-browser test** (logged-in reload, logged-out, auth pages,
post-OAuth) to confirm the dev `ssrLoadModule` path and the createRoot handoff.

### All phases implemented
Phases 1–4 are in place (see sections above). The phased plan below is retained
for reference / future hardening (e.g. session-cookie revocation checks, SSR of
real data into the DOM rather than only seeding the client cache).

## Goal

For a logged-in user, the authenticated UI (or at least the real app shell)
should be present in the **HTML the server returns** — so there is no blank
screen, no Firebase token-refresh wait, and no `/api/user` round trip before
the first meaningful paint. This is the "instant" feel of SSR SaaS
(Linear / Notion / Stripe).

## Current state (why it isn't instant today)

- The app is a **client-rendered SPA** (Vite). The server returns a static,
  essentially empty `index.html` (`res.sendFile(index.html)` in
  `server/index.ts` / `server/vite.ts`) for every route.
- First paint therefore requires, in order: download JS → execute → init
  Firebase → `onAuthStateChanged` resolves (often a token-refresh round trip) →
  `GET /api/user` → render.
- Auth is **Firebase ID tokens** sent as `Authorization: Bearer <idToken>`,
  verified server-side with `admin.auth().verifyIdToken(...)`.
- Mitigation already shipped: `client/src/components/skeletons/AppShellSkeleton.tsx`
  is eagerly imported by `App.tsx` and painted instantly during all
  pre-dashboard loading states (auth resolving, onboarding resolving, lazy
  `AuthenticatedApp` chunk downloading). This removed the brand spinner on a
  black screen but still shows a skeleton, not real data.

## Key finding: a session cookie already exists

We do **not** need a Next.js/Remix migration. Infrastructure already present:

- An httpOnly `auth_token` cookie is set on sign-in:
  - `server/middleware/sessionManager.ts`
  - `server/controllers/AuthController.ts` (signin)
  - `server/routes/auth.ts` (OAuth redirect flow)
- `cookie-parser` is wired up.
- Session stores exist: `server/shared/auth/stores/MongoSessionStore.ts`,
  `RedisSessionStore.ts`.
- Endpoints: `GET /api/auth/session`, `POST /api/auth/signin`.

**The one gap:** `auth_token` currently sometimes holds a Firebase *custom*
token, which **cannot** be verified server-side the way an ID/session cookie
can. We must promote it to a proper Firebase **session cookie**.

## Decision: do NOT migrate to Next.js/Remix

A literal framework migration of this codebase (wouter routing, hundreds of
Express API routes, React Query throughout, browser-only code, lazy chunks,
custom build + `skeleton-guard` pipeline) is a multi-week, several-hundred-file
rewrite with high risk of an extended broken state. Not worth it just to remove
a boot delay. We achieve the same user-facing outcome with **SSR-on-Express**.

## Plan: SSR-on-Express (no framework migration)

### Phase 1 — Verifiable session cookie (auth change — HIGH RISK)
1. On sign-in, exchange the Firebase ID token for a long-lived session cookie via
   `admin.auth().createSessionCookie(idToken, { expiresIn })` and set it httpOnly
   + Secure + SameSite.
2. Add a server helper to verify it: `admin.auth().verifySessionCookie(cookie, true)`.
3. Keep existing Bearer-token API auth working in parallel; the session cookie is
   additive (used for the HTML route + bootstrap). Plan revocation/refresh and
   logout (clear cookie + revoke).

### Phase 2 — Inject bootstrap state into the HTML
4. In the catch-all HTML route (`server/index.ts` production static handler and
   the dev `setupVite` path), read + verify the session cookie. If valid:
   - fetch user + workspaces (same data as `GET /api/user` + `/api/workspaces`),
   - inline into the HTML before `</head>` / before the bundle script:
     `window.__BOOTSTRAP__ = { authed: true, user, workspaces }`.
   - **Security:** JSON must be safely serialized (escape `<`, `/`, U+2028/2029)
     to prevent HTML/script injection. Never inline secrets/tokens — only
     display-safe user + workspace data.
   - Set `Cache-Control: no-store` on authenticated HTML (already done for
     index.html) so a logged-in user's data is never cached for another user.

### Phase 3 (optional) — Server-render the shell into #root
5. `renderToString(<AppShellSkeleton />)` (it is pure/presentational) and inject
   into `<div id="root">…</div>` so the first byte already has real shell pixels.
   Must match client markup exactly to avoid hydration mismatch.

### Phase 4 — Hydrate on the client
6. On boot, if `window.__BOOTSTRAP__?.authed`, seed React Query
   (`queryClient.setQueryData(['/api/user'], user)`,
   `['/api/workspaces'], workspaces`) and prime the auth "likely authed" path so
   `App.tsx` renders the dashboard immediately instead of `AppShellSkeleton`.
7. Firebase client still resolves in the background to keep tokens fresh; treat
   bootstrap as the optimistic source of truth for first paint, reconcile after.

## Risks / things to verify before starting

- **Hosting model:** confirm production is the long-running Node server in
  `server/index.ts` (NOT serverless/edge). Session-cookie verification calls
  Firebase Admin on each HTML request — fine on a persistent server, a
  consideration on edge.
- **Auth correctness:** session-cookie creation/verification/revocation, logout,
  and the existing Bearer flow must all stay consistent. This is the
  highest-risk part — needs tests.
- **Hydration mismatch** (only if Phase 3 is done): server and client shell DOM
  must be identical.
- **Cache safety:** authenticated HTML with inlined user data must be `no-store`
  and never served to a different user (CDN/proxy config too).
- **XSS:** strict serialization of any inlined JSON.
- Keep `AppShellSkeleton` as the fallback for cold starts / expired sessions /
  logged-out users.

## Recommended order

Phases 1, 2, 4 first (inject bootstrap state + hydrate) — lower risk, delivers
~90% of the perceived speedup (real data, no spinner, no client round trip).
Add Phase 3 (shell SSR) only if we still want real pixels in the very first byte.

## Architecture recommendation: SPA vs SSR (future direction)

**TL;DR — Keep the product (authenticated app) as an SPA; only consider SSR/SSG
for the public marketing pages. It's not SPA *vs* SSR — it's SPA *for the
product*, SSR/SSG *for marketing*. Do NOT migrate the dashboard.**

### Authenticated dashboard (home, VeeGPT, analytics, automation, listening…) → stay SPA
- Lives entirely behind login, so SEO — the #1 reason to adopt SSR — does not
  apply. Crawlers never see it.
- Highly interactive/stateful: real-time updates, websockets, React Query
  caches, long-lived client state. SPA is the natural fit; SSR adds friction
  (serialization, hydration, client/server boundaries) for these patterns.
- The only SSR upside here is faster first paint — and ~90% of that is
  achievable WITHOUT a framework migration via the Phase 1/2/4 plan above
  (session cookie + bootstrap injection). Much better cost/benefit than a rewrite.
- A full Next.js/Remix migration would mean porting hundreds of Express routes,
  wouter routing, the build + `skeleton-guard` pipeline, and browser-only code —
  weeks of work and a long risky window, for a screen users see once per session.

### Public marketing site (landing, pricing, features, blog) → SSR/SSG is worth it
- These are the acquisition front door. SEO, OpenGraph/social link previews, and
  fast first load directly affect signups and search ranking.
- Today they ship inside the same SPA bundle — not ideal for crawlers or
  first-load speed.
- High-value future move (separate project): split the marketing site out as its
  own SSG/SSR site (e.g. Next.js or Astro) on the marketing domain, while the app
  stays an SPA on `app.veefore.com`. This is a common, proven SaaS split.

### Recommended trajectory
1. **Now:** static app-shell skeleton (already shipped). Good enough.
2. **Next (if boot speed matters):** implement Phase 1/2/4 of this doc
   (cookie + bootstrap injection) → "instant" feel, no rewrite.
3. **Later (growth-driven, separate project):** move marketing pages to SSG/SSR
   for SEO. The only place a real SSR framework earns its keep.

### Caveat
This assumes organic search and link sharing matter to acquisition. If growth is
purely paid/invite-driven (note the existing waitlist flow), even the
marketing-page SSR case weakens and staying all-SPA is fully defensible.

## Touch points (for when we resume)

- `server/index.ts` — HTML catch-all (prod static + dev vite paths)
- `server/vite.ts` — `setupVite` / `serveStatic`
- `server/controllers/AuthController.ts`, `server/middleware/sessionManager.ts`,
  `server/routes/auth.ts` — session cookie creation/verification
- `client/index.html` — bootstrap script placeholder / `#root`
- `client/src/App.tsx` — read `__BOOTSTRAP__`, seed React Query, auth priming
- `client/src/lib/queryClient.ts` — hydration seeding
- `client/src/components/skeletons/AppShellSkeleton.tsx` — reused for SSR shell +
  cold-start fallback
