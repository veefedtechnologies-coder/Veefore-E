import { Request } from 'express';

// Extend Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string;
        plan?: string;
        credits?: number;
        workspaceId?: string;
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
      id?: number; // Database user ID when populated from storage
      isOnboarded?: boolean;
    };
    body: {
      interests?: string[];
      contentType?: string;
      industry?: string;
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