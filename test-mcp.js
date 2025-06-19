#!/usr/bin/env node

// Simple test script to verify MCP server is working
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("MCP Software Engineer Server Test");
console.log("=================================");

// Test 1: Start the server and check if it lists tools
const serverPath = join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath]);

let outputBuffer = '';
let errorBuffer = '';

server.stdout.on('data', (data) => {
  outputBuffer += data.toString();
});

server.stderr.on('data', (data) => {
  errorBuffer += data.toString();
  console.log(data.toString());
});

// Give server time to start
setTimeout(() => {
  if (errorBuffer.includes('Total tools loaded: 49')) {
    console.log('✅ Server started successfully with all 49 tools!');
  } else {
    console.log('❌ Server did not load all tools correctly');
  }
  
  // Send a test request (this is a simplified test)
  const testRequest = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 1
  }) + '\n';
  
  server.stdin.write(testRequest);
  
  // Wait for response and then kill server
  setTimeout(() => {
    server.kill();
    console.log('\n✅ MCP Software Engineer Server test completed!');
  }, 2000);
}, 2000);

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
});
