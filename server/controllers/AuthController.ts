import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { userService, workspaceService } from '../services';
import { ValidationError, ConflictError, NotFoundError } from '../errors';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { storage } from '../mongodb-storage';
import { emailService } from '../email-service';
import { getFirebaseAdmin } from '../firebase-admin';
import { getRedisClient } from '../lib/redis';

const LinkFirebaseSchema = z.object({
  email: z.string().email(),
  firebaseUid: z.string().min(1),
  displayName: z.string().optional(),
});

const SendVerificationSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
});

const VerifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
});

const ResendVerificationSchema = z.object({
  email: z.string().email(),
});

const SignInSchema = z.object({
  email: z.string().email(),
});

export class AuthController extends BaseController {
  /**
   * POST /api/auth/signin
   * Create backend session after Firebase sign-in
   * This is called by the client after successful Firebase authentication
   */
  signIn = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, z.infer<typeof SignInSchema>>,
    res: Response
  ) => {
    const input = SignInSchema.parse(req.body);
    const normalizedEmail = input.email.trim().toLowerCase();

    console.log('[SignIn] Creating backend session for:', normalizedEmail);

    // Find user by email
    const user = await userService.getUserByEmail(normalizedEmail);
    
    if (!user) {
      console.warn('[SignIn] User not found:', normalizedEmail);
      return this.sendError(res, new NotFoundError('User not found'));
    }

    // Create Firebase custom token for session
    const admin = getFirebaseAdmin();
    const customToken = await admin.auth().createCustomToken(
      String(user._id),
      {
        email: user.email,
        emailVerified: user.isEmailVerified,
        sessionVersion: user.sessionVersion || 1,
      }
    );

    // Set auth cookie (same as OAuth flow)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.FRONTEND_URL?.startsWith('https') || false,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined,
    };

    res.cookie('auth_token', customToken, cookieOptions);

    console.log('[SignIn] Backend session created for:', normalizedEmail);

    this.sendSuccess(res, { 
      success: true,
      message: 'Session created successfully' 
    });
  });

  getCurrentUser = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      return this.sendError(res, new ValidationError('User not authenticated'));
    }

    const user = await userService.getUserById(userId);
    this.sendSuccess(res, user);
  });

  getUserByFirebaseUid = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary>,
    res: Response
  ) => {
    const firebaseUid = req.params.firebaseUid;
    if (!firebaseUid) {
      return this.sendError(res, new ValidationError('Firebase UID is required'));
    }

    const user = await userService.getUserByFirebaseUid(firebaseUid);
    if (!user) {
      return this.sendSuccess(res, null, 200, 'User not found');
    }
    this.sendSuccess(res, user);
  });

  getUserByEmail = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, any, ParsedQs>,
    res: Response
  ) => {
    const email = req.query.email as string | undefined;
    if (!email) {
      return this.sendError(res, new ValidationError('Email is required'));
    }

    const user = await userService.getUserByEmail(email);
    if (!user) {
      return this.sendSuccess(res, null, 200, 'User not found');
    }
    this.sendSuccess(res, user);
  });

  linkFirebase = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, z.infer<typeof LinkFirebaseSchema>>,
    res: Response
  ) => {
    const input = LinkFirebaseSchema.parse(req.body);
    const normalizedEmail = input.email.trim().toLowerCase();

    // ============================================
    // EARLY ACCESS VALIDATION - Server-side gating with granular error messages
    // ============================================
    const { waitlistUserRepository } = await import('../repositories/WaitlistUserRepository');
    const waitlistUser = await waitlistUserRepository.findByEmail(normalizedEmail);

    // Scenario 1: User is not on waitlist at all
    if (!waitlistUser) {
      console.log(`[EARLY ACCESS] Access denied for ${normalizedEmail} - Not on waitlist`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'NOT_ON_WAITLIST',
          message: 'This email is not on our waitlist. Please join the waitlist first to get early access.',
        },
        details: {
          action: 'JOIN_WAITLIST',
          hasWaitlistEntry: false,
          waitlistStatus: null
        }
      });
    }

    // Scenario 2: User is on waitlist but pending approval
    if (waitlistUser.status === 'pending' || waitlistUser.status === 'waitlisted') {
      console.log(`[EARLY ACCESS] Access denied for ${normalizedEmail} - Status: ${waitlistUser.status} (pending approval)`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'PENDING_APPROVAL',
          message: 'Your waitlist application is pending approval. We will notify you via email when you are approved for early access.',
        },
        details: {
          action: 'WAIT_FOR_APPROVAL',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Scenario 3: User application was rejected
    if (waitlistUser.status === 'rejected') {
      console.log(`[EARLY ACCESS] Access denied for ${normalizedEmail} - Status: rejected`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_REJECTED',
          message: 'Your application was not approved at this time. Please contact support for more information.',
        },
        details: {
          action: 'CONTACT_SUPPORT',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Scenario 4: User has invalid/unknown status
    if (waitlistUser.status !== 'early_access') {
      console.log(`[EARLY ACCESS] Access denied for ${normalizedEmail} - Invalid status: ${waitlistUser.status}`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Your account status (${waitlistUser.status}) does not allow signup. Please contact support.`,
        },
        details: {
          action: 'CONTACT_SUPPORT',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Success: User is approved for early access
    console.log(`[EARLY ACCESS] Access granted for ${normalizedEmail} - Status: ${waitlistUser.status}`);
    // ============================================

    let user = await userService.getUserByEmail(input.email);

    if (!user) {
      user = await userService.createUser({
        email: input.email,
        username: input.email.split('@')[0],
        firebaseUid: input.firebaseUid,
        displayName: input.displayName,
      });
    } else if (!user.firebaseUid) {
      user = await userService.updateProfile((user._id as any).toString(), {
        displayName: input.displayName,
      });
    }

    this.sendSuccess(res, {
      message: 'Linked',
      user: {
        id: (user._id as any).toString(),
        email: user.email,
        displayName: user.displayName,
        isOnboarded: user.isOnboarded,
      },
    });
  });

  // Check if email already exists (for pre-signup validation)
  checkEmailExists = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, any, ParsedQs>,
    res: Response
  ) => {
    const email = req.query.email as string | undefined;

    if (!email) {
      return this.sendError(res, new ValidationError('Email is required'));
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return this.sendError(res, new ValidationError('Invalid email format'));
    }

    const existingUser = await storage.getUserByEmail(trimmedEmail);

    if (existingUser && existingUser.isEmailVerified && existingUser.isOnboarded) {
      // User fully exists - should sign in
      return this.sendSuccess(res, {
        exists: true,
        shouldSignIn: true,
        message: 'An account with this email already exists. Please sign in instead.'
      });
    }

    if (existingUser && existingUser.isEmailVerified && !existingUser.isOnboarded) {
      // User verified but not onboarded - can continue signup
      return this.sendSuccess(res, {
        exists: false,
        partialUser: true,
        message: 'Email is verified but onboarding is incomplete. You can continue setup.'
      });
    }

    if (existingUser && !existingUser.isEmailVerified) {
      // Unverified user - can resend verification
      return this.sendSuccess(res, {
        exists: false,
        unverified: true,
        message: 'Email is registered but not verified. A new verification code will be sent.'
      });
    }

    // No user found
    this.sendSuccess(res, {
      exists: false,
      message: 'Email is available'
    });
  });

  recordLogin = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      return this.sendError(res, new ValidationError('User not authenticated'));
    }

    const user = await userService.recordLogin(userId);
    this.sendSuccess(res, {
      dailyLoginStreak: user.dailyLoginStreak,
      lastLoginAt: user.lastLoginAt,
    });
  });

  getSession = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      return this.sendSuccess(res, { authenticated: false });
    }

    try {
      const user = await userService.getUserById(userId);
      this.sendSuccess(res, {
        authenticated: true,
        user: {
          id: (user._id as any).toString(),
          email: user.email,
          displayName: user.displayName,
          isOnboarded: user.isOnboarded,
          plan: user.plan,
        },
      });
    } catch {
      this.sendSuccess(res, { authenticated: false });
    }
  });

  associateUid = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return this.sendError(res, new ValidationError('No token provided'));
    }

    const token = authHeader.split(' ')[1];

    const adminApp = getFirebaseAdmin();
    if (!adminApp) {
      return res.status(500).json({
        success: false,
        error: 'Firebase Admin not initialized',
      });
    }

    let decoded: any;
    try {
      decoded = await adminApp.auth().verifyIdToken(token);
    } catch (error) {
      console.error('[AUTH] Firebase token verification failed:', error);
      return this.sendError(res, new ValidationError('Invalid or expired token'));
    }

    const uid = decoded.uid || decoded.user_id || decoded.sub;
    const email = decoded.email;

    if (!uid || !email) {
      return this.sendError(res, new ValidationError('Missing uid or email'));
    }

    const existingByUid = await storage.getUserByFirebaseUid(uid);
    if (existingByUid && existingByUid.email !== email) {
      return this.sendError(res, new ConflictError('UID already associated with another account'));
    }

    let user = await storage.getUserByEmail(email);
    if (!user) {
      return this.sendError(res, new NotFoundError('User', email));
    }

    user = await storage.updateUser(user.id, { firebaseUid: uid });
    const workspaces = await storage.getWorkspacesByUserId(user.id);

    let workspaceCreated: any = null;
    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      workspaceCreated = await storage.createWorkspace({
        name: 'My Workspace',
        userId: user.id,
        isDefault: true
      });
    }

    this.sendSuccess(res, {
      user,
      workspaceCreated,
      workspaces
    });
  });

  sendVerification = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, z.infer<typeof SendVerificationSchema>>,
    res: Response
  ) => {
    const input = SendVerificationSchema.parse(req.body);
    const { email, firstName } = input;

    console.log(`[OPEN SIGNUP] User ${email} signup allowed, proceeding with verification email`);

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser && existingUser.isEmailVerified && existingUser.isOnboarded) {
      return this.sendError(res, new ConflictError('User already exists and is fully set up. Please sign in instead.'));
    }

    if (existingUser && existingUser.isEmailVerified && !existingUser.isOnboarded) {
      console.log(`[EMAIL VERIFICATION] User ${email} is verified but not onboarded - allowing to proceed`);
    }

    const otp = emailService.generateOTP();
    const otpExpiry = emailService.generateExpiry();

    if (existingUser) {
      await storage.updateUserEmailVerification(existingUser.id, otp, otpExpiry);
    } else {
      await storage.createUnverifiedUser({
        email,
        firstName: firstName || '',
        emailVerificationCode: otp,
        emailVerificationExpiry: otpExpiry,
        isEmailVerified: false
      });
    }

    // P1 SECURITY: Store OTP in Redis for fast access and expiry
    try {
      const redis = getRedisClient();
      await redis.setex(`otp:${email}`, 900, otp); // 15 minutes TTL
      console.log(`[REDIS] Cached OTP for ${email}`);
    } catch (redisError) {
      console.warn('[REDIS] Failed to cache OTP:', redisError);
    }

    await emailService.sendVerificationEmail(email, otp, firstName);

    console.log(`[EMAIL VERIFICATION] Sent verification email to ${email} with OTP: ${otp}`);

    this.sendSuccess(res, {
      message: 'Verification email sent successfully',
      developmentOtp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  });

  sendVerificationEmail = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, z.infer<typeof SendVerificationSchema>>,
    res: Response
  ) => {
    const input = SendVerificationSchema.parse(req.body);
    const { email, firstName } = input;
    const normalizedEmail = email.trim().toLowerCase();

    // ============================================
    // PRE-OTP EARLY ACCESS VALIDATION
    // Check before sending OTP to give immediate feedback
    // ============================================
    const { waitlistUserRepository } = await import('../repositories/WaitlistUserRepository');
    const waitlistUser = await waitlistUserRepository.findByEmail(normalizedEmail);

    // Scenario 1: User is not on waitlist at all
    if (!waitlistUser) {
      console.log(`[EARLY ACCESS] Signup denied for ${normalizedEmail} - Not on waitlist`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'NOT_ON_WAITLIST',
          message: 'This email is not on our waitlist. Please join the waitlist first to get early access.',
        },
        details: {
          action: 'JOIN_WAITLIST',
          hasWaitlistEntry: false,
          waitlistStatus: null
        }
      });
    }

    // Scenario 2: User is on waitlist but pending approval
    if (waitlistUser.status === 'pending' || waitlistUser.status === 'waitlisted') {
      console.log(`[EARLY ACCESS] Signup denied for ${normalizedEmail} - Status: ${waitlistUser.status} (pending approval)`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'PENDING_APPROVAL',
          message: 'Your waitlist application is pending approval. We will notify you via email when you are approved for early access.',
        },
        details: {
          action: 'WAIT_FOR_APPROVAL',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Scenario 3: User application was rejected
    if (waitlistUser.status === 'rejected') {
      console.log(`[EARLY ACCESS] Signup denied for ${normalizedEmail} - Status: rejected`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_REJECTED',
          message: 'Your application was not approved at this time. Please contact support for more information.',
        },
        details: {
          action: 'CONTACT_SUPPORT',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Scenario 4: User has invalid/unknown status
    if (waitlistUser.status !== 'early_access') {
      console.log(`[EARLY ACCESS] Signup denied for ${normalizedEmail} - Invalid status: ${waitlistUser.status}`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Your account status (${waitlistUser.status}) does not allow signup. Please contact support.`,
        },
        details: {
          action: 'CONTACT_SUPPORT',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Success: User is approved for early access - proceed with OTP
    console.log(`[EARLY ACCESS] Access granted for ${normalizedEmail} - Proceeding with verification email`);
    // ============================================

    console.log(`[OPEN SIGNUP] User ${email} signup allowed, proceeding with verification email`);

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser && existingUser.isEmailVerified && existingUser.isOnboarded) {
      return this.sendError(res, new ConflictError('User already exists and is fully set up. Please sign in instead.'));
    }

    if (existingUser && existingUser.isEmailVerified && !existingUser.isOnboarded) {
      console.log(`[EMAIL VERIFICATION] User ${email} is verified but not onboarded - allowing to proceed`);
    }

    const otp = emailService.generateOTP();
    const otpExpiry = emailService.generateExpiry();

    if (existingUser) {
      await storage.updateUserEmailVerification(existingUser.id, otp, otpExpiry);
    } else {
      await storage.createUnverifiedUser({
        email,
        firstName: firstName || '',
        emailVerificationCode: otp,
        emailVerificationExpiry: otpExpiry,
        isEmailVerified: false
      });
    }

    // P1 SECURITY: Store OTP in Redis for fast access and expiry
    try {
      const redis = getRedisClient();
      await redis.setex(`otp:${email}`, 900, otp); // 15 minutes TTL
      console.log(`[REDIS] Cached OTP for ${email}`);
    } catch (redisError) {
      console.warn('[REDIS] Failed to cache OTP:', redisError);
    }


    const emailSent = await emailService.sendVerificationEmail(email, otp, firstName);

    if (!emailSent) {
      console.error('[EMAIL] Failed to send verification email to:', email);
      return this.sendError(res, new Error('Failed to send verification email'));
    }

    console.log(`[EMAIL] Verification email sent to ${email} with OTP: ${otp} `);

    this.sendSuccess(res, {
      message: 'Verification email sent successfully',
      email: email,
      developmentOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  });

  verifyEmail = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, z.infer<typeof VerifyEmailSchema>>,
    res: Response
  ) => {
    const input = VerifyEmailSchema.parse(req.body);
    const { email, code } = input;

    console.log(`[EMAIL VERIFICATION] Attempting to verify ${email} with code ${code}`);

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return this.sendError(res, new NotFoundError('User', email));
    }

    if (user.isEmailVerified && user.isOnboarded) {
      return this.sendError(res, new ConflictError('Account is already fully set up. Please sign in instead.'));
    }

    if (user.isEmailVerified && !user.isOnboarded) {
      console.log(`[EMAIL VERIFICATION] User ${email} is verified but not onboarded - proceeding to onboarding`);
      return this.sendSuccess(res, {
        message: 'Email verified successfully',
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          isEmailVerified: true,
          isOnboarded: false
        },
        requiresOnboarding: true
      });
    }

    let isValidOtp = false;

    // Check Redis first
    try {
      const redis = getRedisClient();
      const cachedOtp = await redis.get(`otp:${email}`);
      if (cachedOtp === code) {
        isValidOtp = true;
        await redis.del(`otp:${email}`); // Invalidate after use
      }
    } catch (e) {
      console.warn('[REDIS] OTP check failed, falling back to DB');
    }

    // Fallback to DB check
    if (!isValidOtp) {
      if (user.emailVerificationCode === code) {
        if (user.emailVerificationExpiry && new Date() > user.emailVerificationExpiry) {
          return this.sendError(res, new ValidationError('Verification code has expired'));
        }
        isValidOtp = true;
      }
    }

    if (!isValidOtp) {
      console.log(`[EMAIL VERIFICATION] Invalid code. Expected: ${user.emailVerificationCode}, Got: ${code}`);
      return this.sendError(res, new ValidationError('Invalid verification code'));
    }

    const updatedUser = await storage.updateUser(user.id, {
      isEmailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiry: null
    });

    try {
      await emailService.sendWelcomeEmail(email, user.displayName || 'User');
    } catch (emailError) {
      console.error('[EMAIL] Failed to send welcome email:', emailError);
    }

    console.log(`[EMAIL VERIFICATION] User ${email} successfully verified`);

    this.sendSuccess(res, {
      message: 'Email verified successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        isEmailVerified: true,
        isOnboarded: false
      },
      requiresOnboarding: true
    });
  });

  resendVerification = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, z.infer<typeof ResendVerificationSchema>>,
    res: Response
  ) => {
    const input = ResendVerificationSchema.parse(req.body);
    const { email } = input;

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return this.sendError(res, new NotFoundError('User', email));
    }

    if (user.isEmailVerified && user.isOnboarded) {
      return this.sendError(res, new ConflictError('Account is already fully set up. Please sign in instead.'));
    }

    const otp = emailService.generateOTP();
    const otpExpiry = emailService.generateExpiry();

    await storage.updateUserEmailVerification(user.id, otp, otpExpiry);

    // P1 SECURITY: Store OTP in Redis
    try {
      const redis = getRedisClient();
      await redis.setex(`otp:${email} `, 900, otp);
    } catch (redisError) {
      console.warn('[REDIS] Failed to cache OTP:', redisError);
    }

    const emailSent = await emailService.sendVerificationEmail(email, otp, user.displayName || 'User');

    if (!emailSent) {
      return this.sendError(res, new Error('Failed to send verification email'));
    }

    console.log(`[EMAIL] Resent verification email to ${email} with new OTP: ${otp} `);

    this.sendSuccess(res, {
      message: 'Verification email resent successfully'
    });
  });

  // Check early access eligibility (called before creating Firebase user)
  checkEarlyAccess = this.wrapAsync(async (
    req: TypedRequest<ParamsDictionary, { email: string }>,
    res: Response
  ) => {
    const { email } = req.body;
    
    if (!email) {
      return this.sendError(res, new ValidationError('Email is required'));
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ============================================
    // EARLY ACCESS VALIDATION CHECK
    // ============================================
    const { waitlistUserRepository } = await import('../repositories/WaitlistUserRepository');
    const waitlistUser = await waitlistUserRepository.findByEmail(normalizedEmail);

    // Scenario 1: User is not on waitlist at all
    if (!waitlistUser) {
      console.log(`[EARLY ACCESS] Pre-check failed for ${normalizedEmail} - Not on waitlist`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'NOT_ON_WAITLIST',
          message: 'This email is not on our waitlist. Please join the waitlist first to get early access.',
        },
        details: {
          action: 'JOIN_WAITLIST',
          hasWaitlistEntry: false,
          waitlistStatus: null
        }
      });
    }

    // Scenario 2: User is on waitlist but pending approval
    if (waitlistUser.status === 'pending' || waitlistUser.status === 'waitlisted') {
      console.log(`[EARLY ACCESS] Pre-check failed for ${normalizedEmail} - Status: ${waitlistUser.status} (pending approval)`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'PENDING_APPROVAL',
          message: 'Your waitlist application is pending approval. We will notify you via email when you are approved for early access.',
        },
        details: {
          action: 'WAIT_FOR_APPROVAL',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Scenario 3: User application was rejected
    if (waitlistUser.status === 'rejected') {
      console.log(`[EARLY ACCESS] Pre-check failed for ${normalizedEmail} - Status: rejected`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_REJECTED',
          message: 'Your application was not approved at this time. Please contact support for more information.',
        },
        details: {
          action: 'CONTACT_SUPPORT',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Scenario 4: User has invalid/unknown status
    if (waitlistUser.status !== 'early_access') {
      console.log(`[EARLY ACCESS] Pre-check failed for ${normalizedEmail} - Invalid status: ${waitlistUser.status}`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Your account status (${waitlistUser.status}) does not allow signup. Please contact support.`,
        },
        details: {
          action: 'CONTACT_SUPPORT',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        }
      });
    }

    // Success: User is approved for early access
    console.log(`[EARLY ACCESS] Pre-check passed for ${normalizedEmail} - Status: ${waitlistUser.status}`);
    this.sendSuccess(res, {
      message: 'Early access check passed',
      status: waitlistUser.status
    });
  });
}

export const authController = new AuthController();
