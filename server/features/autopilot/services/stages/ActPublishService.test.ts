/**
 * Tests for ActPublishService (ACT stage — publishing hand-off, Task 14.1).
 *
 * Unit tests pin the design + requirements:
 *   - Writes a ContentModel with status `scheduled` and links it to the slot (R12.2).
 *   - Registers a JobType.SCHEDULED_POST job with the (injected) scheduler (R12.2).
 *   - Idempotent: an already-published / already-scheduled slot is a no-op (R12.7).
 *   - Pre-publish guard: media present ⇒ ok; missing ⇒ fallback applied; missing +
 *     no resolver ⇒ not ok (R12.6).
 *
 * All I/O is faked (in-memory content store, spy scheduler, spy slot store, spy
 * audit service), so the write + registration + guard logic is verified without a
 * database, Redis, or a live scheduler.
 *
 * Satisfies Requirements: 12.2, 12.6
 */

import { describe, it, expect, vi } from 'vitest'
import {
  ActPublishService,
  slotHasMediaOrFallback,
  PRE_PUBLISH_GUARD_LEAD_MS,
  CONTENT_TYPE_BY_FORMAT,
  type ActMissionInput,
  type ActSlotInput,
  type ContentStore,
  type PublishScheduler,
  type ActSlotStore,
  type SlotMediaResolver,
  type PrePublishFallbackResolver,
  type ContentDocumentInput,
} from './ActPublishService'
import { JobType, type ScheduledJob } from '../../../../services/TieredJobScheduler'

// --- Fakes ------------------------------------------------------------------

function makeContentStore(): ContentStore & { created: ContentDocumentInput[]; cancelled: string[] } {
  const created: ContentDocumentInput[] = []
  const cancelled: string[] = []
  let n = 0
  return {
    created,
    cancelled,
    async create(doc) {
      created.push(doc)
      return { _id: `content-${++n}` }
    },
    async cancel(id) {
      cancelled.push(id)
    },
  }
}

function makeScheduler(
  result: 'dispatched' | 'deferred' | Error = 'dispatched',
): PublishScheduler & { jobs: ScheduledJob[] } {
  const jobs: ScheduledJob[] = []
  return {
    jobs,
    async dispatchOrDefer(job) {
      jobs.push(job)
      if (result instanceof Error) throw result
      return result
    },
  }
}

function makeSlotStore(): ActSlotStore & {
  linked: { slotId: string; contentId: string }[]
  statuses: { slotId: string; status: string }[]
  fallbacks: { slotId: string; fallback: string }[]
} {
  const linked: { slotId: string; contentId: string }[] = []
  const statuses: { slotId: string; status: string }[] = []
  const fallbacks: { slotId: string; fallback: string }[] = []
  return {
    linked,
    statuses,
    fallbacks,
    async linkContent(slotId, contentId) {
      linked.push({ slotId, contentId })
      return {}
    },
    async updateStatus(slotId, status) {
      statuses.push({ slotId, status })
      return {}
    },
    async setFallbackResolution(slotId, fallback) {
      fallbacks.push({ slotId, fallback })
      return {}
    },
  }
}

function makeAudit(): { record: ReturnType<typeof vi.fn>; calls: any[] } {
  const calls: any[] = []
  const record = vi.fn(async (input: any) => {
    calls.push(input)
    return { recorded: true, escalated: false }
  })
  return { record, calls }
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000)

function mission(overrides: Partial<ActMissionInput> = {}): ActMissionInput {
  return {
    _id: 'mission-1',
    workspaceId: 'ws-1',
    accountId: 'acc-1',
    platform: 'instagram',
    ...overrides,
  }
}

function slot(overrides: Partial<ActSlotInput> = {}): ActSlotInput {
  return {
    _id: 'slot-1',
    scheduledAt: FUTURE,
    format: 'reel',
    theme: 'behind the scenes',
    caption: 'Check this out! Comment LINK for the guide.',
    hashtags: ['#reels', '#bts'],
    source: { kind: 'pool', mediaPoolItemId: 'media-1' },
    status: 'ready',
    ...overrides,
  }
}

// --- scheduleSlotForPublishing ---------------------------------------------

describe('ActPublishService.scheduleSlotForPublishing', () => {
  it('writes a ContentModel with status scheduled and links the slot (R12.2)', async () => {
    const contentStore = makeContentStore()
    const scheduler = makeScheduler('dispatched')
    const slotStore = makeSlotStore()
    const audit = makeAudit()
    const svc = new ActPublishService({ contentStore, scheduler, slotStore, auditService: audit })

    const res = await svc.scheduleSlotForPublishing(mission(), slot())

    expect(res.scheduled).toBe(true)
    expect(res.skipped).toBe(false)
    expect(res.contentId).toBe('content-1')

    expect(contentStore.created).toHaveLength(1)
    const doc = contentStore.created[0]
    expect(doc.status).toBe('scheduled')
    expect(doc.workspaceId).toBe('ws-1')
    expect(doc.accountId).toBe('acc-1')
    expect(doc.platform).toBe('instagram')
    expect(doc.type).toBe(CONTENT_TYPE_BY_FORMAT.reel) // 'reel'
    expect(doc.scheduledAt).toBe(FUTURE)
    expect(doc.contentData.text).toBe('Check this out! Comment LINK for the guide.')
    expect(doc.contentData.hashtags).toEqual(['#reels', '#bts'])
    expect(doc.contentData.autopilotSlotId).toBe('slot-1')

    // Slot linked + moved to scheduled.
    expect(slotStore.linked).toEqual([{ slotId: 'slot-1', contentId: 'content-1' }])
    expect(slotStore.statuses).toEqual([{ slotId: 'slot-1', status: 'scheduled' }])
  })

  it('registers a JobType.SCHEDULED_POST job with the scheduler (R12.2)', async () => {
    const contentStore = makeContentStore()
    const scheduler = makeScheduler('dispatched')
    const svc = new ActPublishService({
      contentStore,
      scheduler,
      slotStore: makeSlotStore(),
      auditService: makeAudit(),
    })

    const res = await svc.scheduleSlotForPublishing(mission(), slot())

    expect(scheduler.jobs).toHaveLength(1)
    const job = scheduler.jobs[0]
    expect(job.type).toBe(JobType.SCHEDULED_POST)
    expect(job.accountId).toBe('acc-1')
    expect(job.id).toBe('autopilot-publish-slot-1')
    expect(job.scheduledAt).toBe(FUTURE.getTime())
    expect((job.payload as any).contentId).toBe('content-1')
    expect((job.payload as any).slotId).toBe('slot-1')
    expect(res.dispatch).toBe('dispatched')
    expect(res.jobId).toBe('autopilot-publish-slot-1')
  })

  it('audits the scheduling as a reversible success with a reversal op (R13.5/R17)', async () => {
    const audit = makeAudit()
    const svc = new ActPublishService({
      contentStore: makeContentStore(),
      scheduler: makeScheduler('dispatched'),
      slotStore: makeSlotStore(),
      auditService: audit,
    })

    await svc.scheduleSlotForPublishing(mission(), slot())

    const success = audit.calls.find((c) => c.action === 'schedule-publish' && c.outcome === 'success')
    expect(success).toBeTruthy()
    expect(success.stage).toBe('ACT')
    expect(success.reversible).toBe(true)
    expect(success.reversalOp).toMatchObject({ type: 'cancel-content', contentId: 'content-1' })
  })

  it('is a no-op for an already-published slot (R12.7)', async () => {
    const contentStore = makeContentStore()
    const scheduler = makeScheduler('dispatched')
    const svc = new ActPublishService({
      contentStore,
      scheduler,
      slotStore: makeSlotStore(),
      auditService: makeAudit(),
    })

    const res = await svc.scheduleSlotForPublishing(mission(), slot({ status: 'published' }))

    expect(res.scheduled).toBe(false)
    expect(res.skipped).toBe(true)
    expect(contentStore.created).toHaveLength(0)
    expect(scheduler.jobs).toHaveLength(0)
  })

  it('is a no-op when the slot already has a linked ContentModel (R12.7)', async () => {
    const contentStore = makeContentStore()
    const scheduler = makeScheduler('dispatched')
    const svc = new ActPublishService({
      contentStore,
      scheduler,
      slotStore: makeSlotStore(),
      auditService: makeAudit(),
    })

    const res = await svc.scheduleSlotForPublishing(
      mission(),
      slot({ contentId: 'existing-content' }),
    )

    expect(res.skipped).toBe(true)
    expect(res.contentId).toBe('existing-content')
    expect(contentStore.created).toHaveLength(0)
    expect(scheduler.jobs).toHaveLength(0)
  })

  it('populates mediaUrls from the injected media resolver', async () => {
    const contentStore = makeContentStore()
    const resolver: SlotMediaResolver = {
      async resolve() {
        return { mediaUrls: ['https://cdn/x.mp4'], mediaType: 'video' }
      },
    }
    const svc = new ActPublishService({
      contentStore,
      scheduler: makeScheduler('dispatched'),
      slotStore: makeSlotStore(),
      auditService: makeAudit(),
      mediaResolver: resolver,
    })

    await svc.scheduleSlotForPublishing(mission(), slot())

    expect(contentStore.created[0].contentData.mediaUrls).toEqual(['https://cdn/x.mp4'])
  })

  it('rolls back the content and reports failure when scheduler registration fails', async () => {
    const contentStore = makeContentStore()
    const scheduler = makeScheduler(new Error('redis down'))
    const audit = makeAudit()
    const svc = new ActPublishService({
      contentStore,
      scheduler,
      slotStore: makeSlotStore(),
      auditService: audit,
    })

    const res = await svc.scheduleSlotForPublishing(mission(), slot())

    expect(res.scheduled).toBe(false)
    expect(res.skipped).toBe(false)
    expect(contentStore.cancelled).toEqual(['content-1'])
    const failure = audit.calls.find((c) => c.outcome === 'failure')
    expect(failure).toBeTruthy()
  })

  it('maps slot formats to ContentModel types', () => {
    expect(CONTENT_TYPE_BY_FORMAT.reel).toBe('reel')
    expect(CONTENT_TYPE_BY_FORMAT.photo).toBe('post')
    expect(CONTENT_TYPE_BY_FORMAT.carousel).toBe('post')
    expect(CONTENT_TYPE_BY_FORMAT.story).toBe('story')
  })
})

// --- runPrePublishGuard -----------------------------------------------------

describe('ActPublishService.runPrePublishGuard (R12.6)', () => {
  it('passes when the slot has assigned media', async () => {
    const audit = makeAudit()
    const svc = new ActPublishService({
      contentStore: makeContentStore(),
      scheduler: makeScheduler(),
      slotStore: makeSlotStore(),
      auditService: audit,
    })

    const res = await svc.runPrePublishGuard(mission(), slot())

    expect(res.ok).toBe(true)
    expect(res.hadMedia).toBe(true)
    expect(res.fallback).toBeUndefined()
  })

  it('passes when the slot already has a fallback resolution', async () => {
    const svc = new ActPublishService({
      contentStore: makeContentStore(),
      scheduler: makeScheduler(),
      slotStore: makeSlotStore(),
      auditService: makeAudit(),
    })

    const res = await svc.runPrePublishGuard(
      mission(),
      slot({ source: { kind: 'user-brief' }, fallbackResolution: 'ai-backup' }),
    )

    expect(res.ok).toBe(true)
    expect(res.hadMedia).toBe(false)
    expect(res.fallback).toBe('ai-backup')
  })

  it('triggers the fallback resolver when media is missing', async () => {
    const slotStore = makeSlotStore()
    const audit = makeAudit()
    const fallbackResolver: PrePublishFallbackResolver = {
      async resolve() {
        return 'ai-backup'
      },
    }
    const svc = new ActPublishService({
      contentStore: makeContentStore(),
      scheduler: makeScheduler(),
      slotStore,
      auditService: audit,
      fallbackResolver,
    })

    const res = await svc.runPrePublishGuard(
      mission(),
      slot({ source: { kind: 'user-brief' } }),
    )

    expect(res.ok).toBe(true)
    expect(res.hadMedia).toBe(false)
    expect(res.fallback).toBe('ai-backup')
    expect(slotStore.fallbacks).toEqual([{ slotId: 'slot-1', fallback: 'ai-backup' }])
    expect(audit.calls.some((c) => c.action === 'pre-publish-guard' && c.outcome === 'success')).toBe(true)
  })

  it('returns not-ok when media is missing and no fallback resolver is configured', async () => {
    const audit = makeAudit()
    const svc = new ActPublishService({
      contentStore: makeContentStore(),
      scheduler: makeScheduler(),
      slotStore: makeSlotStore(),
      auditService: audit,
    })

    const res = await svc.runPrePublishGuard(
      mission(),
      slot({ source: { kind: 'user-brief' } }),
    )

    expect(res.ok).toBe(false)
    expect(audit.calls.some((c) => c.action === 'pre-publish-guard' && c.outcome === 'blocked')).toBe(true)
  })

  it('returns not-ok when the fallback resolution itself fails', async () => {
    const fallbackResolver: PrePublishFallbackResolver = {
      async resolve() {
        throw new Error('cannot produce backup')
      },
    }
    const audit = makeAudit()
    const svc = new ActPublishService({
      contentStore: makeContentStore(),
      scheduler: makeScheduler(),
      slotStore: makeSlotStore(),
      auditService: audit,
      fallbackResolver,
    })

    const res = await svc.runPrePublishGuard(mission(), slot({ source: { kind: 'user-brief' } }))

    expect(res.ok).toBe(false)
    expect(audit.calls.some((c) => c.action === 'pre-publish-guard' && c.outcome === 'failure')).toBe(true)
  })
})

// --- helpers ----------------------------------------------------------------

describe('ActPublishService.isGuardDue + slotHasMediaOrFallback', () => {
  it('isGuardDue is true within 5 minutes of publish time', () => {
    const svc = new ActPublishService({
      contentStore: makeContentStore(),
      scheduler: makeScheduler(),
      slotStore: makeSlotStore(),
      auditService: makeAudit(),
    })
    const publishAt = new Date('2025-01-01T12:00:00Z')
    const s = slot({ scheduledAt: publishAt })

    // 6 minutes before → not due.
    expect(svc.isGuardDue(s, publishAt.getTime() - 6 * 60 * 1000)).toBe(false)
    // Exactly 5 minutes before (= PRE_PUBLISH_GUARD_LEAD_MS) → due.
    expect(svc.isGuardDue(s, publishAt.getTime() - PRE_PUBLISH_GUARD_LEAD_MS)).toBe(true)
    // At publish time → due.
    expect(svc.isGuardDue(s, publishAt.getTime())).toBe(true)
  })

  it('slotHasMediaOrFallback reflects assigned media or fallback', () => {
    expect(slotHasMediaOrFallback(slot())).toBe(true)
    expect(slotHasMediaOrFallback(slot({ source: { kind: 'user-brief' } }))).toBe(false)
    expect(
      slotHasMediaOrFallback(slot({ source: { kind: 'user-brief' }, fallbackResolution: 'rescheduled' })),
    ).toBe(true)
  })
})
