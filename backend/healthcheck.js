#!/usr/bin/env node

/**
 * Health Check Utility for NearChat Backend
 * Used by Docker health checks and system monitoring
 */

const http = require('http');
const { URL } = require('url');

// Configuration
const config = {
  host: process.env.HOST || 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  timeout: 5000,
  interval: 30000
};

// Health check function
function performHealthCheck() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: config.host,
      port: config.port,
      path: config.path,
      method: 'GET',
      timeout: config.timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const healthData = JSON.parse(data);
          
          if (res.statusCode === 200 && healthData.status === 'healthy') {
            resolve({
              status: 'healthy',
              timestamp: new Date().toISOString(),
              response: healthData
            });
          } else {
            reject(new Error(`Health check failed: ${healthData.status || 'unknown'}`));
          }
        } catch (error) {
          reject(new Error(`Invalid health check response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Health check request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });

    req.end();
  });
}

// Main execution
async function main() {
  try {
    const result = await performHealthCheck();
    console.log('Health check passed:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Health check failed:', error.message);
    process.exit(1);
  }
}

// Run health check if called directly
if (require.main === module) {
  main();
}

module.exports = {
  performHealthCheck,
  config
};