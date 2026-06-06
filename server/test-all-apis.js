import { MongoClient } from 'mongodb';
import http from 'http';

const options1 = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/dashboard/analytics?workspaceId=684402c2fd2cd4eb6521b386',
  method: 'GET',
};

const req1 = http.request(options1, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log("/api/dashboard/analytics:", data));
});
req1.end();

const options2 = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/workspaces/684402c2fd2cd4eb6521b386/metrics/followers',
  method: 'GET',
};

const req2 = http.request(options2, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log("/api/workspaces/.../metrics/followers:", data));
});
req2.end();

const options3 = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/social-accounts?workspaceId=684402c2fd2cd4eb6521b386',
  method: 'GET',
};

const req3 = http.request(options3, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log("/api/social-accounts:", data.substring(0, 500)));
});
req3.end();
