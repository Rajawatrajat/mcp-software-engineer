import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { ErrorHandler, ValidationError, TimeoutError } from '../utils/errors.js';
import { SecurityManager, RateLimiter } from '../config/security.js';
import { resourceManager } from '../utils/resource-manager.js';
import { config } from '../config/index.js';

/**
 * Base class for all MCP tools with built-in safety features
 * Following WCGW: Every tool must validate, sanitize, and handle errors
 */
export abstract class BaseTool<TInput = any, TOutput = any> {
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchema: any;
  
  protected rateLimiter: RateLimiter;
  protected readonly timeout: number;
  
  constructor(options: {
    name: string;
    description: string;
    inputSchema: any;
    rateLimit?: { windowMs?: number; maxRequests?: number };
    timeout?: number;
  }) {
    this.name = options.name;
    this.description = options.description;
    this.inputSchema = options.inputSchema;
    this.timeout = options.timeout || config.getNumber('COMMAND_TIMEOUT_MS', 30000);
    
    // Setup rate limiting per tool
    this.rateLimiter = new RateLimiter(
      options.rateLimit?.windowMs || 60000,
      options.rateLimit?.maxRequests || 100
    );
  }
  
  /**
   * Execute the tool with full safety checks
   */
  async execute(args: TInput): Promise<TOutput> {
    const executionId = uuidv4();
    const startTime = Date.now();
    
    // Set logging context
    logger.setContext({
      toolName: this.name,
      executionId
    });
    
    try {
      // Rate limiting
      if (!this.rateLimiter.isAllowed(this.name)) {
        throw new Error(`Rate limit exceeded for tool: ${this.name}`);
      }
      
      // Input validation
      const validatedInput = await this.validateInput(args);
      
      // Log execution start
      logger.info(`Executing tool: ${this.name}`, {
        input: this.sanitizeForLogging(validatedInput)
      });
      
      // Execute with timeout
      const result = await this.executeWithTimeout(
        () => this.executeInternal(validatedInput),
        this.timeout
      );
      
      // Validate output
      const validatedOutput = await this.validateOutput(result);
      
      // Log success
      const duration = Date.now() - startTime;
      logger.info(`Tool execution completed: ${this.name}`, {
        duration,
        success: true
      });
      
      logger.metric(`tool.${this.name}.execution_time`, duration);
      
      return validatedOutput;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log failure
      logger.error(`Tool execution failed: ${this.name}`, error as Error, {
        duration,
        input: this.sanitizeForLogging(args)
      });
      
      logger.metric(`tool.${this.name}.error`, 1, 'count', {
        errorType: (error as Error).name
      });
      
      // Re-throw with context
      if (error instanceof Error) {
        error.message = `[${this.name}] ${error.message}`;
      }
      
      throw error;
      
    } finally {
      // Clear logging context
      logger.clearContext();
    }
  }
  
  /**
   * Internal execution logic to be implemented by subclasses
   */
  protected abstract executeInternal(input: TInput): Promise<TOutput>;
  
  /**
   * Validate input against schema
   */
  protected async validateInput(input: any): Promise<TInput> {
    try {
      // Use Zod if schema is provided
      if (this.getZodSchema) {
        const schema = this.getZodSchema();
        return schema.parse(input);
      }
      
      // Basic validation
      if (!input || typeof input !== 'object') {
        throw new ValidationError('Input must be an object');
      }
      
      // Check required fields from inputSchema
      if (this.inputSchema.required) {
        for (const field of this.inputSchema.required) {
          if (!(field in input)) {
            throw new ValidationError(`Missing required field: ${field}`, field);
          }
        }
      }
      
      return input as TInput;
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        throw new ValidationError(
          firstError.message,
          firstError.path.join('.'),
          firstError
        );
      }
      throw error;
    }
  }
  
  /**
   * Optional Zod schema for validation
   */
  protected getZodSchema?(): z.ZodSchema<TInput>;
  
  /**
   * Validate output
   */
  protected async validateOutput(output: any): Promise<TOutput> {
    // Override in subclasses for output validation
    return output as TOutput;
  }
  
  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(this.name, timeoutMs));
      }, timeoutMs);
      
      // Register timer for cleanup
      resourceManager.registerTimer(`timeout_${this.name}_${Date.now()}`, timer);
    });
    
    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      // Cleanup will happen in resource manager
    }
  }
  
  /**
   * Sanitize input for logging (remove sensitive data)
   */
  protected sanitizeForLogging(input: any): any {
    if (!input || typeof input !== 'object') {
      return input;
    }
    
    const sanitized = { ...input };
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'authorization',
      'api_key', 'apiKey', 'access_token', 'accessToken',
      'connectionString', 'database_url', 'databaseUrl'
    ];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
      
      // Check nested fields
      const fieldLower = field.toLowerCase();
      for (const key of Object.keys(sanitized)) {
        if (key.toLowerCase().includes(fieldLower)) {
          sanitized[key] = '[REDACTED]';
        }
      }
    }
    
    return sanitized;
  }
  
  /**
   * Helper for secure command execution
   */
  protected async executeCommand(
    command: string,
    options?: { cwd?: string; timeout?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    return await SecurityManager.executeSecureCommand(command, {
      timeout: options?.timeout || this.timeout,
      cwd: options?.cwd
    });
  }
  
  /**
   * Helper for secure file path handling
   */
  protected sanitizePath(path: string): string {
    return SecurityManager.sanitizePath(path);
  }
  
  /**
   * Helper for retry logic
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    options?: {
      maxAttempts?: number;
      retryMessage?: string;
    }
  ): Promise<T> {
    return await ErrorHandler.retry(operation, {
      maxAttempts: options?.maxAttempts || 3,
      onRetry: (error, attempt) => {
        logger.warn(options?.retryMessage || 'Retrying operation', {
          toolName: this.name,
          attempt,
          error: error.message
        });
      }
    });
  }
  
  /**
   * Helper for circuit breaker pattern
   */
  protected createCircuitBreaker<T>(
    operation: (...args: any[]) => Promise<T>
  ): (...args: any[]) => Promise<T> {
    return ErrorHandler.createCircuitBreaker(operation, {
      threshold: 5,
      timeout: this.timeout,
      resetTimeout: 30000
    });
  }
}

/**
 * Base class for tools that work with files
 */
export abstract class FileBasedTool<TInput = any, TOutput = any> extends BaseTool<TInput, TOutput> {
  protected readonly maxFileSize: number;
  
  constructor(options: any) {
    super(options);
    this.maxFileSize = config.getNumber('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB
  }
  
  /**
   * Check file size before operations
   */
  protected async checkFileSize(path: string): Promise<void> {
    const fs = await import('fs-extra');
    const stats = await fs.stat(path);
    
    if (stats.size > this.maxFileSize) {
      throw new ValidationError(
        `File size ${stats.size} exceeds maximum allowed size ${this.maxFileSize}`,
        'fileSize',
        stats.size
      );
    }
  }
  
  /**
   * Read file with size check
   */
  protected async readFileSecure(path: string): Promise<string> {
    const sanitizedPath = this.sanitizePath(path);
    await this.checkFileSize(sanitizedPath);
    
    const fs = await import('fs-extra');
    return await fs.readFile(sanitizedPath, 'utf-8');
  }
  
  /**
   * Write file with backup
   */
  protected async writeFileSecure(
    path: string, 
    content: string,
    options?: { backup?: boolean }
  ): Promise<void> {
    const sanitizedPath = this.sanitizePath(path);
    const fs = await import('fs-extra');
    
    // Create backup if file exists
    if (options?.backup !== false && await fs.pathExists(sanitizedPath)) {
      const backupPath = `${sanitizedPath}.backup.${Date.now()}`;
      await fs.copy(sanitizedPath, backupPath);
      logger.info('Created file backup', { original: sanitizedPath, backup: backupPath });
    }
    
    // Ensure directory exists
    await fs.ensureDir(await import('path').then(p => p.dirname(sanitizedPath)));
    
    // Write file
    await fs.writeFile(sanitizedPath, content, 'utf-8');
  }
}

/**
 * Base class for tools that work with databases
 */
export abstract class DatabaseTool<TInput = any, TOutput = any> extends BaseTool<TInput, TOutput> {
  protected connectionPool?: any;
  
  /**
   * Get database connection from pool
   */
  protected async getConnection(): Promise<{ id: string; connection: any }> {
    if (!this.connectionPool) {
      throw new Error('Database connection pool not initialized');
    }
    
    return await this.connectionPool.acquire();
  }
  
  /**
   * Release database connection back to pool
   */
  protected async releaseConnection(id: string): Promise<void> {
    if (this.connectionPool) {
      await this.connectionPool.release(id);
    }
  }
  
  /**
   * Execute database operation with connection management
   */
  protected async withConnection<T>(
    operation: (connection: any) => Promise<T>
  ): Promise<T> {
    const { id, connection } = await this.getConnection();
    
    try {
      return await operation(connection);
    } finally {
      await this.releaseConnection(id);
    }
  }
  
  /**
   * Execute query with parameterized statements
   */
  protected async executeQuery(
    query: string,
    params: any[] = []
  ): Promise<any> {
    // This should be overridden by specific database implementations
    throw new Error('executeQuery must be implemented by subclass');
  }
}
