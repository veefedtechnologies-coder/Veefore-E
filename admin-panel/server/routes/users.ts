import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getUsers,
  getUserStats,
  createUser,
  updateUser,
  deleteUser,
  bulkUserActions,
  exportUsers,
  getUserDetails
} from '../controllers/userController';
import { body } from 'express-validator';

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// Get all users with filtering and pagination
router.get('/', getUsers);

// Get user statistics
router.get('/stats', getUserStats);

// Get user details
router.get('/:userId', getUserDetails);

// Create new user (requires admin role)
router.post('/', 
  authorize(['superadmin', 'admin', 'manager']),
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('username').optional().isString().withMessage('Username must be a string'),
    body('displayName').optional().isString().withMessage('Display name must be a string'),
    body('plan').optional().isIn(['Free', 'Starter', 'Pro', 'Enterprise']).withMessage('Invalid plan'),
    body('status').optional().isIn(['waitlisted', 'early_access', 'launched']).withMessage('Invalid status')
  ],
  createUser
);

// Update user (requires admin role or own profile)
router.put('/:userId', 
  authorize(['superadmin', 'admin', 'manager']),
  updateUser
);

// Delete user (requires admin role)
router.delete('/:userId', 
  authorize(['superadmin', 'admin']),
  deleteUser
);

// Bulk actions on users (requires admin role)
router.post('/bulk', 
  authorize(['superadmin', 'admin', 'manager']),
  bulkUserActions
);

// Export users data (requires admin role)
router.post('/export', 
  authorize(['superadmin', 'admin', 'manager']),
  exportUsers
);

export default router;
