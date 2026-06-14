/**
 * Admin Permission Middleware
 *
 * Express middleware factories that enforce role-based access control (RBAC)
 * on admin panel routes. Extracted from the monolithic `permissions.ts`
 * (Task 18.3) to provide a focused, reusable, and well-typed middleware layer.
 *
 * Responsibilities:
 *  - `requirePermission`    : require a single permission
 *  - `requireAllPermissions`: require every permission in a list
 *  - `requireAnyPermission` : require at least one permission in a list
 *  - `requireRole`          : require one of a set of roles
 *
 * The middleware reads the authenticated admin's role and permissions from the
 * request (populated by the upstream `authenticate` middleware) and returns
 * standardized JSON error responses on failure.
 *
 * Permission resolution is delegated to a pluggable {@link PermissionChecker}.
 * By default it uses a request-based checker, but a `PermissionService`
 * (Task 18.2) can be injected via {@link configurePermissionChecker} so that
 * inheritance and role hierarchy rules are applied consistently.
 *
 * Validates: Requirements 4.3, 8.6
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Authenticated request shape produced by the `authenticate` middleware.
 * `admin` is intentionally loosely typed to avoid coupling to the Mongoose
 * model, while `role` and `permissions` carry the resolved RBAC context.
 */
export interface AdminAuthRequest extends Request {
  admin?: { role?: string; permissions?: string[]; [key: string]: unknown };
  role?: { name?: string; permissions?: string[]; [key: string]: unknown };
  permissions?: string[];
}

/**
 * Standardized error codes returned by the permission middleware.
 * Consumers (and the centralized error handler) can switch on these.
 */
export enum PermissionErrorCode {
  Unauthenticated = 'UNAUTHENTICATED',
  Forbidden = 'FORBIDDEN',
  InvalidConfiguration = 'INVALID_CONFIGURATION',
}

/**
 * Abstraction over permission resolution so the middleware can delegate to a
 * richer `PermissionService` (role hierarchy / inheritance) when available.
 */
export interface PermissionChecker {
  /** Returns true if the request's admin holds the given permission. */
  hasPermission(req: AdminAuthRequest, permission: string): boolean;
  /** Returns true if the request's admin holds the given role. */
  hasRole(req: AdminAuthRequest, role: string): boolean;
}

/**
 * Extract the effective permission set for the current request.
 * Role-derived permissions take precedence, falling back to permissions set
 * directly on the admin document. Always returns a defensive copy.
 */
export function resolvePermissions(req: AdminAuthRequest): string[] {
  if (Array.isArray(req.permissions) && req.permissions.length > 0) {
    return [...req.permissions];
  }
  if (Array.isArray(req.role?.permissions)) {
    return [...(req.role!.permissions as string[])];
  }
  if (Array.isArray(req.admin?.permissions)) {
    return [...(req.admin!.permissions as string[])];
  }
  return [];
}

/** Extract the effective role name for the current request. */
export function resolveRole(req: AdminAuthRequest): string | undefined {
  return req.admin?.role ?? req.role?.name;
}

/**
 * Default request-based permission checker. Performs simple membership checks
 * against the resolved permission/role context. Replaceable via
 * {@link configurePermissionChecker} once a PermissionService is wired up.
 */
export const defaultPermissionChecker: PermissionChecker = {
  hasPermission(req: AdminAuthRequest, permission: string): boolean {
    return resolvePermissions(req).includes(permission);
  },
  hasRole(req: AdminAuthRequest, role: string): boolean {
    return resolveRole(req) === role;
  },
};

let activeChecker: PermissionChecker = defaultPermissionChecker;

/**
 * Inject a custom permission checker (e.g. one backed by the PermissionService
 * from Task 18.2). Passing no argument resets to the default checker.
 */
export function configurePermissionChecker(checker?: PermissionChecker): void {
  activeChecker = checker ?? defaultPermissionChecker;
}

/** Determine whether the request carries an authenticated admin. */
function isAuthenticated(req: AdminAuthRequest): boolean {
  return Boolean(req.admin);
}

/** Send a standardized 401 response for unauthenticated requests. */
function sendUnauthenticated(res: Response): Response {
  return res.status(401).json({
    success: false,
    code: PermissionErrorCode.Unauthenticated,
    message: 'Authentication required.',
  });
}

/** Send a standardized 403 response for authorization failures. */
function sendForbidden(res: Response, message: string, required: string[]): Response {
  return res.status(403).json({
    success: false,
    code: PermissionErrorCode.Forbidden,
    message,
    required,
  });
}

/**
 * Require that the authenticated admin holds a single permission.
 *
 * @param permission - The permission id required to access the route.
 * @returns Express middleware enforcing the permission.
 * @example
 * router.get('/users', authenticate, requirePermission('users.read'), handler);
 */
export function requirePermission(permission: string): RequestHandler {
  if (typeof permission !== 'string' || permission.trim() === '') {
    throw new Error('requirePermission: a non-empty permission id is required');
  }

  return (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
    if (!isAuthenticated(req)) {
      sendUnauthenticated(res);
      return;
    }
    if (!activeChecker.hasPermission(req, permission)) {
      sendForbidden(res, 'Insufficient permissions.', [permission]);
      return;
    }
    next();
  };
}

/**
 * Require that the authenticated admin holds every listed permission.
 *
 * @param permissions - All permission ids that must be present.
 * @returns Express middleware enforcing the permissions.
 * @example
 * router.post('/admins', authenticate, requireAllPermissions(['admins.read', 'admins.create']), handler);
 */
export function requireAllPermissions(permissions: string[]): RequestHandler {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new Error('requireAllPermissions: a non-empty permissions array is required');
  }

  return (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
    if (!isAuthenticated(req)) {
      sendUnauthenticated(res);
      return;
    }
    const missing = permissions.filter((p) => !activeChecker.hasPermission(req, p));
    if (missing.length > 0) {
      sendForbidden(res, 'Insufficient permissions. All listed permissions are required.', missing);
      return;
    }
    next();
  };
}

/**
 * Require that the authenticated admin holds at least one of the listed
 * permissions.
 *
 * @param permissions - Candidate permission ids; one must be present.
 * @returns Express middleware enforcing the permissions.
 * @example
 * router.get('/billing', authenticate, requireAnyPermission(['billing.payments.view', 'billing.invoices.view']), handler);
 */
export function requireAnyPermission(permissions: string[]): RequestHandler {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new Error('requireAnyPermission: a non-empty permissions array is required');
  }

  return (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
    if (!isAuthenticated(req)) {
      sendUnauthenticated(res);
      return;
    }
    const granted = permissions.some((p) => activeChecker.hasPermission(req, p));
    if (!granted) {
      sendForbidden(res, 'Insufficient permissions. At least one listed permission is required.', permissions);
      return;
    }
    next();
  };
}

/**
 * Require that the authenticated admin holds one of the allowed roles.
 *
 * @param roles - A single role or list of acceptable roles.
 * @returns Express middleware enforcing the role requirement.
 * @example
 * router.delete('/system', authenticate, requireRole('superadmin'), handler);
 */
export function requireRole(roles: string | string[]): RequestHandler {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (allowed.length === 0 || allowed.some((r) => typeof r !== 'string' || r.trim() === '')) {
    throw new Error('requireRole: a non-empty role or list of roles is required');
  }

  return (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
    if (!isAuthenticated(req)) {
      sendUnauthenticated(res);
      return;
    }
    const hasAllowedRole = allowed.some((role) => activeChecker.hasRole(req, role));
    if (!hasAllowedRole) {
      sendForbidden(res, 'Insufficient role.', allowed);
      return;
    }
    next();
  };
}
