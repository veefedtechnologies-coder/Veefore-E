/**
 * Auto Pilot — ContentSlotRepository.
 *
 * Data access for `ContentSlotModel`, extending `BaseRepository` with the
 * planner-refresh, scheduler, and publish-guard queries described in the
 * design. Reads are scoped by mission/workspace and ordered by `scheduledAt`
 * to match the model's compound indexes (design "Data Models" · R2, R7, R12).
 *
 * Satisfies Requirements: 1, 6, 17
 */

import { BaseRepository, PaginationOptions } from '../../../../repositories/BaseRepository'
import {
  ContentSlotModel,
  type IContentSlot,
  type ContentSlotStatus,
} from '../models'

export class ContentSlotRepository extends BaseRepository<IContentSlot> {
  constructor() {
    super(ContentSlotModel, 'ContentSlot')
  }

  /** All slots for a mission (planner refresh), earliest scheduled first. */
  async findByMission(missionId: string): Promise<IContentSlot[]> {
    return this.model.find({ missionId }).sort({ scheduledAt: 1 }).exec()
  }

  /** Upcoming slots for a mission from `from` onward (content plan view). */
  async findUpcomingByMission(
    missionId: string,
    from: Date = new Date()
  ): Promise<IContentSlot[]> {
    return this.model
      .find({ missionId, scheduledAt: { $gte: from } })
      .sort({ scheduledAt: 1 })
      .exec()
  }

  /** Slots for a mission in a given status. */
  async findByMissionAndStatus(
    missionId: string,
    status: ContentSlotStatus
  ): Promise<IContentSlot[]> {
    return this.model.find({ missionId, status }).sort({ scheduledAt: 1 }).exec()
  }

  /** Scheduled slots due for publishing at or before `now` (publish guard). */
  async findDueForPublishing(now: Date = new Date()): Promise<IContentSlot[]> {
    return this.findAll({ status: 'scheduled', scheduledAt: { $lte: now } } as any)
  }

  /** Paginated slots for a workspace (Mission Control / admin views). */
  async findByWorkspace(workspaceId: unknown, options?: PaginationOptions) {
    return this.findMany({ workspaceId } as any, options)
  }

  /** Transition a slot's status (planned → … → published/failed/cancelled). */
  async updateStatus(
    slotId: string,
    status: ContentSlotStatus
  ): Promise<IContentSlot | null> {
    return this.updateById(slotId, { status } as any)
  }

  /** Link the slot to its `ContentModel` execution record once ACT runs. */
  async linkContent(slotId: string, contentId: string): Promise<IContentSlot | null> {
    return this.updateById(slotId, { contentId } as any)
  }

  /** Record how an undelivered brief was resolved (ai-backup | rescheduled). */
  async setFallbackResolution(
    slotId: string,
    fallbackResolution: IContentSlot['fallbackResolution']
  ): Promise<IContentSlot | null> {
    return this.updateById(slotId, { fallbackResolution } as any)
  }

  /** Count slots for a mission within a status set (frequency-cap checks). */
  async countByMissionAndStatuses(
    missionId: string,
    statuses: ContentSlotStatus[]
  ): Promise<number> {
    return this.count({ missionId, status: { $in: statuses } } as any)
  }
}

export const contentSlotRepository = new ContentSlotRepository()
