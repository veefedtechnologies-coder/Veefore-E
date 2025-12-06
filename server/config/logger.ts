import pino from 'pino';
import { env } from './env';

const isProduction = process.env.NODE_ENV === 'production';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({}),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  redact: {
    paths: [
      'accessToken',
      'refreshToken',
      'encryptedAccessToken',
      'encryptedRefreshToken',
      'password',
      'secret',
      'token',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

export type LogContext = {
  component?: string;
  workspaceId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
};

export const logger = {
  trace: (msg: string, context?: LogContext) => {
    pinoLogger.trace(context || {}, msg);
  },

  debug: (msg: string, context?: LogContext) => {
    pinoLogger.debug(context || {}, msg);
  },

  info: (msg: string, context?: LogContext) => {
    pinoLogger.info(context || {}, msg);
  },

  warn: (msg: string, context?: LogContext) => {
    pinoLogger.warn(context || {}, msg);
  },

  error: (msg: string, error?: Error | unknown, context?: LogContext) => {
    if (error instanceof Error) {
      pinoLogger.error({ ...context, err: error }, msg);
    } else {
      pinoLogger.error({ ...context, error }, msg);
    }
  },

  fatal: (msg: string, error?: Error | unknown, context?: LogContext) => {
    if (error instanceof Error) {
      pinoLogger.fatal({ ...context, err: error }, msg);
    } else {
      pinoLogger.fatal({ ...context, error }, msg);
    }
  },

  child: (bindings: LogContext) => {
    const childLogger = pinoLogger.child(bindings);
    return {
      trace: (msg: string, context?: LogContext) => childLogger.trace(context || {}, msg),
      debug: (msg: string, context?: LogContext) => childLogger.debug(context || {}, msg),
      info: (msg: string, context?: LogContext) => childLogger.info(context || {}, msg),
      warn: (msg: string, context?: LogContext) => childLogger.warn(context || {}, msg),
      error: (msg: string, error?: Error | unknown, context?: LogContext) => {
        if (error instanceof Error) {
          childLogger.error({ ...context, err: error }, msg);
        } else {
          childLogger.error({ ...context, error }, msg);
        }
      },
    };
  },

  request: (method: string, path: string, statusCode: number, durationMs: number, context?: LogContext) => {
    pinoLogger.info({ ...context, method, path, statusCode, durationMs }, 'HTTP request');
  },

  api: {
    call: (endpoint: string, success: boolean, durationMs: number, context?: LogContext) => {
      pinoLogger.info({ ...context, endpoint, success, durationMs }, 'API call');
    },
    error: (endpoint: string, error: Error | unknown, context?: LogContext) => {
      if (error instanceof Error) {
        pinoLogger.error({ ...context, endpoint, err: error }, 'API error');
      } else {
        pinoLogger.error({ ...context, endpoint, error }, 'API error');
      }
    },
  },

  db: {
    query: (operation: string, collection: string, durationMs: number, context?: LogContext) => {
      pinoLogger.debug({ ...context, operation, collection, durationMs }, 'Database query');
    },
    error: (operation: string, error: Error | unknown, context?: LogContext) => {
      if (error instanceof Error) {
        pinoLogger.error({ ...context, operation, err: error }, 'Database error');
      } else {
        pinoLogger.error({ ...context, operation, error }, 'Database error');
      }
    },
  },

  auth: {
    login: (userId: string, method: string, success: boolean, context?: LogContext) => {
      pinoLogger.info({ ...context, userId, method, success }, success ? 'User login successful' : 'User login failed');
    },
    logout: (userId: string, context?: LogContext) => {
      pinoLogger.info({ ...context, userId }, 'User logged out');
    },
    tokenRefresh: (userId: string, success: boolean, context?: LogContext) => {
      pinoLogger.info({ ...context, userId, success }, 'Token refresh');
    },
  },

  instagram: {
    sync: (accountId: string, success: boolean, durationMs: number, context?: LogContext) => {
      pinoLogger.info({ ...context, accountId, success, durationMs }, 'Instagram sync');
    },
    webhook: (eventType: string, accountId: string, context?: LogContext) => {
      pinoLogger.info({ ...context, eventType, accountId }, 'Instagram webhook received');
    },
    rateLimit: (accountId: string, retryAfter?: number, context?: LogContext) => {
      pinoLogger.warn({ ...context, accountId, retryAfter }, 'Instagram rate limit hit');
    },
  },

  ai: {
    generate: (model: string, tokensUsed: number, durationMs: number, context?: LogContext) => {
      pinoLogger.info({ ...context, model, tokensUsed, durationMs }, 'AI content generation');
    },
    error: (model: string, error: Error | unknown, context?: LogContext) => {
      if (error instanceof Error) {
        pinoLogger.error({ ...context, model, err: error }, 'AI generation error');
      } else {
        pinoLogger.error({ ...context, model, error }, 'AI generation error');
      }
    },
  },

  scheduler: {
    jobQueued: (jobType: string, jobId: string, context?: LogContext) => {
      pinoLogger.debug({ ...context, jobType, jobId }, 'Job queued');
    },
    jobProcessed: (jobType: string, jobId: string, success: boolean, durationMs: number, context?: LogContext) => {
      pinoLogger.info({ ...context, jobType, jobId, success, durationMs }, 'Job processed');
    },
    jobFailed: (jobType: string, jobId: string, error: Error | unknown, context?: LogContext) => {
      if (error instanceof Error) {
        pinoLogger.error({ ...context, jobType, jobId, err: error }, 'Job failed');
      } else {
        pinoLogger.error({ ...context, jobType, jobId, error }, 'Job failed');
      }
    },
  },

  startup: (component: string, status: 'starting' | 'ready' | 'failed', context?: LogContext) => {
    if (status === 'failed') {
      pinoLogger.error({ ...context, component, status }, `${component} startup failed`);
    } else {
      pinoLogger.info({ ...context, component, status }, `${component} ${status}`);
    }
  },

  shutdown: (component: string, context?: LogContext) => {
    pinoLogger.info({ ...context, component }, `${component} shutting down`);
  },
};

export default logger;
