/**
 * Tests for MediaPoolService.
 *
 * Unit tests pin the R6.5 validation bounds (≤100MB, supported image/video
 * MIME types) and the R6.1/R6.3/R6.4/R6.6 pool behaviour: passing uploads are
 * added marked `available`; failing uploads never enter the pool; assigning an
 * item to a slot records an Audit_Record (R6.4) and keeps the item reusable
 * (R6.6). A property test asserts the size/format acceptance rule holds across
 * random inputs, and that assignment never consumes an item.
 *
 * The repository and audit service are stubbed so the behaviour is verified
 * without a database or notification transport.
 *
 * Satisfies Requirements: 6.1, 6.3, 6.4, 6.5, 6.6
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  MediaPoolService,
  MAX_MEDIA_SIZE_BYTES,
  SUPPORTED_MEDIA_TYPES,
  type MediaUploadInput,
} from './MediaPoolService'
import type { IMediaPoolItem } from '../db/models'
import type { AuditRecordInput, AuditResult } from './AutoPilotAuditService'

/** A minimal in-memory pool item, good enough for the service's reads/writes. */
function makeItem(overrides: Partial<IMediaPoolItem> = {}): IMediaPoolItem {
  return {
    _id: 'item-1',
    workspaceId: 'ws-1',
    origin: 'user-upload',
    mediaUrl: 'https://cdn/x.png',
    mediaType: 'image',
    sizeBytes: 1024,
    available: true,
    usedInSlots: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as IMediaPoolItem
}

/**
 * A fake MediaPoolRepository backed by a Map. Only the methods MediaPoolService
 * uses are implemented; `addUsedInSlot` appends without touching `available` so
 * the reusability assertion (R6.6) is exercised end-to-end.
 */
function fakeRepository() {
  const store = new Map<string, IMediaPoolItem>()
  let seq = 0
  const repo = {
    store,
    async create(data: Partial<IMediaPoolItem>): Promise<IMediaPoolItem> {
      const id = `item-${++seq}`
      const item = makeItem({ ...data, _id: id } as Partial<IMediaPoolItem>)
      store.set(id, item)
      return item
    },
    async findById(id: string): Promise<IMediaPoolItem | null> {
      return store.get(id) ?? null
    },
    async addUsedInSlot(id: string, slotId: string): Promise<IMediaPoolItem | null> {
      const item = store.get(id)
      if (!item) return null
      const used = (item.usedInSlots as unknown as string[]) ?? []
      if (!used.map(String).includes(slotId)) used.push(slotId as unknown as never)
      ;(item as { usedInSlots: unknown }).usedInSlots = used
      return item
    },
    async setAvailability(id: string, available: boolean): Promise<IMediaPoolItem | null> {
      const item = store.get(id)
      if (!item) return null
      ;(item as { available: boolean }).available = available
      return item
    },
    async findAvailableByWorkspace(workspaceId: unknown): Promise<IMediaPoolItem[]> {
      return [...store.values()].filter(
        (i) => String(i.workspaceId) === String(workspaceId) && i.available,
      )
    },
  }
  return repo
}

/** A fake audit service that records calls and reports success. */
function fakeAuditService(result: Partial<AuditResult> = {}) {
  const calls: AuditRecordInput[] = []
  const service = {
    calls,
    record: vi.fn(async (input: AuditRecordInput): Promise<AuditResult> => {
      calls.push(input)
      return { recorded: true, escalated: false, ...result } as AuditResult
    }),
  }
  return service
}

function makeService(auditResult?: Partial<AuditResult>) {
  const repo = fakeRepository()
  const audit = fakeAuditService(auditResult)
  const service = new MediaPoolService(repo as never, audit as never)
  return { service, repo, audit }
}

function upload(overrides: Partial<MediaUploadInput> = {}): MediaUploadInput {
  return {
    workspaceId: 'ws-1',
    mediaUrl: 'https://cdn/x.png',
    mimeType: 'image/png',
    sizeBytes: 5 * 1024 * 1024,
    ...overrides,
  }
}

describe('MediaPoolService.validateUpload — R6.5 size + format bounds', () => {
  const { service } = makeService()

  it('accepts a supported image under 100MB', () => {
    expect(service.validateUpload({ mimeType: 'image/jpeg', sizeBytes: 1000 })).toEqual({
      ok: true,
      mediaType: 'image',
    })
  })

  it('accepts a supported video under 100MB', () => {
    expect(service.validateUpload({ mimeType: 'video/mp4', sizeBytes: 1000 })).toEqual({
      ok: true,
      mediaType: 'video',
    })
  })

  it('accepts a file exactly at the 100MB boundary', () => {
    const res = service.validateUpload({ mimeType: 'image/png', sizeBytes: MAX_MEDIA_SIZE_BYTES })
    expect(res.ok).toBe(true)
  })

  it('rejects a file one byte over 100MB with a too-large reason', () => {
    const res = service.validateUpload({
      mimeType: 'image/png',
      sizeBytes: MAX_MEDIA_SIZE_BYTES + 1,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('too-large')
      expect(res.message).toContain('100MB')
    }
  })

  it('rejects an unsupported format with an unsupported-format reason', () => {
    const res = service.validateUpload({ mimeType: 'application/pdf', sizeBytes: 1000 })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('unsupported-format')
      expect(res.message).toContain('application/pdf')
    }
  })

  it('normalises MIME casing and parameters', () => {
    expect(service.validateUpload({ mimeType: 'IMAGE/PNG; charset=binary', sizeBytes: 10 })).toEqual(
      { ok: true, mediaType: 'image' },
    )
  })

  it('rejects malformed input (missing type / invalid size)', () => {
    expect(service.validateUpload({ mimeType: '', sizeBytes: 10 }).ok).toBe(false)
    expect(service.validateUpload({ mimeType: 'image/png', sizeBytes: -1 }).ok).toBe(false)
    expect(service.validateUpload({ mimeType: 'image/png', sizeBytes: Number.NaN }).ok).toBe(false)
  })
})

describe('MediaPoolService.addUpload — R6.1 add marked available / R6.5 reject', () => {
  it('adds a passing upload to the pool marked available', async () => {
    const { service, repo } = makeService()
    const res = await service.addUpload(upload())
    expect(res.added).toBe(true)
    if (res.added) {
      expect(res.item.available).toBe(true)
      expect(res.item.mediaType).toBe('image')
      expect(repo.store.size).toBe(1)
    }
  })

  it('rejects a too-large upload and never adds it to the pool (R6.5)', async () => {
    const { service, repo } = makeService()
    const res = await service.addUpload(upload({ sizeBytes: MAX_MEDIA_SIZE_BYTES + 1 }))
    expect(res.added).toBe(false)
    if (!res.added) expect(res.reason).toBe('too-large')
    expect(repo.store.size).toBe(0)
  })

  it('rejects an unsupported upload and never adds it to the pool (R6.5)', async () => {
    const { service, repo } = makeService()
    const res = await service.addUpload(upload({ mimeType: 'text/plain' }))
    expect(res.added).toBe(false)
    if (!res.added) expect(res.reason).toBe('unsupported-format')
    expect(repo.store.size).toBe(0)
  })
})

describe('MediaPoolService.addGeneratedMedia — R6.3', () => {
  it('adds AI-generated media marked available', async () => {
    const { service } = makeService()
    const item = await service.addGeneratedMedia({
      workspaceId: 'ws-1',
      mediaUrl: 'https://cdn/gen.mp4',
      mediaType: 'video',
      sizeBytes: 2048,
    })
    expect(item.available).toBe(true)
    expect(item.origin).toBe('ai-generated')
  })
})

describe('MediaPoolService.assignToSlot — R6.4 audit + R6.6 reusability', () => {
  it('records an assignment Audit_Record with item + slot (R6.4)', async () => {
    const { service, repo, audit } = makeService()
    const created = await repo.create({ workspaceId: 'ws-1' })

    const res = await service.assignToSlot(String(created._id), 'slot-1', {
      missionId: 'm-1',
      workspaceId: 'ws-1',
    })

    expect(res.assigned).toBe(true)
    expect(res.audited).toBe(true)
    expect(audit.record).toHaveBeenCalledTimes(1)
    const call = audit.calls[0]
    expect(call.action).toBe('assign-media')
    expect(call.triggeringContext).toMatchObject({
      mediaPoolItemId: String(created._id),
      slotId: 'slot-1',
    })
  })

  it('keeps the item available and reusable after assignment (R6.6)', async () => {
    const { service, repo } = makeService()
    const created = await repo.create({ workspaceId: 'ws-1' })
    const id = String(created._id)

    await service.assignToSlot(id, 'slot-1', { missionId: 'm-1', workspaceId: 'ws-1' })
    await service.assignToSlot(id, 'slot-2', { missionId: 'm-1', workspaceId: 'ws-1' })

    const item = await repo.findById(id)
    expect(item?.available).toBe(true)
    expect((item?.usedInSlots as unknown as string[]).map(String)).toEqual(['slot-1', 'slot-2'])
    // Still surfaced as available for the workspace.
    const avail = await service.listAvailable('ws-1')
    expect(avail.map((i) => String(i._id))).toContain(id)
  })

  it('returns assigned:false without auditing for a missing item', async () => {
    const { service, audit } = makeService()
    const res = await service.assignToSlot('nope', 'slot-1', {
      missionId: 'm-1',
      workspaceId: 'ws-1',
    })
    expect(res.assigned).toBe(false)
    expect(res.audited).toBe(false)
    expect(audit.record).not.toHaveBeenCalled()
  })
})

describe('MediaPoolService.remove — R6.6 removal', () => {
  it('flips availability to false so the resolver stops offering it', async () => {
    const { service, repo } = makeService()
    const created = await repo.create({ workspaceId: 'ws-1' })
    const id = String(created._id)

    await service.remove(id)

    const item = await repo.findById(id)
    expect(item?.available).toBe(false)
    expect(await service.listAvailable('ws-1')).toHaveLength(0)
  })
})

// ─── Property: validation acceptance rule + assignment never consumes ─────────
// An upload is accepted iff (size ≤ 100MB AND supported image/video type); and
// assigning an accepted item to any slot always leaves it available for reuse.
// **Validates: Requirements 6.5, 6.6**
describe('Property — R6.5 acceptance rule and R6.6 reuse invariant', () => {
  const supported = [...SUPPORTED_MEDIA_TYPES.image, ...SUPPORTED_MEDIA_TYPES.video]
  const unsupported = ['text/plain', 'application/pdf', 'application/zip', 'audio/mpeg', 'model/gltf']

  it('accepts exactly the files within size AND format bounds (R6.5)', () => {
    fc.assert(
      fc.property(
        fc.oneof(...[...supported, ...unsupported].map((m) => fc.constant(m))),
        fc.integer({ min: 0, max: MAX_MEDIA_SIZE_BYTES * 2 }),
        (mimeType, sizeBytes) => {
          const { service } = makeService()
          const res = service.validateUpload({ mimeType, sizeBytes })
          const withinSize = sizeBytes <= MAX_MEDIA_SIZE_BYTES
          const supportedType = supported.includes(mimeType)
          expect(res.ok).toBe(withinSize && supportedType)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('assigning an accepted item to any slots keeps it available (R6.6)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 10 }),
        async (slotIds) => {
          const { service, repo } = makeService()
          const created = await repo.create({ workspaceId: 'ws-1' })
          const id = String(created._id)
          for (const slotId of slotIds) {
            const res = await service.assignToSlot(id, slotId, {
              missionId: 'm-1',
              workspaceId: 'ws-1',
            })
            expect(res.assigned).toBe(true)
          }
          const item = await repo.findById(id)
          // Reuse invariant: never consumed, still available after N assigns.
          expect(item?.available).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})
