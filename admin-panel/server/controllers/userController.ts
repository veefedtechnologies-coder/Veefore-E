import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Subscription from '../models/Subscription';
import Analytics from '../models/Analytics';
import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import { getMainAppUsers, getMainAppUserStats, connectToMainApp } from '../services/userDataService';
import { MainAppUserSchema } from '../models/MainAppUser';

// Get all users with filtering and pagination (from main app)
export const getUsers = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = '',
      status = 'all',
      subscription = 'all',
      isActive = 'all',
      isEmailVerified = 'all'
    } = req.query;

    // Map admin panel status to main app status
    let mappedStatus = status;
    if (status === 'active') {
      mappedStatus = 'launched';
    } else if (status === 'inactive') {
      mappedStatus = 'waitlisted';
    } else if (status === 'pending') {
      mappedStatus = 'early_access';
    }

    // Map subscription to plan
    let mappedPlan = subscription;
    if (subscription === 'free') {
      mappedPlan = 'Free';
    } else if (subscription === 'starter') {
      mappedPlan = 'Starter';
    } else if (subscription === 'pro') {
      mappedPlan = 'Pro';
    } else if (subscription === 'enterprise') {
      mappedPlan = 'Enterprise';
    }

    // Build filter object
    const filter: any = {};
    
    if (mappedStatus && mappedStatus !== 'all') {
      filter.status = mappedStatus;
    }
    
    if (mappedPlan && mappedPlan !== 'all') {
      filter.plan = mappedPlan;
    }
    
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } }
      ];
    }

    // Get users from main app
    const result = await getMainAppUsers(
      parseInt(page.toString()),
      parseInt(limit.toString()),
      filter
    );

    res.json({
      success: true,
      users: result.users,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Get user statistics (from main app)
export const getUserStats = async (req: Request, res: Response) => {
  try {
    const stats = await getMainAppUserStats();
    
    res.json({
      success: true,
      stats: {
        totalUsers: stats.totalUsers,
        activeUsers: stats.activeUsers,
        waitlistedUsers: stats.waitlistedUsers,
        earlyAccessUsers: stats.earlyAccessUsers,
        launchedUsers: stats.launchedUsers,
        planDistribution: stats.planStats,
        // Add more stats as needed
        engagementRate: Math.round((stats.activeUsers / stats.totalUsers) * 100) || 0,
        conversionRate: Math.round((stats.launchedUsers / stats.totalUsers) * 100) || 0
      }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
};

// Get user details (from main app)
export const getUserDetails = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Get user from main app with correct parameters
    const result = await getMainAppUsers(1, 1, { _id: new mongoose.Types.ObjectId(userId) });
    
    if (result.users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: result.users[0]
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
};

// Create new user (in main app database)
export const createUser = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      firstName,
      lastName,
      email,
      username,
      plan = 'Free',
      status = 'waitlisted',
      credits = 0
    } = req.body;

    // Connect to main app database
    const connection = await connectToMainApp();
    const MainAppUser = connection.model('User', MainAppUserSchema);

    // Check if user already exists
    const existingUser = await MainAppUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Generate username if not provided
    const generatedUsername = username || email.split('@')[0] + '_' + Date.now();
    
    // Create display name from firstName and lastName
    const displayName = `${firstName || ''} ${lastName || ''}`.trim() || generatedUsername;
    
    // Create user
    const user = new MainAppUser({
      email,
      username: generatedUsername,
      displayName,
      plan,
      status,
      credits,
      isEmailVerified: false,
      onboardingStep: 1,
      onboardingData: {},
      goals: [],
      hasUsedWaitlistBonus: false,
      dailyLoginStreak: 0,
      tokenStatus: 'active'
    });

    await user.save();

    // Log user creation
    await Analytics.create({
      userId: user._id.toString(),
      date: new Date(),
      period: 'daily',
      revenue: {
        total: 0,
        byPlan: {},
        byRegion: {},
        refunded: 0,
        net: 0
      },
      users: {
        total: 1,
        new: 1,
        active: status === 'launched' ? 1 : 0,
        churned: 0,
        byPlan: { [plan]: 1 },
        topSpenders: []
      },
      credits: {
        totalPurchased: 0,
        totalSpent: 0,
        byFeature: {},
        addOnsPurchased: {}
      },
      aiUsage: {
        openai: {
          tokens: 0,
          cost: 0,
          models: {}
        },
        vapi: {
          minutes: 0,
          cost: 0
        },
        transcription: {
          hours: 0,
          cost: 0
        },
        other: {}
      },
      planDistribution: {
        free: plan === 'Free' ? 1 : 0,
        paid: plan !== 'Free' ? { [plan]: 1 } : {},
        upgrades: 0,
        downgrades: 0
      },
      performance: {
        avgTicketResolutionTime: 0,
        refundApprovalTime: 0,
        couponSuccessRate: 0,
        systemUptime: 100
      }
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        plan: user.plan,
        status: user.status,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        subscription: user.subscription,
        credits: user.credits,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// Update user (in admin database)
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Connect to main app database
    const connection = await connectToMainApp();
    const MainAppUser = connection.model('User', MainAppUserSchema);

    // Map admin panel fields to main app fields
    const mappedUpdateData: any = {};
    
    if (updateData.firstName || updateData.lastName) {
      mappedUpdateData.displayName = `${updateData.firstName || ''} ${updateData.lastName || ''}`.trim();
    }
    if (updateData.email) mappedUpdateData.email = updateData.email;
    if (updateData.username) mappedUpdateData.username = updateData.username;
    if (updateData.plan) mappedUpdateData.plan = updateData.plan;
    if (updateData.status) {
      // Map admin panel status to main app status
      if (updateData.status === 'active') mappedUpdateData.status = 'launched';
      else if (updateData.status === 'trial') mappedUpdateData.status = 'early_access';
      else if (updateData.status === 'pending') mappedUpdateData.status = 'waitlisted';
      else mappedUpdateData.status = updateData.status;
    }
    if (updateData.credits) mappedUpdateData.credits = updateData.credits;
    if (updateData.isEmailVerified !== undefined) mappedUpdateData.isEmailVerified = updateData.isEmailVerified;

    const user = await MainAppUser.findByIdAndUpdate(
      userId,
      mappedUpdateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        _id: user._id,
        firstName: user.displayName?.split(' ')[0] || user.username,
        lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        plan: user.plan,
        status: user.status,
        isActive: user.status === 'launched' || user.status === 'early_access',
        isEmailVerified: user.isEmailVerified,
        credits: user.credits,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Delete user (from main app database)
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Connect to main app database
    const connection = await connectToMainApp();
    const MainAppUser = connection.model('User', MainAppUserSchema);

    const user = await MainAppUser.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Bulk actions on users (in admin database)
export const bulkUserActions = async (req: Request, res: Response) => {
  try {
    const { userIds, action } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs are required' });
    }

    let result;
    switch (action) {
      case 'activate':
        result = await User.updateMany(
          { _id: { $in: userIds } },
          { isActive: true }
        );
        break;
      case 'deactivate':
        result = await User.updateMany(
          { _id: { $in: userIds } },
          { isActive: false }
        );
        break;
      case 'delete':
        result = await User.deleteMany({ _id: { $in: userIds } });
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      modifiedCount: result.modifiedCount || result.deletedCount
    });
  } catch (error) {
    console.error('Error performing bulk action:', error);
    res.status(500).json({ error: 'Failed to perform bulk action' });
  }
};

// Export users data (from main app)
export const exportUsers = async (req: Request, res: Response) => {
  try {
    const result = await getMainAppUsers({}, { limit: 10000 }); // Export up to 10k users
    
    // Convert to CSV format
    const csvHeader = 'ID,First Name,Last Name,Email,Username,Plan,Status,Active,Email Verified,Credits,Created At,Last Login\n';
    const csvRows = result.users.map(user => 
      `${user._id},"${user.firstName}","${user.lastName}","${user.email}","${user.username}","${user.subscription.plan}","${user.status}",${user.isActive},${user.isEmailVerified},${user.credits.total},"${user.createdAt}","${user.lastLogin || ''}"`
    ).join('\n');
    
    const csv = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({ error: 'Failed to export users' });
  }
};