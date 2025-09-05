import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { connectToMainApp, getMainAppUsers } from '../services/userDataService';
import { MainAppUserSchema } from '../models/MainAppUser';

// Get detailed user information
export const getUserDetails = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Use the userDataService to get user details with proper data structure
    const result = await getMainAppUsers(1, 1, { _id: new mongoose.Types.ObjectId(userId) });
    
    if (!result.users || result.users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userDetails = result.users[0];

    res.json({
      success: true,
      data: userDetails
    });

  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user status (suspend/activate)
export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status, reason, notes } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const connection = await connectToMainApp();
    const User = connection.model('User', MainAppUserSchema, 'users');

    const updateData: any = {
      accountStatus: status,
      updatedAt: new Date()
    };

    if (status === 'suspended') {
      updateData.suspensionReason = reason;
      updateData.suspendedAt = new Date();
    } else if (status === 'active') {
      updateData.suspensionReason = null;
      updateData.suspendedAt = null;
    }

    if (notes) {
      updateData.$push = { notes: { text: notes, addedAt: new Date(), addedBy: 'admin' } };
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User ${status === 'suspended' ? 'suspended' : 'activated'} successfully`,
      data: user
    });

  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user credits
export const updateUserCredits = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { credits, action, reason } = req.body;
    
    if (!userId || credits === undefined) {
      return res.status(400).json({
        success: false,
        message: 'User ID and credits are required'
      });
    }

    const connection = await connectToMainApp();
    const User = connection.model('User', MainAppUserSchema, 'users');

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentCredits = user.credits || 0;
    let newCredits = currentCredits;

    if (action === 'add') {
      newCredits = currentCredits + credits;
    } else if (action === 'subtract') {
      newCredits = Math.max(0, currentCredits - credits);
    } else if (action === 'set') {
      newCredits = credits;
    }

    user.credits = newCredits;
    user.updatedAt = new Date();
    
    if (reason) {
      user.notes = user.notes || [];
      user.notes.push({
        text: `Credits ${action === 'add' ? 'added' : action === 'subtract' ? 'subtracted' : 'set'}: ${credits} (${reason})`,
        addedAt: new Date(),
        addedBy: 'admin'
      });
    }

    await user.save();

    res.json({
      success: true,
      message: `Credits ${action === 'add' ? 'added' : action === 'subtract' ? 'subtracted' : 'set'} successfully`,
      data: {
        previousCredits: currentCredits,
        newCredits: newCredits,
        change: newCredits - currentCredits
      }
    });

  } catch (error) {
    console.error('Error updating user credits:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Add note to user
export const addUserNote = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { note } = req.body;
    
    if (!userId || !note) {
      return res.status(400).json({
        success: false,
        message: 'User ID and note are required'
      });
    }

    const connection = await connectToMainApp();
    const User = connection.model('User', MainAppUserSchema, 'users');

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          notes: {
            text: note,
            addedAt: new Date(),
            addedBy: 'admin'
          }
        },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    ).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Note added successfully',
      data: user.notes
    });

  } catch (error) {
    console.error('Error adding user note:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
