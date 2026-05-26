# 🚀 VeeFore Migration Guide: Replit to Cursor IDE

## 🗂️ Files to Delete (Replit-specific)

### Remove these files/folders completely:
```bash
# Replit configuration files
.replit
.replit.nix
.config/
.nix/

# Replit runtime files
replit.nix
.upm/
```

### Package.json Dependencies to Remove:
```json
{
  "devDependencies": {
    // Remove these Replit-specific packages
    "@replit/vite-plugin-cartographer": "^0.2.7",
    "@replit/vite-plugin-runtime-error-modal": "^0.0.3"
  }
}
```

## 🔧 Code Changes Required

### 1. Update Vite Configuration (vite.config.ts)
**Remove Replit plugins:**
```typescript
// REMOVE these imports
import { vitePlugin as remix } from '@replit/vite-plugin-cartographer';
import { vitePlugin as runtimeError } from '@replit/vite-plugin-runtime-error-modal';

// REMOVE from plugins array
plugins: [
  // Remove these lines
  remix(),
  runtimeError(),
  // Keep other plugins
]
```

### 2. Update Server Configuration (server/index.ts)
**Remove Replit-specific port logic:**
```typescript
// CHANGE FROM:
const PORT = process.env.PORT || 5000;

// CHANGE TO:
const PORT = 5000;
```

### 3. Update Instagram Publisher (server/direct-instagram-publisher.ts)
**Remove Replit domain logic:**
```typescript
// FIND this code:
const baseUrl = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
  : 'http://localhost:5000';

// REPLACE WITH:
const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
```

### 4. Update Package.json Scripts
**Ensure these scripts are present:**
```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js",
    "check": "tsc",
    "db:push": "drizzle-kit push"
  }
}
```

## 🖥️ Setting Up in Cursor IDE

### 1. Install Cursor IDE
- Download from https://cursor.sh
- Install the application
- Open your project folder in Cursor

### 2. Required Extensions
Install these extensions in Cursor:
```
- TypeScript and JavaScript Language Features (built-in)
- Tailwind CSS IntelliSense
- ES7+ React/Redux/React-Native snippets
- Prettier - Code formatter
- ESLint
- Auto Rename Tag
- Bracket Pair Colorizer
- Git Lens
```

### 3. Workspace Settings
Create `.vscode/settings.json`:
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "tailwindCSS.experimental.classRegex": [
    ["clsx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"],
    ["className.*?=.*?[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

### 4. Launch Configuration
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server/index.ts",
      "env": {
        "NODE_ENV": "development"
      },
      "runtimeExecutable": "tsx",
      "console": "integratedTerminal",
      "restart": true
    },
    {
      "name": "Launch Frontend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vite",
      "args": ["--host", "0.0.0.0"],
      "console": "integratedTerminal"
    }
  ]
}
```

## 📦 Local Development Setup

### 1. Prerequisites
```bash
# Install Node.js 18+ and npm
node --version  # Should be 18.0.0 or higher
npm --version   # Should be 8.0.0 or higher

# Install Git
git --version
```

### 2. Clone and Setup
```bash
# Clone your repository
git clone <your-repo-url>
cd veefore

# Install dependencies
npm install

# Remove Replit-specific packages
npm uninstall @replit/vite-plugin-cartographer @replit/vite-plugin-runtime-error-modal

# Create environment file
cp .env.example .env
```

### 3. Configure Environment Variables
**Edit `.env` file with your actual values:**
```bash
# Essential variables for local development
DATABASE_URL=mongodb://localhost:27017/veeforedb
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
OPENAI_API_KEY=your-openai-api-key
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-secret

# Set to development mode
NODE_ENV=development
BASE_URL=http://localhost:5000
```

### 4. Database Setup
**Option A: MongoDB Atlas (Recommended)**
```bash
# Create MongoDB Atlas account
# Create new cluster
# Get connection string
# Update DATABASE_URL in .env
```

**Option B: Local MongoDB**
```bash
# Install MongoDB locally
# Start MongoDB service
# Create database: veeforedb
# Update DATABASE_URL=mongodb://localhost:27017/veeforedb
```

### 5. Firebase Setup
```bash
# Go to https://console.firebase.google.com
# Create new project
# Enable Authentication with Email/Password
# Get configuration keys
# Create service account and download JSON
# Update environment variables
```

### 6. API Keys Setup
**OpenAI (Required for AI features):**
```bash
# Go to https://platform.openai.com/api-keys
# Create new API key
# Add to OPENAI_API_KEY in .env
```

**Razorpay (Required for payments):**
```bash
# Go to https://dashboard.razorpay.com
# Create account and get test keys
# Add to RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
```

## 🚀 Running the Application

### Development Mode
```bash
# Start development server
npm run dev

# This will start:
# - Backend server on http://localhost:5000
# - Frontend served through Vite
# - Hot reloading enabled
```

### Production Build
```bash
# Build for production
npm run build

# Start production server
npm start
```

### Available Scripts
```bash
npm run dev      # Development with hot reloading
npm run build    # Production build
npm run start    # Production server
npm run check    # TypeScript type checking
npm run db:push  # Push database schema changes
```

## 🎯 Testing Your Setup

### 1. Basic Functionality Test
```bash
# Start the application
npm run dev

# Check these endpoints:
# http://localhost:5000 - Frontend should load
# http://localhost:5000/api/health - Should return OK
# http://localhost:5000/api/user - Should require authentication
```

### 2. Database Connection Test
```bash
# Check MongoDB connection in logs
# Should see: "Connected to MongoDB Atlas - veeforedb database"
```

### 3. Firebase Authentication Test
```bash
# Try to sign up/login
# Check console for Firebase initialization
# Should see: "Firebase initialized successfully"
```

### 4. AI Features Test
```bash
# Test OpenAI connection
# Try generating content or images
# Check for proper API responses
```

## 🌐 Deployment Options

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Configure build settings:
# - Build Command: npm run build
# - Output Directory: dist
# - Install Command: npm install
```

### Railway Deployment
```bash
# Connect GitHub repository to Railway
# Set environment variables in Railway dashboard
# Configure start command: npm run start
# Set up custom domain
```

### Render Deployment
```bash
# Create new Web Service on Render
# Connect repository
# Set environment variables
# Configure build and start commands
# Set up custom domain
```

## 🔧 Troubleshooting

### Common Issues

**1. Module Not Found Errors**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**2. TypeScript Errors**
```bash
# Check TypeScript configuration
npm run check

# Fix import paths in tsconfig.json
```

**3. Database Connection Issues**
```bash
# Check MongoDB connection string
# Verify network access in MongoDB Atlas
# Check firewall settings
```

**4. Firebase Authentication Issues**
```bash
# Verify Firebase project configuration
# Check API keys and project ID
# Verify Firebase rules and settings
```

**5. Build Errors**
```bash
# Check for missing dependencies
# Verify environment variables
# Check TypeScript compilation
```

### Performance Optimization
```bash
# Enable production optimizations
NODE_ENV=production

# Use PM2 for production
npm install -g pm2
pm2 start npm --name "veefore" -- start
```

## 📊 Monitoring and Logging

### Development Logging
```bash
# Enable debug logging
DEBUG=true npm run dev

# Check logs in terminal
# MongoDB operations logged with [MONGODB DEBUG]
# API requests logged with [API]
# Authentication logged with [AUTH]
```

### Production Monitoring
```bash
# Set up error tracking with Sentry
# Configure performance monitoring
# Set up uptime monitoring
# Configure log aggregation
```

## 🔒 Security Considerations

### Environment Variables
```bash
# Never commit .env files
# Use different keys for development/production
# Rotate API keys regularly
# Use secrets management in production
```

### API Security
```bash
# Enable CORS for production domains only
# Implement rate limiting
# Use HTTPS in production
# Validate all inputs
```

## 📞 Support

If you encounter issues during migration:
1. Check the console for error messages
2. Verify all environment variables are set
3. Ensure all dependencies are installed
4. Check MongoDB and Firebase connectivity
5. Verify API keys are valid and have correct permissions

**Migration completed successfully!** 🎉

Your VeeFore application is now ready to run in Cursor IDE with full functionality preserved.