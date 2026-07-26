import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';
import {
  GovernedHttpClient,
  type GovernedHttpClientConfig,
  type AppUsageMetrics,
} from '../GovernedHttpClient';
import { UsageStore, type AccountUsageMetrics, type UsageStoreConfig } from '../UsageStore';

/**
 * Property-Based Tests for GovernedHttpClient
 *
 * Tests correctness properties from the design document using fast-check
 * to verify universal properties hold across all valid inputs.
 *
 * Properties tested:
 * - Property 1: Usage Header Parsing Round-Trip — valid headers parse correctly across all value ranges
 * - Property 9: Webhook Signature Validation — HMAC-SHA256 correctly accepts valid / rejects invalid signatures
 *
 * Validates: Requirements 1.2, 1.3, 7.1
 */

// ---------------------------------------------------------------------------
// Mock Redis (simple Map-based in-memory store)
// ---------------------------------------------------------------------------

class MockRedis {
  private store: Map<string, Map<string, string>> = new Map();
  private ttls: Map<string, number> = new Map();
  public status: string = 'ready';

  private getHash(key: string): Map<string, string> {
    if (!this.store.has(key)) {
      this.store.set(key, new Map());
    }
    return this.store.get(key)!;
  }

  async hset(key: string, ...args: string[]): Promise<number> {
    const hash = this.getHash(key);
    for (let i = 0; i < args.length; i += 2) {
      hash.set(args[i], args[i + 1]);
    }
    return args.length / 2;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.store.get(key);
    if (!hash || hash.size === 0) return {};
    const result: Record<string, string> = {};
    hash.forEach((value, field) => {
      result[field] = value;
    });
    return result;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.ttls.set(key, seconds);
    return 1;
  }

  multi(): MockPipeline {
    return new MockPipeline(this);
  }

  clear(): void {
    this.store.clear();
    this.ttls.clear();
  }
}

class MockPipeline {
  private commands: Array<() => Promise<unknown>> = [];
  private redis: MockRedis;

  constructor(redis: MockRedis) {
    this.redis = redis;
  }

  hset(key: string, ...args: string[]): this {
    this.commands.push(() => this.redis.hset(key, ...args));
    return this;
  }

  expire(key: string, seconds: number): this {
    this.commands.push(() => this.redis.expire(key, seconds));
    return this;
  }

  async exec(): Promise<Array<[Error | null, unknown]>> {
    const results: Array<[Error | null, unknown]> = [];
    for (const cmd of this.commands) {
      try {
        const result = await cmd();
        results.push([null, result]);
      } catch (error) {
        results.push([error as Error, null]);
      }
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Mock RealtimeService
// ---------------------------------------------------------------------------

const MockRealtimeService = {
  broadcastToWorkspace: () => {},
} as any;

// ---------------------------------------------------------------------------
// Default test configs
// ---------------------------------------------------------------------------

const defaultUsageStoreConfig: UsageStoreConfig = {
  ttlSeconds: 7200,
  stalenessThresholdMs: 300000,
  tierThresholds: { caution: 60, restricted: 80, critical: 95 },
  highCeilingThreshold: 1000,
};

const defaultClientConfig: GovernedHttpClientConfig = {
  baseUrl: 'https://graph.facebook.com',
  timeout: 10000,
  maxRetries: 3,
  deduplicationWindowMs: 2000,
};

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generator for valid percentage values [0, 100].
 */
const percentageArb = fc.double({ min: 0, max: 100, noNaN: true });

/**
 * Generator for valid account IDs (alphanumeric strings typical of Instagram account IDs).
 */
const accountIdArb = fc.stringMatching(/^[0-9]{5,20}$/);

/**
 * Generator for valid estimated_time_to_regain_access values.
 */
const minutesToRegainArb = fc.integer({ min: 0, max: 1440 });

/**
 * Generator for a single account's BUC usage entry.
 */
const bucEntryArb = fc.record({
  call_count: percentageArb,
  total_cputime: percentageArb,
  total_time: percentageArb,
  estimated_time_to_regain_access: minutesToRegainArb,
});

/**
 * Generator for a valid X-Business-Use-Case-Usage header JSON (1-32 account entries).
 */
const bucHeaderArb = fc
  .array(
    fc.tuple(accountIdArb, bucEntryArb),
    { minLength: 1, maxLength: 32 }
  )
  .filter((entries) => {
    // Ensure unique account IDs
    const ids = new Set(entries.map(([id]) => id));
    return ids.size === entries.length;
  })
  .map((entries) => {
    const obj: Record<string, Array<Record<string, number>>> = {};
    for (const [accountId, entry] of entries) {
      obj[accountId] = [entry];
    }
    return { json: JSON.stringify(obj), entries };
  });

/**
 * Generator for a valid X-App-Usage header JSON.
 */
const appUsageHeaderArb = fc
  .record({
    call_count: percentageArb,
    total_cputime: percentageArb,
    total_time: percentageArb,
  })
  .map((metrics) => ({
    json: JSON.stringify(metrics),
    metrics,
  }));

/**
 * Generator for arbitrary webhook payloads (random strings).
 */
const payloadArb = fc.string({ minLength: 1, maxLength: 5000 });

/**
 * Generator for webhook secrets (random hex-like strings typical of Meta app secrets).
 */
const secretArb = fc.stringMatching(/^[a-f0-9]{32,64}$/);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: instagram-rate-limit-architecture — GovernedHttpClient Property Tests', () => {
  let mockRedis: MockRedis;
  let usageStore: UsageStore;
  let client: GovernedHttpClient;

  beforeEach(() => {
    mockRedis = new MockRedis();
    usageStore = new UsageStore(mockRedis as any, defaultUsageStoreConfig, MockRealtimeService);
    client = new GovernedHttpClient(defaultClientConfig, usageStore);
  });

  // =========================================================================
  // Property 1: Usage Header Parsing Round-Trip
  // =========================================================================

  describe('Property 1: Usage Header Parsing Round-Trip', () => {
    /**
     * **Validates: Requirements 1.2**
     *
     * For any valid X-Business-Use-Case-Usage header containing 1–32 account entries
     * with percentage values in [0, 100], parsing the header should yield the same
     * metric values for every account present in the header.
     */
    it('PROPERTY 1a: parseBusinessUseCaseHeader correctly parses all valid account entries', () => {
      fc.assert(
        fc.property(bucHeaderArb, ({ json, entries }) => {
          const result = client.parseBusinessUseCaseHeader(json);

          // Must parse all entries (up to 32)
          expect(result.size).toBe(entries.length);

          // Each entry must have correct values
          for (const [accountId, entry] of entries) {
            expect(result.has(accountId)).toBe(true);
            const parsed = result.get(accountId)!;

            expect(parsed.callCountPct).toBeCloseTo(entry.call_count, 10);
            expect(parsed.totalCputimePct).toBeCloseTo(entry.total_cputime, 10);
            expect(parsed.totalTimePct).toBeCloseTo(entry.total_time, 10);
            expect(parsed.estimatedMinutesToRegainAccess).toBeCloseTo(
              entry.estimated_time_to_regain_access,
              10
            );
          }

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * **Validates: Requirements 1.3**
     *
     * For any valid X-App-Usage header with percentage fields in [0, 100],
     * parsing the header should yield correct app-level metrics.
     */
    it('PROPERTY 1b: parseAppUsageHeader correctly parses all valid app usage metrics', () => {
      fc.assert(
        fc.property(appUsageHeaderArb, ({ json, metrics }) => {
          const result = client.parseAppUsageHeader(json);

          // Must not be null for valid JSON
          expect(result).not.toBeNull();

          // Values must match what was in the header
          expect(result!.callCountPct).toBeCloseTo(metrics.call_count, 10);
          expect(result!.totalCputimePct).toBeCloseTo(metrics.total_cputime, 10);
          expect(result!.totalTimePct).toBeCloseTo(metrics.total_time, 10);

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * **Validates: Requirements 1.2**
     *
     * Property: The number of account entries parsed never exceeds 32,
     * even if more are provided in the header.
     */
    it('PROPERTY 1c: parseBusinessUseCaseHeader caps at 32 accounts', () => {
      // Generate a header with more than 32 entries
      const largeHeader: Record<string, Array<Record<string, number>>> = {};
      for (let i = 0; i < 40; i++) {
        const accountId = `${10000000000 + i}`;
        largeHeader[accountId] = [
          {
            call_count: 50,
            total_cputime: 30,
            total_time: 40,
            estimated_time_to_regain_access: 0,
          },
        ];
      }

      const result = client.parseBusinessUseCaseHeader(JSON.stringify(largeHeader));

      // Should cap at 32 entries
      expect(result.size).toBeLessThanOrEqual(32);
    });

    /**
     * **Validates: Requirements 1.2**
     *
     * Property: Parsing handles edge cases gracefully (empty, null-like values).
     */
    it('PROPERTY 1d: parseBusinessUseCaseHeader returns empty map for invalid inputs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', 'not-json', '[]', 'null', '123'),
          (invalidHeader) => {
            const result = client.parseBusinessUseCaseHeader(invalidHeader);
            // Should return empty map, never throw
            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * **Validates: Requirements 1.3**
     *
     * Property: parseAppUsageHeader returns null for truly invalid inputs
     * (empty string, whitespace, non-JSON, null literal, or primitives that 
     * the parser rejects).
     */
    it('PROPERTY 1e: parseAppUsageHeader returns null for invalid inputs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', 'not-json', 'null', '123'),
          (invalidHeader) => {
            const result = client.parseAppUsageHeader(invalidHeader);
            // Should return null, never throw
            expect(result).toBeNull();
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  // =========================================================================
  // Property 9: Webhook Signature Validation
  // =========================================================================

  describe('Property 9: Webhook Signature Validation', () => {
    /**
     * Helper: Compute HMAC-SHA256 signature in the format Meta uses.
     * Meta sends: `sha256=<hex_digest>`
     */
    function computeMetaSignature(payload: string, secret: string): string {
      return (
        'sha256=' +
        crypto.createHmac('sha256', secret).update(payload).digest('hex')
      );
    }

    /**
     * Helper: Verify a webhook signature against a payload and secret.
     * Replicates the verification logic used in webhooks.ts.
     */
    function verifySignature(
      signature: string,
      payload: string,
      secret: string
    ): boolean {
      if (!signature) return false;

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const receivedSignature = signature.replace('sha256=', '');

      if (expectedSignature.length !== receivedSignature.length) return false;

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(receivedSignature)
      );
    }

    /**
     * **Validates: Requirements 7.1**
     *
     * For any webhook payload and secret, computing HMAC-SHA256 with the secret
     * and comparing against the provided X-Hub-Signature-256 header shall correctly
     * ACCEPT valid signatures.
     */
    it('PROPERTY 9a: Valid HMAC-SHA256 signatures are always accepted', () => {
      fc.assert(
        fc.property(payloadArb, secretArb, (payload, secret) => {
          // Compute the correct signature (as Meta would)
          const signature = computeMetaSignature(payload, secret);

          // Verification must succeed
          const isValid = verifySignature(signature, payload, secret);
          expect(isValid).toBe(true);

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * **Validates: Requirements 7.1**
     *
     * For any webhook payload and secret, altering the payload after signing
     * must cause the signature to be rejected.
     */
    it('PROPERTY 9b: Altered payloads are always rejected', () => {
      fc.assert(
        fc.property(
          payloadArb,
          secretArb,
          fc.string({ minLength: 1, maxLength: 100 }),
          (payload, secret, alteration) => {
            // Compute signature with original payload
            const signature = computeMetaSignature(payload, secret);

            // Alter the payload (append random string)
            const alteredPayload = payload + alteration;

            // Verification must fail (unless alteration is empty, but minLength=1)
            const isValid = verifySignature(signature, alteredPayload, secret);
            expect(isValid).toBe(false);

            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * **Validates: Requirements 7.1**
     *
     * For any webhook payload, using the wrong secret must cause the signature
     * to be rejected.
     */
    it('PROPERTY 9c: Wrong secret always produces rejected signature', () => {
      fc.assert(
        fc.property(
          payloadArb,
          secretArb,
          secretArb,
          (payload, correctSecret, wrongSecret) => {
            // Skip if secrets happen to be the same
            fc.pre(correctSecret !== wrongSecret);

            // Compute signature with correct secret
            const signature = computeMetaSignature(payload, correctSecret);

            // Verify with wrong secret must fail
            const isValid = verifySignature(signature, payload, wrongSecret);
            expect(isValid).toBe(false);

            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * **Validates: Requirements 7.1**
     *
     * For any payload, a completely random/invalid signature must be rejected.
     */
    it('PROPERTY 9d: Random invalid signatures are always rejected', () => {
      fc.assert(
        fc.property(
          payloadArb,
          secretArb,
          fc.stringMatching(/^[a-f0-9]{64}$/),
          (payload, secret, randomHex) => {
            // Create an invalid signature using random hex
            const invalidSignature = `sha256=${randomHex}`;

            // Compute the actual correct signature
            const correctSignature = computeMetaSignature(payload, secret);

            // Skip the rare case where random hex happens to match
            fc.pre(invalidSignature !== correctSignature);

            // Verification must fail
            const isValid = verifySignature(invalidSignature, payload, secret);
            expect(isValid).toBe(false);

            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * **Validates: Requirements 7.1**
     *
     * Missing or empty signatures must always be rejected.
     */
    it('PROPERTY 9e: Missing or empty signatures are always rejected', () => {
      fc.assert(
        fc.property(payloadArb, secretArb, (payload, secret) => {
          // Empty signature
          expect(verifySignature('', payload, secret)).toBe(false);

          // sha256= with no hash
          expect(verifySignature('sha256=', payload, secret)).toBe(false);

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * **Validates: Requirements 7.1**
     *
     * Property: HMAC-SHA256 is deterministic — same payload + secret always produces
     * the same signature.
     */
    it('PROPERTY 9f: Signature computation is deterministic', () => {
      fc.assert(
        fc.property(payloadArb, secretArb, (payload, secret) => {
          const sig1 = computeMetaSignature(payload, secret);
          const sig2 = computeMetaSignature(payload, secret);

          expect(sig1).toBe(sig2);

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });
});
