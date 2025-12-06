import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IAdminSession extends Document {
  adminId: Types.ObjectId;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
}

const AdminSessionSchema = new Schema<IAdminSession>({
  adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  token: { type: String, required: true, unique: true },
  ipAddress: String,
  userAgent: String,
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const AdminSessionModel: Model<IAdminSession> = mongoose.model<IAdminSession>('AdminSession', AdminSessionSchema);
export { AdminSessionSchema };
