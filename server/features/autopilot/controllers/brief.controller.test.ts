/**
 * Tests for BriefController — the Content_Brief delivery HTTP surface (Task 10.3).
 *
 * These verify the controller's HTTP concerns: authentication, workspace
 * ownership enforcement, resolving the pre-uploaded pool item into the media the
 * resolution service validates, and delegation to
 * BriefResolutionService.deliverBrief. Dependencies are injected as fakes so the
 * behaviour is exercised without a database. The module-level `mongodb-storage`
 * import (used for workspace ownership) is mocked so importing the controller
 * never touches a live DB. Mirrors the Media_Pool + Approval controller tests.
 *
 * Satisfies Requirements: 7.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

// Workspace ownership is resolved via the shared storage singleton.
const getWorkspacesByUserId = vi.fn()
vi.mock('../../../mongodb-storage', () => ({
  storage: {
    getWorkspacesByUserId: (...args: unknown[]) => getWorkspacesByUserId(...args),
  },
}))

import { BriefController } from './brief.controller'

function makeRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {} as Response & { statusCode?: number; body?: unknown }
  res.status = vi.fn((code: number) => {
    ;(res as { statusCode?: number }).statusCode = code
    return res
  }) as unknown as Response['status']
  res.json = vi.fn((payload: unknown) => {
    ;(res as { body?: unknown }).body = payload
    return res
  }) as unknown as Response['json']
  return res
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'item-1',
    workspaceId: 'ws-1',
    missionId: 'm-1',
    origin: 'user-upload',
    mediaUrl: 'https://cdn/x.png',
    mediaType: 'image',
    format: 'png',
    sizeBytes: 1024,
    available: true,
    usedInSlots: [],
    ...overrides,
  }
}

function makeDeps() {
  const briefs = {
    deliverBrief: vi.fn(async () => ({
      status: 'delivered',
      mediaPoolItemId: 'delivered-1',
      slotId: 's-1',
    })),
  }
  const pool = { findById: vi.fn(async () => makeItem()) }
  const briefReader = { load: vi.fn(async () => ({ workspaceId: 'ws-1' })) }
  return { briefs, pool, briefReader }
}

function makeController(deps = makeDeps()) {
  const controller = new BriefController(
    deps.briefs as never,
    deps.pool as never,
    deps.briefReader as never,
  )
  return { controller, deps }
}

const req = (overrides: Record<string, unknown> = {}) =>
  ({
    params: { id: 'b-1' },
    body: { mediaPoolItemId: 'item-1' },
    user: { id: 'u-1' },
    ...overrides,
  }) as unknown as Request

beforeEach(() => {
  getWorkspacesByUserId.mockReset()
  getWorkspacesByUserId.mockResolvedValue([{ id: 'ws-1' }])
})

describe('BriefController.deliver', () => {
  it('returns 401 when unauthenticated', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.deliver(req({ user: undefined }), res)
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when the brief id param is missing', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.deliver(req({ params: {} }), res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when mediaPoolItemId is missing from the body', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.deliver(req({ body: {} }), res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when the brief does not exist', async () => {
    const { controller, deps } = makeController()
    deps.briefReader.load.mockResolvedValueOnce(null as never)
    const res = makeRes()
    await controller.deliver(req(), res)
    expect(res.statusCode).toBe(404)
    expect(deps.briefs.deliverBrief).not.toHaveBeenCalled()
  })

  it('returns 403 when the brief workspace is not owned by the user', async () => {
    getWorkspacesByUserId.mockResolvedValueOnce([{ id: 'other-ws' }])
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.deliver(req(), res)
    expect(res.statusCode).toBe(403)
    expect(deps.briefs.deliverBrief).not.toHaveBeenCalled()
  })

  it('returns 404 when the referenced pool item does not exist', async () => {
    const { controller, deps } = makeController()
    deps.pool.findById.mockResolvedValueOnce(null as never)
    const res = makeRes()
    await controller.deliver(req(), res)
    expect(res.statusCode).toBe(404)
    expect(deps.briefs.deliverBrief).not.toHaveBeenCalled()
  })

  it('returns 403 when the pool item belongs to another workspace', async () => {
    const { controller, deps } = makeController()
    deps.pool.findById.mockResolvedValueOnce(makeItem({ workspaceId: 'other-ws' }) as never)
    const res = makeRes()
    await controller.deliver(req(), res)
    expect(res.statusCode).toBe(403)
    expect(deps.briefs.deliverBrief).not.toHaveBeenCalled()
  })

  it('resolves the pool item into media and delegates to deliverBrief on success (R7.8)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.deliver(req(), res)

    expect(deps.briefs.deliverBrief).toHaveBeenCalledTimes(1)
    const [briefId, media] = deps.briefs.deliverBrief.mock.calls[0]
    expect(briefId).toBe('b-1')
    expect(media).toEqual({
      mediaUrl: 'https://cdn/x.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      format: 'png',
    })
    expect(res.statusCode).toBe(200)
    expect((res.body as { success: boolean; slotId: string }).success).toBe(true)
    expect((res.body as { slotId: string }).slotId).toBe('s-1')
  })

  it('reconstructs a video mime type from the pool item format', async () => {
    const { controller, deps } = makeController()
    deps.pool.findById.mockResolvedValueOnce(
      makeItem({ mediaType: 'video', format: 'quicktime', mediaUrl: 'https://cdn/x.mov' }) as never,
    )
    const res = makeRes()
    await controller.deliver(req(), res)
    const media = deps.briefs.deliverBrief.mock.calls[0][1]
    expect(media.mimeType).toBe('video/quicktime')
  })

  it('returns 400 when the delivered media fails validation (R6.5)', async () => {
    const { controller, deps } = makeController()
    deps.briefs.deliverBrief.mockResolvedValueOnce({
      status: 'rejected',
      reason: 'The file type is not supported.',
    } as never)
    const res = makeRes()
    await controller.deliver(req(), res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 409 when the brief was already resolved', async () => {
    const { controller, deps } = makeController()
    deps.briefs.deliverBrief.mockResolvedValueOnce({
      status: 'already-resolved',
      resolution: 'delivered',
    } as never)
    const res = makeRes()
    await controller.deliver(req(), res)
    expect(res.statusCode).toBe(409)
    expect((res.body as { resolution: string }).resolution).toBe('delivered')
  })

  it('returns 404 when deliverBrief reports the brief/slot vanished', async () => {
    const { controller, deps } = makeController()
    deps.briefs.deliverBrief.mockResolvedValueOnce({ status: 'not-found' } as never)
    const res = makeRes()
    await controller.deliver(req(), res)
    expect(res.statusCode).toBe(404)
  })

  it('returns 500 when delegation throws', async () => {
    const { controller, deps } = makeController()
    deps.briefs.deliverBrief.mockRejectedValueOnce(new Error('boom'))
    const res = makeRes()
    await controller.deliver(req(), res)
    expect(res.statusCode).toBe(500)
  })
})
