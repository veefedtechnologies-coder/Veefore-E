# VeeFore Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying VeeFore in production environments. VeeFore is a React/Node.js application with MongoDB storage, designed for scalable social media management.

## Prerequisites

- Node.js 18+ 
- MongoDB Atlas account or MongoDB server
- Required API keys (see Environment Variables section)
- SSL certificate for HTTPS (recommended)

## Quick Start

1. **Clone and Build**
   ```bash
   git clone <repository-url>
   cd veefore
   npm install
   NODE_ENV=production npm run build
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

3. **Start Application**
   ```bash
   NODE_ENV=production npm start
   ```

## Deployment Methods

### Method 1: Traditional VPS/Server Deployment

#### Step 1: Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash veefore
sudo usermod -aG sudo veefore
```

#### Step 2: Application Deployment
```bash
# Switch to application user
sudo su - veefore

# Clone repository
git clone <repository-url> /home/veefore/veefore
cd /home/veefore/veefore

# Install dependencies
npm install

# Build application
NODE_ENV=production npm run build

# Configure environment variables
cp .env.example .env
nano .env  # Edit with production values
```

#### Step 3: PM2 Configuration
```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'veefore',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
EOF

# Create logs directory
mkdir -p logs

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Step 4: Nginx Configuration
```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/veefore << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Health check endpoint
    location /api/health {
        proxy_pass http://localhost:5000/api/health;
        access_log off;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/veefore /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Method 2: Docker Deployment

#### Dockerfile (Multi-stage Build)
```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN NODE_ENV=production npm run build

# Production stage
FROM node:18-alpine AS production

# Security hardening
RUN addgroup -g 1001 -S nodejs
RUN adduser -S veefore -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=veefore:nodejs /app/dist ./dist
COPY --from=builder --chown=veefore:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=veefore:nodejs /app/package.json ./

# Create uploads directory
RUN mkdir -p uploads && chown veefore:nodejs uploads

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

USER veefore
EXPOSE 5000

CMD ["node", "dist/index.js"]
```

#### Docker Compose
```yaml
version: '3.8'

services:
  veefore:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
      - FIREBASE_PRIVATE_KEY=${FIREBASE_PRIVATE_KEY}
      - FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL}
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    restart: unless-stopped
    depends_on:
      - mongodb
    
  mongodb:
    image: mongo:6.0
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_ROOT_USERNAME}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
    volumes:
      - mongodb_data:/data/db
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - veefore
    restart: unless-stopped

volumes:
  mongodb_data:
```

### Method 3: Vercel Deployment

#### vercel.json
```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    },
    {
      "src": "dist/public/**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/dist/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "/dist/public/$1"
    }
  ],
  "functions": {
    "dist/index.js": {
      "maxDuration": 30
    }
  }
}
```

#### Deployment Commands
```bash
# Install Vercel CLI
npm install -g vercel

# Build for production
NODE_ENV=production npm run build

# Deploy
vercel --prod
```

## Environment Variables

**For detailed OAuth environment variables configuration**, see [docs/OAUTH_ENVIRONMENT_VARIABLES.md](docs/OAUTH_ENVIRONMENT_VARIABLES.md)

### Required Variables
```env
# Application
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/veefore

# Firebase Authentication
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com

# OpenAI
OPENAI_API_KEY=sk-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# SendGrid
SENDGRID_API_KEY=SG....

# Instagram
INSTAGRAM_CLIENT_ID=your-client-id
INSTAGRAM_CLIENT_SECRET=your-client-secret
INSTAGRAM_REDIRECT_URI=https://your-domain.com/api/instagram/callback

# Google OAuth (Server-Side Authentication)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
OAUTH_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
SESSION_SECRET=your-cryptographically-random-32-char-secret

# Additional APIs
ANTHROPIC_API_KEY=sk-ant-...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=your-secret
```

### Optional Variables
```env
# Monitoring
SENTRY_DSN=https://...
LOG_LEVEL=info

# Performance
REDIS_URL=redis://localhost:6379
ENABLE_CACHING=true

# Security
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
```

## Build Configuration

### Custom Build Script
The application includes a custom build script (`build-production.js`) that:
- Builds the client with Vite
- Builds the server with esbuild
- Excludes development dependencies
- Creates production-ready package.json
- Handles static file serving

### Manual Build Steps
```bash
# 1. Build client
npx vite build

# 2. Build server
npx esbuild server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outdir=dist \
  --external:./vite \
  --external:vite \
  --external:@replit/vite-plugin-cartographer

# 3. Copy static files
cp -r dist/public/* dist/

# 4. Create production package.json
# (See build-production.js for details)
```

## Database Setup

### MongoDB Atlas
1. Create MongoDB Atlas account
2. Create cluster
3. Configure IP whitelist
4. Create database user
5. Get connection string

### Local MongoDB
```bash
# Install MongoDB
sudo apt install -y mongodb

# Start MongoDB
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Create database and user
mongo
> use veefore
> db.createUser({
    user: "veefore",
    pwd: "secure-password",
    roles: ["readWrite"]
  })
```

## SSL Configuration

### Let's Encrypt (Free SSL)
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Custom SSL Certificate
```bash
# Create SSL directory
sudo mkdir -p /etc/nginx/ssl

# Copy certificates
sudo cp your-certificate.crt /etc/nginx/ssl/
sudo cp your-private-key.key /etc/nginx/ssl/

# Update Nginx configuration
sudo nano /etc/nginx/sites-available/veefore
```

## Monitoring and Logging

### Health Checks
```bash
# Application health
curl https://your-domain.com/api/health

# Database health
curl https://your-domain.com/api/health | jq '.services.database'

# Automated monitoring
*/5 * * * * curl -f https://your-domain.com/api/health || echo "Health check failed"
```

### Log Management
```bash
# View PM2 logs
pm2 logs veefore

# View application logs
tail -f logs/combined.log

# Rotate logs
pm2 install pm2-logrotate
```

## Performance Optimization

### CDN Configuration
```javascript
// In your application
const CDN_URL = process.env.CDN_URL || 'https://your-cdn.com';
```

### Database Optimization
```javascript
// MongoDB connection with optimization
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};
```

### Caching Strategy
```javascript
// Redis caching
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);
```

## Security Considerations

### Firewall Configuration
```bash
# UFW setup
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Environment Security
```bash
# Secure .env file
chmod 600 .env
chown veefore:veefore .env
```

### API Security
- Rate limiting implemented
- CORS configured
- Input validation
- JWT token authentication
- Webhook signature verification

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Clear cache
   rm -rf node_modules package-lock.json
   npm install
   
   # Check Node.js version
   node --version  # Should be 18+
   ```

2. **Database Connection Issues**
   ```bash
   # Test MongoDB connection
   mongo "mongodb+srv://cluster.mongodb.net/veefore" --username your-username
   
   # Check network connectivity
   telnet cluster.mongodb.net 27017
   ```

3. **API Errors**
   ```bash
   # Check logs
   pm2 logs veefore
   
   # Validate environment variables
   printenv | grep -E "(OPENAI|STRIPE|FIREBASE)"
   ```

4. **Static File Issues**
   ```bash
   # Verify build output
   ls -la dist/public/
   
   # Check Nginx configuration
   sudo nginx -t
   ```

### Debug Mode
```bash
# Enable debug logging
DEBUG=* NODE_ENV=production npm start

# Or specific modules
DEBUG=express:*,mongodb:* npm start
```

## Maintenance

### Regular Tasks
```bash
# Update dependencies
npm update

# Rebuild application
NODE_ENV=production npm run build
pm2 restart veefore

# Database maintenance
# (Run during low traffic periods)
```

### Backup Strategy
```bash
# MongoDB backup
mongodump --uri="mongodb+srv://..." --out=/backups/$(date +%Y%m%d)

# Application backup
tar -czf /backups/veefore-$(date +%Y%m%d).tar.gz /home/veefore/veefore
```

## Support

For deployment issues:
1. Check logs: `pm2 logs veefore`
2. Verify environment variables
3. Test health endpoint: `/api/health`
4. Check database connectivity
5. Review Nginx configuration

## Production Checklist

- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Monitoring setup
- [ ] Backups configured
- [ ] Health checks working
- [ ] PM2 process management
- [ ] Nginx reverse proxy
- [ ] Log rotation enabled
- [ ] Security hardening complete

---

**Note**: This guide assumes Ubuntu/Debian systems. Adjust commands for other Linux distributions accordingly.