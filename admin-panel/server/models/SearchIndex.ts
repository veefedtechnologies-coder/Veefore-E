import mongoose, { Document, Schema } from 'mongoose';

export interface ISearchIndex extends Document {
  _id: string;
  entityType: string; // 'user', 'admin', 'subscription', 'ticket', 'webhook', etc.
  entityId: string;
  title: string;
  content: string;
  tags: string[];
  metadata: {
    [key: string]: any;
  };
  searchableFields: {
    [key: string]: string;
  };
  priority: number; // Higher priority = more relevant
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SearchIndexSchema = new Schema<ISearchIndex>({
  entityType: {
    type: String,
    required: true,
    index: true
  },
  entityId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    index: 'text'
  },
  content: {
    type: String,
    required: true,
    index: 'text'
  },
  tags: [{
    type: String,
    index: true
  }],
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  },
  searchableFields: {
    type: Map,
    of: String
  },
  priority: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes
SearchIndexSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
SearchIndexSchema.index({ entityType: 1, isActive: 1 });
SearchIndexSchema.index({ priority: -1, createdAt: -1 });

// Text search index
SearchIndexSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text',
  'searchableFields.$**': 'text'
}, {
  weights: {
    title: 10,
    tags: 5,
    content: 1,
    'searchableFields.$**': 3
  }
});

export default mongoose.model<ISearchIndex>('SearchIndex', SearchIndexSchema);
