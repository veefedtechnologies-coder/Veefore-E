# Redis Cloud Setup Guide

## 🚀 Quick Setup with Upstash Redis (Free)

### Step 1: Create Upstash Account
1. Go to https://upstash.com/
2. Sign up for free account
3. Create a new Redis database
4. Copy your connection details

### Step 2: Update Environment Variables

Add these to your `.env` file:

```bash
# Redis Configuration
REDIS_HOST=your-upstash-redis-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-upstash-redis-password
REDIS_TLS=true

# Or use Redis URL format (recommended)
REDIS_URL=rediss://default:your-password@your-host.upstash.io:6379
```

### Step 3: Test Connection

Your app will automatically connect to Redis when you restart it.

## 🔧 Alternative: Redis Cloud

1. Go to https://redis.com/try-free/
2. Sign up for free account
3. Create a new database
4. Use the connection details in your `.env` file

## ✅ Benefits of Cloud Redis

- ✅ No local installation needed
- ✅ Always available
- ✅ Free tier available
- ✅ Automatic backups
- ✅ High availability
- ✅ Easy to scale

## 🚨 Important Notes

- Keep your Redis credentials secure
- Use TLS/SSL for production
- Monitor your usage on free tier
- Consider upgrading for production use
