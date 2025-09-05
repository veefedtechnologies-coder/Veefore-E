import mongoose, { Document, Schema } from 'mongoose';

export interface ISupportTicket extends Document {
  _id: string;
  ticketId: string; // Human-readable ticket ID (e.g., TKT-2024-001)
  
  // Basic info
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'on_hold' | 'escalated' | 'resolved' | 'closed';
  category: string;
  subCategory?: string;
  
  // User info
  userId?: string; // If from registered user
  userEmail: string;
  userName?: string;
  userPhone?: string;
  
  // Assignment
  assignedTo?: string; // Admin ID
  assignedTeam?: string;
  escalatedTo?: string; // Higher level admin
  
  // Email integration
  emailThread: {
    originalEmail: {
      messageId: string;
      from: string;
      to: string;
      subject: string;
      body: string;
      attachments: Array<{
        name: string;
        url: string;
        type: string;
        size: number;
      }>;
      receivedAt: Date;
    };
    replies: Array<{
      messageId: string;
      from: string;
      to: string;
      subject: string;
      body: string;
      attachments: Array<{
        name: string;
        url: string;
        type: string;
        size: number;
      }>;
      sentAt: Date;
      sentBy: string; // Admin ID
      isInternal: boolean; // Internal note vs user reply
    }>;
  };
  
  // AI features
  aiAnalysis: {
    categoryPrediction?: string;
    priorityPrediction?: string;
    sentimentScore?: number; // -1 to 1
    language?: string;
    suggestedReplies?: Array<{
      content: string;
      confidence: number;
      type: 'greeting' | 'solution' | 'escalation' | 'follow_up';
    }>;
    autoReplySent?: boolean;
    autoReplyContent?: string;
  };
  
  // SLA tracking
  sla: {
    responseTime: number; // Minutes to first response
    resolutionTime: number; // Minutes to resolution
    targetResponseTime: number; // Target minutes
    targetResolutionTime: number; // Target minutes
    breached: boolean;
    breachReason?: string;
    escalationTriggers: Array<{
      type: 'time' | 'priority' | 'manual';
      triggeredAt: Date;
      escalatedTo: string;
      reason: string;
    }>;
  };
  
  // Tags and metadata
  tags: string[];
  customFields: { [key: string]: any };
  
  // Related entities
  relatedTickets: string[]; // Other ticket IDs
  relatedRefund?: string; // Refund ID if applicable
  relatedSubscription?: string; // Subscription ID if applicable
  
  // Internal notes
  internalNotes: Array<{
    content: string;
    author: string; // Admin ID
    createdAt: Date;
    isPrivate: boolean; // Not visible to user
  }>;
  
  // Satisfaction
  satisfaction: {
    rating?: number; // 1-5
    feedback?: string;
    submittedAt?: Date;
  };
  
  // Analytics
  analytics: {
    responseCount: number;
    resolutionCount: number;
    reopenCount: number;
    timeToFirstResponse: number; // Minutes
    timeToResolution: number; // Minutes
    customerSatisfaction: number; // Average rating
  };
  
  // Status history
  statusHistory: Array<{
    status: string;
    changedBy: string; // Admin ID
    changedAt: Date;
    reason?: string;
  }>;
  
  // Escalation
  escalation: {
    isEscalated: boolean;
    escalatedAt?: Date;
    escalatedBy?: string; // Admin ID
    escalatedTo?: string; // Admin ID
    escalationReason?: string;
    escalationLevel: number; // 1, 2, 3, etc.
  };
  
  // Auto-routing
  routing: {
    autoAssigned: boolean;
    assignmentRule?: string; // Rule that assigned it
    suggestedAssignee?: string; // AI suggested assignee
    suggestedTeam?: string; // AI suggested team
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Basic info
  subject: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    required: true,
    enum: ['open', 'in_progress', 'on_hold', 'escalated', 'resolved', 'closed'],
    default: 'open'
  },
  category: {
    type: String,
    required: true
  },
  subCategory: String,
  
  // User info
  userId: {
    type: String,
    ref: 'User'
  },
  userEmail: {
    type: String,
    required: true
  },
  userName: String,
  userPhone: String,
  
  // Assignment
  assignedTo: {
    type: String,
    ref: 'Admin'
  },
  assignedTeam: String,
  escalatedTo: {
    type: String,
    ref: 'Admin'
  },
  
  // Email integration
  emailThread: {
    originalEmail: {
      messageId: String,
      from: String,
      to: String,
      subject: String,
      body: String,
      attachments: [{
        name: String,
        url: String,
        type: String,
        size: Number
      }],
      receivedAt: Date
    },
    replies: [{
      messageId: String,
      from: String,
      to: String,
      subject: String,
      body: String,
      attachments: [{
        name: String,
        url: String,
        type: String,
        size: Number
      }],
      sentAt: Date,
      sentBy: {
        type: String,
        ref: 'Admin'
      },
      isInternal: {
        type: Boolean,
        default: false
      }
    }]
  },
  
  // AI features
  aiAnalysis: {
    categoryPrediction: String,
    priorityPrediction: String,
    sentimentScore: {
      type: Number,
      min: -1,
      max: 1
    },
    language: String,
    suggestedReplies: [{
      content: String,
      confidence: {
        type: Number,
        min: 0,
        max: 1
      },
      type: {
        type: String,
        enum: ['greeting', 'solution', 'escalation', 'follow_up']
      }
    }],
    autoReplySent: {
      type: Boolean,
      default: false
    },
    autoReplyContent: String
  },
  
  // SLA tracking
  sla: {
    responseTime: {
      type: Number,
      default: 0
    },
    resolutionTime: {
      type: Number,
      default: 0
    },
    targetResponseTime: {
      type: Number,
      default: 1440 // 24 hours in minutes
    },
    targetResolutionTime: {
      type: Number,
      default: 10080 // 7 days in minutes
    },
    breached: {
      type: Boolean,
      default: false
    },
    breachReason: String,
    escalationTriggers: [{
      type: {
        type: String,
        enum: ['time', 'priority', 'manual']
      },
      triggeredAt: Date,
      escalatedTo: String,
      reason: String
    }]
  },
  
  // Tags and metadata
  tags: [{
    type: String
  }],
  customFields: {
    type: Map,
    of: Schema.Types.Mixed
  },
  
  // Related entities
  relatedTickets: [{
    type: String
  }],
  relatedRefund: {
    type: String,
    ref: 'Refund'
  },
  relatedSubscription: {
    type: String,
    ref: 'Subscription'
  },
  
  // Internal notes
  internalNotes: [{
    content: {
      type: String,
      required: true
    },
    author: {
      type: String,
      required: true,
      ref: 'Admin'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isPrivate: {
      type: Boolean,
      default: true
    }
  }],
  
  // Satisfaction
  satisfaction: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String,
    submittedAt: Date
  },
  
  // Analytics
  analytics: {
    responseCount: {
      type: Number,
      default: 0
    },
    resolutionCount: {
      type: Number,
      default: 0
    },
    reopenCount: {
      type: Number,
      default: 0
    },
    timeToFirstResponse: {
      type: Number,
      default: 0
    },
    timeToResolution: {
      type: Number,
      default: 0
    },
    customerSatisfaction: {
      type: Number,
      default: 0
    }
  },
  
  // Status history
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    changedBy: {
      type: String,
      required: true,
      ref: 'Admin'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: String
  }],
  
  // Escalation
  escalation: {
    isEscalated: {
      type: Boolean,
      default: false
    },
    escalatedAt: Date,
    escalatedBy: {
      type: String,
      ref: 'Admin'
    },
    escalatedTo: {
      type: String,
      ref: 'Admin'
    },
    escalationReason: String,
    escalationLevel: {
      type: Number,
      default: 0
    }
  },
  
  // Auto-routing
  routing: {
    autoAssigned: {
      type: Boolean,
      default: false
    },
    assignmentRule: String,
    suggestedAssignee: {
      type: String,
      ref: 'Admin'
    },
    suggestedTeam: String
  }
}, {
  timestamps: true
});

// Indexes (removed duplicate - ticketId already has unique: true)
SupportTicketSchema.index({ status: 1, priority: 1 });
SupportTicketSchema.index({ assignedTo: 1 });
SupportTicketSchema.index({ userEmail: 1 });
SupportTicketSchema.index({ category: 1 });
SupportTicketSchema.index({ createdAt: -1 });
SupportTicketSchema.index({ 'sla.breached': 1 });

// Pre-save middleware to generate ticket ID
SupportTicketSchema.pre('save', async function(next) {
  if (this.isNew && !this.ticketId) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1)
      }
    });
    this.ticketId = `TKT-${year}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

export default mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);
