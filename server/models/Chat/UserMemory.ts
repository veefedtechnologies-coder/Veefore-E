import mongoose, { Document, Schema } from 'mongoose';

/**
 * Cross-chat ("global") memory layer — ChatGPT-style "Memory".
 *
 * Unlike the per-conversation rolling summary (which lives on ChatConversation
 * and is scoped to a single thread), this stores durable facts about the user
 * that persist ACROSS all of their chats in a workspace: their name, niche,
 * brand, goals, preferences, recurring topics, etc. Injected into every prompt
 * (when AI Memory = long-term) so VeeGPT "remembers" the user between chats.
 *
 * Production-safe storage:
 *  - Scoped uniquely by userId + workspaceId (one bounded doc per pair).
 *  - Memory is kept as DISCRETE items (not one ever-growing blob) so the UI can
 *    list them and the user can delete individual ones.
 *  - Hard caps on item count and total characters (see MEMORY_LIMITS) prevent
 *    unbounded growth — the document can never balloon and exploit the DB.
 */

/** Hard storage limits per (user, workspace). Keep in sync with any UI copy. */
export const MEMORY_LIMITS = {
  /** Max number of discrete memory items retained. */
  MAX_ITEMS: 50,
  /** Total character budget across all items (the "storage" the UI shows). */
  MAX_CHARS: 8000,
  /** Max characters for a single item (defensive truncation). */
  MAX_ITEM_CHARS: 400,
};

export interface IUserMemoryItem {
  /** Stable id for referencing/deleting a single memory. */
  id: string;
  /** The remembered fact (one concise sentence/bullet). */
  text: string;
  createdAt: Date;
}

export interface IUserMemory extends Document {
  userId: string;
  workspaceId: string;
  /** Discrete durable facts about the user (learned from chats). */
  items: IUserMemoryItem[];
  /**
   * Live workspace + account data snapshot (user identity, social accounts &
   * stats, recent content, recommendations, performance insight). Stored in the
   * SAME memory document — not a separate store — and refreshed in place by the
   * background worker whenever the underlying data changes.
   */
  workspaceContext?: any;
  workspaceContextUpdatedAt?: Date;
  /** Ids of conversations already mined for memory (avoids re-processing). */
  processedConversationIds: number[];
  createdAt: Date;
  updatedAt: Date;
}

const UserMemoryItemSchema = new Schema<IUserMemoryItem>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, maxlength: MEMORY_LIMITS.MAX_ITEM_CHARS },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

export const UserMemorySchema = new Schema<IUserMemory>({
  userId: { type: String, required: true },
  workspaceId: { type: String, required: true },
  items: { type: [UserMemoryItemSchema], default: [] },
  workspaceContext: { type: Schema.Types.Mixed, default: null },
  workspaceContextUpdatedAt: { type: Date },
  processedConversationIds: { type: [Number], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

UserMemorySchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

export const UserMemory =
  (mongoose.models.UserMemory as mongoose.Model<IUserMemory>) ||
  mongoose.model<IUserMemory>('UserMemory', UserMemorySchema);
