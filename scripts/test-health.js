#!/usr/bin/env node

/**
 * Test script for health check endpoint
 * Run this locally to verify the health check works correctly
 * 
 * Usage: node scripts/test-health.js
 */

const http = require('http');

const HOST = 'localhost';
const PORT = process.env.PORT || 3000;
const PATH = '/api/health';

console.log(`Testing health check endpoint: http://${HOST}:${PORT}${PATH}`);
console.log('Make sure your local server is running with: npm run dev\n');

const options = {
  hostname: HOST,
  port: PORT,
  path: PATH,
  method: 'GET',
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Health Check Response:');
    try {
      const result = JSON.parse(data);
      console.log(JSON.stringify(result, null, 2));
      
      // Display detailed test results
      console.log('\nTest Results:');
      console.log(`- Storage Available: ${result.storage === 'available' ? '✅' : '❌'}`);
      console.log(`- Short URL Created: ${result.shortUrlCreated ? '✅' : '❌'}`);
      console.log(`- Short URL Retrieved: ${result.shortUrlRetrieved ? '✅' : '❌'}`);

      if (result.redirectWorks !== undefined) {
        console.log(`- Redirect Testing: ${result.redirectWorks ? '✅' : '❌'}`);
        if (result.redirectEndpoint) {
          console.log(`  Redirect URL: ${result.redirectEndpoint}`);
        }
      }

      if (result.errors && result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(error => console.log(`- ${error}`));
      }

      if (result.status === 'healthy') {
        console.log('\n✅ Overall health check: PASSED!');
        process.exit(0);
      } else {
        console.log('\n❌ Overall health check: FAILED!');
        process.exit(1);
      }
    } catch (e) {
      console.error('Error parsing response:', e);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`\n❌ Request failed: ${e.message}`);
  process.exit(1);
});

req.end();