/**
 * Auto Pilot — MediaPoolRepository.
 *
 * Data access for `MediaPoolItemModel`, extending `BaseRepository` with the
 * workspace-scoped pool queries the ContentSourceResolver relies on. Items
 * stay reusable until removed, so availability is a first-class filter
 * (design "Data Models" · R6).
 *
 * Satisfies Requirements: 6, 17
 */

import { BaseRepository, PaginationOptions } from '../../../../repositories/BaseRepository'
import { MediaPoolItemModel, type IMediaPoolItem } from '../models'

export class MediaPoolRepository extends BaseRepository<IMediaPoolItem> {
  constructor() {
    super(MediaPoolItemModel, 'MediaPoolItem')
  }

  /** Paginated pool listing for a workspace (Media Pool panel). */
  async findByWorkspace(workspaceId: unknown, options?: PaginationOptions) {
    return this.findMany({ workspaceId } as any, options)
  }

  /** Available (reusable) items for a workspace — resolver read pattern. */
  async findAvailableByWorkspace(workspaceId: unknown): Promise<IMediaPoolItem[]> {
    return this.findAll({ workspaceId, available: true } as any)
  }

  /** Available items scoped to a specific mission within a workspace. */
  async findAvailableByMission(
    workspaceId: unknown,
    missionId: string
  ): Promise<IMediaPoolItem[]> {
    return this.findAll({ workspaceId, missionId, available: true } as any)
  }

  /** Flip an item's availability (e.g. when a user removes it — R6.6). */
  async setAvailability(
    itemId: string,
    available: boolean
  ): Promise<IMediaPoolItem | null> {
    return this.updateById(itemId, { available } as any)
  }

  /** Record that an item was assigned to a slot (keeps it reusable). */
  async addUsedInSlot(itemId: string, slotId: string): Promise<IMediaPoolItem | null> {
    return this.model
      .findByIdAndUpdate(
        itemId,
        { $addToSet: { usedInSlots: slotId }, $set: { updatedAt: new Date() } },
        { new: true }
      )
      .exec()
  }

  /** Cache vision-analysis output for vision-grounded captioning. */
  async setVisionAnalysis(
    itemId: string,
    visionAnalysis: Record<string, unknown>
  ): Promise<IMediaPoolItem | null> {
    return this.updateById(itemId, { visionAnalysis } as any)
  }
}

export const mediaPoolRepository = new MediaPoolRepository()
