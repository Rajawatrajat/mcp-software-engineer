export const securityTools = new Map([
  [
    'security_scan',
    {
      name: 'security_scan',
      description: 'Run security vulnerability scan',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Project path' },
          type: { type: 'string', enum: ['dependencies', 'code', 'docker'] }
        },
        required: ['projectPath', 'type']
      },
      async execute(args: any) {
        return `Security scan (${args.type}) completed for project`;
      }
    }
  ]
]);
