import mongoose from 'mongoose';
import User from '../models/User';
import Subscription from '../models/Subscription';
import Analytics from '../models/Analytics';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const sampleUsers = [
  {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1-555-0123',
    isActive: true,
    isEmailVerified: true,
    isBanned: false,
    subscription: {
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false
    },
    credits: {
      total: 1000,
      used: 250,
      remaining: 750
    },
    socialMedia: {
      platforms: {
        twitter: {
          handle: '@johndoe',
          followers: 12500,
          verified: true,
          connected: true
        },
        instagram: {
          handle: '@john_doe',
          followers: 8500,
          verified: false,
          connected: true
        },
        linkedin: {
          handle: 'john-doe-professional',
          connections: 500,
          verified: true,
          connected: true
        }
      }
    },
    preferences: {
      language: 'en',
      timezone: 'America/New_York',
      notifications: {
        email: true,
        push: true,
        sms: false
      }
    },
    lastLogin: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    loginCount: 45
  },
  {
    firstName: 'Sarah',
    lastName: 'Wilson',
    email: 'sarah.wilson@example.com',
    phone: '+1-555-0124',
    isActive: true,
    isEmailVerified: true,
    isBanned: false,
    subscription: {
      plan: 'enterprise',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false
    },
    credits: {
      total: 5000,
      used: 1200,
      remaining: 3800
    },
    socialMedia: {
      platforms: {
        youtube: {
          handle: 'SarahWilsonTech',
          subscribers: 25000,
          verified: true,
          connected: true
        },
        tiktok: {
          handle: '@sarahwtech',
          followers: 15000,
          verified: false,
          connected: true
        }
      }
    },
    preferences: {
      language: 'en',
      timezone: 'America/Los_Angeles',
      notifications: {
        email: true,
        push: true,
        sms: true
      }
    },
    lastLogin: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    loginCount: 78
  },
  {
    firstName: 'Michael',
    lastName: 'Chen',
    email: 'michael.chen@example.com',
    phone: '+1-555-0125',
    isActive: true,
    isEmailVerified: false,
    isBanned: false,
    subscription: {
      plan: 'starter',
      status: 'trialing',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false
    },
    credits: {
      total: 100,
      used: 25,
      remaining: 75
    },
    socialMedia: {
      platforms: {}
    },
    preferences: {
      language: 'en',
      timezone: 'America/Chicago',
      notifications: {
        email: true,
        push: false,
        sms: false
      }
    },
    lastLogin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    loginCount: 12
  },
  {
    firstName: 'Emily',
    lastName: 'Rodriguez',
    email: 'emily.rodriguez@example.com',
    phone: '+1-555-0126',
    isActive: false,
    isEmailVerified: true,
    isBanned: false,
    subscription: {
      plan: 'free',
      status: 'canceled',
      currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: true
    },
    credits: {
      total: 50,
      used: 50,
      remaining: 0
    },
    socialMedia: {
      platforms: {
        instagram: {
          handle: '@emily_rodriguez',
          followers: 3200,
          verified: false,
          connected: true
        }
      }
    },
    preferences: {
      language: 'es',
      timezone: 'America/Mexico_City',
      notifications: {
        email: false,
        push: false,
        sms: false
      }
    },
    lastLogin: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
    loginCount: 8
  },
  {
    firstName: 'David',
    lastName: 'Kim',
    email: 'david.kim@example.com',
    phone: '+1-555-0127',
    isActive: true,
    isEmailVerified: true,
    isBanned: true,
    banReason: 'Violation of terms of service',
    bannedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    subscription: {
      plan: 'pro',
      status: 'canceled',
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: true
    },
    credits: {
      total: 500,
      used: 500,
      remaining: 0
    },
    socialMedia: {
      platforms: {}
    },
    preferences: {
      language: 'en',
      timezone: 'America/New_York',
      notifications: {
        email: true,
        push: true,
        sms: false
      }
    },
    lastLogin: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
    loginCount: 23
  }
];

const createSubscription = (userId: string, plan: string, status: string) => {
  const planConfigs = {
    free: {
      planId: 'free_plan',
      planName: 'Free Plan',
      basePrice: 0,
      finalPrice: 0,
      credits: { included: 50, remaining: 50 },
      limits: { maxUsers: 1, maxProjects: 3, maxStorage: 1 }
    },
    starter: {
      planId: 'starter_plan',
      planName: 'Starter Plan',
      basePrice: 9.99,
      finalPrice: 9.99,
      credits: { included: 100, remaining: 75 },
      limits: { maxUsers: 5, maxProjects: 10, maxStorage: 10 }
    },
    pro: {
      planId: 'pro_plan',
      planName: 'Pro Plan',
      basePrice: 29.99,
      finalPrice: 29.99,
      credits: { included: 1000, remaining: 750 },
      limits: { maxUsers: 25, maxProjects: 50, maxStorage: 100 }
    },
    enterprise: {
      planId: 'enterprise_plan',
      planName: 'Enterprise Plan',
      basePrice: 99.99,
      finalPrice: 99.99,
      credits: { included: 5000, remaining: 3800 },
      limits: { maxUsers: -1, maxProjects: -1, maxStorage: 1000 }
    }
  };

  const config = planConfigs[plan as keyof typeof planConfigs] || planConfigs.free;
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    userId,
    planId: config.planId,
    planName: config.planName,
    pricing: {
      basePrice: config.basePrice,
      currency: 'USD',
      billingCycle: 'monthly',
      region: 'US',
      regionMultiplier: 1.0,
      finalPrice: config.finalPrice
    },
    status,
    currentPeriodStart: now,
    currentPeriodEnd: nextMonth,
    cancelAtPeriodEnd: status === 'canceled',
    features: {
      credits: {
        included: config.credits.included,
        used: config.credits.included - config.credits.remaining,
        remaining: config.credits.remaining,
        resetDate: nextMonth
      },
      limits: config.limits,
      addons: []
    },
    billing: {
      paymentMethod: {
        type: 'card' as const,
        last4: '4242',
        brand: 'visa',
        expiryMonth: 12,
        expiryYear: 2025
      },
      nextBillingDate: nextMonth,
      billingAddress: {
        country: 'US',
        state: 'CA',
        city: 'San Francisco',
        postalCode: '94105',
        line1: '123 Main St'
      },
      taxRate: 0.08,
      taxAmount: config.finalPrice * 0.08
    },
    discounts: [],
    payments: [],
    usage: {
      creditsUsed: config.credits.included - config.credits.remaining,
      apiCalls: Math.floor(Math.random() * 1000),
      storageUsed: Math.floor(Math.random() * 50),
      nextResetDate: nextMonth
    },
    metadata: {
      source: 'web',
      referrer: 'google',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'brand'
    },
    createdBy: 'system'
  };
};

const createAnalytics = (userId: string, type: string, description: string) => {
  const now = new Date();
  return {
    userId,
    date: now,
    period: 'daily' as const,
    revenue: {
      total: Math.floor(Math.random() * 1000),
      byPlan: { pro: 500, enterprise: 300, starter: 200 },
      byRegion: { US: 800, EU: 200 },
      refunded: Math.floor(Math.random() * 50),
      net: Math.floor(Math.random() * 950)
    },
    users: {
      total: 5,
      new: 1,
      active: 3,
      churned: 1,
      byPlan: { free: 1, pro: 2, enterprise: 1, starter: 1 },
      topSpenders: [
        { userId, email: 'user@example.com', amount: 500 }
      ]
    },
    credits: {
      totalPurchased: Math.floor(Math.random() * 10000),
      totalSpent: Math.floor(Math.random() * 5000),
      byFeature: { 'ai-generation': 2000, 'transcription': 1500, 'analysis': 1000 },
      addOnsPurchased: { 'extra-credits': 5, 'priority-support': 2 }
    },
    aiUsage: {
      openai: {
        tokens: Math.floor(Math.random() * 100000),
        cost: Math.floor(Math.random() * 100),
        models: { 'gpt-4': 50000, 'gpt-3-5-turbo': 50000 }
      },
      vapi: {
        minutes: Math.floor(Math.random() * 1000),
        cost: Math.floor(Math.random() * 50)
      },
      transcription: {
        hours: Math.floor(Math.random() * 100),
        cost: Math.floor(Math.random() * 200)
      },
      other: {}
    },
    planDistribution: {
      free: 1,
      paid: { starter: 1, pro: 2, enterprise: 1 },
      upgrades: 2,
      downgrades: 1
    },
    performance: {
      avgTicketResolutionTime: Math.floor(Math.random() * 120) + 30,
      refundApprovalTime: Math.floor(Math.random() * 60) + 15,
      couponSuccessRate: Math.floor(Math.random() * 20) + 70,
      systemUptime: 99.9
    }
  };
};

async function seedCompleteData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-admin');
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Subscription.deleteMany({});
    await Analytics.deleteMany({});
    console.log('Cleared existing data');

    // Create users
    const createdUsers = [];
    for (const userData of sampleUsers) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`Created user: ${user.firstName} ${user.lastName}`);
    }

    // Create subscriptions for each user
    for (const user of createdUsers) {
      const subscription = new Subscription(createSubscription(
        user._id.toString(),
        user.subscription.plan,
        user.subscription.status
      ));
      await subscription.save();
      console.log(`Created subscription for: ${user.firstName} ${user.lastName}`);
    }

    // Create analytics records
    const analyticsTypes = [
      { type: 'login', description: 'User logged in successfully' },
      { type: 'subscription_created', description: 'User created new subscription' },
      { type: 'social_connection', description: 'User connected social media account' },
      { type: 'credit_usage', description: 'User used credits for AI generation' },
      { type: 'feature_access', description: 'User accessed premium feature' }
    ];

    for (const user of createdUsers) {
      for (const analyticsType of analyticsTypes) {
        const analytics = new Analytics(createAnalytics(
          user._id.toString(),
          analyticsType.type,
          analyticsType.description
        ));
        await analytics.save();
      }
      console.log(`Created analytics for: ${user.firstName} ${user.lastName}`);
    }

    console.log('✅ Complete data seeding completed successfully!');
    console.log(`Created ${createdUsers.length} users`);
    console.log(`Created ${createdUsers.length} subscriptions`);
    console.log(`Created ${createdUsers.length * analyticsTypes.length} analytics records`);

  } catch (error) {
    console.error('Error seeding complete data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the seed function
seedCompleteData();
