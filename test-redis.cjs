const Redis = require('ioredis');
const url = process.env.REDIS_URL || 'redis://localhost:6379';
const r1 = new Redis(url, { maxRetriesPerRequest: null });
console.log('r1 options:', r1.options);
const r2 = new Redis(r1.options);
r1.disconnect(); r2.disconnect();
