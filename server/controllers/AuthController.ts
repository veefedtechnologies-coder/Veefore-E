import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { userService, workspaceService } from '../services';
import { ValidationError, ConflictError, NotFoundError } from '../errors';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { storage } from '../mongodb-storage';
import { emailService } from '../email-service';
import { firebaseAdmin } from '../firebase-admin';
import { safeParseJWTPayload } from '../middleware/unsafe-json-replacements';

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

export class AuthController extends BaseController {
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
    let decoded: any = null;
    
    if (firebaseAdmin) {
      try {
        decoded = await firebaseAdmin.auth().verifyIdToken(token);
      } catch {
      }
    }
    
    if (!decoded) {
      const parts = token.split('.');
      const payloadResult = safeParseJWTPayload(parts[1]);
      if (!payloadResult.success) {
        return this.sendError(res, new ValidationError('Invalid token'));
      }
      decoded = payloadResult.data;
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

    const emailSent = await emailService.sendVerificationEmail(email, otp, firstName);
    
    if (!emailSent) {
      console.error('[EMAIL] Failed to send verification email to:', email);
      return this.sendError(res, new Error('Failed to send verification email'));
    }

    console.log(`[EMAIL] Verification email sent to ${email} with OTP: ${otp}`);
    
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

    if (user.emailVerificationCode !== code) {
      console.log(`[EMAIL VERIFICATION] Invalid code. Expected: ${user.emailVerificationCode}, Got: ${code}`);
      return this.sendError(res, new ValidationError('Invalid verification code'));
    }

    if (user.emailVerificationExpiry && new Date() > user.emailVerificationExpiry) {
      return this.sendError(res, new ValidationError('Verification code has expired'));
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

    const emailSent = await emailService.sendVerificationEmail(email, otp, user.firstName);
    
    if (!emailSent) {
      return this.sendError(res, new Error('Failed to send verification email'));
    }

    console.log(`[EMAIL] Resent verification email to ${email} with new OTP: ${otp}`);
    
    this.sendSuccess(res, { 
      message: 'Verification email resent successfully' 
    });
  });
}

export const authController = new AuthController();
