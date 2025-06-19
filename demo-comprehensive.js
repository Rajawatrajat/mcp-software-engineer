#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🚀 MCP Software Engineer - Comprehensive Demo");
console.log("============================================\n");

// Start the MCP server
const serverPath = join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath]);

let requestId = 1;

// Helper function to send request
function sendRequest(method, params = {}) {
  const request = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++
  }) + '\n';
  
  server.stdin.write(request);
}

// Handle server output
server.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      
      if (response.result) {
        console.log(`✅ Response ${response.id}:`, 
          JSON.stringify(response.result, null, 2).substring(0, 200) + '...');
      }
      
      if (response.error) {
        console.log(`❌ Error ${response.id}:`, response.error.message);
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }
});

server.stderr.on('data', (data) => {
  const output = data.toString();
  if (output.includes('Server running on stdio')) {
    console.log('✅ Server started successfully\n');
    runDemo();
  }
});

async function runDemo() {
  console.log("📋 Running comprehensive demo...\n");
  
  // Test 1: List all tools
  console.log("1️⃣ Listing all available tools:");
  sendRequest('tools/list');
  
  await delay(1000);
  
  // Test 2: Create a project
  console.log("\n2️⃣ Creating a new Express project:");
  sendRequest('tools/call', {
    name: 'create_project',
    arguments: {
      name: 'demo-app',
      type: 'express',
      path: '/tmp',
      features: ['typescript', 'database', 'auth']
    }
  });
  
  await delay(2000);
  
  // Test 3: Create API endpoint
  console.log("\n3️⃣ Creating a REST API endpoint:");
  sendRequest('tools/call', {
    name: 'create_api_endpoint',
    arguments: {
      name: 'User',
      framework: 'express',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      authentication: true,
      validation: true,
      projectPath: '/tmp/demo-app'
    }
  });
  
  await delay(2000);
  
  // Test 4: Setup authentication
  console.log("\n4️⃣ Setting up JWT authentication:");
  sendRequest('tools/call', {
    name: 'setup_authentication',
    arguments: {
      type: 'jwt',
      framework: 'express',
      projectPath: '/tmp/demo-app',
      features: ['registration', 'login', 'logout']
    }
  });
  
  await delay(2000);
  
  // Test 5: Create Dockerfile
  console.log("\n5️⃣ Creating Dockerfile:");
  sendRequest('tools/call', {
    name: 'create_dockerfile',
    arguments: {
      framework: 'node',
      projectPath: '/tmp/demo-app',
      port: 3000
    }
  });
  
  await delay(2000);
  
  // Test 6: Setup CI/CD
  console.log("\n6️⃣ Setting up CI/CD pipeline:");
  sendRequest('tools/call', {
    name: 'setup_ci_cd',
    arguments: {
      platform: 'github-actions',
      projectPath: '/tmp/demo-app'
    }
  });
  
  await delay(2000);
  
  // Test 7: Create tests
  console.log("\n7️⃣ Creating test files:");
  sendRequest('tools/call', {
    name: 'create_test',
    arguments: {
      name: 'user.test',
      framework: 'jest',
      projectPath: '/tmp/demo-app',
      testType: 'unit'
    }
  });
  
  await delay(2000);
  
  // Complete demo
  console.log("\n✅ Demo completed! Check /tmp/demo-app for the generated project.");
  console.log("\n📊 Summary of tools demonstrated:");
  console.log("- Project creation with TypeScript, database, and auth");
  console.log("- RESTful API endpoint generation");
  console.log("- JWT authentication setup");
  console.log("- Docker containerization");
  console.log("- CI/CD pipeline configuration");
  console.log("- Test file generation");
  
  setTimeout(() => {
    server.kill();
    process.exit(0);
  }, 3000);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Error handling
server.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
