import { Request } from 'express';

// Extend Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: {
        id?: string;
        uid?: string;
        email?: string;
        name?: string;
        displayName?: string;
        plan?: string;
        credits?: number;
        workspaceId?: string;
        firebaseUid?: string;
        isOnboarded?: boolean;
        isEmailVerified?: boolean;
        [key: string]: any;
      };
      cookies?: Record<string, string>;
      session?: {
        id?: string;
        userId?: string;
        [key: string]: any;
      };
      workspace?: {
        id: string;
        name: string;
        ownerId: string;
        [key: string]: any;
      };
      workspaceId?: string;
      admin?: {
        id: string;
        email: string;
        role: string;
        [key: string]: any;
      };
      correlationId?: string;
      rawBody?: string | Buffer;
      sessionAffinityId?: string;
      rateLimit?: {
        resetTime: number;
        limit: number;
        remaining: number;
      };
      validation?: Record<string, any>;
      secretsAudit?: {
        missing: string[];
        present: string[];
        warnings: string[];
        recommendations: string[];
      };
      requiredFeature?: string;
      requiredCredits?: number;
      body: {
        interests?: string[];
        contentType?: string;
        industry?: string;
        [key: string]: any;
      };
    }
  }
}

// Specific request interfaces for different middleware
export interface AuthenticatedRequest extends Request {
    user: {
      uid: string;
      email?: string;
      displayName?: string;
      id: string; // Database user ID - always present after authentication
      isOnboarded?: boolean;
      firebaseUid?: string;
      plan?: string;
      credits?: number;
      workspaceId?: string;
      [key: string]: any;
    };
    body: {
      interests?: string[];
      contentType?: string;
      industry?: string;
      [key: string]: any;
    };
  }

export interface WorkspaceRequest extends AuthenticatedRequest {
  workspace: {
    id: string;
    name: string;
    ownerId: string;
    [key: string]: any;
  };
  workspaceId: string;
}

export interface AdminRequest extends Request {
  admin: {
    id: string;
    email: string;
    role: string;
    [key: string]: any;
  };
}

export interface FeatureRequest extends AuthenticatedRequest {
  requiredFeature?: string;
  requiredCredits?: number;
}

export interface UploadRequest extends AuthenticatedRequest {
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
  file?: Express.Multer.File;
}