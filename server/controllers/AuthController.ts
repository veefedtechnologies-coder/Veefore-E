import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { userService } from '../services';
import { ValidationError } from '../errors';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

const LinkFirebaseSchema = z.object({
  email: z.string().email(),
  firebaseUid: z.string().min(1),
  displayName: z.string().optional(),
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
}

export const authController = new AuthController();
