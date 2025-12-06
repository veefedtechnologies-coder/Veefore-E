import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { AppError } from '../errors';
import { logger } from '../config/logger';

export interface TypedRequest<
  P extends ParamsDictionary = ParamsDictionary,
  B = any,
  Q extends ParsedQs = ParsedQs
> extends Request<P, any, B, Q> {
  user?: {
    id: string;
    firebaseUid?: string;
    email?: string;
    workspaceId?: string;
    [key: string]: any;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    errors?: Record<string, string[]>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export abstract class BaseController {
  protected sendSuccess<T>(
    res: Response,
    data: T,
    statusCode: number = 200,
    message?: string
  ): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
    };
    res.status(statusCode).json(response);
  }

  protected sendPaginated<T>(
    res: Response,
    data: T[],
    meta: { page: number; limit: number; total: number; totalPages: number }
  ): void {
    const response: ApiResponse<T[]> = {
      success: true,
      data,
      meta,
    };
    res.status(200).json(response);
  }

  protected sendError(
    res: Response,
    error: AppError | Error,
    defaultMessage: string = 'An error occurred'
  ): void {
    if (error instanceof AppError) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      };

      if ('errors' in error && error.errors) {
        response.error!.errors = error.errors as Record<string, string[]>;
      }

      res.status(error.statusCode).json(response);
    } else {
      logger.error('Unhandled error in controller', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: defaultMessage,
        },
      });
    }
  }

  protected sendCreated<T>(res: Response, data: T, message?: string): void {
    this.sendSuccess(res, data, 201, message);
  }

  protected sendNoContent(res: Response): void {
    res.status(204).send();
  }

  protected wrapAsync<
    P extends ParamsDictionary = ParamsDictionary,
    B = any,
    Q extends ParsedQs = ParsedQs
  >(
    fn: (req: TypedRequest<P, B, Q>, res: Response, next: NextFunction) => Promise<void>
  ): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req as TypedRequest<P, B, Q>, res, next)).catch(next);
    };
  }
}

export default BaseController;
