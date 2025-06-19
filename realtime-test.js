#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🚀 MCP Software Engineer Real-Time Test");
console.log("=====================================\n");

// Start the MCP server
const serverPath = join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath]);

let responseBuffer = '';

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // Process complete JSON-RPC responses
  const lines = responseBuffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      try {
        const response = JSON.parse(line);
        console.log('📥 Response:', JSON.stringify(response, null, 2));
        console.log('---');
      } catch (e) {
        // Not a complete JSON response yet
      }
    }
  }
  responseBuffer = lines[lines.length - 1];
});

server.stderr.on('data', (data) => {
  console.log('🔧 Server:', data.toString().trim());
});

// Helper function to send JSON-RPC request
function sendRequest(method, params = {}, id = Math.floor(Math.random() * 10000)) {
  const request = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id
  }) + '\n';
  
  console.log('📤 Request:', method, params);
  server.stdin.write(request);
}

// Wait for server to start
setTimeout(async () => {
  console.log("\n🧪 Starting Real-Time Tests...\n");
  
  // Test 1: List all tools
  console.log("Test 1: Listing all available tools");
  sendRequest('tools/list');
  
  await sleep(1000);
  
  // Test 2: Create a test directory
  console.log("\nTest 2: Creating a test directory");
  sendRequest('tools/call', {
    name: 'create_directory',
    arguments: {
      path: '/tmp/mcp-test',
      structure: ['src', 'tests', 'docs']
    }
  });
  
  await sleep(1000);
  
  // Test 3: Write a test file
  console.log("\nTest 3: Writing a test file");
  sendRequest('tools/call', {
    name: 'write_file',
    arguments: {
      path: '/tmp/mcp-test/src/hello.js',
      content: `// Test file created by MCP
console.log('Hello from MCP Software Engineer!');

function greet(name) {
  return \`Hello, \${name}!\`;
}

module.exports = { greet };`,
      backup: false
    }
  });
  
  await sleep(1000);
  
  // Test 4: Read the file back
  console.log("\nTest 4: Reading the test file");
  sendRequest('tools/call', {
    name: 'read_file',
    arguments: {
      path: '/tmp/mcp-test/src/hello.js'
    }
  });
  
  await sleep(1000);
  
  // Test 5: List files in directory
  console.log("\nTest 5: Listing files in test directory");
  sendRequest('tools/call', {
    name: 'list_files',
    arguments: {
      path: '/tmp/mcp-test',
      recursive: true
    }
  });
  
  await sleep(1000);
  
  // Test 6: Search for text in files
  console.log("\nTest 6: Searching for 'Hello' in files");
  sendRequest('tools/call', {
    name: 'search_files',
    arguments: {
      path: '/tmp/mcp-test',
      pattern: 'Hello'
    }
  });
  
  await sleep(2000);
  
  // Test 7: Create a simple React component (testing web dev tools)
  console.log("\nTest 7: Creating a React component");
  sendRequest('tools/call', {
    name: 'create_component',
    arguments: {
      name: 'TestButton',
      framework: 'react',
      type: 'functional',
      projectPath: '/tmp/mcp-test',
      styling: 'css'
    }
  });
  
  await sleep(2000);
  
  // Cleanup and exit
  console.log("\n🧹 Cleaning up test files...");
  try {
    await fs.rm('/tmp/mcp-test', { recursive: true, force: true });
    console.log("✅ Test directory cleaned up");
  } catch (e) {
    console.log("⚠️  Could not clean up test directory:", e.message);
  }
  
  console.log("\n✅ All tests completed!");
  console.log("📊 Summary: Tested 7 different MCP tools in real-time");
  
  server.kill();
  process.exit(0);
}, 2000);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

server.on('exit', (code) => {
  console.log(`\n🛑 Server exited with code ${code}`);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n⚡ Interrupted, cleaning up...');
  server.kill();
  process.exit(0);
});
