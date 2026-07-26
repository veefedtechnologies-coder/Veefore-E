/**
 * Tests for MediaController — the Media_Pool HTTP surface (Task 7.2).
 *
 * These verify the controller's HTTP concerns: authentication, workspace
 * ownership enforcement, R6.5 upload validation, and delegation to
 * MediaPoolService for add/list/remove. Dependencies are injected as fakes so
 * the behaviour is exercised without a database or storage backend. The heavy
 * module-level imports (`mongodb-storage`, the shared StorageService) are
 * mocked so importing the controller never touches a live DB or S3.
 *
 * Satisfies Requirements: 6.1, 6.5, 6.6
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

// Avoid constructing the real StorageService (S3 client) at import time.
vi.mock('../../storage/services/storage.service', () => ({
  getStorageService: () => ({ uploadFile: vi.fn() }),
}))

import { MediaController } from './media.controller'
import { MAX_MEDIA_SIZE_BYTES } from '../services/MediaPoolService'

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
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeDeps() {
  const mediaPool = {
    validateUpload: vi.fn(() => ({ ok: true, mediaType: 'image' })),
    addUpload: vi.fn(async () => ({ added: true, item: makeItem() })),
    listAvailable: vi.fn(async () => [makeItem()]),
    remove: vi.fn(async () => makeItem({ available: false })),
  }
  const missions = { findById: vi.fn(async () => ({ _id: 'm-1', workspaceId: 'ws-1' })) }
  const pool = { findById: vi.fn(async () => makeItem()) }
  const storageService = {
    uploadFile: vi.fn(async () => ({ url: 'https://cdn/stored.png', key: 'k', bucket: 'b', size: 1024, location: 'l' })),
  }
  return { mediaPool, missions, pool, storageService }
}

function makeController(deps = makeDeps()) {
  const controller = new MediaController(
    deps.mediaPool as never,
    deps.missions as never,
    deps.pool as never,
    deps.storageService as never,
  )
  return { controller, deps }
}

const authedFile = {
  buffer: Buffer.from('bytes'),
  originalname: 'x.png',
  mimetype: 'image/png',
  size: 5 * 1024 * 1024,
} as Express.Multer.File

beforeEach(() => {
  getWorkspacesByUserId.mockReset()
  getWorkspacesByUserId.mockResolvedValue([{ id: 'ws-1' }])
})

describe('MediaController.uploadMedia', () => {
  it('returns 401 when unauthenticated', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.uploadMedia({ params: { id: 'm-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when the mission does not exist', async () => {
    const { controller, deps } = makeController()
    deps.missions.findById.mockResolvedValueOnce(null as never)
    const res = makeRes()
    await controller.uploadMedia(
      { params: { id: 'missing' }, user: { id: 'u-1' }, file: authedFile } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when the mission workspace is not owned by the user', async () => {
    getWorkspacesByUserId.mockResolvedValueOnce([{ id: 'other-ws' }])
    const { controller } = makeController()
    const res = makeRes()
    await controller.uploadMedia(
      { params: { id: 'm-1' }, user: { id: 'u-1' }, file: authedFile } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 when no file is attached', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.uploadMedia(
      { params: { id: 'm-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 and does NOT persist when validation fails (R6.5)', async () => {
    const { controller, deps } = makeController()
    deps.mediaPool.validateUpload.mockReturnValueOnce({
      ok: false,
      reason: 'too-large',
      message: 'exceeds the 100MB maximum',
    } as never)
    const res = makeRes()
    await controller.uploadMedia(
      {
        params: { id: 'm-1' },
        user: { id: 'u-1' },
        file: { ...authedFile, size: MAX_MEDIA_SIZE_BYTES + 1 },
      } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(deps.storageService.uploadFile).not.toHaveBeenCalled()
    expect(deps.mediaPool.addUpload).not.toHaveBeenCalled()
  })

  it('stores the file and adds it to the pool on success (R6.1)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.uploadMedia(
      { params: { id: 'm-1' }, user: { id: 'u-1' }, file: authedFile } as unknown as Request,
      res,
    )
    expect(deps.storageService.uploadFile).toHaveBeenCalledTimes(1)
    expect(deps.mediaPool.addUpload).toHaveBeenCalledTimes(1)
    const addArg = deps.mediaPool.addUpload.mock.calls[0][0]
    expect(addArg.mediaUrl).toBe('https://cdn/stored.png')
    expect(addArg.workspaceId).toBe('ws-1')
    expect(res.statusCode).toBe(201)
    expect((res.body as { success: boolean }).success).toBe(true)
  })
})

describe('MediaController.listMedia', () => {
  it('lists available pool items for an owned mission (R6)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.listMedia(
      { params: { id: 'm-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(deps.mediaPool.listAvailable).toHaveBeenCalledWith('ws-1')
    expect(res.statusCode).toBe(200)
    expect((res.body as { items: unknown[] }).items).toHaveLength(1)
  })

  it('returns 403 for a mission in another workspace', async () => {
    getWorkspacesByUserId.mockResolvedValueOnce([{ id: 'other-ws' }])
    const { controller } = makeController()
    const res = makeRes()
    await controller.listMedia(
      { params: { id: 'm-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(403)
  })
})

describe('MediaController.deleteMedia', () => {
  it('removes an owned pool item (R6.6)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.deleteMedia(
      { params: { itemId: 'item-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(deps.mediaPool.remove).toHaveBeenCalledWith('item-1')
    expect(res.statusCode).toBe(200)
    expect((res.body as { success: boolean }).success).toBe(true)
  })

  it('returns 404 when the item does not exist', async () => {
    const { controller, deps } = makeController()
    deps.pool.findById.mockResolvedValueOnce(null as never)
    const res = makeRes()
    await controller.deleteMedia(
      { params: { itemId: 'nope' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(404)
    expect(deps.mediaPool.remove).not.toHaveBeenCalled()
  })

  it('returns 403 when the item belongs to another workspace', async () => {
    getWorkspacesByUserId.mockResolvedValueOnce([{ id: 'other-ws' }])
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.deleteMedia(
      { params: { itemId: 'item-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(403)
    expect(deps.mediaPool.remove).not.toHaveBeenCalled()
  })
})
