import mongoose, { Document, Schema } from 'mongoose';

export interface IRole extends Document {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  level: number;
  team: string;
  isActive: boolean;
  isSystem: boolean;
  createdBy: string;
  
  // Advanced RBAC features
  teamRestrictions: string[]; // Which teams can use this role
  moduleAccess: {
    [key: string]: {
      read: boolean;
      write: boolean;
      delete: boolean;
      admin: boolean;
    };
  };
  customPermissions: string[];
  approvalRequired: boolean; // Actions require approval
  maxLevelOverride: number; // Can override up to this level
  escalationRules: {
    [key: string]: {
      threshold: number;
      escalateTo: string;
      autoEscalate: boolean;
    };
  };
  dataAccess: {
    scope: 'all' | 'team' | 'own' | 'custom';
    customFilters: any;
  };
  timeRestrictions: {
    allowedHours: {
      start: number;
      end: number;
    };
    allowedDays: number[]; // 0-6 (Sunday-Saturday)
    timezone: string;
  };
  ipRestrictions: {
    allowedIPs: string[];
    blockedIPs: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  permissions: [{
    type: String,
    required: true
  }],
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 3
  },
  team: {
    type: String,
    required: true,
    enum: ['executive', 'support', 'billing', 'product', 'marketing', 'development', 'sales', 'legal', 'aiops', 'general'],
    default: 'general'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isSystem: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  
  // Advanced RBAC features
  teamRestrictions: [{
    type: String,
    enum: ['executive', 'support', 'billing', 'product', 'marketing', 'development', 'sales', 'legal', 'aiops']
  }],
  moduleAccess: {
    type: Map,
    of: {
      read: Boolean,
      write: Boolean,
      delete: Boolean,
      admin: Boolean
    },
    default: {}
  },
  customPermissions: [{
    type: String
  }],
  approvalRequired: {
    type: Boolean,
    default: false
  },
  maxLevelOverride: {
    type: Number,
    default: 0
  },
  escalationRules: {
    type: Map,
    of: {
      threshold: Number,
      escalateTo: String,
      autoEscalate: Boolean
    },
    default: {}
  },
  dataAccess: {
    scope: {
      type: String,
      enum: ['all', 'team', 'own', 'custom'],
      default: 'own'
    },
    customFilters: Schema.Types.Mixed
  },
  timeRestrictions: {
    allowedHours: {
      start: {
        type: Number,
        min: 0,
        max: 23,
        default: 0
      },
      end: {
        type: Number,
        min: 0,
        max: 23,
        default: 23
      }
    },
    allowedDays: [{
      type: Number,
      min: 0,
      max: 6
    }],
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  ipRestrictions: {
    allowedIPs: [{
      type: String
    }],
    blockedIPs: [{
      type: String
    }]
  }
}, {
  timestamps: true
});

// Indexes (removed duplicate - name already has unique: true)
RoleSchema.index({ team: 1 });
RoleSchema.index({ level: 1 });
RoleSchema.index({ isActive: 1 });
RoleSchema.index({ createdAt: -1 });

export default mongoose.model<IRole>('Role', RoleSchema);
