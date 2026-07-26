/**
 * Property-Based Tests for New-Post Detection (smart-polling-system).
 *
 * Property 12: New-post detection interval scales with ceiling
 *   For any ceiling classification, `TieredJobScheduler.newPostDetectionInterval`
 *   returns the configured per-ceiling interval, and the LOW-ceiling interval is
 *   greater than or equal to (strictly greater under the documented defaults) the
 *   HIGH-ceiling interval — HIGH-ceiling accounts are polled more frequently.
 *   **Validates: Requirements 8.1, 8.2**
 *
 * Property 13: New-post registration is duplicate-free
 *   For any sequence of detected post IDs (including repeats), registering each
 *   leaves the account's registered-post set containing each ID exactly once:
 *   `registerDiscoveredPosts` returns `newlyRegistered: true` exactly once per
 *   distinct ID and `false` for every repeat. Re-detecting an already-registered
 *   post creates no duplicate registration.
 *   **Validates: Requirements 8.7**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mocks — keep the scheduler pure/in-memory for these properties.
// ---------------------------------------------------------------------------

vi.mock('../realtime', () => ({
  RealtimeService: {
    broadcastToWorkspace: vi.fn(),
  },
}));

vi.mock('../../config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({}),
    getJobs: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  })),
}));

/**
 * In-memory fake Redis that mirrors the SET semantics the registered-post set
 * relies on (SADD returns 1 only when a NEW member is added, 0 for an existing
 * member; SISMEMBER returns 1/0). This lets Property 13 exercise the real
 * `registerDiscoveredPosts` registration logic without a live Redis, since
 * `ioredis-mock` is not a dependency in this repo.
 */
const fakeSets = new Map<string, Set<string>>();

const fakeRedis = {
  sadd: vi.fn(async (key: string, member: string) => {
    let set = fakeSets.get(key);
    if (!set) {
      set = new Set<string>();
      fakeSets.set(key, set);
    }
    if (set.has(member)) {
      return 0; // already a member — no duplicate added
    }
    set.add(member);
    return 1; // newly added
  }),
  sismember: vi.fn(async (key: string, member: string) => {
    return fakeSets.get(key)?.has(member) ? 1 : 0;
  }),
  scard: vi.fn(async (key: string) => fakeSets.get(key)?.size ?? 0),
  status: 'ready',
};

vi.mock('../../lib/redis', () => ({
  getSharedRedisConnection: vi.fn(() => fakeRedis),
}));

// Imported AFTER mocks are declared.
import { TieredJobScheduler } from '../TieredJobScheduler';
import { UsageStore, CeilingClassification } from '../UsageStore';
import { rateLimitConfig, type RateLimitConfig } from '../../config/rateLimitConfig';

const ITERATIONS = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal UsageStore stand-in; the registration paths never touch it. */
const usageStoreStub = {} as UsageStore;

function makeScheduler(config: RateLimitConfig = rateLimitConfig): TieredJobScheduler {
  return new TieredJobScheduler(usageStoreStub, config);
}

/**
 * Build a config whose newPostDetectionMs satisfies highCeiling <= lowCeiling,
 * mirroring the documented default relationship (HIGH polled at least as often
 * as LOW). Other fields are inherited from the real config.
 */
const detectionConfigArb = fc
  .tuple(
    fc.integer({ min: 60_000, max: 8 * 60 * 60_000 }),
    fc.integer({ min: 60_000, max: 8 * 60 * 60_000 })
  )
  .map(([a, b]): RateLimitConfig => {
    const highCeiling = Math.min(a, b);
    const lowCeiling = Math.max(a, b);
    return {
      ...rateLimitConfig,
      smartPolling: {
        ...rateLimitConfig.smartPolling,
        newPostDetectionMs: { highCeiling, lowCeiling },
      },
    };
  });

// ---------------------------------------------------------------------------
// Property 12 — interval scales with ceiling (pure, no Redis)
// ---------------------------------------------------------------------------

describe('Feature: smart-polling-system, Property 12: New-post detection interval scales with ceiling', () => {
  it('returns exactly the configured per-ceiling interval (default config)', () => {
    const { highCeiling, lowCeiling } = rateLimitConfig.smartPolling.newPostDetectionMs;

    expect(
      TieredJobScheduler.newPostDetectionInterval(CeilingClassification.HIGH, rateLimitConfig)
    ).toBe(highCeiling);
    expect(
      TieredJobScheduler.newPostDetectionInterval(CeilingClassification.LOW, rateLimitConfig)
    ).toBe(lowCeiling);
  });

  it('HIGH-ceiling interval is strictly more frequent than LOW under documented defaults (Req 8.1, 8.2)', () => {
    const high = TieredJobScheduler.newPostDetectionInterval(
      CeilingClassification.HIGH,
      rateLimitConfig
    );
    const low = TieredJobScheduler.newPostDetectionInterval(
      CeilingClassification.LOW,
      rateLimitConfig
    );
    expect(high).toBeLessThan(low);
  });

  it('for any config with highCeiling <= lowCeiling, HIGH interval <= LOW interval and both equal config', () => {
    fc.assert(
      fc.property(detectionConfigArb, (config) => {
        const high = TieredJobScheduler.newPostDetectionInterval(
          CeilingClassification.HIGH,
          config
        );
        const low = TieredJobScheduler.newPostDetectionInterval(
          CeilingClassification.LOW,
          config
        );

        // Equals the configured values (no hardcoded literals — Req 8.4).
        expect(high).toBe(config.smartPolling.newPostDetectionMs.highCeiling);
        expect(low).toBe(config.smartPolling.newPostDetectionMs.lowCeiling);

        // HIGH polled at least as frequently as LOW (Req 8.1, 8.2).
        expect(high).toBeLessThanOrEqual(low);
      }),
      { numRuns: ITERATIONS }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13 — duplicate-free registration (in-memory SET fake)
// ---------------------------------------------------------------------------

describe('Feature: smart-polling-system, Property 13: New-post registration is duplicate-free', () => {
  beforeEach(() => {
    fakeSets.clear();
    vi.clearAllMocks();
  });

  it('registering a list of post ids (with duplicates) yields newlyRegistered=true exactly once per distinct id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 8 }),
        // A list of post ids drawn from a small alphabet so duplicates are likely.
        fc.array(
          fc.constantFrom('p1', 'p2', 'p3', 'p4', 'p5'),
          { minLength: 1, maxLength: 30 }
        ),
        async (accountId, postIds) => {
          fakeSets.clear();
          const scheduler = makeScheduler();

          const results = await scheduler.registerDiscoveredPosts(accountId, postIds);

          // One result per input id, in order.
          expect(results).toHaveLength(postIds.length);

          // The first occurrence of each distinct id is newly registered; repeats are not.
          const seen = new Set<string>();
          for (let i = 0; i < postIds.length; i++) {
            const id = postIds[i];
            const expectedNew = !seen.has(id);
            expect(results[i]).toEqual({ postId: id, newlyRegistered: expectedNew });
            seen.add(id);
          }

          // newlyRegistered=true count equals the number of distinct ids.
          const distinct = new Set(postIds);
          const newlyCount = results.filter((r) => r.newlyRegistered).length;
          expect(newlyCount).toBe(distinct.size);

          // The set contains each distinct id exactly once (no duplicates — Req 8.7).
          const isMemberFlags = await Promise.all(
            [...distinct].map((id) => scheduler.isPostRegistered(accountId, id))
          );
          expect(isMemberFlags.every(Boolean)).toBe(true);
          expect(await fakeRedis.scard(`smartpoll:registeredposts:${accountId}`)).toBe(
            distinct.size
          );
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('re-registering an already-registered post is a no-op (newlyRegistered=false, no duplicate)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.integer({ min: 1, max: 10 }),
        async (accountId, postId, repeats) => {
          fakeSets.clear();
          const scheduler = makeScheduler();

          // First registration is new.
          const first = await scheduler.registerDiscoveredPost(accountId, postId);
          expect(first.newlyRegistered).toBe(true);

          // Every subsequent registration of the same id is a no-op.
          for (let i = 0; i < repeats; i++) {
            const again = await scheduler.registerDiscoveredPost(accountId, postId);
            expect(again.newlyRegistered).toBe(false);
          }

          // The set still contains the id exactly once.
          expect(await fakeRedis.scard(`smartpoll:registeredposts:${accountId}`)).toBe(1);
          expect(await scheduler.isPostRegistered(accountId, postId)).toBe(true);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('a Veefore-published post and a later detection of the same id never double-register (Req 8.3, 8.7)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        async (accountId, postId) => {
          fakeSets.clear();
          const scheduler = makeScheduler();

          const published = await scheduler.registerVeeforePost(accountId, postId);
          expect(published.newlyRegistered).toBe(true);

          // Detection later re-observes the same post — must be a no-op.
          const detected = await scheduler.registerDiscoveredPost(accountId, postId);
          expect(detected.newlyRegistered).toBe(false);

          expect(await fakeRedis.scard(`smartpoll:registeredposts:${accountId}`)).toBe(1);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });
});
