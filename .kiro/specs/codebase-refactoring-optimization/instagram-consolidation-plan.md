# Instagram API Consolidation Plan

**Task:** 9.1 Analysis Complete  
**Report:** See `instagram-api-duplication-report.md` for full analysis

---

## Quick Summary

### Current State
- **File 1:** `server/services/instagramApi.ts` (995 lines)
- **File 2:** `server/instagram-api.ts` (780 lines)
- **Total:** 1,775 lines
- **Duplication:** 60-70% functional overlap

### Target State
- **Consolidated Services:** ~1,100 lines
- **Reduction:** 675 lines (38%)
- **Structure:** Feature-based service modules

---

## Consolidation Architecture

```
server/features/instagram/
├── services/
│   ├── instagram.service.ts              [100 lines] Main facade
│   ├── instagram-auth.service.ts         [250 lines] OAuth & tokens
│   ├── instagram-insights.service.ts     [600 lines] Analytics & data
│   ├── instagram-publishing.service.ts   [400 lines] Media publishing
│   └── instagram-api-client.ts           [150 lines] HTTP client
├── repositories/
│   └── instagram.repository.ts           [100 lines] Data access
└── types/
    └── instagram.types.ts                [100 lines] Type definitions

Total: ~1,700 lines (includes service overhead)
Net reduction: 275 lines from duplicated logic removal
```

---

## Source of Truth Decision

### Primary Service: `instagramApi.ts`
**Reasons:**
1. ✅ More comprehensive insights and analytics
2. ✅ Better error handling with retry logic
3. ✅ Batch operations for performance
4. ✅ Already used by instagram-api.ts (delegation pattern exists)
5. ✅ Sophisticated rate limiting

### Preserve from `instagram-api.ts`
1. ✅ Complete OAuth authentication flow
2. ✅ Media publishing operations (photos, videos, reels, stories)
3. ✅ Video compression integration
4. ✅ Request deduplication and caching
5. ✅ Comment and community management

---

## Key Duplication Areas

### 1. Account Information (90% overlap)
- **Both files:** Fetch account profile data
- **Consolidation:** Keep instagramApi.ts implementation + add caching from instagram-api.ts

### 2. Media Retrieval (60% overlap)
- **instagram-api.ts:** Already delegates to instagramApi.ts
- **Consolidation:** Remove wrapper, use instagramApi.ts directly

### 3. Insights Operations (30% overlap - already mostly consolidated)
- **instagram-api.ts:** Already delegates to instagramApi.ts
- **Consolidation:** Remove delegation wrappers

### 4. Token Management (50% overlap)
- **Different focuses:** Validation vs. Exchange
- **Consolidation:** Merge into single auth.service

---

## Implementation Tasks

### Week 3 (Tasks 9.2 - 9.6)
- **Day 1:** Create unified HTTP client with rate limiting, retry, deduplication, caching
- **Day 2:** Extract authentication service (OAuth, token management)
- **Day 3:** Extract insights service (analytics, metrics, demographics)
- **Day 4:** Extract publishing service (photos, videos, reels, stories)
- **Day 5:** Consolidate type definitions

### Week 4 (Tasks 9.7 - 9.9)
- **Day 1:** Create main service facade
- **Day 2:** Update 20-30 import references across codebase
- **Day 3-5:** Testing and validation (70% coverage target)

---

## Risk Mitigation

### Strategies
1. **Feature Flags:** Gradual rollout of new service
2. **Parallel Implementation:** Keep both services running initially
3. **Integration Tests:** Comprehensive coverage before migration
4. **Rollback Plan:** Maintain old files until validated in production

### Risk Levels
- ✅ **Low Risk:** Insights operations (already delegated)
- ⚠️ **Medium Risk:** Auth flow, publishing operations (core functionality)
- 🔴 **High Risk:** None identified

---

## Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Total Lines | 1,775 | 1,100 |
| Code Duplication | ~60% | <10% |
| Test Coverage | Unknown | 70% |
| API Performance | Current | Same or better |
| Import Complexity | 2 files | 1 unified |

---

## Function Distribution

### To instagram-insights.service.ts (600 lines)
- getAccountInfo, getAccountInsights, getBatchAccountInsights
- getUserMedia, getUserStories
- getMediaInsights, getBatchMediaInsights
- getRecentMediaWithInsights, getComprehensiveMetrics

### To instagram-auth.service.ts (250 lines)
- generateAuthUrl, exchangeCodeForToken, getLongLivedToken
- refreshAccessToken, validateToken
- isInstagramGraphCompatible, isFacebookGraphCompatible

### To instagram-publishing.service.ts (400 lines)
- publishPhoto, publishReel, publishVideo, publishStory
- publishVideoWithCompression
- addComment, pinComment

### To instagram-api-client.ts (150 lines)
- Rate limiting (enforceRateLimit)
- Request handling with retry (makeApiRequest)
- Request deduplication integration
- Cache integration
- Error transformation

---

## Next Actions

1. ✅ **Task 9.1:** Analysis complete (this document)
2. ⏭️ **Task 9.2:** Start creating unified HTTP client
3. Review and approve consolidation plan with team
4. Set up feature flag for gradual rollout
5. Create integration test suite baseline

---

## References

- **Full Analysis:** `instagram-api-duplication-report.md`
- **Requirements:** Requirements 3.1, 3.3, 9.1-9.6 in requirements.md
- **Design:** Section on Instagram Integration Consolidation in design.md
