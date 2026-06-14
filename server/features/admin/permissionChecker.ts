/**
 * Admin Permission Checker wiring (Task 18.5)
 *
 * Connects the Express permission middleware (Task 18.3) to the richer
 * `PermissionService` (Task 18.2) so that role hierarchy and permission
 * inheritance are applied consistently when admin routes are guarded.
 *
 * The middleware in `./middleware/requirePermission.ts` resolves access via a
 * pluggable {@link PermissionChecker}. By default it performs simple membership
 * checks. This module provides a checker backed by the `PermissionService`,
 * which understands:
 *   - role hierarchy (a superadmin satisfies an `admin` requirement)
 *   - permission inheritance (granting `users.edit` implies `users.read`)
 *
 * Call {@link configureAdminPermissions} once during application bootstrap to
 * activate the service-backed checker for all admin routes.
 *
 * _Requirements: 4.3_
 */

import {
  configurePermissionChecker,
  resolvePermissions,
  resolveRole,
  type AdminAuthRequest,
  type PermissionChecker,
} from './middleware/requirePermission';
import { permissionService, PermissionService, type PermissionSubject } from './services/permission.service';

/**
 * Build the {@link PermissionSubject} for the current request by reading the
 * role and effective permission set populated by the upstream `authenticate`
 * middleware.
 */
function subjectFromRequest(req: AdminAuthRequest): PermissionSubject {
  return {
    role: resolveRole(req),
    permissions: resolvePermissions(req),
  };
}

/**
 * Create a {@link PermissionChecker} that delegates decisions to a
 * {@link PermissionService} instance, applying role hierarchy and permission
 * inheritance rules.
 *
 * @param service - The permission service to delegate to. Defaults to the
 * shared singleton {@link permissionService}.
 * @returns A checker suitable for {@link configurePermissionChecker}.
 */
export function createServicePermissionChecker(
  service: PermissionService = permissionService,
): PermissionChecker {
  return {
    hasPermission(req: AdminAuthRequest, permission: string): boolean {
      return service.hasPermission(subjectFromRequest(req), permission);
    },
    hasRole(req: AdminAuthRequest, role: string): boolean {
      return service.hasRole(subjectFromRequest(req), role);
    },
  };
}

/**
 * Activate the service-backed permission checker for all admin permission
 * middleware. Idempotent and safe to call multiple times.
 *
 * @param service - Optional permission service override (useful for testing).
 */
export function configureAdminPermissions(service: PermissionService = permissionService): void {
  configurePermissionChecker(createServicePermissionChecker(service));
}
