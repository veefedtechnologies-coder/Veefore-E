/**
 * Auto Pilot — mission setup interpreter route (`POST /setup/interpret`).
 *
 * Backs the AI-driven, conversational mission setup: the client sends the user's
 * natural-language message plus whatever's been collected so far, and this
 * endpoint returns the AI's reply, the merged+validated mission values, the
 * dynamic slide-up form spec (missing required + AI-recommended optional
 * fields), and whether the mission is ready to launch.
 *
 * Protected by `requireAuth` (mirrors the sibling sub-routers). It performs no
 * writes — it only interprets input — so no workspace-ownership mutation guard
 * is needed here; the actual mission is created via the guarded
 * `POST /missions` endpoint.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../../middleware/require-auth'
import { logger } from '../../../config/logger'
import {
  adviseMissionPlan,
  interpretMissionSetup,
  type SetupValues,
} from '../services/missionSetupInterpreter'

const COMPONENT = 'autopilot.SetupRouter'

const setupRouter = Router()

const InterpretBody = z.object({
  message: z.string().min(1).max(4000),
  currentValues: z.record(z.string(), z.unknown()).optional(),
  accountId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
})

const AdviseBody = z.object({
  values: z.record(z.string(), z.unknown()),
  accountId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
})

setupRouter.post('/setup/interpret', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { user?: { id?: string } }).user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = InterpretBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    return
  }

  try {
    const result = await interpretMissionSetup({
      message: parsed.data.message,
      currentValues: (parsed.data.currentValues ?? {}) as SetupValues,
      accountId: parsed.data.accountId,
      workspaceId: parsed.data.workspaceId,
    })
    res.status(200).json({ success: true, ...result })
  } catch (err) {
    const error = err as Error
    logger.error('Auto Pilot setup interpret failed', error, { component: COMPONENT, userId })
    res.status(500).json({ error: 'Failed to interpret setup', message: error.message })
  }
})

// Data-grounded plan review once the mission form is complete (R1.2–R1.4).
setupRouter.post('/setup/advise', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { user?: { id?: string } }).user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = AdviseBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    return
  }

  try {
    const advice = await adviseMissionPlan({
      values: parsed.data.values as SetupValues,
      accountId: parsed.data.accountId,
      workspaceId: parsed.data.workspaceId,
    })
    res.status(200).json({ success: true, ...advice })
  } catch (err) {
    const error = err as Error
    logger.error('Auto Pilot plan advise failed', error, { component: COMPONENT, userId })
    res.status(500).json({ error: 'Failed to advise on plan', message: error.message })
  }
})

export { setupRouter }
export default setupRouter
