/**
 * Permission Service
 *
 * Role-checking service extracted from the monolithic
 * `admin-panel/server/utils/permissions.ts` (Task 18.2). This service
 * encapsulates all role and permission decision logic, including:
 *  - Direct permission checks (`hasPermission`)
 *  - Role membership / hierarchy checks (`hasRole`)
 *  - Combined access checks (`canAccess`)
 *  - Permission inheritance resolution (dependencies + role auto-grants)
 *
 * It depends only on the pure data in
 * `../permissions/permissionDefinitions.ts` (Task 18.1) and contains no
 * I/O or framework code. Express middleware that consumes this service lives
 * in `../middleware/requirePermission.ts` (Task 18.3).
 *
 * _Requirements: 4.1, 4.2_
 */

import {
  AdminRole,
  Permission,
  PERMISSIONS,
  PERMISSION_IDS,
  ROLE_HIERARCHY,
  ROLE_PERMISSION_CONSTRAINTS,
  RolePermissionConstraints,
  getPermissionById,
  getRoleConstraints,
} from '../permissions/permissionDefinitions';

/**
 * Describes the authenticated subject whose access is being evaluated.
 */
export interface PermissionSubject {
  /** The subject's role (if known). */
  role?: string;
  /**
   * Permissions explicitly granted to the subject. These are combined with
   * the role's auto-granted permissions during evaluation.
   */
  permissions?: string[];
}

/**
 * Options controlling how `canAccess` evaluates a request.
 */
export interface AccessRequirements {
  /** A single role or list of acceptable roles. */
  roles?: string | string[];
  /** A single permission or list of permissions. */
  permissions?: string | string[];
  /**
   * When multiple permissions are supplied, whether ALL are required
   * (default) or ANY one is sufficient.
   */
  match?: 'all' | 'any';
  /** Minimum privilege level required (1 = highest privilege). */
  minLevel?: number;
}

/**
 * Service that answers role and permission questions for admin subjects.
 *
 * The service is stateless and deterministic: identical inputs always yield
 * identical results. It can be used as a singleton (see `permissionService`).
 */
export class PermissionService {
  /**
   * Resolve the full effective permission set for a subject.
   *
   * Inheritance is applied in two directions:
   *  1. Role auto-granted permissions are merged with explicit grants.
   *  2. Permission dependencies are expanded transitively, so granting
   *     `users.edit` (which depends on `users.read`) yields both.
   *
   * @param subject The subject to resolve permissions for.
   * @returns A set of effective permission ids.
   */
  public resolveEffectivePermissions(subject: PermissionSubject): Set<string> {
    const effective = new Set<string>();

    // 1. Role-based auto-granted permissions (inheritance from role).
    if (subject.role) {
      const constraints = getRoleConstraints(subject.role);
      if (constraints) {
        for (const id of constraints.autoGranted) {
          effective.add(id);
        }
      }
    }

    // 2. Explicitly granted permissions.
    for (const id of subject.permissions ?? []) {
      effective.add(id);
    }

    // 3. Expand permission dependencies transitively.
    this.expandDependencies(effective);

    return effective;
  }

  /**
   * Determine whether a subject holds a specific permission.
   *
   * Honors permission inheritance: a granted permission implicitly grants its
   * dependencies, and a subject's role auto-grants are included.
   *
   * @param subject The subject being evaluated.
   * @param permission The permission id to check.
   * @returns `true` if the subject effectively has the permission.
   */
  public hasPermission(subject: PermissionSubject, permission: string): boolean {
    if (!permission) {
      return false;
    }
    return this.resolveEffectivePermissions(subject).has(permission);
  }

  /**
   * Determine whether a subject holds ALL of the supplied permissions.
   *
   * @param subject The subject being evaluated.
   * @param permissions The permission ids that must all be present.
   * @returns `true` only if every permission is effectively held.
   */
  public hasAllPermissions(subject: PermissionSubject, permissions: string[]): boolean {
    if (permissions.length === 0) {
      return true;
    }
    const effective = this.resolveEffectivePermissions(subject);
    return permissions.every((p) => effective.has(p));
  }

  /**
   * Determine whether a subject holds AT LEAST ONE of the supplied permissions.
   *
   * @param subject The subject being evaluated.
   * @param permissions Candidate permission ids.
   * @returns `true` if any one permission is effectively held.
   */
  public hasAnyPermission(subject: PermissionSubject, permissions: string[]): boolean {
    if (permissions.length === 0) {
      return false;
    }
    const effective = this.resolveEffectivePermissions(subject);
    return permissions.some((p) => effective.has(p));
  }

  /**
   * Determine whether a subject's role satisfies a role requirement.
   *
   * Role hierarchy is respected: a more privileged role satisfies a
   * requirement for any less privileged role. For example a `superadmin`
   * (level 1) satisfies an `admin` (level 2) requirement, but not vice-versa.
   *
   * @param subject The subject being evaluated.
   * @param required A single role or list of acceptable roles.
   * @returns `true` if the subject's role meets the requirement.
   */
  public hasRole(subject: PermissionSubject, required: string | string[]): boolean {
    if (!subject.role) {
      return false;
    }

    const requiredRoles = Array.isArray(required) ? required : [required];
    if (requiredRoles.length === 0) {
      return false;
    }

    const subjectLevel = this.getRoleLevel(subject.role);

    return requiredRoles.some((requiredRole) => {
      // Exact match always satisfies the requirement.
      if (requiredRole === subject.role) {
        return true;
      }

      // Hierarchy match: subject's role must be at least as privileged
      // (i.e. a lower-or-equal level number) as the required role.
      const requiredLevel = this.getRoleLevel(requiredRole);
      if (subjectLevel === undefined || requiredLevel === undefined) {
        return false;
      }
      return subjectLevel <= requiredLevel;
    });
  }

  /**
   * Combined access check evaluating roles, permissions and minimum level.
   *
   * All supplied dimensions must be satisfied for access to be granted:
   *  - If `roles` is supplied, the subject's role must satisfy it.
   *  - If `permissions` is supplied, the subject must hold them according to
   *    `match` (`'all'` by default, or `'any'`).
   *  - If `minLevel` is supplied, the subject's role level must meet it.
   *
   * @param subject The subject being evaluated.
   * @param requirements The access requirements to satisfy.
   * @returns `true` if the subject satisfies every supplied requirement.
   */
  public canAccess(subject: PermissionSubject, requirements: AccessRequirements): boolean {
    // Role requirement.
    if (requirements.roles !== undefined) {
      if (!this.hasRole(subject, requirements.roles)) {
        return false;
      }
    }

    // Permission requirement.
    if (requirements.permissions !== undefined) {
      const permissions = Array.isArray(requirements.permissions)
        ? requirements.permissions
        : [requirements.permissions];

      const satisfied =
        requirements.match === 'any'
          ? this.hasAnyPermission(subject, permissions)
          : this.hasAllPermissions(subject, permissions);

      if (!satisfied) {
        return false;
      }
    }

    // Minimum level requirement.
    if (requirements.minLevel !== undefined) {
      const subjectLevel = subject.role ? this.getRoleLevel(subject.role) : undefined;
      if (subjectLevel === undefined || subjectLevel > requirements.minLevel) {
        return false;
      }
    }

    return true;
  }

  /**
   * Return the privilege level for a role, or `undefined` if unknown.
   * Lower numbers represent higher privilege.
   */
  public getRoleLevel(role: string): number | undefined {
    if (role in ROLE_HIERARCHY) {
      return ROLE_HIERARCHY[role as AdminRole];
    }
    return getRoleConstraints(role)?.level;
  }

  /**
   * Return the constraints for a role, or `undefined` if the role is unknown.
   */
  public getRoleConstraints(role: string): RolePermissionConstraints | undefined {
    return getRoleConstraints(role);
  }

  /**
   * Return the permissions automatically granted to a role.
   */
  public getAutoGrantedPermissions(role: string): string[] {
    return getRoleConstraints(role)?.autoGranted ?? [];
  }

  /**
   * Return the full list of permissions a role is allowed to hold
   * (max permissions minus restricted permissions).
   */
  public getAvailablePermissions(role: string): Permission[] {
    const constraints = getRoleConstraints(role);
    if (!constraints) {
      return [];
    }
    return PERMISSIONS.filter(
      (p) => constraints.maxPermissions.includes(p.id) && !constraints.restricted.includes(p.id),
    );
  }

  /**
   * Validate that a proposed permission assignment is legal for a role.
   *
   * Checks minimum required, maximum allowed, restricted permissions and
   * dependency satisfaction. This consolidates the assignment rules so both
   * the API layer and admin tooling share identical validation.
   *
   * @param role The target role.
   * @param permissions The proposed permission ids.
   * @returns Validation result with any error messages.
   */
  public validatePermissionAssignment(
    role: string,
    permissions: string[],
  ): { valid: boolean; errors: string[] } {
    const constraints = getRoleConstraints(role);
    if (!constraints) {
      return { valid: false, errors: ['Invalid role'] };
    }

    const errors: string[] = [];
    const granted = new Set(permissions);

    // Minimum required permissions.
    for (const minPerm of constraints.minPermissions) {
      if (!granted.has(minPerm)) {
        errors.push(`Missing required permission: ${minPerm}`);
      }
    }

    for (const perm of permissions) {
      // Maximum allowed permissions.
      if (!constraints.maxPermissions.includes(perm)) {
        errors.push(`Permission not allowed for role: ${perm}`);
      }

      // Restricted permissions.
      if (constraints.restricted.includes(perm)) {
        errors.push(`Permission restricted for role: ${perm}`);
      }

      // Dependency satisfaction.
      const definition = getPermissionById(perm);
      if (definition?.dependencies) {
        for (const dep of definition.dependencies) {
          if (!granted.has(dep)) {
            errors.push(`Permission ${perm} requires ${dep}`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Whether a permission id corresponds to a known permission.
   */
  public isKnownPermission(permission: string): boolean {
    return PERMISSION_IDS.has(permission);
  }

  /**
   * Whether a role id corresponds to a known role.
   */
  public isKnownRole(role: string): boolean {
    return ROLE_PERMISSION_CONSTRAINTS.some((c) => c.role === role);
  }

  /**
   * Expand a permission set in-place to include all transitive dependencies.
   * Granting a permission implicitly grants the permissions it depends on.
   */
  private expandDependencies(permissions: Set<string>): void {
    const queue: string[] = [...permissions];

    while (queue.length > 0) {
      const current = queue.pop() as string;
      const definition = getPermissionById(current);
      if (!definition?.dependencies) {
        continue;
      }
      for (const dep of definition.dependencies) {
        if (!permissions.has(dep)) {
          permissions.add(dep);
          queue.push(dep);
        }
      }
    }
  }
}

/**
 * Shared singleton instance for convenient reuse across the application.
 */
export const permissionService = new PermissionService();
