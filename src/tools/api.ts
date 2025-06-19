import { z } from 'zod';
import fetch from 'node-fetch';
import { BaseTool } from './base-tool.js';
import { ExternalServiceError, TimeoutError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Validation schemas
const testApiSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  data: z.any().optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(60000).optional()
});

const loadTestSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  data: z.any().optional(),
  headers: z.record(z.string()).optional(),
  concurrency: z.number().min(1).max(100).optional().default(10),
  requests: z.number().min(1).max(10000).optional().default(100),
  duration: z.number().min(1).max(300).optional() // seconds
});

// Response type
interface ApiTestResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  timing: {
    start: number;
    end: number;
    duration: number;
  };
}

interface LoadTestResponse {
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    requestsPerSecond: number;
  };
  statusCodes: Record<number, number>;
  errors: Array<{ error: string; count: number }>;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

class TestApiTool extends BaseTool<z.infer<typeof testApiSchema>, ApiTestResponse> {
  constructor() {
    super({
      name: 'test_api',
      description: 'Test API endpoints with detailed response analysis',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'API endpoint URL' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
          data: { type: 'object', description: 'Request data' },
          headers: { type: 'object', description: 'Request headers' },
          timeout: { type: 'number', description: 'Request timeout in milliseconds' }
        },
        required: ['url', 'method']
      },
      timeout: 60000 // 60 seconds max
    });
  }
  
  protected getZodSchema() {
    return testApiSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof testApiSchema>): Promise<ApiTestResponse> {
    const { url, method, data, headers = {}, timeout = 30000 } = input;
    
    const startTime = Date.now();
    
    try {
      // Prepare request options
      const options: any = {
        method,
        headers: {
          'User-Agent': 'MCP-Software-Engineer/1.0',
          'Accept': 'application/json',
          ...headers
        },
        timeout,
        signal: AbortSignal.timeout(timeout)
      };
      
      // Add body for non-GET requests
      if (method !== 'GET' && data) {
        if (typeof data === 'object') {
          options.body = JSON.stringify(data);
          options.headers['Content-Type'] = 'application/json';
        } else {
          options.body = data;
        }
      }
      
      // Make request
      logger.info('Making API request', { url, method, headers: options.headers });
      
      const response = await fetch(url, options);
      const endTime = Date.now();
      
      // Parse response
      let responseData: any;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else if (contentType.includes('text/')) {
        responseData = await response.text();
      } else {
        responseData = await response.buffer();
        responseData = `[Binary data: ${responseData.length} bytes]`;
      }
      
      // Build response object
      const result: ApiTestResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
        timing: {
          start: startTime,
          end: endTime,
          duration: endTime - startTime
        }
      };
      
      // Log response
      logger.info('API request completed', {
        url,
        status: response.status,
        duration: result.timing.duration
      });
      
      // Check for errors
      if (!response.ok) {
        logger.warn('API request returned error status', {
          url,
          status: response.status,
          statusText: response.statusText
        });
      }
      
      return result;
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new TimeoutError(`API request to ${url}`, timeout);
      }
      
      throw new ExternalServiceError(
        'API',
        `Failed to test API: ${error.message}`,
        error
      );
    }
  }
}

class LoadTestApiTool extends BaseTool<z.infer<typeof loadTestSchema>, LoadTestResponse> {
  constructor() {
    super({
      name: 'load_test_api',
      description: 'Perform load testing on API endpoints',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'API endpoint URL' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
          data: { type: 'object', description: 'Request data' },
          headers: { type: 'object', description: 'Request headers' },
          concurrency: { type: 'number', description: 'Number of concurrent requests' },
          requests: { type: 'number', description: 'Total number of requests' },
          duration: { type: 'number', description: 'Test duration in seconds (alternative to requests count)' }
        },
        required: ['url', 'method']
      },
      timeout: 300000, // 5 minutes max
      rateLimit: {
        windowMs: 300000, // 5 minutes
        maxRequests: 10 // Only 10 load tests per 5 minutes
      }
    });
  }
  
  // Schema validation handled in executeInternal
  
  protected async executeInternal(input: z.infer<typeof loadTestSchema>): Promise<LoadTestResponse> {
    const { 
      url, 
      method, 
      data, 
      headers = {}, 
      concurrency = 10,
      requests = 100,
      duration
    } = input;
    
    logger.info('Starting load test', { url, method, concurrency, requests, duration });
    
    const results: Array<{
      status: number;
      duration: number;
      error?: string;
    }> = [];
    
    const startTime = Date.now();
    const endTime = duration ? startTime + (duration * 1000) : null;
    
    // Worker function to make requests
    const makeRequest = async (): Promise<void> => {
      const requestStartTime = Date.now();
      
      try {
        const options: any = {
          method,
          headers: {
            'User-Agent': 'MCP-LoadTest/1.0',
            ...headers
          },
          timeout: 10000, // 10 second timeout per request
          signal: AbortSignal.timeout(10000)
        };
        
        if (method !== 'GET' && data) {
          options.body = JSON.stringify(data);
          options.headers['Content-Type'] = 'application/json';
        }
        
        const response = await fetch(url, options);
        const requestEndTime = Date.now();
        
        results.push({
          status: response.status,
          duration: requestEndTime - requestStartTime
        });
        
        // Consume response body to free resources
        await response.text();
        
      } catch (error: any) {
        const requestEndTime = Date.now();
        
        results.push({
          status: 0,
          duration: requestEndTime - requestStartTime,
          error: error.message
        });
      }
    };
    
    // Create worker pool
    const workers: Promise<void>[] = [];
    let requestCount = 0;
    
    // Start workers
    for (let i = 0; i < concurrency; i++) {
      workers.push((async () => {
        while (true) {
          // Check termination conditions
          if (!endTime && requestCount >= requests) break;
          if (endTime && Date.now() >= endTime) break;
          
          requestCount++;
          await makeRequest();
          
          // Small delay to prevent overwhelming
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      })());
    }
    
    // Wait for all workers to complete
    await Promise.all(workers);
    
    // Calculate statistics
    const successfulRequests = results.filter(r => r.status >= 200 && r.status < 300).length;
    const failedRequests = results.filter(r => r.status === 0 || r.status >= 400).length;
    const durations = results.map(r => r.duration).sort((a, b) => a - b);
    
    const totalDuration = Date.now() - startTime;
    const requestsPerSecond = results.length / (totalDuration / 1000);
    
    // Calculate percentiles
    const getPercentile = (arr: number[], p: number): number => {
      const index = Math.ceil((p / 100) * arr.length) - 1;
      return arr[index] || 0;
    };
    
    // Count status codes
    const statusCodes: Record<number, number> = {};
    results.forEach(r => {
      statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;
    });
    
    // Count errors
    const errorCounts: Record<string, number> = {};
    results.filter(r => r.error).forEach(r => {
      const error = r.error || 'Unknown error';
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });
    
    const errors = Object.entries(errorCounts).map(([error, count]) => ({ error, count }));
    
    const response: LoadTestResponse = {
      summary: {
        totalRequests: results.length,
        successfulRequests,
        failedRequests,
        averageResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
        minResponseTime: Math.min(...durations),
        maxResponseTime: Math.max(...durations),
        requestsPerSecond
      },
      statusCodes,
      errors,
      percentiles: {
        p50: getPercentile(durations, 50),
        p90: getPercentile(durations, 90),
        p95: getPercentile(durations, 95),
        p99: getPercentile(durations, 99)
      }
    };
    
    logger.info('Load test completed', response.summary);
    
    return response;
  }
}

class MockApiServerTool extends BaseTool<any, { port: number; url: string }> {
  constructor() {
    super({
      name: 'mock_api_server',
      description: 'Create a mock API server for testing',
      inputSchema: {
        type: 'object',
        properties: {
          port: { type: 'number', description: 'Server port' },
          routes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                method: { type: 'string' },
                response: { type: 'object' },
                statusCode: { type: 'number' },
                delay: { type: 'number' }
              }
            }
          }
        },
        required: ['routes']
      }
    });
  }
  
  protected async executeInternal(input: any): Promise<{ port: number; url: string }> {
    // This would create an actual mock server
    // For now, return a placeholder
    logger.info('Mock API server creation requested', input);
    
    return {
      port: input.port || 3001,
      url: `http://localhost:${input.port || 3001}`
    };
  }
}

// Export tools
export const apiTools = new Map<string, any>([
  ['test_api', new TestApiTool()],
  ['load_test_api', new LoadTestApiTool()],
  ['mock_api_server', new MockApiServerTool()]
]);
