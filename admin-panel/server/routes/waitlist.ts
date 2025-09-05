import express from 'express';
import mongoose from 'mongoose';
import { connectToMainApp } from '../services/userDataService';

const router = express.Router();

// Waitlist user schema
const WaitlistUserSchema = new mongoose.Schema({
  name: String,
  email: String,
  referralCode: String,
  referredBy: String,
  referralCount: Number,
  credits: Number,
  status: String,
  discountCode: String,
  discountExpiresAt: Date,
  dailyLogins: Number,
  feedbackSubmitted: Boolean,
  joinedAt: Date,
  createdAt: Date,
  updatedAt: Date,
  metadata: mongoose.Schema.Types.Mixed
});

// Main app user schema
const MainAppUserSchema = new mongoose.Schema({
  firebaseUid: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  displayName: String,
  avatar: String,
  credits: { type: Number, default: 0 },
  plan: { type: String, default: 'Free' },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  referralCode: { type: String, unique: true },
  totalReferrals: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  referredBy: String,
  preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  isOnboarded: { type: Boolean, default: false },
  onboardingCompletedAt: Date,
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationCode: String,
  emailVerificationExpiry: Date,
  onboardingStep: { type: Number, default: 1 },
  onboardingData: { type: mongoose.Schema.Types.Mixed, default: {} },
  goals: { type: mongoose.Schema.Types.Mixed, default: [] },
  niche: String,
  targetAudience: String,
  contentStyle: String,
  postingFrequency: String,
  socialPlatforms: { type: mongoose.Schema.Types.Mixed, default: [] },
  businessType: String,
  experienceLevel: String,
  primaryObjective: String,
  status: { type: String, default: 'waitlisted' },
  trialExpiresAt: Date,
  discountCode: String,
  discountExpiresAt: Date,
  hasUsedWaitlistBonus: { type: Boolean, default: false },
  dailyLoginStreak: { type: Number, default: 0 },
  lastLoginAt: Date,
  feedbackSubmittedAt: Date,
  workspaceId: { type: String, index: true },
  instagramToken: String,
  instagramRefreshToken: String,
  instagramTokenExpiry: Date,
  instagramAccountId: String,
  instagramUsername: String,
  tokenStatus: { type: String, enum: ['active', 'expired', 'rate_limited', 'invalid'], default: 'active' },
  lastApiCallTimestamp: Date,
  rateLimitResetAt: Date,
  apiCallCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Get all waitlist users with questionnaire data
router.get('/waitlist-users', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');
    
    const { page = 1, limit = 10, status = 'all', search = '' } = req.query;
    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const skip = (pageNum - 1) * limitNum;

    // Build query
    let query: any = {};
    
    if (status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { referralCode: { $regex: search, $options: 'i' } }
      ];
    }

    const waitlistUsers = await WaitlistUser.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await WaitlistUser.countDocuments(query);

    // Transform users to include questionnaire data
    const transformedUsers = waitlistUsers.map(user => {
      const questionnaire = user.metadata?.questionnaire || {};
      
      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        referralCount: user.referralCount || 0,
        credits: user.credits || 0,
        status: user.status || 'waitlisted',
        discountCode: user.discountCode,
        discountExpiresAt: user.discountExpiresAt,
        dailyLogins: user.dailyLogins || 0,
        feedbackSubmitted: user.feedbackSubmitted || false,
        joinedAt: user.joinedAt || user.createdAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        
        // Questionnaire data
        questionnaire: {
          businessType: questionnaire.businessType || null,
          teamSize: questionnaire.teamSize || null,
          currentTools: questionnaire.currentTools || [],
          primaryGoal: questionnaire.primaryGoal || null,
          contentTypes: questionnaire.contentTypes || [],
          budget: questionnaire.budget || null,
          urgency: questionnaire.urgency || null
        },
        
        // Additional metadata
        metadata: {
          ipAddress: user.metadata?.ipAddress || null,
          userAgent: user.metadata?.userAgent || null,
          emailVerified: user.metadata?.emailVerified || false,
          joinedAt: user.metadata?.joinedAt || null
        }
      };
    });

    res.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching waitlist users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch waitlist users'
    });
  }
});

// Get single waitlist user details
router.get('/waitlist-users/:id', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');
    
    const user = await WaitlistUser.findById(req.params.id).lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Waitlist user not found'
      });
    }

    const questionnaire = user.metadata?.questionnaire || {};
    
    const transformedUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      referralCount: user.referralCount || 0,
      credits: user.credits || 0,
      status: user.status || 'waitlisted',
      discountCode: user.discountCode,
      discountExpiresAt: user.discountExpiresAt,
      dailyLogins: user.dailyLogins || 0,
      feedbackSubmitted: user.feedbackSubmitted || false,
      joinedAt: user.joinedAt || user.createdAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      
      // Questionnaire data
      questionnaire: {
        businessType: questionnaire.businessType || null,
        teamSize: questionnaire.teamSize || null,
        currentTools: questionnaire.currentTools || [],
        primaryGoal: questionnaire.primaryGoal || null,
        contentTypes: questionnaire.contentTypes || [],
        budget: questionnaire.budget || null,
        urgency: questionnaire.urgency || null
      },
      
      // Additional metadata
      metadata: {
        ipAddress: user.metadata?.ipAddress || null,
        userAgent: user.metadata?.userAgent || null,
        emailVerified: user.metadata?.emailVerified || false,
        joinedAt: user.metadata?.joinedAt || null
      }
    };

    res.json({
      success: true,
      data: transformedUser
    });

  } catch (error) {
    console.error('Error fetching waitlist user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch waitlist user'
    });
  }
});

// Approve waitlist user (give early access)
router.post('/waitlist-users/:id/approve', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');
    const User = connection.model('User', MainAppUserSchema, 'users');
    
    const { id } = req.params;
    const { adminNotes } = req.body;
    
    // Get waitlist user
    const waitlistUser = await WaitlistUser.findById(id).lean();
    if (!waitlistUser) {
      return res.status(404).json({
        success: false,
        error: 'Waitlist user not found'
      });
    }

    // Check if user already exists in main collection
    let mainUser = await User.findOne({ email: waitlistUser.email }).lean();
    
    if (!mainUser) {
      // Create new user in main collection
      const newUser = new User({
        email: waitlistUser.email,
        username: waitlistUser.email.split('@')[0] + '_' + Date.now(),
        displayName: waitlistUser.name,
        status: 'early_access',
        isEmailVerified: waitlistUser.metadata?.emailVerified || false,
        referralCode: waitlistUser.referralCode,
        referredBy: waitlistUser.referredBy,
        totalReferrals: waitlistUser.referralCount || 0,
        credits: 50, // Give them some credits
        plan: 'Free',
        hasUsedWaitlistBonus: false,
        preferences: {
          waitlistApproved: true,
          approvedAt: new Date(),
          adminNotes: adminNotes || null,
          originalWaitlistData: waitlistUser.metadata?.questionnaire || {}
        }
      });
      
      mainUser = await newUser.save();
    } else {
      // Update existing user
      await User.findByIdAndUpdate(mainUser._id, {
        status: 'early_access',
        isEmailVerified: true,
        credits: (mainUser.credits || 0) + 50,
        $set: {
          'preferences.waitlistApproved': true,
          'preferences.approvedAt': new Date(),
          'preferences.adminNotes': adminNotes || null,
          'preferences.originalWaitlistData': waitlistUser.metadata?.questionnaire || {}
        }
      });
    }

    // Update waitlist user status
    await WaitlistUser.findByIdAndUpdate(id, {
      status: 'early_access',
      updatedAt: new Date(),
      $set: {
        'metadata.approvedAt': new Date(),
        'metadata.approvedBy': 'admin',
        'metadata.adminNotes': adminNotes || null
      }
    });

    // TODO: Send approval email here
    console.log(`[WAITLIST] User ${waitlistUser.email} approved for early access`);

    res.json({
      success: true,
      message: 'User approved for early access successfully',
      data: {
        waitlistUserId: id,
        mainUserId: mainUser._id.toString(),
        email: waitlistUser.email,
        status: 'early_access'
      }
    });

  } catch (error) {
    console.error('Error approving waitlist user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve waitlist user'
    });
  }
});

// Reject/Remove waitlist user
router.post('/waitlist-users/:id/reject', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');
    
    const { id } = req.params;
    const { reason, adminNotes } = req.body;
    
    // Update waitlist user status
    await WaitlistUser.findByIdAndUpdate(id, {
      status: 'rejected',
      updatedAt: new Date(),
      $set: {
        'metadata.rejectedAt': new Date(),
        'metadata.rejectedBy': 'admin',
        'metadata.rejectionReason': reason || 'Not selected for early access',
        'metadata.adminNotes': adminNotes || null
      }
    });

    // TODO: Send rejection email here
    console.log(`[WAITLIST] User ${id} rejected: ${reason}`);

    res.json({
      success: true,
      message: 'User rejected successfully',
      data: {
        waitlistUserId: id,
        status: 'rejected',
        reason: reason || 'Not selected for early access'
      }
    });

  } catch (error) {
    console.error('Error rejecting waitlist user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject waitlist user'
    });
  }
});

// Ban waitlist user
router.post('/waitlist-users/:id/ban', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');
    
    const { id } = req.params;
    const { reason, adminNotes } = req.body;
    
    // Update waitlist user status
    await WaitlistUser.findByIdAndUpdate(id, {
      status: 'banned',
      updatedAt: new Date(),
      $set: {
        'metadata.bannedAt': new Date(),
        'metadata.bannedBy': 'admin',
        'metadata.banReason': reason || 'Violation of terms',
        'metadata.adminNotes': adminNotes || null
      }
    });

    console.log(`[WAITLIST] User ${id} banned: ${reason}`);

    res.json({
      success: true,
      message: 'User banned successfully',
      data: {
        waitlistUserId: id,
        status: 'banned',
        reason: reason || 'Violation of terms'
      }
    });

  } catch (error) {
    console.error('Error banning waitlist user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to ban waitlist user'
    });
  }
});

// Get waitlist statistics
router.get('/waitlist-stats', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');
    
    const stats = await WaitlistUser.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalUsers = await WaitlistUser.countDocuments();
    const usersWithQuestionnaire = await WaitlistUser.countDocuments({
      'metadata.questionnaire': { $exists: true }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySignups = await WaitlistUser.countDocuments({
      createdAt: { $gte: today }
    });

    const statusCounts = stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        totalUsers,
        todaySignups,
        usersWithQuestionnaire,
        statusBreakdown: {
          waitlisted: statusCounts.waitlisted || 0,
          early_access: statusCounts.early_access || 0,
          rejected: statusCounts.rejected || 0,
          banned: statusCounts.banned || 0,
          removed: statusCounts.removed || 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching waitlist stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch waitlist statistics'
    });
  }
});

export default router;
