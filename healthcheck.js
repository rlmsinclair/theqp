// THE QP - Docker Health Check Script
// Used by Docker to determine if the container is healthy

const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0); // Healthy
  } else {
    process.exit(1); // Unhealthy
  }
});

req.on('error', (err) => {
  console.error('Health check failed:', err.message);
  process.exit(1); // Unhealthy
});

req.on('timeout', () => {
  console.error('Health check timed out');
  req.destroy();
  process.exit(1); // Unhealthy
});

req.end();