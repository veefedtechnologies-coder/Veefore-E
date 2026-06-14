/**
 * Shared Middleware Exports
 * 
 * Centralized export point for all shared middleware functions
 */

export {
  authenticateUser,
  requireAdmin,
  requireWorkspace,
  checkPermission,
  optionalAuth,
  AuthenticatedRequest,
  AuthenticationError,
  // Backward compatibility exports
  authenticateToken,
  authenticateJWT,
  requireAuth,
} from './auth.middleware';

export {
  centralErrorHandler,
  notFoundHandler,
  asyncHandler,
  type ErrorResponseBody,
} from './errorHandler';
