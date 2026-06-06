# Backend Refactor Checklist

## Phase 1: Observability & Analysis First
- [x] add logging
- [x] add API usage monitoring
- [x] track Meta API call counts
- [x] track duplicate requests
- [x] track response times
- [x] identify highest-cost endpoints
- [x] identify duplicate sync behavior
- [x] Deliverable: monitoring dashboard
- [x] Deliverable: API usage metrics
- [x] Deliverable: duplicate request report
- [x] Deliverable: bottleneck report
- [x] Validation: confirm no functionality changed
- [x] Validation: confirm metrics collection works

## Phase 2: Request Deduplication
- [x] create centralized request manager
- [x] map `[API_ENDPOINT + PARAMS] -> Promise`
- [x] implement in-flight request waiting
- [x] apply to Insights polling
- [x] apply to Profile syncs
- [x] Deliverable: duplicate request metric drops significantly
- [x] Validation: confirm no functionality changed
- [x] Validation: confirm data remains accurate for all callers

## Phase 3: Redis Cache Layer
- [x] integrate Redis
- [x] handle connection drops (fallback to direct fetch)
- [x] set TTLs (Time to Live) for different data types
- [x] cache Insights
- [x] cache Profile data
- [x] Validation: confirm frontend behavior unchanged
- [x] Validation: confirm no broken refresh logic

## Phase 4: BullMQ Queue System
- [ ] install BullMQ
- [ ] create worker architecture
- [ ] move analytics processing to queues
- [ ] move sync jobs to queues (analytics refresh jobs only first)
- [ ] Validation: confirm queues process correctly
- [ ] Validation: confirm no lost jobs
- [ ] Validation: confirm dashboard stability

## Phase 5: Background Sync Architecture
- [ ] create centralized sync workers
- [ ] implement scheduled sync jobs
- [ ] create incremental sync logic
- [ ] Validation: compare Meta API usage reduction
- [ ] Validation: confirm dashboard data accuracy
- [ ] Validation: confirm sync reliability

## Phase 6: Optimize instagram_smart_polling
- [ ] adaptive polling
- [ ] webhook-priority logic
- [ ] incremental syncs
- [ ] cooldown systems
- [ ] activity-aware scheduling
- [ ] Validation: polling frequency reduced
- [ ] Validation: no missing data
- [ ] Validation: automation still works
- [ ] Validation: engagement updates still reliable

## Phase 7: Optimize instagram_direct_service
- [ ] retry system
- [ ] backoff system
- [ ] token validation
- [ ] request throttling
- [ ] rate-limit handling
- [ ] Validation: no broken Instagram functionality
- [ ] Validation: proper retry behavior
- [ ] Validation: reduced API failures

## Phase 8: Webhook-First Architecture
- [ ] webhook event processing
- [ ] queue-based webhook handling
- [ ] event-driven updates
- [ ] Validation: webhooks reliable
- [ ] Validation: reduced polling traffic
- [ ] Validation: no duplicate event processing

## Phase 9: Rate Limit System
- [ ] Redis-backed rate limiter
- [ ] endpoint-level throttling
- [ ] user-level throttling
- [ ] automation throttling
- [ ] Validation: legitimate traffic unaffected
- [ ] Validation: abuse traffic blocked
- [ ] Validation: no workflow breakage

## Phase 10: Database Optimization
- [ ] indexing
- [ ] query optimization
- [ ] pagination
- [ ] aggregation optimization
- [ ] analytics snapshots
- [ ] Validation: query performance improved
- [ ] Validation: dashboard accuracy preserved
- [ ] Validation: no data corruption
