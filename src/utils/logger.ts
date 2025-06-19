import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';
import { config } from '../config/index.js';

/**
 * Structured logging with context and error tracking
 * Following WCGW: Always log enough context to debug issues
 */
class Logger {
  private logger: winston.Logger;
  private requestId?: string;
  private userId?: string;
  private metadata: Record<string, any> = {};
  
  constructor() {
    // Ensure log directory exists
    const logDir = config.getString('LOG_DIR', 'logs');
    fs.ensureDirSync(logDir);
    
    // Create winston logger with multiple transports
    this.logger = winston.createLogger({
      level: config.getString('LOG_LEVEL', 'info'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        service: 'mcp-software-engineer',
        version: '1.0.0',
        environment: config.getString('NODE_ENV', 'production')
      },
      transports: [
        // Error log file
        new winston.transports.File({ 
          filename: path.join(logDir, 'error.log'), 
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        }),
        // Combined log file
        new winston.transports.File({ 
          filename: path.join(logDir, 'combined.log'),
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10
        }),
        // Audit log for security events
        new winston.transports.File({
          filename: path.join(logDir, 'audit.log'),
          level: 'info',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 30,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format.prettyPrint()
          )
        })
      ]
    });
    
    // Console output for development
    if (config.getString('NODE_ENV') !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }
  
  /**
   * Set request context for all subsequent logs
   */
  setContext(context: { requestId?: string; userId?: string; [key: string]: any }): void {
    if (context.requestId) this.requestId = context.requestId;
    if (context.userId) this.userId = context.userId;
    
    // Store other metadata
    const { requestId, userId, ...rest } = context;
    this.metadata = { ...this.metadata, ...rest };
  }
  
  /**
   * Clear context (e.g., at end of request)
   */
  clearContext(): void {
    this.requestId = undefined;
    this.userId = undefined;
    this.metadata = {};
  }
  
  /**
   * Format log entry with context
   */
  private formatEntry(level: string, message: string, meta?: any): any {
    const entry: any = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.metadata
    };
    
    if (this.requestId) entry.requestId = this.requestId;
    if (this.userId) entry.userId = this.userId;
    
    if (meta) {
      if (meta instanceof Error) {
        entry.error = {
          name: meta.name,
          message: meta.message,
          stack: meta.stack
        };
      } else {
        entry.metadata = meta;
      }
    }
    
    return entry;
  }
  
  debug(message: string, meta?: any): void {
    this.logger.debug(this.formatEntry('debug', message, meta));
  }
  
  info(message: string, meta?: any): void {
    this.logger.info(this.formatEntry('info', message, meta));
  }
  
  warn(message: string, meta?: any): void {
    this.logger.warn(this.formatEntry('warn', message, meta));
  }
  
  error(message: string, error?: Error | any, meta?: any): void {
    const entry = this.formatEntry('error', message, meta);
    if (error) {
      entry.error = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error;
    }
    this.logger.error(entry);
  }
  
  /**
   * Log security-related events
   */
  security(event: string, details: any): void {
    this.logger.info(this.formatEntry('security', event, {
      securityEvent: true,
      ...details
    }));
  }
  
  /**
   * Log performance metrics
   */
  metric(name: string, value: number, unit: string = 'ms', tags?: Record<string, any>): void {
    this.logger.info(this.formatEntry('metric', `Performance metric: ${name}`, {
      metric: true,
      metricName: name,
      value,
      unit,
      tags
    }));
  }
  
  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const child = new Logger();
    child.setContext({ ...this.metadata, ...context });
    return child;
  }
  
  /**
   * Measure and log execution time
   */
  async measureTime<T>(
    operation: string, 
    fn: () => Promise<T>,
    meta?: any
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.metric(operation, duration, 'ms', meta);
      
      if (duration > 1000) {
        this.warn(`Slow operation detected: ${operation}`, {
          duration,
          ...meta
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.error(`Operation failed: ${operation}`, error, {
        duration,
        ...meta
      });
      
      throw error;
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Log uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', reason, { promise });
});

// Log process lifecycle events
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
});
