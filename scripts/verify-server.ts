import express from 'express'

const app = express()

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'cloudflared-origin', ts: Date.now() })
})

app.get('/', (_req, res) => {
  res.send('OK')
})

const port = 5000
app.listen(port, '::', () => {
  console.log(`verify-server listening on ${port}`)
})

