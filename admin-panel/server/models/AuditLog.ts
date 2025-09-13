import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  _id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: any;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint?: string;
  location?: {
    country: string;
    region: string;
    city: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  isSensitive: boolean;
  requiresVerification: boolean;
  verificationMethod?: string;
  rollbackData?: any;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  adminId: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  adminEmail: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'login', 'logout', 'login_failed', 'password_change', '2fa_enable', '2fa_disable',
      'user_create', 'user_update', 'user_delete', 'user_ban', 'user_unban',
      'refund_create', 'refund_approve', 'refund_reject', 'refund_process',
      'subscription_create', 'subscription_update', 'subscription_cancel',
      'ticket_create', 'ticket_update', 'ticket_assign', 'ticket_close',
      'coupon_create', 'coupon_update', 'coupon_delete', 'coupon_apply',
      'role_create', 'role_update', 'role_delete', 'role_assign',
      'permission_grant', 'permission_revoke',
      'admin_invitation_sent', 'admin_invitation_accepted', 'admin_invitation_approved', 
      'admin_invitation_rejected', 'admin_invitation_resent', 'admin_invitation_expired',
      'admin_create', 'admin_update', 'admin_delete', 'admin_suspend', 'admin_activate',
      'system_config', 'maintenance_mode', 'backup_create', 'backup_restore',
      'data_export', 'data_import', 'bulk_action',
      'ai_prompt', 'ai_response', 'moderation_action',
      'webhook_create', 'webhook_update', 'webhook_delete', 'webhook_trigger',
      'notification_send', 'popup_create', 'popup_update', 'popup_delete'
    ]
  },
  resource: {
    type: String,
    required: true,
    enum: [
      'admin', 'user', 'refund', 'subscription', 'ticket', 'coupon', 'role',
      'permission', 'system', 'backup', 'audit_log', 'notification', 'popup',
      'webhook', 'ai_log', 'moderation', 'analytics', 'report', 'AdminInvite'
    ]
  },
  resourceId: {
    type: String
  },
  details: {
    type: Schema.Types.Mixed,
    required: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  deviceFingerprint: {
    type: String
  },
  location: {
    country: String,
    region: String,
    city: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  isSensitive: {
    type: Boolean,
    default: false
  },
  requiresVerification: {
    type: Boolean,
    default: false
  },
  verificationMethod: {
    type: String,
    enum: ['password', '2fa', 'email', 'sms', 'biometric']
  },
  rollbackData: {
    type: Schema.Types.Mixed
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// Indexes
AuditLogSchema.index({ adminId: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ resource: 1 });
AuditLogSchema.index({ resourceId: 1 });
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ riskLevel: 1 });
AuditLogSchema.index({ isSensitive: 1 });
AuditLogSchema.index({ ipAddress: 1 });
AuditLogSchema.index({ adminEmail: 1 });

// Compound indexes for common queries
AuditLogSchema.index({ adminId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ riskLevel: 1, isSensitive: 1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
