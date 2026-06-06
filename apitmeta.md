Build a production-grade Instagram/Facebook publishing and scheduling infrastructure for Veefore using Meta Graph API with scalable architecture, queue system, retry handling, rate limit protection, caching, and intelligent publish verification.

IMPORTANT:
Do NOT implement aggressive polling to Meta APIs every few seconds. The system must be optimized for enterprise-scale API usage and avoid unnecessary Meta API calls.

Tech Stack:

* Node.js + Express + TypeScript
* Redis
* BullMQ
* PostgreSQL or MongoDB
* Webhook-based event system
* Background workers
* Modular service architecture

========================================
CORE REQUIREMENTS
=================

Create a complete scheduling + publishing system with:

1. Scheduled publishing
2. Retry system
3. Publish verification
4. Queue workers
5. Exponential backoff
6. Meta API rate limit protection
7. Cached status system
8. Webhook support
9. Failure recovery
10. Real-time frontend updates via backend only

========================================
DATABASE DESIGN
===============

Create database schemas/models for:

ScheduledPost

* id
* userId
* workspaceId
* platform (instagram/facebook)
* igAccountId
* fbPageId
* mediaType
* caption
* hashtags
* mediaUrls
* thumbnailUrl
* scheduledAt
* timezone
* status
* publishAttempts
* lastError
* metaCreationId
* metaPublishedId
* verifiedPublished
* processingStartedAt
* publishedAt
* failedAt
* retryAt
* createdAt
* updatedAt

PublishJobLog

* id
* scheduledPostId
* jobType
* attemptNumber
* apiResponse
* error
* duration
* createdAt

MetaUsageTracker

* id
* appUsagePercent
* businessUsagePercent
* pageUsagePercent
* lastHeaders
* createdAt

========================================
STATUS SYSTEM
=============

Implement professional publish states:

* scheduled
* queued
* publishing
* processing
* published
* partially_published
* retrying
* failed
* cancelled
* expired

Frontend must always read these statuses from Veefore backend database and NEVER directly from Meta APIs.

========================================
QUEUE SYSTEM
============

Use BullMQ with Redis.

Create separate queues:

1. publishQueue
2. verifyQueue
3. retryQueue
4. failedQueue
5. cleanupQueue

Workers must be isolated and scalable.

Implement concurrency controls.

========================================
PUBLISH FLOW
============

FLOW:

1. User schedules post
2. Save to database
3. Add delayed BullMQ job
4. At scheduled time:

   * create Meta media container
   * publish media
   * store returned IDs
5. Immediately update local DB status
6. Trigger verification queue
7. Notify frontend using websocket/events

========================================
META PUBLISHING
===============

Implement proper Meta Graph API flow:

STEP 1:
POST /{ig-user-id}/media

STEP 2:
POST /{ig-user-id}/media_publish

Support:

* image posts
* reels
* videos
* carousel posts
* Facebook posts

Add proper validation:

* media dimensions
* video duration
* aspect ratios
* unsupported formats
* duplicate media detection

========================================
IMPORTANT:
NO AGGRESSIVE POLLING
=====================

DO NOT poll Meta every 5–10 seconds.

Implement intelligent verification strategy using exponential backoff.

Verification schedule:

Images:

* verify after 20 seconds
* max 1–2 retries

Videos/Reels:

* verify after:

  * 30 sec
  * 1 min
  * 2 min
  * 5 min
  * 10 min

Maximum timeout:
15 minutes

After timeout:

* mark failed
* notify user

========================================
VERIFICATION SYSTEM
===================

Build verification workers that:

1. Fetch media publish status from Meta
2. Detect:

   * success
   * processing
   * failure
   * expired media
3. Update local database
4. Trigger retries if needed
5. Stop verification once published

Use intelligent retry logic.

========================================
EXPONENTIAL BACKOFF
===================

Implement enterprise-grade retry system.

Rules:

* Never retry instantly
* Increase delay after each failure
* Store retry metadata
* Prevent infinite loops

Retry schedule example:

* 30 sec
* 1 min
* 2 min
* 5 min
* 10 min

========================================
RATE LIMIT PROTECTION
=====================

Track Meta headers:

* X-App-Usage
* X-Page-Usage
* X-Business-Use-Case-Usage

Build automatic throttling system.

When usage exceeds:
70%

* reduce non-critical syncs

85%

* delay analytics refreshes

95%

* emergency protection mode

Prevent Meta API abuse.

========================================
CACHING SYSTEM
==============

Use Redis caching.

Rules:

* Frontend reads from local DB/cache
* Never call Meta directly from frontend
* Minimize repeated API calls
* Store temporary publish states
* Cache recent API responses

========================================
WEBHOOK SYSTEM
==============

Implement Meta webhooks for:

* comments
* DMs
* mentions
* messaging
* post updates

Webhook flow:
Meta → Veefore backend

Avoid unnecessary polling wherever possible.

========================================
REAL-TIME FRONTEND
==================

Frontend must:

* poll Veefore backend only
* never poll Meta APIs
* use websocket/SSE updates
* instantly show:

  * publishing
  * processing
  * published
  * failed

Create live UI sync system.

========================================
ERROR HANDLING
==============

Handle all major Meta failures:

* expired token
* revoked permissions
* invalid media
* unsupported format
* Meta temporary outage
* network timeout
* duplicate publish
* inaccessible media URL
* reel processing failure

Store detailed logs.

========================================
OBSERVABILITY
=============

Create admin monitoring system for:

* queue health
* publish success rate
* failed jobs
* retry counts
* API usage
* throttling events
* webhook events
* average publish time

Add structured logging.

========================================
SCALABILITY
===========

Architecture must support:

* thousands of concurrent scheduled posts
* multi-workspace teams
* agency accounts
* high-volume publishing

Optimize for:

* low Meta API usage
* reliability
* fault tolerance
* horizontal scaling

========================================
IMPORTANT ENGINEERING RULES
===========================

1. Meta APIs are NOT the primary database.
2. Veefore database must be the source of truth.
3. Use local state aggressively.
4. Minimize Meta API calls.
5. Use webhooks wherever possible.
6. Never implement aggressive polling loops.
7. Use queues for all heavy operations.
8. Build scalable retry logic.
9. Frontend must never directly depend on Meta API timing.
10. Design like an enterprise SaaS product, not a demo app.

Generate:

* backend architecture
* queue workers
* Redis integration
* BullMQ setup
* TypeScript services
* retry utilities
* verification workers
* webhook handlers
* database models
* API routes
* caching system
* rate limit middleware
* websocket updates
* production-ready implementation
