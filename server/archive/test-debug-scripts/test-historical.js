import http from 'http';

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/analytics/historical?period=month&days=30&workspaceId=684402c2fd2cd4eb6521b386',
  method: 'GET',
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log("/api/analytics/historical:", data.substring(0, 500)));
});
req.on('error', console.error);
req.end();
