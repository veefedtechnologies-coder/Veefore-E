/**
 * Tests for ApprovalController — the Approval_Card lifecycle HTTP surface (Task 13.2).
 *
 * These verify the controller's HTTP concerns: authentication, workspace
 * ownership enforcement (via the approval's mission workspace), request
 * validation, and delegation to ApprovalLifecycleService for approve/edit/reject.
 * Dependencies are injected as fakes so the behaviour is exercised without a
 * database. The `mongodb-storage` singleton is mocked so importing the controller
 * never touches a live DB.
 *
 * Satisfies Requirements: 4.3, 4.4, 4.5, 4.6, 5.3, 11.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

const getWorkspacesByUserId = vi.fn()
vi.mock('../../../mongodb-storage', () => ({
  storage: {
    getWorkspacesByUserId: (...args: unknown[]) => getWorkspacesByUserId(...args),
  },
}))

import { ApprovalController } from './approval.controller'

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

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'approval-1',
    missionId: 'mission-1',
    workspaceId: 'ws-1',
    itemType: 'caption',
    itemRef: 'slot-1',
    status: 'pending',
    ...overrides,
  }
}

function makeDeps() {
  const lifecycle = {
    approve: vi.fn(async () => ({ status: 'approved', approval: makeApproval({ status: 'approved' }), executable: true })),
    edit: vi.fn(async () => ({ status: 'edited', approval: makeApproval({ status: 'edited' }), executable: true })),
    reject: vi.fn(async () => ({ status: 'rejected', approval: makeApproval({ status: 'rejected' }), slotResolution: 'rescheduled' })),
  }
  const approvals = { findById: vi.fn(async () => makeApproval()) }
  const missions = { findById: vi.fn(async () => ({ _id: 'mission-1', workspaceId: 'ws-1' })) }
  return { lifecycle, approvals, missions }
}

function makeController(deps = makeDeps()) {
  const controller = new ApprovalController(
    deps.lifecycle as never,
    deps.approvals as never,
    deps.missions as never,
  )
  return { controller, deps }
}

beforeEach(() => {
  getWorkspacesByUserId.mockReset()
  getWorkspacesByUserId.mockResolvedValue([{ id: 'ws-1' }])
})

describe('ApprovalController.approve (R4.6)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.approve({ params: { id: 'approval-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when the approval does not exist', async () => {
    const { controller, deps } = makeController()
    deps.approvals.findById.mockResolvedValueOnce(null as never)
    const res = makeRes()
    await controller.approve(
      { params: { id: 'missing' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when the approval workspace is not owned by the user', async () => {
    getWorkspacesByUserId.mockResolvedValueOnce([{ id: 'other-ws' }])
    const { controller } = makeController()
    const res = makeRes()
    await controller.approve(
      { params: { id: 'approval-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(403)
  })

  it('approves an owned pending approval (R4.6)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.approve(
      { params: { id: 'approval-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(deps.lifecycle.approve).toHaveBeenCalledWith('approval-1')
    expect(res.statusCode).toBe(200)
    expect((res.body as { success: boolean }).success).toBe(true)
  })

  it('returns 409 when already decided', async () => {
    const { controller, deps } = makeController()
    deps.lifecycle.approve.mockResolvedValueOnce({ status: 'already-decided', currentStatus: 'approved' } as never)
    const res = makeRes()
    await controller.approve(
      { params: { id: 'approval-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(409)
  })
})

describe('ApprovalController.edit (R4.3/R4.4)', () => {
  it('applies a clean edit → 200', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.edit(
      {
        params: { id: 'approval-1' },
        user: { id: 'u-1' },
        body: { editedPayload: { content: 'clean caption' } },
      } as unknown as Request,
      res,
    )
    expect(deps.lifecycle.edit).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
  })

  it('returns 422 when the edit violates guardrails (R4.4)', async () => {
    const { controller, deps } = makeController()
    deps.lifecycle.edit.mockResolvedValueOnce({
      status: 'edit-rejected',
      violations: [{ kind: 'banned-topic', detail: 'Content includes banned topic "politics".' }],
      message: 'rejected',
    } as never)
    const res = makeRes()
    await controller.edit(
      {
        params: { id: 'approval-1' },
        user: { id: 'u-1' },
        body: { editedPayload: { content: 'politics' } },
      } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(422)
    expect((res.body as { violations: unknown[] }).violations).toHaveLength(1)
  })

  it('returns 400 when the body is invalid', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.edit(
      { params: { id: 'approval-1' }, user: { id: 'u-1' }, body: {} } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(400)
  })

  it('forwards revalidation facts (credits / time) to the service', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.edit(
      {
        params: { id: 'approval-1' },
        user: { id: 'u-1' },
        body: {
          editedPayload: { content: 'clean' },
          revalidation: { credits: { consumed: 10, estimatedCost: 5 }, at: 1000 },
        },
      } as unknown as Request,
      res,
    )
    const arg = deps.lifecycle.edit.mock.calls[0]
    expect(arg[1]).toEqual({ content: 'clean' })
    expect(arg[2].credits).toEqual({ consumed: 10, estimatedCost: 5 })
    expect(arg[2].at).toBe(1000)
  })
})

describe('ApprovalController.reject (R4.5/R5.3/R11.7)', () => {
  it('rejects an owned approval and returns the slot resolution', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.reject(
      { params: { id: 'approval-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(deps.lifecycle.reject).toHaveBeenCalledWith('approval-1')
    expect(res.statusCode).toBe(200)
    expect((res.body as { slotResolution: unknown }).slotResolution).toBe('rescheduled')
  })

  it('returns 409 when already decided', async () => {
    const { controller, deps } = makeController()
    deps.lifecycle.reject.mockResolvedValueOnce({ status: 'already-decided', currentStatus: 'rejected' } as never)
    const res = makeRes()
    await controller.reject(
      { params: { id: 'approval-1' }, user: { id: 'u-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(409)
  })
})
