/**
 * Tests for admin permission definitions.
 *
 * Covers structural integrity of the permission catalogue, role hierarchy,
 * and per-role constraint definitions. Includes property-based tests that
 * assert universal invariants across the whole catalogue.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  PERMISSIONS,
  ALL_PERMISSION_IDS,
  PermissionId,
  PermissionCategory,
  AdminRole,
  ROLE_HIERARCHY,
  ROLE_PERMISSION_CONSTRAINTS,
  type RiskLevel,
} from './permissionDefinitions';

const VALID_RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
const idSet = new Set<string>(ALL_PERMISSION_IDS);

describe('PERMISSIONS catalogue', () => {
  test('is non-empty', () => {
    expect(PERMISSIONS.length).toBeGreaterThan(0);
  });

  test('has unique permission ids', () => {
    const ids = PERMISSIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('ALL_PERMISSION_IDS matches the catalogue', () => {
    expect(ALL_PERMISSION_IDS).toEqual(PERMISSIONS.map((p) => p.id));
  });

  test('every PermissionId enum value has exactly one definition', () => {
    for (const id of Object.values(PermissionId)) {
      const matches = PERMISSIONS.filter((p) => p.id === id);
      expect(matches.length, `expected one definition for ${id}`).toBe(1);
    }
  });

  test('all dependencies reference existing permissions', () => {
    for (const perm of PERMISSIONS) {
      for (const dep of perm.dependencies ?? []) {
        expect(idSet.has(dep), `${perm.id} depends on unknown ${dep}`).toBe(true);
      }
    }
  });

  test('no permission depends on itself', () => {
    for (const perm of PERMISSIONS) {
      expect(perm.dependencies ?? []).not.toContain(perm.id);
    }
  });

  test('every category used is a valid PermissionCategory', () => {
    const validCategories = new Set(Object.values(PermissionCategory));
    for (const perm of PERMISSIONS) {
      expect(validCategories.has(perm.category)).toBe(true);
    }
  });
});

describe('ROLE_HIERARCHY', () => {
  test('defines a level for every AdminRole', () => {
    for (const role of Object.values(AdminRole)) {
      expect(ROLE_HIERARCHY[role]).toBeGreaterThanOrEqual(1);
      expect(ROLE_HIERARCHY[role]).toBeLessThanOrEqual(5);
    }
  });

  test('superadmin is the highest privilege (level 1)', () => {
    expect(ROLE_HIERARCHY[AdminRole.SuperAdmin]).toBe(1);
    for (const role of Object.values(AdminRole)) {
      expect(ROLE_HIERARCHY[AdminRole.SuperAdmin]).toBeLessThanOrEqual(ROLE_HIERARCHY[role]);
    }
  });
});

describe('ROLE_PERMISSION_CONSTRAINTS', () => {
  test('defines constraints for every AdminRole exactly once', () => {
    const roles = ROLE_PERMISSION_CONSTRAINTS.map((c) => c.role);
    expect(new Set(roles).size).toBe(roles.length);
    expect(new Set(roles)).toEqual(new Set(Object.values(AdminRole)));
  });

  test('constraint level matches ROLE_HIERARCHY', () => {
    for (const constraint of ROLE_PERMISSION_CONSTRAINTS) {
      expect(constraint.level).toBe(ROLE_HIERARCHY[constraint.role]);
    }
  });

  test('superadmin can hold every permission', () => {
    const superadmin = ROLE_PERMISSION_CONSTRAINTS.find((c) => c.role === AdminRole.SuperAdmin)!;
    expect(new Set(superadmin.maxPermissions)).toEqual(new Set(ALL_PERMISSION_IDS));
    expect(superadmin.restricted).toHaveLength(0);
  });

  test('minimum permissions are always within maximum permissions', () => {
    for (const constraint of ROLE_PERMISSION_CONSTRAINTS) {
      const max = new Set(constraint.maxPermissions);
      for (const minPerm of constraint.minPermissions) {
        expect(max.has(minPerm), `${constraint.role} min ${minPerm} not in max set`).toBe(true);
      }
    }
  });

  test('restricted permissions never overlap with auto-granted permissions', () => {
    for (const constraint of ROLE_PERMISSION_CONSTRAINTS) {
      const restricted = new Set(constraint.restricted);
      for (const granted of constraint.autoGranted) {
        expect(restricted.has(granted), `${constraint.role} auto-grants restricted ${granted}`).toBe(false);
      }
    }
  });
});

describe('Property: permission catalogue invariants', () => {
  // Generator constrained to actual permissions in the catalogue.
  const arbPermission = fc.constantFrom(...PERMISSIONS);

  /**
   * Validates: Requirements 4.3, 19.3
   *
   * For every permission in the catalogue, all core fields are well-typed and
   * within their valid domains. This guards the typed permission definitions
   * against malformed entries as the catalogue evolves.
   */
  test('every permission has well-formed, in-range fields', () => {
    fc.assert(
      fc.property(arbPermission, (perm) => {
        expect(typeof perm.id).toBe('string');
        expect(perm.name.length).toBeGreaterThan(0);
        expect(perm.description.length).toBeGreaterThan(0);
        expect(perm.level).toBeGreaterThanOrEqual(1);
        expect(perm.level).toBeLessThanOrEqual(5);
        expect(VALID_RISK_LEVELS).toContain(perm.riskLevel);
        expect(idSet.has(perm.id)).toBe(true);
      }),
    );
  });

  /**
   * Validates: Requirements 4.3
   *
   * Every declared dependency resolves to a permission that exists in the
   * catalogue, for any permission selected from it.
   */
  test('dependencies always resolve within the catalogue', () => {
    fc.assert(
      fc.property(arbPermission, (perm) => {
        for (const dep of perm.dependencies ?? []) {
          expect(idSet.has(dep)).toBe(true);
        }
      }),
    );
  });
});
