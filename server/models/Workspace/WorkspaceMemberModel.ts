import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * WorkspaceRole — permission levels for workspace team members.
 * Requirements: 1.4, 10.1, 10.5
 */
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'CONTENT_CREATOR' | 'VIEWER';

/**
 * MemberStatus — lifecycle state of a workspace member record.
 * DELETED members are soft-deleted (record preserved for audit history).
 * Requirements: 1.6
 */
export type MemberStatus = 'ACTIVE' | 'DELETED';

/**
 * IWorkspaceMember — Mongoose document interface for workspace membership.
 *
 * Tracks the join between a User (Firebase UID) and a Workspace, including
 * the member's role and invitation/join timestamps. Designed to be schema-ready
 * for full role enforcement without requiring future migrations (Requirement 10).
 */
export interface IWorkspaceMember extends Document {
  /** Reference to the parent Workspace document */
  workspaceId: mongoose.Types.ObjectId;
  /** Firebase UID of the user */
  userId: string;
  /** Permission level within the workspace */
  role: WorkspaceRole;
  /** Lifecycle status; DELETED records are preserved for audit history */
  status: MemberStatus;
  /** UTC timestamp set when the invite record is created */
  invitedAt: Date;
  /** UTC timestamp set when the member accepts the invitation; null for pending invites */
  joinedAt: Date | null;
  /** Auto-managed by mongoose timestamps option */
  createdAt: Date;
  /** Auto-managed by mongoose timestamps option */
  updatedAt: Date;
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['OWNER', 'ADMIN', 'EDITOR', 'CONTENT_CREATOR', 'VIEWER'],
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'DELETED'],
      default: 'ACTIVE',
    },
    invitedAt: {
      type: Date,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Compound unique index: each user can have exactly one member record per workspace.
 * Enforces the invariant at the database level (Requirement 1.4, 10.1).
 */
WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const WorkspaceMemberModel: Model<IWorkspaceMember> =
  mongoose.models.WorkspaceMember as Model<IWorkspaceMember> ||
  mongoose.model<IWorkspaceMember>('WorkspaceMember', WorkspaceMemberSchema);
