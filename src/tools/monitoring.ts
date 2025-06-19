export const monitoringTools = new Map([
  [
    'setup_monitoring',
    {
      name: 'setup_monitoring',
      description: 'Setup application monitoring',
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', enum: ['prometheus', 'grafana', 'sentry'] },
          projectPath: { type: 'string', description: 'Project path' }
        },
        required: ['tool', 'projectPath']
      },
      async execute(args: any) {
        return `${args.tool} monitoring setup completed`;
      }
    }
  ]
]);
