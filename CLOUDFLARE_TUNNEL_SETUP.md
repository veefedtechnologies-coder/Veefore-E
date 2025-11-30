# Cloudflare Tunnel Setup

## Quick Command

Use IPv4 to target the unified app on port 5000 and avoid ::1 issues:

```
cloudflared tunnel --url http://127.0.0.1:5000 --edge-ip-version 4
```

## Named Tunnel (recommended)

```
cloudflared tunnel login
cloudflared tunnel create veefore-webhook
cloudflared tunnel route dns veefore-webhook veefore-webhook.veefore.com
```

Configure `cloudflared/config.yml`:

```
tunnel: veefore-webhook
credentials-file: C:\Users\<YOUR_USER>\.cloudflared\veefore-webhook.json
ingress:
  - hostname: veefore-webhook.veefore.com
    service: http://127.0.0.1:5000
  - service: http_status:404
```

Run:

```
cloudflared tunnel run veefore-webhook
```

## Environment

Set one of:

```
PUBLIC_URL=https://veefore-webhook.veefore.com
# or
CF_TUNNEL_HOSTNAME=veefore-webhook.veefore.com
# and for Instagram OAuth (must match the value configured in Instagram App settings exactly)
INSTAGRAM_REDIRECT_URL=https://veefore-webhook.veefore.com
```

This ensures OAuth `redirect_uri` is correct.

## Verify

- Local: `http://localhost:5000/api/health` should return OK
- Tunnel: visit `https://veefore-webhook.veefore.com` and check server logs for incoming requests
- If you see `dial tcp [::1]:5000` errors, ensure `service: http://127.0.0.1:5000` and the app listens on IPv6 `::`
