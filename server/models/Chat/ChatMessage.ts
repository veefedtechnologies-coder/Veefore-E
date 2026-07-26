import mongoose, { Document, Schema } from 'mongoose';

export interface IChatMessageAttachment {
  name?: string;
  mimeType: string;
  /** Hosted URL for media that lives on the server (e.g. a scheduled-post image),
   *  so the thumbnail can be re-rendered from chat history after refresh. */
  url?: string;
}

export interface IChatMessage extends Document {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant';
  content: string;
  /** Lightweight metadata about files the user attached (no binary data). */
  attachments?: IChatMessageAttachment[];
  /** Persisted inline post-confirm card (VeeGPT scheduling agent) so the card
   *  survives refresh just like the rest of the chat. */
  postCard?: {
    plan: any;
    mediaUrls: string[];
    status: 'idle' | 'working' | 'done' | 'error';
    resultText?: string;
  };
  /** Persisted list of the user's posts (scheduled/draft/published) rendered as
   *  cards instead of plain text. Read-only display. */
  listCard?: {
    kind: string; // e.g. 'scheduled_posts'
    title?: string;
    items: Array<Record<string, any>>;
  };
  /** Persisted edit-confirmation card: a proposed change to existing content the
   *  user must confirm before it is applied. (Legacy single-card field — kept
   *  for back-compat reads; new turns use `editCards`.) */
  editCard?: {
    action: 'reschedule_post' | 'cancel_scheduled_post' | 'update_post_caption';
    contentId: string;
    title?: string;
    current?: Record<string, any>;
    proposed?: Record<string, any>;
    status: 'idle' | 'working' | 'done' | 'error';
    resultText?: string;
  };
  /** Multiple edit-confirmation cards (multi-tool turns). Each has its own id so
   *  it can be confirmed/cancelled independently. */
  editCards?: Array<{
    id: string;
    action: 'reschedule_post' | 'cancel_scheduled_post' | 'update_post_caption';
    contentId: string;
    title?: string;
    post?: Record<string, any>;
    current?: Record<string, any>;
    proposed?: Record<string, any>;
    status: 'idle' | 'working' | 'done' | 'error';
    resultText?: string;
  }>;
  /** Persisted info/assist cards (caption options, hashtags, analytics insight,
   *  growth recommendations, best posting time, trends). Read-only display;
   *  multiple may appear in one turn. */
  infoCards?: Array<{
    id: string;
    kind: string; // 'captions' | 'hashtags' | 'insight' | 'recommendations' | 'best_time' | 'trends'
    title?: string;
    [key: string]: any;
  }>;
  /** True when this assistant message is an error placeholder the user can retry
   *  (e.g. the AI provider was rate-limited and produced no real answer). */
  retryable?: boolean;
  /** Regenerated alternatives of this assistant reply (ChatGPT-style 1/2, 2/2).
   *  Each entry is a full response snapshot. `content`/cards at the top level
   *  always mirror `variants[activeVariant]` so reads and history stay simple. */
  variants?: Array<{
    content: string;
    postCard?: any;
    listCard?: any;
    editCards?: any[];
    infoCards?: any[];
    createdAt?: Date;
  }>;
  /** Index into `variants` that is currently shown / used for history. */
  activeVariant?: number;
  tokensUsed: number;
  createdAt: Date;
}

export const ChatMessageSchema = new Schema<IChatMessage>({
  id: { type: Number, unique: true },
  conversationId: { type: Number, required: true },
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  attachments: {
    type: [new Schema<IChatMessageAttachment>({ name: String, mimeType: String, url: String }, { _id: false })],
    default: undefined,
  },
  postCard: { type: Schema.Types.Mixed, default: undefined },
  listCard: { type: Schema.Types.Mixed, default: undefined },
  editCard: { type: Schema.Types.Mixed, default: undefined },
  editCards: { type: Schema.Types.Mixed, default: undefined },
  infoCards: { type: Schema.Types.Mixed, default: undefined },
  retryable: { type: Boolean, default: undefined },
  variants: { type: Schema.Types.Mixed, default: undefined },
  activeVariant: { type: Number, default: undefined },
  tokensUsed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export const ChatMessage = mongoose.models.ChatMessage as mongoose.Model<IChatMessage> || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
