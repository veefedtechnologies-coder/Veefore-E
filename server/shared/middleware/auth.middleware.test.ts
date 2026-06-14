/**
 * Unit tests for shared authentication middleware
 * 
 * Tests all authentication functions including:
 * - authenticateUser
 * - requireAdmin
 * - requireWorkspace
 * - checkPermission
 * - optionalAuth
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  authenticateUser,
  requireAdmin,
  requireWorkspace,
  checkPermission,
  optionalAuth,
  AuthenticatedRequest,
} from './auth.middleware';

// Mock dependencies
vi.mock('../../firebase-admin', () => ({
  admin: {
    auth: vi.fn(() => ({
      verifyIdToken: vi.fn(),
    })),
  },
}));

vi.mock('../../models/User/User', () => ({
  User: {
    findOne: vi.fn(),
  },
}));

vi.mock('../../models/Admin/Admin', () => ({
  AdminModel: {
    findOne: vi.fn(),
  },
}));

vi.mock('../../models/Workspace', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('../../middleware/sessionManager', () => ({
  default: {
    getAuthToken: vi.fn(),
  },
}));

import { admin } from '../../firebase-admin';
import { User } from '../../models/User/User';
import { AdminModel } from '../../models/Admin/Admin';
import Workspace from '../../models/Workspace';
import sessionManager from '../../middleware/sessionManager';

describe('Authentication Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock request
    mockReq = {
      headers: {},
      cookies: {},
      params: {},
      query: {},
      body: {},
    };

    // Setup mock response
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    // Setup mock next
    mockNext = vi.fn();
  });

  describe('authenticateUser', () => {
    it('should authenticate user with valid Bearer token', async () => {
      const mockToken = 'valid-firebase-token';
      const mockDecodedToken = {
        uid: 'user123',
        email: 'user@example.com',
        name: 'Test User',
      };
      const mockUser = {
        _id: 'userId123',
        firebaseUid: 'user123',
        email: 'user@example.com',
        displayName: 'Test User',
        workspaceId: 'workspace123',
      };

      mockReq.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const mockVerifyIdToken = vi.fn().mockResolvedValue(mockDecodedToken);
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      (User.findOne as any).mockResolvedValue(mockUser);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockVerifyIdToken).toHaveBeenCalledWith(mockToken);
      expect(User.findOne).toHaveBeenCalledWith({ firebaseUid: 'user123' });
      expect(mockReq.user).toEqual({
        uid: 'user123',
        email: 'user@example.com',
        displayName: 'Test User',
        role: 'user',
        userId: 'userId123',
        workspaceId: 'workspace123',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should authenticate user with cookie token', async () => {
      const mockToken = 'cookie-token';
      const mockDecodedToken = {
        uid: 'user456',
        email: 'user2@example.com',
      };
      const mockUser = {
        _id: 'userId456',
        firebaseUid: 'user456',
        email: 'user2@example.com',
        displayName: 'User Two',
      };

      (sessionManager.getAuthToken as any).mockReturnValue(mockToken);
      const mockVerifyIdToken = vi.fn().mockResolvedValue(mockDecodedToken);
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      (User.findOne as any).mockResolvedValue(mockUser);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(sessionManager.getAuthToken).toHaveBeenCalledWith(mockReq);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request with no token', async () => {
      (sessionManager.getAuthToken as any).mockReturnValue(null);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Access token is required',
        code: 'NO_TOKEN',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
      const mockToken = 'expired-token';
      mockReq.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const error: any = new Error('Token expired');
      error.code = 'auth/id-token-expired';
      const mockVerifyIdToken = vi.fn().mockRejectedValue(error);
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle user not found', async () => {
      const mockToken = 'valid-token';
      const mockDecodedToken = {
        uid: 'nonexistent',
        email: 'ghost@example.com',
      };

      mockReq.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const mockVerifyIdToken = vi.fn().mockResolvedValue(mockDecodedToken);
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      (User.findOne as any).mockResolvedValue(null);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should authenticate admin user', async () => {
      const mockToken = 'admin-token';
      const mockDecodedToken = {
        uid: 'admin123',
        email: 'admin@example.com',
        name: 'Admin User',
      };
      const mockAdmin = {
        email: 'admin@example.com',
        role: 'admin',
        isActive: true,
      };

      mockReq.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const mockVerifyIdToken = vi.fn().mockResolvedValue(mockDecodedToken);
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      (AdminModel.findOne as any).mockResolvedValue(mockAdmin);

      await requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual({
        uid: 'admin123',
        email: 'admin@example.com',
        displayName: 'Admin User',
        role: 'admin',
        isAdmin: true,
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject non-admin user', async () => {
      const mockToken = 'user-token';
      const mockDecodedToken = {
        uid: 'user123',
        email: 'user@example.com',
      };

      mockReq.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const mockVerifyIdToken = vi.fn().mockResolvedValue(mockDecodedToken);
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      (AdminModel.findOne as any).mockResolvedValue(null);

      await requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject inactive admin', async () => {
      const mockToken = 'admin-token';
      const mockDecodedToken = {
        uid: 'admin123',
        email: 'admin@example.com',
      };
      const mockAdmin = {
        email: 'admin@example.com',
        role: 'admin',
        isActive: false,
      };

      mockReq.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const mockVerifyIdToken = vi.fn().mockResolvedValue(mockDecodedToken);
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      (AdminModel.findOne as any).mockResolvedValue(mockAdmin);

      await requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireWorkspace', () => {
    beforeEach(() => {
      mockReq.user = {
        uid: 'user123',
        userId: 'userId123',
        email: 'user@example.com',
      };
    });

    it('should validate workspace owner access', async () => {
      const mockWorkspace = {
        workspaceId: 'workspace123',
        name: 'Test Workspace',
        ownerId: 'userId123',
        members: ['userId123'],
        plan: 'pro',
      };

      mockReq.params = { workspaceId: 'workspace123' };
      (Workspace.findOne as any).mockResolvedValue(mockWorkspace);

      await requireWorkspace(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(Workspace.findOne).toHaveBeenCalledWith({ workspaceId: 'workspace123' });
      expect(mockReq.workspace).toEqual({
        workspaceId: 'workspace123',
        name: 'Test Workspace',
        ownerId: 'userId123',
        members: ['userId123'],
        plan: 'pro',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate workspace member access', async () => {
      const mockWorkspace = {
        workspaceId: 'workspace456',
        name: 'Shared Workspace',
        ownerId: 'ownerUserId',
        members: ['ownerUserId', 'userId123'],
        plan: 'free',
      };

      mockReq.body = { workspaceId: 'workspace456' };
      (Workspace.findOne as any).mockResolvedValue(mockWorkspace);

      await requireWorkspace(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject access to workspace user is not member of', async () => {
      const mockWorkspace = {
        workspaceId: 'workspace789',
        name: 'Private Workspace',
        ownerId: 'otherUserId',
        members: ['otherUserId'],
        plan: 'free',
      };

      mockReq.query = { workspaceId: 'workspace789' };
      (Workspace.findOne as any).mockResolvedValue(mockWorkspace);

      await requireWorkspace(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Access denied to workspace',
        code: 'WORKSPACE_ACCESS_DENIED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with no workspace ID', async () => {
      await requireWorkspace(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Workspace ID required',
        code: 'NO_WORKSPACE_ID',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject non-existent workspace', async () => {
      mockReq.params = { workspaceId: 'nonexistent' };
      (Workspace.findOne as any).mockResolvedValue(null);

      await requireWorkspace(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Workspace not found',
        code: 'WORKSPACE_NOT_FOUND',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('checkPermission', () => {
    beforeEach(() => {
      mockReq.user = {
        uid: 'user123',
        userId: 'userId123',
        email: 'user@example.com',
        role: 'user',
      };
    });

    it('should allow admin to access any permission', async () => {
      mockReq.user!.role = 'admin';
      const middleware = checkPermission('workspace:admin');

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow workspace owner to perform admin actions', async () => {
      mockReq.workspace = {
        workspaceId: 'workspace123',
        name: 'Test',
        ownerId: 'userId123',
        members: ['userId123'],
        plan: 'pro',
      };

      const middleware = checkPermission('workspace:admin');
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny workspace member from admin actions', async () => {
      mockReq.workspace = {
        workspaceId: 'workspace123',
        name: 'Test',
        ownerId: 'ownerUserId',
        members: ['ownerUserId', 'userId123'],
        plan: 'pro',
      };

      const middleware = checkPermission('workspace:admin');
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Workspace owner privileges required',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow workspace members to access content', async () => {
      mockReq.workspace = {
        workspaceId: 'workspace123',
        name: 'Test',
        ownerId: 'ownerUserId',
        members: ['ownerUserId', 'userId123'],
        plan: 'pro',
      };

      const middleware = checkPermission('content:create');
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should authenticate user when token is present', async () => {
      const mockToken = 'valid-token';
      const mockDecodedToken = {
        uid: 'user123',
        email: 'user@example.com',
      };
      const mockUser = {
        _id: 'userId123',
        firebaseUid: 'user123',
        email: 'user@example.com',
      };

      mockReq.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const mockVerifyIdToken = vi.fn().mockResolvedValue(mockDecodedToken);
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      (User.findOne as any).mockResolvedValue(mockUser);

      await optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without auth when no token present', async () => {
      (sessionManager.getAuthToken as any).mockReturnValue(null);

      await optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without auth when token is invalid', async () => {
      const mockToken = 'invalid-token';
      mockReq.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const mockVerifyIdToken = vi.fn().mockRejectedValue(new Error('Invalid token'));
      (admin.auth as any).mockReturnValue({ verifyIdToken: mockVerifyIdToken });

      await optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
