import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Import configuration and utilities
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { setupGlobalErrorHandlers } from './utils/errors.js';
import { resourceManager } from './utils/resource-manager.js';

// Import all available tools
import { fileSystemTools } from './tools/filesystem.js';
import { databaseTools } from './tools/database.js';
import { webDevTools } from './tools/webdev.js';
import { backendTools } from './tools/backend.js';
import { apiTools } from './tools/api.js';
import { aiTools } from './tools/ai.js';
import { cacheTools } from './tools/cache.js';
import { containerTools } from './tools/containers.js';
import { deploymentTools } from './tools/deployment.js';
import { gitTools } from './tools/git.js';
import { messageQueueTools } from './tools/messagequeue.js';
import { monitoringTools } from './tools/monitoring.js';
import { securityTools } from './tools/security.js';
import { testingTools } from './tools/testing.js';

// Setup global error handlers
setupGlobalErrorHandlers();

class SoftwareEngineerMCPServer {
  private server: Server;
  private allTools: Map<string, any>;

  constructor() {
    this.server = new Server(
      {
        name: 'software-engineer-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Combine all tool collections
    this.allTools = new Map();
    
    // Add all tool collections
    const toolCollections = [
      fileSystemTools,
      databaseTools,
      webDevTools,
      backendTools,
      apiTools,
      aiTools,
      cacheTools,
      containerTools,
      deploymentTools,
      gitTools,
      messageQueueTools,
      monitoringTools,
      securityTools,
      testingTools
    ];

    // Merge all tools into allTools map
    for (const toolCollection of toolCollections) {
      for (const [key, value] of toolCollection) {
        this.allTools.set(key, value);
      }
    }

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = Array.from(this.allTools.values()).map(tool => {
        // Check if it's a new class-based tool or old style
        if ('inputSchema' in tool && 'name' in tool && 'description' in tool) {
          return {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          };
        }
        // Fallback for any tools not yet migrated
        return {
          name: tool.name || 'unknown',
          description: tool.description || 'No description',
          inputSchema: tool.inputSchema || { type: 'object' }
        };
      });
      
      logger.info('Listing available tools', { count: tools.length });
      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const requestId = `req_${Date.now()}_${Math.random()}`;
      
      logger.setContext({ requestId, toolName: name });
      logger.info('Tool request received', { args: this.sanitizeForLogging(args) });
      
      const tool = this.allTools.get(name);
      if (!tool) {
        logger.error('Unknown tool requested', { name });
        throw new Error(`Unknown tool: ${name}`);
      }

      try {
        // Execute tool (works for both new and old style)
        const result = await tool.execute(args);
        
        logger.info('Tool execution successful', { toolName: name });
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('Tool execution failed', error as Error);
        throw new Error(`Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        logger.clearContext();
      }
    });
    
    // Note: MCP doesn't support custom endpoints like health/check
    // Health check needs to be implemented as a tool if needed
  }
  
  private sanitizeForLogging(data: any): any {
    // Remove sensitive fields from logs
    if (!data || typeof data !== 'object') return data;
    
    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey'];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  async run() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('MCP Software Engineer Server started', {
        totalTools: this.allTools.size,
        tools: Array.from(this.allTools.keys()),
        config: config.getSafeConfig()
      });
      
      // Log to stderr for visibility
      console.error('Software Engineer MCP Server running on stdio');
      console.error(`Total tools loaded: ${this.allTools.size}`);
      console.error('Available tools:', Array.from(this.allTools.keys()).join(', '));
      
      // Setup periodic resource monitoring
      setInterval(() => {
        const usage = resourceManager.getUsage();
        
        logger.metric('resource_usage', usage.memoryMB, 'MB', {
          type: 'memory',
          processes: usage.processes,
          connections: usage.connections
        });
        
        // Warn if resources are high
        if (usage.memoryMB > config.getNumber('MAX_MEMORY_MB') * 0.8) {
          logger.warn('High memory usage detected', usage);
        }
      }, 30000); // Every 30 seconds
      
    } catch (error) {
      logger.error('Failed to start server', error as Error);
      throw error;
    }
  }
}

// Graceful shutdown handler
async function shutdown() {
  logger.info('Shutdown signal received');
  
  try {
    await resourceManager.cleanup();
    logger.info('Cleanup completed, exiting');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
const server = new SoftwareEngineerMCPServer();
server.run().catch(error => {
  logger.error('Server crashed', error);
  console.error('Server crashed:', error);
  process.exit(1);
});
