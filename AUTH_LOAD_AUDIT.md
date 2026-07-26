# Auth / Bootstrap / Caching — Deep Audit & Remediation Plan

Scope of this review: OAuth & session handling, cookie lifecycle, React Query
caching & data hydration, SSR bootstrap / first paint, login, logout, multi-tab,
and the data-seeding path. This is a findings + planning document — nothing here
is implemented yet. Each item lists evidence (file), severity, and a proposed
fix so we can plan before touching code.

Legend: **P0** = security / correctness must-fix · **P1** = user-visible bug ·
**P2** = robustness / cleanup · **P3** = nice-to-have.

---

## 1. Already fixed in the recent work (context, do NOT redo)
These are resolved and only listed so we don't re-investigate them:
- Boot spinner → route-aware skeleton; SSR shell + public-page SSR.
- `__session` session cookie + bootstrap seeding (user / workspaces / accounts).
- Landing-flash on `/` for authed users (cookie + optimistic-auth hint).
- `/api/user` infinite invalidation loop (onboarding refresh now one-shot).
- Rate limiter: real client IP (`CF-Connecting-IP`), 300/min, auth-maintenance
  endpoints exempted from global + OAuth limiters.
- Per-mount social-accounts cache wipe removed; dashboard queries cache on nav.
- Realtime webhook listener mounted once (not per route).
- `/plan` crash (`forEach` on an envelope) fixed.
- Service worker removed + self-unregister (it was serving stale bundles).
- Logout now clears the correctly-named `__session` (+ `auth_token`).
- Cross-tab logout broadcast + re-mint guard.
- Data backfill: `isOnboarded=true` for all workspace owners.

---

## 2. Open findings

> Methodology note: this section was expanded after a full grep sweep of every
> `localStorage` / `sessionStorage` / cookie / token touchpoint in `client/src`,
> cross-referenced against what each logout path actually clears.

### 2A. Client storage & logout hygiene (cross-account data leakage) ✅ FIXED (Phase B)

**Status:** Fixed. Added `client/src/lib/session-cleanup.ts` →
`clearClientSessionState()` which wipes ALL of localStorage (except a small
device-level allowlist: `theme`, `veefore_cookie_consent`,
`veefore_cookie_preferences`, `signin_email_v1`, `REACT_QUERY_CACHE_VERSION`),
clears ALL of sessionStorage, and clears the React Query cache. It is now called
from every logout path: `lib/auth.ts logout()`, the cross-tab logout listener in
`useFirebaseAuth`, and the "use a different account" flow in `SignUpIntegrated`.
This closes the cross-account leakage of `veegpt-*`, `veefore:*`, `app-cache:*`,
workspace id, early-access flags, admin token, social-listening convs, etc.
**Files:** `client/src/lib/session-cleanup.ts`, `client/src/lib/auth.ts`,
`client/src/hooks/useFirebaseAuth.ts`, `client/src/pages/SignUpIntegrated.tsx`

Original analysis (for reference):

**Root problem:** there is **no centralized "clear client state on logout"**
function. `client/src/lib/auth.ts logout()` clears only: `user`,
`veefore_authed_hint`, `isOnboarded`, `currentWorkspaceId` (+ sets
`veefore_logout`). The "use a different account" path in `SignUpIntegrated.tsx`
clears a *different* subset. Everything else below **survives logout**, so when a
second account signs in on the same browser it can see the previous user's
state. **Severity: P0/P1 (privacy / correctness).**

Inventory of keys written but NOT cleared on logout (file → key → risk):

| Key | Where set | Survives logout? | Risk |
|---|---|---|---|
| `veegpt-state` (`CACHE_KEY`) | `pages/VeeGPT.tsx` | **Yes** | **P1 leak** — next account sees prior user's VeeGPT conversation id + "first message sent" state |
| `veegpt-has-conversations` | `pages/VeeGPT.tsx` | **Yes** | **P1 leak** — prior user's "has conversations" flag drives VeeGPT first-paint skeleton for the new user |
| `veefore:insight:*` (sessionStorage) | `components/dashboard/performance-score.tsx` | **Yes (same tab)** | P2 leak — cached AI insight banners; keyed by workspace so cross-account only if ids reused |
| social-listening convs (`convStorageKey(wsId)`) | `pages/SocialListeningPage.tsx` | **Yes** | P2 leak — cached conversations per workspace |
| `veefore_early_access_email` / `_status` | `hooks/useEarlyAccessCheck.ts`, `WaitlistPage.tsx` | **Yes** | P2 — gates signup/early-access UI with stale identity |
| `adminToken` / `adminUser` | `pages/AdminLogin.tsx` | **Yes** | **P1/P0** — admin bearer token persists; normal user logout does NOT clear the admin session on a shared browser |
| `app-cache:*` (`CACHE_PREFIX`) | `lib/cache.ts` | **Yes** | P2 — generic cached payloads (incl. automation state) persist |
| `signup_form_data_v1` / `signup_state_v1` | `SignUpIntegrated.tsx` | partial | P3 — signup drafts (cleared by signup flow, not logout) |
| `signin_email_v1` | `pages/SignIn.tsx` | **Yes** | P3 — email prefill (often desirable; low risk) |
| `veefore_logout` | `lib/auth.ts` | lingers (removed on next login) | P3 — cosmetic; never deleted in the tab that logged out |
| `theme`, `cookie_consent*` | theme/cookie banner | Yes | OK — intended to persist |

**Proposed fix:** add one `clearClientSessionState()` helper (e.g. in
`lib/auth.ts`) that removes ALL per-user keys, and call it from EVERY logout path
(`logout()`, the cross-tab logout listener, and the "use a different account"
flow). Prefer an allowlist of keys to keep (`theme`, `cookie_consent*`,
`signin_email_v1`) and clear everything else with our prefixes (`veegpt-*`,
`veefore:*`, `app-cache:*`, `currentWorkspaceId`, `isOnboarded`,
`veefore_authed_hint`, admin keys, social-listening convs). Also clear
`veefore_logout` on the next successful auth (already done in `useFirebaseAuth`).

### 2B. Realtime sockets never authenticate → realtime updates dead + reconnect load ✅ ADDRESSED (Phase C)
**Status:** The dead reconnect load is removed — both socket clients
(`instagram-webhook-listener.tsx`, `useTierStatusListener.ts`) now skip connecting
unless `VITE_ENABLE_REALTIME === 'true'` (default off), matching the "no
websockets" preference and the fact that the sockets never authenticated.
Updates continue via polling + query invalidation. Re-enabling realtime later
still requires fixing socket auth (verified token + authorized join + the
connect-time `workspaceId` check + verify-not-decode in `realtime.ts`).
**Files:** `client/src/components/dashboard/instagram-webhook-listener.tsx`,
`client/src/hooks/useTierStatusListener.ts`

Original analysis (for reference):

**Client:** `components/dashboard/instagram-webhook-listener.tsx`,
`hooks/useTierStatusListener.ts` — both connect with
`auth: { token: localStorage.getItem('firebase-token') || 'anonymous' }`.
**Server:** `server/services/realtime.ts` `io.use(...)` auth middleware requires a
token, splits it into 3 JWT parts, and rejects anything else.
**Confirmed chain:**
1. `firebase-token` is **never written** anywhere in the client (grep: reads
   only, no `setItem`). So the client always sends the literal string
   `'anonymous'`.
2. Server splits `'anonymous'` on `.` → 1 part ≠ 3 → `throw 'Invalid token
   format'` → **handshake rejected** for every client.
3. Client has `reconnection: true, reconnectionAttempts: 5` → it retries the
   failing `/ws/metrics` handshake repeatedly (contributes to the request load
   seen earlier).
**Impact:** **P1** — all realtime metrics/webhook/tier updates are effectively
non-functional (they silently fall back to the 10-min poll + manual refresh),
and failed reconnects add network noise. This also makes the webhook listener's
`refetchQueries` handlers dead code in practice.
**Secondary (P0-class):** even the server auth middleware uses
`safeParseJWTPayload` (decode WITHOUT signature verification) to extract the uid —
same unverified-JWT trust as P0-1. A forged 3-part token with a known uid would
pass socket auth. (Moot today because the client never sends one, but it should
be fixed alongside P0-1.)
**Also:** `handleConnection` disconnects if `socket.workspaceId` is unset, but the
auth middleware only sets `socket.userId` (workspace is joined later via the
`join-workspace` event) — so even a correctly-authenticated socket may be
disconnected at connect. Needs verification.
**Proposed fix:** Decide whether realtime is a product requirement.
- If yes: send a real verified ID token (`await auth.currentUser.getIdToken()`),
  verify it with `verifyIdToken` server-side (not decode-only), authorize the
  `join-workspace` against the user's workspaces, and fix the connect-time
  `workspaceId` check. Refresh the token on reconnect.
- If no (per the "no websockets" preference): remove the dead socket clients and
  rely on the existing HTTP poll/long-poll, eliminating the reconnect load and
  the misleading `auth.token`.


### P0-1 — Unverified-JWT fallback in `requireAuth` (potential auth bypass) ✅ FIXED (Phase A)
**Status:** Fixed. `server/middleware/require-auth.ts` now authenticates ONLY from
a verified ID token (`verifyIdToken`) or the verified `__session` cookie; the
unverified payload-decode fallback is removed, and it fails CLOSED (503) if the
Admin SDK is unavailable. Identity claims (email/name/picture) are taken from the
verified token only.
**File:** `server/middleware/require-auth.ts`
**What:** On the Bearer path, if `admin.auth().verifyIdToken()` throws, the code
**catches the error, logs "Admin verification skipped", and falls back to
decoding the JWT payload without verifying the signature** (`safeParseJWTPayload`)
and trusts `payload.user_id || payload.sub` as the authenticated uid. It then
loads — or even **creates** — that user and calls `next()`.
**Risk:** A request with a structurally-valid but unsigned/forged JWT (correct 3
parts, attacker-chosen `user_id`) would be accepted whenever admin verification
fails or is unavailable. The `__session` path verifies correctly; this is the
Bearer path only.
**Why it exists:** intended as a resilience fallback when the Admin SDK isn't
initialized. But it silently trusts unverified input.
**Proposed fix:** Require successful `verifyIdToken` (or `verifySessionCookie`)
for authentication. Only allow the decode-only path for NON-security telemetry,
never to set `req.user`. If admin verification fails, return 401. Keep a single,
well-logged init-failure mode rather than a silent trust fallback.

### P0-2 — `/api/auth/session` mints a custom token from an unverified `auth_token` ✅ FIXED (Phase A)
**Status:** Fixed. `getSession` now resolves the uid only via the new
`resolveVerifiedUid()` helper (`server/lib/verify-auth-token.ts`): verified
`__session` → verified ID token → **signature-verified custom token** (RS256
checked against the service-account public key derived from its private key, with
audience/issuer/subject + expiry enforced by `jsonwebtoken`). No more
decode-and-trust. OAuth restore still works because fresh custom tokens verify;
expired/forged tokens now correctly 401.
**Files:** `server/controllers/AuthController.ts`, `server/lib/verify-auth-token.ts`
**What:** `getSession` resolves the uid by first trying `verifyIdToken`, then
**falling back to base64-decoding the token payload** and trusting `uid`/`user_id`
/`sub`, then mints a fresh Firebase **custom token** for that uid and returns it.
**Risk:** Same class as P0-1 — a forged `auth_token` cookie value with an
attacker-chosen uid could yield a custom token for that uid (→ full sign-in).
The cookie is httpOnly so it's not trivially settable from JS, but it is
attacker-controllable in a stolen-cookie / fixation scenario and the decode path
removes the signature guarantee.
**Proposed fix:** Resolve uid only from a verified source: `verifySessionCookie`
on `__session`, or `verifyIdToken` on an ID token. If only an unverifiable custom
token is present, return 401 and force a clean re-auth rather than minting.

### P1-3 — `__session` expiry → dead-end 401 with no recovery (cookie-only sessions) ✅ FIXED (Phase C)
**Status:** Fixed. In `apiRequest`'s 401 handler, before forcing
`/signin?expired=true`, we now wait up to 3s for `onAuthStateChanged` to yield a
restored Firebase user, then retry the original request with a fresh Bearer
token. Only a genuinely sessionless client is redirected.
**File:** `client/src/lib/queryClient.ts`
**What:** When the server injected verified user data but the client Firebase
session hasn't restored, `apiRequest` proceeds with cookie auth only (no Bearer).
If `__session` is invalid/expired at that moment, the request 401s; the 401
recovery requires `auth.currentUser` to refresh — which is null in this path — so
it falls through to `window.location.href = '/signin?expired=true'`.
**Risk:** A returning user with a stale `__session` but a still-valid Firebase
refresh token can be bounced to sign-in instead of transparently recovering.
**Proposed fix:** In the cookie-only branch, before failing, wait briefly for
`onAuthStateChanged` to yield a user (Firebase restoring) and retry with a Bearer
token; only redirect to sign-in if Firebase truly has no session.

### P1-4 — Bootstrap Redis cache (30s) not invalidated on relevant mutations ✅ FIXED (Phase C)
**Status:** Fixed. Added `invalidateBootstrapCache(uid)` to
`server/lib/html-bootstrap.ts` (deletes `veefore:bootstrap:<uid>`), called from
the mutations that change seeded data: social-account connect/disconnect
(`SocialAccountController`), workspace create (`WorkspaceController`), and
onboarding completion (`UserController.completeOnboarding` +
`completeOnboardingFull`). Fail-open / fire-and-forget.
**Files:** `server/lib/html-bootstrap.ts`, `server/controllers/SocialAccountController.ts`,
`server/controllers/WorkspaceController.ts`, `server/controllers/UserController.ts`
**What:** The per-user bootstrap is cached in Redis for 30s. On account
connect/disconnect, workspace create/switch, or onboarding completion, an
immediate reload within 30s can serve a stale seed (e.g. missing a just-connected
account, or `isOnboarded` stale).
**Mitigation today:** the client reconciles via invalidations + refetch; the
backfill fixed the onboarding flag. So impact is small.
**Proposed fix:** Add `invalidateBootstrapCache(uid)` (delete
`veefore:bootstrap:<uid>`) and call it from the connect/disconnect, workspace,
and onboarding-completion handlers. Cheap and removes the staleness window.

### P1-5 — Dev mode (`npm run dev`) silently disables SSR/seeding & flips PROD off ✅ FIXED (Phase C)
**Status:** Addressed. Added a dev-only console banner in `client/src/main.tsx`
explaining that SSR bootstrap/seeding is off in dev and to use
`npm run build && npm start` for production behavior. (The behavior gap itself is
inherent to Vite dev vs the prod server; the banner removes the confusion.)
**File:** `client/src/main.tsx`
**What:** Running `npm run dev` serves the client via Vite middleware with
`import.meta.env.PROD === false` and NO SSR bootstrap injection. During this
session that caused: the dev-only cache-clear to run, no `__VEEFORE_BOOTSTRAP__`,
and "fixes appear to do nothing". Production (`npm run build && npm start`) is the
only mode where the instant-load path is active.
**Risk:** Confusing parity gap; easy to test in the wrong mode.
**Proposed fix:** (a) Document clearly that production behavior requires
`build && start`. (b) Optionally add a one-line console banner in dev:
"[DEV] SSR bootstrap/seeding disabled — run `npm run build && npm start` for prod
behavior." (c) Audit any remaining `if (import.meta.env.PROD)` guards that change
*behavior* (not just logging) so dev ≈ prod logically.

### P2-6 — Debug logging left in production paths (noise + minor PII exposure) ✅ FIXED (Phase D)
**Status:** Removed. Stripped `[apiRequest DEBUG]` (full-payload logs) and the
per-request "API Request with auth token" log from `queryClient.ts`, the
`[bootstrap-hydrate]` logs from `bootstrap.ts`, the `[bootstrap] …` timing logs
from `html-bootstrap.ts`, the `[useSocialAccounts] …` logs, and the
`logs/social-accounts-debug.log` file writes (controller + service); deleted the
log file. (Failure-only warnings like `__session verification failed` are kept.)

### P2-7 — Dead code: `VOLATILE_QUERY_PREFIXES` ✅ FIXED (Phase D)
**Status:** Removed the unused `VOLATILE_QUERY_PREFIXES` array and its stale
comment from `client/src/lib/queryClient.ts`.

### P2-11 — Optimistic-auth hint can show the shell to a logged-out returning user ✅ FIXED (Phase D)
**Status:** Fixed. The hint is now a tiebreaker only — `App.tsx` ignores it when
the server bootstrap EXPLICITLY says logged-out (`isBootstrapExplicitlyLoggedOut()`),
so a real logout / lost session correctly shows the landing page. The hint still
prevents a flash when the server's answer is absent/uncertain.
**Files:** `client/src/lib/bootstrap.ts`, `client/src/App.tsx`

### P2-9 — Forced `refetchQueries` storm potential in the webhook listener ✅ MOOT (Phase C)
**Status:** No longer relevant — the realtime sockets are gated off by default
(2B), so the listener's forced refetches don't run. If realtime is re-enabled,
add the debounce then.

### P3-13 — Two rate-limiter implementations coexist ⚠️ DEFERRED
**Status:** Left as-is for now (deleting `rate-limiting.ts`/`-basic.ts` risks
breaking a stray import). Only `rate-limiting-working.ts` is wired. Recommend a
follow-up to confirm no imports and delete the legacy files.

### P2-8 — `requireAuth` auto-creates users from token data ✅ MITIGATED (Phase A)
**File:** `server/middleware/require-auth.ts`
**Status:** The exploitable part is closed — auto-creation now only happens for a
**verified** Firebase identity (P0-1), so forged tokens can no longer provision
arbitrary users. The auto-create itself is retained (it's the safety net for a
real Firebase user missing a Mongo record). Optional future hardening: restrict
provisioning strictly to the signup/onboarding flow.

### P2-9 — Forced `refetchQueries` storm potential in the webhook listener
**File:** `client/src/components/dashboard/instagram-webhook-listener.tsx`
**What:** Almost every socket event calls `invalidateQueries` AND
`refetchQueries(['/api/social-accounts'])` (non-exact) + analytics + historical.
Now that it's mounted once this is far better, but a chatty server (frequent
sync/data-update events) can still force repeated dashboard refetches.
**Proposed fix:** Debounce/coalesce these refetches (e.g. 2–3s trailing debounce)
and prefer `invalidateQueries` (lets staleTime/observers decide) over forced
`refetchQueries` except for the active workspace.

### P2-10 — `/ws/metrics` Socket.IO transport vs "no websockets" preference ✅ MOOT (Phase C)
**File:** `client/src/components/dashboard/instagram-webhook-listener.tsx`
**Status:** No longer a concern by default — both realtime socket clients are now
gated behind `VITE_ENABLE_REALTIME === 'true'` (off by default, 2B). With realtime
disabled there is no long-lived socket connection and no reconnect volume. If
realtime is ever re-enabled, enforce a single app-wide connection with sane
backoff at that time.

### P2-11 — Optimistic-auth hint can show the shell to a logged-out returning user
**Files:** `client/src/lib/bootstrap.ts` (`hasAuthHint`), `client/src/App.tsx`
**What:** `hasAuthHint()` (30-day localStorage flag) makes `/` paint the app shell
instead of landing even when the server bootstrap says unauthed. If a user's
server session is gone but the hint persists (e.g. cookies cleared server-side,
not via our logout), they briefly see the shell, then get bounced to sign-in.
**Mitigation:** logout clears the hint; this only affects out-of-band session loss.
**Proposed fix:** Treat the hint as a *tiebreaker only when no bootstrap is
present*; if `window.__VEEFORE_BOOTSTRAP__` says `authed:false && !cookied`,
prefer the server's answer (landing) over the hint.

### P3-12 — `currentWorkspaceId` cross-tab consistency ⚠️ DEFERRED (optional)
**File:** `client/src/components/WorkspaceSwitcher.tsx`
**Status:** Left as-is — low impact and out of scope for the auth/load remediation.
Active workspace is per-tab; switching in one tab doesn't reflect in another until
reload. Optional follow-up: listen to the `storage` event for `currentWorkspaceId`
and update the active workspace across tabs.

### P3-13 — Two rate-limiter implementations coexist
**Files:** `server/middleware/rate-limiting-working.ts` (active),
`rate-limiting.ts`, `rate-limiting-basic.ts` (legacy, 60/min).
**What:** Multiple global limiters defined; only `-working` is wired. Risk of a
future import pulling the wrong one (60/min, `req.ip`).
**Proposed fix:** Delete the unused implementations or clearly mark them.

---

## 3. Suggested remediation phases

**Phase A — Security & data-isolation (P0, do first)**
1. P0-1: require verified tokens in `requireAuth`; remove unverified-decode auth.
2. P0-2: `getSession` mints only from a verified uid.
3. 2B (secondary): verify tokens (not decode-only) in the socket auth middleware.
4. P2-8: stop silent user auto-creation on the auth path.
- Verify: all auth flows still work; a tampered Bearer token / socket token is
  rejected.

**Phase B — Logout hygiene & cross-account leakage (P0/P1)**
5. 2A: add `clearClientSessionState()` and call it from every logout path
   (`logout()`, cross-tab logout listener, "use a different account"). Clear
   `veegpt-*`, `veefore:*` (session+local), `app-cache:*`, `currentWorkspaceId`,
   `isOnboarded`, `veefore_authed_hint`, `veefore_early_access_*`, admin keys,
   social-listening convs; keep only an allowlist (`theme`, `cookie_consent*`,
   optionally `signin_email_v1`). Also clear the React Query cache
   (`queryClient.clear()`) on account switch.
- Verify: log out account A, log in account B on same browser → no A state
  visible anywhere (VeeGPT, dashboard, workspace, early-access).

**Phase C — Correctness & UX robustness (P1)**
6. P1-3: cookie-only 401 waits for Firebase restore before bouncing to sign-in.
7. P1-4: invalidate the bootstrap Redis cache on connect/disconnect/workspace/
   onboarding mutations.
8. 2B (primary): decide realtime — fix socket auth properly OR remove the dead
   sockets and lean on HTTP polling (kills the reconnect load).
9. P1-5: document dev vs prod; add the dev banner; audit behavior-changing
   `PROD` guards.

**Phase D — Cleanup & polish (P2/P3)** ✅ COMPLETE
10. ✅ P2-6: stripped debug logging from prod paths; removed the debug log file.
11. ✅ P2-7: deleted dead `VOLATILE_QUERY_PREFIXES`. ⚠️ P3-13: deferred (legacy
    limiter files left in place pending an import-safety check).
12. ✅ P2-9: moot — realtime sockets gated off (2B), so no webhook refetch storm.
13. ✅ P2-11: hint is now a tiebreaker only, ignored when bootstrap says logged-out.
14. ⚠️ P3-12: deferred (optional cross-tab workspace sync, low impact).

---

## 4. Verification checklist (run after each phase, in PRODUCTION mode)
`npm run build && npm start`, then clear site data once, and confirm:
- [ ] Fresh login (email + Google) → dashboard, no flash, data seeded.
- [ ] Hard refresh on dashboard → instant shell + seeded data, no cold skeleton.
- [ ] Sidebar nav between pages → no refetch of cached dashboard queries.
- [ ] Logout → lands on public page, `auth_token` + `__session` gone, no re-login.
- [ ] Two tabs: logout in one → other signs out, neither re-logs-in.
- [ ] Two tabs: open second → first stays on dashboard (no onboarding bounce).
- [ ] **Account switch: log out A → log in B on same browser → NO A state in
      VeeGPT (conversation/has-conversations), dashboard, workspace, or
      early-access UI.** (Inspect `localStorage`/`sessionStorage` — only the
      allowlisted keys remain.)
- [ ] Tampered/expired token → clean 401 handling, no privilege escalation.
- [ ] Realtime: confirm whether `/ws/metrics` connects (it currently does NOT —
      see 2B). No repeating failed `/ws/metrics` handshakes in the Network tab.
- [ ] No `[apiRequest DEBUG]` / `[bootstrap-hydrate]` noise in console.
- [ ] `window.__VEEFORE_BOOTSTRAP__.reason` is `session-verified` (or cache-hit)
      for a logged-in load.

---

## 5. Notes / open questions for the team
- Confirm whether the Bearer decode-fallback (P0-1) was added to tolerate Admin
  SDK init failures; if so we need a proper "admin unavailable" behavior (fail
  closed) rather than trusting unverified tokens.
- Confirm the intended product behavior of `/ws/metrics` (P2-10) before changing.
- Decide on a single canonical rate-limiter module (P3-13).

---

## 6. Post-phase findings

### PF-1 — False `too_many_requests` (429) after a couple of logout→login cycles ✅ FIXED
**Symptom:** Google sign-in (and even 2–3 normal logins) returns
`{"error":"too_many_requests","retryAfter":N}` — the **OAuth** limiter
(`rate-limiting-working.ts → oauthRateLimiter`, was 20/min/IP), not the global one.
**Root cause:** `oauthRateLimiter` was mounted on the **entire** `/api/auth`
router (`routes.ts`) as a deny-by-default limiter with a hardcoded exempt list.
The real OAuth initiation routes (`/google/start`, `/google/callback`) are served
by an earlier mount (`index.ts`) that never reaches this limiter, so in practice
the 20/min bucket was only ever consumed by the *fall-through* auth-maintenance
calls that fire automatically during login/logout: `/signin`,
`/check-email-exists`, `/link-firebase`, `/associate-uid`, and the `TEMP DEBUG`
`/debug-client-log` that fired on **every** `onAuthStateChanged`. A few cycles
exhausted the bucket and the next login was wrongly blocked.
**Fix:**
1. Inverted `oauthRateLimiter` to an **allow-list**: it now rate-limits ONLY
   genuine OAuth initiation (`GET /<provider>/start`) and lets every other
   `/api/auth/*` call through (those have authRateLimiter / bruteForceMiddleware /
   token verification). Limit raised to 30/min (1 `/start` per login).
2. Attached `oauthRateLimiter` to the real Google OAuth mount in `index.ts`
   (`app.use('/api/auth', oauthRateLimiter, authRoutes)`) so `/google/start`
   actually gets the protection.
3. Removed the leftover `TEMP DEBUG` `/api/auth/debug-client-log` call from
   `useFirebaseAuth` (fired on every auth state change; pure noise + request load).
**Files:** `server/middleware/rate-limiting-working.ts`, `server/index.ts`,
`client/src/hooks/useFirebaseAuth.ts`

### PF-1b — SECOND OAuth limiter + Redis key collision blocked `/google/start` ✅ FIXED
**Symptom (after PF-1):** `/api/auth/google/start?mode=signin` returns
`too_many_requests` after only ~5 OAuth opens (blocked on the 6th), retryAfter ~45.
**Two root causes:**
1. `routes/auth.ts` does `router.use(oauthSecurityMiddleware)`, which includes a
   SEPARATE `oauthRateLimiter` (`server/middleware/oauthSecurity.ts`: was
   10/min/IP, 60s block) applied to the WHOLE OAuth router — so `/session`,
   `/update-token`, `/logout`, `/debug-client-log`, `/google/callback` drained the
   bucket during login/session-restore.
2. **Redis key collision:** I had also added the `rate-limiting-working`
   `oauthRateLimiter` to the `/google/start` mount in `index.ts`. BOTH limiters
   bucket under the same Redis key (`oauth_rl:<ip>` — one via raw `INCR`, the other
   via `rate-limiter-flexible`), so each `/google/start` incremented the shared
   counter TWICE → 5 starts = 10 points → 6th blocked.
**Fix:**
- Scoped `oauthSecurity.ts`'s `oauthRateLimiter` to genuine initiation only
  (`GET …/start`); all other `/api/auth/*` calls pass through.
- Removed the redundant `oauthRateLimiter` from the `index.ts` `/api/auth` mount
  (`/google/start` is already protected by `oauthSecurityMiddleware`).
- Gave `oauthSecurity`'s limiter a distinct Redis `keyPrefix` (`oauth_init_rl`) so
  it can never collide with the working limiter's `oauth_rl` key, and raised it to
  20 initiations/min for comfortable headroom.
**Files:** `server/middleware/oauthSecurity.ts`, `server/index.ts`

### PF-2 — Logout doesn't stick: dashboard flash on every reload + auto re-login ✅ FIXED
**Symptom:** After logout the landing page shows a brief FLASH of the dashboard
on every reload, and after a few reloads the user is silently logged back in.
**Root cause (from `logs/auth-debug.log`):** logout cleared cookies but there was
**no server-side session invalidation**, so the session kept getting resurrected:
- `/api/auth/session` re-minted a fresh custom token from the still-present
  `auth_token` cookie (`hasAuthCookie:true` persisted after `/logout`).
- Other open tabs re-created `auth_token` + `__session` via `/session-login` and
  `/update-token` faster than logout could clear them (a multi-tab storm — the
  log shows a flood of `/session` every ~200ms).
- The cross-tab logout handler called `clearClientSessionState()`, which **wiped
  the `veefore_logout` guard key**, so `recentlyLoggedOut()` returned false in the
  other tabs and they immediately re-established the session.
**Fix (authoritative server-side invalidation + client guard):**
1. `POST /api/auth/logout` now bumps the user's `sessionVersion` (`$inc`) BEFORE
   clearing cookies → "logout everywhere" (matches the existing cross-tab logout
   design). Every token carries a `sessionVersion` claim (`createFirebaseToken` /
   `signIn` / `/session`), so the bump makes all existing tokens stale.
2. The session-establishing endpoints now REJECT stale tokens and clear cookies:
   `GET /api/auth/session`, `POST /api/auth/update-token` (routes/auth.ts), and
   `POST /api/auth/session-login` (AuthController). Decode handles both ID-token
   (top-level claim) and custom-token (`claims.sessionVersion`) shapes. Checks are
   fail-open (only reject when the claim is present AND mismatched) so a normal
   login is never broken; a fresh login mints a token with the new version.
3. `clearClientSessionState()` now KEEPS `veefore_logout` so the cross-tab guard
   survives the wipe and other tabs don't re-establish the session.
**Files:** `server/routes/auth.ts`, `server/controllers/AuthController.ts`,
`client/src/lib/session-cleanup.ts`

### PF-3 — Bootstrap seed silently dropped → dashboard shows skeleton not seeded data ✅ FIXED
**Symptom:** On refresh / app open the dashboard does NOT show seeded data
immediately — it shows the cold skeleton and then fetches.
**Root cause:** `buildVerifiedBootstrap` ran the DB build (user + workspaces +
per-workspace social accounts ≈ a few sequential round-trips) under a **250ms**
budget, and on timeout it BOTH fell back to a boolean-only bootstrap AND
**discarded the in-flight build (never cached it).** In production that build
regularly runs slightly over 250ms, so every load timed out, never seeded, and
never warmed the cache → cold skeleton every time. (With no user object in the
bootstrap, `App.tsx` can't `mountAppEarly`, so it shows `AppShellSkeleton`.)
**Fix (`server/lib/html-bootstrap.ts`):**
1. Start the DB build once and ALWAYS cache its result when it settles, even if
   THIS response times out — so the very next load (within the TTL) is seeded.
2. Raised the build budget 250ms → 700ms (typical build now usually seeds on the
   first load) and the cache TTL 30s → 60s (longer instant-seed window).
**Verify:** in the browser console, `window.__VEEFORE_BOOTSTRAP__.reason` should
be `session-verified` or `cache-hit` (with a `user` object) for a logged-in load.
`verified-build-timeout` means the build is still too slow; `flag-only-customtoken`
means only `auth_token` (a custom token) was present and `__session` hadn't been
minted yet (normal for the very first load right after OAuth, before
`/update-token` runs).
**Files:** `server/lib/html-bootstrap.ts`

### PF-4 — Performance Overview still skeletoned on refresh ✅ FIXED
**Symptom:** With user/workspaces/social-accounts now seeded, the Performance
Overview card still showed its skeleton on refresh.
**Root cause:** `MetricsGrid` renders `<MetricsGridSkeleton/>` whenever
`historicalLoading || analyticsLoading || followerLoading` is true. Those three
queries (`/api/dashboard/analytics`, `/api/analytics/historical`,
`/api/workspaces/:id/metrics/followers`) were NOT seeded by the bootstrap, so the
grid skeletoned until they fetched on mount.
**Fix:** Extended the bootstrap dashboard seed (`html-bootstrap.ts`) to also
inline, per workspace:
- `analyticsByWorkspace` — computed in-process from the accounts already fetched
  (mirrors `/api/dashboard/analytics`, no extra query),
- `historicalByWorkspace` — month/30d via `analyticsService.getAnalyticsByDateRange`
  (mirrors `/api/analytics/historical` mapping),
- `followerByWorkspace` — `analyticsService.getFollowerAnalytics`.
Client `hydrateQueryCacheFromBootstrap` seeds the matching query keys
(`['/api/dashboard/analytics', wsId]`, `['/api/analytics/historical','month',wsId]`,
`['/api/workspaces/metrics/followers', wsId]`), so all three are present on first
render and the metrics grid paints immediately. Each read is parallel + fail-open,
and the build still runs under the budget + warms the cache.
**Note:** The AI insight banner ("Monthly Pulse") is generated by a polled AI job
and is NOT seeded — it shows its own small loading state, then caches per
data-signature in sessionStorage. Day/Week period data also fetches on demand
(only the default Month is seeded).
**Files:** `server/lib/html-bootstrap.ts`, `client/src/lib/bootstrap.ts`

### PF-5 — Static chrome (sidebar/header) showed shimmer on first paint ✅ FIXED
**Symptom:** On first paint the sidebar nav and header — which are static and
never change — rendered as grey shimmer placeholders, which looked unfinished.
**Fix:** The first-paint shell now renders the REAL static chrome instead of
shimmer:
- `SidebarSkeleton` renders the real VeeFore logo + the actual nav icons/labels
  (Home, Plan, Create, Analytics, Listening, …, Settings, Logout) with the
  active item highlighted from the pathname — pure/presentational (no handlers,
  no Create dropdown, no hover/active animations), so it SSR-renders and swaps to
  the real interactive `Sidebar` with zero layout shift. Nav list mirrors
  `sidebarGroups` (incl. the `VITE_META_PHASE_1_REVIEW_MODE` flag).
- `HeaderSkeleton` renders the real search field + notification bell; only the
  genuinely dynamic bits (trial badge text, "Welcome, <name>", workspace switcher,
  avatar) stay as light placeholders until the seeded data-backed `Header` mounts.
- `AppShellSkeleton` threads `pathname` into the shells → `SidebarSkeleton` so the
  active nav item is correct even server-side (no `window`).
**Files:** `client/src/components/skeletons/SidebarSkeleton.tsx`,
`client/src/components/skeletons/HeaderSkeleton.tsx`,
`client/src/components/skeletons/AppShellSkeleton.tsx`
**Guard/audit:** `npm run skeleton:guard` PASS and `npm run skeleton:audit`
regenerated clean (0 generic loaders, 0 missing skeletons). No
`skeleton-guard-allow` annotations were needed — the guard only bans the three
generic-loader patterns (`animate-spin` div/span, neutral `animate-pulse`
div/span, "Loading…" text), and real static chrome (icons/logo/read-only search
input/bell) matches none of them. The `component-skeletons.property` tests
(Property 13 purity + Property 14 unmount) still pass.

### PF-6 — Header identity (name/avatar/workspace) now real on first byte ✅ DONE
**What:** Extended PF-5 so even the header's per-user identity renders for real on
the first paint (no placeholder→real swap): the "Welcome, <name>!" heading, the
avatar initials tile, and the active workspace pill (name + theme gradient +
personality icon + credits + default crown).
**How:** Threaded a `ShellChrome` ({ displayName, email, workspace }) from the
seeded bootstrap into the SSR shell and the client loading shell:
- `client/src/lib/bootstrap.ts` — added `ShellChrome` + `getBootstrapChrome()`
  (derives identity from the injected bootstrap; uses the DEFAULT workspace since
  the server can't see the per-tab localStorage selection).
- `client/src/ssr/shell-ssr.tsx` — `renderAppShell(pathname, chrome?)`.
- `server/lib/html-bootstrap.ts` — `buildShellChrome(state)` built from the same
  bootstrap data and passed into the SSR renderer (`ShellRenderer` now takes
  `chrome`).
- `AppShellSkeleton` threads `chrome` to `StandardShell` → `HeaderSkeleton`;
  client derives it via `getBootstrapChrome()` so the loading shell matches the
  SSR markup exactly. `HeaderSkeleton` renders real identity when `chrome` is
  present, else the prior placeholders. Display-name/initials/theme-gradient/
  personality-icon logic mirrors `header.tsx` / `ProfileDropdown.tsx` /
  `WorkspaceSwitcher.tsx`.
**Note:** Welcome name + avatar are user-level and always correct (seeded on both
SSR and client). The active WORKSPACE pill is now NEVER a placeholder/omitted
when the user has any workspace:
 - The client mirrors `currentWorkspaceId` into a non-sensitive `vf_ws` cookie on
   switch, on validation (`useCurrentWorkspace`), on auto-create, AND at startup
   hydration (`syncActiveWorkspaceCookie` in `queryClient.ts`) — so a non-default
   selection is always captured, and the cookie is present from the first load on.
 - The SERVER reads + VALIDATES `vf_ws` against the user's own seeded workspaces
   and renders it; if the cookie is absent/invalid it falls back to the user's
   DEFAULT workspace. That's correct (not a guess): the only way to be on a
   non-default workspace is to have switched, which sets the cookie — so "no
   cookie" ⇒ the user is on their default. Result: no loading flash, no fake data.
 - Cookie is cleared on logout (`clearClientSessionState`). The only residual
   transient is the one-time post-deploy load for a user currently on a
   non-default workspace whose cookie isn't set yet (server shows default, client
   corrects on mount, and the cookie is written for every load after).
**Files (PF-6 incl. cookie):** `client/src/lib/bootstrap.ts`,
`client/src/lib/queryClient.ts`, `client/src/lib/session-cleanup.ts`,
`client/src/components/WorkspaceSwitcher.tsx`, `client/src/ssr/shell-ssr.tsx`,
`server/lib/html-bootstrap.ts`,
`client/src/components/skeletons/AppShellSkeleton.tsx`,
`client/src/components/skeletons/HeaderSkeleton.tsx`
**Files:** `client/src/lib/bootstrap.ts`, `client/src/ssr/shell-ssr.tsx`,
`server/lib/html-bootstrap.ts`,
`client/src/components/skeletons/AppShellSkeleton.tsx`,
`client/src/components/skeletons/HeaderSkeleton.tsx`

### PF-7 — VeeGPT: wrong variant + shimmer chrome + no seed ✅ FIXED
**Symptoms:** Opening /veegpt showed the WELCOME skeleton even for a returning
user with conversations / an active chat; the welcome screen, New chat, nav, and
input/composer were grey shimmer; and the conversation list wasn't seeded.
**Fixes:**
1. **Variant prediction** (`VeeGPTSkeleton`) now EXACTLY mirrors the page's
   `initialPredictionRef`: chat iff a conversation is cached OR (no cache) the
   `veegpt-has-conversations` hint is set (page auto-selects the first chat);
   sidebar shows for chat OR when the hint is set. So a returning user gets the
   chat+sidebar layout, not welcome.
2. **Static chrome** — the skeleton renders REAL: the conversation-sidebar logo +
   "New chat" + nav (Search chats / Content Studio / Auto Pilot / AI Models), the
   welcome logo/title("How can VeeGPT help?" + Beta)/subtitle/input box/quick-prompt
   pills (mirrors `QUICK_PROMPTS`), and the chat composer pill. Only the
   conversation LIST + bottom user row remain shimmer (data/identity); the chat
   message canvas stays blank (messages stream in).
3. **Seeded conversations** — bootstrap now fetches the active workspace's chats
   (`vf_ws` cookie → else default) FRESH per request (time-boxed 150ms, NOT cached
   since it's workspace-specific) and the client seeds `['/api/chat/conversations']`
   + mirrors the `veegpt-has-conversations` hint, so the real sidebar list renders
   immediately on open.
**Files:** `client/src/components/skeletons/pages/VeeGPTSkeleton.tsx`,
`client/src/lib/bootstrap.ts`, `server/lib/html-bootstrap.ts`,
`client/src/components/skeletons/__tests__/page-skeleton-structure.client.test.tsx`
(VeeGPT case now renders the data-bearing `chat`+sidebar variant since the welcome
variant is intentionally all-static).

### PF-8 — VeeGPT SSR full-reload now predicts the right layout ✅ DONE
**What:** On a FULL reload of `/veegpt` the server renders the shell but can't read
the client's localStorage chat-state, so it used to fall back to welcome/no-sidebar
(brief wrong-variant flip for users with chats). Now the SSR shell knows.
**How:** `ShellChrome` gained a `veegpt: { hasConversations }` hint, derived
server-side from the seeded conversation list (`state.chat`) in `buildShellChrome`
and client-side in `getBootstrapChrome`. `AppShellSkeleton` threads it through
`VeeGPTShell` → `VeeGPTSkeleton` as `hasConversationsHint`. The skeleton uses the
precise localStorage signals on the client, and falls back to this hint on the
server — so a hard reload of /veegpt paints the correct chat+sidebar (or welcome)
layout on the first byte, matching the page.
**Files:** `client/src/lib/bootstrap.ts`, `server/lib/html-bootstrap.ts`,
`client/src/components/skeletons/AppShellSkeleton.tsx`,
`client/src/components/skeletons/pages/VeeGPTSkeleton.tsx`

### PF-9 — Black screen flash before the shell on every refresh ✅ FIXED
**Symptom:** On every refresh of an authenticated route, a black blank screen
flashed before the shell appeared.
**Root cause:** `client/index.html` ships critical CSS that forces
`html, body, #root { background-color:#000 !important }` (the black LANDING
background). The authenticated shell's own background (`bg-gray-50 dark:bg-gray-900`)
only applies once the Tailwind CSS bundle loads — so between the HTML arriving
(with the SSR shell already inside `#root`) and the bundle painting, `#root`
showed solid BLACK. That gap is the flash, on every load.
**Fix:** When the server injects the app shell, it now also injects a tiny
synchronous `<head>` no-flash theme script (`APP_SHELL_THEME_SCRIPT` in
`html-bootstrap.ts`). Before the body paints it reads the stored theme, applies
the theme class to `<html>`, and overrides `#root`/html/body background with the
SHELL's background (`#f9fafb` light / `#111827` dark) up-front — so the shell
paints on its correct background immediately, no black. Injected ONLY for shell
loads; the logged-out landing keeps its intentional black background. Also
pre-applying the theme class prevents a light→dark flip when the bundle loads.
**Files:** `server/lib/html-bootstrap.ts`

### PF-10 — Shell flash on refresh (createRoot recreating the SSR shell DOM) ✅ FIXED
**Symptom:** the shell flashed/blinked on every refresh even after the black fix.
**Root cause:** the server inlined the shell INSIDE `<div id="root">…</div>`, but
the client mounts with `createRoot` (NOT `hydrateRoot`). createRoot does not reuse
server DOM — on mount it RECREATES `#root`'s entire subtree (new nodes, images
re-decode, shimmer restarts), which reads as a flash on every load. Matching the
client's first render to the server markup does NOT help (createRoot still rebuilds
the nodes); only hydration would reuse them, and full hydration isn't viable here
(the SSR output is just the shell, not the whole provider tree).
**Fix (`server/lib/html-bootstrap.ts` + `client/src/AuthenticatedApp.tsx`):**
1. Render the SSR shell as a FIXED **overlay** (`#vf-ssr-shell`, a sibling of
   `#root`), keeping `#root` EMPTY — so `createRoot` mounts into an empty
   container and never tears down/recreates server DOM.
2. **Cross-fade** the overlay out (260ms opacity dissolve, `pointer-events:none`
   during) instead of removing it instantly — a dissolve hides ANY difference
   between the skeleton overlay and the live content underneath (shimmer→data,
   minor chrome diffs), so there's no hard cut/flash.
3. Trigger the dissolve when the REAL app mounts: `AuthenticatedApp` calls
   `window.__vfRemoveShell()` on mount (rAF-deferred); a MutationObserver on
   `#root` (+350ms) and a 5s timeout are fallbacks so it can never get stuck.
4. The no-flash theme background is now injected for ALL authed shell routes
   (decoupled from SSR), so even non-SSR/dev loads avoid the black `#root`.
**Files:** `server/lib/html-bootstrap.ts`, `client/src/AuthenticatedApp.tsx`;
`client/src/App.tsx` reverted to plain `mountAppEarly`.

### PF-11 — White flash specifically on VeeGPT (lazy chunk + white content) ✅ FIXED
**Symptom:** the flash was ONLY on VeeGPT, white, between the shell and the real
content (and a pre-paint blink on cold load).
**Root cause:** VeeGPT is its OWN lazy chunk (`React.lazy(() => import('./pages/VeeGPT'))`),
NOT part of the prefetched `AuthenticatedApp` bundle, and its chat content area is
WHITE (`bg-white`). The shell overlay was dissolved when `AuthenticatedApp` mounted
— but VeeGPT's chunk was still loading, so the dissolve revealed VeeGPT's Suspense
fallback / white content gap, then VeeGPT swapped in → a white flash. The dashboard
didn't flash because its background is gray (matches the overlay).
**Fix:**
1. `App.tsx` prefetches the VeeGPT chunk in parallel on a direct `/veegpt` load
   (alongside the `AuthenticatedApp` prefetch), so it's ready when the route renders.
2. `pages/VeeGPT.tsx` now triggers the overlay dissolve itself on mount, so the
   overlay covers the ENTIRE chunk-load + first paint and dissolves straight onto
   the live VeeGPT page (cross-fade) — no white interim.
3. `AuthenticatedApp` SKIPS its own dissolve trigger on the `/veegpt` route (so it
   can't dissolve early onto VeeGPT's loading gap); VeeGPT owns the dissolve there.
4. The removal script's MutationObserver fallback delay was raised to 1.5s so it
   never pre-empts a page's own (faster) readiness trigger.
**Note:** A pre-HTML white blink on a COLD `/veegpt` load is the browser's normal
navigation/TTFB gap (before the server's HTML arrives) — not the shell. It can be
shortened by making the VeeGPT conversation seed non-blocking; ask if wanted.
**Files:** `client/src/App.tsx`, `client/src/AuthenticatedApp.tsx`,
`client/src/pages/VeeGPT.tsx`, `server/lib/html-bootstrap.ts`

### PF-12 — The flash IS ProtectedRoute's dark `<LoadingSpinner/>` ✅ FIXED
**Symptom (user-identified):** the VeeGPT flash is the app's dark loading spinner.
**Root cause:** `components/ProtectedRoute.tsx` (which wraps `/veegpt` and other
protected routes) rendered a full-screen `<LoadingSpinner/>` while Firebase auth
was still resolving (`if (loading) return <LoadingSpinner/>`). On reload,
`mountAppEarly` mounts `AuthenticatedApp` before Firebase has restored
`auth.currentUser`, so ProtectedRoute briefly shows that dark spinner before the
page mounts — a dark flash, most visible on VeeGPT.
**Fix:** `ProtectedRoute` now returns `null` while `loading` instead of the
spinner. The SSR shell overlay (and each route's own skeleton) already covers the
visual during the brief auth-resolve window, so the spinner only added a dark
flash. (Removed the now-unused `LoadingSpinner` import.)
**Files:** `client/src/components/ProtectedRoute.tsx`


### PF-13 — Residual WHITE flash on VeeGPT (overlay dissolves before VeeGPT mounts) ✅ FIXED
**Symptom (user-identified):** after PF-12 removed the dark spinner, a WHITE flash
remained on VeeGPT — both a pre-paint blink on initial load AND a gap between the
shell and the real content. Only on `/veegpt`.
**Root causes (two, both addressed):**
1. **Overlay dissolved too early (the "between shell and content" white).** The
   removal script (`SHELL_REMOVE_SCRIPT`) had a MutationObserver fallback that
   dissolved the overlay 1.5s after `#root` got ANY content. With `mountAppEarly`,
   the real app tree mounts immediately but `/veegpt`'s `ProtectedRoute` renders
   `null` while Firebase auth resolves — yet `#root` already has the provider tree,
   so the observer fired and dissolved the overlay BEFORE VeeGPT's (separate, lazy)
   chunk mounted. That revealed the empty/null route = white (this is exactly where
   the PF-12 dark spinner used to sit). **Fix:** the removal script now SKIPS the
   MutationObserver auto-dissolve on `/veegpt` (`location.pathname` check); the
   overlay there is dissolved ONLY by VeeGPT's own `__vfRemoveShell` call on mount,
   with the 5s safety timeout as the sole backstop. So the overlay stays up until
   the live VeeGPT page has actually painted.
2. **Chat-seed query blocked TTFB on every load (the pre-paint blink).**
   `fetchChatSeed` ran the `ChatConversation.find()` query on EVERY VeeGPT HTML load
   — including bootstrap cache hits — adding up to `BOOTSTRAP_CHAT_BUDGET_MS` (150ms)
   to first-byte latency, lengthening the browser's white navigation gap. **Fix:**
   the seed is now cached under a SEPARATE per-(uid,workspace) Redis key
   (`veefore:chatseed:<uid>:<wsId>`, 30s TTL) — read first (40ms budget), DB query
   only on miss, then a fire-and-forget cache write. Kept workspace-specific so one
   workspace's chats never leak into another. Fail-open throughout.
**Files:** `server/lib/html-bootstrap.ts` (`SHELL_REMOVE_SCRIPT` veegpt gate +
`fetchChatSeed` caching).


### PF-14 — VeeGPT flicker on EVERY refresh after the first (chat-skeleton missing the header bar) ✅ FIXED
**Symptom (user):** the initial load is clean, but every subsequent refresh of
`/veegpt` flickers.
**Root cause:** the difference between the first load and later loads is the
PREDICTED VARIANT. On a brand-new browser there's no cached `veegpt-state`, so
both the page and the skeleton predict the WELCOME variant — and the welcome
skeleton matches the real welcome screen pixel-for-pixel, so the dissolve is
invisible. Once the user has opened a conversation, `veegpt-state` holds a
`conversationId`, so every later load predicts the CHAT variant. But the chat
skeleton (`ChatContentShell`) was missing the real `ChatInterface`'s top header
bar (a 56px `h-14` bar with the logo + conversation title + New chat action).
So the skeleton's message area sat 56px higher than the live chat; when the
overlay dissolved onto the real page, the content jumped down 56px — a visible
flicker on every chat-variant load.
**Fix:** added the real, static header bar to `ChatContentShell` (logo + "VeeGPT"
title + New chat action, same `h-14` markup as `ChatInterface`) and matched the
message area's gradient background, so the chat skeleton and the live chat are
layout-identical and the dissolve is seamless.
**Files:** `client/src/components/skeletons/pages/VeeGPTSkeleton.tsx`.


### PF-15 — VeeGPT conversation-sidebar flicker on warm refreshes (skeleton sidebar ≠ real sidebar) ✅ FIXED
**Symptom (user, with video):** the first load is clean but every warm refresh
flickers; the visible page is the welcome screen WITH a populated conversation
sidebar.
**Root cause:** the overlay's `ConversationSidebarShell` did not match the real
`ConversationSidebar`, and the mismatch only became visible once data was warm:
  - **Width:** skeleton `w-64` (256px) vs real `w-[17.5rem]` (280px) → the whole
    content area shifted 24px horizontally on dissolve.
  - **Background:** `bg-gray-50` vs the real `bg-gray-100/80 dark:bg-slate-950/50`.
  - **Header:** skeleton had no collapse button; real has logo + `PanelLeft`.
  - **"Chats" label:** rendered as a shimmer bar vs the real uppercase text.
  - **Conversation list:** placeholder shimmer rows vs real titles. On a COLD load
    the seed isn't warm so the real list is also still loading → both showed
    placeholders → matched (clean). On a WARM refresh the seed is instant so the
    LIVE sidebar rendered real titles immediately while the overlay still showed
    placeholders → visible swap.
  - **User row:** placeholder avatar/name vs the real identity.
**Fix:**
1. Seeded the REAL data to the overlay: extended `ShellChrome.veegpt` with the
   actual conversation `{id,title}` list (titles only) and added `plan`; populated
   in both `buildShellChrome` (server) and `getBootstrapChrome` (client).
2. Rewrote `ConversationSidebarShell` to mirror `ConversationSidebar` EXACTLY
   (width, bg, header, nav, "Chats" label, bottom user row) and render the real
   seeded conversation titles + real user identity (+ highlight the selected
   conversation in the chat variant). Falls back to placeholders only when no seed
   (bare Suspense fallback during in-app nav).
3. Added the missing chat-variant header bar (PF-14) — already done.
4. **Variant parity:** the server can't read the page's `localStorage` chat-state,
   so it could mis-predict welcome-vs-chat. The page now mirrors its resolved
   layout into a compact `vf_vg` cookie (`<variant><sidebar>`, e.g. `w1`/`c1`);
   `buildShellChrome` reads it so the overlay renders the EXACT variant the live
   page will, and `VeeGPTSkeleton` uses the cookie hint on the server while still
   reading precise `localStorage` on the client.
**Files:** `client/src/components/skeletons/pages/VeeGPTSkeleton.tsx`,
`client/src/components/skeletons/AppShellSkeleton.tsx`, `client/src/lib/bootstrap.ts`,
`client/src/pages/VeeGPT.tsx`, `server/lib/html-bootstrap.ts`.


### PF-16 — VeeGPT flicker root cause: overlay dissolved on MOUNT, before the view settled ✅ FIXED
**Re-diagnosis (after parity fixes PF-13..PF-15 didn't fully resolve it):** the
decisive clue is that the COLD load is clean and only WARM refreshes flicker — the
only difference is speed, which rules out a static layout mismatch (that would
flicker in both) and points to a post-dissolve STATE TRANSITION.
**Root cause:** VeeGPT triggered the overlay dissolve from the OUTER component's
`useEffect` on **mount**. But `VeeGPTContent` mounts with `isInitializing=true`
(flipped ~100ms later) and an auto-select effect can switch welcome→chat once the
conversations resolve. On a COLD load the lazy chunk downloads slowly, so all that
settling happened WHILE the overlay still covered the screen → clean. On a WARM
refresh the chunk + seeded data are instant, so the overlay dissolved on mount and
the view then settled/transitioned ~100ms later IN PLAIN VIEW → the flicker.
**Fix:** removed the mount-time dissolve. `VeeGPTContent` now calls
`__vfRemoveShell()` only once the view has SETTLED — `!isInitializing &&
!conversationsLoading && !!finalUserData` — deferred two rAFs so the final view
paints first. The overlay now covers the ENTIRE initialize→settle transition and
dissolves straight onto the stable view, on warm and cold loads alike. The 5s
safety timeout in `SHELL_REMOVE_SCRIPT` remains the backstop.
**Files:** `client/src/pages/VeeGPT.tsx`.


### PF-17 — Blank flash between shell and content: AuthenticatedApp remounts when Firebase `loading` flips ✅ FIXED
**Symptom:** a blank screen flash between the shell and the real VeeGPT content,
warm loads only.
**Root cause:** `App.tsx` renders the authed tree via a top-down ternary. On a
warm load:
  - while Firebase is restoring (`loading=true`, `user=null`) `mountAppEarly` is
    true → `AuthenticatedApp` mounts;
  - when Firebase resolves (`loading=false`, `user` set) `mountAppEarly` becomes
    false, and the EARLIER `user && onboardingResolving` branch briefly matched →
    rendered `<AppShellSkeleton/>` instead, **unmounting `AuthenticatedApp` (and
    the VeeGPT chunk)**, then remounting it once onboarding resolved.
That unmount/remount lands exactly when the overlay dissolves on a warm load →
the blank frame. On a cold load it happened under the still-present overlay → invisible
(matching the "cold clean, warm flickers" pattern).
**Fix:** for a SERVER-verified onboarded session (`SERVER_ONBOARDED`) the
onboarding-resolving skeleton branch is skipped (`&& !SERVER_ONBOARDED`) and the
AuthenticatedApp branch also matches on `(user && SERVER_ONBOARDED)`, so the SAME
`<AuthenticatedApp/>` element stays mounted in the SAME tree position across the
`loading` flip — React preserves the subtree (no remount, no blank). Non-server-
onboarded sessions keep the original resolving-skeleton behavior.
**Files:** `client/src/App.tsx`.


### PF-18 — REAL root cause of the persistent VeeGPT flicker: dev-built bundle + Cloudflare Rocket Loader ✅ FIXED
**How it was found:** added an always-on debug timeline. The console showed (a)
ONLY `[vf-client]` logs and ZERO `[vf-shell]` logs, and (b) a `[DEV] SSR
bootstrap/seeding is disabled in dev` warning plus `rocket-loader.min.js` in the
stack. Two environment/build problems — not the React logic edited in PF-1..PF-17:

1. **The "production" client bundle was actually a DEV build.** `vite build`
   derives `import.meta.env.PROD/DEV` from `NODE_ENV`, and `.env` sets
   `NODE_ENV=development`; `client:build` didn't force production, so Vite baked a
   dev bundle (`import.meta.env.DEV=true`). Proof: the dev-only warning STRING was
   present in `dist/public/assets/index-*.js` (a real prod build dead-code-
   eliminates it). A dev React bundle also double-invokes effects/mounts under
   StrictMode — a direct flicker source — and the constant re-render seen in the
   logs.
   **Fix:** `client:build` / `client:build:ssr` now run under
   `cross-env NODE_ENV=production … --mode production`. Verified: the dev warning
   string is GONE from the rebuilt bundle (`index-VcIfy7Ms.js`).

2. **Cloudflare Rocket Loader was deferring/rewriting the inline scripts.** The
   timing-critical `APP_SHELL_THEME_SCRIPT` (pre-paint background) and
   `SHELL_REMOVE_SCRIPT` (defines `__vfRemoveShell`/`__vfLog`, dissolves the
   overlay) are inline classic scripts; Rocket Loader turns these into
   `text/rocketscript` and runs them late/out-of-order — so `__vfLog` was
   undefined when the app called it (only `[vf-client]` fallback logs appeared)
   and the overlay/theme timing was broken (the flash). This is ALSO why none of
   the server-side fixes appeared to do anything.
   **Fix:** added `data-cfasync="false"` to all three injected inline scripts
   (bootstrap, theme, shell-remove) so Rocket Loader leaves them alone and they
   run synchronously as intended. Verified present in the served HTML.

**Also discovered:** the running Node server was repeatedly STALE — rebuilds
updated files on disk but the long-running `node dist/index.js` process kept old
code in memory, so server-side fixes were never live. The server must be fully
restarted after each build (kill the process, not just rebuild).
**Recommended:** disable Rocket Loader for the app in the Cloudflare dashboard
(Speed → Optimization → Rocket Loader OFF) — `data-cfasync` covers our scripts but
Rocket Loader can still interfere with others.
**Files:** `package.json` (build scripts), `server/lib/html-bootstrap.ts`
(`data-cfasync` on injected scripts).


### PF-19 — Final resolution + cleanup ✅ DONE
After the debug timeline confirmed each fix, the remaining items were resolved:
- **Blank flash:** the overlay now waits (`fadeWhenReady`) until `#root`'s OWN
  height fills the viewport (≥60vh) before removing — and removes INSTANTLY (no
  260ms cross-fade), so there's no ghosting morph between the skeleton and the
  live page.
- **Sidebar layout shift:** replaced the global custom `::-webkit-scrollbar`
  (which forced classic, space-reserving scrollbars app-wide) and the
  `.sidebar-scroll` custom scrollbar with the OS NATIVE OVERLAY scrollbar — hidden
  until hover/scroll, drawn over content, reserves no width. No shift, and the
  skeleton needs no scrollbar.
- **"Welcome then sidebar" for active-chat users:** the `vf_vg` layout cookie was
  only read INSIDE the `if (chatSeed…)` block, so an empty/slow seed made the
  overlay default to welcome-without-sidebar. Decoupled the cookie read from the
  seed in `buildShellChrome`, so the overlay predicts chat+sidebar from the cookie
  regardless of seed availability.

**Cleanup:** removed all temporary debug instrumentation — deleted
`client/src/lib/vfdebug.ts`, removed `vfdbg`/`__vfLog` calls from `App.tsx`,
`AuthenticatedApp.tsx`, `VeeGPT.tsx`, `ProtectedRoute.tsx`, and stripped the
debug timeline + frame sampler from `SHELL_REMOVE_SCRIPT` (kept the functional
`fadeWhenReady`/`rootReady` gate, instant removal, and `data-cfasync`). Final
build clean; server restarted; served HTML verified to contain no debug strings.

**Operational note:** the production Node server must be fully restarted after
every build — a long-running `node dist/index.js` keeps stale code in memory and
silently serves old server logic. Also recommend disabling Cloudflare Rocket
Loader for the app.


### PF-20 — Realtime metrics socket: endless auth/reconnect loop ✅ FIXED
**Symptom:** `[Realtime] Connection error: Authentication failed` + `Scheduling
reconnect` in a loop; multiple metrics sockets (RealtimeContext, webhook listener,
cache-invalidation, tier-status) churning, which also drove cross-tree re-renders.
**Two server bugs in `server/services/realtime.ts`:**
1. **Auth user lookup.** The handshake middleware resolved the user only via
   `storage.getUserByFirebaseUid(firebaseUid)`. This app's custom-token users have
   `uid === Mongo _id`, and the HTTP/onboarding paths fall back to a by-id lookup;
   the socket didn't, so every connection was rejected → "Authentication failed".
   **Fix:** fall back to `storage.getUser(firebaseUid)` (by id) when the firebaseUid
   lookup misses.
2. **workspaceId required at connect.** `handleConnection` required BOTH `userId`
   AND `workspaceId` and disconnected otherwise — but the workspace is only joined
   later via the `join-workspace` event, so `workspaceId` was always absent at
   connect → immediate disconnect → reconnect loop (logged "missing user or
   workspace info"). **Fix:** require only `userId` to establish the connection;
   join the workspace room when/if provided (clients emit `join-workspace` after
   connect).
**Also:** memoized the `RealtimeContext` value (was recreated every render) to
avoid needless consumer re-renders.
**Verified:** server now logs `🔗 New WebSocket connection: user=…, workspace=
(pending join)` and the sockets stay connected — no more auth-failed/reconnect
spam. Eliminating the 4-socket reconnect churn also removes the cross-tree state
updates that were driving the high re-render frequency.
**Files:** `server/services/realtime.ts`, `client/src/context/RealtimeContext.tsx`.
