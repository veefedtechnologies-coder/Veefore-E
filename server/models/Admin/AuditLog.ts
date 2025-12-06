import mongoose, { Document, Schema, Model } from 'mongoose';

export type ActorType = 'admin' | 'user' | 'system';

export interface IAuditLog extends Document {
  actorType: ActorType;
  actorId: string;
  adminId?: number;
  action: string;
  resource: string;
  resourceId?: string;
  workspaceId?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'info' | 'warning' | 'critical';
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  actorType: { 
    type: String, 
    required: true, 
    enum: ['admin', 'user', 'system'],
    default: 'user'
  },
  actorId: { 
    type: String, 
    required: true,
    index: true
  },
  adminId: { type: Number },
  action: { 
    type: String, 
    required: true,
    index: true
  },
  resource: { 
    type: String, 
    required: true,
    index: true
  },
  resourceId: String,
  workspaceId: { 
    type: String,
    index: true
  },
  oldValues: { type: Schema.Types.Mixed },
  newValues: { type: Schema.Types.Mixed },
  metadata: { type: Schema.Types.Mixed },
  ipAddress: String,
  userAgent: String,
  severity: { 
    type: String, 
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  createdAt: { type: Date, default: Date.now, index: true }
});

AuditLogSchema.index({ actorType: 1, actorId: 1, createdAt: -1 });
AuditLogSchema.index({ workspaceId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, resource: 1, createdAt: -1 });

export const AuditLogModel: Model<IAuditLog> = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export { AuditLogSchema };
