import { EmailAuthController, EmailService, UserRepository, AuthUser } from './EmailAuthController';
import { Request, Response } from 'express';

/**
 * Unit Tests for EmailAuthController
 * 
 * Tests shared email authentication functionality including:
 * - User registration
 * - Login validation
 * - Email verification
 * - Password reset
 * 
 * Requirements: 5.2, 6.3
 * Task: 11.3
 */

describe('EmailAuthController', () => {
  let controller: EmailAuthController;
  let mockEmailService: jest.Mocked<EmailService>;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusSpy: jest.Mock;
  let jsonSpy: jest.Mock;

  beforeEach(() => {
    // Mock EmailService
    mockEmailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
      generateOTP: jest.fn().mockReturnValue('123456'),
      generateExpiry: jest.fn().mockReturnValue(new Date(Date.now() + 15 * 60 * 1000))
    };

    // Mock UserRepository
    mockUserRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn()
    };

    // Create controller instance
    controller = new EmailAuthController(mockEmailService, mockUserRepository);

    // Mock Express response
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });
    mockResponse = {
      status: statusSpy,
      json: jsonSpy
    };

    // Mock Express request
    mockRequest = {
      body: {}
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      mockRequest.body = {
        email: 'newuser@example.com',
        password: 'SecurePassword123',
        firstName: 'John',
        lastName: 'Doe'
      };

      const createdUser: AuthUser = {
        id: '123',
        email: 'newuser@example.com',
        isEmailVerified: false,
        emailVerificationCode: '123456',
        emailVerificationExpiry: new Date()
      };

      mockUserRepository.create.mockResolvedValue(createdUser);

      await controller.register(mockRequest as Request, mockResponse as Response);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('newuser@example.com');
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        'newuser@example.com',
        '123456',
        'John'
      );
      expect(statusSpy).toHaveBeenCalledWith(201);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('Registration successful')
        })
      );
    });

    it('should reject registration with invalid email format', async () => {
      mockRequest.body = {
        email: 'invalid-email',
        password: 'SecurePassword123'
      };

      await controller.register(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid email format'
        })
      );
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should reject registration with short password', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        password: 'short'
      };

      await controller.register(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Password must be at least 8 characters long'
        })
      );
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should reject registration with existing verified user', async () => {
      mockRequest.body = {
        email: 'existing@example.com',
        password: 'SecurePassword123'
      };

      const existingUser: AuthUser = {
        id: '123',
        email: 'existing@example.com',
        isEmailVerified: true
      };

      mockUserRepository.findByEmail.mockResolvedValue(existingUser);

      await controller.register(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'User with this email already exists'
        })
      );
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should update existing unverified user during registration', async () => {
      mockRequest.body = {
        email: 'unverified@example.com',
        password: 'NewPassword123'
      };

      const existingUser: AuthUser = {
        id: '123',
        email: 'unverified@example.com',
        isEmailVerified: false
      };

      const updatedUser: AuthUser = {
        ...existingUser,
        emailVerificationCode: '123456'
      };

      mockUserRepository.findByEmail.mockResolvedValue(existingUser);
      mockUserRepository.update.mockResolvedValue(updatedUser);

      await controller.register(mockRequest as Request, mockResponse as Response);

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          password: expect.any(String),
          emailVerificationCode: '123456',
          isEmailVerified: false
        })
      );
      expect(statusSpy).toHaveBeenCalledWith(201);
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        password: 'CorrectPassword123'
      };

      const hashedPassword = await controller.hashPassword('CorrectPassword123');
      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        password: hashedPassword,
        isEmailVerified: true
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await controller.login(mockRequest as Request, mockResponse as Response);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Login successful'
        })
      );
    });

    it('should reject login with invalid password', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        password: 'WrongPassword'
      };

      const hashedPassword = await controller.hashPassword('CorrectPassword123');
      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        password: hashedPassword,
        isEmailVerified: true
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await controller.login(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid email or password'
        })
      );
    });

    it('should reject login for non-existent user', async () => {
      mockRequest.body = {
        email: 'nonexistent@example.com',
        password: 'Password123'
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);

      await controller.login(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid email or password'
        })
      );
    });

    it('should reject login for unverified email', async () => {
      mockRequest.body = {
        email: 'unverified@example.com',
        password: 'CorrectPassword123'
      };

      const hashedPassword = await controller.hashPassword('CorrectPassword123');
      const user: AuthUser = {
        id: '123',
        email: 'unverified@example.com',
        password: hashedPassword,
        isEmailVerified: false
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await controller.login(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Please verify your email before logging in',
          requiresVerification: true
        })
      );
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email with valid code', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        code: '123456'
      };

      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        isEmailVerified: false,
        emailVerificationCode: '123456',
        emailVerificationExpiry: new Date(Date.now() + 10 * 60 * 1000) // 10 min from now
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue({ ...user, isEmailVerified: true });

      await controller.verifyEmail(mockRequest as Request, mockResponse as Response);

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          isEmailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiry: null
        })
      );
      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Email verified successfully'
        })
      );
    });

    it('should reject verification with invalid code', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        code: '999999'
      };

      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        isEmailVerified: false,
        emailVerificationCode: '123456',
        emailVerificationExpiry: new Date(Date.now() + 10 * 60 * 1000)
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await controller.verifyEmail(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid verification code'
        })
      );
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should reject verification with expired code', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        code: '123456'
      };

      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        isEmailVerified: false,
        emailVerificationCode: '123456',
        emailVerificationExpiry: new Date(Date.now() - 1000) // Expired 1 second ago
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await controller.verifyEmail(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('expired')
        })
      );
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should reject verification if email already verified', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        code: '123456'
      };

      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        isEmailVerified: true
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await controller.verifyEmail(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Email is already verified'
        })
      );
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('should send password reset email for existing user', async () => {
      mockRequest.body = {
        email: 'user@example.com'
      };

      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        firstName: 'John'
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(user);

      await controller.forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          passwordResetToken: expect.any(String),
          passwordResetExpiry: expect.any(Date)
        })
      );
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(200);
    });

    it('should return success even for non-existent user (security)', async () => {
      mockRequest.body = {
        email: 'nonexistent@example.com'
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);

      await controller.forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('If an account exists')
        })
      );
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should successfully reset password with valid token', async () => {
      const resetToken = 'valid-reset-token-123';
      mockRequest.body = {
        email: 'user@example.com',
        token: resetToken,
        newPassword: 'NewPassword456'
      };

      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        passwordResetToken: resetToken,
        passwordResetExpiry: new Date(Date.now() + 30 * 60 * 1000) // 30 min from now
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(user);

      await controller.resetPassword(mockRequest as Request, mockResponse as Response);

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          password: expect.any(String),
          passwordResetToken: null,
          passwordResetExpiry: null
        })
      );
      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Password has been reset successfully'
        })
      );
    });

    it('should reject reset with invalid token', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        token: 'invalid-token',
        newPassword: 'NewPassword456'
      };

      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        passwordResetToken: 'different-token',
        passwordResetExpiry: new Date(Date.now() + 30 * 60 * 1000)
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await controller.resetPassword(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid reset token'
        })
      );
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should reject reset with expired token', async () => {
      const resetToken = 'valid-reset-token-123';
      mockRequest.body = {
        email: 'user@example.com',
        token: resetToken,
        newPassword: 'NewPassword456'
      };

      const user: AuthUser = {
        id: '123',
        email: 'user@example.com',
        passwordResetToken: resetToken,
        passwordResetExpiry: new Date(Date.now() - 1000) // Expired 1 second ago
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await controller.resetPassword(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('expired')
        })
      );
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should reject reset with short password', async () => {
      const resetToken = 'valid-reset-token-123';
      mockRequest.body = {
        email: 'user@example.com',
        token: resetToken,
        newPassword: 'short'
      };

      await controller.resetPassword(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Password must be at least 8 characters long'
        })
      );
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should hash and compare passwords correctly', async () => {
      const password = 'TestPassword123';
      const hashedPassword = await controller.hashPassword(password);

      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50); // Bcrypt hashes are long

      const isValid = await controller.comparePassword(password, hashedPassword);
      expect(isValid).toBe(true);

      const isInvalid = await controller.comparePassword('WrongPassword', hashedPassword);
      expect(isInvalid).toBe(false);
    });

    it('should generate verification codes', () => {
      const code = controller.generateVerificationCode();
      expect(code).toBe('123456'); // Mocked value
    });

    it('should generate verification expiry', () => {
      const expiry = controller.generateVerificationExpiry();
      expect(expiry).toBeInstanceOf(Date);
    });

    it('should generate password reset tokens', () => {
      const token = controller.generatePasswordResetToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes hex = 64 characters
    });

    it('should generate password reset expiry', () => {
      const expiry = controller.generatePasswordResetExpiry();
      expect(expiry).toBeInstanceOf(Date);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
