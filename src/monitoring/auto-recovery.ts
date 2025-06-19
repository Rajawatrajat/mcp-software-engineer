import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { metrics } from './metrics.js';
import { resourceManager } from '../utils/resource-manager.js';
import { config } from '../config/index.js';

/**
 * Auto-recovery system for handling failures and resource issues
 * Following WCGW: Assume everything will fail, build recovery for it
 */
export class AutoRecoverySystem extends EventEmitter {
  private static instance: AutoRecoverySystem;
  
  // State tracking
  private isRecovering = false;
  private lastRecoveryTime = 0;
  private recoveryAttempts = 0;
  private memorySnapshots: Array<{ time: number; usage: number }> = [];
  
  // Configuration
  private readonly config = {
    memoryLeakThreshold: 50 * 1024 * 1024, // 50MB increase
    memoryLeakWindow: 60000, // 1 minute
    maxRecoveryAttempts: 3,
    recoveryBackoff: 30000, // 30 seconds
    gcThreshold: 0.7, // 70% memory usage triggers GC
    restartThreshold: 0.95 // 95% memory usage triggers restart
  };
  
  private constructor() {
    super();
    this.startMonitoring();
    this.setupEventHandlers();
  }
  
  static getInstance(): AutoRecoverySystem {
    if (!AutoRecoverySystem.instance) {
      AutoRecoverySystem.instance = new AutoRecoverySystem();
    }
    return AutoRecoverySystem.instance;
  }
  
  /**
   * Start monitoring for issues
   */
  private startMonitoring(): void {
    // Monitor memory every 5 seconds
    setInterval(() => {
      this.checkMemoryLeak();
      this.checkMemoryPressure();
    }, 5000);
    
    // Monitor system health every minute
    setInterval(() => {
      this.performHealthCheck();
    }, 60000);
    
    // Listen for metric alerts
    metrics.on('alert', (alert) => {
      this.handleMetricAlert(alert);
    });
    
    // Listen for resource manager events
    resourceManager.on('memory-critical', (usage) => {
      this.handleMemoryCritical(usage);
    });
    
    resourceManager.on('memory-warning', (usage) => {
      this.handleMemoryWarning(usage);
    });
  }
  
  /**
   * Setup process event handlers
   */
  private setupEventHandlers(): void {
    // Catch unhandled errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in auto-recovery', error);
      this.attemptRecovery('uncaught_exception', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection in auto-recovery', { reason, promise });
      this.attemptRecovery('unhandled_rejection', reason);
    });
    
    // Monitor event loop
    let lastCheck = Date.now();
    setInterval(() => {
      const now = Date.now();
      const delay = now - lastCheck - 1000;
      
      if (delay > 100) {
        logger.warn('Event loop blocked', { delay });
        metrics.histogram('system.eventloop.delay', delay);
        
        if (delay > 5000) {
          this.handleEventLoopBlock(delay);
        }
      }
      
      lastCheck = now;
    }, 1000);
  }
  
  /**
   * Check for memory leaks
   */
  private checkMemoryLeak(): void {
    const currentUsage = process.memoryUsage().heapUsed;
    const currentTime = Date.now();
    
    // Add to snapshots
    this.memorySnapshots.push({ time: currentTime, usage: currentUsage });
    
    // Keep only recent snapshots
    this.memorySnapshots = this.memorySnapshots.filter(
      s => currentTime - s.time < this.config.memoryLeakWindow
    );
    
    // Need at least 2 snapshots
    if (this.memorySnapshots.length < 2) return;
    
    // Calculate memory growth
    const oldestSnapshot = this.memorySnapshots[0];
    const memoryGrowth = currentUsage - oldestSnapshot.usage;
    const timeElapsed = currentTime - oldestSnapshot.time;
    
    // Check if growth exceeds threshold
    if (memoryGrowth > this.config.memoryLeakThreshold) {
      const growthRate = memoryGrowth / timeElapsed * 1000 * 60; // bytes per minute
      
      logger.warn('Potential memory leak detected', {
        growth: `${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
        rate: `${(growthRate / 1024 / 1024).toFixed(2)}MB/min`,
        current: `${(currentUsage / 1024 / 1024).toFixed(2)}MB`
      });
      
      this.emit('memory-leak', {
        growth: memoryGrowth,
        rate: growthRate,
        current: currentUsage
      });
      
      // Take action
      this.handleMemoryLeak();
    }
  }
  
  /**
   * Check memory pressure
   */
  private checkMemoryPressure(): void {
    const memUsage = process.memoryUsage();
    const maxMemory = config.getNumber('MAX_MEMORY_MB') * 1024 * 1024;
    const usageRatio = memUsage.heapUsed / maxMemory;
    
    metrics.gauge('system.memory.usage_ratio', usageRatio);
    
    if (usageRatio > this.config.restartThreshold) {
      logger.error('Critical memory usage, restart required', {
        usage: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        max: `${(maxMemory / 1024 / 1024).toFixed(2)}MB`,
        ratio: `${(usageRatio * 100).toFixed(1)}%`
      });
      
      this.initiateGracefulRestart();
    } else if (usageRatio > this.config.gcThreshold) {
      this.triggerGarbageCollection();
    }
  }
  
  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<boolean> {
    const health = {
      memory: this.checkMemoryHealth(),
      resources: this.checkResourceHealth(),
      operations: this.checkOperationHealth()
    };
    
    const isHealthy = Object.values(health).every(h => h.status === 'healthy');
    
    if (!isHealthy) {
      logger.warn('Health check failed', health);
      this.emit('unhealthy', health);
      
      // Attempt recovery if critical
      const criticalIssues = Object.values(health).filter(h => h.status === 'critical');
      if (criticalIssues.length > 0) {
        this.attemptRecovery('health_check', health);
      }
    }
    
    return isHealthy;
  }
  
  /**
   * Check memory health
   */
  private checkMemoryHealth(): any {
    const memUsage = process.memoryUsage();
    const maxMemory = config.getNumber('MAX_MEMORY_MB') * 1024 * 1024;
    const usageRatio = memUsage.heapUsed / maxMemory;
    
    if (usageRatio > 0.9) {
      return { status: 'critical', message: 'Memory usage above 90%', usage: usageRatio };
    } else if (usageRatio > 0.7) {
      return { status: 'warning', message: 'Memory usage above 70%', usage: usageRatio };
    }
    
    return { status: 'healthy', usage: usageRatio };
  }
  
  /**
   * Check resource health
   */
  private checkResourceHealth(): any {
    const usage = resourceManager.getUsage();
    const issues = [];
    
    if (usage.processes > 8) issues.push('Too many processes');
    if (usage.connections > 80) issues.push('Too many connections');
    if (usage.fileHandles > 40) issues.push('Too many file handles');
    
    if (issues.length > 2) {
      return { status: 'critical', message: issues.join(', '), usage };
    } else if (issues.length > 0) {
      return { status: 'warning', message: issues.join(', '), usage };
    }
    
    return { status: 'healthy', usage };
  }
  
  /**
   * Check operation health
   */
  private checkOperationHealth(): any {
    const allMetrics = metrics.getAllMetrics();
    const issues = [];
    
    // Check error rates
    for (const [name, stats] of Object.entries(allMetrics.operations)) {
      const errorRate = (stats as any).errorRate;
      if (errorRate > 0.1) {
        issues.push(`High error rate for ${name}: ${(errorRate * 100).toFixed(1)}%`);
      }
    }
    
    if (issues.length > 3) {
      return { status: 'critical', message: issues.join(', ') };
    } else if (issues.length > 0) {
      return { status: 'warning', message: issues.join(', ') };
    }
    
    return { status: 'healthy' };
  }
  
  /**
   * Handle memory leak
   */
  private handleMemoryLeak(): void {
    logger.info('Handling memory leak');
    
    // First try garbage collection
    this.triggerGarbageCollection();
    
    // Clear caches and unused resources
    setTimeout(() => {
      resourceManager.cleanup().then(() => {
        logger.info('Resource cleanup completed');
        
        // Check if memory improved
        setTimeout(() => {
          const currentUsage = process.memoryUsage().heapUsed;
          const improved = this.memorySnapshots[this.memorySnapshots.length - 1].usage - currentUsage;
          
          if (improved > 10 * 1024 * 1024) {
            logger.info(`Memory recovered: ${(improved / 1024 / 1024).toFixed(2)}MB`);
          } else {
            logger.warn('Memory leak persists after cleanup');
            this.emit('persistent-memory-leak');
          }
        }, 5000);
      });
    }, 1000);
  }
  
  /**
   * Handle memory critical
   */
  private handleMemoryCritical(usage: number): void {
    logger.error('Memory critical handler triggered', { usage });
    
    // Immediate actions
    this.triggerGarbageCollection();
    
    // Stop accepting new requests
    this.emit('pause-operations');
    
    // Aggressive cleanup
    setTimeout(() => {
      this.performAggressiveCleanup();
    }, 1000);
  }
  
  /**
   * Handle memory warning
   */
  private handleMemoryWarning(usage: number): void {
    logger.warn('Memory warning handler triggered', { usage });
    this.triggerGarbageCollection();
  }
  
  /**
   * Handle metric alert
   */
  private handleMetricAlert(alert: any): void {
    logger.info('Handling metric alert', alert);
    
    switch (alert.type) {
      case 'memory':
        this.handleMemoryWarning(alert.value);
        break;
        
      case 'error_rate':
        // Log and monitor
        metrics.increment('recovery.error_rate_alerts');
        break;
        
      case 'response_time':
        // Check for system overload
        this.checkSystemOverload();
        break;
    }
  }
  
  /**
   * Handle event loop block
   */
  private handleEventLoopBlock(delay: number): void {
    logger.error('Event loop blocked', { delay });
    metrics.increment('recovery.eventloop_blocks');
    
    // If severe, trigger recovery
    if (delay > 10000) {
      this.attemptRecovery('eventloop_block', { delay });
    }
  }
  
  /**
   * Check system overload
   */
  private checkSystemOverload(): void {
    const usage = resourceManager.getUsage();
    const metrics = this.getAllMetrics();
    
    // Simple overload detection
    const overloaded = 
      usage.processes > 8 ||
      usage.connections > 80 ||
      Object.values(metrics.operations).some((op: any) => op.avgTime > 5000);
    
    if (overloaded) {
      logger.warn('System overload detected');
      this.emit('system-overload');
      
      // Implement backpressure
      this.implementBackpressure();
    }
  }
  
  /**
   * Trigger garbage collection
   */
  private triggerGarbageCollection(): void {
    if (global.gc) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freed = before - after;
      
      logger.info('Garbage collection completed', {
        freed: `${(freed / 1024 / 1024).toFixed(2)}MB`,
        before: `${(before / 1024 / 1024).toFixed(2)}MB`,
        after: `${(after / 1024 / 1024).toFixed(2)}MB`
      });
      
      metrics.histogram('recovery.gc_freed', freed);
    } else {
      logger.warn('Garbage collection not available (run with --expose-gc)');
    }
  }
  
  /**
   * Perform aggressive cleanup
   */
  private async performAggressiveCleanup(): Promise<void> {
    logger.info('Performing aggressive cleanup');
    
    // Clear all caches
    this.emit('clear-caches');
    
    // Force close idle connections
    await resourceManager.cleanup();
    
    // Clear metrics history
    metrics.reset();
    
    // Force GC
    this.triggerGarbageCollection();
    
    logger.info('Aggressive cleanup completed');
  }
  
  /**
   * Implement backpressure
   */
  private implementBackpressure(): void {
    logger.info('Implementing backpressure');
    
    // Emit event for request limiting
    this.emit('enable-backpressure');
    
    // Schedule removal after 30 seconds
    setTimeout(() => {
      logger.info('Removing backpressure');
      this.emit('disable-backpressure');
    }, 30000);
  }
  
  /**
   * Attempt recovery
   */
  private async attemptRecovery(reason: string, details: any): Promise<void> {
    if (this.isRecovering) {
      logger.warn('Recovery already in progress');
      return;
    }
    
    // Check recovery attempts
    const now = Date.now();
    if (now - this.lastRecoveryTime < this.config.recoveryBackoff) {
      logger.warn('Recovery attempted too soon');
      return;
    }
    
    this.isRecovering = true;
    this.lastRecoveryTime = now;
    this.recoveryAttempts++;
    
    logger.info('Attempting recovery', { reason, attempt: this.recoveryAttempts, details });
    
    try {
      // Emit recovery start
      this.emit('recovery-start', { reason, attempt: this.recoveryAttempts });
      
      // Recovery steps
      await this.performAggressiveCleanup();
      
      // Wait for stabilization
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if recovery successful
      const health = await this.performHealthCheck();
      
      if (health) {
        logger.info('Recovery successful');
        this.emit('recovery-success');
        this.recoveryAttempts = 0;
      } else {
        throw new Error('Recovery failed, system still unhealthy');
      }
      
    } catch (error) {
      logger.error('Recovery failed', error);
      this.emit('recovery-failed', error);
      
      // Check if we should restart
      if (this.recoveryAttempts >= this.config.maxRecoveryAttempts) {
        logger.error('Max recovery attempts reached, initiating restart');
        this.initiateGracefulRestart();
      }
    } finally {
      this.isRecovering = false;
    }
  }
  
  /**
   * Initiate graceful restart
   */
  private initiateGracefulRestart(): void {
    logger.info('Initiating graceful restart');
    
    this.emit('shutdown-requested');
    
    // Give time for cleanup
    setTimeout(() => {
      process.exit(1); // Exit with error code to trigger restart
    }, 5000);
  }
  
  private getAllMetrics(): any {
    return metrics.getAllMetrics();
  }
}

// Export singleton instance
export const autoRecovery = AutoRecoverySystem.getInstance();

// Log recovery events
autoRecovery.on('recovery-start', (details) => {
  metrics.increment('recovery.attempts', 1, { reason: details.reason });
});

autoRecovery.on('recovery-success', () => {
  metrics.increment('recovery.success');
});

autoRecovery.on('recovery-failed', () => {
  metrics.increment('recovery.failures');
});
