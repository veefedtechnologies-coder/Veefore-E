/**
 * Tests for the `autopilot-publish` worker (ACT stage — publish execution, Task 14.2).
 *
 * Unit tests pin the design + requirements:
 *   - Publishes a claimed slot via the injected publisher and flips content +
 *     slot to `published` on success (R12.1 · Property 1).
 *   - Audits EVERY attempt with its outcome + timestamp (R12.4).
 *   - Retries a failing publish up to 3 times with 30s→300s backoff (R12.3),
 *     waiting between attempts (verified through an injected sleep).
 *   - A publish that overruns the 60s deadline counts as a failed attempt (R12.1).
 *   - On exhaustion it marks content + slot `failed` (slot left unpublished) and
 *     raises an Escalation + User_Input_Notification (R12.5 · Property 1).
 *   - A slot that is not claimable is a no-op (R12.7).
 *
 * Property test (fast-check):
 *   - Property 8 (never double-publish): across any number of concurrent /
 *     duplicated jobs for the same content, at most one publish and one
 *     `markPublished` ever happen, because the claim is atomic (R12.7).
 *
 * All I/O is faked (atomic in-memory content store, spy slot store, scripted
 * publisher, spy audit service, spy dispatcher), so the claim → publish → retry
 * → resolve flow — including the no-double-publish property — is verified without
 * Redis, Mongo, or a live Instagram API.
 *
 * Satisfies Requirements: 12.1, 12.3, 12.4, 12.5, 12.7 (Property 1, 8)
 */

import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import {
  createPublishJobProcessor,
  DEFAULT_RETRY_DELAYS_MS,
  MAX_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  PUBLISH_TIMEOUT_MS,
  type AutopilotPublishJobData,
  type PublishContentStore,
  type PublishSlotStore,
  type Publisher,
  type PublishableContent,
  type PublishResult,
  type PublishWorkerDeps,
  type EscalationTargetResolver,
} from './autopilotPublishWorker'

// --- Fakes ------------------------------------------------------------------

const CONTENT: PublishableContent = {
  accountId: 'acct-1',
  accessToken: 'token-abc',
  content: 'A grounded caption',
  mediaFiles: [{ url: 'https://cdn.example/x.jpg', type: 'photo' }],
  hashtags: '#a #b',
  postType: 'post',
}

/**
 * An atomic in-memory content store. `claimForPublishing` mutates the claimed
 * set synchronously (before any await), so even concurrently-invoked calls can
 * only claim a given content once — the exact guarantee Property 8 relies on.
 */
function makeContentStore(content: PublishableContent | null = CONTENT) {
  const claimed = new Set<string>()
  const published: Array<{ contentId: string; postId?: string }> = []
  const failed: Array<{ contentId: string; error: string }> = []
  const claimCalls: string[] = []
  const store: PublishContentStore = {
    async claimForPublishing(contentId) {
      claimCalls.push(contentId)
      if (content === null) return null
      if (claimed.has(contentId)) return null // already claimed — no double-publish
      claimed.add(contentId)
      return content
    },
    async markPublished(contentId, postId) {
      published.push({ contentId, postId })
    },
    async markFailed(contentId, error) {
      failed.push({ contentId, error })
    },
  }
  return { store, published, failed, claimCalls }
}

function makeSlotStore() {
  const publishedSlots: string[] = []
  const failedSlots: string[] = []
  const store: PublishSlotStore = {
    async markPublished(slotId) {
      publishedSlots.push(slotId)
    },
    async markFailed(slotId) {
      failedSlots.push(slotId)
    },
  }
  return { store, publishedSlots, failedSlots }
}

/**
 * A scripted publisher. `results` is consumed one per attempt; a `'timeout'`
 * entry never resolves (so the worker's deadline fires). Records every call.
 */
function makePublisher(results: Array<PublishResult | 'timeout'>) {
  const calls: any[] = []
  let i = 0
  const publisher: Publisher = {
    async publishPost(data) {
      calls.push(data)
      const r = results[Math.min(i, results.length - 1)]
      i++
      if (r === 'timeout') return new Promise<PublishResult>(() => {}) // never resolves
      return r
    },
  }
  return { publisher, calls, successCount: () => calls.length }
}

function makeAuditService() {
  const records: any[] = []
  return {
    service: { async record(input: any) { records.push(input); return { recorded: true, escalated: false } } },
    records,
  }
}

function makeDispatcher(undelivered = false) {
  const dispatched: any[] = []
  return {
    dispatcher: {
      async dispatch(input: any) {
        dispatched.push(input)
        return { delivered: undelivered ? [] : ['in-app'], undelivered }
      },
    },
    dispatched,
  }
}

const target: EscalationTargetResolver = {
  async resolve() {
    return { userId: 'user-1', sessionContext: 'web' }
  },
}

const JOB: AutopilotPublishJobData = {
  missionId: 'm1',
  workspaceId: 'w1',
  slotId: 's1',
  contentId: 'c1',
}

function baseDeps(overrides: Partial<PublishWorkerDeps> = {}): PublishWorkerDeps {
  const { store } = makeContentStore()
  const { store: slotStore } = makeSlotStore()
  const { publisher } = makePublisher([{ success: true, postId: 'ig1' }])
  const { service } = makeAuditService()
  const { dispatcher } = makeDispatcher()
  return {
    store,
    slotStore,
    publisher,
    auditService: service,
    dispatcher,
    escalationTargetResolver: target,
    sleep: async () => {}, // no real waiting in tests
    ...overrides,
  }
}

// --- Constants --------------------------------------------------------------

describe('autopilot-publish worker — constants (R12.1, R12.3)', () => {
  it('uses a 60s per-attempt deadline and 4 total attempts', () => {
    expect(PUBLISH_TIMEOUT_MS).toBe(60_000)
    expect(MAX_ATTEMPTS).toBe(4) // 1 initial + 3 retries
  })

  it('backoff rises from 30s toward the 300s ceiling (R12.3)', () => {
    expect(DEFAULT_RETRY_DELAYS_MS[0]).toBe(30_000)
    expect(DEFAULT_RETRY_DELAYS_MS[DEFAULT_RETRY_DELAYS_MS.length - 1]).toBe(MAX_RETRY_DELAY_MS)
    // strictly non-decreasing and never above the ceiling
    for (let i = 1; i < DEFAULT_RETRY_DELAYS_MS.length; i++) {
      expect(DEFAULT_RETRY_DELAYS_MS[i]).toBeGreaterThanOrEqual(DEFAULT_RETRY_DELAYS_MS[i - 1])
      expect(DEFAULT_RETRY_DELAYS_MS[i]).toBeLessThanOrEqual(MAX_RETRY_DELAY_MS)
    }
    // there are exactly 3 gaps for the 3 retries
    expect(DEFAULT_RETRY_DELAYS_MS.length).toBe(MAX_ATTEMPTS - 1)
  })
})

// --- Happy path -------------------------------------------------------------

describe('autopilot-publish worker — publish success (R12.1, R12.4, Property 1)', () => {
  it('publishes on the first attempt and marks content + slot published', async () => {
    const cs = makeContentStore()
    const ss = makeSlotStore()
    const pub = makePublisher([{ success: true, postId: 'ig-123', url: 'https://instagram.com/p/ig-123' }])
    const audit = makeAuditService()
    const process = createPublishJobProcessor(
      baseDeps({ store: cs.store, slotStore: ss.store, publisher: pub.publisher, auditService: audit.service }),
    )

    const result = await process(JOB)

    expect(result).toEqual({ action: 'published', contentId: 'c1', postId: 'ig-123', attempts: 1 })
    expect(cs.published).toEqual([{ contentId: 'c1', postId: 'ig-123' }])
    expect(ss.publishedSlots).toEqual(['s1'])
    expect(ss.failedSlots).toEqual([])
    // R12.4: the single attempt was audited as a success.
    expect(audit.records).toHaveLength(1)
    expect(audit.records[0]).toMatchObject({ action: 'publish', outcome: 'success', stage: 'ACT' })
    expect(audit.records[0].triggeringContext).toMatchObject({ slotId: 's1', contentId: 'c1', attempt: 1 })
    expect(typeof audit.records[0].triggeringContext.at).toBe('string')
  })

  it('retries after failures then succeeds, auditing every attempt (R12.3, R12.4)', async () => {
    const cs = makeContentStore()
    const ss = makeSlotStore()
    const pub = makePublisher([
      { success: false, error: 'rate limited' },
      { success: false, error: 'server error' },
      { success: true, postId: 'ig-9' },
    ])
    const audit = makeAuditService()
    const sleep = vi.fn(async () => {})
    const process = createPublishJobProcessor(
      baseDeps({ store: cs.store, slotStore: ss.store, publisher: pub.publisher, auditService: audit.service, sleep }),
    )

    const result = await process(JOB)

    expect(result).toMatchObject({ action: 'published', postId: 'ig-9', attempts: 3 })
    expect(pub.calls).toHaveLength(3)
    // R12.4: each of the 3 attempts is audited (2 failures + 1 success).
    expect(audit.records.map((r) => r.outcome)).toEqual(['failure', 'failure', 'success'])
    // R12.3: waited between attempts with the rising backoff (2 gaps before success).
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, DEFAULT_RETRY_DELAYS_MS[0])
    expect(sleep).toHaveBeenNthCalledWith(2, DEFAULT_RETRY_DELAYS_MS[1])
    expect(cs.published).toHaveLength(1)
    expect(ss.publishedSlots).toEqual(['s1'])
  })

  it('treats a publish that overruns the 60s deadline as a failed attempt (R12.1)', async () => {
    const cs = makeContentStore()
    const ss = makeSlotStore()
    // First attempt hangs (timeout), second succeeds.
    const pub = makePublisher(['timeout', { success: true, postId: 'ig-late' }])
    const audit = makeAuditService()
    const process = createPublishJobProcessor(
      baseDeps({
        store: cs.store,
        slotStore: ss.store,
        publisher: pub.publisher,
        auditService: audit.service,
        publishTimeoutMs: 5, // tiny deadline so the test is fast
        sleep: async () => {},
      }),
    )

    const result = await process(JOB)

    expect(result).toMatchObject({ action: 'published', postId: 'ig-late', attempts: 2 })
    expect(audit.records[0]).toMatchObject({ outcome: 'failure' })
    expect(audit.records[0].triggeringContext.error).toMatch(/timed out/i)
    expect(audit.records[1]).toMatchObject({ outcome: 'success' })
  })
})

// --- Exhaustion + escalation ------------------------------------------------

describe('autopilot-publish worker — exhaustion (R12.5, Property 1)', () => {
  it('after 4 failed attempts marks content + slot failed and escalates', async () => {
    const cs = makeContentStore()
    const ss = makeSlotStore()
    const pub = makePublisher([{ success: false, error: 'boom' }])
    const audit = makeAuditService()
    const disp = makeDispatcher()
    const process = createPublishJobProcessor(
      baseDeps({
        store: cs.store,
        slotStore: ss.store,
        publisher: pub.publisher,
        auditService: audit.service,
        dispatcher: disp.dispatcher,
        sleep: async () => {},
      }),
    )

    const result = await process(JOB)

    expect(result).toMatchObject({ action: 'failed', attempts: MAX_ATTEMPTS, escalated: true, lastError: 'boom' })
    // 1 initial + 3 retries = 4 publish calls, each audited as a failure (R12.4).
    expect(pub.calls).toHaveLength(MAX_ATTEMPTS)
    expect(audit.records).toHaveLength(MAX_ATTEMPTS)
    expect(audit.records.every((r) => r.outcome === 'failure')).toBe(true)
    // R12.5: content + slot failed, slot left unpublished, escalation delivered.
    expect(cs.failed).toEqual([{ contentId: 'c1', error: 'boom' }])
    expect(ss.failedSlots).toEqual(['s1'])
    expect(ss.publishedSlots).toEqual([])
    expect(disp.dispatched).toHaveLength(1)
    expect(disp.dispatched[0]).toMatchObject({ userId: 'user-1', workspaceId: 'w1', type: 'alert' })
  })

  it('still resolves failed (not escalated) when there is no escalation target', async () => {
    const cs = makeContentStore()
    const ss = makeSlotStore()
    const pub = makePublisher([{ success: false, error: 'nope' }])
    const disp = makeDispatcher()
    const process = createPublishJobProcessor(
      baseDeps({
        store: cs.store,
        slotStore: ss.store,
        publisher: pub.publisher,
        dispatcher: disp.dispatcher,
        escalationTargetResolver: { async resolve() { return null } },
        sleep: async () => {},
      }),
    )

    const result = await process(JOB)

    expect(result).toMatchObject({ action: 'failed', escalated: false })
    expect(disp.dispatched).toHaveLength(0)
    expect(ss.failedSlots).toEqual(['s1'])
  })
})

// --- Idempotency (R12.7) ----------------------------------------------------

describe('autopilot-publish worker — never double-publish (R12.7)', () => {
  it('is a no-op when the content is not claimable', async () => {
    const cs = makeContentStore(null) // claim always returns null
    const ss = makeSlotStore()
    const pub = makePublisher([{ success: true, postId: 'x' }])
    const process = createPublishJobProcessor(
      baseDeps({ store: cs.store, slotStore: ss.store, publisher: pub.publisher }),
    )

    const result = await process(JOB)

    expect(result).toEqual({ action: 'skipped', contentId: 'c1', reason: 'not-claimable' })
    expect(pub.calls).toHaveLength(0) // never touched the publisher
    expect(cs.published).toHaveLength(0)
    expect(ss.publishedSlots).toHaveLength(0)
  })

  it('a second job for an already-claimed content does not publish again', async () => {
    const cs = makeContentStore()
    const ss = makeSlotStore()
    const pub = makePublisher([{ success: true, postId: 'ig1' }])
    const process = createPublishJobProcessor(
      baseDeps({ store: cs.store, slotStore: ss.store, publisher: pub.publisher }),
    )

    const first = await process(JOB)
    const second = await process(JOB)

    expect(first.action).toBe('published')
    expect(second).toEqual({ action: 'skipped', contentId: 'c1', reason: 'not-claimable' })
    expect(cs.published).toHaveLength(1) // published exactly once
    expect(pub.calls).toHaveLength(1)
  })
})

// --- Property 8: no double-publish across concurrent/duplicate jobs ----------

describe('autopilot-publish worker — Property 8 (no double-publish)', () => {
  it('publishes at most once no matter how many concurrent/duplicate jobs run', async () => {
    // **Validates: Requirements 12.7 (Property 8)**
    fc.assert(
      fc.asyncProperty(
        // number of duplicated jobs racing for the same content
        fc.integer({ min: 1, max: 6 }),
        // how the publisher behaves: number of leading failures before success,
        // or always-fail; exercises the retry loop within the winning job.
        fc.integer({ min: 0, max: MAX_ATTEMPTS }),
        async (jobCount, failuresBeforeSuccess) => {
          const cs = makeContentStore()
          const ss = makeSlotStore()
          // Build a per-run publisher: first `failuresBeforeSuccess` attempts
          // fail, then success (unless failures ≥ MAX_ATTEMPTS ⇒ always fail).
          const script: Array<PublishResult> = []
          for (let k = 0; k < failuresBeforeSuccess && k < MAX_ATTEMPTS; k++) {
            script.push({ success: false, error: `fail-${k}` })
          }
          if (failuresBeforeSuccess < MAX_ATTEMPTS) {
            script.push({ success: true, postId: 'ig-once' })
          }
          const pub = makePublisher(script.length ? script : [{ success: false, error: 'fail' }])

          const process = createPublishJobProcessor(
            baseDeps({ store: cs.store, slotStore: ss.store, publisher: pub.publisher, sleep: async () => {} }),
          )

          // Fire all duplicate jobs concurrently.
          const results = await Promise.all(
            Array.from({ length: jobCount }, () => process({ ...JOB })),
          )

          // Exactly one job may claim; the rest are skipped (R12.7 / Property 8).
          const claimedRuns = results.filter((r) => r.action !== 'skipped')
          expect(claimedRuns.length).toBe(1)

          // The content is marked published AT MOST once — never twice.
          expect(cs.published.length).toBeLessThanOrEqual(1)
          // The slot is marked published at most once.
          expect(ss.publishedSlots.length).toBeLessThanOrEqual(1)

          // A successful publish implies exactly one published record; a fully
          // failed run implies zero published + a failed record (terminal).
          const succeeded = claimedRuns[0].action === 'published'
          expect(cs.published.length).toBe(succeeded ? 1 : 0)
          if (!succeeded) {
            expect(cs.failed.length).toBe(1)
            expect(ss.failedSlots.length).toBe(1)
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})
