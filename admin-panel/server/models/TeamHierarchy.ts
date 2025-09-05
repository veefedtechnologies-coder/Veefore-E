import mongoose, { Document, Schema } from 'mongoose';

export interface ITeamHierarchy extends Document {
  _id: string;
  name: string;
  description: string;
  level: number; // 1-5 hierarchy level
  parentTeam?: string; // Reference to parent team
  childTeams: string[]; // Array of child team IDs
  teamLead: string; // Admin ID who leads this team
  members: string[]; // Array of admin IDs in this team
  // Methods
  getTeamPath(): Promise<string>;
  getAllSubTeams(): Promise<ITeamHierarchy[]>;
  validateHierarchy(): Promise<boolean>;
  permissions: {
    canCreateSubTeams: boolean;
    canAssignMembers: boolean;
    canModifyPermissions: boolean;
    canViewAllSubTeams: boolean;
    canApproveActions: boolean;
    maxSubTeamLevel: number; // Maximum level of sub-teams they can create
  };
  settings: {
    isActive: boolean;
    allowSelfAssignment: boolean;
    requireApprovalForJoining: boolean;
    maxMembers: number;
    autoEscalateAfter: number; // Hours before auto-escalation
    escalationTeam?: string; // Team to escalate to
  };
  metadata: {
    color: string; // Team color for UI
    icon: string; // Team icon
    tags: string[];
    department: string;
    costCenter?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

const TeamHierarchySchema = new Schema<ITeamHierarchy>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 1
  },
  parentTeam: {
    type: Schema.Types.ObjectId,
    ref: 'TeamHierarchy',
    default: null
  },
  childTeams: [{
    type: Schema.Types.ObjectId,
    ref: 'TeamHierarchy'
  }],
  teamLead: {
    type: String,
    ref: 'Admin',
    required: true
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  }],
  permissions: {
    canCreateSubTeams: {
      type: Boolean,
      default: false
    },
    canAssignMembers: {
      type: Boolean,
      default: true
    },
    canModifyPermissions: {
      type: Boolean,
      default: false
    },
    canViewAllSubTeams: {
      type: Boolean,
      default: true
    },
    canApproveActions: {
      type: Boolean,
      default: false
    },
    maxSubTeamLevel: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    }
  },
  settings: {
    isActive: {
      type: Boolean,
      default: true
    },
    allowSelfAssignment: {
      type: Boolean,
      default: false
    },
    requireApprovalForJoining: {
      type: Boolean,
      default: true
    },
    maxMembers: {
      type: Number,
      default: 50,
      min: 1,
      max: 1000
    },
    autoEscalateAfter: {
      type: Number,
      default: 24, // 24 hours
      min: 1,
      max: 168 // 1 week
    },
    escalationTeam: {
      type: Schema.Types.ObjectId,
      ref: 'TeamHierarchy'
    }
  },
  metadata: {
    color: {
      type: String,
      default: '#3B82F6',
      match: /^#[0-9A-F]{6}$/i
    },
    icon: {
      type: String,
      default: 'users'
    },
    tags: [{
      type: String,
      trim: true
    }],
    department: {
      type: String,
      required: true,
      trim: true
    },
    costCenter: {
      type: String,
      trim: true
    }
  },
  createdBy: {
    type: String,
    ref: 'Admin',
    required: true
  }
}, {
  timestamps: true
});

// Indexes (removed duplicate - name already has unique: true)
TeamHierarchySchema.index({ level: 1 });
TeamHierarchySchema.index({ parentTeam: 1 });
TeamHierarchySchema.index({ teamLead: 1 });
TeamHierarchySchema.index({ 'metadata.department': 1 });
TeamHierarchySchema.index({ 'settings.isActive': 1 });

// Method to get team hierarchy path
TeamHierarchySchema.methods.getTeamPath = async function() {
  const path = [this.name];
  let current = this;
  
  while (current.parentTeam) {
    current = await (this.constructor as any).findById(current.parentTeam);
    if (current) {
      path.unshift(current.name);
    } else {
      break;
    }
  }
  
  return path.join(' > ');
};

// Method to get all sub-teams recursively
TeamHierarchySchema.methods.getAllSubTeams = async function() {
  const subTeams: any[] = [];
  
  for (const childId of this.childTeams) {
    const child = await (this.constructor as any).findById(childId);
    if (child) {
      subTeams.push(child);
      const grandChildren = await child.getAllSubTeams();
      subTeams.push(...grandChildren);
    }
  }
  
  return subTeams;
};

// Method to check if team can create sub-team at given level
TeamHierarchySchema.methods.canCreateSubTeamAtLevel = function(level: number) {
  return this.permissions.canCreateSubTeams && level <= this.permissions.maxSubTeamLevel;
};

// Method to get team hierarchy tree
TeamHierarchySchema.statics.getHierarchyTree = async function() {
  const teams = await this.find({ 'settings.isActive': true })
    .populate('teamLead', 'firstName lastName email')
    .populate('members', 'firstName lastName email role')
    .sort({ level: 1, name: 1 });
  
  const teamMap = new Map();
  const rootTeams: any[] = [];
  
  // Create map of all teams
  teams.forEach((team: any) => {
    teamMap.set(team._id.toString(), { ...team.toObject(), children: [] });
  });
  
  // Build hierarchy
  teams.forEach((team: any) => {
    const teamObj = teamMap.get(team._id.toString());
    
    if (team.parentTeam) {
      const parent = teamMap.get(team.parentTeam.toString());
      if (parent) {
        parent.children.push(teamObj);
      }
    } else {
      rootTeams.push(teamObj);
    }
  });
  
  return rootTeams;
};

// Virtual for team path
TeamHierarchySchema.virtual('teamPath').get(function() {
  return this.getTeamPath();
});

// Method to validate team hierarchy
TeamHierarchySchema.methods.validateHierarchy = async function() {
  // Check for circular references
  const visited = new Set();
  let current = this;
  
  while (current.parentTeam) {
    if (visited.has(current.parentTeam.toString())) {
      throw new Error('Circular reference detected in team hierarchy');
    }
    visited.add(current.parentTeam.toString());
    current = await (this.constructor as any).findById(current.parentTeam);
    if (!current) break;
  }
  
  // Check level constraints
  if (this.parentTeam) {
    const parent = await (this.constructor as any).findById(this.parentTeam);
    if (parent && this.level <= parent.level) {
      throw new Error('Sub-team level must be higher than parent team level');
    }
  }
  
  return true;
};

// Pre-save middleware to validate hierarchy
TeamHierarchySchema.pre('save', async function(next) {
  try {
    await this.validateHierarchy();
    next();
  } catch (error) {
    next(error as Error);
  }
});

export default mongoose.model<ITeamHierarchy>('TeamHierarchy', TeamHierarchySchema);
