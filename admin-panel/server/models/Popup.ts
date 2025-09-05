import mongoose, { Document, Schema } from 'mongoose';

export interface IPopup extends Document {
  _id: string;
  title: string;
  content: string;
  type: 'modal' | 'banner' | 'toast' | 'slide_in' | 'fullscreen';
  position: 'top' | 'bottom' | 'center' | 'left' | 'right';
  
  // Display rules
  displayRules: {
    pages: string[]; // Which pages to show on
    userSegments: string[]; // Target user segments
    userRoles: string[]; // Target user roles
    devices: ('desktop' | 'mobile' | 'tablet')[];
    browsers: string[];
    countries: string[];
    languages: string[];
  };
  
  // Scheduling
  scheduling: {
    startDate?: Date;
    endDate?: Date;
    timezone: string;
    frequency: 'once' | 'daily' | 'weekly' | 'monthly';
    maxDisplays: number; // Max times to show per user
    cooldown: number; // Hours between displays
  };
  
  // A/B Testing
  abTest: {
    enabled: boolean;
    variants: Array<{
      id: string;
      name: string;
      content: string;
      weight: number; // Percentage (0-100)
    }>;
    winner?: string; // Winning variant ID
  };
  
  // Design
  design: {
    backgroundColor: string;
    textColor: string;
    borderColor?: string;
    borderRadius: number;
    padding: number;
    fontSize: number;
    fontFamily: string;
    customCSS?: string;
  };
  
  // Actions
  actions: Array<{
    type: 'button' | 'link' | 'close';
    label: string;
    action: string;
    url?: string;
    style: 'primary' | 'secondary' | 'danger' | 'success';
  }>;
  
  // Status
  status: 'draft' | 'active' | 'paused' | 'archived';
  isActive: boolean;
  
  // Analytics
  analytics: {
    impressions: number;
    clicks: number;
    conversions: number;
    dismissals: number;
    clickRate: number;
    conversionRate: number;
  };
  
  // Advanced features
  advanced: {
    triggerDelay: number; // Seconds to wait before showing
    exitIntent: boolean; // Show on exit intent
    scrollTrigger: number; // Show after scrolling X%
    timeOnPage: number; // Show after X seconds on page
    customTrigger?: string; // Custom JavaScript trigger
  };
  
  createdBy: string; // Admin ID
  createdAt: Date;
  updatedAt: Date;
}

const PopupSchema = new Schema<IPopup>({
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  type: {
    type: String,
    required: true,
    enum: ['modal', 'banner', 'toast', 'slide_in', 'fullscreen'],
    default: 'modal'
  },
  position: {
    type: String,
    required: true,
    enum: ['top', 'bottom', 'center', 'left', 'right'],
    default: 'center'
  },
  
  // Display rules
  displayRules: {
    pages: [{
      type: String
    }],
    userSegments: [{
      type: String
    }],
    userRoles: [{
      type: String
    }],
    devices: [{
      type: String,
      enum: ['desktop', 'mobile', 'tablet']
    }],
    browsers: [{
      type: String
    }],
    countries: [{
      type: String
    }],
    languages: [{
      type: String
    }]
  },
  
  // Scheduling
  scheduling: {
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    frequency: {
      type: String,
      enum: ['once', 'daily', 'weekly', 'monthly'],
      default: 'once'
    },
    maxDisplays: {
      type: Number,
      default: 1
    },
    cooldown: {
      type: Number,
      default: 24 // hours
    }
  },
  
  // A/B Testing
  abTest: {
    enabled: {
      type: Boolean,
      default: false
    },
    variants: [{
      id: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true
      },
      content: {
        type: String,
        required: true
      },
      weight: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
      }
    }],
    winner: String
  },
  
  // Design
  design: {
    backgroundColor: {
      type: String,
      default: '#ffffff'
    },
    textColor: {
      type: String,
      default: '#000000'
    },
    borderColor: String,
    borderRadius: {
      type: Number,
      default: 8
    },
    padding: {
      type: Number,
      default: 20
    },
    fontSize: {
      type: Number,
      default: 16
    },
    fontFamily: {
      type: String,
      default: 'Arial, sans-serif'
    },
    customCSS: String
  },
  
  // Actions
  actions: [{
    type: {
      type: String,
      enum: ['button', 'link', 'close'],
      required: true
    },
    label: {
      type: String,
      required: true
    },
    action: {
      type: String,
      required: true
    },
    url: String,
    style: {
      type: String,
      enum: ['primary', 'secondary', 'danger', 'success'],
      default: 'primary'
    }
  }],
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['draft', 'active', 'paused', 'archived'],
    default: 'draft'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  
  // Analytics
  analytics: {
    impressions: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    conversions: {
      type: Number,
      default: 0
    },
    dismissals: {
      type: Number,
      default: 0
    },
    clickRate: {
      type: Number,
      default: 0
    },
    conversionRate: {
      type: Number,
      default: 0
    }
  },
  
  // Advanced features
  advanced: {
    triggerDelay: {
      type: Number,
      default: 0
    },
    exitIntent: {
      type: Boolean,
      default: false
    },
    scrollTrigger: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    timeOnPage: {
      type: Number,
      default: 0
    },
    customTrigger: String
  },
  
  createdBy: {
    type: String,
    required: true,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes
PopupSchema.index({ status: 1, isActive: 1 });
PopupSchema.index({ 'scheduling.startDate': 1, 'scheduling.endDate': 1 });
PopupSchema.index({ createdBy: 1 });
PopupSchema.index({ createdAt: -1 });

export default mongoose.model<IPopup>('Popup', PopupSchema);
