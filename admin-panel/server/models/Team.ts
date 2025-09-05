import mongoose, { Document, Schema } from 'mongoose';

export interface ITeam extends Document {
  _id: string;
  name: string;
  description: string;
  teamCode: string; // Unique team identifier
  
  // Team hierarchy
  parentTeam?: string; // Reference to parent team
  level: number; // 1 = top level, 2 = sub-team, etc.
  path: string; // Full path like "Engineering/Frontend"
  
  // Team leadership
  teamLead: {
    adminId: string;
    name: string;
    email: string;
    assignedAt: Date;
  };
  deputyLeads: Array<{
    adminId: string;
    name: string;
    email: string;
    assignedAt: Date;
    permissions: string[];
  }>;
  
  // Team members
  members: Array<{
    adminId: string;
    name: string;
    email: string;
    role: string;
    level: number;
    joinedAt: Date;
    status: 'active' | 'inactive' | 'suspended';
    permissions: string[];
    lastActiveAt: Date;
  }>;
  
  // Team settings
  settings: {
    maxMembers: number;
    allowSelfJoin: boolean;
    requireApproval: boolean;
    defaultRole: string;
    workingHours: {
      timezone: string;
      startTime: string; // HH:MM format
      endTime: string; // HH:MM format
      workingDays: number[]; // 0-6 (Sunday-Saturday)
    };
    notifications: {
      email: boolean;
      inApp: boolean;
      slack: boolean;
      webhook: string;
    };
  };
  
  // Team permissions
  permissions: {
    canCreateSubTeams: boolean;
    canManageMembers: boolean;
    canAssignRoles: boolean;
    canViewAnalytics: boolean;
    canManageSettings: boolean;
    canAccessReports: boolean;
    moduleAccess: string[]; // Which modules this team can access
    customPermissions: { [key: string]: boolean };
  };
  
  // Team performance metrics
  metrics: {
    totalTickets: number;
    resolvedTickets: number;
    avgResolutionTime: number; // in minutes
    customerSatisfaction: number; // 1-5 scale
    teamProductivity: number; // 0-100 scale
    lastActivityAt: Date;
    monthlyGoals: {
      tickets: number;
      satisfaction: number;
      responseTime: number;
    };
    achievements: Array<{
      type: string;
      description: string;
      achievedAt: Date;
      value: number;
    }>;
  };
  
  // Team communication
  communication: {
    slackChannel?: string;
    discordChannel?: string;
    teamsChannel?: string;
    emailAlias: string;
    meetingSchedule: {
      frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
      day: string;
      time: string;
      duration: number; // in minutes
    };
  };
  
  // Team resources
  resources: {
    budget: number;
    currency: string;
    tools: Array<{
      name: string;
      type: string;
      cost: number;
      renewalDate: Date;
      status: 'active' | 'expired' | 'pending';
    }>;
    training: Array<{
      name: string;
      type: string;
      completedBy: string[];
      required: boolean;
      dueDate?: Date;
    }>;
  };
  
  // Team status
  status: 'active' | 'inactive' | 'archived' | 'suspended';
  isPublic: boolean; // Can be viewed by other teams
  
  // Audit
  createdBy: string; // Admin ID
  lastModifiedBy: string; // Admin ID
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>({
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  teamCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    maxlength: 20
  },
  
  // Team hierarchy
  parentTeam: {
    type: String,
    ref: 'Team'
  },
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  path: {
    type: String,
    required: true
  },
  
  // Team leadership
  teamLead: {
    adminId: {
      type: String,
      required: true,
      ref: 'Admin'
    },
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    assignedAt: {
      type: Date,
      default: Date.now
    }
  },
  deputyLeads: [{
    adminId: {
      type: String,
      required: true,
      ref: 'Admin'
    },
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    permissions: [{
      type: String
    }]
  }],
  
  // Team members
  members: [{
    adminId: {
      type: String,
      required: true,
      ref: 'Admin'
    },
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true
    },
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active'
    },
    permissions: [{
      type: String
    }],
    lastActiveAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Team settings
  settings: {
    maxMembers: {
      type: Number,
      default: 50
    },
    allowSelfJoin: {
      type: Boolean,
      default: false
    },
    requireApproval: {
      type: Boolean,
      default: true
    },
    defaultRole: {
      type: String,
      default: 'member'
    },
    workingHours: {
      timezone: {
        type: String,
        default: 'UTC'
      },
      startTime: {
        type: String,
        default: '09:00'
      },
      endTime: {
        type: String,
        default: '17:00'
      },
      workingDays: [{
        type: Number,
        min: 0,
        max: 6
      }]
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      inApp: {
        type: Boolean,
        default: true
      },
      slack: {
        type: Boolean,
        default: false
      },
      webhook: String
    }
  },
  
  // Team permissions
  permissions: {
    canCreateSubTeams: {
      type: Boolean,
      default: false
    },
    canManageMembers: {
      type: Boolean,
      default: true
    },
    canAssignRoles: {
      type: Boolean,
      default: false
    },
    canViewAnalytics: {
      type: Boolean,
      default: true
    },
    canManageSettings: {
      type: Boolean,
      default: false
    },
    canAccessReports: {
      type: Boolean,
      default: true
    },
    moduleAccess: [{
      type: String
    }],
    customPermissions: {
      type: Map,
      of: Boolean
    }
  },
  
  // Team performance metrics
  metrics: {
    totalTickets: {
      type: Number,
      default: 0
    },
    resolvedTickets: {
      type: Number,
      default: 0
    },
    avgResolutionTime: {
      type: Number,
      default: 0
    },
    customerSatisfaction: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    teamProductivity: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    lastActivityAt: {
      type: Date,
      default: Date.now
    },
    monthlyGoals: {
      tickets: {
        type: Number,
        default: 0
      },
      satisfaction: {
        type: Number,
        default: 4.0
      },
      responseTime: {
        type: Number,
        default: 1440 // 24 hours in minutes
      }
    },
    achievements: [{
      type: {
        type: String,
        required: true
      },
      description: {
        type: String,
        required: true
      },
      achievedAt: {
        type: Date,
        default: Date.now
      },
      value: {
        type: Number,
        required: true
      }
    }]
  },
  
  // Team communication
  communication: {
    slackChannel: String,
    discordChannel: String,
    teamsChannel: String,
    emailAlias: {
      type: String,
      required: true
    },
    meetingSchedule: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'bi-weekly', 'monthly'],
        default: 'weekly'
      },
      day: {
        type: String,
        default: 'Monday'
      },
      time: {
        type: String,
        default: '10:00'
      },
      duration: {
        type: Number,
        default: 60
      }
    }
  },
  
  // Team resources
  resources: {
    budget: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    tools: [{
      name: {
        type: String,
        required: true
      },
      type: {
        type: String,
        required: true
      },
      cost: {
        type: Number,
        required: true
      },
      renewalDate: {
        type: Date,
        required: true
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'pending'],
        default: 'active'
      }
    }],
    training: [{
      name: {
        type: String,
        required: true
      },
      type: {
        type: String,
        required: true
      },
      completedBy: [{
        type: String
      }],
      required: {
        type: Boolean,
        default: false
      },
      dueDate: Date
    }]
  },
  
  // Team status
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived', 'suspended'],
    default: 'active'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  
  // Audit
  createdBy: {
    type: String,
    required: true,
    ref: 'Admin'
  },
  lastModifiedBy: {
    type: String,
    required: true,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes
TeamSchema.index({ teamCode: 1 });
TeamSchema.index({ parentTeam: 1 });
TeamSchema.index({ level: 1 });
TeamSchema.index({ status: 1 });
TeamSchema.index({ 'teamLead.adminId': 1 });
TeamSchema.index({ 'members.adminId': 1 });
TeamSchema.index({ createdAt: -1 });

// Pre-save middleware to generate team code and path
TeamSchema.pre('save', async function(next) {
  if (this.isNew && !this.teamCode) {
    // Generate team code from name
    this.teamCode = this.name
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .substring(0, 10);
    
    // Ensure uniqueness
    let counter = 1;
    let originalCode = this.teamCode;
    while (await this.constructor.findOne({ teamCode: this.teamCode })) {
      this.teamCode = `${originalCode}${counter}`;
      counter++;
    }
  }
  
  // Generate path
  if (this.parentTeam) {
    const parent = await this.constructor.findById(this.parentTeam);
    if (parent) {
      this.path = `${parent.path}/${this.name}`;
    } else {
      this.path = this.name;
    }
  } else {
    this.path = this.name;
  }
  
  next();
});

// Virtual for member count
TeamSchema.virtual('memberCount').get(function() {
  return this.members.filter(member => member.status === 'active').length;
});

// Virtual for team hierarchy depth
TeamSchema.virtual('depth').get(function() {
  return this.path.split('/').length - 1;
});

// Method to add member
TeamSchema.methods.addMember = function(memberData: any) {
  if (this.members.length >= this.settings.maxMembers) {
    throw new Error('Team has reached maximum member limit');
  }
  
  this.members.push({
    ...memberData,
    joinedAt: new Date(),
    status: 'active',
    lastActiveAt: new Date()
  });
  
  return this.save();
};

// Method to remove member
TeamSchema.methods.removeMember = function(adminId: string) {
  this.members = this.members.filter(member => member.adminId !== adminId);
  return this.save();
};

// Method to update member status
TeamSchema.methods.updateMemberStatus = function(adminId: string, status: string) {
  const member = this.members.find(m => m.adminId === adminId);
  if (member) {
    member.status = status;
    if (status === 'active') {
      member.lastActiveAt = new Date();
    }
  }
  return this.save();
};

// Method to get team hierarchy tree
TeamSchema.statics.getTeamTree = async function(rootTeamId?: string) {
  const query = rootTeamId ? { parentTeam: rootTeamId } : { parentTeam: { $exists: false } };
  
  const teams = await this.find(query)
    .populate('teamLead.adminId', 'firstName lastName email')
    .populate('members.adminId', 'firstName lastName email')
    .sort({ level: 1, name: 1 });
  
  const buildTree = (parentId: string | null) => {
    return teams
      .filter(team => team.parentTeam?.toString() === parentId)
      .map(team => ({
        ...team.toObject(),
        children: buildTree(team._id.toString())
      }));
  };
  
  return buildTree(rootTeamId || null);
};

// Method to get team performance stats
TeamSchema.methods.getPerformanceStats = function(period: string = '30d') {
  const now = new Date();
  let startDate = new Date();
  
  switch (period) {
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
      break;
    case '1y':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
  }
  
  return {
    teamId: this._id,
    teamName: this.name,
    period,
    metrics: this.metrics,
    memberCount: this.memberCount,
    activeMembers: this.members.filter(m => m.status === 'active').length,
    lastActivity: this.metrics.lastActivityAt,
    goals: this.metrics.monthlyGoals,
    achievements: this.metrics.achievements.filter(
      achievement => achievement.achievedAt >= startDate
    )
  };
};

export default mongoose.model<ITeam>('Team', TeamSchema);
