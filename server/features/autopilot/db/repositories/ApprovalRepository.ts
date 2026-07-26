/**
 * Auto Pilot — ApprovalRepository.
 *
 * Data access for `ApprovalModel`, extending `BaseRepository` with the GATE
 * stage's pending-approval and expiry-sweep queries. Reads are scoped by
 * mission/workspace and match the model's compound indexes
 * (design "Data Models" · R4, R5).
 *
 * Satisfies Requirements: 1, 6, 17
 */

import { BaseRepository, PaginationOptions } from '../../../../repositories/BaseRepository'
import {
  ApprovalModel,
  type IApproval,
  type ApprovalStatus,
} from '../models'

export class ApprovalRepository extends BaseRepository<IApproval> {
  constructor() {
    super(ApprovalModel, 'Approval')
  }

  /** Pending approvals for a mission (Mission Control count + list). */
  async findPendingByMission(missionId: string): Promise<IApproval[]> {
    return this.findAll({ missionId, status: 'pending' } as any)
  }

  /** Count pending approvals for a mission (dashboard badge). */
  async countPendingByMission(missionId: string): Promise<number> {
    return this.count({ missionId, status: 'pending' } as any)
  }

  /** Paginated approvals for a workspace. */
  async findByWorkspace(workspaceId: unknown, options?: PaginationOptions) {
    return this.findMany({ workspaceId } as any, options)
  }

  /** Pending approvals whose publish-time expiry has passed (expiry sweep). */
  async findExpired(now: Date = new Date()): Promise<IApproval[]> {
    return this.findAll({
      status: 'pending',
      expiresAt: { $lte: now },
    } as any)
  }

  /** The approval backing a specific item (slot/caption/automation/…). */
  async findByItem(
    itemType: IApproval['itemType'],
    itemRef: string
  ): Promise<IApproval | null> {
    return this.findOne({ itemType, itemRef } as any)
  }

  /** Record a decision on an approval, stamping `decidedAt`. */
  async decide(
    approvalId: string,
    status: ApprovalStatus,
    editedPayload?: Record<string, unknown>
  ): Promise<IApproval | null> {
    const update: Record<string, unknown> = { status, decidedAt: new Date() }
    if (editedPayload !== undefined) update.editedPayload = editedPayload
    return this.updateById(approvalId, update as any)
  }

  /** Mark a pending approval expired (fallback path when publish time hits). */
  async markExpired(approvalId: string): Promise<IApproval | null> {
    return this.updateById(approvalId, {
      status: 'expired',
      decidedAt: new Date(),
    } as any)
  }
}

export const approvalRepository = new ApprovalRepository()
