# VeeFore Vercel Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying VeeFore on Vercel, including serverless configuration, environment setup, and optimization strategies.

## Prerequisites

- Vercel account (free tier available)
- GitHub repository with VeeFore code
- MongoDB Atlas database
- Required API keys and credentials

## Quick Deployment

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy from Repository
```bash
# Clone repository
git clone <your-repository-url>
cd veefore

# Deploy to Vercel
vercel --prod
```

## Configuration Files

### vercel.json
```json
{
  "version": 2,
  "name": "veefore",
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node",
      "config": {
        "maxLambdaSize": "50mb"
      }
    },
    {
      "src": "dist/public/**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/webhooks/(.*)",
      "dest": "/dist/index.js",
      "methods": ["POST"]
    },
    {
      "src": "/api/(.*)",
      "dest": "/dist/index.js"
    },
    {
      "src": "/uploads/(.*)",
      "dest": "/dist/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "/dist/public/$1"
    }
  ],
  "functions": {
    "dist/index.js": {
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "env": {
    "NODE_ENV": "production"
  },
  "regions": ["iad1"]
}
```

### package.json Scripts
```json
{
  "scripts": {
    "build": "NODE_ENV=production node build-production.js",
    "vercel-build": "NODE_ENV=production npm run build",
    "start": "NODE_ENV=production node dist/index.js",
    "dev": "NODE_ENV=development tsx server/index.ts"
  }
}
```

## Environment Variables Setup

### In Vercel Dashboard
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add the following variables:

#### Required Variables
```env
NODE_ENV=production
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/veefore
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@project.iam.gserviceaccount.com
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SENDGRID_API_KEY=SG....
INSTAGRAM_CLIENT_ID=your-client-id
INSTAGRAM_CLIENT_SECRET=your-client-secret
INSTAGRAM_REDIRECT_URI=https://your-domain.vercel.app/api/instagram/callback
ANTHROPIC_API_KEY=sk-ant-...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=your-secret
```

#### Optional Variables
```env
SENTRY_DSN=https://...
LOG_LEVEL=info
VERCEL_URL=your-domain.vercel.app
```

### Using Vercel CLI
```bash
# Set environment variables via CLI
vercel env add NODE_ENV production
vercel env add DATABASE_URL "mongodb+srv://..."
vercel env add OPENAI_API_KEY "sk-..."
# ... continue for all variables
```

## Build Configuration

### Custom Build Process
The deployment uses a custom build script that:
1. Builds the client with Vite
2. Compiles the server with esbuild
3. Optimizes for serverless deployment
4. Handles static file serving

### Build Script Modifications
```javascript
// build-production.js modifications for Vercel
const isVercel = process.env.VERCEL === '1';

if (isVercel) {
  // Vercel-specific optimizations
  console.log('🚀 Building for Vercel deployment...');
  
  // Skip PM2 and server-specific configurations
  // Focus on serverless optimizations
}
```

## File Upload Handling

### Vercel Limitations
- File uploads are limited to 50MB
- Files are not persistent between deployments
- Recommended: Use external storage (AWS S3, Cloudinary)

### S3 Integration (Recommended)
```javascript
// server/upload-handler.js
import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

export const uploadToS3 = async (file, key) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: file.mimetype
  };
  
  return s3.upload(params).promise();
};
```

## Database Configuration

### MongoDB Atlas Setup
1. **Create Cluster**: Use MongoDB Atlas for production
2. **Network Access**: Allow access from `0.0.0.0/0` for Vercel
3. **Database User**: Create user with read/write permissions
4. **Connection String**: Use in `DATABASE_URL` environment variable

### Connection Optimization
```javascript
// server/mongodb-connection.js
import mongoose from 'mongoose';

const connectDB = async () => {
  if (mongoose.connections[0].readyState) {
    return;
  }

  try {
    await mongoose.connect(process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      bufferMaxEntries: 0
    });
    
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

export default connectDB;
```

## Domain Configuration

### Custom Domain Setup
1. **Add Domain**: In Vercel dashboard, add your custom domain
2. **DNS Configuration**: Point your domain to Vercel's nameservers
3. **SSL Certificate**: Automatically provisioned by Vercel
4. **Update Environment Variables**: Update redirect URIs to use custom domain

### Domain Examples
```env
# For custom domain
INSTAGRAM_REDIRECT_URI=https://yourdomain.com/api/instagram/callback

# For Vercel domain
INSTAGRAM_REDIRECT_URI=https://your-project.vercel.app/api/instagram/callback
```

## Performance Optimization

### Serverless Optimization
```javascript
// server/serverless-optimizations.js
import { performance } from 'perf_hooks';

// Connection pooling for serverless
let cachedDb = null;

export const getDatabase = async () => {
  if (cachedDb) {
    return cachedDb;
  }
  
  const start = performance.now();
  cachedDb = await connectDB();
  const duration = performance.now() - start;
  
  console.log(`Database connection established in ${duration}ms`);
  return cachedDb;
};

// Minimize cold starts
export const warmupFunction = async () => {
  await getDatabase();
  return { status: 'warm' };
};
```

### Static Asset Optimization
```javascript
// vite.config.ts for Vercel
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/public',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['date-fns', 'zod']
        }
      }
    }
  }
});
```

## Monitoring and Debugging

### Vercel Analytics
```javascript
// pages/_app.tsx
import { Analytics } from '@vercel/analytics/react';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
```

### Error Monitoring
```javascript
// server/error-handler.js
export const errorHandler = (error, req, res, next) => {
  console.error('Error occurred:', error);
  
  // Log to external service in production
  if (process.env.NODE_ENV === 'production') {
    // Send to Sentry, LogRocket, etc.
  }
  
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.headers['x-vercel-id']
  });
};
```

### Health Check Endpoint
```javascript
// server/health-check.js
export const healthCheck = async (req, res) => {
  const checks = {
    database: 'unknown',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercelRegion: process.env.VERCEL_REGION || 'unknown'
  };
  
  try {
    // Test database connection
    await mongoose.connection.db.admin().ping();
    checks.database = 'connected';
  } catch (error) {
    checks.database = 'disconnected';
  }
  
  const status = checks.database === 'connected' ? 200 : 503;
  res.status(status).json(checks);
};
```

## CI/CD Integration

### GitHub Actions (Optional)
```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build application
        run: npm run build
        
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

## Security Considerations

### Environment Variables
- Never commit sensitive data to repository
- Use Vercel's environment variable encryption
- Rotate API keys regularly
- Use different keys for staging/production

### CORS Configuration
```javascript
// server/cors-config.js
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com', 'https://your-project.vercel.app']
    : ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

export default corsOptions;
```

## Troubleshooting

### Common Issues

#### 1. Function Timeout
```javascript
// Increase timeout in vercel.json
{
  "functions": {
    "dist/index.js": {
      "maxDuration": 30
    }
  }
}
```

#### 2. Memory Issues
```javascript
// Increase memory allocation
{
  "functions": {
    "dist/index.js": {
      "memory": 1024
    }
  }
}
```

#### 3. Build Failures
```bash
# Check build logs
vercel logs

# Clear cache
vercel --debug
```

#### 4. Database Connection
```bash
# Test connection string
node -e "console.log(process.env.DATABASE_URL)"

# Check IP whitelist in MongoDB Atlas
```

### Debug Commands
```bash
# View deployment logs
vercel logs --follow

# Check function logs
vercel logs --filter="function-name"

# Inspect environment variables
vercel env ls

# Test local build
vercel dev
```

## Scaling Considerations

### Function Limits
- Maximum execution time: 30 seconds
- Maximum memory: 1GB
- Maximum request size: 50MB

### Database Scaling
- Use MongoDB Atlas auto-scaling
- Implement connection pooling
- Consider read replicas for heavy read operations

### CDN Integration
```javascript
// Use Vercel's CDN for static assets
const CDN_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'http://localhost:5000';
```

## Cost Optimization

### Hobby Plan Limits
- 100GB bandwidth per month
- 100GB-hrs serverless function execution
- 10k edge requests per month

### Pro Plan Benefits
- 1TB bandwidth per month
- 1000 GB-hrs serverless function execution
- 100k edge requests per month
- Custom domains included

## Deployment Checklist

- [ ] Repository connected to Vercel
- [ ] Environment variables configured
- [ ] Custom domain added (if applicable)
- [ ] Database connection tested
- [ ] Build process verified
- [ ] Health check endpoint working
- [ ] Error monitoring setup
- [ ] SSL certificate active
- [ ] API endpoints functional
- [ ] File upload handling configured
- [ ] Performance monitoring enabled

## Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Community](https://github.com/vercel/vercel/discussions)
- [Vercel Support](https://vercel.com/support)

---

This guide provides comprehensive instructions for deploying VeeFore on Vercel with optimal performance and security configurations.