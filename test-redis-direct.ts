import Redis from 'ioredis';
import 'dotenv/config';

console.log('Testing Redis connection to:', process.env.REDIS_URL);

const redis = new Redis(process.env.REDIS_URL as string, {
  tls: { rejectUnauthorized: false }
});

redis.on('connect', () => console.log('CONNECTED!'));
redis.on('error', (err) => console.log('ERROR:', err.message));

setTimeout(() => {
  console.log('Timeout - closing');
  redis.disconnect();
  process.exit(0);
}, 3000);
