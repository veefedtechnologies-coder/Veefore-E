import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError, ValidationError } from '../errors';
import { logger } from '../config/logger';
import { isProduction } from '../config/env';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    const response: any = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err instanceof ValidationError && err.errors) {
      response.error.errors = err.errors;
    }

    if (!isProduction()) {
      response.error.stack = err.stack;
    }

    logger.warn('Operational error', {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });

    return res.status(err.statusCode).json(response);
  }

  logger.error('Unhandled error', err, {
    path: req.path,
    method: req.method,
    body: req.body,
  });

  const response: any = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction() ? 'An unexpected error occurred' : err.message,
    },
  };

  if (!isProduction()) {
    response.error.stack = err.stack;
  }

  return res.status(500).json(response);
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default errorHandler;
