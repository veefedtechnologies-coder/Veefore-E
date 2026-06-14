/**
 * Unit tests for PermissionService (Task 18.2).
 *
 * Verifies role checking methods (hasPermission, hasRole, canAccess),
 * permission inheritance (dependencies + role auto-grants), and role
 * hierarchy behavior.
 *
 * _Requirements: 4.1, 4.2_
 */

import { describe, it, expect } from 'vitest';
import { PermissionService, permissionService } from './permission.service';
import {
  PERMISSIONS,
  ROLE_PERMISSION_CONSTRAINTS,
  getPermissionById,
} from '../permissions/permissionDefinitions';

const service = new PermissionService();

describe('PermissionService.hasPermission', () => {
  it('returns true for an explicitly granted permission', () => {
    expect(service.hasPermission({ permissions: ['users.read'] }, 'users.read')).toBe(true);
  });

  it('returns false for a permission the subject does not hold', () => {
    expect(service.hasPermission({ permissions: ['users.read'] }, 'users.delete')).toBe(false);
  });

  it('returns false for an empty permission string', () => {
    expect(service.hasPermission({ permissions: ['users.read'] }, '')).toBe(false);
  });

  it('grants dependency permissions through inheritance', () => {
    // users.edit depends on users.read
    const subject = { permissions: ['users.edit'] };
    expect(service.hasPermission(subject, 'users.edit')).toBe(true);
    expect(service.hasPermission(subject, 'users.read')).toBe(true);
  });

  it('includes role auto-granted permissions', () => {
    // admin role auto-grants users.read
    expect(service.hasPermission({ role: 'admin' }, 'users.read')).toBe(true);
  });

  it('returns false when subject has neither role nor permissions', () => {
    expect(service.hasPermission({}, 'users.read')).toBe(false);
  });
});

describe('PermissionService.hasAllPermissions / hasAnyPermission', () => {
  it('hasAllPermissions requires every permission', () => {
    const subject = { permissions: ['users.read', 'tickets.read'] };
    expect(service.hasAllPermissions(subject, ['users.read', 'tickets.read'])).toBe(true);
    expect(service.hasAllPermissions(subject, ['users.read', 'users.delete'])).toBe(false);
  });

  it('hasAllPermissions returns true for an empty requirement', () => {
    expect(service.hasAllPermissions({ permissions: [] }, [])).toBe(true);
  });

  it('hasAnyPermission requires at least one permission', () => {
    const subject = { permissions: ['users.read'] };
    expect(service.hasAnyPermission(subject, ['users.delete', 'users.read'])).toBe(true);
    expect(service.hasAnyPermission(subject, ['users.delete', 'admins.create'])).toBe(false);
  });

  it('hasAnyPermission returns false for an empty candidate list', () => {
    expect(service.hasAnyPermission({ permissions: ['users.read'] }, [])).toBe(false);
  });
});

describe('PermissionService.hasRole (role hierarchy)', () => {
  it('matches an exact role', () => {
    expect(service.hasRole({ role: 'admin' }, 'admin')).toBe(true);
  });

  it('a more privileged role satisfies a less privileged requirement', () => {
    // superadmin (level 1) satisfies an admin (level 2) requirement
    expect(service.hasRole({ role: 'superadmin' }, 'admin')).toBe(true);
  });

  it('a less privileged role does NOT satisfy a more privileged requirement', () => {
    // admin (level 2) does not satisfy a superadmin (level 1) requirement
    expect(service.hasRole({ role: 'admin' }, 'superadmin')).toBe(false);
  });

  it('matches against a list of acceptable roles', () => {
    expect(service.hasRole({ role: 'support' }, ['support', 'billing'])).toBe(true);
  });

  it('returns false when the subject has no role', () => {
    expect(service.hasRole({}, 'admin')).toBe(false);
  });

  it('returns false for an unknown required role with no exact match', () => {
    expect(service.hasRole({ role: 'admin' }, 'nonexistent-role')).toBe(false);
  });

  it('returns false for an empty required list', () => {
    expect(service.hasRole({ role: 'admin' }, [])).toBe(false);
  });
});

describe('PermissionService.canAccess', () => {
  it('grants access when role and permission requirements are met', () => {
    const subject = { role: 'admin', permissions: ['users.read'] };
    expect(service.canAccess(subject, { roles: ['admin'], permissions: ['users.read'] })).toBe(true);
  });

  it('denies access when the role requirement fails', () => {
    const subject = { role: 'support', permissions: ['users.read'] };
    expect(service.canAccess(subject, { roles: ['admin'] })).toBe(false);
  });

  it('denies access when a required permission is missing', () => {
    const subject = { role: 'admin', permissions: ['users.read'] };
    expect(service.canAccess(subject, { permissions: ['users.delete'] })).toBe(false);
  });

  it('supports any-match permission semantics', () => {
    const subject = { permissions: ['users.read'] };
    expect(
      service.canAccess(subject, { permissions: ['users.read', 'users.delete'], match: 'any' }),
    ).toBe(true);
    expect(
      service.canAccess(subject, { permissions: ['users.read', 'users.delete'], match: 'all' }),
    ).toBe(false);
  });

  it('enforces a minimum privilege level', () => {
    // superadmin level 1 meets minLevel 2; analytics level 4 does not
    expect(service.canAccess({ role: 'superadmin' }, { minLevel: 2 })).toBe(true);
    expect(service.canAccess({ role: 'analytics' }, { minLevel: 2 })).toBe(false);
  });

  it('grants access when no requirements are supplied', () => {
    expect(service.canAccess({ role: 'support' }, {})).toBe(true);
  });
});

describe('PermissionService.resolveEffectivePermissions', () => {
  it('combines role auto-grants, explicit grants and dependencies', () => {
    const effective = service.resolveEffectivePermissions({
      role: 'support',
      permissions: ['users.edit'],
    });
    // explicit grant
    expect(effective.has('users.edit')).toBe(true);
    // dependency of users.edit
    expect(effective.has('users.read')).toBe(true);
    // auto-granted by support role
    expect(effective.has('tickets.read')).toBe(true);
  });
});

describe('PermissionService.validatePermissionAssignment', () => {
  it('rejects an unknown role', () => {
    const result = service.validatePermissionAssignment('ghost', []);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid role');
  });

  it('reports missing minimum permissions', () => {
    const result = service.validatePermissionAssignment('admin', []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('Missing required permission'))).toBe(true);
  });

  it('reports restricted permissions for a role', () => {
    const constraints = ROLE_PERMISSION_CONSTRAINTS.find((c) => c.role === 'admin')!;
    const assignment = [...constraints.minPermissions, 'system.maintenance'];
    const result = service.validatePermissionAssignment('admin', assignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('system.maintenance'))).toBe(true);
  });

  it('accepts a valid minimum assignment for a role', () => {
    const constraints = ROLE_PERMISSION_CONSTRAINTS.find((c) => c.role === 'support')!;
    const result = service.validatePermissionAssignment('support', constraints.minPermissions);
    // support minPermissions include users.read & tickets.read which have no
    // unmet dependencies, so this should be valid.
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('PermissionService helpers', () => {
  it('exposes role level via the hierarchy', () => {
    expect(service.getRoleLevel('superadmin')).toBe(1);
    expect(service.getRoleLevel('analytics')).toBe(4);
    expect(service.getRoleLevel('unknown')).toBeUndefined();
  });

  it('identifies known permissions and roles', () => {
    expect(service.isKnownPermission('users.read')).toBe(true);
    expect(service.isKnownPermission('users.nope')).toBe(false);
    expect(service.isKnownRole('admin')).toBe(true);
    expect(service.isKnownRole('wizard')).toBe(false);
  });

  it('returns available permissions excluding restricted ones', () => {
    const available = service.getAvailablePermissions('admin');
    const ids = available.map((p) => p.id);
    expect(ids).toContain('users.read');
    expect(ids).not.toContain('system.maintenance');
  });

  it('exposes a shared singleton instance', () => {
    expect(permissionService).toBeInstanceOf(PermissionService);
  });
});

describe('PermissionService property: hasPermission is consistent with effective set', () => {
  it('every permission id resolves consistently for a superadmin', () => {
    // superadmin auto-grants include all auto-granted + admin management perms
    for (const perm of PERMISSIONS) {
      const direct = service.hasPermission({ role: 'superadmin' }, perm.id);
      const inSet = service
        .resolveEffectivePermissions({ role: 'superadmin' })
        .has(perm.id);
      expect(direct).toBe(inSet);
    }
  });

  it('dependency closure matches definition for explicit grants', () => {
    const withDeps = PERMISSIONS.find((p) => p.dependencies && p.dependencies.length > 0)!;
    const effective = service.resolveEffectivePermissions({ permissions: [withDeps.id] });
    for (const dep of getPermissionById(withDeps.id)!.dependencies!) {
      expect(effective.has(dep)).toBe(true);
    }
  });
});
