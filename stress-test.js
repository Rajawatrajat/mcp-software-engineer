#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🔥 MCP Software Engineer - Stress Test");
console.log("====================================\n");

// Test configuration
const TEST_CONFIG = {
  concurrentRequests: 50,
  totalRequests: 500,
  largeFileSize: 5 * 1024 * 1024, // 5MB
  maliciousInputs: [
    { path: '../../../etc/passwd' },
    { path: '/etc/passwd' },
    { path: 'C:\\Windows\\System32\\config\\SAM' },
    { content: 'a'.repeat(20 * 1024 * 1024) }, // 20MB string
    { name: 'test; rm -rf /' },
    { query: "'; DROP TABLE users; --" },
    { path: '\0malicious' },
    { name: '../../evil' }
  ],
  testDuration: 60000 // 1 minute
};

// Statistics tracking
const stats = {
  requests: 0,
  successes: 0,
  failures: 0,
  errors: new Map(),
  responseTimes: [],
  memoryUsage: [],
  startTime: Date.now()
};

// Start server
console.log('🚀 Starting MCP server...');
const server = spawn('node', [join(__dirname, 'dist', 'index.js')], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    MAX_MEMORY_MB: '256',
    RATE_LIMIT_WINDOW_MS: '1000',
    RATE_LIMIT_MAX_REQUESTS: '10'
  }
});

let serverReady = false;
const pendingRequests = new Map();
let requestId = 0;

// Handle server output
server.stdout.on('data', (data) => {
  const output = data.toString();
  
  // Parse JSON-RPC responses
  const lines = output.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const response = JSON.parse(line);
      const startTime = pendingRequests.get(response.id);
      
      if (startTime) {
        const responseTime = Date.now() - startTime;
        stats.responseTimes.push(responseTime);
        pendingRequests.delete(response.id);
        
        if (response.result) {
          stats.successes++;
        } else if (response.error) {
          stats.failures++;
          const errorKey = response.error.message || 'Unknown error';
          stats.errors.set(errorKey, (stats.errors.get(errorKey) || 0) + 1);
        }
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }
});

server.stderr.on('data', (data) => {
  const output = data.toString();
  if (output.includes('Software Engineer MCP Server running')) {
    serverReady = true;
    console.log('✅ Server is ready');
    runStressTests();
  }
});

// Test functions
async function makeRequest(method, params) {
  const id = ++requestId;
  stats.requests++;
  
  const request = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: method,
      arguments: params
    },
    id
  }) + '\n';
  
  pendingRequests.set(id, Date.now());
  server.stdin.write(request);
}

async function runStressTests() {
  console.log('\n🏃 Running stress tests...\n');
  
  // Test 1: Concurrent file operations
  console.log('Test 1: Concurrent file operations');
  const testDir = join(__dirname, 'stress-test-temp');
  await fs.mkdir(testDir, { recursive: true });
  
  const filePromises = [];
  for (let i = 0; i < TEST_CONFIG.concurrentRequests; i++) {
    filePromises.push((async () => {
      const fileName = `test-${uuidv4()}.txt`;
      const filePath = join(testDir, fileName);
      
      // Write file
      await makeRequest('write_file', {
        path: filePath,
        content: `Test content ${i}\n`.repeat(100)
      });
      
      // Read file
      await makeRequest('read_file', { path: filePath });
      
      // List files
      if (i % 10 === 0) {
        await makeRequest('list_files', { 
          path: testDir,
          recursive: true 
        });
      }
    })());
  }
  
  await Promise.all(filePromises);
  console.log('✅ Concurrent file operations completed');
  
  // Test 2: Large file handling
  console.log('\nTest 2: Large file handling');
  const largeContent = 'x'.repeat(TEST_CONFIG.largeFileSize);
  const largeFilePath = join(testDir, 'large-file.txt');
  
  await makeRequest('write_file', {
    path: largeFilePath,
    content: largeContent
  });
  
  await makeRequest('read_file', { path: largeFilePath });
  console.log('✅ Large file handling completed');
  
  // Test 3: Malicious inputs
  console.log('\nTest 3: Security - Malicious inputs');
  for (const input of TEST_CONFIG.maliciousInputs) {
    await makeRequest('read_file', input);
    await makeRequest('write_file', { ...input, content: 'test' });
    await makeRequest('create_directory', input);
  }
  console.log('✅ Malicious input testing completed');
  
  // Test 4: Rate limiting
  console.log('\nTest 4: Rate limiting');
  const rateLimitPromises = [];
  for (let i = 0; i < 50; i++) {
    rateLimitPromises.push(makeRequest('read_file', { 
      path: './package.json' 
    }));
  }
  await Promise.all(rateLimitPromises);
  console.log('✅ Rate limiting test completed');
  
  // Test 5: Memory stress
  console.log('\nTest 5: Memory stress');
  const memoryInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    stats.memoryUsage.push(memUsage.heapUsed / 1024 / 1024);
  }, 1000);
  
  // Create many small requests
  const memoryPromises = [];
  for (let i = 0; i < 200; i++) {
    memoryPromises.push((async () => {
      const data = { index: i, data: 'x'.repeat(10000) };
      await makeRequest('create_directory', {
        path: join(testDir, `dir-${i}`),
        structure: Array(10).fill(0).map((_, j) => `subdir-${j}`)
      });
    })());
  }
  
  await Promise.all(memoryPromises);
  clearInterval(memoryInterval);
  console.log('✅ Memory stress test completed');
  
  // Test 6: Complex operations
  console.log('\nTest 6: Complex operations');
  
  // Test project creation
  await makeRequest('create_project', {
    name: 'stress-test-project',
    type: 'express',
    path: testDir,
    features: ['typescript', 'database', 'testing']
  });
  
  // Test API endpoint
  await makeRequest('test_api', {
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    method: 'GET'
  });
  
  console.log('✅ Complex operations completed');
  
  // Test 7: Sustained load
  console.log('\nTest 7: Sustained load for 30 seconds');
  const sustainedStartTime = Date.now();
  const sustainedPromises = [];
  
  while (Date.now() - sustainedStartTime < 30000) {
    sustainedPromises.push(makeRequest('read_file', { 
      path: './package.json' 
    }));
    
    if (sustainedPromises.length >= 10) {
      await Promise.race(sustainedPromises);
      sustainedPromises.length = 0;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('✅ Sustained load test completed');
  
  // Wait for pending requests
  console.log('\n⏳ Waiting for pending requests...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Cleanup
  await fs.rm(testDir, { recursive: true, force: true });
  
  // Generate report
  generateReport();
}

function generateReport() {
  console.log('\n📊 Stress Test Report');
  console.log('===================\n');
  
  const duration = (Date.now() - stats.startTime) / 1000;
  const avgResponseTime = stats.responseTimes.length > 0
    ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
    : 0;
  
  const sortedResponseTimes = [...stats.responseTimes].sort((a, b) => a - b);
  const p50 = sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.5)] || 0;
  const p90 = sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.9)] || 0;
  const p99 = sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.99)] || 0;
  
  console.log(`Total Requests: ${stats.requests}`);
  console.log(`Successful: ${stats.successes} (${((stats.successes / stats.requests) * 100).toFixed(2)}%)`);
  console.log(`Failed: ${stats.failures} (${((stats.failures / stats.requests) * 100).toFixed(2)}%)`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Requests/sec: ${(stats.requests / duration).toFixed(2)}`);
  
  console.log('\n⏱️  Response Times:');
  console.log(`Average: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`P50: ${p50}ms`);
  console.log(`P90: ${p90}ms`);
  console.log(`P99: ${p99}ms`);
  console.log(`Min: ${Math.min(...stats.responseTimes)}ms`);
  console.log(`Max: ${Math.max(...stats.responseTimes)}ms`);
  
  if (stats.memoryUsage.length > 0) {
    console.log('\n💾 Memory Usage:');
    console.log(`Average: ${(stats.memoryUsage.reduce((a, b) => a + b, 0) / stats.memoryUsage.length).toFixed(2)}MB`);
    console.log(`Peak: ${Math.max(...stats.memoryUsage).toFixed(2)}MB`);
  }
  
  if (stats.errors.size > 0) {
    console.log('\n❌ Errors:');
    for (const [error, count] of stats.errors.entries()) {
      console.log(`  ${error}: ${count} occurrences`);
    }
  }
  
  // Performance assessment
  console.log('\n🎯 Performance Assessment:');
  
  const successRate = (stats.successes / stats.requests) * 100;
  if (successRate >= 99) {
    console.log('✅ Excellent reliability (>99% success rate)');
  } else if (successRate >= 95) {
    console.log('⚠️  Good reliability (>95% success rate)');
  } else {
    console.log('❌ Poor reliability (<95% success rate)');
  }
  
  if (avgResponseTime < 100) {
    console.log('✅ Excellent response time (<100ms average)');
  } else if (avgResponseTime < 500) {
    console.log('⚠️  Good response time (<500ms average)');
  } else {
    console.log('❌ Poor response time (>500ms average)');
  }
  
  if (p99 < 1000) {
    console.log('✅ Good tail latency (P99 <1s)');
  } else {
    console.log('❌ Poor tail latency (P99 >1s)');
  }
  
  const peakMemory = Math.max(...stats.memoryUsage);
  if (peakMemory < 200) {
    console.log('✅ Good memory usage (<200MB)');
  } else if (peakMemory < 400) {
    console.log('⚠️  Moderate memory usage (<400MB)');
  } else {
    console.log('❌ High memory usage (>400MB)');
  }
  
  // Overall verdict
  console.log('\n🏁 Overall Result:');
  if (successRate >= 99 && avgResponseTime < 100 && peakMemory < 200) {
    console.log('✅ PASSED - Server is production-ready!');
  } else if (successRate >= 95 && avgResponseTime < 500 && peakMemory < 400) {
    console.log('⚠️  PASSED WITH WARNINGS - Server needs optimization');
  } else {
    console.log('❌ FAILED - Server needs significant improvements');
  }
  
  // Kill server
  console.log('\n🛑 Shutting down server...');
  server.kill('SIGTERM');
  
  setTimeout(() => {
    process.exit(successRate >= 95 ? 0 : 1);
  }, 2000);
}

// Error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  server.kill();
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.error('❌ Test timeout exceeded');
  generateReport();
}, TEST_CONFIG.testDuration * 2);
