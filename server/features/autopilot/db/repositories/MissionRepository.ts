/**
 * Auto Pilot — MissionRepository.
 *
 * Data access for `AutoPilotMissionModel`, extending the shared
 * `BaseRepository` CRUD surface with workspace-scoped and loop-oriented
 * queries (design "Data Models" · R1, R2, R3). Active missions are polled by
 * the Operating Loop, so the hot paths (by workspace, by status) match the
 * model's compound indexes.
 *
 * Satisfies Requirements: 1, 17
 */

import { BaseRepository, PaginationOptions } from '../../../../repositories/BaseRepository'
import {
  AutoPilotMissionModel,
  type IAutoPilotMission,
  type MissionStatus,
  type IMissionProgressPoint,
} from '../models'

export class MissionRepository extends BaseRepository<IAutoPilotMission> {
  constructor() {
    super(AutoPilotMissionModel, 'AutoPilotMission')
  }

  /** List missions for a workspace (Mission Control) — most recent first. */
  async findByWorkspace(workspaceId: unknown, options?: PaginationOptions) {
    return this.findMany({ workspaceId } as any, options)
  }

  /** All missions for a workspace as a flat array (no pagination). */
  async findAllByWorkspace(workspaceId: unknown): Promise<IAutoPilotMission[]> {
    return this.findAll({ workspaceId } as any)
  }

  /** The mission bound to a workspace + connected account (1:1 per R1.4). */
  async findByWorkspaceAndAccount(
    workspaceId: unknown,
    accountId: string
  ): Promise<IAutoPilotMission | null> {
    return this.findOne({ workspaceId, accountId } as any)
  }

  /** Active missions — the Operating Loop scheduler polls these. */
  async findActiveMissions(workspaceId?: unknown): Promise<IAutoPilotMission[]> {
    const filter: Record<string, unknown> = { status: 'active' }
    if (workspaceId !== undefined) filter.workspaceId = workspaceId
    return this.findAll(filter as any)
  }

  /** Missions in a given status for a workspace. */
  async findByWorkspaceAndStatus(
    workspaceId: unknown,
    status: MissionStatus,
    options?: PaginationOptions
  ) {
    return this.findMany({ workspaceId, status } as any, options)
  }

  /** Transition the mission lifecycle status (draft → active ⇄ paused → …). */
  async updateStatus(
    missionId: string,
    status: MissionStatus
  ): Promise<IAutoPilotMission | null> {
    return this.updateById(missionId, { status } as any)
  }

  /** Persist the latest THINK-stage strategy output. */
  async updateStrategy(
    missionId: string,
    strategy: Record<string, unknown>
  ): Promise<IAutoPilotMission | null> {
    return this.updateById(missionId, { strategy } as any)
  }

  /** Append a MEASURE-stage progress point to the mission history. */
  async appendProgress(
    missionId: string,
    point: IMissionProgressPoint
  ): Promise<IAutoPilotMission | null> {
    return this.model
      .findByIdAndUpdate(
        missionId,
        { $push: { progress: point }, $set: { updatedAt: new Date() } },
        { new: true }
      )
      .exec()
  }

  /** Append a LEARN-stage insight to the mission's strategy memory. */
  async appendStrategyMemory(
    missionId: string,
    insight: Record<string, unknown>
  ): Promise<IAutoPilotMission | null> {
    return this.model
      .findByIdAndUpdate(
        missionId,
        { $push: { strategyMemory: insight }, $set: { updatedAt: new Date() } },
        { new: true }
      )
      .exec()
  }

  /** Stamp the time an Operating-Loop iteration last ran. */
  async markIteration(
    missionId: string,
    at: Date = new Date()
  ): Promise<IAutoPilotMission | null> {
    return this.updateById(missionId, { lastIterationAt: at } as any)
  }

  /**
   * Persist the consecutive backing-service outage streak (R18.4/R18.5). The
   * Operating-Loop orchestrator increments this on each outage iteration and
   * resets it to 0 after a successful one.
   */
  async updateOutageStreak(
    missionId: string,
    streak: number
  ): Promise<IAutoPilotMission | null> {
    return this.updateById(missionId, {
      consecutiveOutageStreak: Math.max(0, Math.floor(streak)),
    } as any)
  }

  /**
   * Append an agent memory entry to the mission's persistent memory log.
   * This is the Auto Pilot's long-term memory — it records key autonomous
   * decisions (posts published, automations activated), user instructions
   * received, and approval/rejection events so the agent can reference what
   * it has already done across restarts and build on prior context.
   *
   * Capped at the last 100 entries via a $push + $slice so the document size
   * stays bounded regardless of mission longevity.
   */
  async appendAgentMemory(
    missionId: string,
    entry: {
      role: 'agent' | 'user' | 'system'
      content: string
      at?: Date
      type?: 'published' | 'automation' | 'decision' | 'instruction' | 'approval' | 'rejection'
    }
  ): Promise<void> {
    try {
      const memEntry = { ...entry, at: entry.at ?? new Date() }
      await this.model
        .findByIdAndUpdate(
          missionId,
          {
            // $push with $each + $slice keeps only the last 100 entries.
            $push: {
              agentMemory: {
                $each: [memEntry],
                $slice: -100,
              },
            },
            $set: { updatedAt: new Date() },
          },
          { new: false }
        )
        .exec()
    } catch {
      /* best-effort — memory write failure must never break the loop */
    }
  }

  /**
   * Load the last N agent memory entries for a mission. Used to build the
   * agent's context when it needs to recall what it has done previously.
   * Returns an empty array when the mission has no memory yet.
   */
  async getAgentMemory(
    missionId: string,
    limit = 20
  ): Promise<IAutoPilotMission['agentMemory']> {
    try {
      const mission = await this.model
        .findById(missionId, { agentMemory: { $slice: -limit } })
        .exec()
      return (mission?.agentMemory ?? []) as IAutoPilotMission['agentMemory']
    } catch {
      return []
    }
  }
}

export const missionRepository = new MissionRepository()
