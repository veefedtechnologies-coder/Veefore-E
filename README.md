# VeeFore - AI-Powered Social Media Management Platform

> **Production-Ready Deployment** - Successfully migrated from Replit development environment to standard Node.js deployment with comprehensive multi-platform support.

## 🚀 Quick Start - Cross-Platform Development

This project is configured to run seamlessly on both Replit (cloud) and locally on any IDE (Cursor, VSCode, etc.) with the same codebase.

### Running Locally (Cursor/VSCode/etc.)

```bash
# 1. Clone the repository
git clone <repo-url>
cd veefore

# 2. Install dependencies
npm install

# 3. Copy example environment files
cp .env.example .env
cp server/.env.example server/.env  
cp client/.env.example client/.env

# 4. Edit the .env files with your actual values
# Update .env, server/.env, and client/.env with real API keys

# 5. Start development server
npm run dev
```

### Running on Replit

- Environment variables can be set via the Replit Secrets tab
- The same codebase will run without modification
- All .env.example files show which secrets need to be configured

### Environment Configuration

The project uses three .env files:
- `/.env` - Root level environment variables
- `/server/.env` - Server-specific variables  
- `/client/.env` - Client-specific variables (VITE_ prefixed)

All example files (`.env.example`) are tracked in Git and contain placeholder values. Real `.env` files are ignored by Git for security.

## 🏗️ Architecture Overview

VeeFore is a comprehensive social media management platform built with:

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + MongoDB
- **Authentication**: Firebase Auth with JWT tokens
- **AI Integration**: OpenAI GPT-4o, DALL-E 3, Anthropic Claude
- **Social APIs**: Instagram Business API, YouTube Data API, Twitter API v2
- **Payments**: Razorpay (primary), Stripe (international)
- **Email**: SendGrid SMTP for verification and notifications

## 📋 Features

### 🤖 AI-Powered Content Creation
- **15+ AI Tools**: Content generation, image creation, video editing
- **Thumbnail Maker Pro**: 7-stage professional thumbnail generation
- **Script Generator**: AI-powered video script creation
- **Hashtag Optimizer**: Trending hashtag suggestions
- **Caption Generator**: Platform-specific caption optimization

### 📊 Analytics & Insights
- **Real-time Analytics**: Live social media metrics
- **Competitor Analysis**: AI-powered competitor tracking
- **Viral Predictor**: Content viral potential scoring
- **ROI Calculator**: Campaign performance analysis
- **Social Listening**: Brand mention monitoring

### 🎯 Automation & Scheduling
- **Content Scheduler**: Multi-platform content scheduling
- **DM Automation**: AI-powered message responses
- **Auto-sync**: Real-time social media data synchronization
- **Rule Engine**: Custom automation rule creation

### 👥 Team Collaboration
- **Multi-workspace**: Team-based workspace management
- **Role-based Access**: Owner, admin, and member roles
- **Team Invitations**: Secure team member onboarding
- **Credit System**: Usage-based billing and tracking

## 🔧 Deployment Options

### 1. Vercel (Recommended)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to production
vercel --prod
```
Configuration handled by `vercel.json` with serverless functions support.

### 2. Docker
```bash
# Build Docker image
docker build -t veefore:latest .

# Run container
docker run -p 5000:5000 --env-file .env veefore:latest
```

### 3. Traditional VPS
```bash
# Build application
npm run build

# Start with PM2
pm2 start dist/index.js --name veefore
pm2 save
pm2 startup
```

## 📊 System Architecture

### Database Schema
- **Users**: Authentication, profiles, onboarding status
- **Workspaces**: Team organization, settings, defaults
- **Social Accounts**: Connected platform accounts and tokens
- **Content**: Generated content, scheduling, analytics
- **Automation Rules**: DM automation, keyword responses
- **Credit Transactions**: Usage tracking, payment history

### API Structure
- **Authentication**: `/api/auth/*` - Registration, login, verification
- **User Management**: `/api/user/*` - Profile, settings, onboarding
- **Workspaces**: `/api/workspaces/*` - Team management, invitations
- **Social Media**: `/api/instagram/*`, `/api/youtube/*` - Platform integration
- **AI Services**: `/api/ai/*` - Content generation, analysis
- **Analytics**: `/api/analytics/*` - Real-time metrics, insights

## 🔐 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access**: Granular permission system
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: API abuse prevention
- **CORS Configuration**: Secure cross-origin requests
- **Environment Variables**: Secure credential management

## 📱 Platform Integration

### Instagram Business API
- **OAuth Flow**: Secure Instagram account connection
- **Publishing**: Direct Instagram post publishing
- **Analytics**: Real-time engagement metrics
- **DM Automation**: Automated message responses
- **Webhook Processing**: Real-time event handling

### YouTube Data API
- **Channel Analytics**: Subscriber and view metrics
- **Content Management**: Video metadata and insights
- **Token Management**: Automatic token refresh

### Additional Platforms
- **Twitter API v2**: Tweet scheduling and analytics
- **LinkedIn API**: Professional content publishing
- **Facebook Graph API**: Page management and insights

## 🔧 Development Setup

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run database migrations
npm run db:push

# View database
npm run db:studio
```

### Environment Variables
```bash
# Database
DATABASE_URL=mongodb+srv://...

# Authentication
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key

# AI Services
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Social Media APIs
INSTAGRAM_CLIENT_ID=your-instagram-client-id
INSTAGRAM_CLIENT_SECRET=your-instagram-client-secret
YOUTUBE_CLIENT_ID=your-youtube-client-id
YOUTUBE_CLIENT_SECRET=your-youtube-client-secret

# Payment Processing
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret

# Email Service
SENDGRID_API_KEY=your-sendgrid-key
```

## 🧪 Testing

### Validation Script
```bash
# Run deployment validation
node validate-deployment.js
```

### Health Check
```bash
# Check application health
curl http://localhost:5000/api/health
```

### Manual Testing
- User registration and email verification
- Social media account connection
- Content generation and scheduling
- Payment processing and subscription management

## 📈 Performance Optimization

### Frontend
- **Code Splitting**: Lazy loading for route-based components
- **Bundle Optimization**: Vite-based build with tree shaking
- **Image Optimization**: Compressed and responsive images
- **Caching**: Strategic caching for API responses

### Backend
- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: Efficient database connections
- **Response Compression**: Gzip compression for API responses
- **Rate Limiting**: Prevents API abuse and improves performance

## 🔍 Monitoring & Logging

### Application Monitoring
- **Health Checks**: `/api/health` endpoint for uptime monitoring
- **Error Tracking**: Comprehensive error logging and reporting
- **Performance Metrics**: Response time and throughput tracking
- **User Analytics**: Usage patterns and feature adoption

### Logging Strategy
- **Structured Logging**: JSON-formatted logs for parsing
- **Log Levels**: Debug, info, warn, error classification
- **Request Tracking**: Unique request IDs for debugging
- **Security Logs**: Authentication and authorization events

## 🆘 Troubleshooting

### Common Issues

#### 1. Vite Import Errors
```bash
# Install missing Replit dependencies
npm install @replit/vite-plugin-runtime-error-modal @replit/vite-plugin-cartographer
```

#### 2. Database Connection Issues
- Verify MongoDB Atlas connection string
- Check IP whitelist settings
- Ensure database user has proper permissions

#### 3. API Key Configuration
- Verify all required environment variables are set
- Check API key permissions and quotas
- Use secrets management for sensitive keys

#### 4. Build Failures
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Force rebuild
npm run build --force
```

### Debug Commands
```bash
# View application logs
npm run logs

# Test database connection
npm run db:test

# Validate configuration
npm run validate

# Check dependency versions
npm list --depth=0
```

## 🚢 Deployment Checklist

- [ ] Environment variables configured
- [ ] Database connection verified
- [ ] API keys and secrets validated
- [ ] Build process completed successfully
- [ ] Health check endpoint responding
- [ ] SSL certificate configured (production)
- [ ] Domain pointing to deployment
- [ ] Monitoring and alerts setup
- [ ] Backup strategy implemented
- [ ] Performance testing completed

## 📄 License

© 2025 Veefore — A product of VEEFED TECHNOLOGIES PRIVATE LIMITED

## 🤝 Support

For deployment issues and technical support:
1. Check the troubleshooting section
2. Review application logs
3. Verify environment configuration
4. Test individual components using health checks

---

**Ready for Production** ✅  
VeeFore is now fully configured for production deployment with comprehensive multi-platform support and robust error handling.