/**
 * Unit Tests for UsageStore
 *
 * Tests TTL expiry, Redis fallback to local memory cache, partial field updates,
 * tier boundary classification, and staleness marking.
 *
 * Requirements validated: 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  UsageStore,
  UsageTier,
  CeilingClassification,
  type AccountUsageRecord,
  type UsageStoreConfig,
} from '../UsageStore';

// ---------------------------------------------------------------------------
// Mock RealtimeService to prevent Socket.IO dependency in tests
// ---------------------------------------------------------------------------
vi.mock('../realtime', () => ({
  RealtimeService: {
    broadcastToWorkspace: vi.fn(),
  },
}));

// Mock logger to avoid console noise
vi.mock('../../config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the shared Redis connection so the lazy-attach fallback in
// isRedisAvailable() does NOT silently pick up a real connection when REDIS_URL
// happens to be set in the test environment. Returning null here makes
// `new UsageStore(null)` genuinely behave as "Redis unavailable".
vi.mock('../../lib/redis', () => ({
  getSharedRedisConnection: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS = { caution: 60, restricted: 80, critical: 95 };

const DEFAULT_CONFIG: UsageStoreConfig = {
  ttlSeconds: 7200,
  stalenessThresholdMs: 300_000, // 5 minutes
  tierThresholds: DEFAULT_THRESHOLDS,
  highCeilingThreshold: 1000,
};

/**
 * Creates a mock Redis object that tracks hset/expire/hgetall calls.
 * Uses status 'ready' to simulate a healthy connection.
 */
function createMockRedis() {
  const store: Record<string, Record<string, string>> = {};
  const ttls: Record<string, number> = {};
  const calls: { method: string; args: unknown[] }[] = [];

  const mockRedis = {
    status: 'ready',
    hset: vi.fn((...args: unknown[]) => {
      const key = args[0] as string;
      if (!store[key]) store[key] = {};
      // hset can receive flat key-value pairs after the key
      const fields = args.slice(1);
      for (let i = 0; i < fields.length; i += 2) {
        store[key][fields[i] as string] = fields[i + 1] as string;
      }
      calls.push({ method: 'hset', args });
      return Promise.resolve(1);
    }),
    expire: vi.fn((key: string, seconds: number) => {
      ttls[key] = seconds;
      calls.push({ method: 'expire', args: [key, seconds] });
      return Promise.resolve(1);
    }),
    hgetall: vi.fn((key: string) => {
      calls.push({ method: 'hgetall', args: [key] });
      return Promise.resolve(store[key] || {});
    }),
    multi: vi.fn(() => {
      const pipeline: { commands: { method: string; args: unknown[] }[] } = { commands: [] };
      const pipelineObj = {
        hset: (...args: unknown[]) => {
          pipeline.commands.push({ method: 'hset', args });
          return pipelineObj;
        },
        expire: (...args: unknown[]) => {
          pipeline.commands.push({ method: 'expire', args });
          return pipelineObj;
        },
        exec: async () => {
          for (const cmd of pipeline.commands) {
            if (cmd.method === 'hset') {
              const key = cmd.args[0] as string;
              if (!store[key]) store[key] = {};
              const fields = cmd.args.slice(1);
              for (let i = 0; i < fields.length; i += 2) {
                store[key][fields[i] as string] = fields[i + 1] as string;
              }
            } else if (cmd.method === 'expire') {
              const key = cmd.args[0] as string;
              ttls[key] = cmd.args[1] as number;
            }
          }
          calls.push({ method: 'multi.exec', args: pipeline.commands });
          return pipeline.commands.map(() => [null, 'OK']);
        },
      };
      return pipelineObj;
    }),
    _store: store,
    _ttls: ttls,
    _calls: calls,
  };

  return mockRedis;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UsageStore — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Tier Boundary Tests (Requirement 2.6)
  // =========================================================================
  describe('determineTier — tier boundary examples', () => {
    it('59% → NORMAL', () => {
      expect(UsageStore.determineTier(59, DEFAULT_THRESHOLDS)).toBe(UsageTier.NORMAL);
    });

    it('60% → CAUTION (inclusive lower bound)', () => {
      expect(UsageStore.determineTier(60, DEFAULT_THRESHOLDS)).toBe(UsageTier.CAUTION);
    });

    it('79% → CAUTION', () => {
      expect(UsageStore.determineTier(79, DEFAULT_THRESHOLDS)).toBe(UsageTier.CAUTION);
    });

    it('80% → RESTRICTED (inclusive lower bound)', () => {
      expect(UsageStore.determineTier(80, DEFAULT_THRESHOLDS)).toBe(UsageTier.RESTRICTED);
    });

    it('94% → RESTRICTED', () => {
      expect(UsageStore.determineTier(94, DEFAULT_THRESHOLDS)).toBe(UsageTier.RESTRICTED);
    });

    it('95% → CRITICAL (inclusive lower bound)', () => {
      expect(UsageStore.determineTier(95, DEFAULT_THRESHOLDS)).toBe(UsageTier.CRITICAL);
    });

    it('0% → NORMAL', () => {
      expect(UsageStore.determineTier(0, DEFAULT_THRESHOLDS)).toBe(UsageTier.NORMAL);
    });

    it('100% → CRITICAL', () => {
      expect(UsageStore.determineTier(100, DEFAULT_THRESHOLDS)).toBe(UsageTier.CRITICAL);
    });
  });

  // =========================================================================
  // Effective Percentage Tests (Requirement 2.6)
  // =========================================================================
  describe('computeEffectivePercentage — max of three metrics', () => {
    it('returns max when callCountPct is highest', () => {
      const record: AccountUsageRecord = {
        accountId: 'acc-1',
        callCountPct: 75,
        totalCputimePct: 40,
        totalTimePct: 30,
        estimatedMinutesToRegainAccess: 0,
        rollingImpressionsEstimate: null,
        lastUpdatedAt: Date.now(),
        ceilingClassification: CeilingClassification.LOW,
      };
      expect(UsageStore.computeEffectivePercentage(record)).toBe(75);
    });

    it('returns max when totalCputimePct is highest', () => {
      const record: AccountUsageRecord = {
        accountId: 'acc-2',
        callCountPct: 10,
        totalCputimePct: 82,
        totalTimePct: 50,
        estimatedMinutesToRegainAccess: 0,
        rollingImpressionsEstimate: null,
        lastUpdatedAt: Date.now(),
        ceilingClassification: CeilingClassification.LOW,
      };
      expect(UsageStore.computeEffectivePercentage(record)).toBe(82);
    });

    it('returns max when totalTimePct is highest', () => {
      const record: AccountUsageRecord = {
        accountId: 'acc-3',
        callCountPct: 20,
        totalCputimePct: 30,
        totalTimePct: 96,
        estimatedMinutesToRegainAccess: 0,
        rollingImpressionsEstimate: null,
        lastUpdatedAt: Date.now(),
        ceilingClassification: CeilingClassification.LOW,
      };
      expect(UsageStore.computeEffectivePercentage(record)).toBe(96);
    });

    it('returns the value when all three are equal', () => {
      const record: AccountUsageRecord = {
        accountId: 'acc-4',
        callCountPct: 55,
        totalCputimePct: 55,
        totalTimePct: 55,
        estimatedMinutesToRegainAccess: 0,
        rollingImpressionsEstimate: null,
        lastUpdatedAt: Date.now(),
        ceilingClassification: CeilingClassification.LOW,
      };
      expect(UsageStore.computeEffectivePercentage(record)).toBe(55);
    });
  });

  // =========================================================================
  // Partial Field Updates (Requirement 2.2)
  // =========================================================================
  describe('updateUsage — partial field updates', () => {
    it('only overwrites fields present in the metrics, preserves others', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      // First write — sets all fields
      await store.updateUsage('acc-partial', {
        callCountPct: 50,
        totalCputimePct: 30,
        totalTimePct: 40,
        estimatedMinutesToRegainAccess: 0,
      });

      // Second write — only updates callCountPct
      await store.updateUsage('acc-partial', {
        callCountPct: 70,
      });

      const record = await store.getUsageRecord('acc-partial');
      expect(record).not.toBeNull();
      expect(record!.callCountPct).toBe(70); // updated
      expect(record!.totalCputimePct).toBe(30); // preserved
      expect(record!.totalTimePct).toBe(40); // preserved
    });

    it('updates lastUpdatedAt on every write', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      const before = Date.now();
      await store.updateUsage('acc-ts', { callCountPct: 10 });
      const record = await store.getUsageRecord('acc-ts');

      expect(record).not.toBeNull();
      expect(record!.lastUpdatedAt).toBeGreaterThanOrEqual(before);
      expect(record!.lastUpdatedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  // =========================================================================
  // Redis Fallback to Local Memory Cache (Requirement 2.4)
  // =========================================================================
  describe('Redis fallback — local memory cache', () => {
    it('writes and reads from local cache when redis is null', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      await store.updateUsage('acc-local', {
        callCountPct: 45,
        totalCputimePct: 20,
        totalTimePct: 30,
      });

      const record = await store.getUsageRecord('acc-local');
      expect(record).not.toBeNull();
      expect(record!.callCountPct).toBe(45);
      expect(record!.totalCputimePct).toBe(20);
      expect(record!.totalTimePct).toBe(30);
    });

    it('returns Caution tier for unknown accounts when Redis unavailable', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      const result = await store.getEffectiveUsage('unknown-account');
      expect(result.tier).toBe(UsageTier.CAUTION);
      expect(result.isStale).toBe(true);
      expect(result.percentage).toBe(0);
    });

    it('returns Normal tier (not Caution) for unknown accounts when Redis IS available', async () => {
      // Regression guard: an account with no usage record but a live Redis must
      // default to NORMAL, not CAUTION. Defaulting to CAUTION deadlocks smart
      // polling — background polling is blocked in CAUTION, and only a
      // successful poll writes a fresh usage record, so the account would stay
      // CAUTION forever once its 2h TTL expired.
      const fakeRedis = {
        hgetall: async () => ({}), // no record stored
      } as any;
      const store = new UsageStore(fakeRedis, DEFAULT_CONFIG);

      const result = await store.getEffectiveUsage('unknown-account');
      expect(result.tier).toBe(UsageTier.NORMAL);
      expect(result.isStale).toBe(true);
      expect(result.percentage).toBe(0);
    });

    it('returns LOW ceiling classification for unknown accounts', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      const classification = await store.getCeilingClassification('unknown-account');
      expect(classification).toBe(CeilingClassification.LOW);
    });
  });

  // =========================================================================
  // TTL Expiry Behavior (Requirement 2.5)
  // =========================================================================
  describe('TTL expiry — Redis expire calls', () => {
    it('sets TTL on the Redis key when updating usage', async () => {
      const mockRedis = createMockRedis();
      const store = new UsageStore(mockRedis as unknown as any, DEFAULT_CONFIG);

      await store.updateUsage('acc-ttl', { callCountPct: 25 });

      // Verify that expire was called with the correct TTL
      const expireCalls = mockRedis._calls.filter(
        (c) => c.method === 'multi.exec'
      );
      expect(expireCalls.length).toBeGreaterThan(0);

      // The pipeline should have set the TTL
      expect(mockRedis._ttls['usage:acc-ttl']).toBe(7200);
    });

    it('sets TTL when escalating to critical', async () => {
      const mockRedis = createMockRedis();
      const store = new UsageStore(mockRedis as unknown as any, DEFAULT_CONFIG);

      await store.escalateToCritical('acc-ttl-critical', 30);

      expect(mockRedis._ttls['usage:acc-ttl-critical']).toBe(7200);
    });

    it('uses configured TTL value (not default) when provided', async () => {
      const customConfig: UsageStoreConfig = {
        ...DEFAULT_CONFIG,
        ttlSeconds: 3600, // 1 hour instead of 2
      };
      const mockRedis = createMockRedis();
      const store = new UsageStore(mockRedis as unknown as any, customConfig);

      await store.updateUsage('acc-custom-ttl', { callCountPct: 10 });

      expect(mockRedis._ttls['usage:acc-custom-ttl']).toBe(3600);
    });
  });

  // =========================================================================
  // Staleness Detection (Requirement 2.3)
  // =========================================================================
  describe('staleness marking — lastUpdatedAt > 5 minutes', () => {
    it('marks record as stale when lastUpdatedAt is older than stalenessThresholdMs', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      // Write a record with known timestamp
      await store.updateUsage('acc-stale', { callCountPct: 40 });

      // Advance time beyond staleness threshold (5 minutes = 300,000 ms)
      const sixMinutesMs = 6 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + sixMinutesMs);

      const result = await store.getEffectiveUsage('acc-stale');
      expect(result.isStale).toBe(true);
      // Data is stale but usable — not treated as zero
      expect(result.percentage).toBe(40);
      expect(result.tier).toBe(UsageTier.NORMAL);
    });

    it('marks record as NOT stale when lastUpdatedAt is within threshold', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      await store.updateUsage('acc-fresh', { callCountPct: 55 });

      // Only 1 minute has passed
      const oneMinuteMs = 1 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + oneMinuteMs);

      const result = await store.getEffectiveUsage('acc-fresh');
      expect(result.isStale).toBe(false);
      expect(result.percentage).toBe(55);
    });

    it('stale records are still usable — not zero', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      await store.updateUsage('acc-stale-usable', {
        callCountPct: 85,
        totalCputimePct: 70,
        totalTimePct: 60,
      });

      // 10 minutes pass — well beyond 5 minute threshold
      const tenMinutesMs = 10 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + tenMinutesMs);

      const result = await store.getEffectiveUsage('acc-stale-usable');
      expect(result.isStale).toBe(true);
      // Still returns correct tier based on real data (not zeroed)
      expect(result.percentage).toBe(85);
      expect(result.tier).toBe(UsageTier.RESTRICTED);
    });
  });

  // =========================================================================
  // Ceiling Classification (Requirements 3.2, 3.3)
  // =========================================================================
  describe('classifyCeiling — static function', () => {
    it('classifies as HIGH when impressions above threshold', () => {
      expect(UsageStore.classifyCeiling(1500, 1000)).toBe(CeilingClassification.HIGH);
    });

    it('classifies as LOW when impressions below threshold', () => {
      expect(UsageStore.classifyCeiling(500, 1000)).toBe(CeilingClassification.LOW);
    });

    it('classifies as LOW when impressions is null (new account)', () => {
      expect(UsageStore.classifyCeiling(null, 1000)).toBe(CeilingClassification.LOW);
    });

    it('classifies as HIGH when impressions exactly at threshold', () => {
      expect(UsageStore.classifyCeiling(1000, 1000)).toBe(CeilingClassification.HIGH);
    });
  });

  // =========================================================================
  // escalateToCritical (Requirement 1.9)
  // =========================================================================
  describe('escalateToCritical', () => {
    it('sets all percentages to 100 and records minutes to regain', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      // Start with normal usage
      await store.updateUsage('acc-escalate', {
        callCountPct: 20,
        totalCputimePct: 15,
        totalTimePct: 10,
      });

      // Escalate
      await store.escalateToCritical('acc-escalate', 45);

      const record = await store.getUsageRecord('acc-escalate');
      expect(record).not.toBeNull();
      expect(record!.callCountPct).toBe(100);
      expect(record!.totalCputimePct).toBe(100);
      expect(record!.totalTimePct).toBe(100);
      expect(record!.estimatedMinutesToRegainAccess).toBe(45);

      const result = await store.getEffectiveUsage('acc-escalate');
      expect(result.tier).toBe(UsageTier.CRITICAL);
      expect(result.percentage).toBe(100);
    });
  });

  // =========================================================================
  // Impressions Estimate Update (Requirement 3.1)
  // =========================================================================
  describe('updateImpressionsEstimate', () => {
    it('updates impressions and ceiling classification via local cache', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      // Create a record first
      await store.updateUsage('acc-impr', { callCountPct: 10 });

      // Update impressions
      await store.updateImpressionsEstimate('acc-impr', 5000);

      const record = await store.getUsageRecord('acc-impr');
      expect(record).not.toBeNull();
      expect(record!.rollingImpressionsEstimate).toBe(5000);
      expect(record!.ceilingClassification).toBe(CeilingClassification.HIGH);
    });

    it('creates a new record if account does not exist in local cache', async () => {
      const store = new UsageStore(null, DEFAULT_CONFIG);

      await store.updateImpressionsEstimate('acc-new-impr', 200);

      const record = await store.getUsageRecord('acc-new-impr');
      expect(record).not.toBeNull();
      expect(record!.rollingImpressionsEstimate).toBe(200);
      expect(record!.ceilingClassification).toBe(CeilingClassification.LOW);
    });
  });

  // =========================================================================
  // Redis Mock — Atomic Operations (Requirement 2.7)
  // =========================================================================
  describe('Redis atomic operations', () => {
    it('uses MULTI/EXEC pipeline for updateUsage', async () => {
      const mockRedis = createMockRedis();
      const store = new UsageStore(mockRedis as unknown as any, DEFAULT_CONFIG);

      await store.updateUsage('acc-atomic', {
        callCountPct: 55,
        totalTimePct: 40,
      });

      // Verify multi was called (atomic pipeline)
      expect(mockRedis.multi).toHaveBeenCalled();

      // Verify data was stored correctly
      const redisData = mockRedis._store['usage:acc-atomic'];
      expect(redisData).toBeDefined();
      expect(redisData['call_count_pct']).toBe('55');
      expect(redisData['total_time_pct']).toBe('40');
      expect(redisData['last_updated_at']).toBeDefined();
    });

    it('stores only specified fields (partial update) in Redis', async () => {
      const mockRedis = createMockRedis();
      const store = new UsageStore(mockRedis as unknown as any, DEFAULT_CONFIG);

      // First full write
      await store.updateUsage('acc-partial-redis', {
        callCountPct: 30,
        totalCputimePct: 20,
        totalTimePct: 10,
      });

      // Second partial write — only callCountPct
      await store.updateUsage('acc-partial-redis', {
        callCountPct: 60,
      });

      const redisData = mockRedis._store['usage:acc-partial-redis'];
      expect(redisData['call_count_pct']).toBe('60'); // updated
      expect(redisData['total_cputime_pct']).toBe('20'); // preserved from first write
      expect(redisData['total_time_pct']).toBe('10'); // preserved from first write
    });
  });
});
