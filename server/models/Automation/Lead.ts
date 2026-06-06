import mongoose, { Document, Schema } from 'mongoose';

export interface ILead extends Document {
  workspaceId: any;
  instagramAccountId: string;
  automationRuleId: string;
  
  // User info
  socialUserId: string; // The Instagram ID of the commenter
  username: string;
  fullName?: string;
  profilePicUrl?: string;
  
  // Interaction Data
  sourceCommentId?: string;
  matchedKeyword?: string;
  detectedIntent?: string;
  
  // Status
  dmSent: boolean;
  dmSentAt?: Date;
  repliedToDm: boolean;
  repliedAt?: Date;
  linkClicked: boolean;
  
  tags: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

export const LeadSchema = new Schema<ILead>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  instagramAccountId: { type: String, required: true },
  automationRuleId: { type: String, required: true },
  
  socialUserId: { type: String, required: true },
  username: { type: String, required: true },
  fullName: { type: String },
  profilePicUrl: { type: String },
  
  sourceCommentId: { type: String },
  matchedKeyword: { type: String },
  detectedIntent: { type: String },
  
  dmSent: { type: Boolean, default: false },
  dmSentAt: { type: Date },
  repliedToDm: { type: Boolean, default: false },
  repliedAt: { type: Date },
  linkClicked: { type: Boolean, default: false },
  
  tags: [{ type: String }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

LeadSchema.index({ workspaceId: 1, socialUserId: 1 });
LeadSchema.index({ automationRuleId: 1 });
LeadSchema.index({ instagramAccountId: 1, socialUserId: 1 }, { unique: true });

export const LeadModel = mongoose.models.Lead as mongoose.Model<ILead> || mongoose.model<ILead>('Lead', LeadSchema, 'leads');
