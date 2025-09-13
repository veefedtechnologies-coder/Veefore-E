# VeeFore - AI-Powered Video Generation Platform

## 🎯 Project Overview

VeeFore is a cutting-edge social media management platform that leverages advanced AI technologies to generate high-quality video content automatically. The platform combines script generation, AI-powered image creation, and video production in a unified, seamless experience.

## 🚀 Key Features

### 1. **AI Video Script Generation**
- **Primary**: Google Gemini 2.5 Flash (`gemini-2.0-flash-exp`)
- **Fallback**: Vertex AI for enterprise-grade performance
- **Capabilities**: Generates engaging, context-aware video scripts based on user input
- **Output**: Structured JSON with scenes, titles, and detailed content

### 2. **AI Image Generation System**
- **Primary**: Google Gemini 2.5 Flash (latest model with image generation)
- **Secondary**: Vertex AI Imagen (`imagen-3.0-generate-001:predict`)
- **Tertiary**: OpenAI DALL-E 3
- **Fallback**: Placeholder images for reliability
- **Features**: Scene-specific image generation with enhanced prompts

### 3. **Unified System Architecture**
- **Single Port**: Both frontend and backend run on port 5000
- **Technology**: Vite + Express.js unified development server
- **Benefits**: Simplified deployment, reduced complexity, single entry point
- **Configuration**: Custom Vite config serves both static assets and API routes

## 🏗️ Technical Architecture

### **Frontend Stack**
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite (unified with backend)
- **State Management**: React Query + Context API
- **UI Components**: Custom components with modern design
- **Authentication**: Firebase Auth integration

### **Backend Stack**
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB for data persistence
- **Caching**: Redis (with in-memory fallback)
- **Security**: Rate limiting, XSS protection, CSRF tokens

### **AI Integration**
- **Script Generation**: Hybrid AI system with intelligent fallbacks
- **Image Generation**: Multi-API approach for reliability
- **Prompt Enhancement**: AI-powered prompt optimization
- **Error Handling**: Comprehensive fallback mechanisms

## 🔧 Recent Major Updates

### **Gemini 2.5 Flash Integration**
- **Date**: Latest implementation
- **Purpose**: Primary AI system for both script and image generation
- **Benefits**: Latest model capabilities, improved performance, unified API
- **Configuration**: Environment variables for Google Cloud integration

### **Vertex AI Implementation**
- **Purpose**: Enterprise-grade AI services
- **Features**: Imagen 3.0 for high-quality image generation
- **Authentication**: Google Cloud API key integration
- **Fallback**: Seamless fallback to standard Gemini API

### **Unified Development System**
- **Architecture**: Single port (5000) for both frontend and backend
- **Configuration**: Custom Vite setup with Express middleware
- **Benefits**: Simplified development, single deployment, reduced complexity
- **File Structure**: Monorepo with shared dependencies

## 📁 Project Structure

```
VeeFore/
├── client/                 # React frontend (served by Vite)
├── server/                 # Express.js backend
├── vite.config.ts         # Unified Vite configuration
├── package.json           # Root dependencies
├── .env                   # Environment variables
├── .gitignore            # Git ignore rules
└── PROJECT_OVERVIEW.md   # This documentation
```

## 🔑 Environment Configuration

### **Required Environment Variables**
```bash
# Google Cloud Configuration
GOOGLE_API_KEY=your_google_cloud_api_key
GOOGLE_CLOUD_PROJECT_ID=your_project_id
GOOGLE_CLOUD_LOCATION=us-central1

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Database Configuration
MONGODB_URI=your_mongodb_connection_string
REDIS_URL=your_redis_connection_string

# Firebase Configuration
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY=your_firebase_private_key
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
```

## 🚀 Getting Started

### **Prerequisites**
- Node.js 18+ 
- MongoDB instance
- Redis instance (optional, falls back to in-memory)
- Google Cloud API key
- OpenAI API key

### **Installation & Setup**
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Start the unified development server
npx tsx server/index.ts
```

### **Access Points**
- **Frontend**: http://localhost:5000
- **API**: http://localhost:5000/api/*
- **Health Check**: http://localhost:5000/health

## 🔄 AI Generation Workflow

### **Script Generation Process**
1. User inputs video requirements
2. System calls Gemini 2.5 Flash for script generation
3. Fallback to Vertex AI if primary fails
4. Returns structured JSON with scenes and content

### **Image Generation Process**
1. Script approval triggers image generation
2. Primary: Gemini 2.5 Flash for each scene
3. Secondary: Vertex AI Imagen for high-quality images
4. Tertiary: OpenAI DALL-E for compatibility
5. Fallback: Placeholder images for reliability

## 🛡️ Security Features

- **Authentication**: Firebase-based user authentication
- **Rate Limiting**: API request throttling
- **XSS Protection**: Input sanitization
- **CSRF Protection**: Token-based validation
- **Environment Security**: Sensitive data in environment variables

## 📊 Performance Optimizations

- **Caching**: Redis for API response caching
- **Image Optimization**: Lazy loading and compression
- **Bundle Optimization**: Vite's efficient bundling
- **Fallback Systems**: Multiple AI providers for reliability

## 🔮 Future Enhancements

- **Video Rendering**: Automated video compilation
- **Advanced AI**: Integration with latest AI models
- **Analytics**: Performance tracking and insights
- **Collaboration**: Multi-user editing capabilities

## 🤝 Integration with Trae.ai

This documentation provides Trae.ai with a comprehensive understanding of:

1. **Unified Architecture**: Single-port system design
2. **AI Integration**: Multi-provider approach with intelligent fallbacks
3. **Modern Tech Stack**: React, TypeScript, Vite, Express.js
4. **Security**: Enterprise-grade security implementations
5. **Scalability**: Designed for production deployment

## 📞 Support & Maintenance

- **Documentation**: Comprehensive inline documentation
- **Error Handling**: Robust error management and logging
- **Monitoring**: Health checks and performance metrics
- **Updates**: Regular AI model and dependency updates

---

**Last Updated**: December 2024  
**Version**: 2.0.0  
**Status**: Production Ready
