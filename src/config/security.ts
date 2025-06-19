import crypto from 'crypto';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const execAsync = promisify(execCallback);

/**
 * Security utilities for the MCP server
 * Following WCGW principles - assume everything is malicious
 */
export class SecurityManager {
  private static readonly ALLOWED_PATH_REGEX = /^[a-zA-Z0-9\-_.\/]+$/;
  private static readonly MAX_PATH_LENGTH = 1024;
  private static readonly COMMAND_TIMEOUT = 30000; // 30 seconds
  
  /**
   * Sanitize file paths to prevent directory traversal
   */
  static sanitizePath(inputPath: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('Invalid path input');
    }
    
    // Remove any null bytes
    let cleanPath = inputPath.replace(/\0/g, '');
    
    // Normalize the path
    cleanPath = cleanPath.replace(/\\/g, '/');
    
    // Remove any .. sequences
    cleanPath = cleanPath.replace(/\.\./g, '');
    
    // Ensure path doesn't start with /
    if (cleanPath.startsWith('/') && !cleanPath.startsWith('/Users')) {
      throw new Error('Absolute paths outside user directory not allowed');
    }
    
    // Check length
    if (cleanPath.length > this.MAX_PATH_LENGTH) {
      throw new Error('Path too long');
    }
    
    return cleanPath;
  }
  
  /**
   * Sanitize command inputs to prevent injection
   */
  static sanitizeCommand(command: string): string {
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command input');
    }
    
    // Remove dangerous characters
    const dangerous = /[;&|`$(){}[\]<>]/g;
    return command.replace(dangerous, '');
  }
  
  /**
   * Execute command with timeout and resource limits
   */
  static async executeSecureCommand(
    command: string, 
    options: { 
      timeout?: number; 
      maxBuffer?: number;
      cwd?: string;
    } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const timeout = options.timeout || this.COMMAND_TIMEOUT;
    const maxBuffer = options.maxBuffer || 10 * 1024 * 1024; // 10MB
    
    // Create abort controller for timeout
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), timeout);
    
    try {
      const result = await execAsync(command, {
        signal: ac.signal,
        maxBuffer,
        cwd: options.cwd,
        env: {
          ...process.env,
          // Restrict environment
          PATH: '/usr/local/bin:/usr/bin:/bin',
          NODE_ENV: 'production'
        }
      });
      
      clearTimeout(timeoutId);
      return result;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Command timed out after ${timeout}ms`);
      }
      
      throw new Error(`Command execution failed: ${error.message}`);
    }
  }
  
  /**
   * Validate input against schema
   */
  static validateInput(input: any, schema: any): void {
    // This would integrate with a proper validation library
    // For now, basic type checking
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid input format');
    }
  }
  
  /**
   * Generate secure random tokens
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
  
  /**
   * Hash sensitive data
   */
  static async hashData(data: string): Promise<string> {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Encrypt sensitive configuration
   */
  static encrypt(text: string, key: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc', 
      Buffer.from(key, 'hex'), 
      iv
    );
    
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }
  
  /**
   * Decrypt sensitive configuration
   */
  static decrypt(text: string, key: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc', 
      Buffer.from(key, 'hex'), 
      iv
    );
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  }
}

// Rate limiting implementation
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  
  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    // Clean up old entries periodically
    setInterval(() => this.cleanup(), windowMs);
  }
  
  /**
   * Check if request should be allowed
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Filter out old requests
    const recentRequests = requests.filter(
      time => now - time < this.windowMs
    );
    
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }
    
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
    
    return true;
  }
  
  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [identifier, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(
        time => now - time < this.windowMs
      );
      
      if (recentRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, recentRequests);
      }
    }
  }
}
