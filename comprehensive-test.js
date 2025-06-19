#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🚀 MCP Software Engineer - Comprehensive Integration Test");
console.log("======================================================\n");

// Start the MCP server
const serverPath = join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath]);

let responseBuffer = '';
let testResults = [];
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
          const testName = getTestName(response.id);
          console.log(`${success ? '✅' : '❌'} ${testName}: ${success ? 'PASSED' : 'FAILED'}`);
          if (!success) {
            console.log(`   Error: ${response.error.message}`);
          }
          if (success && response.result?.content?.[0]?.text) {
            console.log(`   Result: ${response.result.content[0].text.substring(0, 100)}...`);
          }
          testResults.push({ test: testName, success });
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
    console.log('✅ Server started with all 39 tools loaded!');
    serverReady = true;
  }
});

// Map test IDs to test names
const testMap = new Map();
let testId = 1;

function getTestName(id) {
  return testMap.get(id) || 'Unknown test';
}

async function sendRequest(testName, method, params = {}) {
  const id = testId++;
  testMap.set(id, testName);
  
  const request = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id
  }) + '\n';
  
  server.stdin.write(request);
  
  // Wait for response
  await sleep(500);
}

// Wait for server to be ready
async function waitForServer() {
  let attempts = 0;
  while (!serverReady && attempts < 20) {
    await sleep(100);
    attempts++;
  }
  if (!serverReady) {
    console.error('❌ Server failed to start!');
    process.exit(1);
  }
}

async function runTests() {
  await waitForServer();
  console.log("\n🧪 Starting Comprehensive Tests...\n");
  
  // Test Suite 1: File System Operations
  console.log("📁 Test Suite 1: File System Operations");
  console.log("----------------------------------------");
  
  await sendRequest('1.1 Create project structure', 'tools/call', {
    name: 'create_directory',
    arguments: {
      path: '/tmp/mcp-full-test',
      structure: ['src', 'src/components', 'src/entities', 'src/routes', 'src/models', 'tests', 'docs', 'config', 'public']
    }
  });
  
  await sendRequest('1.2 Write README', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/mcp-full-test/README.md',
      content: `# MCP Full Test Project

This project demonstrates all capabilities of the MCP Software Engineer server.

## Features
- Full-stack development
- Database integration
- Testing suite
- Docker deployment
- CI/CD pipeline

Created by MCP Software Engineer v1.0.0`,
      backup: false
    }
  });
  
  await sendRequest('1.3 Read README back', 'tools/call', {
    name: 'read_file',
    arguments: {
      path: '/tmp/mcp-full-test/README.md'
    }
  });
  
  await sendRequest('1.4 List project files', 'tools/call', {
    name: 'list_files',
    arguments: {
      path: '/tmp/mcp-full-test',
      recursive: true
    }
  });
  
  await sendRequest('1.5 Search in files', 'tools/call', {
    name: 'search_files',
    arguments: {
      path: '/tmp/mcp-full-test',
      pattern: 'MCP'
    }
  });
  
  await sleep(1000);
  
  // Test Suite 2: Backend Development
  console.log("\n⚙️ Test Suite 2: Backend Development");
  console.log("------------------------------------");
  
  await sendRequest('2.1 Create Express server', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/mcp-full-test/src/server.js',
      content: `const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Routes will be added here

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

module.exports = app;`,
      backup: false
    }
  });
  
  await sendRequest('2.2 Create API endpoints', 'tools/call', {
    name: 'create_api_endpoint',
    arguments: {
      name: 'products',
      framework: 'express',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      authentication: true,
      validation: true,
      projectPath: '/tmp/mcp-full-test'
    }
  });
  
  await sendRequest('2.3 Setup authentication', 'tools/call', {
    name: 'setup_authentication',
    arguments: {
      type: 'jwt',
      framework: 'express',
      projectPath: '/tmp/mcp-full-test'
    }
  });
  
  await sendRequest('2.4 Setup logging', 'tools/call', {
    name: 'setup_logging',
    arguments: {
      framework: 'express',
      projectPath: '/tmp/mcp-full-test',
      options: {
        level: 'info',
        format: 'json'
      }
    }
  });
  
  await sleep(1000);
  
  // Test Suite 3: Database Operations
  console.log("\n💾 Test Suite 3: Database Operations");
  console.log("------------------------------------");
  
  // First ensure entities directory exists
  await sendRequest('3.0 Ensure entities directory', 'tools/call', {
    name: 'create_directory',
    arguments: {
      path: '/tmp/mcp-full-test/src/entities',
      structure: []
    }
  });
  
  await sendRequest('3.1 Initialize database', 'tools/call', {
    name: 'init_database',
    arguments: {
      type: 'typeorm',
      database: 'postgresql',
      projectPath: '/tmp/mcp-full-test'
    }
  });
  
  await sendRequest('3.2 Generate User model', 'tools/call', {
    name: 'generate_model',
    arguments: {
      name: 'User',
      fields: [
        { name: 'id', type: 'number', required: true, unique: true },
        { name: 'email', type: 'string', required: true, unique: true },
        { name: 'username', type: 'string', required: true, unique: true },
        { name: 'password', type: 'string', required: true },
        { name: 'firstName', type: 'string', required: false },
        { name: 'lastName', type: 'string', required: false }
      ],
      ormType: 'typeorm',
      projectPath: '/tmp/mcp-full-test'
    }
  });
  
  await sendRequest('3.3 Generate Product model', 'tools/call', {
    name: 'generate_model',
    arguments: {
      name: 'Product',
      fields: [
        { name: 'id', type: 'number', required: true, unique: true },
        { name: 'name', type: 'string', required: true },
        { name: 'description', type: 'string', required: false },
        { name: 'price', type: 'number', required: true },
        { name: 'stock', type: 'number', required: true, default: '0' }
      ],
      ormType: 'typeorm',
      projectPath: '/tmp/mcp-full-test'
    }
  });
  
  await sleep(1000);
  
  // Test Suite 4: Frontend Development
  console.log("\n🎨 Test Suite 4: Frontend Development");
  console.log("-------------------------------------");
  
  await sendRequest('4.1 Create React Button component', 'tools/call', {
    name: 'create_component',
    arguments: {
      name: 'Button',
      framework: 'react',
      type: 'functional',
      projectPath: '/tmp/mcp-full-test',
      styling: 'css',
      withTests: true
    }
  });
  
  await sendRequest('4.2 Create UserProfile component', 'tools/call', {
    name: 'create_component',
    arguments: {
      name: 'UserProfile',
      framework: 'react',
      type: 'functional',
      projectPath: '/tmp/mcp-full-test',
      styling: 'tailwind',
      withTests: false
    }
  });
  
  await sendRequest('4.3 Setup routing', 'tools/call', {
    name: 'setup_routing',
    arguments: {
      framework: 'react',
      projectPath: '/tmp/mcp-full-test',
      routes: [
        { path: '/', component: 'Home' },
        { path: '/products', component: 'Products' },
        { path: '/profile', component: 'UserProfile' }
      ]
    }
  });
  
  await sendRequest('4.4 Setup state management', 'tools/call', {
    name: 'setup_state_management',
    arguments: {
      type: 'zustand',
      framework: 'react',
      projectPath: '/tmp/mcp-full-test'
    }
  });
  
  await sleep(1000);
  
  // Test Suite 5: DevOps & Deployment
  console.log("\n🐳 Test Suite 5: DevOps & Deployment");
  console.log("------------------------------------");
  
  await sendRequest('5.1 Create Dockerfile', 'tools/call', {
    name: 'create_dockerfile',
    arguments: {
      framework: 'node',
      projectPath: '/tmp/mcp-full-test',
      port: 3000
    }
  });
  
  await sendRequest('5.2 Setup CI/CD pipeline', 'tools/call', {
    name: 'setup_ci_cd',
    arguments: {
      platform: 'github-actions',
      projectPath: '/tmp/mcp-full-test'
    }
  });
  
  await sleep(1000);
  
  // Test Suite 6: Testing & Quality
  console.log("\n🧪 Test Suite 6: Testing & Quality");
  console.log("----------------------------------");
  
  await sendRequest('6.1 Setup testing framework', 'tools/call', {
    name: 'setup_testing',
    arguments: {
      framework: 'jest',
      projectPath: '/tmp/mcp-full-test',
      testTypes: ['unit', 'integration', 'e2e']
    }
  });
  
  await sendRequest('6.2 Create unit test', 'tools/call', {
    name: 'create_test',
    arguments: {
      name: 'UserService',
      type: 'unit',
      framework: 'jest',
      projectPath: '/tmp/mcp-full-test',
      targetFile: 'src/services/UserService.js'
    }
  });
  
  await sendRequest('6.3 Security scan', 'tools/call', {
    name: 'security_scan',
    arguments: {
      projectPath: '/tmp/mcp-full-test',
      type: 'dependencies'
    }
  });
  
  await sleep(1000);
  
  // Test Suite 7: Git Operations
  console.log("\n🔧 Test Suite 7: Git Operations");
  console.log("-------------------------------");
  
  await sendRequest('7.1 Initialize Git repository', 'tools/call', {
    name: 'init_repository',
    arguments: {
      projectPath: '/tmp/mcp-full-test',
      branch: 'main'
    }
  });
  
  await sendRequest('7.2 Create feature branch', 'tools/call', {
    name: 'create_branch',
    arguments: {
      name: 'feature/user-authentication',
      projectPath: '/tmp/mcp-full-test',
      fromBranch: 'main'
    }
  });
  
  await sendRequest('7.3 Setup Git hooks', 'tools/call', {
    name: 'setup_hooks',
    arguments: {
      projectPath: '/tmp/mcp-full-test',
      hooks: ['pre-commit', 'pre-push'],
      tools: ['eslint', 'prettier']
    }
  });
  
  await sleep(1000);
  
  // Test Suite 8: Advanced Features
  console.log("\n🚀 Test Suite 8: Advanced Features");
  console.log("----------------------------------");
  
  await sendRequest('8.1 Setup caching', 'tools/call', {
    name: 'setup_cache',
    arguments: {
      type: 'redis',
      projectPath: '/tmp/mcp-full-test',
      config: {
        host: 'localhost',
        port: 6379
      }
    }
  });
  
  await sendRequest('8.2 Setup message queue', 'tools/call', {
    name: 'setup_queue',
    arguments: {
      type: 'redis',
      projectPath: '/tmp/mcp-full-test',
      queues: ['email', 'notifications', 'background-jobs']
    }
  });
  
  await sendRequest('8.3 Setup monitoring', 'tools/call', {
    name: 'setup_monitoring',
    arguments: {
      tool: 'prometheus',
      projectPath: '/tmp/mcp-full-test'
    }
  });
  
  await sendRequest('8.4 Integrate AI', 'tools/call', {
    name: 'integrate_ai',
    arguments: {
      service: 'openai',
      projectPath: '/tmp/mcp-full-test',
      features: ['chat', 'embeddings', 'completions']
    }
  });
  
  await sleep(2000);
  
  // Final verification
  console.log("\n📋 Final Verification");
  console.log("--------------------");
  
  await sendRequest('9.1 List all project files', 'tools/call', {
    name: 'list_files',
    arguments: {
      path: '/tmp/mcp-full-test',
      recursive: true
    }
  });
  
  await sleep(2000);
  
  // Summary
  console.log("\n📊 Test Summary");
  console.log("===============");
  const passed = testResults.filter(r => r.success).length;
  const failed = testResults.filter(r => !r.success).length;
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED! MCP Software Engineer is fully operational!");
  } else {
    console.log("\n⚠️  Some tests failed. Failed tests:");
    testResults.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.test}`);
    });
  }
  
  // Cleanup
  console.log("\n🧹 Cleaning up test files...");
  try {
    await fs.rm('/tmp/mcp-full-test', { recursive: true, force: true });
    console.log("✅ Test files cleaned up");
  } catch (e) {
    console.log("⚠️  Could not clean up test files:", e.message);
  }
  
  server.kill();
  process.exit(failed === 0 ? 0 : 1);
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

// Start tests
runTests().catch(console.error);
