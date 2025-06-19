#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🚀 MCP Software Engineer - Comprehensive Test");
console.log("===========================================\n");

// Start the MCP server
const serverPath = join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath]);

let responseBuffer = '';
let testResults = [];

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
    console.log('✅ Server started with all 39 tools loaded!\n');
  }
});

// Map test IDs to test names
const testMap = new Map();
let testId = 1;

function getTestName(id) {
  return testMap.get(id) || 'Unknown test';
}

function sendRequest(testName, method, params = {}) {
  const id = testId++;
  testMap.set(id, testName);
  
  const request = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id
  }) + '\n';
  
  server.stdin.write(request);
}

// Wait for server to start
setTimeout(async () => {
  console.log("Running comprehensive tests...\n");
  
  // Test 1: File System Operations
  console.log("📁 Testing File System Tools:");
  
  sendRequest('Create project directory', 'tools/call', {
    name: 'create_directory',
    arguments: {
      path: '/tmp/mcp-demo-project',
      structure: ['src', 'tests', 'docs', 'config']
    }
  });
  
  await sleep(500);
  
  sendRequest('Write package.json', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/mcp-demo-project/package.json',
      content: JSON.stringify({
        name: 'mcp-demo-project',
        version: '1.0.0',
        description: 'Demo project created by MCP',
        main: 'src/index.js',
        scripts: {
          start: 'node src/index.js',
          test: 'jest'
        }
      }, null, 2),
      backup: false
    }
  });
  
  await sleep(500);
  
  sendRequest('Write main file', 'tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/mcp-demo-project/src/index.js',
      content: `// MCP Demo Project
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello from MCP!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`,
      backup: false
    }
  });
  
  await sleep(1000);
  
  // Test 2: Web Development Tools
  console.log("\n🎨 Testing Web Development Tools:");
  
  sendRequest('Create React component', 'tools/call', {
    name: 'create_component',
    arguments: {
      name: 'Button',
      framework: 'react',
      type: 'functional',
      projectPath: '/tmp/mcp-demo-project',
      styling: 'css',
      withTests: true
    }
  });
  
  await sleep(1000);
  
  // Test 3: Database Tools
  console.log("\n💾 Testing Database Tools:");
  
  sendRequest('Generate database model', 'tools/call', {
    name: 'generate_model',
    arguments: {
      name: 'User',
      fields: [
        { name: 'id', type: 'integer', required: true, unique: true },
        { name: 'email', type: 'string', required: true, unique: true },
        { name: 'name', type: 'string', required: true },
        { name: 'createdAt', type: 'datetime', required: true }
      ],
      ormType: 'typeorm',
      projectPath: '/tmp/mcp-demo-project'
    }
  });
  
  await sleep(1000);
  
  // Test 4: Backend Tools
  console.log("\n⚙️ Testing Backend Tools:");
  
  sendRequest('Create API endpoint', 'tools/call', {
    name: 'create_api_endpoint',
    arguments: {
      name: 'users',
      framework: 'express',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      authentication: true,
      validation: true,
      projectPath: '/tmp/mcp-demo-project'
    }
  });
  
  await sleep(1000);
  
  // Test 5: DevOps Tools
  console.log("\n🐳 Testing DevOps Tools:");
  
  sendRequest('Create Dockerfile', 'tools/call', {
    name: 'create_dockerfile',
    arguments: {
      framework: 'node',
      projectPath: '/tmp/mcp-demo-project',
      port: 3000
    }
  });
  
  await sleep(1000);
  
  // Test 6: Testing Tools
  console.log("\n🧪 Testing Testing Tools:");
  
  sendRequest('Setup testing framework', 'tools/call', {
    name: 'setup_testing',
    arguments: {
      framework: 'jest',
      projectPath: '/tmp/mcp-demo-project',
      testTypes: ['unit', 'integration']
    }
  });
  
  await sleep(1000);
  
  // Test 7: Git Tools
  console.log("\n🔧 Testing Git Tools:");
  
  sendRequest('Initialize Git repository', 'tools/call', {
    name: 'init_repository',
    arguments: {
      projectPath: '/tmp/mcp-demo-project',
      branch: 'main'
    }
  });
  
  await sleep(2000);
  
  // Summary
  console.log("\n📊 Test Summary:");
  const passed = testResults.filter(r => r.success).length;
  const failed = testResults.filter(r => !r.success).length;
  console.log(`Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`);
  
  if (failed === 0) {
    console.log("\n🎉 All tests passed! MCP Software Engineer is fully operational!");
  } else {
    console.log("\n⚠️  Some tests failed. Check the errors above.");
  }
  
  // Cleanup
  console.log("\n🧹 Cleaning up...");
  try {
    await fs.rm('/tmp/mcp-demo-project', { recursive: true, force: true });
    console.log("✅ Test files cleaned up");
  } catch (e) {
    console.log("⚠️  Could not clean up test files:", e.message);
  }
  
  server.kill();
  process.exit(failed === 0 ? 0 : 1);
}, 2000);

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
