import IORedis from 'ioredis';

async function main() {
  const connection = new IORedis('rediss://default:gQAAAAAAAhuFAAIgcDJlYThmN2ZhYzUxN2I0ZDNkYWZhY2E2OWIxZjQ2NGJlYg@literate-swan-138117.upstash.io:6379', {
    tls: { rejectUnauthorized: false }
  });
  const keys = await connection.keys('*');
  console.log("All Redis Keys:", keys);
  process.exit(0);
}
main();
