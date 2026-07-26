/**
 * Tests for BriefResolutionService (Content-Brief flow · terminal resolution).
 *
 * Unit tests pin the concrete behaviours of the two resolution paths:
 *   - deliverBrief (R7.8): validated media is added to the pool as a
 *     `brief-delivery` item, assigned to the slot (audited), the slot's source
 *     points at that item and is `ready`, and the brief is marked `delivered`;
 *     invalid media is rejected without touching the slot; an already-resolved
 *     brief is reported idempotently;
 *   - resolveUndeliveredBrief (R7.6/R7.7): an AI backup matching the slot format
 *     is substituted when producible (slot `ready` + fallbackResolution
 *     `ai-backup`, brief `ai-backup`, substitution audited); otherwise the slot is
 *     rescheduled (slot `rescheduled` + fallbackResolution `rescheduled`, brief
 *     `rescheduled`, rescheduling audited); a produced-but-mismatched or failed
 *     backup falls back to reschedule; an already-resolved brief is idempotent.
 *
 * The property test backs Property 1: for ANY undelivered brief + backup-generator
 * behaviour, resolveUndeliveredBrief always reaches a terminal resolution
 * ('ai-backup' or 'rescheduled') and always leaves the slot with a
 * fallbackResolution set — no slot is ever silently dropped.
 *
 * Every port is injected (in-memory brief + slot stores, recording pool + audit),
 * so nothing here touches a database, an AI provider, or a queue.
 *
 * Satisfies Requirements: 7.6, 7.7, 7.8 (Property 1)
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  BriefResolutionService,
  DEFAULT_RESCHEDULE_STEP_MS,
  BACKUP_MEDIA_TYPE_BY_FORMAT,
  type ResolutionBriefStore,
  type ResolutionBriefView,
  type ResolutionSlotStore,
  type ResolutionSlotView,
  type ResolutionSlotPatch,
  type BackupMediaGenerator,
  type GeneratedBackupMedia,
  type BriefResolutionServiceOptions,
} from './BriefResolutionService'
import type { AuditRecordInput } from './AutoPilotAuditService'
import type { AddMediaResult, AssignToSlotResult } from './MediaPoolService'
import type { ContentBriefStatus, ContentFormat, MediaType } from '../db/models'

// ─── In-memory ports ────────────────────────────────────────────────────────

function inMemoryBriefStore(initial: ResolutionBriefView): {
  store: ResolutionBriefStore
  state: ResolutionBriefView
  statusCalls: { status: ContentBriefStatus; deliveredMediaPoolItemId?: string }[]
} {
  const state = { ...initial }
  const statusCalls: { status: ContentBriefStatus; deliveredMediaPoolItemId?: string }[] = []
  const store: ResolutionBriefStore = {
    load: vi.fn(async () => (state ? { ...state } : null)),
    setStatus: vi.fn(async (_id, status, deliveredMediaPoolItemId) => {
      state.status = status
      statusCalls.push({ status, deliveredMediaPoolItemId })
    }),
  }
  return { store, state, statusCalls }
}

function inMemorySlotStore(initial: ResolutionSlotView | null): {
  store: ResolutionSlotStore
  patches: ResolutionSlotPatch[]
  current: ResolutionSlotView | null
} {
  let current = initial ? { ...initial } : null
  const patches: ResolutionSlotPatch[] = []
  const store: ResolutionSlotStore = {
    load: vi.fn(async () => (current ? { ...current } : null)),
    apply: vi.fn(async (_slotId, patch) => {
      patches.push(patch)
      if (current) {
        current = {
          ...current,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.scheduledAt ? { scheduledAt: patch.scheduledAt } : {}),
        }
      }
    }),
  }
  return {
    store,
    patches,
    get current() {
      return current
    },
  } as any
}

function recordingPool() {
  const added: any[] = []
  const assigned: { itemId: string; slotId: string }[] = []
  let nextId = 1
  const svc = {
    addUpload: vi.fn(async (input: any): Promise<AddMediaResult> => {
      added.push({ kind: 'upload', input })
      return { added: true, item: { _id: `pool-${nextId++}`, ...input } as any }
    }),
    addGeneratedMedia: vi.fn(async (input: any) => {
      added.push({ kind: 'generated', input })
      return { _id: `pool-${nextId++}`, ...input } as any
    }),
    assignToSlot: vi.fn(
      async (itemId: string, slotId: string): Promise<AssignToSlotResult> => {
        assigned.push({ itemId, slotId })
        return { assigned: true, audited: true, message: 'ok' }
      },
    ),
  }
  return { svc, added, assigned }
}

function recordingAudit() {
  const calls: AuditRecordInput[] = []
  const record = vi.fn(async (input: AuditRecordInput) => {
    calls.push(input)
    return { recorded: true, escalated: false }
  })
  return { record, calls }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const NOW = new Date('2024-06-01T00:00:00.000Z').getTime()
const SLOT_TIME = new Date('2024-06-10T12:00:00.000Z')

function makeBrief(overrides: Partial<ResolutionBriefView> = {}): ResolutionBriefView {
  return {
    _id: 'brief-1',
    missionId: 'mission-1',
    workspaceId: 'ws-1',
    slotId: 'slot-1',
    status: 'sent',
    ...overrides,
  }
}

function makeSlot(overrides: Partial<ResolutionSlotView> = {}): ResolutionSlotView {
  return {
    _id: 'slot-1',
    format: 'reel',
    scheduledAt: SLOT_TIME,
    status: 'brief-sent',
    ...overrides,
  }
}

/** A backup generator that always produces matching media for the format. */
function goodBackupGenerator(): BackupMediaGenerator {
  return {
    canGenerate: () => true,
    generate: vi.fn(async ({ format }): Promise<GeneratedBackupMedia> => ({
      mediaUrl: `https://cdn.example.com/backup-${format}.bin`,
      mediaType: BACKUP_MEDIA_TYPE_BY_FORMAT[format as ContentFormat],
      sizeBytes: 1024,
      format,
    })),
  }
}

function makeService(
  brief: ResolutionBriefView,
  slot: ResolutionSlotView | null,
  overrides: Partial<BriefResolutionServiceOptions> = {},
) {
  const briefStore = inMemoryBriefStore(brief)
  const slotStore = inMemorySlotStore(slot)
  const pool = recordingPool()
  const audit = recordingAudit()
  const svc = new BriefResolutionService({
    briefStore: briefStore.store,
    slotStore: slotStore.store,
    mediaPoolService: pool.svc as any,
    auditService: audit as any,
    ...overrides,
  })
  return { svc, briefStore, slotStore, pool, audit }
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── deliverBrief (R7.8) ─────────────────────────────────────────────────────

describe('BriefResolutionService.deliverBrief (R7.8)', () => {
  const media = { mediaUrl: 'https://cdn/x.mp4', mimeType: 'video/mp4', sizeBytes: 2048 }

  it('adds delivered media to the pool, attaches it to the slot, and marks the brief delivered', async () => {
    const { svc, briefStore, slotStore, pool, audit } = makeService(makeBrief(), makeSlot())

    const result = await svc.deliverBrief('brief-1', media)

    expect(result.status).toBe('delivered')
    if (result.status !== 'delivered') return
    // Added to the pool as a brief-delivery item.
    expect(pool.added).toHaveLength(1)
    expect(pool.added[0].kind).toBe('upload')
    expect(pool.added[0].input.origin).toBe('brief-delivery')
    // Assigned to the slot (R6.4).
    expect(pool.assigned).toEqual([{ itemId: result.mediaPoolItemId, slotId: 'slot-1' }])
    // Slot source now points at the pool item; slot is ready.
    const patch = slotStore.patches[0]
    expect(patch.source).toEqual({ kind: 'pool', mediaPoolItemId: result.mediaPoolItemId })
    expect(patch.status).toBe('ready')
    // Brief marked delivered with the pool item id.
    expect(briefStore.statusCalls).toContainEqual({
      status: 'delivered',
      deliveredMediaPoolItemId: result.mediaPoolItemId,
    })
    // Delivery audited.
    expect(audit.calls.some((c) => c.action === 'brief.delivered')).toBe(true)
  })

  it('rejects invalid media (too large / unsupported) without touching the slot (R6.5)', async () => {
    const pool = recordingPool()
    pool.svc.addUpload = vi.fn(async () => ({
      added: false,
      reason: 'too-large',
      message: 'too big',
    })) as any
    const { svc, slotStore, briefStore } = makeService(makeBrief(), makeSlot(), {
      mediaPoolService: pool.svc as any,
    })

    const result = await svc.deliverBrief('brief-1', media)

    expect(result.status).toBe('rejected')
    expect(slotStore.patches).toHaveLength(0)
    expect(briefStore.statusCalls).toHaveLength(0)
  })

  it('is idempotent — an already-resolved brief is not re-delivered', async () => {
    const { svc, pool, slotStore } = makeService(makeBrief({ status: 'delivered' }), makeSlot())

    const result = await svc.deliverBrief('brief-1', media)

    expect(result).toEqual({ status: 'already-resolved', resolution: 'delivered' })
    expect(pool.added).toHaveLength(0)
    expect(slotStore.patches).toHaveLength(0)
  })

  it('reports not-found when the brief is missing', async () => {
    const briefStore: ResolutionBriefStore = {
      load: vi.fn(async () => null),
      setStatus: vi.fn(async () => {}),
    }
    const svc = new BriefResolutionService({ briefStore })

    expect(await svc.deliverBrief('missing', media)).toEqual({ status: 'not-found' })
  })
})

// ─── resolveUndeliveredBrief → AI backup (R7.6) ──────────────────────────────

describe('BriefResolutionService.resolveUndeliveredBrief — AI backup (R7.6)', () => {
  it('substitutes AI backup media, marks the slot ready with ai-backup, and audits it', async () => {
    const { svc, briefStore, slotStore, pool, audit } = makeService(makeBrief(), makeSlot(), {
      backupGenerator: goodBackupGenerator(),
    })

    const result = await svc.resolveUndeliveredBrief('brief-1', { now: NOW })

    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.resolution).toBe('ai-backup')
    // Generated media added to the pool + assigned to the slot.
    expect(pool.added[0].kind).toBe('generated')
    expect(pool.added[0].input.origin).toBe('ai-generated')
    expect(pool.assigned).toHaveLength(1)
    // Slot patched with ai-generated source + ai-backup fallback resolution.
    const patch = slotStore.patches[0]
    expect(patch.source?.kind).toBe('ai-generated')
    expect(patch.status).toBe('ready')
    expect(patch.fallbackResolution).toBe('ai-backup')
    // Brief marked ai-backup.
    expect(briefStore.statusCalls.at(-1)?.status).toBe('ai-backup')
    // Substitution recorded (R7.6).
    expect(audit.calls.some((c) => c.action === 'brief.ai-backup-substituted')).toBe(true)
  })
})

// ─── resolveUndeliveredBrief → reschedule (R7.7) ─────────────────────────────

describe('BriefResolutionService.resolveUndeliveredBrief — reschedule (R7.7)', () => {
  it('reschedules the slot when a backup cannot be produced', async () => {
    // Default backup generator cannot produce a backup → reschedule.
    const { svc, briefStore, slotStore, pool, audit } = makeService(makeBrief(), makeSlot())

    const result = await svc.resolveUndeliveredBrief('brief-1', { now: NOW })

    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.resolution).toBe('rescheduled')
    // No media added.
    expect(pool.added).toHaveLength(0)
    // Slot pushed forward + marked rescheduled.
    const patch = slotStore.patches[0]
    expect(patch.status).toBe('rescheduled')
    expect(patch.fallbackResolution).toBe('rescheduled')
    expect(patch.scheduledAt?.getTime()).toBe(SLOT_TIME.getTime() + DEFAULT_RESCHEDULE_STEP_MS)
    // Brief marked rescheduled.
    expect(briefStore.statusCalls.at(-1)?.status).toBe('rescheduled')
    // Rescheduling recorded (R7.7).
    expect(audit.calls.some((c) => c.action === 'brief.rescheduled')).toBe(true)
  })

  it('reschedules when the generator produces a format-mismatched backup', async () => {
    const mismatched: BackupMediaGenerator = {
      canGenerate: () => true,
      generate: async () => ({
        mediaUrl: 'https://cdn/x.jpg',
        mediaType: 'image', // reel needs video → mismatch
        sizeBytes: 100,
      }),
    }
    const { svc, slotStore } = makeService(makeBrief(), makeSlot({ format: 'reel' }), {
      backupGenerator: mismatched,
    })

    const result = await svc.resolveUndeliveredBrief('brief-1', { now: NOW })

    expect(result).toMatchObject({ status: 'resolved', resolution: 'rescheduled' })
    expect(slotStore.patches[0].fallbackResolution).toBe('rescheduled')
  })

  it('reschedules when backup generation throws', async () => {
    const throwing: BackupMediaGenerator = {
      canGenerate: () => true,
      generate: async () => {
        throw new Error('generation service down')
      },
    }
    const { svc } = makeService(makeBrief(), makeSlot(), { backupGenerator: throwing })

    const result = await svc.resolveUndeliveredBrief('brief-1', { now: NOW })

    expect(result).toMatchObject({ status: 'resolved', resolution: 'rescheduled' })
  })

  it('is idempotent — an already-resolved brief is not re-resolved', async () => {
    const { svc, slotStore, audit } = makeService(makeBrief({ status: 'ai-backup' }), makeSlot(), {
      backupGenerator: goodBackupGenerator(),
    })

    const result = await svc.resolveUndeliveredBrief('brief-1', { now: NOW })

    expect(result).toEqual({ status: 'already-resolved', resolution: 'ai-backup' })
    expect(slotStore.patches).toHaveLength(0)
    expect(audit.calls).toHaveLength(0)
  })

  it('reports not-found when the slot is missing', async () => {
    const { svc } = makeService(makeBrief(), null)
    expect(await svc.resolveUndeliveredBrief('brief-1', { now: NOW })).toEqual({
      status: 'not-found',
    })
  })
})

// ─── Property 1: every undelivered brief reaches a terminal resolution ───────
// **Validates: Requirements 7.6, 7.7, 7.8**
describe('Property 1 — an undelivered brief is always resolved (ai-backup | rescheduled)', () => {
  it('never leaves a slot without a fallback resolution, for any generator behaviour', async () => {
    const formatArb = fc.constantFrom<ContentFormat>('reel', 'photo', 'carousel', 'story')
    // Model every possible generator behaviour: cannot generate, declines (null),
    // throws, produces mismatched media, or produces correct matching media.
    const generatorArb = fc.constantFrom(
      'cannot',
      'null',
      'throws',
      'mismatch',
      'match',
    )

    await fc.assert(
      fc.asyncProperty(
        formatArb,
        generatorArb,
        fc.integer({ min: 0, max: 10_000_000_000 }),
        async (format, behaviour, nowOffset) => {
          const now = NOW + nowOffset
          const wrongType: MediaType = BACKUP_MEDIA_TYPE_BY_FORMAT[format] === 'video' ? 'image' : 'video'

          const generator: BackupMediaGenerator = {
            canGenerate: () => behaviour !== 'cannot',
            generate: async () => {
              if (behaviour === 'null') return null
              if (behaviour === 'throws') throw new Error('boom')
              if (behaviour === 'mismatch') {
                return { mediaUrl: 'u', mediaType: wrongType, sizeBytes: 1 }
              }
              return {
                mediaUrl: 'u',
                mediaType: BACKUP_MEDIA_TYPE_BY_FORMAT[format],
                sizeBytes: 1,
              }
            },
          }

          const { svc, slotStore } = makeService(makeBrief(), makeSlot({ format }), {
            backupGenerator: generator,
          })

          const result = await svc.resolveUndeliveredBrief('brief-1', { now })

          // Always terminal: never not-found, never left unresolved.
          expect(result.status).toBe('resolved')
          if (result.status !== 'resolved') return

          // The only two terminal resolutions (Property 1).
          expect(['ai-backup', 'rescheduled']).toContain(result.resolution)

          // Only the 'match' behaviour can yield an AI backup; every other
          // behaviour must reschedule so the slot is never dropped.
          const expected = behaviour === 'match' ? 'ai-backup' : 'rescheduled'
          expect(result.resolution).toBe(expected)

          // The slot always ends with a fallbackResolution set (no empty publish).
          const patch = slotStore.patches[0]
          expect(patch.fallbackResolution).toBe(result.resolution)
        },
      ),
      { numRuns: 200 },
    )
  })
})
