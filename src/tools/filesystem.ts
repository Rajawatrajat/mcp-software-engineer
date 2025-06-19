import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { FileBasedTool, BaseTool } from './base-tool.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

const execAsync = promisify(exec);

// Schemas for validation
const createProjectSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/, 'Project name can only contain letters, numbers, hyphens and underscores'),
  type: z.enum(['react', 'vue', 'angular', 'nextjs', 'nuxtjs', 'express', 'fastapi', 'django', 'flask', 'nestjs', 'rails', 'laravel', 'spring', 'full-stack']),
  path: z.string(),
  features: z.array(z.enum(['typescript', 'database', 'auth', 'api', 'testing', 'docker', 'ci-cd', 'monitoring', 'cache', 'queue'])).optional()
});

const readFileSchema = z.object({
  path: z.string()
});

const writeFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  backup: z.boolean().optional()
});

const createDirectorySchema = z.object({
  path: z.string(),
  structure: z.array(z.string()).optional()
});

const listFilesSchema = z.object({
  path: z.string(),
  recursive: z.boolean().optional(),
  filter: z.string().optional()
});

const searchFilesSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  fileTypes: z.array(z.string()).optional(),
  caseSensitive: z.boolean().optional()
});

// Tool implementations
class CreateProjectTool extends BaseTool<z.infer<typeof createProjectSchema>, string> {
  constructor() {
    super({
      name: 'create_project',
      description: 'Create a new project with specified structure and technology stack',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project name' },
          type: { 
            type: 'string', 
            enum: ['react', 'vue', 'angular', 'nextjs', 'nuxtjs', 'express', 'fastapi', 'django', 'flask', 'nestjs', 'rails', 'laravel', 'spring', 'full-stack'],
            description: 'Project type/framework'
          },
          path: { type: 'string', description: 'Project directory path' },
          features: {
            type: 'array',
            items: { 
              type: 'string',
              enum: ['typescript', 'database', 'auth', 'api', 'testing', 'docker', 'ci-cd', 'monitoring', 'cache', 'queue']
            },
            description: 'Additional features to include'
          }
        },
        required: ['name', 'type', 'path']
      }
    });
  }
  
  protected getZodSchema() {
    return createProjectSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof createProjectSchema>): Promise<string> {
    const { name, type, path: projectPath, features = [] } = input;
    
    // Sanitize paths
    const sanitizedPath = this.sanitizePath(projectPath);
    const fullPath = path.join(sanitizedPath, name);
    
    // Check if project already exists
    if (await fs.pathExists(fullPath)) {
      throw new ValidationError(`Project ${name} already exists at ${fullPath}`);
    }
    
    // Ensure within workspace bounds
    const workspaceRoot = config.getString('WORKSPACE_ROOT');
    if (!fullPath.startsWith(workspaceRoot) && !fullPath.startsWith('/Users')) {
      throw new ValidationError('Project must be created within workspace directory');
    }
    
    // Create project directory
    await fs.ensureDir(sanitizedPath);
    
    // Initialize based on project type
    switch (type) {
      case 'react':
        await this.executeCommand(
          `npx create-react-app ${name} ${features.includes('typescript') ? '--template typescript' : ''}`,
          { cwd: sanitizedPath }
        );
        break;
        
      case 'vue':
        await this.executeCommand(
          `npm create vue@latest ${name} -- --default`,
          { cwd: sanitizedPath }
        );
        break;
        
      case 'nextjs':
        await this.executeCommand(
          `npx create-next-app@latest ${name} --no-interaction ${features.includes('typescript') ? '--typescript' : '--javascript'}`,
          { cwd: sanitizedPath }
        );
        break;
        
      case 'express':
        await createExpressProject(fullPath, features);
        break;
        
      case 'full-stack':
        await createFullStackProject(fullPath, features);
        break;
        
      default:
        throw new Error(`Unsupported project type: ${type}`);
    }
    
    logger.info('Project created successfully', { name, type, path: fullPath, features });
    return `Project ${name} created successfully at ${fullPath}`;
  }
}

class ReadFileTool extends FileBasedTool<z.infer<typeof readFileSchema>, string> {
  constructor() {
    super({
      name: 'read_file',
      description: 'Read file contents',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' }
        },
        required: ['path']
      }
    });
  }
  
  protected getZodSchema() {
    return readFileSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof readFileSchema>): Promise<string> {
    try {
      const content = await this.readFileSecure(input.path);
      return content;
    } catch (error) {
      throw new Error(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class WriteFileTool extends FileBasedTool<z.infer<typeof writeFileSchema>, string> {
  constructor() {
    super({
      name: 'write_file',
      description: 'Write content to a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' },
          backup: { type: 'boolean', description: 'Create backup if file exists', default: true }
        },
        required: ['path', 'content']
      }
    });
  }
  
  protected getZodSchema() {
    return writeFileSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof writeFileSchema>): Promise<string> {
    const { path: filePath, content, backup = true } = input;
    
    try {
      await this.writeFileSecure(filePath, content, { backup });
      return `File written successfully to ${filePath}`;
    } catch (error) {
      throw new Error(`Error writing file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class CreateDirectoryTool extends FileBasedTool<z.infer<typeof createDirectorySchema>, string> {
  constructor() {
    super({
      name: 'create_directory',
      description: 'Create directory structure',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to create' },
          structure: {
            type: 'array',
            items: { type: 'string' },
            description: 'Subdirectories to create'
          }
        },
        required: ['path']
      }
    });
  }
  
  protected getZodSchema() {
    return createDirectorySchema;
  }
  
  protected async executeInternal(input: z.infer<typeof createDirectorySchema>): Promise<string> {
    const { path: dirPath, structure = [] } = input;
    const sanitizedPath = this.sanitizePath(dirPath);
    
    await fs.ensureDir(sanitizedPath);
    
    for (const subDir of structure) {
      const subPath = path.join(sanitizedPath, this.sanitizePath(subDir));
      await fs.ensureDir(subPath);
    }
    
    return `Directory structure created at ${sanitizedPath}`;
  }
}

class ListFilesTool extends FileBasedTool<z.infer<typeof listFilesSchema>, string[]> {
  constructor() {
    super({
      name: 'list_files',
      description: 'List files and directories',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list' },
          recursive: { type: 'boolean', description: 'List recursively', default: false },
          filter: { type: 'string', description: 'File extension filter (e.g., .js, .ts)' }
        },
        required: ['path']
      }
    });
  }
  
  protected getZodSchema() {
    return listFilesSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof listFilesSchema>): Promise<string[]> {
    const { path: dirPath, recursive = false, filter } = input;
    const sanitizedPath = this.sanitizePath(dirPath);
    
    const files = await getAllFiles(sanitizedPath, recursive, filter);
    return files;
  }
}

class SearchFilesTool extends FileBasedTool<z.infer<typeof searchFilesSchema>, any[]> {
  constructor() {
    super({
      name: 'search_files',
      description: 'Search for text patterns in files',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory to search in' },
          pattern: { type: 'string', description: 'Text pattern to search for' },
          fileTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'File extensions to search in'
          },
          caseSensitive: { type: 'boolean', default: false }
        },
        required: ['path', 'pattern']
      }
    });
  }
  
  protected getZodSchema() {
    return searchFilesSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof searchFilesSchema>): Promise<any[]> {
    const { path: searchPath, pattern, fileTypes = [], caseSensitive = false } = input;
    const sanitizedPath = this.sanitizePath(searchPath);
    
    const results = await searchInFiles(sanitizedPath, pattern, fileTypes, caseSensitive);
    return results;
  }
}

// Create and export tool instances
export const fileSystemTools = new Map<string, any>([
  ['create_project', new CreateProjectTool()],
  ['read_file', new ReadFileTool()],
  ['write_file', new WriteFileTool()],
  ['create_directory', new CreateDirectoryTool()],
  ['list_files', new ListFilesTool()],
  ['search_files', new SearchFilesTool()]
]);

// Helper functions

async function createExpressProject(projectPath: string, features: string[]) {
  await fs.ensureDir(projectPath);
  
  // Create package.json
  const packageJson: any = {
    name: path.basename(projectPath),
    version: '1.0.0',
    description: '',
    main: features.includes('typescript') ? 'dist/index.js' : 'src/index.js',
    type: 'module',
    scripts: {
      start: 'node ' + (features.includes('typescript') ? 'dist/index.js' : 'src/index.js'),
      dev: features.includes('typescript') ? 'ts-node-esm src/index.ts' : 'nodemon src/index.js',
      build: features.includes('typescript') ? 'tsc' : undefined,
      test: 'jest'
    },
    dependencies: {
      express: '^4.18.2',
      cors: '^2.8.5',
      helmet: '^7.0.0',
      compression: '^1.7.4',
      dotenv: '^16.0.0'
    },
    devDependencies: {
      nodemon: '^3.0.0',
      jest: '^29.0.0'
    }
  };

  if (features.includes('typescript')) {
    packageJson.devDependencies.typescript = '^5.0.0';
    packageJson.devDependencies['@types/node'] = '^20.0.0';
    packageJson.devDependencies['@types/express'] = '^4.17.17';
    packageJson.devDependencies['@types/cors'] = '^2.8.13';
    packageJson.devDependencies['ts-node'] = '^10.9.1';
  }

  if (features.includes('database')) {
    packageJson.dependencies.prisma = '^5.0.0';
    packageJson.dependencies['@prisma/client'] = '^5.0.0';
  }

  await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });
  
  // Create directory structure
  const dirs = ['src', 'src/routes', 'src/middleware', 'src/utils', 'tests'];
  if (features.includes('database')) dirs.push('prisma');
  
  for (const dir of dirs) {
    await fs.ensureDir(path.join(projectPath, dir));
  }
  
  // Create main server file
  const extension = features.includes('typescript') ? 'ts' : 'js';
  const serverContent = createExpressServerContent(features, extension);
  await fs.writeFile(path.join(projectPath, `src/index.${extension}`), serverContent);
  
  if (features.includes('typescript')) {
    await fs.writeJson(path.join(projectPath, 'tsconfig.json'), {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'node',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    }, { spaces: 2 });
  }
}

async function createFullStackProject(projectPath: string, features: string[]) {
  await fs.ensureDir(projectPath);
  
  // Create monorepo structure
  const dirs = ['frontend', 'backend', 'shared', 'docs'];
  for (const dir of dirs) {
    await fs.ensureDir(path.join(projectPath, dir));
  }
  
  // Create root package.json
  await fs.writeJson(path.join(projectPath, 'package.json'), {
    name: path.basename(projectPath),
    version: '1.0.0',
    private: true,
    workspaces: ['frontend', 'backend', 'shared'],
    scripts: {
      'dev': 'concurrently "npm run dev:frontend" "npm run dev:backend"',
      'dev:frontend': 'cd frontend && npm run dev',
      'dev:backend': 'cd backend && npm run dev',
      'build': 'npm run build:shared && npm run build:frontend && npm run build:backend',
      'build:frontend': 'cd frontend && npm run build',
      'build:backend': 'cd backend && npm run build',
      'build:shared': 'cd shared && npm run build'
    },
    devDependencies: {
      concurrently: '^8.0.0'
    }
  }, { spaces: 2 });
  
  // Create frontend (React)
  await execAsync(`cd "${path.join(projectPath, 'frontend')}" && npx create-react-app . ${features.includes('typescript') ? '--template typescript' : ''}`);
  
  // Create backend (Express)
  await createExpressProject(path.join(projectPath, 'backend'), features);
  
  if (features.includes('docker')) {
    await createDockerFiles(projectPath);
  }
}

function createExpressServerContent(features: string[], extension: string): string {
  const isTS = extension === 'ts';
  const importSyntax = isTS ? "import express from 'express';" : "const express = require('express');";
  
  return `${importSyntax}
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err${isTS ? ': any' : ''}, req${isTS ? ': any' : ''}, res${isTS ? ': any' : ''}, next${isTS ? ': any' : ''}) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

export default app;`;
}

async function createDockerFiles(projectPath: string) {
  // Dockerfile for backend
  const backendDockerfile = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]`;

  await fs.writeFile(path.join(projectPath, 'backend/Dockerfile'), backendDockerfile);
  
  // Docker compose
  const dockerCompose = `version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - db
      
  frontend:
    build: ./frontend
    ports:
      - "3001:3000"
      
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
      
volumes:
  postgres_data:`;

  await fs.writeFile(path.join(projectPath, 'docker-compose.yml'), dockerCompose);
}

async function getAllFiles(dirPath: string, recursive: boolean, filter?: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(currentPath: string) {
    const items = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(currentPath, item.name);
      
      if (item.isDirectory() && recursive) {
        await scan(fullPath);
      } else if (item.isFile()) {
        if (!filter || path.extname(item.name) === filter) {
          files.push(fullPath);
        }
      }
    }
  }
  
  await scan(dirPath);
  return files;
}

async function searchInFiles(searchPath: string, pattern: string, fileTypes: string[], caseSensitive: boolean): Promise<any[]> {
  const results: any[] = [];
  const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  
  const files = await getAllFiles(searchPath, true);
  
  for (const file of files) {
    if (fileTypes.length > 0 && !fileTypes.includes(path.extname(file))) {
      continue;
    }
    
    try {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const matches = line.match(regex);
        if (matches) {
          results.push({
            file,
            line: index + 1,
            content: line.trim(),
            matches: matches.length
          });
        }
      });
    } catch (error) {
      // Skip files that can't be read as text
    }
  }
  
  return results;
}