import { Router } from 'express';
import { MaintenanceController } from '../controllers/maintenanceController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

// Public routes for maintenance status
router.get('/status', MaintenanceController.getMaintenanceStatus);
router.get('/upcoming', MaintenanceController.getUpcomingMaintenance);

// Apply authentication to admin routes
router.use(authenticate);

// Get all maintenance records
router.get('/',
  authorize(['superadmin', 'admin']),
  validatePagination,
  validateSearch,
  MaintenanceController.getMaintenanceRecords
);

// Get maintenance history
router.get('/history',
  authorize(['superadmin', 'admin']),
  MaintenanceController.getMaintenanceHistory
);

// Get maintenance by ID
router.get('/:id',
  authorize(['superadmin', 'admin']),
  MaintenanceController.getMaintenanceById
);

// Create maintenance record
router.post('/',
  authorize(['superadmin', 'admin']),
  MaintenanceController.createMaintenance
);

// Update maintenance record
router.put('/:id',
  authorize(['superadmin', 'admin']),
  MaintenanceController.updateMaintenance
);

// Start maintenance
router.post('/:id/start',
  authorize(['superadmin', 'admin']),
  MaintenanceController.startMaintenance
);

// End maintenance
router.post('/:id/end',
  authorize(['superadmin', 'admin']),
  MaintenanceController.endMaintenance
);

// Update progress
router.put('/:id/progress',
  authorize(['superadmin', 'admin']),
  MaintenanceController.updateProgress
);

// Trigger rollback
router.post('/:id/rollback',
  authorize(['superadmin', 'admin']),
  MaintenanceController.triggerRollback
);

// Add alert
router.post('/:id/alerts',
  authorize(['superadmin', 'admin']),
  MaintenanceController.addAlert
);

// Resolve alert
router.put('/:id/alerts/:alertIndex/resolve',
  authorize(['superadmin', 'admin']),
  MaintenanceController.resolveAlert
);

// Delete maintenance record
router.delete('/:id',
  authorize(['superadmin']),
  MaintenanceController.deleteMaintenance
);

export default router;
