import mongoose, { Document, Schema } from 'mongoose';

export interface IInstagramFollowerSnapshot extends Document {
  accountId: mongoose.Types.ObjectId;
  instagramUserId: string;
  followerCount: number;
  snapshotDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InstagramFollowerSnapshotSchema: Schema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'SocialAccount',
      required: true,
      index: true,
    },
    instagramUserId: {
      type: String,
      required: true,
      index: true,
    },
    followerCount: {
      type: Number,
      required: true,
    },
    snapshotDate: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure only one snapshot per account per day
InstagramFollowerSnapshotSchema.index({ accountId: 1, instagramUserId: 1, snapshotDate: 1 }, { unique: true });

export default mongoose.models.InstagramFollowerSnapshot || mongoose.model<IInstagramFollowerSnapshot>('InstagramFollowerSnapshot', InstagramFollowerSnapshotSchema);
