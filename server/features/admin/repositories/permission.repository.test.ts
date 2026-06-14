/**
 * Permission Repository Unit Tests
 *
 * Tests for the PermissionRepository class that abstracts database access
 * for admin permissions/roles and provides a caching layer.
 *
 * Requirements: 4.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory cache double shared across the repository under test.
// Declared via vi.hoisted so they are initialized before the hoisted vi.mock factories run.
const { cacheStore, cacheGet, cacheSet, cacheInvalidate, findById, findByIdAndUpdate } = vi.hoisted(
  () => {
    const store = new Map<string, any>();
    return {
      cacheStore: store,
      cacheGet: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
      cacheSet: vi.fn(async (key: string, value: any) => {
        store.set(key, value);
      }),
      cacheInvalidate: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    };
  }
);

vi.mock('../../../services/cache-service', () => ({
  CacheService: {
    getInstance: () => ({
      get: cacheGet,
      set: cacheSet,
      invalidate: cacheInvalidate,
    }),
  },
}));

vi.mock('mongoose', () => ({
  default: {
    models: { Admin: { findById, findByIdAndUpdate } },
  },
}));

import { PermissionRepository, AdminPermissions } from './permission.repository';

/** Helper to build a lean-query result. */
const lean = (value: any) => ({ lean: async () => value });

const sampleDoc = {
  _id: { toString: () => 'admin-123' },
  role: 'support',
  level: 3,
  permissions: ['users.read', 'tickets.read'],
  isActive: true,
};

describe('PermissionRepository', () => {
  let repository: PermissionRepository;

  beforeEach(() => {
    cacheStore.clear();
    cacheGet.mockClear();
    cacheSet.mockClear();
    cacheInvalidate.mockClear();
    findById.mockReset();
    findByIdAndUpdate.mockReset();
    repository = new PermissionRepository();
  });

  describe('Interface Definition', () => {
    const methods = [
      'getAdminPermissions',
      'getPermissions',
      'getRole',
      'updatePermissions',
      'invalidate',
    ];

    methods.forEach(method => {
      it(`should expose ${method} method`, () => {
        expect(typeof (repository as any)[method]).toBe('function');
      });
    });
  });

  describe('getAdminPermissions', () => {
    it('returns a normalized snapshot from the database on cache miss', async () => {
      findById.mockReturnValue(lean(sampleDoc));

      const result = await repository.getAdminPermissions('admin-123');

      expect(result).toEqual<AdminPermissions>({
        adminId: 'admin-123',
        role: 'support',
        level: 3,
        permissions: ['users.read', 'tickets.read'],
        isActive: true,
      });
      expect(findById).toHaveBeenCalledWith('admin-123');
    });

    it('caches the database result for subsequent lookups', async () => {
      findById.mockReturnValue(lean(sampleDoc));

      await repository.getAdminPermissions('admin-123');
      expect(cacheSet).toHaveBeenCalledTimes(1);

      // Second call should hit cache and skip the DB.
      findById.mockClear();
      const cached = await repository.getAdminPermissions('admin-123');

      expect(findById).not.toHaveBeenCalled();
      expect(cached?.role).toBe('support');
    });

    it('returns null when the admin does not exist', async () => {
      findById.mockReturnValue(lean(null));

      const result = await repository.getAdminPermissions('missing');

      expect(result).toBeNull();
      expect(cacheSet).not.toHaveBeenCalled();
    });
  });

  describe('getPermissions / getRole', () => {
    it('returns just the permissions array', async () => {
      findById.mockReturnValue(lean(sampleDoc));
      const permissions = await repository.getPermissions('admin-123');
      expect(permissions).toEqual(['users.read', 'tickets.read']);
    });

    it('returns an empty array when admin is missing', async () => {
      findById.mockReturnValue(lean(null));
      const permissions = await repository.getPermissions('missing');
      expect(permissions).toEqual([]);
    });

    it('returns just the role', async () => {
      findById.mockReturnValue(lean(sampleDoc));
      const role = await repository.getRole('admin-123');
      expect(role).toBe('support');
    });

    it('returns null role when admin is missing', async () => {
      findById.mockReturnValue(lean(null));
      const role = await repository.getRole('missing');
      expect(role).toBeNull();
    });
  });

  describe('updatePermissions', () => {
    it('persists the new permissions and refreshes the cache', async () => {
      const updatedDoc = { ...sampleDoc, permissions: ['users.read', 'users.edit'] };
      findByIdAndUpdate.mockReturnValue(lean(updatedDoc));

      const result = await repository.updatePermissions('admin-123', ['users.read', 'users.edit']);

      expect(findByIdAndUpdate).toHaveBeenCalledWith(
        'admin-123',
        { $set: { permissions: ['users.read', 'users.edit'] } },
        { new: true }
      );
      expect(result?.permissions).toEqual(['users.read', 'users.edit']);
      expect(cacheStore.get('admin_permissions_admin-123')?.permissions).toEqual([
        'users.read',
        'users.edit',
      ]);
    });

    it('invalidates the cache and returns null when the admin is missing', async () => {
      cacheStore.set('admin_permissions_admin-123', sampleDoc);
      findByIdAndUpdate.mockReturnValue(lean(null));

      const result = await repository.updatePermissions('admin-123', ['users.read']);

      expect(result).toBeNull();
      expect(cacheInvalidate).toHaveBeenCalledWith('admin_permissions_admin-123');
      expect(cacheStore.has('admin_permissions_admin-123')).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('removes the cached snapshot for an admin', async () => {
      cacheStore.set('admin_permissions_admin-123', sampleDoc);

      await repository.invalidate('admin-123');

      expect(cacheInvalidate).toHaveBeenCalledWith('admin_permissions_admin-123');
      expect(cacheStore.has('admin_permissions_admin-123')).toBe(false);
    });
  });

  describe('Requirements Coverage', () => {
    it('meets requirement 4.5 - abstracts DB access behind a repository', () => {
      // All persistence is funnelled through repository methods so services
      // and middleware never touch Mongoose directly.
      expect(repository.getAdminPermissions).toBeDefined();
      expect(repository.updatePermissions).toBeDefined();
    });

    it('provides a caching layer for permission lookups', async () => {
      findById.mockReturnValue(lean(sampleDoc));
      await repository.getAdminPermissions('admin-123');
      // Cache write occurred as part of the lookup.
      expect(cacheSet).toHaveBeenCalled();
    });
  });
});
