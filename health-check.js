#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🏥 MCP Software Engineer - Health Check");
console.log("=====================================\n");

// Start the MCP server
const serverPath = join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
  }
});

let serverReady = false;
let healthCheckPassed = true;
const issues = [];

// Timeout for health check
const timeout = setTimeout(() => {
  issues.push('❌ Server startup timeout (10s)');
  healthCheckPassed = false;
  performHealthCheck();
}, 10000);

server.stdout.on('data', (data) => {
  const output = data.toString();
  
  // Check for successful responses
  if (output.includes('"jsonrpc"')) {
    try {
      const response = JSON.parse(output.trim());
      
      // Tool list response
      if (response.id === 1 && response.result?.tools) {
        console.log(`✅ Server responded with ${response.result.tools.length} tools`);
        
        // Validate tool structure
        const sampleTool = response.result.tools[0];
        if (!sampleTool.name || !sampleTool.description || !sampleTool.inputSchema) {
          issues.push('❌ Tool structure validation failed');
          healthCheckPassed = false;
        } else {
          console.log('✅ Tool structure validation passed');
        }
      }
      
      // Test tool execution response
      if (response.id === 2 && response.result?.content) {
        console.log('✅ Test tool execution successful');
      }
      
      // Error response
      if (response.error) {
        issues.push(`❌ Server error: ${response.error.message}`);
        healthCheckPassed = false;
      }
      
    } catch (e) {
      // Not JSON, ignore
    }
  }
});

server.stderr.on('data', (data) => {
  const output = data.toString().trim();
  
  // Check for server ready message
  if (output.includes('Software Engineer MCP Server running on stdio')) {
    serverReady = true;
    console.log('✅ Server started successfully');
    
    // Extract tool count
    const match = output.match(/Total tools loaded: (\d+)/);
    if (match) {
      const toolCount = parseInt(match[1]);
      if (toolCount < 10) {
        issues.push(`⚠️  Only ${toolCount} tools loaded (expected more)`);
      } else {
        console.log(`✅ ${toolCount} tools loaded`);
      }
    }
    
    clearTimeout(timeout);
    runHealthTests();
  }
  
  // Check for errors
  if (output.includes('Error') || output.includes('error')) {
    if (!output.includes('console.error')) {
      issues.push(`❌ Error detected: ${output}`);
      healthCheckPassed = false;
    }
  }
});

async function runHealthTests() {
  console.log('\n📋 Running health tests...\n');
  
  // Test 1: List tools
  const listToolsRequest = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 1
  }) + '\n';
  
  server.stdin.write(listToolsRequest);
  
  // Test 2: Execute a simple tool (after delay)
  setTimeout(() => {
    const testToolRequest = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'read_file',
        arguments: {
          path: './package.json'
        }
      },
      id: 2
    }) + '\n';
    
    server.stdin.write(testToolRequest);
    
    // Complete health check after tests
    setTimeout(() => performHealthCheck(), 2000);
  }, 1000);
}

async function performHealthCheck() {
  console.log('\n🏁 Health Check Summary');
  console.log('======================\n');
  
  // Check system resources
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  console.log(`💾 Memory Usage: ${heapUsedMB}MB`);
  
  if (heapUsedMB > 200) {
    issues.push(`⚠️  High memory usage: ${heapUsedMB}MB`);
  }
  
  // Check for required directories
  const fs = await import('fs');
  const requiredDirs = ['logs', 'temp'];
  
  for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
      console.log(`📁 Creating missing directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  // Final result
  if (issues.length > 0) {
    console.log('\n⚠️  Issues detected:');
    issues.forEach(issue => console.log(`  ${issue}`));
  }
  
  if (healthCheckPassed && issues.filter(i => i.includes('❌')).length === 0) {
    console.log('\n✅ Health check PASSED! Server is healthy.');
  } else {
    console.log('\n❌ Health check FAILED! Please address the issues above.');
  }
  
  // Cleanup
  server.kill();
  process.exit(healthCheckPassed ? 0 : 1);
}

// Error handling
server.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code && code !== 0 && !serverReady) {
    console.error(`❌ Server exited with code ${code}`);
    process.exit(1);
  }
});
