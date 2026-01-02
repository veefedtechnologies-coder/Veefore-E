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

        // Pass the FULL questionnaire data with all new role-based fields
        questionnaire: {
          // Organization type
          orgType: questionnaire.orgType || null,

          // Creator/Solo fields
          primaryPlatform: questionnaire.primaryPlatform || null,
          contentNiche: questionnaire.contentNiche || null,
          creatorAudienceSize: questionnaire.creatorAudienceSize || null,
          postingFrequency: questionnaire.postingFrequency || null,

          // Startup/Brand fields
          startupStage: questionnaire.startupStage || null,
          startupGrowthChannel: questionnaire.startupGrowthChannel || null,
          startupTeamSize: questionnaire.startupTeamSize || null,

          // Agency fields
          agencyClientCount: questionnaire.agencyClientCount || null,
          agencyServices: questionnaire.agencyServices || null,
          agencyNiche: questionnaire.agencyNiche || null,
          agencyMonthlyOutput: questionnaire.agencyMonthlyOutput || null,

          // Enterprise fields
          enterpriseIndustry: questionnaire.enterpriseIndustry || null,
          enterpriseDepartment: questionnaire.enterpriseDepartment || null,
          enterpriseSecurity: questionnaire.enterpriseSecurity || null,
          enterpriseBudget: questionnaire.enterpriseBudget || null,

          // Common fields
          timeline: questionnaire.timeline || null,
          referralSource: questionnaire.referralSource || null,
          primaryGoal: questionnaire.primaryGoal || null,
          painPoints: questionnaire.painPoints || null,

          // Legacy fields for backward compatibility
          businessType: questionnaire.businessType || null,
          teamSize: questionnaire.teamSize || null,
          currentTools: questionnaire.currentTools || [],
          contentTypes: questionnaire.contentTypes || [],
          budget: questionnaire.budget || null,
          urgency: questionnaire.urgency || null
        },

        // Full metadata including role
        metadata: {
          role: user.metadata?.role || null,
          questionnaire: user.metadata?.questionnaire || null,
          ipAddress: user.metadata?.ipAddress || user.metadata?.ip || null,
          userAgent: user.metadata?.userAgent || null,
          emailVerified: user.metadata?.emailVerified || false,
          joinedAt: user.metadata?.joinedAt || null,
          source: user.metadata?.source || null
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

      // Pass the FULL questionnaire data with all new role-based fields
      questionnaire: {
        // Organization type
        orgType: questionnaire.orgType || null,

        // Creator/Solo fields
        primaryPlatform: questionnaire.primaryPlatform || null,
        contentNiche: questionnaire.contentNiche || null,
        creatorAudienceSize: questionnaire.creatorAudienceSize || null,
        postingFrequency: questionnaire.postingFrequency || null,

        // Startup/Brand fields
        startupStage: questionnaire.startupStage || null,
        startupGrowthChannel: questionnaire.startupGrowthChannel || null,
        startupTeamSize: questionnaire.startupTeamSize || null,

        // Agency fields
        agencyClientCount: questionnaire.agencyClientCount || null,
        agencyServices: questionnaire.agencyServices || null,
        agencyNiche: questionnaire.agencyNiche || null,
        agencyMonthlyOutput: questionnaire.agencyMonthlyOutput || null,

        // Enterprise fields
        enterpriseIndustry: questionnaire.enterpriseIndustry || null,
        enterpriseDepartment: questionnaire.enterpriseDepartment || null,
        enterpriseSecurity: questionnaire.enterpriseSecurity || null,
        enterpriseBudget: questionnaire.enterpriseBudget || null,

        // Common fields
        timeline: questionnaire.timeline || null,
        referralSource: questionnaire.referralSource || null,
        primaryGoal: questionnaire.primaryGoal || null,
        painPoints: questionnaire.painPoints || null,

        // Legacy fields for backward compatibility
        businessType: questionnaire.businessType || null,
        teamSize: questionnaire.teamSize || null,
        currentTools: questionnaire.currentTools || [],
        contentTypes: questionnaire.contentTypes || [],
        budget: questionnaire.budget || null,
        urgency: questionnaire.urgency || null
      },

      // Full metadata including role
      metadata: {
        role: user.metadata?.role || null,
        questionnaire: user.metadata?.questionnaire || null,
        ipAddress: user.metadata?.ipAddress || user.metadata?.ip || null,
        userAgent: user.metadata?.userAgent || null,
        emailVerified: user.metadata?.emailVerified || false,
        joinedAt: user.metadata?.joinedAt || null,
        source: user.metadata?.source || null
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

// Remove waitlist user
router.post('/waitlist-users/:id/remove', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');

    const { id } = req.params;
    const { reason, adminNotes } = req.body;

    // Update waitlist user status
    await WaitlistUser.findByIdAndUpdate(id, {
      status: 'removed',
      updatedAt: new Date(),
      $set: {
        'metadata.removedAt': new Date(),
        'metadata.removedBy': 'admin',
        'metadata.removeReason': reason || 'Admin decision',
        'metadata.adminNotes': adminNotes || null
      }
    });

    console.log(`[WAITLIST] User ${id} removed: ${reason}`);

    res.json({
      success: true,
      message: 'User removed successfully',
      data: {
        waitlistUserId: id,
        status: 'removed',
        reason: reason || 'Admin decision'
      }
    });

  } catch (error) {
    console.error('Error removing waitlist user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove waitlist user'
    });
  }
});

// Suspend waitlist user
router.post('/waitlist-users/:id/suspend', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');

    const { id } = req.params;
    const { reason, adminNotes, suspendUntil } = req.body;

    // Update waitlist user status
    await WaitlistUser.findByIdAndUpdate(id, {
      status: 'suspended',
      updatedAt: new Date(),
      $set: {
        'metadata.suspendedAt': new Date(),
        'metadata.suspendedBy': 'admin',
        'metadata.suspendReason': reason || 'Policy violation',
        'metadata.suspendUntil': suspendUntil ? new Date(suspendUntil) : null,
        'metadata.adminNotes': adminNotes || null
      }
    });

    console.log(`[WAITLIST] User ${id} suspended: ${reason}`);

    res.json({
      success: true,
      message: 'User suspended successfully',
      data: {
        waitlistUserId: id,
        status: 'suspended',
        reason: reason || 'Policy violation',
        suspendUntil: suspendUntil || null
      }
    });

  } catch (error) {
    console.error('Error suspending waitlist user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suspend waitlist user'
    });
  }
});

// Postpone early access for user
router.post('/waitlist-users/:id/postpone', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');

    const { id } = req.params;
    const { reason, adminNotes, postponeUntil } = req.body;

    // Update waitlist user status
    await WaitlistUser.findByIdAndUpdate(id, {
      status: 'postponed',
      updatedAt: new Date(),
      $set: {
        'metadata.postponedAt': new Date(),
        'metadata.postponedBy': 'admin',
        'metadata.postponeReason': reason || 'Temporary postponement',
        'metadata.postponeUntil': postponeUntil ? new Date(postponeUntil) : null,
        'metadata.adminNotes': adminNotes || null
      }
    });

    console.log(`[WAITLIST] User ${id} early access postponed: ${reason}`);

    res.json({
      success: true,
      message: 'Early access postponed successfully',
      data: {
        waitlistUserId: id,
        status: 'postponed',
        reason: reason || 'Temporary postponement',
        postponeUntil: postponeUntil || null
      }
    });

  } catch (error) {
    console.error('Error postponing early access:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to postpone early access'
    });
  }
});

// Restore user from suspended/removed/postponed status
router.post('/waitlist-users/:id/restore', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');

    const { id } = req.params;
    const { newStatus, adminNotes } = req.body;

    // Update waitlist user status
    await WaitlistUser.findByIdAndUpdate(id, {
      status: newStatus || 'waitlisted',
      updatedAt: new Date(),
      $set: {
        'metadata.restoredAt': new Date(),
        'metadata.restoredBy': 'admin',
        'metadata.restoreNotes': adminNotes || null,
        'metadata.adminNotes': adminNotes || null
      }
    });

    console.log(`[WAITLIST] User ${id} restored to status: ${newStatus || 'waitlisted'}`);

    res.json({
      success: true,
      message: 'User restored successfully',
      data: {
        waitlistUserId: id,
        status: newStatus || 'waitlisted'
      }
    });

  } catch (error) {
    console.error('Error restoring user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restore user'
    });
  }
});

// Delete waitlist user completely
router.delete('/waitlist-users/:id', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');

    const { id } = req.params;
    const { reason, adminNotes } = req.body;

    // Find the user first to get their details for logging
    const userToDelete = await WaitlistUser.findById(id);
    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Log the deletion before actually deleting
    console.log(`[WAITLIST] Deleting user ${id} (${userToDelete.email}): ${reason || 'Admin decision'}`);

    // Delete the user completely
    await WaitlistUser.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'User deleted successfully',
      data: {
        deletedUserId: id,
        deletedUserEmail: userToDelete.email,
        reason: reason || 'Admin decision'
      }
    });

  } catch (error) {
    console.error('Error deleting waitlist user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete waitlist user'
    });
  }
});

// Bulk actions for multiple users
router.post('/waitlist-users/bulk-action', async (req, res) => {
  try {
    const connection = await connectToMainApp();
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema, 'waitlistusers');

    const { userIds, action, reason, adminNotes, additionalData } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'User IDs are required'
      });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required'
      });
    }

    const validActions = ['approve', 'reject', 'ban', 'remove', 'suspend', 'postpone', 'restore', 'delete'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action'
      });
    }

    const results = [];
    const errors = [];

    for (const userId of userIds) {
      try {
        let updateData = {
          updatedAt: new Date(),
          $set: {
            'metadata.adminNotes': adminNotes || null,
            [`metadata.${action}At`]: new Date(),
            [`metadata.${action}By`]: 'admin',
            [`metadata.${action}Reason`]: reason || 'Bulk action'
          }
        };

        let newStatus = action;

        switch (action) {
          case 'approve':
            newStatus = 'early_access';
            break;
          case 'reject':
            newStatus = 'rejected';
            break;
          case 'ban':
            newStatus = 'banned';
            break;
          case 'remove':
            newStatus = 'removed';
            break;
          case 'suspend':
            newStatus = 'suspended';
            if (additionalData?.suspendUntil) {
              updateData.$set['metadata.suspendUntil'] = new Date(additionalData.suspendUntil);
            }
            break;
          case 'postpone':
            newStatus = 'postponed';
            if (additionalData?.postponeUntil) {
              updateData.$set['metadata.postponeUntil'] = new Date(additionalData.postponeUntil);
            }
            break;
          case 'restore':
            newStatus = additionalData?.newStatus || 'waitlisted';
            updateData.$set['metadata.restoredAt'] = new Date();
            updateData.$set['metadata.restoredBy'] = 'admin';
            break;
          case 'delete':
            // For delete, we actually remove the document
            await WaitlistUser.findByIdAndDelete(userId);
            results.push({ userId, status: 'deleted', message: 'User deleted successfully' });
            continue;
        }

        if (action !== 'delete') {
          await WaitlistUser.findByIdAndUpdate(userId, {
            status: newStatus,
            ...updateData
          });
        }

        results.push({ userId, status: 'success', message: `${action} action completed` });

      } catch (userError) {
        console.error(`Error processing user ${userId}:`, userError);
        errors.push({ userId, error: userError.message });
      }
    }

    console.log(`[WAITLIST] Bulk ${action} action completed: ${results.length} successful, ${errors.length} errors`);

    res.json({
      success: true,
      message: `Bulk ${action} action completed`,
      data: {
        totalProcessed: userIds.length,
        successful: results.length,
        errors: errors.length,
        results,
        errors
      }
    });

  } catch (error) {
    console.error('Error processing bulk action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process bulk action'
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
          removed: statusCounts.removed || 0,
          suspended: statusCounts.suspended || 0,
          postponed: statusCounts.postponed || 0
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

