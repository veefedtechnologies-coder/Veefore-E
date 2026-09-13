export { VideoProjectSchema, VideoProjectModel } from './VideoProject';
export type { IVideoProject, VideoProjectStatus } from './VideoProject';

export { VideoSourceSchema, VideoSourceModel } from './VideoSource';
export type { IVideoSource } from './VideoSource';

export { VideoVersionSchema, VideoVersionModel } from './VideoVersion';
export type { IVideoVersion } from './VideoVersion';

export { VideoTimelineSchema, VideoTimelineModel } from './VideoTimeline';
export type { IVideoTimeline, ITimelineElement, TimelineElementKind } from './VideoTimeline';

export { VideoEditOperationSchema, VideoEditOperationModel } from './VideoEditOperation';
export type {
  IVideoEditOperation,
  IVideoEditOperationRouting,
  VideoEditOperationType,
  VideoEditOperationStatus,
} from './VideoEditOperation';

export { VideoEditJobSchema, VideoEditJobModel, JOB_STATES } from './VideoEditJob';
export type { IVideoEditJob, JobState } from './VideoEditJob';

export { VideoArtifactSchema, VideoArtifactModel, ARTIFACT_CATEGORIES } from './VideoArtifact';
export type { IVideoArtifact, IVideoArtifactProvenance, ArtifactCategory } from './VideoArtifact';

export { VideoModelCapabilitiesSchema, VideoModelCapabilitiesModel } from './VideoModelCapabilities';
export type { IVideoModelCapabilities, IDurationBounds } from './VideoModelCapabilities';
