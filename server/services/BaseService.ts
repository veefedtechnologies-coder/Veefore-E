import { logger } from '../config/logger';

export abstract class BaseService {
  protected readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  protected log(method: string, message: string, meta?: Record<string, any>): void {
    logger.info(`[${this.serviceName}] ${method}: ${message}`, meta);
  }

  protected logError(method: string, error: Error, meta?: Record<string, any>): void {
    const isValidationError = error.name === 'ValidationError';
    
    logger.error(`[${this.serviceName}] ${method}: ${error.message}`, {
      ...meta,
      error: {
        name: error.name,
        message: error.message,
        // Omit giant stack traces for expected validation logic to keep terminal clean
        stack: isValidationError ? undefined : error.stack
      }
    });
  }

  protected async withErrorHandling<T>(
    method: string,
    operation: () => Promise<T>,
    errorMessage?: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logError(method, error as Error);
      throw error;
    }
  }
}
