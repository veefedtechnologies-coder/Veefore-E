/**
 * Integration tests for migrated Main_App auth routes
 * 
 * Tests verify that Main_App authentication routes work correctly
 * after migration to shared auth modules.
 * 
 * Task: 11.7 - Migrate Main_App to use shared auth modules
 * Requirements: 8.3, 8.4
 */

import request from 'supertest';
import express, { Express } from 'express';
import authRoutes from './auth-routes';
import { storage } from './mongodb-storage';
import { admin } from './firebase-admin';

jest.mock('./mongodb-storage');
jest.mock('./firebase-admin');
jest.mock('./email-service', () => ({
  emailService: {
    sendVerificationEmail: jest.fn().mockResolvedValue(true)
  }
}));

describe('Main_App Auth Routes - Shared Middleware Integration', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    jest.clearAllMocks();
  });

  describe('POST /api/auth/send-verification', () => {
    it('should use shared authenticateUser middleware for token verification', async () => {
      // Mock Firebase token verification
      const mockDecodedToken = {
        uid: 'test-firebase-uid',
        email: 'test@example.com'
      };

      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockDecodedToken)
      });

      // Mock user lookup
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firebaseUid: 'test-firebase-uid',
        isEmailVerified: false
      };

      (storage.getUserByFirebaseUid as jest.Mock).mockResolvedValue(mockUser);
      (storage.updateUser as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/send-verification')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Verification code sent to your email'
      });

      // Verify shared middleware was used (token was verified)
      expect(admin.auth().verifyIdToken).toHaveBeenCalledWith('valid-token');
    });

    it('should return 401 when no token provided', async () => {
      const response = await request(app)
        .post('/api/auth/send-verification')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should verify email using shared middleware authentication', async () => {
      const mockDecodedToken = {
        uid: 'test-firebase-uid',
        email: 'test@example.com'
      };

      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockDecodedToken)
      });

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firebaseUid: 'test-firebase-uid',
        emailVerificationCode: '123456',
        emailVerificationExpiry: new Date(Date.now() + 15 * 60 * 1000),
        isEmailVerified: false
      };

      (storage.getUserByFirebaseUid as jest.Mock).mockResolvedValue(mockUser);
      (storage.updateUser as jest.Mock).mockResolvedValue({
        ...mockUser,
        isEmailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null
      });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .set('Authorization', 'Bearer valid-token')
        .send({ code: '123456' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Email verified successfully'
      });
    });
  });

  describe('GET /api/auth/user', () => {
    it('should get user using shared authenticateUser middleware', async () => {
      const mockDecodedToken = {
        uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User'
      };

      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockDecodedToken)
      });

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        firebaseUid: 'test-firebase-uid'
      };

      (storage.getUserByFirebaseId as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/auth/user')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        id: 'user-123',
        email: 'test@example.com'
      });
    });
  });

  describe('PUT /api/auth/user', () => {
    it('should update user profile using shared middleware', async () => {
      const mockDecodedToken = {
        uid: 'test-firebase-uid',
        email: 'test@example.com'
      };

      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockDecodedToken)
      });

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firebaseUid: 'test-firebase-uid',
        displayName: 'Old Name'
      };

      const updatedUser = {
        ...mockUser,
        displayName: 'New Name'
      };

      (storage.getUserByFirebaseId as jest.Mock).mockResolvedValue(mockUser);
      (storage.updateUser as jest.Mock).mockResolvedValue(updatedUser);

      const response = await request(app)
        .put('/api/auth/user')
        .set('Authorization', 'Bearer valid-token')
        .send({ displayName: 'New Name' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.displayName).toBe('New Name');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout using shared middleware', async () => {
      const mockDecodedToken = {
        uid: 'test-firebase-uid',
        email: 'test@example.com'
      };

      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockDecodedToken)
      });

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });
  });
});
