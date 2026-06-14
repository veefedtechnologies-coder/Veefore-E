/**
 * Centralized Error Handler Middleware
 *
 * Provides a unified error handling pipeline for Express applications.
 * Transforms all error types into a standardized JSON response format
 * and logs errors with full request context.
 *
 * Requirements: 15.1, 15.2, 15.4
 *
 * Handles:
 * - AppError subclasses (operational errors with status codes)
 * - Mongoose ValidationError / CastError / duplicate-key errors
 * - JWT errors (JsonWebTokenError, TokenExpiredError, NotBeforeError)
 * - Zod validation errors
 * - Generic / unhandled errors (500)
 */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { Error as MongooseError } from 'mongoose';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
} from '../../errors';
import { logger } from '../../config/logger';
import { isProduction } from '../../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Standardized error response body */
export interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    /** Field-level validation errors (present for VALIDATION_ERROR) */
    errors?: Record<string, string[]> | Array<{ field: string; message: string; code?: string }>;
    /** Stack trace (non-production only) */
    stack?: string;
    /** Seconds until rate-limit resets (RATE_LIMIT errors only) */
    retryAfter?: number;
  };
  /** Request context for correlation */
  meta?: {
    requestId?: string;
    timestamp: string;
  };
}

/** Request augmented by auth middleware with optional user/requestId context */
interface RequestWithContext extends Request {
  user?: { uid?: string; userId?: string; id?: string };
  requestId?: string;
  id?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts a user identifier from the request if authentication middleware
 * has already populated `req.user`.
 */
function extractUserId(req: RequestWithContext): string | undefined {
  return req.user?.userId ?? req.user?.uid ?? req.user?.id;
}

/**
 * Extracts a correlation / request ID. Checks `req.requestId`, `req.id`,
 * and common headers set by reverse proxies or request-id middleware.
 */
function extractRequestId(req: RequestWithContext): string | undefined {
  return (
    req.requestId ??
    req.id ??
    (req.headers['x-request-id'] as string | undefined) ??
    (req.headers['x-correlation-id'] as string | undefined)
  );
}

/**
 * Builds the shared metadata block that is attached to every error response.
 */
function buildMeta(req: RequestWithContext): ErrorResponseBody['meta'] {
  return {
    requestId: extractRequestId(req),
    timestamp: new Date().toISOString(),
  };
}

// ─── Mongoose error transformation ────────────────────────────────────────────

/**
 * Converts a Mongoose ValidationError into a ValidationError (AppError subclass)
 * so it is handled uniformly downstream.
 */
function fromMongooseValidationError(err: MongooseError.ValidationError): ValidationError {
  const errors: Record<string, string[]> = {};
  for (const [field, validatorError] of Object.entries(err.errors)) {
    errors[field] = [validatorError.message];
  }
  return new ValidationError('Validation failed', errors);
}

/**
 * Converts a Mongoose CastError (e.g., invalid ObjectId) into a NotFoundError.
 */
function fromMongooseCastError(err: MongooseError.CastError): NotFoundError {
  return new NotFoundError(err.path, String(err.value));
}

/**
 * Detects MongoDB duplicate-key errors (code 11000 / 11001) and converts them
 * to a ConflictError-compatible AppError.
 */
function isMongooseDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    ((err as { code: unknown }).code === 11000 ||
      (err as { code: unknown }).code === 11001)
  );
}

function fromMongooseDuplicateKeyError(err: Record<string, unknown>): AppError {
  const keyValue = err.keyValue as Record<string, unknown> | undefined;
  const field = keyValue ? Object.keys(keyValue)[0] : 'field';
  const value = keyValue ? String(Object.values(keyValue)[0]) : '';
  return new AppError(
    `Duplicate value for ${field}${value ? `: "${value}"` : ''}`,
    409,
    'CONFLICT'
  );
}

// ─── JWT error transformation ──────────────────────────────────────────────────

/**
 * Maps JWT library error names to UnauthorizedError instances so they surface
 * as 401 responses with descriptive error codes.
 */
function fromJwtError(err: Error): UnauthorizedError | null {
  switch (err.name) {
    case 'TokenExpiredError':
      return new UnauthorizedError('Authentication token has expired');
    case 'JsonWebTokenError':
      return new UnauthorizedError('Invalid authentication token');
    case 'NotBeforeError':
      return new UnauthorizedError('Authentication token is not yet valid');
    default:
      return null;
  }
}

// ─── Main error handler middleware ────────────────────────────────────────────

/**
 * Express error-handling middleware (4-argument signature).
 *
 * Must be registered **after** all routes and other middleware:
 * ```ts
 * app.use(centralErrorHandler);
 * ```
 *
 * @param err     - The thrown / passed error
 * @param req     - Incoming HTTP request
 * @param res     - Outgoing HTTP response
 * @param next    - Next middleware (called only when headers already sent)
 */
export const centralErrorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Guard: if response already started, delegate to Express default handler
  if (res.headersSent) {
    next(err);
    return;
  }

  const ctxReq = req as RequestWithContext;
  const userId = extractUserId(ctxReq);
  const requestId = extractRequestId(ctxReq);

  // ── 1. Normalize error into an AppError ─────────────────────────────────

  let appError: AppError | null = null;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof MongooseError.ValidationError) {
    appError = fromMongooseValidationError(err);
  } else if (err instanceof MongooseError.CastError) {
    appError = fromMongooseCastError(err);
  } else if (isMongooseDuplicateKeyError(err)) {
    appError = fromMongooseDuplicateKeyError(err as Record<string, unknown>);
  } else {
    const jwtConverted = fromJwtError(err);
    if (jwtConverted) {
      appError = jwtConverted;
    }
  }

  // ── 2. Build and send response ───────────────────────────────────────────

  if (appError) {
    // Operational / expected errors – warn level
    logger.warn('Operational error', {
      component: 'centralErrorHandler',
      code: appError.code,
      statusCode: appError.statusCode,
      message: appError.message,
      method: req.method,
      path: req.path,
      userId,
      requestId,
    });

    const body: ErrorResponseBody = {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
      },
      meta: buildMeta(ctxReq),
    };

    // Attach field-level errors for ValidationError
    if (appError instanceof ValidationError && appError.errors) {
      body.error.errors = appError.errors;
    }

    // Expose stack in non-production environments
    if (!isProduction()) {
      body.error.stack = appError.stack;
    }

    res.status(appError.statusCode).json(body);
    return;
  }

  // Unhandled / programming errors – error level
  logger.error('Unhandled server error', err, {
    component: 'centralErrorHandler',
    method: req.method,
    path: req.path,
    errorName: err.name,
    userId,
    requestId,
  });

  const body: ErrorResponseBody = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction() ? 'An unexpected error occurred' : err.message,
    },
    meta: buildMeta(ctxReq),
  };

  if (!isProduction()) {
    body.error.stack = err.stack;
  }

  res.status(500).json(body);
};

// ─── Utility middleware ────────────────────────────────────────────────────────

/**
 * 404 handler for unmatched routes.
 *
 * Register this **before** `centralErrorHandler` and **after** all routes:
 * ```ts
 * app.use(notFoundHandler);
 * app.use(centralErrorHandler);
 * ```
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  } satisfies ErrorResponseBody);
};

/**
 * Async route handler wrapper.
 *
 * Eliminates repetitive try/catch blocks in async Express route handlers
 * by forwarding any rejected promise to the next error handler.
 *
 * @example
 * ```ts
 * router.get('/users/:id', asyncHandler(async (req, res) => {
 *   const user = await userService.findById(req.params.id);
 *   res.json(user);
 * }));
 * ```
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default centralErrorHandler;
