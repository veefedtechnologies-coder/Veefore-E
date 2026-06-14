/**
 * Tests for admin permission middleware (Task 18.3).
 *
 * Validates: Requirements 4.3, 8.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireRole,
  resolvePermissions,
  resolveRole,
  configurePermissionChecker,
  defaultPermissionChecker,
  PermissionErrorCode,
  type AdminAuthRequest,
} from './requirePermission';

/** Build a mock Express response that records status/json calls. */
function mockResponse(): Response & { statusCode?: number; body?: unknown } {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response['status'];
  res.json = vi.fn((payload: unknown) => {
    res.body = payload;
    return res as Response;
  }) as unknown as Response['json'];
  return res as Response & { statusCode?: number; body?: unknown };
}

function mockRequest(partial: Partial<AdminAuthRequest>): AdminAuthRequest {
  return partial as AdminAuthRequest;
}

describe('admin permission middleware', () => {
  beforeEach(() => {
    configurePermissionChecker(); // reset to default
  });

  describe('resolvePermissions / resolveRole', () => {
    it('prefers req.permissions over role and admin permissions', () => {
      const req = mockRequest({
        permissions: ['a'],
        role: { permissions: ['b'] },
        admin: { permissions: ['c'] },
      });
      expect(resolvePermissions(req)).toEqual(['a']);
    });

    it('falls back to role permissions then admin permissions', () => {
      expect(resolvePermissions(mockRequest({ role: { permissions: ['b'] } }))).toEqual(['b']);
      expect(resolvePermissions(mockRequest({ admin: { permissions: ['c'] } }))).toEqual(['c']);
      expect(resolvePermissions(mockRequest({}))).toEqual([]);
    });

    it('resolves role from admin.role then role.name', () => {
      expect(resolveRole(mockRequest({ admin: { role: 'admin' } }))).toBe('admin');
      expect(resolveRole(mockRequest({ role: { name: 'support' } }))).toBe('support');
      expect(resolveRole(mockRequest({}))).toBeUndefined();
    });

    it('returns defensive copies (mutation does not leak)', () => {
      const req = mockRequest({ permissions: ['a'] });
      const result = resolvePermissions(req);
      result.push('mutated');
      expect(req.permissions).toEqual(['a']);
    });
  });

  describe('requirePermission', () => {
    it('calls next when admin has the permission', () => {
      const req = mockRequest({ admin: { permissions: ['users.read'] } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('users.read')(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 401 when unauthenticated', () => {
      const req = mockRequest({});
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('users.read')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toMatchObject({ success: false, code: PermissionErrorCode.Unauthenticated });
    });

    it('returns 403 with required permission when missing', () => {
      const req = mockRequest({ admin: { permissions: ['users.read'] } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('users.delete')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({
        success: false,
        code: PermissionErrorCode.Forbidden,
        required: ['users.delete'],
      });
    });

    it('throws on invalid configuration', () => {
      expect(() => requirePermission('')).toThrow();
    });
  });

  describe('requireAllPermissions', () => {
    it('calls next when all permissions present', () => {
      const req = mockRequest({ admin: { permissions: ['a', 'b', 'c'] } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireAllPermissions(['a', 'b'])(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('returns 403 listing only missing permissions', () => {
      const req = mockRequest({ admin: { permissions: ['a'] } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireAllPermissions(['a', 'b', 'c'])(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({ required: ['b', 'c'] });
    });

    it('throws on empty array', () => {
      expect(() => requireAllPermissions([])).toThrow();
    });
  });

  describe('requireAnyPermission', () => {
    it('calls next when at least one permission present', () => {
      const req = mockRequest({ admin: { permissions: ['b'] } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireAnyPermission(['a', 'b'])(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('returns 403 when none present', () => {
      const req = mockRequest({ admin: { permissions: ['x'] } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireAnyPermission(['a', 'b'])(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({ required: ['a', 'b'] });
    });

    it('returns 401 when unauthenticated', () => {
      const req = mockRequest({});
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireAnyPermission(['a'])(req, res, next);
      expect(res.statusCode).toBe(401);
    });

    it('throws on empty array', () => {
      expect(() => requireAnyPermission([])).toThrow();
    });
  });

  describe('requireRole', () => {
    it('accepts a single role string', () => {
      const req = mockRequest({ admin: { role: 'superadmin' } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireRole('superadmin')(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('accepts a list of roles', () => {
      const req = mockRequest({ admin: { role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireRole(['superadmin', 'admin'])(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('returns 403 when role not allowed', () => {
      const req = mockRequest({ admin: { role: 'support' } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireRole(['superadmin', 'admin'])(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({ required: ['superadmin', 'admin'] });
    });

    it('returns 401 when unauthenticated', () => {
      const req = mockRequest({});
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requireRole('admin')(req, res, next);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('configurePermissionChecker', () => {
    it('delegates to an injected checker (e.g. PermissionService)', () => {
      const serviceChecker = {
        hasPermission: vi.fn().mockReturnValue(true),
        hasRole: vi.fn().mockReturnValue(true),
      };
      configurePermissionChecker(serviceChecker);

      const req = mockRequest({ admin: { permissions: [] } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('anything.inherited')(req, res, next);

      expect(serviceChecker.hasPermission).toHaveBeenCalledWith(req, 'anything.inherited');
      expect(next).toHaveBeenCalledOnce();
    });

    it('resets to the default checker when called with no argument', () => {
      configurePermissionChecker({
        hasPermission: () => true,
        hasRole: () => true,
      });
      configurePermissionChecker();

      const req = mockRequest({ admin: { permissions: [] } });
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('users.read')(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(defaultPermissionChecker.hasPermission(req, 'users.read')).toBe(false);
    });
  });
});
