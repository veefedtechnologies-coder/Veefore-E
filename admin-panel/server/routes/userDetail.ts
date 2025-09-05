import express from 'express';
import { authenticate } from '../middleware/auth';
import { 
  getUserDetails, 
  updateUserStatus, 
  updateUserCredits, 
  addUserNote 
} from '../controllers/userDetailController';

const router = express.Router();

// Get detailed user information
router.get('/:userId', authenticate, getUserDetails);

// Update user status (suspend/activate)
router.patch('/:userId/status', authenticate, updateUserStatus);

// Update user credits
router.patch('/:userId/credits', authenticate, updateUserCredits);

// Add note to user
router.post('/:userId/notes', authenticate, addUserNote);

export default router;
