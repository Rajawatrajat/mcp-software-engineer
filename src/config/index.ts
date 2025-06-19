import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';
import { SecurityManager } from './security.js';

// Load environment variables
dotenv.config();

/**
 * Configuration management with fail-safe defaults
 * Following WCGW: Assume config can be missing, malformed, or malicious
 */
export class Config {
  private static instance: Config;
  private config: Map<string, any> = new Map();
  private encryptionKey: string;
  
  private constructor() {
    this.encryptionKey = process.env.CONFIG_ENCRYPTION_KEY || 
      SecurityManager.generateSecureToken(32);
    this.loadConfiguration();
  }
  
  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }
  
  private loadConfiguration(): void {
    // Load from environment with validation
    this.config.set('NODE_ENV', process.env.NODE_ENV || 'production');
    this.config.set('PORT', this.validatePort(process.env.PORT));
    this.config.set('LOG_LEVEL', process.env.LOG_LEVEL || 'info');
    
    // Security settings
    this.config.set('JWT_SECRET', process.env.JWT_SECRET || 
      SecurityManager.generateSecureToken(64));
    this.config.set('SESSION_SECRET', process.env.SESSION_SECRET || 
      SecurityManager.generateSecureToken(64));
    
    // Database settings (encrypted)
    if (process.env.DATABASE_URL) {
      this.config.set('DATABASE_URL', 
        SecurityManager.encrypt(process.env.DATABASE_URL, this.encryptionKey));
    }
    
    // Rate limiting
    this.config.set('RATE_LIMIT_WINDOW_MS', 
      parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10));
    this.config.set('RATE_LIMIT_MAX_REQUESTS', 
      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10));
    
    // Resource limits
    this.config.set('MAX_FILE_SIZE', 
      parseInt(process.env.MAX_FILE_SIZE || '10485760', 10)); // 10MB
    this.config.set('MAX_MEMORY_MB', 
      parseInt(process.env.MAX_MEMORY_MB || '512', 10));
    this.config.set('COMMAND_TIMEOUT_MS', 
      parseInt(process.env.COMMAND_TIMEOUT_MS || '30000', 10));
    
    // Paths
    this.config.set('WORKSPACE_ROOT', 
      process.env.WORKSPACE_ROOT || path.join(process.env.HOME || '', 'mcp-workspace'));
    this.config.set('LOG_DIR', 
      process.env.LOG_DIR || path.join(process.cwd(), 'logs'));
    this.config.set('TEMP_DIR', 
      process.env.TEMP_DIR || path.join(process.cwd(), 'temp'));
  }
  
  private validatePort(port?: string): number {
    const parsed = parseInt(port || '3000', 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      return 3000;
    }
    return parsed;
  }
  
  get<T>(key: string): T {
    if (!this.config.has(key)) {
      throw new Error(`Configuration key '${key}' not found`);
    }
    
    const value = this.config.get(key);
    
    // Decrypt if it's a sensitive value
    if (key.includes('DATABASE_URL') && typeof value === 'string') {
      return SecurityManager.decrypt(value, this.encryptionKey) as T;
    }
    
    return value as T;
  }
  
  getString(key: string, defaultValue?: string): string {
    try {
      return this.get<string>(key);
    } catch {
      return defaultValue || '';
    }
  }
  
  getNumber(key: string, defaultValue?: number): number {
    try {
      return this.get<number>(key);
    } catch {
      return defaultValue || 0;
    }
  }
  
  getBoolean(key: string, defaultValue?: boolean): boolean {
    try {
      const value = this.get<string | boolean>(key);
      if (typeof value === 'boolean') return value;
      return value === 'true' || value === '1';
    } catch {
      return defaultValue || false;
    }
  }
  
  /**
   * Validate all required configurations exist
   */
  validate(): void {
    const required = [
      'NODE_ENV',
      'JWT_SECRET',
      'SESSION_SECRET',
      'WORKSPACE_ROOT'
    ];
    
    const missing = required.filter(key => !this.config.has(key));
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
  }
  
  /**
   * Get safe configuration for logging (no secrets)
   */
  getSafeConfig(): Record<string, any> {
    const safe: Record<string, any> = {};
    
    const secrets = ['JWT_SECRET', 'SESSION_SECRET', 'DATABASE_URL', 
                    'API_KEY', 'ENCRYPTION_KEY'];
    
    for (const [key, value] of this.config.entries()) {
      if (secrets.some(secret => key.includes(secret))) {
        safe[key] = '[REDACTED]';
      } else {
        safe[key] = value;
      }
    }
    
    return safe;
  }
}

// Export singleton instance
export const config = Config.getInstance();

// Validate on startup
try {
  config.validate();
} catch (error) {
  console.error('Configuration validation failed:', error);
  process.exit(1);
}
