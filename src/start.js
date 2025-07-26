#!/usr/bin/env node

console.log('=== THE QP STARTUP DEBUG ===');
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT);
console.log('Current directory:', process.cwd());
console.log('Script location:', __filename);

try {
  console.log('Loading server module...');
  require('./server');
} catch (err) {
  console.error('FATAL ERROR during startup:');
  console.error(err.stack || err);
  process.exit(1);
}