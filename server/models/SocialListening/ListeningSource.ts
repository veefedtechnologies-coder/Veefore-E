import mongoose, { Document, Schema } from 'mongoose';

export interface IListeningSource extends Document {
  workspaceId: mongoose.Types.ObjectId | string;
  platform: 'reddit' | 'youtube' | 'web' | 'instagram' | 'tiktok' | 'twitter' | 'linkedin';
  type: 'keyword' | 'competitor' | 'topic' | 'hashtag';
  value: string; // The keyword or URL
  status: 'active' | 'paused' | 'error';
  lastCrawledAt?: Date;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ListeningSourceSchema = new Schema<IListeningSource>({
  workspaceId: { type: String, required: true, index: true },
  platform: { type: String, required: true },
  type: { type: String, required: true },
  value: { type: String, required: true },
  status: { type: String, default: 'active' },
  lastCrawledAt: { type: Date },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      if (ret._id) {
        ret.id = ret._id.toString();
      }
      return ret;
    }
  }
});

ListeningSourceSchema.index({ workspaceId: 1, status: 1 });
ListeningSourceSchema.index({ platform: 1, status: 1 });

export const ListeningSourceModel = mongoose.models.ListeningSource as mongoose.Model<IListeningSource> || mongoose.model<IListeningSource>('ListeningSource', ListeningSourceSchema, 'listening_sources');
