/**
 * Custom error types for better error handling and recovery
 * Following WCGW: Specific errors for specific failures
 */

export class BaseError extends Error {
  public readonly isOperational: boolean;
  public readonly statusCode: number;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;
  
  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    this.context = context;
    
    Error.captureStackTrace(this, this.constructor);
  }
  
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

export class ValidationError extends BaseError {
  public readonly field?: string;
  public readonly value?: any;
  
  constructor(message: string, field?: string, value?: any) {
    super(message, 400, true, { field, value });
    this.field = field;
    this.value = value;
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, true);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string = 'Access denied') {
    super(message, 403, true);
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, true, { resource, identifier });
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, true, context);
  }
}

export class RateLimitError extends BaseError {
  public readonly retryAfter: number;
  
  constructor(retryAfter: number) {
    super('Rate limit exceeded', 429, true);
    this.retryAfter = retryAfter;
  }
}

export class ResourceExhaustedError extends BaseError {
  public readonly resourceType: string;
  public readonly limit: number;
  public readonly current: number;
  
  constructor(resourceType: string, limit: number, current: number) {
    super(
      `Resource limit exceeded for ${resourceType}: ${current}/${limit}`,
      503,
      true,
      { resourceType, limit, current }
    );
    this.resourceType = resourceType;
    this.limit = limit;
    this.current = current;
  }
}

export class TimeoutError extends BaseError {
  public readonly operation: string;
  public readonly timeoutMs: number;
  
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      504,
      true,
      { operation, timeoutMs }
    );
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class ExternalServiceError extends BaseError {
  public readonly service: string;
  public readonly originalError?: any;
  
  constructor(service: string, message: string, originalError?: any) {
    super(
      `External service error (${service}): ${message}`,
      502,
      true,
      { service, originalError }
    );
    this.service = service;
    this.originalError = originalError;
  }
}

export class DatabaseError extends BaseError {
  public readonly query?: string;
  public readonly params?: any[];
  
  constructor(message: string, query?: string, params?: any[]) {
    super(message, 500, false, { query, params });
    this.query = query;
    this.params = params;
  }
}

/**
 * Error handler with recovery strategies
 */
export class ErrorHandler {
  private static retryStrategies = new Map<string, number>([
    ['TimeoutError', 3],
    ['ExternalServiceError', 2],
    ['DatabaseError', 1]
  ]);
  
  /**
   * Handle error with appropriate recovery
   */
  static async handle(
    error: Error,
    context?: Record<string, any>
  ): Promise<void> {
    // Log the error
    const { logger } = await import('./logger.js');
    
    if (error instanceof BaseError) {
      if (error.isOperational) {
        logger.warn('Operational error', error.toJSON());
      } else {
        logger.error('Non-operational error', error, context);
      }
    } else {
      logger.error('Unexpected error', error, context);
    }
    
    // Log error for monitoring
    // Skip emitting events to avoid type conflicts
  }
  
  /**
   * Wrap async function with error handling
   */
  static wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context?: string
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        await ErrorHandler.handle(error as Error, { context, args });
        throw error;
      }
    }) as T;
  }
  
  /**
   * Retry operation with exponential backoff
   */
  static async retry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      initialDelay?: number;
      maxDelay?: number;
      factor?: number;
      onRetry?: (error: Error, attempt: number) => void;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelay = 100,
      maxDelay = 5000,
      factor = 2,
      onRetry
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        // Check if error is retryable
        const shouldRetry = this.shouldRetry(lastError);
        if (!shouldRetry) {
          throw lastError;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelay * Math.pow(factor, attempt - 1),
          maxDelay
        );
        
        if (onRetry) {
          onRetry(lastError, attempt);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
  
  /**
   * Determine if error should be retried
   */
  private static shouldRetry(error: Error): boolean {
    // Network errors
    if (error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND')) {
      return true;
    }
    
    // Specific error types
    if (error instanceof TimeoutError ||
        error instanceof ExternalServiceError) {
      return true;
    }
    
    // Database errors (only some)
    if (error instanceof DatabaseError) {
      return error.message.includes('deadlock') ||
             error.message.includes('timeout') ||
             error.message.includes('connection');
    }
    
    return false;
  }
  
  /**
   * Circuit breaker pattern
   */
  static createCircuitBreaker<T>(
    fn: (...args: any[]) => Promise<T>,
    options: {
      threshold?: number;
      timeout?: number;
      resetTimeout?: number;
    } = {}
  ): (...args: any[]) => Promise<T> {
    const {
      threshold = 5,
      timeout = 60000,
      resetTimeout = 30000
    } = options;
    
    let failures = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';
    
    return async (...args: any[]): Promise<T> => {
      // Check if circuit should be reset
      if (state === 'open' && 
          Date.now() - lastFailureTime > resetTimeout) {
        state = 'half-open';
        failures = 0;
      }
      
      // If circuit is open, fail fast
      if (state === 'open') {
        throw new Error('Circuit breaker is open');
      }
      
      try {
        const result = await Promise.race([
          fn(...args),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new TimeoutError('Circuit breaker timeout', timeout)), timeout)
          )
        ]);
        
        // Success - reset failures
        if (state === 'half-open') {
          state = 'closed';
        }
        failures = 0;
        
        return result;
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();
        
        if (failures >= threshold) {
          state = 'open';
        }
        
        throw error;
      }
    };
  }
}

/**
 * Global error handlers
 */
export function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    ErrorHandler.handle(error, { type: 'uncaughtException' });
    
    // Graceful shutdown
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    ErrorHandler.handle(
      new Error(`Unhandled rejection: ${reason}`),
      { type: 'unhandledRejection', promise }
    );
  });
}
