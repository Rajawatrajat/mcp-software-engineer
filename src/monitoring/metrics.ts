import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Metrics collection and monitoring system
 * Following WCGW: Track everything that could go wrong
 */
export class MetricsCollector extends EventEmitter {
  private static instance: MetricsCollector;
  
  // Metric stores
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private timers: Map<string, number> = new Map();
  
  // Performance tracking
  private operationStats: Map<string, {
    count: number;
    totalTime: number;
    minTime: number;
    maxTime: number;
    errors: number;
  }> = new Map();
  
  // Thresholds for alerts
  private thresholds = {
    responseTime: 1000, // ms
    errorRate: 0.05, // 5%
    memoryUsage: 0.8, // 80% of max
    cpuUsage: 0.9 // 90%
  };
  
  private constructor() {
    super();
    this.startCollecting();
  }
  
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }
  
  /**
   * Start collecting system metrics
   */
  private startCollecting(): void {
    // Collect every 10 seconds
    setInterval(() => {
      this.collectSystemMetrics();
      this.checkThresholds();
    }, 10000);
    
    // Report metrics every minute
    setInterval(() => {
      this.reportMetrics();
    }, 60000);
  }
  
  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1, tags?: Record<string, any>): void {
    const key = this.getKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }
  
  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, tags?: Record<string, any>): void {
    const key = this.getKey(name, tags);
    this.gauges.set(key, value);
  }
  
  /**
   * Record a value in a histogram
   */
  histogram(name: string, value: number, tags?: Record<string, any>): void {
    const key = this.getKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    
    this.histograms.set(key, values);
  }
  
  /**
   * Start a timer
   */
  startTimer(name: string, tags?: Record<string, any>): () => void {
    const key = this.getKey(name, tags);
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.recordOperation(name, duration, false, tags);
      this.histogram(`${name}.duration`, duration, tags);
    };
  }
  
  /**
   * Record an operation
   */
  recordOperation(
    name: string, 
    duration: number, 
    error: boolean = false,
    tags?: Record<string, any>
  ): void {
    const key = this.getKey(name, tags);
    const stats = this.operationStats.get(key) || {
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      errors: 0
    };
    
    stats.count++;
    stats.totalTime += duration;
    stats.minTime = Math.min(stats.minTime, duration);
    stats.maxTime = Math.max(stats.maxTime, duration);
    if (error) stats.errors++;
    
    this.operationStats.set(key, stats);
  }
  
  /**
   * Get operation statistics
   */
  getOperationStats(name: string, tags?: Record<string, any>): any {
    const key = this.getKey(name, tags);
    const stats = this.operationStats.get(key);
    
    if (!stats) return null;
    
    return {
      ...stats,
      avgTime: stats.totalTime / stats.count,
      errorRate: stats.errors / stats.count
    };
  }
  
  /**
   * Get percentile from histogram
   */
  getPercentile(name: string, percentile: number, tags?: Record<string, any>): number | null {
    const key = this.getKey(name, tags);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    
    return sorted[index];
  }
  
  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    // Memory metrics
    const memUsage = process.memoryUsage();
    this.gauge('system.memory.heap.used', memUsage.heapUsed);
    this.gauge('system.memory.heap.total', memUsage.heapTotal);
    this.gauge('system.memory.external', memUsage.external);
    this.gauge('system.memory.rss', memUsage.rss);
    
    // CPU metrics
    const cpuUsage = process.cpuUsage();
    this.gauge('system.cpu.user', cpuUsage.user);
    this.gauge('system.cpu.system', cpuUsage.system);
    
    // Event loop lag
    const start = performance.now();
    setImmediate(() => {
      const lag = performance.now() - start;
      this.histogram('system.eventloop.lag', lag);
    });
    
    // Active handles and requests
    const activeHandles = (process as any)._getActiveHandles?.().length || 0;
    const activeRequests = (process as any)._getActiveRequests?.().length || 0;
    
    this.gauge('system.handles.active', activeHandles);
    this.gauge('system.requests.active', activeRequests);
  }
  
  /**
   * Check thresholds and emit alerts
   */
  private checkThresholds(): void {
    // Check memory usage
    const heapUsed = this.gauges.get('system.memory.heap.used') || 0;
    const maxMemory = config.getNumber('MAX_MEMORY_MB') * 1024 * 1024;
    
    if (heapUsed > maxMemory * this.thresholds.memoryUsage) {
      this.emit('alert', {
        type: 'memory',
        severity: 'warning',
        message: `Memory usage at ${(heapUsed / maxMemory * 100).toFixed(1)}%`,
        value: heapUsed,
        threshold: maxMemory * this.thresholds.memoryUsage
      });
    }
    
    // Check error rates
    for (const [name, stats] of this.operationStats) {
      const errorRate = stats.errors / stats.count;
      
      if (errorRate > this.thresholds.errorRate && stats.count > 10) {
        this.emit('alert', {
          type: 'error_rate',
          severity: 'warning',
          message: `High error rate for ${name}: ${(errorRate * 100).toFixed(1)}%`,
          value: errorRate,
          threshold: this.thresholds.errorRate
        });
      }
      
      // Check response times
      const avgTime = stats.totalTime / stats.count;
      if (avgTime > this.thresholds.responseTime && stats.count > 10) {
        this.emit('alert', {
          type: 'response_time',
          severity: 'warning',
          message: `Slow response time for ${name}: ${avgTime.toFixed(0)}ms`,
          value: avgTime,
          threshold: this.thresholds.responseTime
        });
      }
    }
  }
  
  /**
   * Report metrics to logger
   */
  private reportMetrics(): void {
    const report: Record<string, any> = {
      timestamp: new Date().toISOString(),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      operations: {}
    };
    
    // Add operation stats
    for (const [name, stats] of this.operationStats) {
      report.operations[name] = {
        count: stats.count,
        avgTime: stats.totalTime / stats.count,
        minTime: stats.minTime,
        maxTime: stats.maxTime,
        errorRate: stats.errors / stats.count
      };
    }
    
    // Add percentiles for histograms
    for (const [name, values] of this.histograms) {
      if (values.length > 0) {
        report[`${name}_p50`] = this.getPercentile(name, 50);
        report[`${name}_p90`] = this.getPercentile(name, 90);
        report[`${name}_p99`] = this.getPercentile(name, 99);
      }
    }
    
    logger.info('Metrics report', report);
    
    // Emit for external monitoring
    this.emit('metrics', report);
  }
  
  /**
   * Get key with tags
   */
  private getKey(name: string, tags?: Record<string, any>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    
    return `${name}{${tagStr}}`;
  }
  
  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, any> {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      operations: Object.fromEntries(
        Array.from(this.operationStats.entries()).map(([name, stats]) => [
          name,
          {
            ...stats,
            avgTime: stats.totalTime / stats.count,
            errorRate: stats.errors / stats.count
          }
        ])
      )
    };
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timers.clear();
    this.operationStats.clear();
  }
}

// Export singleton instance
export const metrics = MetricsCollector.getInstance();

// Listen for alerts
metrics.on('alert', (alert) => {
  logger.warn('Metric alert triggered', alert);
});

/**
 * Express middleware for request metrics
 */
export function metricsMiddleware(req: any, res: any, next: any): void {
  const timer = metrics.startTimer('http.request', {
    method: req.method,
    path: req.path
  });
  
  // Track active requests
  metrics.increment('http.requests.active');
  
  // Override end method
  const originalEnd = res.end;
  res.end = function(...args: any[]) {
    // Stop timer
    timer();
    
    // Track response status
    metrics.increment('http.requests.total', 1, {
      method: req.method,
      status: res.statusCode,
      path: req.path
    });
    
    // Track active requests
    metrics.increment('http.requests.active', -1);
    
    // Call original
    originalEnd.apply(res, args);
  };
  
  next();
}

/**
 * Tool execution wrapper for metrics
 */
export function withMetrics<T extends (...args: any[]) => Promise<any>>(
  toolName: string,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    const timer = metrics.startTimer(`tool.${toolName}`);
    metrics.increment(`tool.${toolName}.calls`);
    
    try {
      const result = await fn(...args);
      timer();
      metrics.increment(`tool.${toolName}.success`);
      return result;
    } catch (error) {
      timer();
      metrics.increment(`tool.${toolName}.errors`);
      metrics.recordOperation(`tool.${toolName}`, 0, true);
      throw error;
    }
  }) as T;
}
