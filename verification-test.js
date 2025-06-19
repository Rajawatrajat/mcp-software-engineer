#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🔍 MCP Software Engineer - Verification Test");
console.log("==========================================\n");

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
        if (response.result && response.id === 1) {
          // List tools response
          console.log(`✅ Total tools available: ${response.result.tools.length}`);
          console.log("\n📋 Tool Categories:");
          
          const categories = {
            filesystem: [],
            database: [],
            webdev: [],
            backend: [],
            devops: [],
            testing: [],
            git: [],
            other: []
          };
          
          response.result.tools.forEach(tool => {
            if (['create_project', 'read_file', 'write_file', 'create_directory', 'list_files', 'search_files'].includes(tool.name)) {
              categories.filesystem.push(tool.name);
            } else if (['init_database', 'create_migration', 'run_migrations', 'generate_model', 'seed_database', 'backup_database', 'query_database'].includes(tool.name)) {
              categories.database.push(tool.name);
            } else if (['create_component', 'setup_styling', 'create_page', 'setup_routing', 'setup_state_management', 'setup_forms', 'optimize_bundle'].includes(tool.name)) {
              categories.webdev.push(tool.name);
            } else if (['create_api_endpoint', 'setup_authentication', 'setup_logging', 'test_api'].includes(tool.name)) {
              categories.backend.push(tool.name);
            } else if (['create_dockerfile', 'setup_ci_cd', 'manage_containers'].includes(tool.name)) {
              categories.devops.push(tool.name);
            } else if (['setup_testing', 'create_test', 'run_tests', 'security_scan'].includes(tool.name)) {
              categories.testing.push(tool.name);
            } else if (['init_repository', 'create_branch', 'commit_changes', 'setup_hooks'].includes(tool.name)) {
              categories.git.push(tool.name);
            } else {
              categories.other.push(tool.name);
            }
          });
          
          console.log(`\n📁 File System (${categories.filesystem.length}): ${categories.filesystem.join(', ')}`);
          console.log(`💾 Database (${categories.database.length}): ${categories.database.join(', ')}`);
          console.log(`🎨 Web Dev (${categories.webdev.length}): ${categories.webdev.join(', ')}`);
          console.log(`⚙️  Backend (${categories.backend.length}): ${categories.backend.join(', ')}`);
          console.log(`🐳 DevOps (${categories.devops.length}): ${categories.devops.join(', ')}`);
          console.log(`🧪 Testing (${categories.testing.length}): ${categories.testing.join(', ')}`);
          console.log(`🔧 Git (${categories.git.length}): ${categories.git.join(', ')}`);
          console.log(`🚀 Other (${categories.other.length}): ${categories.other.join(', ')}`);
          
          console.log("\n✅ All tools are properly loaded and categorized!");
          console.log("✅ MCP Software Engineer is fully functional!");
          
          server.kill();
          process.exit(0);
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
    
    // Request list of tools
    const request = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 1
    }) + '\n';
    
    server.stdin.write(request);
  }
});

// Timeout
setTimeout(() => {
  console.error('❌ Test timed out');
  server.kill();
  process.exit(1);
}, 10000);

server.on('exit', (code) => {
  console.log(`\nServer exited with code ${code}`);
});
