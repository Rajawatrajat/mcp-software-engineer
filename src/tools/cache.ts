export const cacheTools = new Map([
  [
    'setup_cache',
    {
      name: 'setup_cache',
      description: 'Setup caching layer (Redis, Memcached, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['redis', 'memcached', 'in-memory'] },
          projectPath: { type: 'string', description: 'Project path' },
          config: { type: 'object', description: 'Cache configuration' }
        },
        required: ['type', 'projectPath']
      },
      async execute(args: any) {
        return `${args.type} cache setup completed`;
      }
    }
  ]
]);
