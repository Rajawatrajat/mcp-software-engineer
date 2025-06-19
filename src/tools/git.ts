import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

export const gitTools = new Map([
  [
    'init_repository',
    {
      name: 'init_repository',
      description: 'Initialize Git repository with best practices',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Project path' },
          remote: { type: 'string', description: 'Remote repository URL' },
          branch: { type: 'string', default: 'main', description: 'Default branch name' }
        },
        required: ['projectPath']
      },
      async execute(args: any) {
        const { projectPath, remote, branch = 'main' } = args;
        
        // Initialize Git repository
        await execAsync(`cd "${projectPath}" && git init`);
        
        // Set default branch
        await execAsync(`cd "${projectPath}" && git branch -M ${branch}`);
        
        // Create .gitignore
        const gitignore = `# Dependencies
node_modules/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build outputs
dist/
build/
out/
coverage/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Cache
.cache/
.parcel-cache/
.next/
.nuxt/`;

        await fs.writeFile(path.join(projectPath, '.gitignore'), gitignore);
        
        // Create initial commit
        await execAsync(`cd "${projectPath}" && git add .`);
        await execAsync(`cd "${projectPath}" && git commit -m "Initial commit"`);
        
        // Add remote if provided
        if (remote) {
          await execAsync(`cd "${projectPath}" && git remote add origin ${remote}`);
        }
        
        return `Git repository initialized${remote ? ` with remote ${remote}` : ''}`;
      }
    }
  ],
  [
    'create_branch',
    {
      name: 'create_branch',
      description: 'Create and switch to new branch',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Branch name' },
          projectPath: { type: 'string', description: 'Project path' },
          fromBranch: { type: 'string', default: 'main', description: 'Source branch' }
        },
        required: ['name', 'projectPath']
      },
      async execute(args: any) {
        const { name, projectPath, fromBranch = 'main' } = args;
        
        await execAsync(`cd "${projectPath}" && git checkout ${fromBranch}`);
        await execAsync(`cd "${projectPath}" && git checkout -b ${name}`);
        
        return `Created and switched to branch: ${name}`;
      }
    }
  ],
  [
    'commit_changes',
    {
      name: 'commit_changes',
      description: 'Stage and commit changes',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
          projectPath: { type: 'string', description: 'Project path' },
          files: { type: 'array', items: { type: 'string' }, description: 'Specific files to commit' }
        },
        required: ['message', 'projectPath']
      },
      async execute(args: any) {
        const { message, projectPath, files } = args;
        
        if (files && files.length > 0) {
          for (const file of files) {
            await execAsync(`cd "${projectPath}" && git add "${file}"`);
          }
        } else {
          await execAsync(`cd "${projectPath}" && git add .`);
        }
        
        await execAsync(`cd "${projectPath}" && git commit -m "${message}"`);
        
        return `Changes committed: ${message}`;
      }
    }
  ],
  [
    'setup_hooks',
    {
      name: 'setup_hooks',
      description: 'Setup Git hooks for code quality',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Project path' },
          hooks: {
            type: 'array',
            items: { type: 'string', enum: ['pre-commit', 'pre-push', 'commit-msg'] },
            description: 'Hooks to setup'
          },
          tools: {
            type: 'array',
            items: { type: 'string', enum: ['eslint', 'prettier', 'husky', 'lint-staged'] },
            description: 'Tools to integrate'
          }
        },
        required: ['projectPath', 'hooks']
      },
      async execute(args: any) {
        const { projectPath, hooks, tools = [] } = args;
        
        if (tools.includes('husky')) {
          await execAsync(`cd "${projectPath}" && npm install --save-dev husky`);
          await execAsync(`cd "${projectPath}" && npx husky install`);
        }
        
        if (tools.includes('lint-staged')) {
          await execAsync(`cd "${projectPath}" && npm install --save-dev lint-staged`);
        }
        
        for (const hook of hooks) {
          let hookContent = '#!/bin/sh\n';
          
          switch (hook) {
            case 'pre-commit':
              if (tools.includes('lint-staged')) {
                hookContent += 'npx lint-staged\n';
              }
              if (tools.includes('eslint')) {
                hookContent += 'npm run lint\n';
              }
              break;
              
            case 'pre-push':
              hookContent += 'npm test\n';
              break;
              
            case 'commit-msg':
              hookContent += `# Validate commit message format
commit_regex='^(feat|fix|docs|style|refactor|test|chore)(\\(.+\\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo "Invalid commit message format!"
    echo "Format: type(scope): description"
    exit 1
fi`;
              break;
          }
          
          const hookPath = path.join(projectPath, '.git/hooks', hook);
          await fs.writeFile(hookPath, hookContent);
          await execAsync(`chmod +x "${hookPath}"`);
        }
        
        return `Git hooks setup completed: ${hooks.join(', ')}`;
      }
    }
  ]
]);
