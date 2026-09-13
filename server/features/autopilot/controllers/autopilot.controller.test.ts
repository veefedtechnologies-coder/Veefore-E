/**
 * Tests for AutoPilotController — the Mission lifecycle HTTP surface (Task 18.1).
 *
 * These verify the controller's HTTP concerns: authentication, workspace
 * ownership enforcement, zod validation, lifecycle transitions (which drive the
 * loop scheduler), and delegation to the repositories / audit service for
 * slots, activity log, budget raise, and undo. Dependencies are injected as
 * fakes so behaviour is exercised without a database, Redis, or notification
 * transport. The heavy module-level imports are mocked so importing the
 * controller never touches a live DB / queue.
 *
 * Satisfies Requirements: 1.1, 1.5, 1.6, 1.7, 1.8, 3.5, 14.5, 16.1
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

// Avoid touching Redis/BullMQ when the controller module imports the queue manager.
vi.mock('../queues/autopilotLoopQueue', () => ({
  AutopilotLoopQueueManager: {
    scheduleMission: vi.fn(async () => true),
    removeMission: vi.fn(async () => true),
  },
}))

// Avoid registering the real Mongoose model at import time.
vi.mock('../db/models/AutoPilotAuditRecordModel', () => ({
  AutoPilotAuditRecordModel: {},
}))

// Avoid touching the live social-account store when the controller module
// imports the service for its default connected-account checker (Task 18.2).
vi.mock('../../../services/SocialAccountService', () => ({
  socialAccountService: { getAccountByPlatform: vi.fn(async () => null) },
}))

import { AutoPilotController } from './autopilot.controller'

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

function makeMission(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'm-1',
    workspaceId: 'ws-1',
    accountId: 'ig-1',
    platform: 'instagram',
    goal: { metric: 'followers', targetValue: 1000, startValue: 100 },
    niche: 'fitness',
    brandVoice: 'energetic',
    operatingMode: 'copilot',
    contentSourcePreference: 'user-first',
    guardrails: {
      bannedTopics: [],
      postingFrequency: { count: 3, per: 'week', windowMs: 604800000 },
      creditBudget: 500,
      approvalRequiredActions: [],
    },
    strategyMemory: [],
    progress: [],
    status: 'draft',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeDeps() {
  const missions = {
    create: vi.fn(async (doc: Record<string, unknown>) => makeMission(doc)),
    findById: vi.fn(async () => makeMission()),
    findAllByWorkspace: vi.fn(async () => [makeMission()]),
    updateById: vi.fn(async (_id: string, patch: Record<string, unknown>) => makeMission(patch)),
    updateStatus: vi.fn(async (_id: string, status: string) => makeMission({ status })),
    deleteById: vi.fn(async () => true),
  }
  const slots = {
    findUpcomingByMission: vi.fn(async () => [
      {
        _id: 's-1',
        missionId: 'm-1',
        workspaceId: 'ws-1',
        scheduledAt: new Date('2024-02-01T00:00:00Z'),
        format: 'reel',
        theme: 'tips',
        source: { kind: 'ai-generated' },
        status: 'planned',
      },
    ]),
  }
  const audit = { reverse: vi.fn(async () => ({ reversed: true, declined: false, message: 'ok', auditId: 'a-1', action: 'publish' })) }
  const loop = {
    scheduleMission: vi.fn(async () => true),
    removeMission: vi.fn(async () => true),
  }
  const auditLog = {
    listByMission: vi.fn(async () => [
      {
        _id: 'a-1',
        missionId: 'm-1',
        stage: 'ACT',
        action: 'publish',
        triggeringContext: {},
        outcome: 'success',
        reversible: true,
        createdAt: new Date('2024-01-02T00:00:00Z'),
      },
    ]),
    findById: vi.fn(async () => ({ _id: 'a-1', missionId: 'm-1', action: 'publish', reversible: true })),
  }
  // Connected-account checker port (Task 18.2, R1.6) — defaults to "connected".
  const accounts = { hasConnectedAccount: vi.fn(async () => true) }
  // Pending Approval_Cards reader (Task 19.4, R16.4) — Mission Control widget.
  const approvals = {
    findPendingByMission: vi.fn(async () => [
      {
        _id: 'ap-1',
        missionId: 'm-1',
        workspaceId: 'ws-1',
        itemType: 'content-slot',
        itemRef: 's-1',
        status: 'pending',
        createdAt: new Date('2024-01-03T00:00:00Z'),
        updatedAt: new Date('2024-01-03T00:00:00Z'),
      },
    ]),
  }
  return { missions, slots, audit, loop, auditLog, accounts, approvals }
}

function makeController(deps = makeDeps()) {
  const controller = new AutoPilotController(
    deps.missions as never,
    deps.slots as never,
    deps.audit as never,
    deps.loop as never,
    deps.auditLog as never,
    deps.accounts as never,
    deps.approvals as never,
  )
  return { controller, deps }
}

const validCreateBody = {
  workspaceId: 'ws-1',
  accountId: 'ig-1',
  goal: { metric: 'followers', targetValue: 1000 },
  niche: 'fitness',
  brandVoice: 'energetic and motivating',
  operatingMode: 'copilot',
  guardrails: { creditBudget: 500 },
}

beforeEach(() => {
  getWorkspacesByUserId.mockReset()
  getWorkspacesByUserId.mockResolvedValue([{ id: 'ws-1' }])
})

describe('AutoPilotController.createMission', () => {
  it('returns 401 when unauthenticated', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.createMission({ body: validCreateBody } as unknown as Request, res)
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when the body is invalid (R1.2 bounds)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.createMission(
      { user: { id: 'u-1' }, body: { ...validCreateBody, goal: { metric: 'followers', targetValue: 0 } } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(deps.missions.create).not.toHaveBeenCalled()
  })

  it('returns 403 when the target workspace is not owned', async () => {
    getWorkspacesByUserId.mockResolvedValueOnce([{ id: 'other-ws' }])
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.createMission(
      { user: { id: 'u-1' }, body: validCreateBody } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(403)
    expect(deps.missions.create).not.toHaveBeenCalled()
  })

  it('creates a draft mission on success (R1.1)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.createMission(
      { user: { id: 'u-1' }, body: validCreateBody } as unknown as Request,
      res,
    )
    expect(deps.missions.create).toHaveBeenCalledTimes(1)
    const arg = deps.missions.create.mock.calls[0][0]
    expect(arg.status).toBe('draft')
    expect(arg.platform).toBe('instagram')
    expect(res.statusCode).toBe(201)
    expect((res.body as { success: boolean }).success).toBe(true)
  })
})

describe('AutoPilotController.listMissions', () => {
  it('lists missions for an owned workspace (R16.1)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.listMissions(
      { user: { id: 'u-1' }, query: { workspaceId: 'ws-1' } } as unknown as Request,
      res,
    )
    expect(deps.missions.findAllByWorkspace).toHaveBeenCalledWith('ws-1')
    expect(res.statusCode).toBe(200)
    expect((res.body as { missions: unknown[] }).missions).toHaveLength(1)
  })

  it('returns 400 when workspaceId is missing', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.listMissions({ user: { id: 'u-1' }, query: {} } as unknown as Request, res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 403 for a workspace the user does not own', async () => {
    getWorkspacesByUserId.mockResolvedValueOnce([{ id: 'other-ws' }])
    const { controller } = makeController()
    const res = makeRes()
    await controller.listMissions(
      { user: { id: 'u-1' }, query: { workspaceId: 'ws-1' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(403)
  })
})

describe('AutoPilotController.getMission', () => {
  it('returns 404 when the mission does not exist', async () => {
    const { controller, deps } = makeController()
    deps.missions.findById.mockResolvedValueOnce(null as never)
    const res = makeRes()
    await controller.getMission({ user: { id: 'u-1' }, params: { id: 'nope' } } as unknown as Request, res)
    expect(res.statusCode).toBe(404)
  })

  it('returns the mission for an owner (R16.4)', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.getMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(200)
    expect((res.body as { mission: { id: string } }).mission.id).toBe('m-1')
  })
})

describe('AutoPilotController.updateMission', () => {
  it('merges guardrails onto the existing block (R1.8, R13.4)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.updateMission(
      { user: { id: 'u-1' }, params: { id: 'm-1' }, body: { guardrails: { creditBudget: 800 } } } as unknown as Request,
      res,
    )
    expect(deps.missions.updateById).toHaveBeenCalledTimes(1)
    const patch = deps.missions.updateById.mock.calls[0][1]
    expect(patch.guardrails.creditBudget).toBe(800)
    // Untouched guardrail fields are preserved by the merge.
    expect(patch.guardrails.postingFrequency).toBeDefined()
    expect(res.statusCode).toBe(200)
  })

  it('returns 400 when no updatable field is present', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.updateMission(
      { user: { id: 'u-1' }, params: { id: 'm-1' }, body: {} } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(400)
  })
})

describe('AutoPilotController.deleteMission', () => {
  it('removes the loop job then deletes the mission', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.deleteMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(deps.loop.removeMission).toHaveBeenCalledWith('m-1')
    expect(deps.missions.deleteById).toHaveBeenCalledWith('m-1')
    expect(res.statusCode).toBe(200)
  })
})

describe('AutoPilotController lifecycle', () => {
  it('activate: draft → active and schedules the loop (R3)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(deps.missions.updateStatus).toHaveBeenCalledWith('m-1', 'active')
    expect(deps.loop.scheduleMission).toHaveBeenCalledWith({ missionId: 'm-1', workspaceId: 'ws-1' })
    expect(res.statusCode).toBe(200)
  })

  it('activate: rejects a mission that is already active (409)', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(makeMission({ status: 'active' }) as never)
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(409)
    expect(deps.loop.scheduleMission).not.toHaveBeenCalled()
  })

  it('activate: rejects when the goal target metric is missing (400, R1.3)', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(
      makeMission({ goal: { metric: 'followers', startValue: 0 } }) as never,
    )
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(400)
    expect((res.body as { field: string }).field).toBe('goal.targetValue')
    expect(deps.missions.updateStatus).not.toHaveBeenCalled()
    expect(deps.loop.scheduleMission).not.toHaveBeenCalled()
  })

  it('activate: rejects when the target date is in the past (400, R1.4)', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(
      makeMission({
        goal: { metric: 'followers', targetValue: 1000, startValue: 0, targetDate: new Date('2000-01-01T00:00:00Z') },
      }) as never,
    )
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(400)
    expect((res.body as { field: string }).field).toBe('goal.targetDate')
    expect(deps.missions.updateStatus).not.toHaveBeenCalled()
    expect(deps.loop.scheduleMission).not.toHaveBeenCalled()
  })

  it('activate: rejects when the workspace has no connected IG account (400, R1.6)', async () => {
    const deps = makeDeps()
    deps.accounts.hasConnectedAccount.mockResolvedValue(false)
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(deps.accounts.hasConnectedAccount).toHaveBeenCalledWith('ws-1', 'instagram')
    expect(res.statusCode).toBe(400)
    expect((res.body as { field: string }).field).toBe('account')
    expect(deps.missions.updateStatus).not.toHaveBeenCalled()
    expect(deps.loop.scheduleMission).not.toHaveBeenCalled()
  })

  it('activate: declines an unsupported-platform mission, retains it, and never touches the account/loop (400)', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(makeMission({ platform: 'tiktok' }) as never)
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(400)
    expect((res.body as { field: string }).field).toBe('platform')
    expect((res.body as { message: string }).message).toMatch(/Instagram and Facebook/i)
    // Mission definition retained: nothing mutated, loop never scheduled, and the
    // unsupported platform is declined before the connected-account lookup.
    expect(deps.accounts.hasConnectedAccount).not.toHaveBeenCalled()
    expect(deps.missions.updateStatus).not.toHaveBeenCalled()
    expect(deps.loop.scheduleMission).not.toHaveBeenCalled()
  })

  it('activate: accepts a Facebook Page mission with a connected account', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(makeMission({ platform: 'facebook' }) as never)
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(deps.accounts.hasConnectedAccount).toHaveBeenCalledWith('ws-1', 'facebook')
    expect(deps.missions.updateStatus).toHaveBeenCalledWith('m-1', 'active')
    expect(deps.loop.scheduleMission).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
  })

  it('activate: accepts an Instagram mission whose platform casing differs (R18.6)', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(makeMission({ platform: 'Instagram' }) as never)
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(200)
    expect(deps.missions.updateStatus).toHaveBeenCalledWith('m-1', 'active')
  })

  it('activate: accepts a valid mission with a future target date and connected account (R1.3, R1.4, R1.6)', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(
      makeMission({
        goal: { metric: 'followers', targetValue: 1000, startValue: 0, targetDate: new Date(Date.now() + 86_400_000) },
      }) as never,
    )
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.activateMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(deps.accounts.hasConnectedAccount).toHaveBeenCalledWith('ws-1', 'instagram')
    expect(deps.missions.updateStatus).toHaveBeenCalledWith('m-1', 'active')
    expect(deps.loop.scheduleMission).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
  })

  it('pause: active → paused and removes the loop job (R3.5, R3.6)', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(makeMission({ status: 'active' }) as never)
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.pauseMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(deps.loop.removeMission).toHaveBeenCalledWith('m-1')
    expect(deps.missions.updateStatus).toHaveBeenCalledWith('m-1', 'paused')
    expect(res.statusCode).toBe(200)
  })

  it('pause: rejects a non-active mission (409)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.pauseMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(409)
    expect(deps.loop.removeMission).not.toHaveBeenCalled()
  })

  it('resume: paused → active and re-schedules the loop (R3.5)', async () => {
    const deps = makeDeps()
    deps.missions.findById.mockResolvedValue(makeMission({ status: 'paused' }) as never)
    const { controller } = makeController(deps)
    const res = makeRes()
    await controller.resumeMission({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(deps.missions.updateStatus).toHaveBeenCalledWith('m-1', 'active')
    expect(deps.loop.scheduleMission).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
  })
})

describe('AutoPilotController.listSlots', () => {
  it('lists upcoming slots for an owned mission (R2.5)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.listSlots({ user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request, res)
    expect(deps.slots.findUpcomingByMission).toHaveBeenCalledWith('m-1')
    expect(res.statusCode).toBe(200)
    expect((res.body as { slots: unknown[] }).slots).toHaveLength(1)
  })
})

describe('AutoPilotController.listActivity', () => {
  it('returns the mission audit log newest-first, capped by limit (R16.4, R17)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.listActivity(
      { user: { id: 'u-1' }, params: { id: 'm-1' }, query: { limit: '10' } } as unknown as Request,
      res,
    )
    expect(deps.auditLog.listByMission).toHaveBeenCalledWith('m-1', 10)
    expect(res.statusCode).toBe(200)
    expect((res.body as { activity: unknown[] }).activity).toHaveLength(1)
  })

  it('clamps an over-large limit to the maximum', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.listActivity(
      { user: { id: 'u-1' }, params: { id: 'm-1' }, query: { limit: '9999' } } as unknown as Request,
      res,
    )
    expect(deps.auditLog.listByMission).toHaveBeenCalledWith('m-1', 200)
  })
})

describe('AutoPilotController.listApprovals', () => {
  it('returns pending approvals with a count for an owned mission (R16.4)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.listApprovals(
      { user: { id: 'u-1' }, params: { id: 'm-1' } } as unknown as Request,
      res,
    )
    expect(deps.approvals.findPendingByMission).toHaveBeenCalledWith('m-1')
    expect(res.statusCode).toBe(200)
    const body = res.body as { count: number; approvals: Array<{ itemType: string }> }
    expect(body.count).toBe(1)
    expect(body.approvals).toHaveLength(1)
    expect(body.approvals[0].itemType).toBe('content-slot')
  })

  it('returns 404 when the mission does not exist', async () => {
    const { controller, deps } = makeController()
    deps.missions.findById.mockResolvedValueOnce(null as never)
    const res = makeRes()
    await controller.listApprovals(
      { user: { id: 'u-1' }, params: { id: 'nope' } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(404)
    expect(deps.approvals.findPendingByMission).not.toHaveBeenCalled()
  })
})

describe('AutoPilotController.raiseBudget', () => {
  it('raises the credit budget (R14.5)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.raiseBudget(
      { user: { id: 'u-1' }, params: { id: 'm-1' }, body: { creditBudget: 800 } } as unknown as Request,
      res,
    )
    expect(deps.missions.updateById).toHaveBeenCalledTimes(1)
    const patch = deps.missions.updateById.mock.calls[0][1]
    expect(patch.guardrails.creditBudget).toBe(800)
    expect(res.statusCode).toBe(200)
  })

  it('rejects a budget that is not a genuine raise (400)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.raiseBudget(
      { user: { id: 'u-1' }, params: { id: 'm-1' }, body: { creditBudget: 400 } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(deps.missions.updateById).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range budget via zod (400)', async () => {
    const { controller } = makeController()
    const res = makeRes()
    await controller.raiseBudget(
      { user: { id: 'u-1' }, params: { id: 'm-1' }, body: { creditBudget: 2_000_000 } } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(400)
  })
})

describe('AutoPilotController.undoAction', () => {
  it('reverses a reversible action and returns 200 (R13.6, R17.2)', async () => {
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.undoAction({ user: { id: 'u-1' }, params: { auditId: 'a-1' } } as unknown as Request, res)
    expect(deps.audit.reverse).toHaveBeenCalledWith('a-1', { userId: 'u-1' })
    expect(res.statusCode).toBe(200)
    expect((res.body as { success: boolean }).success).toBe(true)
  })

  it('returns 404 when the audit record is missing', async () => {
    const { controller, deps } = makeController()
    deps.auditLog.findById.mockResolvedValueOnce(null as never)
    const res = makeRes()
    await controller.undoAction({ user: { id: 'u-1' }, params: { auditId: 'nope' } } as unknown as Request, res)
    expect(res.statusCode).toBe(404)
    expect(deps.audit.reverse).not.toHaveBeenCalled()
  })

  it('returns 409 when the action is declined (not reversible)', async () => {
    const { controller, deps } = makeController()
    deps.audit.reverse.mockResolvedValueOnce({
      reversed: false,
      declined: true,
      message: 'cannot undo',
      auditId: 'a-1',
      action: 'publish',
      reason: 'not-reversible',
    } as never)
    const res = makeRes()
    await controller.undoAction({ user: { id: 'u-1' }, params: { auditId: 'a-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(409)
  })

  it('returns 422 when the reversal was attempted but failed', async () => {
    const { controller, deps } = makeController()
    deps.audit.reverse.mockResolvedValueOnce({
      reversed: false,
      declined: false,
      message: 'no changes applied',
      auditId: 'a-1',
      action: 'publish',
      reason: 'reversal-failed',
    } as never)
    const res = makeRes()
    await controller.undoAction({ user: { id: 'u-1' }, params: { auditId: 'a-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(422)
  })

  it('returns 403 when the action belongs to another workspace', async () => {
    getWorkspacesByUserId.mockResolvedValueOnce([{ id: 'other-ws' }])
    const { controller, deps } = makeController()
    const res = makeRes()
    await controller.undoAction({ user: { id: 'u-1' }, params: { auditId: 'a-1' } } as unknown as Request, res)
    expect(res.statusCode).toBe(403)
    expect(deps.audit.reverse).not.toHaveBeenCalled()
  })
})
