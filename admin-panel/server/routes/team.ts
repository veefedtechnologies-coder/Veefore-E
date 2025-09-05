import { Router } from 'express';
import { TeamController } from '../controllers/teamController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Get all teams with filtering
router.get('/',
  authorize(['superadmin', 'admin']),
  validatePagination,
  validateSearch,
  TeamController.getTeams
);

// Get team hierarchy tree
router.get('/tree',
  authorize(['superadmin', 'admin']),
  TeamController.getTeamTree
);

// Get team by ID
router.get('/:id',
  authorize(['superadmin', 'admin']),
  TeamController.getTeamById
);

// Get team performance stats
router.get('/:id/performance',
  authorize(['superadmin', 'admin']),
  TeamController.getTeamPerformance
);

// Create team
router.post('/',
  authorize(['superadmin', 'admin']),
  TeamController.createTeam
);

// Update team
router.put('/:id',
  authorize(['superadmin', 'admin']),
  TeamController.updateTeam
);

// Add member to team
router.post('/:id/members',
  authorize(['superadmin', 'admin']),
  TeamController.addMember
);

// Remove member from team
router.delete('/:id/members/:memberId',
  authorize(['superadmin', 'admin']),
  TeamController.removeMember
);

// Update member status
router.put('/:id/members/:memberId/status',
  authorize(['superadmin', 'admin']),
  TeamController.updateMemberStatus
);

// Archive team
router.post('/:id/archive',
  authorize(['superadmin']),
  TeamController.archiveTeam
);

// Bulk operations
router.post('/bulk',
  authorize(['superadmin', 'admin']),
  TeamController.bulkUpdateTeams
);

export default router;
