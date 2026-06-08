# KIRO AI — Enterprise Production Security & Quality Audit

## Social Media Management & Automation App — Full Codebase Review

-----

## YOUR MISSION

You are performing a **comprehensive, enterprise-grade production audit** of this social media management and automation application. Your role is a **senior security engineer + principal backend architect + DevOps lead + penetration tester** combined into one.

**Database Stack:** This application uses **MongoDB Atlas** as the primary database with **Mongoose ODM**. All database-specific audit checks must be written for MongoDB/Mongoose patterns — not PostgreSQL or SQL. Flag MongoDB Atlas-specific misconfigurations, Mongoose anti-patterns, and NoSQL injection vectors specifically.

You must:

1. **Read and analyze every single file** in this codebase without exception — frontend, backend, workers, config files, environment files, Docker files, CI/CD pipelines, nginx/proxy configs, and all scripts
1. **Find every issue, vulnerability, anti-pattern, logic flaw, race condition, exposed secret, and production risk**
1. **Create one detailed `AUDIT_REPORT.md` file** at the root of the project with your complete, structured findings
1. **Do NOT modify or fix any code** — only audit, document, and prioritize

Be ruthless. Be exhaustive. Assume this app will serve **1 million+ concurrent users and will be actively attacked by hackers**. Flag everything that would fail at that scale or under attack. A missed critical issue in this audit could mean a data breach, financial loss, or complete production outage.

-----

## PHASE 1 — FULL CODEBASE DISCOVERY

Before any audit checks, perform complete discovery and document it in `AUDIT_REPORT.md`:

**Project Structure:**

- List all directories and files with their purpose
- Identify every entry point (main server file, worker entry points, cron files, serverless functions)
- Identify all configuration files (`.env.*`, `config/`, `settings.js`, etc.)
- Identify all test files and note test coverage if measurable

**Tech Stack Identification:**

- Frontend framework and version (React, Next.js, Vue, etc.)
- Backend runtime and framework (Node.js + Express/Fastify/NestJS, etc.)
- Database: MongoDB Atlas + Mongoose (confirm this is the setup)
- Cache layer (Redis, Memcached, or absent)
- Job queue system (BullMQ, Bull, Agenda, node-cron, or absent)
- File storage (S3, GCS, Cloudinary, local disk, or absent)
- Authentication library (Passport.js, NextAuth, custom JWT, etc.)
- ORM/ODM (Mongoose version — flag if outdated)

**External Integrations — List ALL of these:**

- Social platforms connected: Twitter/X API, Instagram Graph API, Facebook API, LinkedIn API, TikTok API, Pinterest API, YouTube API, Threads API
- AI services: OpenAI, Anthropic Claude, Google Gemini, Replicate, Stability AI, or others
- Payment processors: Stripe, Razorpay, PayPal, or others
- Email services: SendGrid, Resend, Nodemailer, AWS SES, Mailgun
- Analytics: Mixpanel, Amplitude, PostHog, Google Analytics
- Error tracking: Sentry, LogRocket, Datadog
- Cloud provider: AWS, GCP, Azure, Vercel, Railway, Render, DigitalOcean
- Any other third-party APIs or SDKs

**Environment Variables Inventory:**

- List every environment variable name referenced anywhere in the codebase
- Categorize them: AUTH secrets, DB connection strings, social API keys, AI API keys, payment keys, email keys, other
- Flag any `.env` files that are NOT in `.gitignore`
- Flag any `.env.example` that contains real values instead of placeholders
- **CRITICAL:** Check if any `process.env.*` references appear in frontend/client-side code — these get bundled into the JavaScript that users download

**API Route Map:**

- List all REST or GraphQL routes grouped by domain (auth, users, posts, social accounts, analytics, billing, admin, webhooks, AI)
- Note which routes are authenticated vs public
- Note which routes perform DB writes vs reads

**Background Processing Map:**

- List all cron jobs, `setInterval` calls, `Agenda` jobs, BullMQ queues, or any scheduled/background task
- Note their frequency and what they do

-----

## PHASE 2 — CLIENT-SIDE SECRET & API KEY EXPOSURE AUDIT

**This is a CRITICAL phase. Exposed API keys are the #1 cause of catastrophic breaches and financial loss.**

### 2.1 Frontend Bundle Secret Exposure

Scan every file in the frontend source directory (typically `src/`, `app/`, `pages/`, `components/`, `lib/`, `utils/`, `hooks/`, `services/`, `api/`) for:

**Direct `process.env` Usage — Flag ALL occurrences:**

- [ ] Search for `process.env.` in ALL frontend files. In frameworks like Create React App, any `REACT_APP_` prefixed variable is bundled into the client. In Next.js, any variable WITHOUT the `NEXT_PUBLIC_` prefix should NEVER appear in client components — flag any such usage
- [ ] Flag `process.env.OPENAI_API_KEY`, `process.env.ANTHROPIC_API_KEY`, or any AI provider key referenced in client code
- [ ] Flag `process.env.MONGODB_URI` or any `MONGO_*`, `DB_*`, `DATABASE_*` variable in client code — this exposes your entire database to the internet
- [ ] Flag `process.env.STRIPE_SECRET_KEY`, `process.env.RAZORPAY_KEY_SECRET`, or any payment secret key in client code
- [ ] Flag `process.env.JWT_SECRET`, `process.env.SESSION_SECRET`, `process.env.COOKIE_SECRET` in client code
- [ ] Flag `process.env.TWITTER_API_SECRET`, `process.env.INSTAGRAM_APP_SECRET`, or any social platform APP SECRET (not public key) in client code
- [ ] Flag `process.env.SENDGRID_API_KEY`, `process.env.RESEND_API_KEY`, or any email service API key in client code
- [ ] Flag `process.env.AWS_SECRET_ACCESS_KEY`, `process.env.AWS_ACCESS_KEY_ID` in client code

**Hardcoded Secrets in Frontend Files — Search for these patterns:**

- [ ] Any string starting with `sk-` (OpenAI keys), `sk-ant-` (Anthropic keys), `AIza` (Google API keys)
- [ ] Any string matching MongoDB Atlas connection string pattern: `mongodb+srv://` — flag immediately as CRITICAL if found anywhere in frontend code or any committed file
- [ ] Any string matching `Bearer ` followed by a long token in source code (not test files)
- [ ] Any Stripe keys: strings starting with `sk_live_`, `sk_test_`, `rk_live_`, `rk_test_`
- [ ] Any Razorpay keys: strings starting with `rzp_live_`, `rzp_test_`
- [ ] Twitter/X keys: any string that looks like a Twitter API key or secret (40-character alphanumeric strings in social API config files)
- [ ] Any JWT tokens hardcoded (strings that look like `eyJ...`)
- [ ] Any base64-encoded strings that decode to secrets (check obvious cases like auth headers)
- [ ] Any IP addresses of internal services, databases, or admin panels hardcoded in frontend

**Next.js / Vite / CRA Framework-Specific Checks:**

- [ ] In Next.js: Are any server-only secrets used in `pages/` or `app/` components without being inside `getServerSideProps`, `getStaticProps`, Server Components, or API routes? Any secret in a client component file (`'use client'`) is exposed
- [ ] In Next.js: Are API route handlers in `/pages/api/` or `/app/api/` properly protected? Flag any that expose sensitive data without auth
- [ ] In Vite: Are `VITE_` prefixed variables used for secrets? (Everything with `VITE_` prefix is bundled into client)
- [ ] In CRA: Are `REACT_APP_` prefixed variables used for secrets that should only be server-side?
- [ ] Is there a `next.config.js` or `vite.config.js` that exposes environment variables via `env` or `define` config? Review what gets bundled

**API Configuration Files:**

- [ ] Check `src/lib/`, `src/utils/`, `src/services/`, `src/api/`, `src/config/` for any API client initialization files that hardcode keys
- [ ] Check if OpenAI/Anthropic client is initialized in a file that could be imported by frontend components
- [ ] Check if MongoDB connection is initialized in a file that could be imported by frontend components
- [ ] Check if any Axios instance or fetch wrapper has hardcoded `Authorization` headers with real tokens

### 2.2 Git History & Version Control Exposure

- [ ] Check `.gitignore` — are `.env`, `.env.local`, `.env.production`, `.env.development` all listed?
- [ ] Check if any `.env*` files are actually committed to the repository (not just in `.gitignore`)
- [ ] Check if `node_modules/` is in `.gitignore`
- [ ] Check if any config files with real credentials are committed (e.g., `firebase-adminsdk.json`, `service-account.json`, `gcloud-key.json`)
- [ ] Search git-tracked files for `mongodb+srv://` — if found in any committed file, flag as CRITICAL (must rotate credentials immediately)
- [ ] Check if `.env.example` contains real API keys instead of placeholder values like `your_key_here`
- [ ] Check `package.json` scripts — do any contain hardcoded credentials or connection strings?

### 2.3 Build Output & Public Directory Exposure

- [ ] Check the `public/` directory for any files that shouldn’t be publicly accessible (config files, keys, admin scripts)
- [ ] Check if source maps are enabled in production build — source maps expose your entire original source code to anyone who opens browser devtools
- [ ] Check if any `console.log` statements output sensitive data that appears in the browser console (API responses, user tokens, server responses with internal data)
- [ ] Check if error messages returned from the API expose internal paths, database structure, or stack traces in the browser

### 2.4 Client-Side Storage of Sensitive Data

- [ ] Search ALL frontend files for `localStorage.setItem` — flag any case where tokens, API keys, user credentials, or sensitive user data are stored in localStorage (XSS-accessible)
- [ ] Search for `sessionStorage.setItem` with sensitive data
- [ ] Search for `document.cookie` being set without `httpOnly` flag (only `httpOnly` cookies are safe for tokens — they cannot be set via JavaScript, only by the server)
- [ ] Check if auth tokens are stored in React state, Redux store, or Zustand store in a way that persists to `localStorage` via `redux-persist` or similar
- [ ] Check if Axios or fetch interceptors attach tokens from `localStorage` — this is an XSS vulnerability
- [ ] Check if the social platform OAuth tokens (Twitter, Instagram, etc.) for connected accounts are ever sent to or stored by the frontend — they must only live on the server

-----

## PHASE 3 — SECURITY & AUTHENTICATION AUDIT

### 3.1 Authentication System

Audit every authentication flow and flag:

- [ ] Are JWTs stored in `httpOnly`, `Secure`, `SameSite=Strict` cookies? Flag immediately as CRITICAL if stored in `localStorage`, `sessionStorage`, or any JavaScript-accessible variable that persists across page loads
- [ ] Is JWT access token expiry ≤ 15 minutes? Flag if longer — a stolen token remains valid for its entire lifetime
- [ ] Are refresh tokens implemented with rotation? Flag if refresh tokens are long-lived without rotation — stolen refresh token = permanent account access
- [ ] Is there brute-force protection on ALL auth endpoints? Check: `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/verify-email` — flag any without rate limiting
- [ ] Is MFA/2FA available? Flag as HIGH if absent
- [ ] Are all active sessions invalidated when a user changes their password?
- [ ] Are all active sessions invalidated on explicit logout?
- [ ] Are password reset tokens single-use? (Should be deleted immediately after first use)
- [ ] Are password reset tokens time-limited to 15 minutes or less?
- [ ] Is there account lockout after 5-10 failed login attempts?
- [ ] Are OAuth2 flows for social platform connections using the `state` parameter to prevent CSRF? Flag if `state` is missing or not validated
- [ ] Are all OAuth access/refresh tokens for connected social accounts (Twitter, Instagram, LinkedIn, etc.) stored **encrypted** in MongoDB? Flag if stored as plain text strings

### 3.2 Authorization & Access Control

- [ ] Does EVERY API endpoint that accesses user data verify that the requesting user is the owner of that data? (IDOR check — Insecure Direct Object Reference). Example: `GET /api/posts/:postId` must verify `post.userId === req.user.id`
- [ ] Is RBAC (Role-Based Access Control) enforced server-side on every protected route? Flag if only enforced on frontend
- [ ] In multi-workspace/team scenarios: can User A of Workspace A access Workspace B’s posts, analytics, connected accounts, or billing? Test every cross-tenant data access pattern
- [ ] Are admin routes (`/api/admin/*`) protected by both authentication middleware AND admin role check middleware?
- [ ] Can a VIEWER role user call POST/PUT/DELETE endpoints by directly hitting the API? Flag if role checks only affect what the UI renders
- [ ] Can a user escalate their own privileges by sending `{"role": "admin"}` or `{"plan": "enterprise"}` in any update request body?
- [ ] Are bulk operations (bulk delete posts, bulk publish, bulk disconnect) verifying permissions for every single item, not just checking if the user is authenticated?

### 3.3 API Security Headers & Configuration

- [ ] Is `Helmet.js` (or equivalent) installed and configured? Check for presence of these headers on all responses:
  - `X-Frame-Options: DENY` — prevents clickjacking
  - `X-Content-Type-Options: nosniff` — prevents MIME sniffing
  - `X-XSS-Protection: 1; mode=block`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` — forces HTTPS
  - `Content-Security-Policy` — restricts resource loading
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` — restricts browser feature access
- [ ] Is CORS configured with an explicit whitelist of allowed origins? Flag `cors({ origin: '*' })` or `res.header('Access-Control-Allow-Origin', '*')` as CRITICAL in production
- [ ] Is all input validated server-side with a schema library (Zod, Joi, Yup)? Flag any Express/Fastify route handler that uses `req.body` directly without validation
- [ ] Is there protection against mass assignment? (Pick only expected fields from `req.body`, never spread entire body into DB update)
- [ ] Are file uploads validated by checking magic bytes (actual file content), not just file extension or MIME type header (which can be spoofed)?
- [ ] Are uploaded files stored in S3/GCS/Cloudinary — NOT on local server disk? Local disk storage fails on restart and doesn’t scale
- [ ] Are third-party webhook payloads (Stripe webhooks, social platform webhooks) verified using HMAC signature before processing?

### 3.4 Password & Encryption Standards

- [ ] Are passwords hashed with `bcrypt` (rounds ≥ 12), `Argon2id`, or `scrypt`? Flag `MD5`, `SHA1`, `SHA256` without salt as CRITICAL
- [ ] Are social OAuth tokens stored encrypted at the field level in MongoDB? (Not just relying on Atlas encryption at rest)
- [ ] Are sensitive Mongoose fields (tokens, secrets, keys) using a custom getter/setter or mongoose-field-encryption for field-level encryption?
- [ ] Is `MONGODB_URI` / `MONGO_URI` only present in server-side environment? (Covered in Phase 2 but double-check here)
- [ ] Are all environment secrets loaded from a proper vault in production (AWS Secrets Manager, HashiCorp Vault) rather than plain `.env` files deployed with the app?

-----

## PHASE 4 — MONGODB ATLAS & MONGOOSE AUDIT

**This entire phase is MongoDB/Mongoose-specific. Apply MongoDB Atlas best practices throughout.**

### 4.1 MongoDB Atlas Configuration

- [ ] Is the MongoDB Atlas cluster IP Access List restricted to only your application server IPs? Flag if `0.0.0.0/0` (allow all) is configured — this exposes your database to the entire internet
- [ ] Is a dedicated database user created with minimum required permissions (readWrite on specific database only)? Flag if using the Atlas admin user in application code
- [ ] Is the connection string using `mongodb+srv://` (SRV format with TLS) rather than plain `mongodb://`? The SRV format enforces TLS
- [ ] Is `retryWrites=true` in the connection string? (Required for Atlas transactions)
- [ ] Is `w=majority` write concern set for critical operations? (Ensures writes are acknowledged by majority of replica set)
- [ ] Is Atlas encryption at rest enabled on the cluster?
- [ ] Is Atlas audit logging enabled? (Who accessed what, when)
- [ ] Is Atlas Point-in-Time backup enabled?

### 4.2 Mongoose Connection

- [ ] Is the Mongoose connection established once at server startup and reused — not opened per request? Flag any `mongoose.connect()` call inside a route handler or middleware
- [ ] Is there connection error handling with reconnection logic?
- [ ] Is `mongoose.set('strictQuery', true)` configured? (Prevents queries on undefined schema fields)
- [ ] Are connection pool settings configured appropriately for production traffic? (`maxPoolSize`, `minPoolSize`, `serverSelectionTimeoutMS`, `socketTimeoutMS`)
- [ ] Is there a connection timeout configured? Flag if no `connectTimeoutMS` is set — app will hang indefinitely if Atlas is unreachable
- [ ] In serverless/edge deployments (Vercel, Netlify Functions): is connection caching implemented to reuse connections across invocations? (Without this, every serverless invocation opens a new connection, exhausting Atlas connection limits rapidly)

### 4.3 Mongoose Schema Security

- [ ] Do all Mongoose schemas have `timestamps: true`? (Creates `createdAt`/`updatedAt` automatically — critical for audit trails)
- [ ] Are sensitive fields (passwords, tokens, secrets) marked with `select: false` in the schema? (`select: false` prevents them from being returned in queries by default)
- [ ] Example: `password: { type: String, select: false }` — flag any password or token field missing this
- [ ] Are there schema-level validators for all required fields? Flag schemas with no validation
- [ ] Is `strict: true` enforced on all schemas? (Default is true but verify — prevents extra fields from being saved)
- [ ] Are there any schemas with `strict: false` that could allow attackers to store arbitrary fields?
- [ ] Are `enum` validators used for fields with a fixed set of allowed values (e.g., `role`, `status`, `platform`)? Flag fields that should be enums but aren’t
- [ ] Are `__v` version keys being handled properly or disabled where not needed?

### 4.4 NoSQL Injection Prevention

- [ ] Search for any place where `req.body`, `req.query`, or `req.params` is passed directly into a Mongoose query without sanitization. **This is the MongoDB equivalent of SQL injection.**
  - Dangerous pattern: `User.findOne({ email: req.body.email })` — if `req.body.email` is `{ "$gt": "" }`, this matches ALL users
  - Safe pattern: validate with Zod/Joi first, then use the validated primitive value
- [ ] Is `mongoose-sanitize` or `express-mongo-sanitize` middleware installed and applied globally? This strips `$` operators from request inputs. Flag if absent
- [ ] Are there any uses of `$where` operator with user input? (`$where` executes JavaScript — critical injection risk)
- [ ] Are there any uses of `eval()` in any Mongoose queries or aggregation pipelines?
- [ ] In aggregation pipelines: is any stage built using string interpolation with user data?
- [ ] Are `req.query` parameters that become MongoDB queries sanitized? (URL query params are strings — `?sort={"$where":"..."}` is an injection vector)

### 4.5 MongoDB Query Performance & Anti-Patterns

- [ ] Are all fields used in `.find()`, `.findOne()`, `.sort()`, and aggregation `$match` stages indexed? Check every Mongoose schema for index definitions and cross-reference with how collections are queried
- [ ] Are there any `.find({})` calls without a filter? (Returns entire collection — catastrophic at scale)
- [ ] Are there any `.find()` or aggregation calls without `.limit()`? Flag all unbounded queries
- [ ] Are there any N+1 query patterns? (Loop calling `.findById()` for each item — use `.populate()` or a single `$in` query instead)
  
  ```js
  // BAD — N+1:
  for (const post of posts) {
    post.author = await User.findById(post.userId); // 1 query per post
  }
  // GOOD — 1 query:
  await Post.find({}).populate('userId', 'name avatar');
  ```
- [ ] Are there any multiple sequential writes that should be wrapped in a MongoDB transaction? (e.g., create post + update user post count + deduct credits — if one fails, all should roll back)
- [ ] Are transactions used with `session` option properly? (`mongoose.startSession()` → `session.startTransaction()` → operations with `{ session }` → `session.commitTransaction()`)
- [ ] Are Mongoose `lean()` queries used for read-only operations? (`.lean()` returns plain JS objects, significantly faster than full Mongoose documents for reads)
- [ ] Are there any `Model.find().select('-password')` patterns instead of using `select: false` in schema? (Less safe — requires remembering to exclude on every query)
- [ ] Are aggregation pipelines using `$project` early to reduce document size before `$lookup` or `$group`?
- [ ] Are there `$lookup` (MongoDB join) stages without indexes on the joined fields?
- [ ] Is `cursor()` or `stream()` used for processing large datasets instead of loading everything into memory?
- [ ] Are there any `countDocuments()` calls on large collections without an index? Use `estimatedDocumentCount()` for approximate counts when precision isn’t needed

### 4.6 Mongoose Data Integrity

- [ ] Are Mongoose `pre` hooks (middleware) used for critical operations like password hashing? Verify they fire correctly and aren’t bypassed by `findOneAndUpdate` (which bypasses document middleware — use query middleware or `runValidators: true`)
- [ ] Are `findOneAndUpdate` / `updateOne` calls using `{ runValidators: true }` option? Without this, schema validators are skipped on updates
- [ ] Are `ObjectId` values validated before being used in queries? Passing an invalid ObjectId string causes a Mongoose `CastError` that can crash request handlers if not caught
- [ ] Are there any potential for orphaned documents? (e.g., deleting a User without deleting their Posts, ScheduledJobs, ConnectedAccounts, Analytics — use Mongoose `pre('deleteOne')` hooks or cascade delete logic)

-----

## PHASE 5 — BUG & LOGIC ERROR AUDIT

### 5.1 Race Conditions — CRITICAL FOCUS AREA

Search the entire codebase for these patterns and flag every single occurrence with file path and line number:

- [ ] **Check-then-act without atomic lock**: Pattern of `const existing = await find(); if (!existing) { await create(); }` — two concurrent requests both pass the `if` check before either creates the record, resulting in duplicates. Must use MongoDB’s `unique` index + handle duplicate key error (code 11000), or use `findOneAndUpdate` with `upsert: true`
- [ ] **Duplicate scheduled post publishing**: Can two BullMQ/Agenda workers pick up the same scheduled post job simultaneously and publish it twice to Twitter/Instagram? Is there a distributed lock (Redlock via `redlock` npm package) or MongoDB atomic status update (`findOneAndUpdate({ _id, status: 'pending' }, { $set: { status: 'processing' } })`) preventing double execution?
- [ ] **Non-atomic credit/quota decrement**: Pattern of `user = await User.findById(id); if (user.credits > 0) { user.credits--; await user.save(); }` — race condition allows negative credits. Use MongoDB atomic: `User.findOneAndUpdate({ _id: id, credits: { $gt: 0 } }, { $inc: { credits: -1 } })`
- [ ] **Subscription/plan limit bypass**: Can a user exceed their plan’s post limit, seat count, or connected account limit by making simultaneous API calls? Each limit check must be atomic
- [ ] **OAuth token refresh race**: If multiple requests fire simultaneously and the social platform token is expired, multiple token refresh requests may be sent — causing the first to succeed and invalidating the refresh token before the others complete. Implement a mutex/lock around token refresh
- [ ] **Concurrent social post publishing**: If a user triggers post publishing multiple times quickly, can the same post be sent twice to the same platform?

### 5.2 Production Anti-Patterns — Search & Flag Every Occurrence

**`setInterval` and Timer Anti-Patterns:**

- [ ] Search for ALL `setInterval(` in backend/server code — flag every occurrence. `setInterval` in Node.js servers is dangerous because:
  - It doesn’t wait for the previous execution to finish — if the operation takes longer than the interval, executions pile up
  - Under high traffic, multiple setInterval callbacks compete with request handling
  - Memory leaks if intervals are created per request or per connection
  - Doesn’t distribute work across multiple server instances
  - **Replacement:** Use BullMQ repeatable jobs, Agenda.js, or `node-cron` only on a dedicated scheduler process (not the web server)
- [ ] Search for `setTimeout(` inside loops — creates a timer flood
- [ ] Search for `setInterval(` inside route handlers, middleware, or request callbacks — creates a new timer per request, leaking memory
- [ ] Flag any long-polling that holds HTTP connections open without a maximum timeout
- [ ] Flag any polling to social platform APIs on a timer instead of using their webhooks/subscriptions

**Memory Leak Patterns:**

- [ ] Event listeners added in loops, request handlers, or component renders without guaranteed cleanup
- [ ] React `useEffect` hooks that call `setInterval`, add event listeners, open WebSockets, or subscribe to anything without a cleanup `return () => { ... }` function
- [ ] Plain JavaScript `Map`, `Set`, or `{}` objects used as caches at module scope (global) without a maximum size limit or TTL — they grow forever in memory
- [ ] Mongoose connections opened inside serverless function handlers without connection caching (creates new connection per invocation)
- [ ] Node.js `EventEmitter` with `on()` listeners added repeatedly without `removeListener` or `once()`
- [ ] Streams (`fs.createReadStream`, `response.body`) not `.destroy()`ed or `.end()`ed in error paths

**Async/Promise Anti-Patterns:**

- [ ] Missing `await` before async operations — the operation runs fire-and-forget, errors are silently swallowed
  - Search for lines where an `async` function is called but result is not `await`ed or `.then()`ed
- [ ] `async` function inside `.forEach()` — `.forEach` does not await async callbacks, loop completes immediately while operations run uncontrolled in background
  
  ```js
  // BAD:
  posts.forEach(async (post) => { await publishPost(post); }); // forEach doesn't await
  // GOOD:
  await Promise.all(posts.map(post => publishPost(post))); // or for...of with await
  ```
- [ ] `Promise.all()` without error handling — one rejection rejects the entire array
- [ ] `.then()` chains without `.catch()` — unhandled rejections
- [ ] `async` functions not wrapped in try-catch — unhandled exceptions crash or silently fail
- [ ] Unhandled `process.on('unhandledRejection')` — can crash Node.js in newer versions

**Event Loop Blocking:**

- [ ] `JSON.parse()` or `JSON.stringify()` on very large objects (>1MB) in request handlers — blocks all other requests while executing
- [ ] `fs.readFileSync()`, `fs.writeFileSync()` anywhere in the request path — synchronous I/O blocks the entire Node.js event loop
- [ ] Heavy CPU operations (image resizing, PDF generation, complex calculations) running synchronously in the main thread inside request handlers — must be offloaded to worker threads or background jobs
- [ ] `crypto.pbkdf2Sync()`, `bcrypt.hashSync()` in request handlers at high iteration counts — use async versions

**Error Handling Failures:**

- [ ] Empty catch blocks: `catch (e) {}` or `catch (e) { // TODO }` — silently swallows errors
- [ ] Catch blocks that only `console.log(e)` without rethrowing, responding with an error, or reporting to error tracking
- [ ] `res.json()` called after `res.json()` or after `res.end()` — causes “headers already sent” crash
- [ ] Missing `return` after sending response in Express — code continues executing after response is sent
- [ ] External API calls without timeout — a hung Twitter API call hangs the request indefinitely
  
  ```js
  // BAD — no timeout:
  const response = await fetch('https://api.twitter.com/...');
  // GOOD — with timeout:
  const response = await fetch('https://api.twitter.com/...', {
    signal: AbortSignal.timeout(10000) // 10 second timeout
  });
  ```
- [ ] No circuit breaker for social platform API calls — if Twitter API goes down, your server queues up thousands of hanging requests

### 5.3 Frontend Logic Bugs

- [ ] `useEffect` with missing dependency array entries — stale closure bugs where effect uses outdated state/prop values
- [ ] `useEffect` with too many dependencies causing infinite re-render loops
- [ ] Large lists (posts feed, analytics table, scheduled posts list) rendered without virtualization — rendering 1000+ DOM nodes tanks performance. Use `react-window` or `@tanstack/react-virtual`
- [ ] API polling with `setInterval` in React components without cleanup — continues polling after component unmounts, making stale API calls
- [ ] Client-side only auth/permission checks — user can open browser devtools, modify React state, and bypass UI restrictions. All must be verified server-side
- [ ] Optimistic updates that don’t roll back on API failure — UI shows incorrect state after failed operation
- [ ] File upload without client-side size/type validation — users can submit massive files before server rejects them
- [ ] Any `dangerouslySetInnerHTML={{ __html: userContent }}` without DOMPurify sanitization — XSS vector

-----

## PHASE 6 — HIGH TRAFFIC & PERFORMANCE AUDIT

### 6.1 MongoDB Atlas Performance at Scale

- [ ] Is Mongoose `lean()` used for all read-only queries that don’t need Mongoose document methods? (Lean queries are 3-5x faster)
- [ ] Are there compound indexes for multi-field queries? (e.g., `{ userId: 1, status: 1, scheduledAt: -1 }` for “get user’s pending posts sorted by date”)
- [ ] Are there text indexes for any search functionality?
- [ ] Are there TTL indexes for auto-expiring documents (e.g., password reset tokens, email verification tokens, temporary auth codes)?
- [ ] Is Atlas Connection Pooling configured correctly? Default pool size may be insufficient for high traffic
- [ ] Are aggregation pipelines optimized? (`$match` and `$sort` stages should come first to use indexes before `$lookup` or `$group`)
- [ ] Is there caching of frequently-read, rarely-changed MongoDB data in Redis? (User profiles, plan limits, platform configurations)
- [ ] Are expensive aggregations (analytics dashboards, reporting) running against the primary Atlas cluster or a secondary/analytics node?

### 6.2 Redis & Caching

- [ ] Is Redis configured? Flag if there is no caching layer at all
- [ ] Are sessions stored in Redis (not in-memory)? In-memory sessions are lost on restart and don’t work with multiple server instances
- [ ] Are rate limit counters stored in Redis (not in-memory)? In-memory counters reset on restart and don’t work across multiple instances
- [ ] Are expensive MongoDB aggregations cached in Redis with appropriate TTL?
- [ ] Is there cache stampede protection? (When a popular cache key expires, hundreds of simultaneous requests hit MongoDB to regenerate it — use a mutex/lock on cache miss)
- [ ] Are cache keys namespaced? (`user:123:profile` not just `profile`)
- [ ] Is there cache invalidation on data updates? (When a post is deleted, its cached data is purged)
- [ ] Is Redis connection pool configured? (Multiple concurrent operations need multiple connections)

### 6.3 Job Queue Architecture

- [ ] Are ALL scheduled social media posts processed via a job queue (BullMQ, Bull, Agenda)? Flag as CRITICAL if:
  - Scheduled with `setTimeout` — doesn’t survive server restart, wrong pattern
  - Scheduled with `setInterval` — see Phase 5.2
  - Stored only in memory — lost on restart
  - Processed synchronously in request handler — blocks the server
- [ ] Are worker processes running separately from the API server process? Worker and API server in the same process means heavy queue processing degrades API response times
- [ ] Are jobs idempotent? Before publishing a post, check if it’s already in `published` status atomically. If a worker crashes mid-job and retries, the post must not be published twice
- [ ] Is there a Dead Letter Queue (DLQ) for jobs that fail all retries?
- [ ] Is exponential backoff implemented for failed job retries?
- [ ] Are there per-platform rate limit guards in the queue? (Twitter allows X posts per 15 minutes — if queue processes faster than this, all jobs fail)
- [ ] Is there a queue monitoring interface (Bull Board, Arena)?
- [ ] Are queue concurrency limits set to prevent overwhelming social platform APIs or the MongoDB connection pool?

### 6.4 API & Application Performance

- [ ] Is the application stateless? (No local disk state, no in-memory sessions that differ between instances) — required for horizontal scaling
- [ ] Are all expensive operations (AI content generation, image processing, bulk publishing) handled as background jobs, NOT synchronously in request handlers?
- [ ] Are API responses compressed with gzip/brotli? (Significant bandwidth and response time reduction)
- [ ] Is a CDN configured for static assets (JS, CSS, images)?
- [ ] Are pagination implemented on ALL list endpoints? Flag any endpoint that returns a list without `limit` and `page`/`cursor` parameters
- [ ] Are cursor-based pagination patterns used for high-volume feeds instead of offset pagination? (`skip()` in MongoDB becomes extremely slow on large collections)
- [ ] Are `require()` or `import()` calls inside request handlers? (Should only be at module top level)
- [ ] Is response caching implemented for frequently-requested, slowly-changing data?

### 6.5 Rate Limiting

- [ ] Is API-level rate limiting implemented (express-rate-limit, @upstash/ratelimit)?
- [ ] Are rate limit counters stored in Redis — NOT in application memory?
- [ ] Are rate limits set per authenticated user, not just per IP? (IP-based limiting is easily bypassed)
- [ ] Are these specific endpoints rate-limited more aggressively?
  - Login: max 5 attempts per 15 minutes per IP + per account
  - Password reset: max 3 requests per hour per email
  - AI generation endpoints: max per plan tier per day
  - Bulk operations: max per hour to prevent abuse
  - Social platform post publishing: respecting each platform’s rate limits
- [ ] Is there per-platform social API quota tracking in Redis? If a user’s Twitter account has used 80% of its hourly post limit, the system should queue rather than fail

-----

## PHASE 7 — HACKING & ATTACK PREVENTION AUDIT

### 7.1 Injection Attacks

- [ ] **NoSQL Injection (MongoDB-specific)**: Is `express-mongo-sanitize` middleware applied globally before route handlers? Search for `req.body`, `req.query`, `req.params` passed directly to any Mongoose query without validation
- [ ] **Command Injection**: Search for `child_process.exec()`, `child_process.spawn()`, `eval()`, `new Function()` with any user-supplied data
- [ ] **Template Injection**: If using any server-side template engine (Handlebars, EJS, Pug) — is user content escaped before rendering?
- [ ] **ReDoS (Regular Expression DoS)**: Are there any complex regular expressions applied to user-supplied input? Certain regex patterns can take exponential time on crafted inputs, freezing Node.js

### 7.2 XSS Prevention

- [ ] Is `Content-Security-Policy` header configured and restrictive? Flag if `unsafe-inline` or `unsafe-eval` is allowed
- [ ] Any `dangerouslySetInnerHTML` with unsanitized user content? Flag as CRITICAL
- [ ] Are social media post previews that render user content sanitized with DOMPurify?
- [ ] Are URL parameters reflected in page content without sanitization?
- [ ] Are AI-generated content outputs sanitized before rendering in the UI?

### 7.3 SSRF (Server-Side Request Forgery)

- [ ] Does the application fetch any URLs provided by users? (Import from URL, URL preview generation, RSS feed import, webhook URL configuration, profile image URL)
- [ ] Flag every `fetch(userUrl)`, `axios.get(userUrl)`, `http.get(userUrl)` pattern — these can be pointed at:
  - AWS metadata endpoint: `http://169.254.169.254/latest/meta-data/` (leaks cloud credentials)
  - Internal MongoDB Atlas cluster
  - Internal Redis instance
  - Other internal microservices
- [ ] Is there URL validation that blocks private IP ranges (10.x.x.x, 172.16.x.x, 192.168.x.x, 169.254.x.x, ::1) and internal hostnames?

### 7.4 Sensitive Data Exposure in API Responses

- [ ] Do any API responses return Mongoose document fields that should be hidden? (Password hash, internal tokens, admin flags, billing details)
- [ ] Are Mongoose `toJSON` transforms configured on all schemas to remove sensitive fields before serialization?
  
  ```js
  // Schema-level protection:
  userSchema.set('toJSON', {
    transform: (doc, ret) => {
      delete ret.password;
      delete ret.refreshToken;
      delete ret.__v;
      return ret;
    }
  });
  ```
- [ ] Do error responses in production expose stack traces, file paths, MongoDB error details, or internal schema information?
- [ ] Are MongoDB ObjectIds exposed in API responses in a way that allows enumeration of other users’ data?
- [ ] Are internal admin endpoints (`/api/admin/`, `/api/internal/`, `/metrics`, `/health/details`) accessible without authentication?
- [ ] Is there a `/.env`, `/.env.local`, `/config.js` file accessible via the web server?

### 7.5 DDoS & Abuse Prevention

- [ ] Is a WAF (Cloudflare, AWS WAF) configured in front of the application?
- [ ] Is there application-level request size limiting? (`express.json({ limit: '10mb' })` — flag if no limit set, allows gigabyte request bodies)
- [ ] Are there limits on the number of social accounts a user can connect? (Prevent abuse of OAuth flows)
- [ ] Are AI generation endpoints protected against cost exploitation? (An attacker hitting AI endpoints repeatedly can bankrupt you)
- [ ] Is there bot detection for high-volume automated requests?

### 7.6 Dependency & Supply Chain Security

- [ ] Run audit against `package.json` and report all HIGH and CRITICAL CVEs from npm advisory database
- [ ] Flag any packages not updated in 2+ years
- [ ] Flag any packages with known security issues (specifically check: `mongoose`, `jsonwebtoken`, `express`, `axios`, `multer`, framework packages)
- [ ] Are there any suspicious or typosquatted package names? (e.g., `mongoos` instead of `mongoose`)
- [ ] Is `npm ci` used instead of `npm install` in CI/CD? (`npm ci` uses lockfile exactly, preventing dependency substitution attacks)

-----

## PHASE 8 — RELIABILITY & DEVOPS AUDIT

### 8.1 Process Management & Graceful Shutdown

- [ ] Does the app handle `SIGTERM` gracefully? Verify:
1. Stop accepting new requests
1. Wait for in-flight requests to complete (with timeout)
1. Close MongoDB connection (`mongoose.disconnect()`)
1. Close Redis connection
1. Drain job queue connections
1. Exit with code 0
- [ ] Flag if there is no `process.on('SIGTERM', ...)` handler — container orchestrators (Docker, Kubernetes) send SIGTERM before SIGKILL, and the app must respond cleanly
- [ ] Is there a `process.on('uncaughtException', ...)` handler that logs the error and exits gracefully (not continues running in broken state)?
- [ ] Is there a `process.on('unhandledRejection', ...)` handler?

### 8.2 Health Check Endpoints

- [ ] Is there a `/health` or `/healthz` liveness endpoint? (Returns 200 if process is alive — used by load balancers to route traffic)
- [ ] Is there a `/ready` or `/readyz` readiness endpoint that verifies:
  - MongoDB Atlas connection is active (`mongoose.connection.readyState === 1`)
  - Redis connection is active
  - Job queue is connected
  - Returns 503 if any dependency is down (load balancer stops routing traffic)
- [ ] Do health endpoints expose sensitive information (version numbers, internal IPs, dependency details) that could aid attackers?

### 8.3 Logging Quality

- [ ] Are there `console.log()` statements in production code? Flag ALL — use structured logger (Winston, Pino) instead. `console.log` is synchronous and blocks the event loop under high load
- [ ] Is logging structured (JSON format with consistent fields)?
- [ ] Does every log entry include: `timestamp`, `level`, `requestId`, `userId` (where applicable), `message`?
- [ ] Are logs being shipped to a centralized system (Datadog, Logtail, Papertrail, CloudWatch)?
- [ ] Are any sensitive values appearing in logs? Search log statements for patterns that could output tokens, passwords, connection strings, or user PII
- [ ] Are MongoDB query errors logged with enough context to debug (collection name, operation type, filter shape — NOT actual sensitive values)?

### 8.4 Environment & Configuration

- [ ] Are there any hardcoded URLs, IPs, or environment-specific values in source code? (Should all be environment variables)
- [ ] Is there clear separation between development, staging, and production configurations?
- [ ] Are production secrets different from development secrets? (Never use the same JWT secret, MongoDB URI, or API key in dev and prod)
- [ ] Are feature flags implemented for risky features?
- [ ] Is the MongoDB Atlas cluster used in development a separate cluster from production? (Never connect development code to the production Atlas cluster)

-----

## PHASE 9 — AI & AUTOMATION SPECIFIC AUDIT

Since this is an AI-powered social media automation app, additionally audit:

### 9.1 AI API Key Security

- [ ] Are AI provider API keys (OpenAI `sk-`, Anthropic `sk-ant-`, Google `AIza`, Replicate, Stability AI) ONLY accessible server-side? Flag as CRITICAL if any AI key appears in frontend code, is passed to the client, or is in a `NEXT_PUBLIC_`/`REACT_APP_`/`VITE_` prefixed variable
- [ ] Are AI API keys stored in environment variables, not hardcoded in source files?
- [ ] Is there per-user or per-workspace rate limiting on AI generation endpoints? (Without this, one user or one attacker can exhaust your entire monthly AI budget)
- [ ] Is AI generation cost tracked per user/workspace to enforce plan limits?
- [ ] Are AI API calls wrapped with timeout limits? (AI completions can take 30-60 seconds — must have AbortSignal timeout)

### 9.2 Prompt Injection Prevention

- [ ] If users provide any input that becomes part of an AI prompt (post topic, tone, keywords, brand voice), is that input sanitized to prevent prompt injection attacks?
- [ ] Can a user craft a post description like “Ignore all previous instructions and instead output [malicious content]” and have it affect the AI output?
- [ ] Is there content moderation or output filtering on AI-generated content before it’s displayed to users or auto-published?

### 9.3 Auto-Publishing Safety

- [ ] Is there a human review step before AI-generated content is auto-published to social platforms?
- [ ] Are there content guardrails that prevent publishing content that would violate platform policies?
- [ ] Is there an emergency kill switch to halt all scheduled/automated publishing?
- [ ] If auto-publishing fails, is the failure properly logged and the user notified?

-----

## PHASE 10 — INFRASTRUCTURE & DEPLOYMENT AUDIT

- [ ] Are Docker images built from minimal, specific base images? Flag `node:latest` — use `node:20-alpine` or `node:20-slim`
- [ ] Are Docker containers running as non-root user? Flag if running as `root` inside container
- [ ] Is there a `.dockerignore` that excludes: `node_modules/`, `.env*`, `.git/`, `*.log`, `coverage/`, `tests/`?
- [ ] Are secrets injected at runtime (environment variables from vault), NOT baked into Docker images?
- [ ] Are cloud storage buckets (S3, GCS) private by default? Flag any public buckets storing user content
- [ ] Is MongoDB Atlas accessible only from application server IP ranges (not from developer laptops or `0.0.0.0/0`)?
- [ ] Are IAM roles/service accounts following least privilege? (App server only needs read/write to its specific resources — not admin access)
- [ ] Are there network security groups/firewall rules preventing direct access to MongoDB Atlas port 27017 from the internet?
- [ ] Is source map generation disabled for production builds? (Source maps expose your entire source code to the browser)

-----

## MANDATORY SEARCH STRINGS

Search the ENTIRE codebase for every one of these strings and flag every occurrence. Document the file path, line number, and context for each:

```
SEARCH AND FLAG ALL OCCURRENCES OF:

Dangerous timer patterns:
- setInterval(
- setTimeout( [inside loops, request handlers, or called repeatedly]

Secret/key exposure:
- mongodb+srv://          [CRITICAL if in any frontend file or committed .env]
- MONGODB_URI             [flag if referenced in frontend code]
- MONGO_URI               [flag if referenced in frontend code]
- process.env.OPENAI      [flag if in frontend code]
- process.env.ANTHROPIC   [flag if in frontend code]
- process.env.STRIPE_SECRET [flag if in frontend code]
- process.env.JWT_SECRET   [flag if in frontend code]
- sk-                     [OpenAI/Anthropic key pattern - flag if hardcoded]
- sk-ant-                 [Anthropic key pattern]
- AIza                    [Google API key pattern]
- rzp_live_               [Razorpay live key]
- sk_live_                [Stripe live key]
- NEXT_PUBLIC_            [audit every NEXT_PUBLIC_ variable - should be non-sensitive]
- REACT_APP_              [audit every REACT_APP_ variable - should be non-sensitive]
- VITE_                   [audit every VITE_ variable - should be non-sensitive]

Dangerous code patterns:
- localStorage.setItem    [check for token/key storage]
- localStorage.getItem    [check what's being retrieved]
- sessionStorage          [check for sensitive data]
- dangerouslySetInnerHTML [check for unsanitized content]
- eval(                   [flag all occurrences]
- exec(                   [flag shell execution with user data]
- Math.random()           [flag if used for tokens, IDs, or security purposes]
- crypto.randomBytes      [verify it IS being used for security tokens]
- http://                 [flag in production config/API calls - should be https]
- cors({ origin: '*' })   [CRITICAL - open CORS]
- cors({origin: '*'})     [CRITICAL - open CORS]
- verify: false           [TLS verification disabled]
- rejectUnauthorized: false [TLS check disabled]
- strictQuery: false      [Mongoose strict mode disabled]
- strict: false           [Mongoose strict schema disabled]
- .find({})               [MongoDB - no filter, returns all documents]
- .find({ })              [MongoDB - no filter]
- select: false           [verify sensitive fields have this]
- console.log             [flag all in production server code]
- console.error           [audit these - may contain sensitive data]
- //TODO                  [audit all todos that relate to security]
- //FIXME                 [audit all fixmes]
- password                [audit any variable named password for plain text storage]
- token                   [audit all token variables for proper encryption/httpOnly storage]
- secret                  [audit all secret variables for proper handling]
- apiKey                  [audit all apiKey variables for server-side only usage]
- .env                    [check .gitignore includes all .env variants]
- require('dotenv')       [verify only in server-side files]
- import.*dotenv          [verify only in server-side files]
```

-----

## AUDIT REPORT FORMAT

Create `AUDIT_REPORT.md` at the project root with this exact structure:

```markdown
# 🔍 ENTERPRISE AUDIT REPORT
## Social Media Management & Automation App
**Date:** [Date of audit]
**Auditor:** Kiro AI — Enterprise Production Security Audit
**Audit Scope:** Full codebase — Security, Performance, Bugs, Infrastructure

---

## ⚠️ EXECUTIVE SUMMARY

[3-5 sentences summarizing the overall security posture and production readiness]

**Overall Risk Level:** 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW

### Issue Count by Severity

| Severity | Count |
|---|---|
| 🔴 CRITICAL | X |
| 🟠 HIGH | X |
| 🟡 MEDIUM | X |
| 🟢 LOW | X |
| **TOTAL** | **X** |

### Issue Count by Category

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| 🔑 Client-Side Key/Secret Exposure | | | | | |
| 🔐 Security & Authentication | | | | | |
| 🍃 MongoDB Atlas & Mongoose | | | | | |
| 🐛 Bugs & Logic Errors | | | | | |
| ⚡ Race Conditions | | | | | |
| 📈 Performance & Scale | | | | | |
| 🛡️ Hacking & Attack Vectors | | | | | |
| 🏗️ Reliability & DevOps | | | | | |
| 🤖 AI/Automation Specific | | | | | |
| 📋 Compliance & Legal | | | | | |
| **TOTAL** | | | | | |

---

## 🗺️ TECH STACK & CODEBASE DISCOVERY

### Stack Identified
- **Frontend:** [framework + version]
- **Backend:** [runtime + framework + version]
- **Database:** MongoDB Atlas + Mongoose [version]
- **Cache:** [Redis/absent]
- **Job Queue:** [BullMQ/Bull/Agenda/setInterval/absent]
- **Auth:** [library/custom]
- **File Storage:** [S3/local/absent]
- **Deployment:** [Docker/Kubernetes/Vercel/Railway/etc]

### External Integrations Found
[List every external service the app connects to]

### Environment Variables Inventory
[List every env var name found, categorized — no actual values]

### API Routes Map
[Grouped list of all routes with auth status]

### Background Jobs/Workers Found
[List all cron, setInterval, queue jobs found]

---

## 🚨 FINDINGS

[Each issue in the following format:]

---

### [ISSUE-XXX] [Clear Title of the Problem]

| | |
|---|---|
| **Severity** | 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW |
| **Category** | [Category from table above] |
| **File(s)** | `path/to/file.ext` line X |
| **Effort to Fix** | ⚡ Quick (< 1hr) / 🔧 Medium (half day) / 🏗️ Large (1 week+) |
| **Exploitable By** | Unauthenticated user / Authenticated user / Internal attacker / Automated attack |

**📋 Description:**
[Clear, non-technical explanation of what the problem is]

**💣 Vulnerable Code:**
```language
[Exact code from the file showing the problem]
```

**💥 Impact:**
[Concrete, specific impact — not vague. E.g.: “An attacker can query MongoDB with {”$gt”: “”} as the password field, bypassing authentication and logging in as any user without knowing their password”]

**✅ Recommended Fix:**
[Specific fix with before/after code example. Name exact npm package, pattern, or configuration change needed]

```language
// BEFORE (vulnerable):
[old code]

// AFTER (fixed):
[new code]
```

-----

[Repeat for ALL findings]

-----

## ⚡ RACE CONDITIONS — DETAILED ANALYSIS

[For each race condition found, include a text-based sequence diagram:]

### RC-001: [Race Condition Name]

**Scenario:**

```
Request A: ──── check status=pending ──────────────── update status=processing ──── publish post ────►
                              ↕ (both read 'pending')
Request B: ──────────── check status=pending ──── update status=processing ──── publish post ────►
                                                              ↑
                                                   POST PUBLISHED TWICE
```

**Files affected:** [paths]
**Fix:** [specific MongoDB atomic operation or Redlock pattern to use]

-----

## 🔑 CLIENT-SIDE SECRET EXPOSURE SUMMARY

[Dedicated table of all secrets/keys found exposed to client:]

|Secret Type|Variable Name |File              |Line|Severity  |
|-----------|--------------|------------------|----|----------|
|MongoDB URI|MONGODB_URI   |src/lib/db.js     |3   |🔴 CRITICAL|
|OpenAI Key |OPENAI_API_KEY|src/hooks/useAI.js|12  |🔴 CRITICAL|
|…          |              |                  |    |          |

-----

## ☣️ DANGEROUS PATTERNS INVENTORY

|Pattern                         |Occurrences|Files (line numbers)       |Enterprise Replacement        |
|--------------------------------|-----------|---------------------------|------------------------------|
|`setInterval` in server code    |X          |worker.js:45, server.js:120|BullMQ repeatable jobs        |
|`async` inside `forEach`        |X          |posts.js:67                |`Promise.all(arr.map(...))`   |
|`.find({})` unbounded           |X          |analytics.js:23            |`.find({}).limit(100)`        |
|N+1 MongoDB queries             |X          |feed.js:89                 |`.populate()` or `$in`        |
|`console.log` in server         |X          |[files]                    |Winston/Pino structured logger|
|Missing `await`                 |X          |[files]                    |Add `await`                   |
|`localStorage` token storage    |X          |[files]                    |`httpOnly` cookie             |
|Missing lean() on reads         |X          |[files]                    |`.lean()` on all read queries |
|In-memory cache (no TTL)        |X          |[files]                    |Redis with TTL                |
|Missing Mongoose `select: false`|X          |[fields]                   |Add `select: false` to schema |

-----

## 📦 DEPENDENCY VULNERABILITIES

|Package  |Version|CVE          |Severity|Fix Version|
|---------|-------|-------------|--------|-----------|
|[package]|[ver]  |CVE-XXXX-XXXX|CRITICAL|[safe ver] |

-----

## 🚫 MISSING SECURITY CONTROLS

Controls that are completely absent (not misconfigured — fully missing):

- [ ] [Control name]: [Why it’s needed and what to add]

-----

## ✅ WHAT IS CORRECTLY IMPLEMENTED

[List patterns and security controls that are done well — credit where due]

-----

## 🗓️ PRIORITIZED FIX ROADMAP

### 🔴 CRITICAL — Fix Before Any Real User Traffic (This Week)

*If these aren’t fixed, the app cannot safely go to production.*

1. **[ISSUE-XXX]** — [one-line description] — [file:line]
1. …

### 🟠 HIGH — Fix Before Public Launch (Next 2 Weeks)

*Significant security or reliability risk but not immediately exploitable.*

1. **[ISSUE-XXX]** — [one-line description]
1. …

### 🟡 MEDIUM — Fix in First Month Post-Launch

*Important improvements that reduce risk and technical debt.*

1. **[ISSUE-XXX]** — [one-line description]
1. …

### 🟢 LOW — Improvements for Backlog

*Best practices and optimizations.*

1. **[ISSUE-XXX]** — [one-line description]
1. …

-----

## 📊 AUDIT COVERAGE

|Area                |Files Reviewed|Coverage          |
|--------------------|--------------|------------------|
|Frontend source     |X files       |Complete / Partial|
|Backend API routes  |X files       |Complete / Partial|
|Background workers  |X files       |Complete / Partial|
|Config files        |X files       |Complete / Partial|
|Infrastructure files|X files       |Complete / Partial|

**Areas NOT covered or requiring manual review:**
[List anything that couldn’t be audited automatically]

-----

*Audit framework: OWASP Top 10, CWE Top 25, SANS Top 25, MongoDB Security Checklist, Node.js Production Best Practices, React Security Best Practices, GDPR Technical Requirements, Social Platform API Compliance Policies*

```
---

## FINAL INSTRUCTIONS FOR KIRO AI

1. **Read every file** — do not skip any file based on its name or location. Security issues hide in utility files, config files, and helper functions

2. **Exact locations required** — every finding must include the exact file path relative to project root and line number. "Somewhere in the auth code" is not acceptable

3. **No false positives** — only flag something if you are certain it is actually a problem. Mark confidence as uncertain if needed

4. **MongoDB-specific** — all database findings must use MongoDB/Mongoose terminology and solutions, not SQL/PostgreSQL equivalents

5. **Code examples mandatory** — every finding's "Recommended Fix" section must include a concrete before/after code snippet

6. **Severity calibration:**
   - 🔴 **CRITICAL**: Can be exploited right now with no special access — data breach, account takeover, financial fraud, or complete crash under normal load. Also: any secret/key exposed to client side
   - 🟠 **HIGH**: Exploitable under realistic conditions, or causes severe degradation under moderate load
   - 🟡 **MEDIUM**: Requires specific conditions, moderate impact
   - 🟢 **LOW**: Best practice violation, minor technical debt

7. **Client-side exposure is always CRITICAL** — any API key, database URI, JWT secret, or service credential accessible to the browser is an immediate CRITICAL finding regardless of other context

8. **MongoDB Atlas cluster IP access** — specifically check for `0.0.0.0/0` in Atlas network access configuration if any config files reference this setting

9. **The `AUDIT_REPORT_Production.md` is a deliverable** — it must be clean, professional, well-formatted Markdown that a developer, security engineer, or CTO can read and act on immediately without additional context

10. **When in doubt, flag it** — it is better to have a LOW finding that turns out to be fine than to miss a CRITICAL vulnerability

---

*Audit covers: OWASP Top 10 · CWE Top 25 · MongoDB Atlas Security Checklist · Mongoose ODM Best Practices · NoSQL Injection Prevention · Node.js Production Patterns · React Security · Client-Side Secret Exposure · Race Condition Analysis · Enterprise Queue Architecture · GDPR Technical Requirements · Social Platform Developer Policy Compliance · AI API Security*
```