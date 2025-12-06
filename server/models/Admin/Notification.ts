import mongoose, { Document, Schema, Model } from 'mongoose';

export interface INotification extends Document {
  userId?: number;
  title: string;
  message: string;
  type: string;
  priority: string;
  isRead: boolean;
  actionUrl?: string;
  data?: any;
  expiresAt?: Date;
  targetUsers: any;
  scheduledFor?: Date;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId: { type: Number },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, required: true },
  priority: { type: String, default: 'medium' },
  isRead: { type: Boolean, default: false },
  actionUrl: String,
  data: { type: Schema.Types.Mixed },
  expiresAt: Date,
  targetUsers: { type: Schema.Types.Mixed, default: 'all' },
  scheduledFor: Date,
  sentAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const NotificationModel: Model<INotification> = mongoose.model<INotification>('Notification', NotificationSchema);
export { NotificationSchema };
