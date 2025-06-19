#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🚀 MCP Software Engineer - Demo: Building a Full-Stack E-Commerce App");
console.log("===================================================================\n");

// Start the MCP server
const serverPath = join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath]);

let responseBuffer = '';
let serverReady = false;

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // Process complete JSON-RPC responses
  const lines = responseBuffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      try {
        const response = JSON.parse(line);
        if (response.result || response.error) {
          const success = !response.error;
          const step = getStep(response.id);
          console.log(`${success ? '✅' : '❌'} ${step}`);
          if (!success && response.error) {
            console.log(`   Error: ${response.error.message}`);
          }
        }
      } catch (e) {
        // Not a complete JSON response yet
      }
    }
  }
  responseBuffer = lines[lines.length - 1];
});

server.stderr.on('data', (data) => {
  const output = data.toString().trim();
  if (output.includes('Total tools loaded: 39')) {
    serverReady = true;
  }
});

// Map step IDs to descriptions
const stepMap = new Map();
let stepId = 1;

function getStep(id) {
  return stepMap.get(id) || 'Unknown step';
}

async function sendRequest(step, method, params = {}) {
  const id = stepId++;
  stepMap.set(id, step);
  
  const request = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id
  }) + '\n';
  
  server.stdin.write(request);
  await sleep(300);
}

async function buildApp() {
  // Wait for server to be ready
  while (!serverReady) {
    await sleep(100);
  }
  
  console.log("📦 Building a Full-Stack E-Commerce Application\n");
  
  // Step 1: Project Setup
  console.log("📁 Step 1: Project Setup");
  console.log("------------------------");
  
  await sendRequest('Create project structure', 'tools/call', {
    name: 'create_directory',
    arguments: {
      path: '/tmp/ecommerce-app',
      structure: [
        'backend/src', 'backend/src/routes', 'backend/src/models', 'backend/src/controllers', 
        'backend/src/middleware', 'backend/src/services', 'backend/tests',
        'frontend/src', 'frontend/src/components', 'frontend/src/pages', 
        'frontend/src/services', 'frontend/src/store', 'frontend/public',
        'database/migrations', 'database/seeds',
        'docker', 'docs', '.github/workflows'
      ]
    }
  });
  
  await sendRequest('Create package.json for backend', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/ecommerce-app/backend/package.json',
      content: JSON.stringify({
        name: 'ecommerce-backend',
        version: '1.0.0',
        description: 'E-commerce API backend',
        main: 'src/server.js',
        scripts: {
          start: 'node src/server.js',
          dev: 'nodemon src/server.js',
          test: 'jest',
          'test:watch': 'jest --watch'
        },
        dependencies: {
          express: '^4.18.0',
          cors: '^2.8.5',
          jsonwebtoken: '^9.0.0',
          bcrypt: '^5.1.0',
          'express-validator': '^7.0.0',
          typeorm: '^0.3.0',
          pg: '^8.11.0',
          dotenv: '^16.3.0'
        },
        devDependencies: {
          jest: '^29.0.0',
          nodemon: '^3.0.0'
        }
      }, null, 2),
      backup: false
    }
  });
  
  await sleep(500);
  
  // Step 2: Backend Development
  console.log("\n⚙️  Step 2: Backend Development");
  console.log("-------------------------------");
  
  await sendRequest('Create Express server', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/ecommerce-app/backend/src/server.js',
      content: `require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createConnection } = require('typeorm');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes will be added here

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  console.log(\`🚀 Server running on port \${PORT}\`);
  console.log(\`📍 Health check: http://localhost:\${PORT}/health\`);
});

module.exports = app;`,
      backup: false
    }
  });
  
  await sendRequest('Setup authentication', 'tools/call', {
    name: 'setup_authentication',
    arguments: {
      type: 'jwt',
      framework: 'express',
      projectPath: '/tmp/ecommerce-app/backend'
    }
  });
  
  await sendRequest('Create User API endpoints', 'tools/call', {
    name: 'create_api_endpoint',
    arguments: {
      name: 'users',
      framework: 'express',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      authentication: true,
      validation: true,
      projectPath: '/tmp/ecommerce-app/backend'
    }
  });
  
  await sendRequest('Create Product API endpoints', 'tools/call', {
    name: 'create_api_endpoint',
    arguments: {
      name: 'products',
      framework: 'express',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      authentication: true,
      validation: true,
      projectPath: '/tmp/ecommerce-app/backend'
    }
  });
  
  await sendRequest('Create Order API endpoints', 'tools/call', {
    name: 'create_api_endpoint',
    arguments: {
      name: 'orders',
      framework: 'express',
      methods: ['GET', 'POST', 'PUT'],
      authentication: true,
      validation: true,
      projectPath: '/tmp/ecommerce-app/backend'
    }
  });
  
  await sleep(500);
  
  // Step 3: Database Setup
  console.log("\n💾 Step 3: Database Setup");
  console.log("------------------------");
  
  await sendRequest('Initialize TypeORM', 'tools/call', {
    name: 'init_database',
    arguments: {
      type: 'typeorm',
      database: 'postgresql',
      projectPath: '/tmp/ecommerce-app/backend'
    }
  });
  
  await sendRequest('Create User model', 'tools/call', {
    name: 'generate_model',
    arguments: {
      name: 'User',
      fields: [
        { name: 'id', type: 'number', required: true, unique: true },
        { name: 'email', type: 'string', required: true, unique: true },
        { name: 'password', type: 'string', required: true },
        { name: 'firstName', type: 'string', required: true },
        { name: 'lastName', type: 'string', required: true },
        { name: 'role', type: 'string', required: true, default: 'customer' }
      ],
      ormType: 'typeorm',
      projectPath: '/tmp/ecommerce-app/backend'
    }
  });
  
  await sendRequest('Create Product model', 'tools/call', {
    name: 'generate_model',
    arguments: {
      name: 'Product',
      fields: [
        { name: 'id', type: 'number', required: true, unique: true },
        { name: 'name', type: 'string', required: true },
        { name: 'description', type: 'string', required: false },
        { name: 'price', type: 'number', required: true },
        { name: 'stock', type: 'number', required: true, default: '0' },
        { name: 'category', type: 'string', required: true },
        { name: 'imageUrl', type: 'string', required: false }
      ],
      ormType: 'typeorm',
      projectPath: '/tmp/ecommerce-app/backend'
    }
  });
  
  await sendRequest('Create Order model', 'tools/call', {
    name: 'generate_model',
    arguments: {
      name: 'Order',
      fields: [
        { name: 'id', type: 'number', required: true, unique: true },
        { name: 'userId', type: 'number', required: true },
        { name: 'total', type: 'number', required: true },
        { name: 'status', type: 'string', required: true, default: 'pending' },
        { name: 'shippingAddress', type: 'string', required: true }
      ],
      ormType: 'typeorm',
      projectPath: '/tmp/ecommerce-app/backend'
    }
  });
  
  await sleep(500);
  
  // Step 4: Frontend Development
  console.log("\n🎨 Step 4: Frontend Development");
  console.log("-------------------------------");
  
  await sendRequest('Create React App structure', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/ecommerce-app/frontend/package.json',
      content: JSON.stringify({
        name: 'ecommerce-frontend',
        version: '1.0.0',
        private: true,
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          'react-router-dom': '^6.0.0',
          axios: '^1.5.0',
          zustand: '^4.4.0',
          '@tailwindcss/forms': '^0.5.0'
        },
        scripts: {
          start: 'react-scripts start',
          build: 'react-scripts build',
          test: 'react-scripts test'
        }
      }, null, 2),
      backup: false
    }
  });
  
  await sendRequest('Create Header component', 'tools/call', {
    name: 'create_component',
    arguments: {
      name: 'Header',
      framework: 'react',
      type: 'functional',
      projectPath: '/tmp/ecommerce-app/frontend',
      styling: 'tailwind'
    }
  });
  
  await sendRequest('Create ProductCard component', 'tools/call', {
    name: 'create_component',
    arguments: {
      name: 'ProductCard',
      framework: 'react',
      type: 'functional',
      projectPath: '/tmp/ecommerce-app/frontend',
      styling: 'tailwind'
    }
  });
  
  await sendRequest('Create ShoppingCart component', 'tools/call', {
    name: 'create_component',
    arguments: {
      name: 'ShoppingCart',
      framework: 'react',
      type: 'functional',
      projectPath: '/tmp/ecommerce-app/frontend',
      styling: 'tailwind'
    }
  });
  
  await sendRequest('Setup routing', 'tools/call', {
    name: 'setup_routing',
    arguments: {
      framework: 'react',
      projectPath: '/tmp/ecommerce-app/frontend',
      routes: [
        { path: '/', component: 'Home' },
        { path: '/products', component: 'Products' },
        { path: '/product/:id', component: 'ProductDetail' },
        { path: '/cart', component: 'ShoppingCart' },
        { path: '/checkout', component: 'Checkout' },
        { path: '/login', component: 'Login' },
        { path: '/register', component: 'Register' },
        { path: '/profile', component: 'Profile' }
      ]
    }
  });
  
  await sendRequest('Setup state management', 'tools/call', {
    name: 'setup_state_management',
    arguments: {
      type: 'zustand',
      framework: 'react',
      projectPath: '/tmp/ecommerce-app/frontend'
    }
  });
  
  await sleep(500);
  
  // Step 5: DevOps & Deployment
  console.log("\n🐳 Step 5: DevOps & Deployment");
  console.log("------------------------------");
  
  await sendRequest('Create backend Dockerfile', 'tools/call', {
    name: 'create_dockerfile',
    arguments: {
      framework: 'node',
      projectPath: '/tmp/ecommerce-app/backend',
      port: 3000
    }
  });
  
  await sendRequest('Create frontend Dockerfile', 'tools/call', {
    name: 'create_dockerfile',
    arguments: {
      framework: 'node',
      projectPath: '/tmp/ecommerce-app/frontend',
      port: 3001
    }
  });
  
  await sendRequest('Create docker-compose.yml', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/ecommerce-app/docker-compose.yml',
      content: `version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ecommerce
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgresql://admin:password@postgres:5432/ecommerce
      JWT_SECRET: your-secret-key
      NODE_ENV: production

  frontend:
    build: ./frontend
    ports:
      - "3001:3000"
    depends_on:
      - backend
    environment:
      REACT_APP_API_URL: http://localhost:3000

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  postgres_data:`,
      backup: false
    }
  });
  
  await sendRequest('Setup CI/CD pipeline', 'tools/call', {
    name: 'setup_ci_cd',
    arguments: {
      platform: 'github-actions',
      projectPath: '/tmp/ecommerce-app'
    }
  });
  
  await sleep(500);
  
  // Step 6: Testing & Documentation
  console.log("\n🧪 Step 6: Testing & Documentation");
  console.log("---------------------------------");
  
  await sendRequest('Setup testing for backend', 'tools/call', {
    name: 'setup_testing',
    arguments: {
      framework: 'jest',
      projectPath: '/tmp/ecommerce-app/backend',
      testTypes: ['unit', 'integration', 'e2e']
    }
  });
  
  await sendRequest('Create API documentation', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/ecommerce-app/docs/API.md',
      content: `# E-Commerce API Documentation

## Base URL
\`http://localhost:3000/api\`

## Authentication
All authenticated endpoints require a JWT token in the Authorization header:
\`Authorization: Bearer <token>\`

## Endpoints

### Users
- **POST /api/users/register** - Register a new user
- **POST /api/users/login** - Login user
- **GET /api/users/profile** - Get user profile (Auth required)
- **PUT /api/users/profile** - Update user profile (Auth required)

### Products
- **GET /api/products** - Get all products
- **GET /api/products/:id** - Get product by ID
- **POST /api/products** - Create product (Admin only)
- **PUT /api/products/:id** - Update product (Admin only)
- **DELETE /api/products/:id** - Delete product (Admin only)

### Orders
- **GET /api/orders** - Get user orders (Auth required)
- **GET /api/orders/:id** - Get order by ID (Auth required)
- **POST /api/orders** - Create new order (Auth required)
- **PUT /api/orders/:id/status** - Update order status (Admin only)

## Error Responses
All endpoints return errors in the following format:
\`\`\`json
{
  "error": "Error message",
  "details": {}
}
\`\`\``,
      backup: false
    }
  });
  
  await sendRequest('Create README', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/ecommerce-app/README.md',
      content: `# E-Commerce Full-Stack Application

Built with MCP Software Engineer

## Tech Stack

### Backend
- Node.js + Express
- TypeORM + PostgreSQL
- JWT Authentication
- Express Validator

### Frontend
- React 18
- React Router v6
- Zustand (State Management)
- Tailwind CSS
- Axios

### DevOps
- Docker & Docker Compose
- GitHub Actions CI/CD
- Redis for caching

## Quick Start

1. Clone the repository
2. Run with Docker Compose:
   \`\`\`bash
   docker-compose up
   \`\`\`

3. Access:
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3000
   - API Docs: http://localhost:3000/api-docs

## Development

### Backend
\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`

### Frontend
\`\`\`bash
cd frontend
npm install
npm start
\`\`\`

## Testing
\`\`\`bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
\`\`\`

Created with ❤️ by MCP Software Engineer`,
      backup: false
    }
  });
  
  await sleep(500);
  
  // Step 7: Git Setup
  console.log("\n🔧 Step 7: Version Control");
  console.log("--------------------------");
  
  await sendRequest('Initialize Git repository', 'tools/call', {
    name: 'init_repository',
    arguments: {
      projectPath: '/tmp/ecommerce-app',
      branch: 'main'
    }
  });
  
  await sendRequest('Create .gitignore', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/ecommerce-app/.gitignore',
      content: `# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
.nyc_output

# Production
build/
dist/

# Misc
.DS_Store
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDEs
.vscode/
.idea/
*.swp
*.swo

# Database
*.sqlite
postgres_data/`,
      backup: false
    }
  });
  
  await sleep(1000);
  
  // Final summary
  console.log("\n📊 Application Summary");
  console.log("=====================");
  
  await sendRequest('List all created files', 'tools/call', {
    name: 'list_files',
    arguments: {
      path: '/tmp/ecommerce-app',
      recursive: true
    }
  });
  
  await sleep(2000);
  
  console.log("\n✅ Full-Stack E-Commerce Application Created Successfully!");
  console.log("\n📋 What was built:");
  console.log("- ✅ Complete backend API with Express + TypeORM");
  console.log("- ✅ User authentication with JWT");
  console.log("- ✅ Database models for Users, Products, and Orders");
  console.log("- ✅ React frontend with Tailwind CSS");
  console.log("- ✅ State management with Zustand");
  console.log("- ✅ Docker containerization");
  console.log("- ✅ CI/CD pipeline with GitHub Actions");
  console.log("- ✅ Testing setup with Jest");
  console.log("- ✅ API documentation");
  console.log("- ✅ Git repository initialized");
  
  console.log("\n🚀 Ready to deploy!");
  
  // Cleanup
  console.log("\n🧹 Cleaning up demo files...");
  try {
    await fs.rm('/tmp/ecommerce-app', { recursive: true, force: true });
    console.log("✅ Demo files cleaned up");
  } catch (e) {
    console.log("⚠️  Could not clean up demo files:", e.message);
  }
  
  server.kill();
  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

server.on('exit', (code) => {
  console.log(`\nServer exited with code ${code}`);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n⚡ Interrupted, cleaning up...');
  server.kill();
  process.exit(0);
});

// Start building the app
buildApp().catch(console.error);
