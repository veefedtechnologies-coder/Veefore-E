# Veefore Backend Architecture Optimization & API Efficiency Instructions

You are the senior backend architect for Veefore, an AI-powered social media management platform with Instagram integrations, analytics dashboards, automation systems, comment workflows, DM workflows, AI insights, social listening, and scheduling systems.

Your task is to refactor and optimize the ENTIRE backend architecture for:

* API efficiency
* scalability
* reliability
* Meta API compliance
* rate-limit safety
* production-grade performance

CRITICAL:
You MUST preserve ALL existing app functionality.
Do NOT break or remove any existing services, flows, automation logic, or dashboard functionality.

Especially preserve and improve:

* instagram_smart_polling
* instagram_direct_service
* analytics services
* automation workflows
* comment automation
* DM automation
* scheduler systems
* webhook systems
* AI analytics generation
* dashboard data systems

The goal is optimization WITHOUT functionality regression.

---

# CORE ARCHITECTURE REQUIREMENTS

## 1. FRONTEND MUST NEVER DIRECTLY DEPEND ON LIVE META API CALLS

Current goal:
Frontend should read primarily from:

* cached database layer
* sync tables
* Redis cache
* preprocessed analytics tables

NOT directly from Instagram Graph API repeatedly.

Required architecture:

Frontend
→ Internal API
→ Cache Layer / Database
→ Background Workers
→ Meta APIs

NOT:

Frontend
→ Meta API directly

---

# 2. IMPLEMENT CENTRALIZED DATA SYNC ARCHITECTURE

Create centralized sync pipelines for Instagram data.

All Instagram fetching should happen via:

* scheduled workers
* queue jobs
* webhook-triggered updates
* incremental syncs

NOT per-page frontend requests.

Required services:

* instagram_sync_worker
* analytics_refresh_worker
* post_metrics_worker
* engagement_refresh_worker
* profile_refresh_worker

Use BullMQ for all queued jobs.

---

# 3. IMPLEMENT REDIS CACHING LAYER

Add Redis caching for:

* profile insights
* analytics metrics
* dashboard summaries
* post analytics
* engagement calculations
* follower metrics
* AI-generated summaries
* frequently requested data

Cache TTL recommendations:

* profile metrics → 15–30 mins
* analytics dashboards → 30–60 mins
* AI insights → 2–6 hours
* static metadata → 24 hours

Use stale-while-revalidate strategy where appropriate.

---

# 4. PREVENT DUPLICATE API CALLS

Implement request deduplication system.

Requirements:

* identical requests must not trigger duplicate Meta API calls
* concurrent requests should share cached promise/results
* implement request coalescing
* create centralized API request manager

Example:
If 10 dashboard widgets request the same insights simultaneously:
→ ONLY ONE Meta API request should occur.

All others should reuse:

* cached data
* in-flight promise
* DB snapshot

---

# 5. OPTIMIZE instagram_smart_polling SERVICE

The service is important and must remain functional.

Improve it using:

* adaptive polling intervals
* webhook-first architecture
* priority-based sync scheduling
* incremental updates only
* polling cooldowns

Rules:

* active accounts → higher refresh frequency
* inactive accounts → lower refresh frequency
* failed syncs → exponential backoff
* avoid unnecessary full refreshes

Never repeatedly fetch unchanged data.

---

# 6. OPTIMIZE instagram_direct_service

This service is critical and must remain functional.

Requirements:

* centralize all outbound Instagram API calls
* add queue throttling
* add retry logic
* add exponential backoff
* add token validation layer
* add automatic token refresh handling
* implement retry-safe architecture

Must detect:

* rate-limit responses
* expired tokens
* temporary API failures
* webhook duplication

---

# 7. IMPLEMENT GLOBAL RATE LIMIT SYSTEM

VERY IMPORTANT.

Implement rate limiting for:

* Meta API calls
* internal APIs
* automation systems
* AI generation endpoints
* public APIs
* webhook processing
* authentication endpoints

Requirements:

* centralized rate-limit middleware
* Redis-backed distributed rate limiting
* endpoint-specific limits
* user-specific limits
* service-specific throttling

Use:

* sliding window algorithm
  OR
* token bucket algorithm

Suggested protections:

* dashboard refresh spam prevention
* automation abuse prevention
* excessive sync prevention
* DM automation throttling
* comment automation throttling

---

# 8. IMPLEMENT BACKGROUND JOB SYSTEM

All heavy tasks MUST move to BullMQ queues.

Queues required:

* analytics queue
* automation queue
* AI processing queue
* webhook queue
* notification queue
* sync queue
* retry queue

NO heavy processing inside HTTP request lifecycle.

Frontend requests must remain lightweight.

---

# 9. IMPLEMENT WEBHOOK-FIRST ARCHITECTURE

Use Meta webhooks aggressively.

Goal:
Reduce polling dependency.

Use webhooks for:

* comments
* messages
* post updates
* engagement events
* account changes

Webhook events should:
→ enqueue BullMQ jobs
→ update DB/cache
→ notify frontend

NOT trigger massive direct processing inline.

---

# 10. DATABASE OPTIMIZATION

Audit and optimize database architecture.

Requirements:

* proper indexing
* avoid N+1 queries
* normalize repeated data
* optimize analytics queries
* reduce large JSON storage abuse
* implement query batching
* optimize joins
* add pagination everywhere

Create precomputed analytics tables where useful.

---

# 11. IMPLEMENT ANALYTICS SNAPSHOT SYSTEM

Do NOT recalculate analytics repeatedly.

Create snapshot system:

* hourly snapshots
* daily snapshots
* rolling aggregates

Dashboard should primarily read:

* aggregated snapshots
* cached metrics

NOT raw API data repeatedly.

---

# 12. IMPLEMENT OBSERVABILITY & MONITORING

Add:

* structured logging
* error monitoring
* queue monitoring
* API usage monitoring
* rate-limit monitoring
* webhook monitoring

Recommended:

* Sentry
* Bull Board
* Redis monitoring
* API usage dashboards

Track:

* API calls per user
* API calls per service
* failed requests
* queue latency
* retry counts
* cache hit ratio

---

# 13. IMPLEMENT SAFE RETRY SYSTEMS

Retries must:

* avoid infinite loops
* use exponential backoff
* respect Meta API cooldowns
* stop after max attempts

Separate:

* transient failures
* permanent failures

Do NOT aggressively retry rate-limited endpoints.

---

# 14. IMPLEMENT TOKEN MANAGEMENT SYSTEM

Create centralized token manager.

Requirements:

* automatic long-lived token refresh
* token expiry detection
* token health monitoring
* invalid token cleanup
* reconnect workflows

Must avoid token-related API spam.

---

# 15. FRONTEND OPTIMIZATION REQUIREMENTS

Frontend must:

* use paginated requests
* avoid repeated fetches
* implement React Query/SWR caching
* debounce search/filter actions
* batch requests where possible
* lazy-load heavy analytics sections

Avoid:

* fetching all dashboard data on initial load
* duplicate component requests
* unnecessary polling

---


# 16. SECURITY & STABILITY REQUIREMENTS

Implement:

* request validation
* API schema validation
* webhook signature verification
* secure token encryption
* input sanitization
* proper auth middleware
* RBAC protections

Ensure:

* no exposed secrets
* no client-side sensitive logic
* no unsafe API access

---

# 17. FINAL PERFORMANCE GOALS

Target architecture goals:

* minimal Meta API usage
* maximum cache hit ratio
* stable webhook processing
* scalable automation system
* resilient queue architecture
* async-first backend
* low dashboard latency
* no duplicate API calls
* safe rate-limit handling

The system should be capable of scaling to:

* thousands of connected Instagram accounts
* high dashboard traffic
* heavy automation usage
* concurrent sync operations

WITHOUT excessive Meta API usage or rate-limit violations.

---

# FINAL INSTRUCTIONS

IMPORTANT:
Do NOT remove or break any existing Veefore functionality.

Refactor carefully while preserving:

* existing flows
* automations
* analytics behavior
* integrations
* user experience

Prioritize:

1. API efficiency
2. reliability
3. scalability
4. rate-limit safety
5. maintainability
6. Meta compliance

The final architecture should feel enterprise-grade, production-ready, queue-driven, cache-heavy, webhook-first, and highly optimized for Meta API constraints.
