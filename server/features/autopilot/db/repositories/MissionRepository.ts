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
}

export const missionRepository = new MissionRepository()
