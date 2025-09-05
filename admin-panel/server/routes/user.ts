import { Router } from 'express';
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
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Get all users with advanced filtering
router.get('/',
  authorize(['superadmin', 'admin', 'support']),
  getUsers
);

// Get user statistics
router.get('/stats',
  authorize(['superadmin', 'admin']),
  getUserStats
);

// Get user details
router.get('/:id',
  authorize(['superadmin', 'admin', 'support']),
  getUserDetails
);

// Create user
router.post('/',
  authorize(['superadmin', 'admin']),
  createUser
);

// Update user
router.put('/:id',
  authorize(['superadmin', 'admin']),
  updateUser
);

// Delete user
router.delete('/:id',
  authorize(['superadmin', 'admin']),
  deleteUser
);

// Bulk operations
router.post('/bulk',
  authorize(['superadmin', 'admin']),
  bulkUserActions
);

// Export users
router.post('/export',
  authorize(['superadmin', 'admin']),
  exportUsers
);

export default router;
