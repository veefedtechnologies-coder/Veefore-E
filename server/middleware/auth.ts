/**
 * Main App Authentication Middleware
 * 
 * This file now re-exports the shared authentication middleware from /shared/middleware/auth.middleware.ts
 * Maintains backward compatibility with existing imports.
 * 
 * Migration: Task 11.7 - Migrate Main_App to use shared auth modules
 * Requirements: 8.3, 8.4
 */

// Re-export everything from shared auth middleware
export {
  authenticateUser,
  requireAdmin,
  requireWorkspace,
  checkPermission,
  optionalAuth,
  authenticateToken,
  authenticateJWT,
  AuthenticationError,
  type AuthenticatedRequest
} from '../shared/middleware/auth.middleware';

// Backward compatibility: requireAuth is an alias for authenticateUser
export { authenticateUser as requireAuth } from '../shared/middleware/auth.middleware';

