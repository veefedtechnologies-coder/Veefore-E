/**
 * Tests for the service-backed permission checker wiring (Task 18.5).
 *
 * Verifies that admin routes guarded by the modular permission middleware
 * (Task 18.3) enforce access correctly once the PermissionService (Task 18.2)
 * is wired in via configureAdminPermissions(). Covers both unit-level checker
 * behavior and end-to-end enforcement against an Express app using supertest.
 *
 * Validates: Requirements 4.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import {
  requirePermission,
  requireRole,
  requireAnyPermission,
  configurePermissionChecker,
  type AdminAuthRequest,
} from './middleware';
import {
  configureAdminPermissions,
  createServicePermissionChecker,
} from './permissionChecker';
import { PermissionService } from './services/permission.service';

/**
 * Build a test app that injects a fake authenticated admin (simulating the
 * upstream `authenticate` middleware) and then guards routes with the modular
 * permission middleware.
 */
function buildApp(admin: { role?: string; permissions?: string[] } | null): Express {
  const app = express();
  app.use(express.json());

  // Simulate the authenticate middleware populating req.admin.
  app.use((req: AdminAuthRequest, _res: Response, next: NextFunction) => {
    if (admin) {
      req.admin = { role: admin.role, permissions: admin.permissions };
    }
    next();
  });

  app.get('/admins', requirePermission('admins.read'), (_req: Request, res: Response) => {
    res.json({ success: true, data: 'admin-list' });
  });

  app.post('/admins', requireRole(['superadmin']), (_req: Request, res: Response) => {
    res.json({ success: true, data: 'admin-created' });
  });

  app.get('/billing', requireAnyPermission(['billing.payments.view', 'billing.invoices.view']),
    (_req: Request, res: Response) => {
      res.json({ success: true, data: 'billing' });
    });

  return app;
}

describe('configureAdminPermissions (service-backed checker)', () => {
  beforeEach(() => {
    configureAdminPermissions();
  });

  afterEach(() => {
    configurePermissionChecker(); // reset to default checker
  });

  describe('permission inheritance', () => {
    it('grants an inherited dependency permission (users.edit implies users.read)', async () => {
      const app = buildApp({ role: 'support', permissions: ['users.edit'] });
      // users.edit depends on users.read; the service expands dependencies.
      app.get('/users', requirePermission('users.read'), (_req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).get('/users');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });
    });

    it('grants role auto-granted permissions without explicit assignment', async () => {
      // superadmin auto-grants admins.read among others.
      const app = buildApp({ role: 'superadmin', permissions: [] });
      const res = await request(app).get('/admins');
      expect(res.status).toBe(200);
    });
  });

  describe('role hierarchy', () => {
    it('allows a superadmin to satisfy a superadmin-only route', async () => {
      const app = buildApp({ role: 'superadmin', permissions: [] });
      const res = await request(app).post('/admins').send({});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, data: 'admin-created' });
    });

    it('forbids a lower-privileged role from a superadmin-only route', async () => {
      const app = buildApp({ role: 'support', permissions: [] });
      const res = await request(app).post('/admins').send({});
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ success: false });
    });
  });

  describe('access enforcement', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = buildApp(null);
      const res = await request(app).get('/admins');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false });
    });

    it('returns 403 when the admin lacks the required permission', async () => {
      const app = buildApp({ role: 'analytics', permissions: ['analytics.dashboard.view'] });
      const res = await request(app).get('/admins');
      expect(res.status).toBe(403);
    });

    it('grants access via requireAnyPermission when at least one is held', async () => {
      const app = buildApp({ role: 'billing', permissions: ['billing.payments.view'] });
      const res = await request(app).get('/billing');
      expect(res.status).toBe(200);
    });
  });
});

describe('createServicePermissionChecker', () => {
  it('delegates permission checks to the provided PermissionService', () => {
    const service = new PermissionService();
    const checker = createServicePermissionChecker(service);

    const req = { admin: { role: 'support', permissions: ['users.edit'] } } as AdminAuthRequest;

    // users.edit -> users.read via dependency expansion.
    expect(checker.hasPermission(req, 'users.read')).toBe(true);
    expect(checker.hasPermission(req, 'users.delete')).toBe(false);
  });

  it('delegates role checks honoring hierarchy', () => {
    const service = new PermissionService();
    const checker = createServicePermissionChecker(service);

    const superadmin = { admin: { role: 'superadmin' } } as AdminAuthRequest;
    const support = { admin: { role: 'support' } } as AdminAuthRequest;

    expect(checker.hasRole(superadmin, 'admin')).toBe(true); // hierarchy
    expect(checker.hasRole(support, 'admin')).toBe(false);
  });
});
