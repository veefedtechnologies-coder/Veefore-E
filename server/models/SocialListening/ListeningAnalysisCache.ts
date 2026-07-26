import mongoose, { Document, Schema } from 'mongoose';

/**
 * Cache of AI analysis results keyed by a hash of the analyzed content.
 *
 * WHY: Social Listening re-fetches overlapping content on every sync (the same
 * Reddit threads, echoed news headlines, evergreen YouTube videos keep showing
 * up), and the background refresh + a user-triggered sync often analyze the same
 * posts. Caching the per-content AI result means we only pay the LLM once for a
 * given piece of text — both the synchronous path and the OpenAI Batch API path
 * consult this cache first and only send genuine cache MISSES to the model.
 *
 * Entries auto-expire via a TTL index so stale sentiment doesn't linger forever.
 */
export interface IListeningAnalysisCache extends Document {
  contentHash: string;   // sha1 of the normalized content
  platform: string;      // platform is part of the prompt, so part of the key
  result: {
    sentiment: 'positive' | 'negative' | 'neutral';
    sentimentScore: number;
    emotions: string[];
    hooks: string[];
    painPoints: string[];
    topics: string[];
    hashtags: string[];
  };
  hits: number;          // how many times this cache entry was reused
  expiresAt: Date;       // TTL anchor
  createdAt?: Date;
  updatedAt?: Date;
}

const ListeningAnalysisCacheSchema = new Schema<IListeningAnalysisCache>(
  {
    contentHash: { type: String, required: true },
    platform: { type: String, required: true },
    result: {
      sentiment: { type: String },
      sentimentScore: { type: Number },
      emotions: { type: [String], default: [] },
      hooks: { type: [String], default: [] },
      painPoints: { type: [String], default: [] },
      topics: { type: [String], default: [] },
      hashtags: { type: [String], default: [] },
    },
    hits: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// One cache entry per (content, platform).
ListeningAnalysisCacheSchema.index({ contentHash: 1, platform: 1 }, { unique: true });
// TTL: Mongo removes the doc once `expiresAt` passes.
ListeningAnalysisCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ListeningAnalysisCacheModel =
  (mongoose.models.ListeningAnalysisCache as mongoose.Model<IListeningAnalysisCache>) ||
  mongoose.model<IListeningAnalysisCache>(
    'ListeningAnalysisCache',
    ListeningAnalysisCacheSchema,
    'listening_analysis_cache'
  );
