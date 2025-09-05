import express from 'express';
import { GlobalSearchController } from '../controllers/globalSearchController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Global search
router.get('/search',
  authenticate,
  authorize(['superadmin', 'admin']),
  GlobalSearchController.search
);

// Get search suggestions
router.get('/suggestions',
  authenticate,
  authorize(['superadmin', 'admin']),
  GlobalSearchController.getSuggestions
);

// Index entity
router.post('/index/:entityType/:entityId',
  authenticate,
  authorize(['superadmin', 'admin']),
  GlobalSearchController.indexEntity
);

// Remove entity from index
router.delete('/index/:entityType/:entityId',
  authenticate,
  authorize(['superadmin', 'admin']),
  GlobalSearchController.removeEntity
);

// Get search statistics
router.get('/stats',
  authenticate,
  authorize(['superadmin', 'admin']),
  GlobalSearchController.getSearchStats
);

export default router;
