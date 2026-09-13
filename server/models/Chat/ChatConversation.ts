import mongoose, { Document, Schema } from 'mongoose';

// Labels for instruction-like Conversation_State entries. Every instruction-like
// entry carries exactly one label (Req 8.5); state is always treated as DATA and
// never overrides safety/core instructions (Req 17.4/18.2).
export type ConversationStateLabel =
  | 'user_preference'
  | 'user_request'
  | 'factual_state'
  | 'application_state'
  | 'system_instruction';

// Durable Conversation_State persisted as an OPTIONAL sub-document on the existing
// ChatConversation (no new collection, no second memory system — Req 21.1/21.2).
// All fields are optional and lazily created on first write, so legacy documents
// without `contextState` continue to read without error (Req 20.6/21.3/21.4).
export interface IConversationState {
  version: 1;
  objective?: string;
  currentTask?: string;
  requirements?: string[];
  decisions?: string[];
  constraints?: string[];
  entities?: string[];
  selectedOptions?: string[];
  pendingActions?: string[];
  facts?: string[]; // facts referenced by a later turn
  toolDerivedState?: string[];
  // Every instruction-like entry carries exactly one label (Req 8.5).
  labels?: Record<string, ConversationStateLabel>;
  summarizedMessageCount?: number; // mirrors existing rolling-summary counter
  updatedAt?: Date;
}

export interface IChatConversation extends Document {
  id: number;
  userId: string;
  workspaceId: string;
  title: string;
  messageCount: number;
  isArchived?: boolean;
  lastMessageAt?: Date;
  // Rolling long-term memory: a running summary of older messages that have
  // scrolled out of the verbatim history window, plus how many of the oldest
  // messages have already been folded into that summary. This gives the chat
  // effectively unlimited memory without an unbounded prompt.
  memorySummary?: string;
  summarizedMessageCount?: number;
  // Durable Conversation_State (Req 7/8/21). Optional and absent on legacy docs;
  // the composer treats a missing state as empty and falls back to summary +
  // recent window.
  contextState?: IConversationState;
  // Links this conversation 1:1 to an Auto Pilot Mission. Set when the Auto
  // Pilot Operating Loop opens its dedicated per-mission narration/approval
  // conversation, so the bridge can find-or-create it idempotently (R16.2).
  autopilotMissionId?: string;
  // In-progress "pending post" state for the VeeGPT scheduling flow. The
  // schedule flow spans multiple turns (attach media → pick time → pick
  // account); this durable, optional sub-doc lets a follow-up turn recover the
  // media/time/account gathered so far so we don't repeat the "attach the
  // image…" prompt. Best-effort: written when a follow-up is asked, cleared when
  // the confirm card is emitted or the post is confirmed. Time-boxed on read.
  pendingPost?: {
    mediaUrls?: string[];
    scheduledLocal?: string;
    accountId?: string;
    updatedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const ChatConversationSchema = new Schema<IChatConversation>({
  id: { type: Number, unique: true },
  userId: { type: String, required: true },
  workspaceId: { type: String, required: true },
  title: { type: String, required: true, default: "New chat" },
  messageCount: { type: Number, default: 0 },
  isArchived: { type: Boolean, default: false },
  lastMessageAt: { type: Date },
  memorySummary: { type: String, default: '' },
  summarizedMessageCount: { type: Number, default: 0 },
  // Durable Conversation_State (Req 7/8/21). Stored as an OPTIONAL sub-document
  // on the existing conversation: no new collection, no migration (lazy optional
  // fields), and no new index. `required: false` + `default: undefined` means
  // legacy documents without this field read without error (Req 20.6/21.1-21.4).
  contextState: {
    type: new Schema<IConversationState>(
      {
        version: { type: Number, required: false, default: 1 },
        objective: { type: String, required: false },
        currentTask: { type: String, required: false },
        requirements: { type: [String], required: false },
        decisions: { type: [String], required: false },
        constraints: { type: [String], required: false },
        entities: { type: [String], required: false },
        selectedOptions: { type: [String], required: false },
        pendingActions: { type: [String], required: false },
        facts: { type: [String], required: false },
        toolDerivedState: { type: [String], required: false },
        // Free-form map of instruction-like entry -> single label (Req 8.5).
        labels: { type: Schema.Types.Mixed, required: false },
        summarizedMessageCount: { type: Number, required: false },
        updatedAt: { type: Date, required: false },
      },
      { _id: false }
    ),
    required: false,
    default: undefined,
  },
  // Auto Pilot per-mission conversation link (R16.2); sparse so ordinary chats
  // are unaffected and the mission → conversation lookup is unique.
  autopilotMissionId: { type: String, required: false, index: true, sparse: true },
  // In-progress VeeGPT scheduling state (optional; absent on legacy docs). Stored
  // as Mixed so partial state (media only, or media+time) writes without a rigid
  // shape and nothing else breaks.
  pendingPost: { type: Schema.Types.Mixed, required: false, default: undefined },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const ChatConversation = mongoose.models.ChatConversation as mongoose.Model<IChatConversation> || mongoose.model<IChatConversation>('ChatConversation', ChatConversationSchema);
