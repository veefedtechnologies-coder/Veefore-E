import Redis from 'ioredis';

async function testHang() {
  const client = new Redis('redis://nonexistent:6379', {
    maxRetriesPerRequest: 3,
    connectTimeout: 1000,
    retryStrategy(times) {
      return 500;
    }
  });

  console.log('Fetching...');
  const start = Date.now();
  try {
    await client.get('key');
    console.log('Success');
  } catch (e: any) {
    console.log('Error:', e.message);
  }
  console.log('Time:', Date.now() - start);
  process.exit(0);
}

testHang();
