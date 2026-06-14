/**
 * Shared typed error classes for the Veefore-E server.
 *
 * All error classes extend `AppError` so that centralized error-handling
 * middleware can distinguish operational errors from unexpected programming
 * bugs and respond with correct HTTP status codes.
 *
 * ### Usage
 *
 * ```typescript
 * import {
 *   AppError,
 *   ValidationError,
 *   AuthenticationError,
 *   NotFoundError,
 *   ExternalServiceError,
 * } from '@/shared/errors';
 * ```
 *
 * ### Error hierarchy
 *
 * ```
 * Error
 * └── AppError                      (base – operational error)
 *     ├── ValidationError           (400 – invalid client input)
 *     ├── AuthenticationError       (401 – unauthenticated / bad token)
 *     ├── NotFoundError             (404 – resource does not exist)
 *     └── ExternalServiceError      (502 – downstream service failure)
 * ```
 *
 * @module shared/errors
 */

export { AppError } from './AppError.js';
export { ValidationError } from './ValidationError.js';
export { AuthenticationError } from './AuthenticationError.js';
export type { AuthFailureReason } from './AuthenticationError.js';
export { NotFoundError } from './NotFoundError.js';
export { ExternalServiceError } from './ExternalServiceError.js';
export type { ExternalServiceFailureType } from './ExternalServiceError.js';
