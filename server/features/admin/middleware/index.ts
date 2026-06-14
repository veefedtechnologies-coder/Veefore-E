/**
 * Admin middleware barrel export.
 *
 * Re-exports the permission middleware factories and supporting types so
 * consuming routes can import from a single location:
 *
 *   import { requirePermission, requireRole } from '@/features/admin/middleware';
 */

export {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireRole,
  resolvePermissions,
  resolveRole,
  configurePermissionChecker,
  defaultPermissionChecker,
  PermissionErrorCode,
} from './requirePermission';

export type { AdminAuthRequest, PermissionChecker } from './requirePermission';
