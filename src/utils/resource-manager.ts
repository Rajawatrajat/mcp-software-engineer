import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { config } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Resource management to prevent memory leaks and resource exhaustion
 * Following WCGW: Track everything, clean up everything
 */
export class ResourceManager extends EventEmitter {
  private static instance: ResourceManager;
  
  // Track all active resources
  private processes: Map<string, ChildProcess> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private connections: Map<string, any> = new Map();
  private fileHandles: Map<string, any> = new Map();
  private memoryUsage: number = 0;
  private readonly maxMemoryMB: number;
  
  // Resource limits
  private readonly limits = {
    maxProcesses: 10,
    maxConnections: 100,
    maxFileHandles: 50,
    maxTimers: 100
  };
  
  private constructor() {
    super();
    this.maxMemoryMB = config.getNumber('MAX_MEMORY_MB', 512);
    
    // Monitor memory usage
    setInterval(() => this.checkMemoryUsage(), 5000);
    
    // Clean up on shutdown
    process.on('beforeExit', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
  }
  
  static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager();
    }
    return ResourceManager.instance;
  }
  
  /**
   * Register a child process
   */
  registerProcess(id: string, process: ChildProcess): void {
    if (this.processes.size >= this.limits.maxProcesses) {
      throw new Error('Maximum number of processes reached');
    }
    
    this.processes.set(id, process);
    logger.debug('Process registered', { id, total: this.processes.size });
    
    // Auto-cleanup when process exits
    process.once('exit', () => {
      this.unregisterProcess(id);
    });
  }
  
  /**
   * Unregister a child process
   */
  unregisterProcess(id: string): void {
    const process = this.processes.get(id);
    if (process) {
      // Ensure process is terminated
      if (!process.killed) {
        process.kill('SIGTERM');
        
        // Force kill after timeout
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      }
      
      this.processes.delete(id);
      logger.debug('Process unregistered', { id, remaining: this.processes.size });
    }
  }
  
  /**
   * Register a timer
   */
  registerTimer(id: string, timer: NodeJS.Timeout): void {
    if (this.timers.size >= this.limits.maxTimers) {
      throw new Error('Maximum number of timers reached');
    }
    
    this.timers.set(id, timer);
  }
  
  /**
   * Unregister and clear a timer
   */
  unregisterTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
  
  /**
   * Register a database connection
   */
  registerConnection(id: string, connection: any): void {
    if (this.connections.size >= this.limits.maxConnections) {
      throw new Error('Maximum number of connections reached');
    }
    
    this.connections.set(id, connection);
    logger.debug('Connection registered', { id, total: this.connections.size });
  }
  
  /**
   * Unregister and close a connection
   */
  async unregisterConnection(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (connection) {
      try {
        // Try different close methods
        if (typeof connection.close === 'function') {
          await connection.close();
        } else if (typeof connection.end === 'function') {
          await connection.end();
        } else if (typeof connection.disconnect === 'function') {
          await connection.disconnect();
        }
      } catch (error) {
        logger.error('Error closing connection', error, { id });
      }
      
      this.connections.delete(id);
      logger.debug('Connection unregistered', { id, remaining: this.connections.size });
    }
  }
  
  /**
   * Register a file handle
   */
  registerFileHandle(id: string, handle: any): void {
    if (this.fileHandles.size >= this.limits.maxFileHandles) {
      throw new Error('Maximum number of file handles reached');
    }
    
    this.fileHandles.set(id, handle);
  }
  
  /**
   * Unregister and close a file handle
   */
  async unregisterFileHandle(id: string): Promise<void> {
    const handle = this.fileHandles.get(id);
    if (handle) {
      try {
        if (typeof handle.close === 'function') {
          await handle.close();
        }
      } catch (error) {
        logger.error('Error closing file handle', error, { id });
      }
      
      this.fileHandles.delete(id);
    }
  }
  
  /**
   * Check memory usage and emit warnings
   */
  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    
    this.memoryUsage = heapUsedMB;
    
    if (heapUsedMB > this.maxMemoryMB * 0.9) {
      logger.error('Critical memory usage', { heapUsedMB, maxMemoryMB: this.maxMemoryMB });
      this.emit('memory-critical', heapUsedMB);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection');
      }
    } else if (heapUsedMB > this.maxMemoryMB * 0.7) {
      logger.warn('High memory usage', { heapUsedMB, maxMemoryMB: this.maxMemoryMB });
      this.emit('memory-warning', heapUsedMB);
    }
  }
  
  /**
   * Get current resource usage
   */
  getUsage(): {
    processes: number;
    connections: number;
    fileHandles: number;
    timers: number;
    memoryMB: number;
  } {
    return {
      processes: this.processes.size,
      connections: this.connections.size,
      fileHandles: this.fileHandles.size,
      timers: this.timers.size,
      memoryMB: this.memoryUsage
    };
  }
  
  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up resources', this.getUsage());
    
    // Kill all processes
    for (const [id, process] of this.processes) {
      try {
        if (!process.killed) {
          process.kill('SIGTERM');
        }
      } catch (error) {
        logger.error('Error killing process', error, { id });
      }
    }
    
    // Clear all timers
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
    }
    
    // Close all connections
    const connectionPromises = Array.from(this.connections.keys()).map(id => 
      this.unregisterConnection(id)
    );
    await Promise.allSettled(connectionPromises);
    
    // Close all file handles
    const filePromises = Array.from(this.fileHandles.keys()).map(id => 
      this.unregisterFileHandle(id)
    );
    await Promise.allSettled(filePromises);
    
    // Clear maps
    this.processes.clear();
    this.timers.clear();
    this.connections.clear();
    this.fileHandles.clear();
    
    logger.info('Resource cleanup completed');
  }
  
  /**
   * Execute function with resource tracking
   */
  async withResource<T>(
    type: 'process' | 'connection' | 'file' | 'timer',
    id: string,
    resource: any,
    fn: () => Promise<T>
  ): Promise<T> {
    // Register resource
    switch (type) {
      case 'process':
        this.registerProcess(id, resource);
        break;
      case 'connection':
        this.registerConnection(id, resource);
        break;
      case 'file':
        this.registerFileHandle(id, resource);
        break;
      case 'timer':
        this.registerTimer(id, resource);
        break;
    }
    
    try {
      return await fn();
    } finally {
      // Cleanup resource
      switch (type) {
        case 'process':
          this.unregisterProcess(id);
          break;
        case 'connection':
          await this.unregisterConnection(id);
          break;
        case 'file':
          await this.unregisterFileHandle(id);
          break;
        case 'timer':
          this.unregisterTimer(id);
          break;
      }
    }
  }
}

// Export singleton instance
export const resourceManager = ResourceManager.getInstance();

// Connection pool implementation
export class ConnectionPool<T> {
  private available: T[] = [];
  private inUse: Map<string, T> = new Map();
  private createFn: () => Promise<T>;
  private destroyFn: (conn: T) => Promise<void>;
  private readonly minSize: number;
  private readonly maxSize: number;
  
  constructor(options: {
    create: () => Promise<T>;
    destroy: (conn: T) => Promise<void>;
    minSize?: number;
    maxSize?: number;
  }) {
    this.createFn = options.create;
    this.destroyFn = options.destroy;
    this.minSize = options.minSize || 2;
    this.maxSize = options.maxSize || 10;
    
    // Initialize minimum connections
    this.initialize();
  }
  
  private async initialize(): Promise<void> {
    const promises = [];
    for (let i = 0; i < this.minSize; i++) {
      promises.push(this.createConnection());
    }
    
    const results = await Promise.allSettled(promises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.available.push(result.value);
      } else {
        logger.error('Failed to create initial connection', result.reason);
      }
    }
  }
  
  private async createConnection(): Promise<T> {
    return await this.createFn();
  }
  
  async acquire(): Promise<{ id: string; connection: T }> {
    const id = `conn_${Date.now()}_${Math.random()}`;
    
    // Try to get available connection
    let connection = this.available.pop();
    
    if (!connection && this.inUse.size < this.maxSize) {
      // Create new connection if under limit
      connection = await this.createConnection();
    }
    
    if (!connection) {
      // Wait for a connection to become available
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.acquire(); // Retry
    }
    
    this.inUse.set(id, connection);
    resourceManager.registerConnection(id, connection);
    
    return { id, connection };
  }
  
  async release(id: string): Promise<void> {
    const connection = this.inUse.get(id);
    
    if (connection) {
      this.inUse.delete(id);
      
      // Return to available pool if under max
      if (this.available.length < this.maxSize) {
        this.available.push(connection);
      } else {
        // Destroy excess connection
        await this.destroyFn(connection);
      }
      
      await resourceManager.unregisterConnection(id);
    }
  }
  
  async drain(): Promise<void> {
    // Wait for all in-use connections to be released
    while (this.inUse.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Destroy all available connections
    const promises = this.available.map(conn => this.destroyFn(conn));
    await Promise.allSettled(promises);
    
    this.available = [];
  }
}
