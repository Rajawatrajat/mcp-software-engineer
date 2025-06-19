export const messageQueueTools = new Map([
  [
    'setup_queue',
    {
      name: 'setup_queue',
      description: 'Setup message queue system',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['rabbitmq', 'kafka', 'sqs', 'redis'] },
          projectPath: { type: 'string', description: 'Project path' },
          queues: { type: 'array', items: { type: 'string' }, description: 'Queue names to create' }
        },
        required: ['type', 'projectPath']
      },
      async execute(args: any) {
        return `${args.type} message queue setup completed`;
      }
    }
  ]
]);
