import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IPublishJobLog extends Document {
  scheduledPostId: string;
  jobType: 'publish' | 'verify' | 'retry' | 'cleanup';
  attemptNumber: number;
  apiResponse?: Record<string, any>;
  error?: string;
  duration?: number;
  createdAt: Date;
}

const PublishJobLogSchema = new Schema<IPublishJobLog>({
  scheduledPostId: { type: String, required: true, index: true },
  jobType: { type: String, required: true, enum: ['publish', 'verify', 'retry', 'cleanup'] },
  attemptNumber: { type: Number, required: true, default: 1 },
  apiResponse: { type: Schema.Types.Mixed },
  error: { type: String },
  duration: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

PublishJobLogSchema.index({ scheduledPostId: 1, jobType: 1 });
PublishJobLogSchema.index({ createdAt: -1 }); // TTL index can be added if we want to expire logs

export const PublishJobLog: Model<IPublishJobLog> = mongoose.models.PublishJobLog as Model<IPublishJobLog> || mongoose.model<IPublishJobLog>('PublishJobLog', PublishJobLogSchema, 'publishJobLogs');
export default PublishJobLog;
