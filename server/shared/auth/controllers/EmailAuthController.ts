import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

/**
 * EmailAuthController - Shared email/password authentication controller
 * 
 * This controller consolidates duplicate email authentication logic between
 * Main_App and Admin_Panel, providing common functionality for:
 * - User registration with email/password
 * - Login with credentials
 * - Password hashing with bcrypt
 * - Email verification token generation
 * - Password reset workflows
 * 
 * Requirements: 5.2, 6.3
 * Task: 11.3
 */

// ============================================
// Types and Interfaces
// ============================================

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
}

export interface AuthUser {
  id: string;
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  isEmailVerified?: boolean;
  emailVerificationCode?: string | null;
  emailVerificationExpiry?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpiry?: Date | null;
}

export interface EmailService {
  sendVerificationEmail(email: string, code: string, firstName?: string): Promise<boolean>;
  sendPasswordResetEmail(email: string, token: string, firstName?: string): Promise<boolean>;
  generateOTP(): string;
  generateExpiry(): Date;
}

export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  create(data: Partial<AuthUser>): Promise<AuthUser>;
  update(id: string, data: Partial<AuthUser>): Promise<AuthUser>;
}

// ============================================
// EmailAuthController Class
// ============================================

export class EmailAuthController {
  private emailService: EmailService;
  private userRepository: UserRepository;

  constructor(emailService: EmailService, userRepository: UserRepository) {
    this.emailService = emailService;
    this.userRepository = userRepository;
  }

  // ============================================
  // Password Hashing Utilities
  // ============================================

  /**
   * Hash password using bcrypt with 12 salt rounds
   * @param password - Plain text password
   * @returns Hashed password
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare plain text password with hashed password
   * @param password - Plain text password
   * @param hashedPassword - Bcrypt hashed password
   * @returns True if passwords match
   */
  async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  // ============================================
  // Token Generation Utilities
  // ============================================

  /**
   * Generate email verification code (6-digit OTP)
   * @returns 6-digit verification code
   */
  generateVerificationCode(): string {
    return this.emailService.generateOTP();
  }

  /**
   * Generate verification code expiry (15 minutes)
   * @returns Expiry date
   */
  generateVerificationExpiry(): Date {
    return this.emailService.generateExpiry();
  }

  /**
   * Generate password reset token (secure random token)
   * @returns Secure reset token
   */
  generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate password reset token expiry (1 hour)
   * @returns Expiry date
   */
  generatePasswordResetExpiry(): Date {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);
    return expiry;
  }

  // ============================================
  // Registration Workflow
  // ============================================

  /**
   * Register new user with email and password
   * Validates input, checks for existing user, hashes password,
   * generates verification code, and sends verification email.
   * 
   * Supports both Main_App and Admin_Panel workflows.
   * 
   * @param req - Express request with RegisterRequest body
   * @param res - Express response
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName, displayName } = req.body as RegisterRequest;

      // Validate required fields
      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
        return;
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();

      // Validate email format
      const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
      if (!emailRegex.test(normalizedEmail)) {
        res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
        return;
      }

      // Validate password strength (minimum 8 characters)
      if (password.length < 8) {
        res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
        return;
      }

      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(normalizedEmail);
      if (existingUser && existingUser.isEmailVerified) {
        res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
        return;
      }

      // Hash password
      const hashedPassword = await this.hashPassword(password);

      // Generate verification code
      const verificationCode = this.generateVerificationCode();
      const verificationExpiry = this.generateVerificationExpiry();

      // Create or update user
      let user: AuthUser;
      if (existingUser) {
        // Update existing unverified user
        user = await this.userRepository.update(existingUser.id, {
          password: hashedPassword,
          emailVerificationCode: verificationCode,
          emailVerificationExpiry: verificationExpiry,
          isEmailVerified: false
        });
      } else {
        // Create new user
        user = await this.userRepository.create({
          email: normalizedEmail,
          password: hashedPassword,
          firstName,
          lastName,
          emailVerificationCode: verificationCode,
          emailVerificationExpiry: verificationExpiry,
          isEmailVerified: false
        });
      }

      // Send verification email
      await this.emailService.sendVerificationEmail(
        normalizedEmail,
        verificationCode,
        firstName || displayName || 'User'
      );

      console.log(`[EmailAuth] Registration successful for ${normalizedEmail}`);

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        data: {
          email: user.email,
          requiresVerification: true
        }
      });
    } catch (error) {
      console.error('[EmailAuth] Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed. Please try again.'
      });
    }
  }

  // ============================================
  // Login Workflow
  // ============================================

  /**
   * Login user with email and password
   * Validates credentials, checks email verification,
   * and returns user session data.
   * 
   * @param req - Express request with LoginRequest body
   * @param res - Express response
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body as LoginRequest;

      // Validate required fields
      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
        return;
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();

      // Find user by email
      const user = await this.userRepository.findByEmail(normalizedEmail);
      if (!user || !user.password) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
        return;
      }

      // Verify password
      const isPasswordValid = await this.comparePassword(password, user.password);
      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
        return;
      }

      // Check email verification
      if (!user.isEmailVerified) {
        res.status(403).json({
          success: false,
          message: 'Please verify your email before logging in',
          requiresVerification: true
        });
        return;
      }

      console.log(`[EmailAuth] Login successful for ${normalizedEmail}`);

      // Return user data (token generation handled by calling code)
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            isEmailVerified: user.isEmailVerified
          }
        }
      });
    } catch (error) {
      console.error('[EmailAuth] Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed. Please try again.'
      });
    }
  }

  // ============================================
  // Email Verification Workflow
  // ============================================

  /**
   * Verify email with verification code
   * Validates code, checks expiry, and marks email as verified.
   * 
   * @param req - Express request with VerifyEmailRequest body
   * @param res - Express response
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email, code } = req.body as VerifyEmailRequest;

      // Validate required fields
      if (!email || !code) {
        res.status(400).json({
          success: false,
          message: 'Email and verification code are required'
        });
        return;
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();

      // Find user
      const user = await this.userRepository.findByEmail(normalizedEmail);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Check if already verified
      if (user.isEmailVerified) {
        res.status(400).json({
          success: false,
          message: 'Email is already verified'
        });
        return;
      }

      // Validate verification code
      if (user.emailVerificationCode !== code) {
        res.status(400).json({
          success: false,
          message: 'Invalid verification code'
        });
        return;
      }

      // Check expiry
      if (user.emailVerificationExpiry && new Date() > user.emailVerificationExpiry) {
        res.status(400).json({
          success: false,
          message: 'Verification code has expired. Please request a new one.'
        });
        return;
      }

      // Mark as verified
      await this.userRepository.update(user.id, {
        isEmailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null
      });

      console.log(`[EmailAuth] Email verified for ${normalizedEmail}`);

      res.status(200).json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      console.error('[EmailAuth] Verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Verification failed. Please try again.'
      });
    }
  }

  // ============================================
  // Password Reset Workflow
  // ============================================

  /**
   * Initiate password reset by sending reset token via email
   * Generates secure reset token and sends email.
   * 
   * @param req - Express request with ForgotPasswordRequest body
   * @param res - Express response
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body as ForgotPasswordRequest;

      // Validate email
      if (!email) {
        res.status(400).json({
          success: false,
          message: 'Email is required'
        });
        return;
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();

      // Find user
      const user = await this.userRepository.findByEmail(normalizedEmail);
      
      // Always return success to prevent email enumeration
      if (!user) {
        res.status(200).json({
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.'
        });
        return;
      }

      // Generate reset token
      const resetToken = this.generatePasswordResetToken();
      const resetExpiry = this.generatePasswordResetExpiry();

      // Save reset token
      await this.userRepository.update(user.id, {
        passwordResetToken: resetToken,
        passwordResetExpiry: resetExpiry
      });

      // Send password reset email
      await this.emailService.sendPasswordResetEmail(
        normalizedEmail,
        resetToken,
        user.firstName
      );

      console.log(`[EmailAuth] Password reset requested for ${normalizedEmail}`);

      res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    } catch (error) {
      console.error('[EmailAuth] Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process password reset request. Please try again.'
      });
    }
  }

  /**
   * Reset password with reset token
   * Validates token, checks expiry, hashes new password.
   * 
   * @param req - Express request with ResetPasswordRequest body
   * @param res - Express response
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email, token, newPassword } = req.body as ResetPasswordRequest;

      // Validate required fields
      if (!email || !token || !newPassword) {
        res.status(400).json({
          success: false,
          message: 'Email, token, and new password are required'
        });
        return;
      }

      // Validate password strength
      if (newPassword.length < 8) {
        res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
        return;
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();

      // Find user
      const user = await this.userRepository.findByEmail(normalizedEmail);
      if (!user) {
        res.status(400).json({
          success: false,
          message: 'Invalid reset token'
        });
        return;
      }

      // Validate reset token
      if (user.passwordResetToken !== token) {
        res.status(400).json({
          success: false,
          message: 'Invalid reset token'
        });
        return;
      }

      // Check expiry
      if (user.passwordResetExpiry && new Date() > user.passwordResetExpiry) {
        res.status(400).json({
          success: false,
          message: 'Reset token has expired. Please request a new one.'
        });
        return;
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update password and clear reset token
      await this.userRepository.update(user.id, {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null
      });

      console.log(`[EmailAuth] Password reset successful for ${normalizedEmail}`);

      res.status(200).json({
        success: true,
        message: 'Password has been reset successfully'
      });
    } catch (error) {
      console.error('[EmailAuth] Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset password. Please try again.'
      });
    }
  }
}
