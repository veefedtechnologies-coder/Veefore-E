import IORedis from 'ioredis';

async function main() {
  const connection = new IORedis('rediss://default:gQAAAAAAAhuFAAIgcDJlYThmN2ZhYzUxN2I0ZDNkYWZhY2E2OWIxZjQ2NGJlYg@literate-swan-138117.upstash.io:6379', {
    tls: { rejectUnauthorized: false }
  });
  const type = await connection.type('bull:message-processing:message-684402c2fd2cd4eb6521b386-1779943675132');
  console.log("Type:", type);
  const data = await connection.hgetall('bull:message-processing:message-684402c2fd2cd4eb6521b386-1779943675132');
  console.log("Data:", data);
  process.exit(0);
}
main();
