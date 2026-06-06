const fetch = require('node-fetch');

async function run() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    console.log("Fetching...");
    const res = await fetch('http://localhost:5000/api/content/workspace/123', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'post',
        title: 'test',
        description: 'test'
      }),
      signal: controller.signal
    });
    console.log(res.status);
    const text = await res.text();
    console.log(text);
  } catch(e) {
    console.error(e.name, e.message);
  } finally {
    clearTimeout(timeout);
  }
}
run();
