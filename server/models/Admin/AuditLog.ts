import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IAuditLog extends Document {
  adminId: number;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  adminId: { type: Number, required: true },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resourceId: String,
  oldValues: { type: Schema.Types.Mixed },
  newValues: { type: Schema.Types.Mixed },
  ipAddress: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now }
});

export const AuditLogModel: Model<IAuditLog> = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export { AuditLogSchema };
