import IORedis from 'ioredis';

async function main() {
  const connection = new IORedis('rediss://default:gQAAAAAAAhuFAAIgcDJlYThmN2ZhYzUxN2I0ZDNkYWZhY2E2OWIxZjQ2NGJlYg@literate-swan-138117.upstash.io:6379', {
    tls: { rejectUnauthorized: false }
  });
  const prioritized = await connection.zrange('bull:message-processing:prioritized', 0, -1);
  console.log("Prioritized:", prioritized);
  process.exit(0);
}
main();
