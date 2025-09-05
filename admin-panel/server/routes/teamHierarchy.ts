import express from 'express';
import { TeamHierarchyController } from '../controllers/teamHierarchyController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Get all teams with hierarchy
router.get('/', 
  authorize(['superadmin', 'admin']),
  validatePagination,
  validateSearch,
  TeamHierarchyController.getTeams
);

// Get team hierarchy tree
router.get('/tree',
  authorize(['superadmin', 'admin']),
  TeamHierarchyController.getHierarchyTree
);

// Get team statistics
router.get('/stats',
  authorize(['superadmin', 'admin']),
  TeamHierarchyController.getTeamStats
);

// Get team by ID
router.get('/:id',
  authorize(['superadmin', 'admin']),
  TeamHierarchyController.getTeamById
);

// Create new team
router.post('/',
  authorize(['superadmin', 'admin']),
  TeamHierarchyController.createTeam
);

// Update team
router.put('/:id',
  authorize(['superadmin', 'admin']),
  TeamHierarchyController.updateTeam
);

// Delete team
router.delete('/:id',
  authorize(['superadmin']),
  TeamHierarchyController.deleteTeam
);

// Add member to team
router.post('/:id/members',
  authorize(['superadmin', 'admin']),
  TeamHierarchyController.addMember
);

// Remove member from team
router.delete('/:id/members',
  authorize(['superadmin', 'admin']),
  TeamHierarchyController.removeMember
);

// Change team lead
router.put('/:id/lead',
  authorize(['superadmin', 'admin']),
  TeamHierarchyController.changeTeamLead
);

export default router;
