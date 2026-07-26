/**
 * Auto Pilot — repositories barrel.
 *
 * Re-exports the four Auto Pilot repositories (extending the shared
 * `BaseRepository`) plus their singleton instances (Task 2.2):
 *   MissionRepository, ContentSlotRepository, MediaPoolRepository,
 *   ApprovalRepository.
 */

export { MissionRepository, missionRepository } from './MissionRepository'
export { ContentSlotRepository, contentSlotRepository } from './ContentSlotRepository'
export { MediaPoolRepository, mediaPoolRepository } from './MediaPoolRepository'
export { ApprovalRepository, approvalRepository } from './ApprovalRepository'
