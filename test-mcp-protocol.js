import { spawn } from 'child_process';

// Start the MCP server
const mcpServer = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Handle server output
mcpServer.stdout.on('data', (data) => {
  console.log('Server response:', data.toString());
});

mcpServer.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

// Send initialization request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {}
    },
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  }
};

console.log('Sending initialization request...');
mcpServer.stdin.write(JSON.stringify(initRequest) + '\n');

// Send list tools request after a delay
setTimeout(() => {
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  };
  
  console.log('Sending list tools request...');
  mcpServer.stdin.write(JSON.stringify(listToolsRequest) + '\n');
}, 1000);

// Close after 3 seconds
setTimeout(() => {
  mcpServer.kill();
  process.exit(0);
}, 3000);
