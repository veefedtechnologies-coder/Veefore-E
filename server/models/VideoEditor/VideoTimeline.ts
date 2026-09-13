/**
 * VideoTimeline — the authoritative composed timeline for a version.
 *
 * Holds sequences/tracks/clips/audio/captions/effects/transitions at 1 ms
 * resolution. Source in/out points are stored independent of timeline placement
 * (Req 10.5). The timeline model is the sole authoritative source for render.
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

export type TimelineElementKind =
  | 'clip'
  | 'audioClip'
  | 'captionClip'
  | 'effect'
  | 'transition';

export interface ITimelineElement {
  kind: TimelineElementKind;
  trackIndex: number;
  timelineStartMs: number; // ms, 1ms resolution
  timelineEndMs: number;
  sourceAssetId?: string;
  sourceInMs?: number;     // independent of timeline (Req 10.5)
  sourceOutMs?: number;
  params?: Record<string, unknown>;
}

export interface IVideoTimeline extends Document {
  timelineId: string;      // unique, indexed
  projectId: string;       // indexed
  versionId: string;
  workspaceId: string;     // indexed
  userId: string;          // indexed
  sequences: { tracks: number }[];
  elements: ITimelineElement[];
  createdAt: Date;
  updatedAt: Date;
}

const TimelineElementSchema = new Schema<ITimelineElement>(
  {
    kind: {
      type: String,
      enum: ['clip', 'audioClip', 'captionClip', 'effect', 'transition'],
      required: true,
    },
    trackIndex: { type: Number, required: true },
    timelineStartMs: { type: Number, required: true },
    timelineEndMs: { type: Number, required: true },
    sourceAssetId: { type: String },
    sourceInMs: { type: Number },
    sourceOutMs: { type: Number },
    params: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const VideoTimelineSchema = new Schema<IVideoTimeline>(
  {
    timelineId: { type: String, required: true, unique: true, index: true },
    projectId: { type: String, required: true, index: true },
    versionId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    sequences: [{ _id: false, tracks: { type: Number, required: true } }],
    elements: { type: [TimelineElementSchema], default: [] },
  },
  { timestamps: true }
);

VideoTimelineSchema.index({ projectId: 1, versionId: 1, createdAt: -1 });

export const VideoTimelineModel: Model<IVideoTimeline> =
  (mongoose.models.VideoTimeline as Model<IVideoTimeline>) ||
  mongoose.model<IVideoTimeline>('VideoTimeline', VideoTimelineSchema);

export { VideoTimelineSchema };
