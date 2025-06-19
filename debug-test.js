#!/usr/bin/env node

console.log('Starting debug test...');

try {
  // Try to load the server module
  import('./dist/index.js').then(() => {
    console.log('Server module loaded successfully');
  }).catch(error => {
    console.error('Error loading server:', error);
    console.error('Stack:', error.stack);
  });
} catch (error) {
  console.error('Sync error:', error);
}
