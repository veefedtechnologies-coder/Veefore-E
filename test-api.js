const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('http://localhost:5000/api/content/workspace/123');
    console.log(res.status);
  } catch (err) {
    console.error(err);
  }
}
test();
