import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── Plan & Status Types ──────────────────────────────────────────────────────

export type WorkspacePlan = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';

export type WorkspaceStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

// ─── IWorkspace Interface ─────────────────────────────────────────────────────

export interface IWorkspace extends Document {
  /** Firebase UID of the user who created/owns this workspace */
  ownerId: string;
  /** Human-readable brand name, max 100 characters */
  name: string;
  /** Subscription plan tier for this workspace */
  plan: WorkspacePlan;
  /** Lifecycle status of the workspace */
  status: WorkspaceStatus;
  /**
   * Enterprise-only override: custom workspace limit (1–999).
   * When null/undefined, the default plan limit applies.
   */
  customWorkspaceLimit?: number | null;
  /** Automatically managed by mongoose timestamps: true */
  createdAt: Date;
  /** Automatically managed by mongoose timestamps: true */
  updatedAt: Date;
  /** Virtual — count of WorkspaceMember records for this workspace */
  memberCount: number;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    plan: {
      type: String,
      enum: ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'] as WorkspacePlan[],
      required: true,
      default: 'FREE',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'DELETED'] as WorkspaceStatus[],
      required: true,
      default: 'ACTIVE',
    },
    customWorkspaceLimit: {
      type: Number,
      min: 1,
      max: 999,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * Compound unique partial index: the same owner cannot have two non-deleted
 * workspaces with the same name. Deleted workspaces are excluded so that a
 * name can be reused after soft-deletion.
 *
 * Satisfies Requirements 1.3 (name uniqueness) and 10.6 (model completeness).
 */
WorkspaceSchema.index(
  { ownerId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'DELETED' } },
    name: 'unique_active_workspace_name_per_owner',
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

/**
 * Virtual `memberCount` — populated as a count via WorkspaceMember.
 * Satisfies Requirement 10.6: "memberCount field representing the total count
 * of all WorkspaceMember records associated with that workspace".
 *
 * Usage: WorkspaceModel.findOne(...).populate('memberCount')
 */
WorkspaceSchema.virtual('memberCount', {
  ref: 'WorkspaceMember',
  localField: '_id',
  foreignField: 'workspaceId',
  count: true,
});

// ─── Model Export ─────────────────────────────────────────────────────────────

/**
 * WorkspaceModel — the primary Mongoose model for the workspace-meta-connection spec.
 *
 * Note: Uses a distinct model name 'WorkspaceV2' to avoid colliding with the
 * legacy Workspace model already registered under the 'Workspace' name in
 * server/models/Workspace/Workspace.ts and server/models/Workspace.ts.
 * The underlying collection is explicitly named 'workspaces_v2' to keep data
 * isolated until a full migration of the legacy model is performed.
 */
export const WorkspaceModel: Model<IWorkspace> = (
  mongoose.models['WorkspaceV2'] as Model<IWorkspace> | undefined
) ?? mongoose.model<IWorkspace>('WorkspaceV2', WorkspaceSchema, 'workspaces_v2');
