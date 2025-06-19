export const containerTools = new Map([
  [
    'manage_containers',
    {
      name: 'manage_containers',
      description: 'Manage Docker containers',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'start', 'stop', 'logs'] },
          container: { type: 'string', description: 'Container name or ID' }
        },
        required: ['action']
      },
      async execute(args: any) {
        return `Container ${args.action} executed`;
      }
    }
  ]
]);
