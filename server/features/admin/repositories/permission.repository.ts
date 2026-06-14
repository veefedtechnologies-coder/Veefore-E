/**
 * Permission Repository
 *
 * Abstracts database access for admin user permissions and roles.
 * Provides a caching layer (Redis via CacheService) for fast permission
 * lookups, falling back gracefully to MongoDB on cache miss.
 *
 * The repository pattern keeps all data-access concerns (Mongoose queries,
 * cache reads/writes) out of the permission service and middleware layers.
 *
 * Requirements: 4.5
 */

import { CacheService } from '../../../services/cache-service';

/**
 * Snapshot of an admin's authorization data.
 */
export interface AdminPermissions {
  /** Admin document identifier */
  adminId: string;
  /** Assigned role (e.g. 'superadmin', 'admin', 'support') */
  role: string;
  /** Numeric privilege level (1 = highest) */
  level: number;
  /** Explicit permission identifiers granted to the admin */
  permissions: string[];
  /** Whether the admin account is active */
  isActive: boolean;
}

/**
 * Repository interface for permission and role data access.
 */
export interface IPermissionRepository {
  /** Fetch an admin's permissions/role, using cache when available. */
  getAdminPermissions(adminId: string): Promise<AdminPermissions | null>;
  /** Fetch only the explicit permission identifiers for an admin. */
  getPermissions(adminId: string): Promise<string[]>;
  /** Fetch only the role for an admin. */
  getRole(adminId: string): Promise<string | null>;
  /** Persist a new permission set for an admin and refresh the cache. */
  updatePermissions(adminId: string, permissions: string[]): Promise<AdminPermissions | null>;
  /** Invalidate the cached permission entry for an admin. */
  invalidate(adminId: string): Promise<void>;
}

/**
 * MongoDB + Redis backed implementation of {@link IPermissionRepository}.
 */
export class PermissionRepository implements IPermissionRepository {
  /** Cache TTL for permission lookups (seconds). */
  private static readonly CACHE_TTL = 300;

  private readonly cache: CacheService;

  // Lazily loaded Admin model to avoid circular imports and to keep the
  // repository usable in environments where the model is registered elsewhere.
  private adminModel: any;

  constructor() {
    this.cache = CacheService.getInstance();
  }

  /**
   * Build the cache key for an admin's permission snapshot.
   */
  private getCacheKey(adminId: string): string {
    return `admin_permissions_${adminId}`;
  }

  /**
   * Lazily resolve the Admin Mongoose model.
   * @returns The Admin model, or null if it cannot be resolved.
   */
  private async getAdminModel(): Promise<any> {
    if (this.adminModel) {
      return this.adminModel;
    }

    try {
      const mongoose = (await import('mongoose')).default;
      // Reuse an already-registered model when present.
      if (mongoose.models && mongoose.models.Admin) {
        this.adminModel = mongoose.models.Admin;
        return this.adminModel;
      }
    } catch {
      // mongoose unavailable – fall through to return null
    }

    return null;
  }

  /**
   * Normalise a raw Admin document into an {@link AdminPermissions} object.
   */
  private toAdminPermissions(doc: any): AdminPermissions {
    return {
      adminId: doc._id?.toString?.() ?? String(doc._id),
      role: doc.role,
      level: doc.level ?? 0,
      permissions: Array.isArray(doc.permissions) ? doc.permissions : [],
      isActive: doc.isActive ?? false,
    };
  }

  /**
   * Get an admin's full permission snapshot. Reads from cache first and
   * falls back to the database, caching any result it finds.
   */
  async getAdminPermissions(adminId: string): Promise<AdminPermissions | null> {
    const cacheKey = this.getCacheKey(adminId);

    const cached = await this.cache.get<AdminPermissions>(cacheKey);
    if (cached) {
      return cached;
    }

    const AdminModel = await this.getAdminModel();
    if (!AdminModel) {
      return null;
    }

    const doc = await AdminModel.findById(adminId).lean();
    if (!doc) {
      return null;
    }

    const result = this.toAdminPermissions(doc);
    await this.cache.set(cacheKey, result, PermissionRepository.CACHE_TTL);
    return result;
  }

  /**
   * Get the explicit permission identifiers for an admin.
   */
  async getPermissions(adminId: string): Promise<string[]> {
    const snapshot = await this.getAdminPermissions(adminId);
    return snapshot?.permissions ?? [];
  }

  /**
   * Get the role for an admin.
   */
  async getRole(adminId: string): Promise<string | null> {
    const snapshot = await this.getAdminPermissions(adminId);
    return snapshot?.role ?? null;
  }

  /**
   * Replace an admin's permission set and refresh the cached snapshot.
   */
  async updatePermissions(adminId: string, permissions: string[]): Promise<AdminPermissions | null> {
    const AdminModel = await this.getAdminModel();
    if (!AdminModel) {
      return null;
    }

    const doc = await AdminModel.findByIdAndUpdate(
      adminId,
      { $set: { permissions } },
      { new: true }
    ).lean();

    if (!doc) {
      // Ensure stale cache entries are cleared even on a failed update.
      await this.invalidate(adminId);
      return null;
    }

    const result = this.toAdminPermissions(doc);
    await this.cache.set(this.getCacheKey(adminId), result, PermissionRepository.CACHE_TTL);
    return result;
  }

  /**
   * Remove the cached permission snapshot for an admin.
   */
  async invalidate(adminId: string): Promise<void> {
    await this.cache.invalidate(this.getCacheKey(adminId));
  }
}

/**
 * Shared singleton instance.
 */
export const permissionRepository = new PermissionRepository();
