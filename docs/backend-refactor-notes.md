# Backend Refactor Notes

## General Architecture Notes
- This log tracks major decisions, rollback plans, and critical insights discovered during the refactor.
- Goal: Optimization without functionality regression.
- Essential constraints: Preserve `instagram_smart_polling`, `instagram_direct_service`, analytics, automations.

## Rollback Plans
### Phase 1: Observability & Analysis First
- **Rollback Trigger**: If observability tools introduce performance regression or break existing middleware logic.
- **Action**: Disable observability middleware/feature flags. Restore previous unmonitored code branches.

## Feature Flags
_Add active feature flags here as they are created._

```text
# To be added later:
# ENABLE_REDIS_CACHE
# ENABLE_BULLMQ_WORKERS
# ENABLE_OPTIMIZED_SYNC
# ENABLE_WEBHOOK_FIRST_MODE
# ENABLE_ANALYTICS_SNAPSHOTS
# ENABLE_API_DEDUPLICATION
```

## Discovery & Insights
- Pending...
