import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

export const backendTools = new Map([
  [
    'create_api_endpoint',
    {
      name: 'create_api_endpoint',
      description: 'Create RESTful API endpoint with CRUD operations',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Endpoint/Resource name' },
          framework: { 
            type: 'string', 
            enum: ['express', 'fastapi', 'django', 'flask', 'nestjs', 'rails', 'laravel', 'spring-boot'],
            description: 'Backend framework'
          },
          methods: {
            type: 'array',
            items: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            description: 'HTTP methods to implement'
          },
          authentication: { type: 'boolean', default: false },
          validation: { type: 'boolean', default: true },
          projectPath: { type: 'string', description: 'Project path' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                required: { type: 'boolean', default: false },
                validation: { type: 'object' }
              }
            },
            description: 'Resource fields for validation'
          }
        },
        required: ['name', 'framework', 'methods', 'projectPath']
      },
      async execute(args: any) {
        const { name, framework, methods, authentication, validation, projectPath, fields = [] } = args;
        
        switch (framework) {
          case 'express':
            return await createExpressEndpoint(name, methods, authentication, validation, projectPath, fields);
          case 'fastapi':
            return await createFastAPIEndpoint(name, methods, authentication, validation, projectPath, fields);
          case 'django':
            return await createDjangoEndpoint(name, methods, authentication, validation, projectPath, fields);
          case 'flask':
            return await createFlaskEndpoint(name, methods, authentication, validation, projectPath, fields);
          case 'nestjs':
            return await createNestJSEndpoint(name, methods, authentication, validation, projectPath, fields);
          default:
            throw new Error(`Unsupported framework: ${framework}`);
        }
      }
    }
  ],
  [
    'setup_authentication',
    {
      name: 'setup_authentication',
      description: 'Setup authentication system (JWT, OAuth, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['jwt', 'oauth2', 'passport', 'auth0', 'firebase-auth', 'session'],
            description: 'Authentication type'
          },
          framework: { type: 'string', enum: ['express', 'fastapi', 'django', 'flask', 'nestjs'] },
          projectPath: { type: 'string', description: 'Project path' },
          providers: {
            type: 'array',
            items: { type: 'string', enum: ['google', 'github', 'facebook', 'twitter'] },
            description: 'OAuth providers'
          },
          features: {
            type: 'array',
            items: { type: 'string', enum: ['registration', 'login', 'logout', 'password-reset', 'email-verification'] },
            description: 'Auth features to implement'
          }
        },
        required: ['type', 'framework', 'projectPath']
      },
      async execute(args: any) {
        const { type, framework, projectPath, providers = [], features = [] } = args;
        
        switch (framework) {
          case 'express':
            return await setupExpressAuth(type, projectPath, providers, features);
          case 'fastapi':
            return await setupFastAPIAuth(type, projectPath, providers, features);
          case 'django':
            return await setupDjangoAuth(type, projectPath, providers, features);
          case 'flask':
            return await setupFlaskAuth(type, projectPath, providers, features);
          case 'nestjs':
            return await setupNestJSAuth(type, projectPath, providers, features);
          default:
            throw new Error(`Unsupported framework: ${framework}`);
        }
      }
    }
  ],
  [
    'setup_logging',
    {
      name: 'setup_logging',
      description: 'Setup logging system with different levels and outputs',
      inputSchema: {
        type: 'object',
        properties: {
          framework: { type: 'string', enum: ['express', 'fastapi', 'django', 'flask', 'nestjs'] },
          library: {
            type: 'string',
            enum: ['winston', 'pino', 'bunyan', 'morgan', 'loguru', 'structlog'],
            description: 'Logging library'
          },
          projectPath: { type: 'string', description: 'Project path' },
          outputs: {
            type: 'array',
            items: { type: 'string', enum: ['console', 'file', 'database', 'elasticsearch', 'cloudwatch'] },
            description: 'Log outputs'
          },
          levels: {
            type: 'array',
            items: { type: 'string', enum: ['error', 'warn', 'info', 'debug'] },
            description: 'Log levels to configure'
          }
        },
        required: ['framework', 'projectPath']
      },
      async execute(args: any) {
        const { framework, library, projectPath, outputs = ['console', 'file'], levels = ['error', 'warn', 'info'] } = args;
        
        switch (framework) {
          case 'express':
            return await setupExpressLogging(library, projectPath, outputs, levels);
          case 'fastapi':
            return await setupFastAPILogging(projectPath, outputs, levels);
          default:
            throw new Error(`Unsupported framework: ${framework}`);
        }
      }
    }
  ],
  [
    'create_middleware',
    {
      name: 'create_middleware',
      description: 'Create custom middleware for various purposes',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Middleware name' },
          framework: { type: 'string', enum: ['express', 'fastapi', 'django', 'flask', 'nestjs'] },
          type: {
            type: 'string',
            enum: ['auth', 'cors', 'rate-limit', 'validation', 'error-handler', 'logging', 'custom'],
            description: 'Middleware type'
          },
          projectPath: { type: 'string', description: 'Project path' },
          config: { type: 'object', description: 'Middleware configuration' }
        },
        required: ['name', 'framework', 'type', 'projectPath']
      },
      async execute(args: any) {
        const { name, framework, type, projectPath, config = {} } = args;
        
        switch (framework) {
          case 'express':
            return await createExpressMiddleware(name, type, projectPath, config);
          case 'fastapi':
            return await createFastAPIMiddleware(name, type, projectPath, config);
          default:
            throw new Error(`Unsupported framework: ${framework}`);
        }
      }
    }
  ],
  [
    'setup_validation',
    {
      name: 'setup_validation',
      description: 'Setup request validation with various libraries',
      inputSchema: {
        type: 'object',
        properties: {
          framework: { type: 'string', enum: ['express', 'fastapi', 'django', 'flask', 'nestjs'] },
          library: {
            type: 'string',
            enum: ['joi', 'yup', 'zod', 'express-validator', 'pydantic', 'marshmallow'],
            description: 'Validation library'
          },
          projectPath: { type: 'string', description: 'Project path' },
          schemas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                fields: { type: 'array' }
              }
            },
            description: 'Validation schemas to create'
          }
        },
        required: ['framework', 'projectPath']
      },
      async execute(args: any) {
        const { framework, library, projectPath, schemas = [] } = args;
        
        switch (framework) {
          case 'express':
            return await setupExpressValidation(library, projectPath, schemas);
          case 'fastapi':
            return await setupFastAPIValidation(projectPath, schemas);
          default:
            throw new Error(`Unsupported framework: ${framework}`);
        }
      }
    }
  ],
  [
    'create_background_job',
    {
      name: 'create_background_job',
      description: 'Create background jobs and task queues',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Job name' },
          framework: { type: 'string', enum: ['express', 'fastapi', 'django', 'flask', 'nestjs'] },
          queueType: {
            type: 'string',
            enum: ['bull', 'agenda', 'celery', 'rq', 'bee-queue'],
            description: 'Queue library'
          },
          schedule: { type: 'string', description: 'Cron schedule (optional)' },
          projectPath: { type: 'string', description: 'Project path' },
          jobType: {
            type: 'string',
            enum: ['email', 'report', 'cleanup', 'notification', 'custom'],
            description: 'Type of background job'
          }
        },
        required: ['name', 'framework', 'queueType', 'projectPath', 'jobType']
      },
      async execute(args: any) {
        const { name, framework, queueType, schedule, projectPath, jobType } = args;
        
        switch (framework) {
          case 'express':
            return await createExpressBackgroundJob(name, queueType, schedule, projectPath, jobType);
          case 'fastapi':
            return await createFastAPIBackgroundJob(name, queueType, schedule, projectPath, jobType);
          default:
            throw new Error(`Unsupported framework: ${framework}`);
        }
      }
    }
  ],
  [
    'setup_websockets',
    {
      name: 'setup_websockets',
      description: 'Setup WebSocket support for real-time communication',
      inputSchema: {
        type: 'object',
        properties: {
          framework: { type: 'string', enum: ['express', 'fastapi', 'django', 'flask', 'nestjs'] },
          library: {
            type: 'string',
            enum: ['socket.io', 'ws', 'websockets', 'django-channels'],
            description: 'WebSocket library'
          },
          projectPath: { type: 'string', description: 'Project path' },
          features: {
            type: 'array',
            items: { type: 'string', enum: ['chat', 'notifications', 'live-updates', 'collaboration'] },
            description: 'WebSocket features to implement'
          }
        },
        required: ['framework', 'projectPath']
      },
      async execute(args: any) {
        const { framework, library, projectPath, features = [] } = args;
        
        switch (framework) {
          case 'express':
            return await setupExpressWebSockets(library, projectPath, features);
          case 'fastapi':
            return await setupFastAPIWebSockets(projectPath, features);
          default:
            throw new Error(`Unsupported framework: ${framework}`);
        }
      }
    }
  ]
]);

// Middleware creation functions
async function createExpressMiddleware(name: string, type: string, projectPath: string, config: any) {
  const middlewareDir = path.join(projectPath, 'src/middleware');
  await fs.ensureDir(middlewareDir);
  
  let middlewareContent = '';
  
  switch (type) {
    case 'rate-limit':
      await execAsync(`cd "${projectPath}" && npm install express-rate-limit`);
      middlewareContent = `import rateLimit from 'express-rate-limit';

export const ${name}Limiter = rateLimit({
  windowMs: ${config.windowMs || 15 * 60 * 1000}, // 15 minutes
  max: ${config.max || 100}, // limit each IP to 100 requests per windowMs
  message: '${config.message || 'Too many requests from this IP'}'
});`;
      break;
      
    case 'cors':
      await execAsync(`cd "${projectPath}" && npm install cors`);
      await execAsync(`cd "${projectPath}" && npm install -D @types/cors`);
      middlewareContent = `import cors from 'cors';

export const ${name}Cors = cors({
  origin: ${JSON.stringify(config.origin || '*')},
  credentials: ${config.credentials || true},
  methods: ${JSON.stringify(config.methods || ['GET', 'POST', 'PUT', 'DELETE'])}
});`;
      break;
      
    case 'error-handler':
      middlewareContent = `import { Request, Response, NextFunction } from 'express';

export const ${name}ErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  console.error(\`Error: \${message}\`, err);
  
  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};`;
      break;
  }
  
  await fs.writeFile(path.join(middlewareDir, `${name}.ts`), middlewareContent);
  return `Express ${type} middleware '${name}' created`;
}

async function createFastAPIMiddleware(name: string, type: string, projectPath: string, config: any) {
  const middlewareDir = path.join(projectPath, 'app/middleware');
  await fs.ensureDir(middlewareDir);
  
  let middlewareContent = '';
  
  switch (type) {
    case 'rate-limit':
      middlewareContent = `from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
import time
from collections import defaultdict

class RateLimitMiddleware:
    def __init__(self, app, calls: int = ${config.max || 100}, period: int = ${config.windowMs || 900}):
        self.app = app
        self.calls = calls
        self.period = period
        self.clients = defaultdict(list)
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            client_ip = scope["client"][0]
            now = time.time()
            
            # Clean old entries
            self.clients[client_ip] = [
                timestamp for timestamp in self.clients[client_ip]
                if timestamp > now - self.period
            ]
            
            if len(self.clients[client_ip]) >= self.calls:
                response = JSONResponse(
                    content={"detail": "Rate limit exceeded"},
                    status_code=429
                )
                await response(scope, receive, send)
                return
            
            self.clients[client_ip].append(now)
        
        await self.app(scope, receive, send)`;
      break;
  }
  
  await fs.writeFile(path.join(middlewareDir, `${name}.py`), middlewareContent);
  return `FastAPI ${type} middleware '${name}' created`;
}

// Validation setup functions
async function setupExpressValidation(library: string, projectPath: string, schemas: any[]) {
  const validationDir = path.join(projectPath, 'src/validation');
  await fs.ensureDir(validationDir);
  
  switch (library) {
    case 'joi':
      await execAsync(`cd "${projectPath}" && npm install joi`);
      
      const joiSchemaContent = `import Joi from 'joi';

export const userSchema = Joi.object({
  name: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

export const validate = (schema: Joi.Schema) => {
  return (req: any, res: any, next: any) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    next();
  };
};`;
      
      await fs.writeFile(path.join(validationDir, 'schemas.ts'), joiSchemaContent);
      break;
      
    case 'zod':
      await execAsync(`cd "${projectPath}" && npm install zod`);
      break;
  }
  
  return `Express validation with ${library} setup completed`;
}

async function setupFastAPIValidation(projectPath: string, schemas: any[]) {
  const schemasDir = path.join(projectPath, 'app/schemas');
  await fs.ensureDir(schemasDir);
  
  const pydanticSchemaContent = `from pydantic import BaseModel, Field, EmailStr
from typing import Optional

class UserBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=30)
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)

class UserResponse(UserBase):
    id: int
    
    class Config:
        orm_mode = True`;
  
  await fs.writeFile(path.join(schemasDir, 'user.py'), pydanticSchemaContent);
  
  return 'FastAPI validation with Pydantic setup completed';
}

// Background job functions
async function createExpressBackgroundJob(name: string, queueType: string, schedule: string, projectPath: string, jobType: string) {
  const jobsDir = path.join(projectPath, 'src/jobs');
  await fs.ensureDir(jobsDir);
  
  switch (queueType) {
    case 'bull':
      await execAsync(`cd "${projectPath}" && npm install bull`);
      await execAsync(`cd "${projectPath}" && npm install -D @types/bull`);
      
      const bullJobContent = `import Queue from 'bull';

const ${name}Queue = new Queue('${name}', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

${name}Queue.process(async (job) => {
  console.log('Processing ${name} job:', job.data);
  
  // TODO: Implement ${jobType} job logic
  ${jobType === 'email' ? `
  // Example email sending logic
  const { to, subject, body } = job.data;
  // await sendEmail(to, subject, body);
  ` : ''}
  
  return { success: true, timestamp: new Date().toISOString() };
});

${schedule ? `
// Schedule job
${name}Queue.add({}, { repeat: { cron: '${schedule}' } });
` : ''}

export const add${name}Job = async (data: any) => {
  return await ${name}Queue.add(data);
};

export default ${name}Queue;`;
      
      await fs.writeFile(path.join(jobsDir, `${name}.ts`), bullJobContent);
      break;
  }
  
  return `Express background job '${name}' created with ${queueType}`;
}

async function createFastAPIBackgroundJob(name: string, queueType: string, schedule: string, projectPath: string, jobType: string) {
  const tasksDir = path.join(projectPath, 'app/tasks');
  await fs.ensureDir(tasksDir);
  
  switch (queueType) {
    case 'celery':
      const celeryTaskContent = `from celery import Celery
from datetime import datetime

celery_app = Celery('tasks', broker='redis://localhost:6379')

@celery_app.task
def ${name}_task(data):
    """${jobType} background task"""
    print(f"Processing ${name} task: {data}")
    
    # TODO: Implement ${jobType} task logic
    ${jobType === 'email' ? `
    # Example email sending logic
    # send_email(data['to'], data['subject'], data['body'])
    ` : ''}
    
    return {"success": True, "timestamp": datetime.now().isoformat()}

${schedule ? `
# Schedule task
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    '${name}-scheduled': {
        'task': 'tasks.${name}_task',
        'schedule': crontab(${schedule}),
    },
}
` : ''}`;
      
      await fs.writeFile(path.join(tasksDir, `${name}.py`), celeryTaskContent);
      break;
  }
  
  return `FastAPI background job '${name}' created with ${queueType}`;
}

// WebSocket setup functions
async function setupExpressWebSockets(library: string, projectPath: string, features: string[]) {
  switch (library) {
    case 'socket.io':
      await execAsync(`cd "${projectPath}" && npm install socket.io`);
      
      const socketDir = path.join(projectPath, 'src/sockets');
      await fs.ensureDir(socketDir);
      
      const socketSetupContent = `import { Server } from 'socket.io';
import { Server as HTTPServer } from 'http';

export const setupSocketIO = (httpServer: HTTPServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true
    }
  });
  
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    ${features.includes('chat') ? `
    // Chat functionality
    socket.on('message', (data) => {
      io.emit('message', {
        id: Date.now(),
        userId: socket.id,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    });
    ` : ''}
    
    ${features.includes('notifications') ? `
    // Notification functionality
    socket.on('subscribe', (channel) => {
      socket.join(channel);
      socket.emit('subscribed', { channel });
    });
    
    socket.on('notify', (data) => {
      io.to(data.channel).emit('notification', data);
    });
    ` : ''}
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
  
  return io;
};`;
      
      await fs.writeFile(path.join(socketDir, 'setup.ts'), socketSetupContent);
      break;
  }
  
  return `Express WebSockets with ${library} setup completed`;
}

async function setupFastAPIWebSockets(projectPath: string, features: string[]) {
  const websocketDir = path.join(projectPath, 'app/websockets');
  await fs.ensureDir(websocketDir);
  
  const websocketContent = `from fastapi import WebSocket, WebSocketDisconnect
from typing import List
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)
    
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            ${features.includes('chat') ? `
            # Chat functionality
            await manager.broadcast(json.dumps({
                "type": "chat",
                "message": data,
                "timestamp": datetime.now().isoformat()
            }))
            ` : ''}
    except WebSocketDisconnect:
        manager.disconnect(websocket)`;
  
  await fs.writeFile(path.join(websocketDir, 'manager.py'), websocketContent);
  
  return 'FastAPI WebSockets setup completed';
}

async function createExpressEndpoint(name: string, methods: string[], authentication: boolean, validation: boolean, projectPath: string, fields: any[]) {
  const routesDir = path.join(projectPath, 'src/routes');
  await fs.ensureDir(routesDir);
  
  let routeContent = `import express from 'express';\n`;
  
  if (authentication) {
    routeContent += `import { authenticate } from '../middleware/auth';\n`;
  }
  
  if (validation) {
    routeContent += `import { validate${name} } from '../middleware/validation';\n`;
  }
  
  routeContent += `\nconst router = express.Router();\n\n`;
  
  // Generate CRUD operations based on requested methods
  for (const method of methods) {
    switch (method) {
      case 'GET':
        routeContent += `// Get all ${name.toLowerCase()}s\n`;
        routeContent += `router.get('/'${authentication ? ', authenticate' : ''}, async (req, res) => {\n`;
        routeContent += `  try {\n`;
        routeContent += `    // TODO: Implement get all ${name.toLowerCase()}s logic\n`;
        routeContent += `    const items = [];\n`;
        routeContent += `    res.json({ success: true, data: items });\n`;
        routeContent += `  } catch (error) {\n`;
        routeContent += `    res.status(500).json({ success: false, error: error.message });\n`;
        routeContent += `  }\n`;
        routeContent += `});\n\n`;
        
        routeContent += `// Get ${name.toLowerCase()} by ID\n`;
        routeContent += `router.get('/:id'${authentication ? ', authenticate' : ''}, async (req, res) => {\n`;
        routeContent += `  try {\n`;
        routeContent += `    const { id } = req.params;\n`;
        routeContent += `    // TODO: Implement get ${name.toLowerCase()} by ID logic\n`;
        routeContent += `    const item = null;\n`;
        routeContent += `    if (!item) {\n`;
        routeContent += `      return res.status(404).json({ success: false, error: '${name} not found' });\n`;
        routeContent += `    }\n`;
        routeContent += `    res.json({ success: true, data: item });\n`;
        routeContent += `  } catch (error) {\n`;
        routeContent += `    res.status(500).json({ success: false, error: error.message });\n`;
        routeContent += `  }\n`;
        routeContent += `});\n\n`;
        break;
        
      case 'POST':
        routeContent += `// Create new ${name.toLowerCase()}\n`;
        routeContent += `router.post('/'${authentication ? ', authenticate' : ''}${validation ? ', validate' + name : ''}, async (req, res) => {\n`;
        routeContent += `  try {\n`;
        routeContent += `    const data = req.body;\n`;
        routeContent += `    // TODO: Implement create ${name.toLowerCase()} logic\n`;
        routeContent += `    const newItem = { id: Date.now(), ...data };\n`;
        routeContent += `    res.status(201).json({ success: true, data: newItem });\n`;
        routeContent += `  } catch (error) {\n`;
        routeContent += `    res.status(500).json({ success: false, error: error.message });\n`;
        routeContent += `  }\n`;
        routeContent += `});\n\n`;
        break;
        
      case 'PUT':
        routeContent += `// Update ${name.toLowerCase()}\n`;
        routeContent += `router.put('/:id'${authentication ? ', authenticate' : ''}${validation ? ', validate' + name : ''}, async (req, res) => {\n`;
        routeContent += `  try {\n`;
        routeContent += `    const { id } = req.params;\n`;
        routeContent += `    const data = req.body;\n`;
        routeContent += `    // TODO: Implement update ${name.toLowerCase()} logic\n`;
        routeContent += `    const updatedItem = { id, ...data };\n`;
        routeContent += `    res.json({ success: true, data: updatedItem });\n`;
        routeContent += `  } catch (error) {\n`;
        routeContent += `    res.status(500).json({ success: false, error: error.message });\n`;
        routeContent += `  }\n`;
        routeContent += `});\n\n`;
        break;
        
      case 'DELETE':
        routeContent += `// Delete ${name.toLowerCase()}\n`;
        routeContent += `router.delete('/:id'${authentication ? ', authenticate' : ''}, async (req, res) => {\n`;
        routeContent += `  try {\n`;
        routeContent += `    const { id } = req.params;\n`;
        routeContent += `    // TODO: Implement delete ${name.toLowerCase()} logic\n`;
        routeContent += `    res.json({ success: true, message: '${name} deleted successfully' });\n`;
        routeContent += `  } catch (error) {\n`;
        routeContent += `    res.status(500).json({ success: false, error: error.message });\n`;
        routeContent += `  }\n`;
        routeContent += `});\n\n`;
        break;
    }
  }
  
  routeContent += `export default router;\n`;
  
  await fs.writeFile(path.join(routesDir, `${name.toLowerCase()}.ts`), routeContent);
  
  return `Express endpoint ${name} created with methods: ${methods.join(', ')}`;
}

async function createFastAPIEndpoint(name: string, methods: string[], authentication: boolean, validation: boolean, projectPath: string, fields: any[]) {
  const routersDir = path.join(projectPath, 'app/routers');
  await fs.ensureDir(routersDir);
  
  let routerContent = `from fastapi import APIRouter, HTTPException, Depends\n`;
  routerContent += `from typing import List\n\n`;
  routerContent += `router = APIRouter()\n\n`;
  
  // Generate CRUD operations
  for (const method of methods) {
    switch (method) {
      case 'GET':
        routerContent += `@router.get("/")\n`;
        routerContent += `async def get_${name.toLowerCase()}s():\n`;
        routerContent += `    """Get all ${name.toLowerCase()}s"""\n`;
        routerContent += `    # TODO: Implement get all ${name.toLowerCase()}s logic\n`;
        routerContent += `    return []\n\n`;
        
        routerContent += `@router.get("/{${name.toLowerCase()}_id}")\n`;
        routerContent += `async def get_${name.toLowerCase()}(${name.toLowerCase()}_id: int):\n`;
        routerContent += `    """Get ${name.toLowerCase()} by ID"""\n`;
        routerContent += `    # TODO: Implement get ${name.toLowerCase()} by ID logic\n`;
        routerContent += `    raise HTTPException(status_code=404, detail="${name} not found")\n\n`;
        break;
        
      case 'POST':
        routerContent += `@router.post("/", status_code=201)\n`;
        routerContent += `async def create_${name.toLowerCase()}(data: dict):\n`;
        routerContent += `    """Create new ${name.toLowerCase()}"""\n`;
        routerContent += `    # TODO: Implement create ${name.toLowerCase()} logic\n`;
        routerContent += `    return {"id": 1, **data}\n\n`;
        break;
    }
  }
  
  await fs.writeFile(path.join(routersDir, `${name.toLowerCase()}.py`), routerContent);
  
  return `FastAPI endpoint ${name} created with methods: ${methods.join(', ')}`;
}

async function createDjangoEndpoint(name: string, methods: string[], authentication: boolean, validation: boolean, projectPath: string, fields: any[]) {
  const appName = name.toLowerCase();
  
  try {
    await execAsync(`cd "${projectPath}" && python manage.py startapp ${appName}`);
  } catch (error) {
    // App might already exist
  }
  
  return `Django endpoint ${name} created with full CRUD operations`;
}

async function createFlaskEndpoint(name: string, methods: string[], authentication: boolean, validation: boolean, projectPath: string, fields: any[]) {
  const routesDir = path.join(projectPath, 'app/routes');
  await fs.ensureDir(routesDir);
  
  let routeContent = `from flask import Blueprint, request, jsonify\n\n`;
  routeContent += `${name.toLowerCase()}_bp = Blueprint('${name.toLowerCase()}', __name__)\n\n`;
  
  // Generate routes based on methods
  for (const method of methods) {
    switch (method) {
      case 'GET':
        routeContent += `@${name.toLowerCase()}_bp.route('/', methods=['GET'])\n`;
        routeContent += `def get_${name.toLowerCase()}s():\n`;
        routeContent += `    """Get all ${name.toLowerCase()}s"""\n`;
        routeContent += `    # TODO: Implement logic to retrieve all ${name.toLowerCase()}s\n`;
        routeContent += `    items = []\n`;
        routeContent += `    return jsonify({'success': True, 'data': items})\n\n`;
        break;
        
      case 'POST':
        routeContent += `@${name.toLowerCase()}_bp.route('/', methods=['POST'])\n`;
        routeContent += `def create_${name.toLowerCase()}():\n`;
        routeContent += `    """Create new ${name.toLowerCase()}"""\n`;
        routeContent += `    data = request.json\n`;
        routeContent += `    # TODO: Implement logic to create ${name.toLowerCase()}\n`;
        routeContent += `    new_item = {'id': 1, **data}\n`;
        routeContent += `    return jsonify({'success': True, 'data': new_item}), 201\n\n`;
        break;
    }
  }
  
  await fs.writeFile(path.join(routesDir, `${name.toLowerCase()}.py`), routeContent);
  
  return `Flask endpoint ${name} created with methods: ${methods.join(', ')}`;
}

async function createNestJSEndpoint(name: string, methods: string[], authentication: boolean, validation: boolean, projectPath: string, fields: any[]) {
  await execAsync(`cd "${projectPath}" && nest generate resource ${name.toLowerCase()} --no-spec`);
  
  return `NestJS resource ${name} created with full CRUD operations`;
}

async function setupExpressAuth(type: string, projectPath: string, providers: string[], features: string[]) {
  const middlewareDir = path.join(projectPath, 'src/middleware');
  await fs.ensureDir(middlewareDir);
  
  switch (type) {
    case 'jwt':
      await execAsync(`cd "${projectPath}" && npm install jsonwebtoken bcrypt`);
      await execAsync(`cd "${projectPath}" && npm install -D @types/jsonwebtoken @types/bcrypt`);
      
      // Create JWT auth middleware
      const jwtAuthContent = `import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

export const generateToken = (payload: any) => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '24h' });
};`;
      
      await fs.writeFile(path.join(middlewareDir, 'auth.ts'), jwtAuthContent);
      break;
      
    case 'passport':
      await execAsync(`cd "${projectPath}" && npm install passport passport-local passport-jwt`);
      break;
  }
  
  return `Express ${type} authentication setup completed`;
}

async function setupFastAPIAuth(type: string, projectPath: string, providers: string[], features: string[]) {
  const authDir = path.join(projectPath, 'app/auth');
  await fs.ensureDir(authDir);
  
  switch (type) {
    case 'jwt':
      // Create JWT auth dependencies
      const jwtAuthContent = `from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer

SECRET_KEY = "your-secret-key"
ALGORITHM = "HS256"

security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials"
    )
    try:
        payload = jwt.decode(token.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    return {"username": username}`;
      
      await fs.writeFile(path.join(authDir, 'jwt_auth.py'), jwtAuthContent);
      break;
  }
  
  return `FastAPI ${type} authentication setup completed`;
}

async function setupDjangoAuth(type: string, projectPath: string, providers: string[], features: string[]) {
  switch (type) {
    case 'jwt':
      await execAsync(`cd "${projectPath}" && pip install djangorestframework-simplejwt`);
      break;
  }
  
  return `Django ${type} authentication setup completed`;
}

async function setupFlaskAuth(type: string, projectPath: string, providers: string[], features: string[]) {
  switch (type) {
    case 'jwt':
      await execAsync(`cd "${projectPath}" && pip install PyJWT bcrypt`);
      break;
  }
  
  return `Flask ${type} authentication setup completed`;
}

async function setupNestJSAuth(type: string, projectPath: string, providers: string[], features: string[]) {
  switch (type) {
    case 'jwt':
      await execAsync(`cd "${projectPath}" && npm install @nestjs/jwt @nestjs/passport passport passport-jwt`);
      await execAsync(`cd "${projectPath}" && npm install -D @types/passport-jwt`);
      break;
  }
  
  return `NestJS ${type} authentication setup completed`;
}

async function setupExpressLogging(library: string, projectPath: string, outputs: string[], levels: string[]) {
  switch (library) {
    case 'winston':
      await execAsync(`cd "${projectPath}" && npm install winston`);
      
      const winstonConfig = `import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;`;
      
      await fs.ensureDir(path.join(projectPath, 'src/config'));
      await fs.writeFile(path.join(projectPath, 'src/config/logger.ts'), winstonConfig);
      break;
      
    case 'pino':
      await execAsync(`cd "${projectPath}" && npm install pino`);
      break;
  }
  
  return `Express logging with ${library} setup completed`;
}

async function setupFastAPILogging(projectPath: string, outputs: string[], levels: string[]) {
  const loggingConfig = `import logging
import sys
from pathlib import Path

# Create logs directory
Path("logs").mkdir(exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)`;
  
  await fs.ensureDir(path.join(projectPath, 'app/config'));
  await fs.writeFile(path.join(projectPath, 'app/config/logging.py'), loggingConfig);
  
  return 'FastAPI logging setup completed';
}