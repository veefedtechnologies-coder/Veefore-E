import fs from 'fs';
import path from 'path';

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

// Log entry interface
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  workspaceId?: string;
  userId?: string;
  instagramAccountId?: string;
  component: string;
  message: string;
  metadata?: any;
  error?: Error;
}

// Logger configuration
interface LoggerConfig {
  logLevel: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDirectory: string;
  maxFileSize: number; // in bytes
  maxFiles: number;
  includeWorkspaceInLogs: boolean;
}

export class Logger {
  private static config: LoggerConfig = {
    logLevel: LogLevel.INFO, // Default to INFO to reduce console noise (was DEBUG)
    enableConsole: true,
    enableFile: true,
    logDirectory: path.join(process.cwd(), 'logs'),
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    includeWorkspaceInLogs: true,
  };

  private static logCounts: Map<string, number> = new Map();

  /**
   * Initialize logger with custom configuration
   */
  static configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };

    // Ensure log directory exists
    if (this.config.enableFile) {
      this.ensureLogDirectory();
    }

    console.log('📝 Logger initialized with config:', this.config);
  }

  /**
   * Log error with workspace context
   */
  static error(
    component: string,
    message: string,
    metadata?: any,
    workspaceId?: string,
    userId?: string,
    instagramAccountId?: string
  ): void {
    this.log({
      timestamp: new Date(),
      level: LogLevel.ERROR,
      workspaceId,
      userId,
      instagramAccountId,
      component,
      message,
      metadata,
    });
  }

  /**
   * Log warning with workspace context
   */
  static warn(
    component: string,
    message: string,
    metadata?: any,
    workspaceId?: string,
    userId?: string,
    instagramAccountId?: string
  ): void {
    this.log({
      timestamp: new Date(),
      level: LogLevel.WARN,
      workspaceId,
      userId,
      instagramAccountId,
      component,
      message,
      metadata,
    });
  }

  /**
   * Log info with workspace context
   */
  static info(
    component: string,
    message: string,
    metadata?: any,
    workspaceId?: string,
    userId?: string,
    instagramAccountId?: string
  ): void {
    this.log({
      timestamp: new Date(),
      level: LogLevel.INFO,
      workspaceId,
      userId,
      instagramAccountId,
      component,
      message,
      metadata,
    });
  }

  /**
   * Log debug with workspace context
   */
  static debug(
    component: string,
    message: string,
    metadata?: any,
    workspaceId?: string,
    userId?: string,
    instagramAccountId?: string
  ): void {
    if (this.config.logLevel >= LogLevel.DEBUG) {
      this.log({
        timestamp: new Date(),
        level: LogLevel.DEBUG,
        workspaceId,
        userId,
        instagramAccountId,
        component,
        message,
        metadata,
      });
    }
  }

  /**
   * Log Instagram API errors with rate limiting context
   */
  static apiError(
    workspaceId: string,
    instagramAccountId: string,
    error: any,
    apiEndpoint: string,
    retryCount: number = 0
  ): void {
    this.error(
      'InstagramAPI',
      `API error for account ${instagramAccountId}`,
      {
        endpoint: apiEndpoint,
        error: error.message || error,
        code: error.code,
        type: error.type,
        retryCount,
        isRateLimit: error.is_rate_limit || false,
        retryAfter: error.retry_after,
      },
      workspaceId,
      undefined,
      instagramAccountId
    );
  }

  /**
   * Log metrics fetch operations
   */
  static metricsFetch(
    workspaceId: string,
    instagramAccountId: string,
    metricsType: string,
    success: boolean,
    duration: number,
    metadata?: any
  ): void {
    this.info(
      'MetricsFetch',
      `Metrics fetch ${success ? 'succeeded' : 'failed'} for ${instagramAccountId}`,
      {
        metricsType,
        duration,
        success,
        ...metadata,
      },
      workspaceId,
      undefined,
      instagramAccountId
    );
  }

  /**
   * Log webhook events
   */
  static webhookEvent(
    workspaceId: string,
    instagramAccountId: string,
    eventType: string,
    processed: boolean,
    metadata?: any
  ): void {
    this.info(
      'Webhook',
      `Webhook ${eventType} ${processed ? 'processed' : 'failed'} for ${instagramAccountId}`,
      {
        eventType,
        processed,
        ...metadata,
      },
      workspaceId,
      undefined,
      instagramAccountId
    );
  }

  /**
   * Log token operations
   */
  static tokenOperation(
    workspaceId: string,
    userId: string,
    operation: 'refresh' | 'rotate' | 'validate' | 'add' | 'remove',
    success: boolean,
    metadata?: any
  ): void {
    this.info(
      'TokenManager',
      `Token ${operation} ${success ? 'succeeded' : 'failed'} for user ${userId}`,
      {
        operation,
        success,
        ...metadata,
      },
      workspaceId,
      userId
    );
  }

  /**
   * Log rate limiting events
   */
  static rateLimitEvent(
    workspaceId: string,
    instagramAccountId: string,
    rateLimitType: 'hit' | 'reset' | 'warning',
    retryAfter?: number,
    metadata?: any
  ): void {
    this.warn(
      'RateLimit',
      `Rate limit ${rateLimitType} for account ${instagramAccountId}`,
      {
        rateLimitType,
        retryAfter,
        ...metadata,
      },
      workspaceId,
      undefined,
      instagramAccountId
    );
  }

  /**
   * Log queue operations
   */
  static queueOperation(
    operation: 'enqueue' | 'process' | 'complete' | 'fail' | 'retry',
    jobType: string,
    jobId: string,
    workspaceId?: string,
    metadata?: any
  ): void {
    this.debug(
      'Queue',
      `Job ${operation}: ${jobType} (${jobId})`,
      {
        operation,
        jobType,
        jobId,
        ...metadata,
      },
      workspaceId
    );
  }

  /**
   * Core logging method
   */
  private static log(entry: LogEntry): void {
    // Check if we should log this level
    if (entry.level > this.config.logLevel) {
      return;
    }

    // Increment log count for analytics
    const component = entry.component;
    this.logCounts.set(component, (this.logCounts.get(component) || 0) + 1);

    // Console logging
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // File logging
    if (this.config.enableFile) {
      this.logToFile(entry);
    }
  }

  /**
   * Log to console with colors and formatting
   */
  private static logToConsole(entry: LogEntry): void {
    const levelColors = {
      [LogLevel.ERROR]: '\x1b[31m',   // Red
      [LogLevel.WARN]: '\x1b[33m',    // Yellow
      [LogLevel.INFO]: '\x1b[32m',    // Green
      [LogLevel.DEBUG]: '\x1b[36m',   // Cyan
      [LogLevel.TRACE]: '\x1b[37m',   // White
    };

    const levelNames = {
      [LogLevel.ERROR]: 'ERROR',
      [LogLevel.WARN]: 'WARN ',
      [LogLevel.INFO]: 'INFO ',
      [LogLevel.DEBUG]: 'DEBUG',
      [LogLevel.TRACE]: 'TRACE',
    };

    const color = levelColors[entry.level];
    const levelName = levelNames[entry.level];
    const timestamp = entry.timestamp.toISOString();
    const reset = '\x1b[0m';

    // Build context string
    const contextParts = [];
    if (entry.workspaceId) contextParts.push(`ws:${entry.workspaceId}`);
    if (entry.userId) contextParts.push(`user:${entry.userId}`);
    if (entry.instagramAccountId) contextParts.push(`ig:${entry.instagramAccountId}`);

    const context = contextParts.length > 0 ? `[${contextParts.join('|')}]` : '';

    // Format message
    let message = `${color}[${timestamp}] ${levelName} ${entry.component}${reset} ${context} ${entry.message}`;

    // Add metadata if present
    if (entry.metadata) {
      message += `\n  ${JSON.stringify(entry.metadata, null, 2)}`;
    }

    // Add error if present
    if (entry.error) {
      message += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack && entry.level <= LogLevel.WARN) {
        message += `\n  Stack: ${entry.error.stack}`;
      }
    }

    console.log(message);
  }

  /**
   * Log to file with rotation
   */
  private static logToFile(entry: LogEntry): void {
    try {
      const logFileName = this.getLogFileName(entry);
      const logFilePath = path.join(this.config.logDirectory, logFileName);

      // Check file size and rotate if needed
      this.rotateLogFileIfNeeded(logFilePath);

      // Format log entry for file
      const logLine = this.formatLogEntryForFile(entry);

      // Append to file
      fs.appendFileSync(logFilePath, logLine + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Get log file name based on entry
   */
  private static getLogFileName(entry: LogEntry): string {
    const date = entry.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD

    if (this.config.includeWorkspaceInLogs && entry.workspaceId) {
      return `metrics-${entry.workspaceId}-${date}.log`;
    }

    return `metrics-${date}.log`;
  }

  /**
   * Format log entry for file output
   */
  private static formatLogEntryForFile(entry: LogEntry): string {
    const levelNames = {
      [LogLevel.ERROR]: 'ERROR',
      [LogLevel.WARN]: 'WARN',
      [LogLevel.INFO]: 'INFO',
      [LogLevel.DEBUG]: 'DEBUG',
      [LogLevel.TRACE]: 'TRACE',
    };

    const logObject = {
      timestamp: entry.timestamp.toISOString(),
      level: levelNames[entry.level],
      component: entry.component,
      message: entry.message,
      ...(entry.workspaceId && { workspaceId: entry.workspaceId }),
      ...(entry.userId && { userId: entry.userId }),
      ...(entry.instagramAccountId && { instagramAccountId: entry.instagramAccountId }),
      ...(entry.metadata && { metadata: entry.metadata }),
      ...(entry.error && {
        error: {
          message: entry.error.message,
          stack: entry.error.stack
        }
      }),
    };

    return JSON.stringify(logObject);
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private static rotateLogFileIfNeeded(logFilePath: string): void {
    try {
      if (!fs.existsSync(logFilePath)) {
        return;
      }

      const stats = fs.statSync(logFilePath);
      if (stats.size >= this.config.maxFileSize) {
        // Rotate logs
        const ext = path.extname(logFilePath);
        const baseName = path.basename(logFilePath, ext);
        const dir = path.dirname(logFilePath);

        // Shift existing rotated files
        for (let i = this.config.maxFiles - 1; i > 0; i--) {
          const oldFile = path.join(dir, `${baseName}.${i}${ext}`);
          const newFile = path.join(dir, `${baseName}.${i + 1}${ext}`);

          if (fs.existsSync(oldFile)) {
            if (i === this.config.maxFiles - 1) {
              fs.unlinkSync(oldFile); // Delete oldest
            } else {
              fs.renameSync(oldFile, newFile);
            }
          }
        }

        // Move current file to .1
        fs.renameSync(logFilePath, path.join(dir, `${baseName}.1${ext}`));
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Ensure log directory exists
   */
  private static ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.config.logDirectory)) {
        fs.mkdirSync(this.config.logDirectory, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  /**
   * Get log statistics
   */
  static getStats(): {
    totalLogs: number;
    logsByComponent: Record<string, number>;
    configuredLevel: string;
    logDirectory: string;
  } {
    const levelNames = {
      [LogLevel.ERROR]: 'ERROR',
      [LogLevel.WARN]: 'WARN',
      [LogLevel.INFO]: 'INFO',
      [LogLevel.DEBUG]: 'DEBUG',
      [LogLevel.TRACE]: 'TRACE',
    };

    const totalLogs = Array.from(this.logCounts.values()).reduce((sum, count) => sum + count, 0);

    return {
      totalLogs,
      logsByComponent: Object.fromEntries(this.logCounts),
      configuredLevel: levelNames[this.config.logLevel],
      logDirectory: this.config.logDirectory,
    };
  }

  /**
   * Clear log statistics
   */
  static clearStats(): void {
    this.logCounts.clear();
  }
}

// Initialize logger on module load
Logger.configure({});

export default Logger;