import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from project root
// CRITICAL: Must match the path used by scripts to ensure encryption key consistency
dotenv.config({ path: join(__dirname, '../../.env') });



const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "blob:",
        "https://scontent-sea1-1.cdninstagram.com",
        "https://scontent-sea1-2.cdninstagram.com",
        "https://scontent-sea1-3.cdninstagram.com",
        "https://scontent-sea1-4.cdninstagram.com",
        "https://scontent-sea1-5.cdninstagram.com",
        "https://scontent-ams2-1.cdninstagram.com",
        "https://scontent-ams2-2.cdninstagram.com",
        "https://scontent-ams2-3.cdninstagram.com",
        "https://scontent-ams2-4.cdninstagram.com",
        "https://scontent-ams2-5.cdninstagram.com",
        "https://scontent-lhr8-1.cdninstagram.com",
        "https://scontent-lhr8-2.cdninstagram.com",
        "https://scontent-lhr8-3.cdninstagram.com",
        "https://scontent-lhr8-4.cdninstagram.com",
        "https://scontent-lhr8-5.cdninstagram.com",
        "https://instagram.fixc1-1.fna.fbcdn.net",
        "https://instagram.fixc1-2.fna.fbcdn.net",
        "https://instagram.fixc1-3.fna.fbcdn.net",
        "https://instagram.fixc1-4.fna.fbcdn.net",
        "https://instagram.fixc1-5.fna.fbcdn.net",
        "https://lh3.googleusercontent.com"
      ],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'", "https:", "wss:"],
      mediaSrc: [
        "'self'",
        "https:",
        "blob:",
        "https://*.fbcdn.net",
        "https://*.cdninstagram.com",
        "https://instagram.fixc1-1.fna.fbcdn.net",
        "https://instagram.fixc1-2.fna.fbcdn.net",
        "https://instagram.fixc1-3.fna.fbcdn.net",
        "https://instagram.fixc1-4.fna.fbcdn.net",
        "https://instagram.fixc1-5.fna.fbcdn.net",
        "https://scontent-sea1-1.cdninstagram.com",
        "https://scontent-sea1-2.cdninstagram.com",
        "https://scontent-sea1-3.cdninstagram.com",
        "https://scontent-sea1-4.cdninstagram.com",
        "https://scontent-sea1-5.cdninstagram.com",
        "https://scontent-ams2-1.cdninstagram.com",
        "https://scontent-ams2-2.cdninstagram.com",
        "https://scontent-ams2-3.cdninstagram.com",
        "https://scontent-ams2-4.cdninstagram.com",
        "https://scontent-ams2-5.cdninstagram.com",
        "https://scontent-lhr8-1.cdninstagram.com",
        "https://scontent-lhr8-2.cdninstagram.com",
        "https://scontent-lhr8-3.cdninstagram.com",
        "https://scontent-lhr8-4.cdninstagram.com",
        "https://scontent-lhr8-5.cdninstagram.com"
      ],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN?.split(',') || ['https://veefore.com']
    : ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// DEBUG ENDPOINT - TO BE REMOVED
app.get('/api/debug-config', async (_req, res) => {
  const mongoose = await import('mongoose');
  const uri = process.env.MONGODB_URI || 'not-set';
  const maskedUri = uri.replace(/:([^:@]+)@/, ':****@');

  // Get list of collections
  let collections = [];
  try {
    if (mongoose.connection && mongoose.connection.db) {
      const cols = await mongoose.connection.db.listCollections().toArray();
      collections = cols.map(c => c.name);
    }
  } catch (e) { collections = ['error-listing-collections']; }

  res.json({
    maskedUri,
    dbName: mongoose.connection.name,
    host: mongoose.connection.host,
    collections,
    env: process.env.NODE_ENV
  });
});

// API routes would be imported here
// import { authRoutes } from './routes/auth.js';
// import { userRoutes } from './routes/user.js';
// app.use('/api/auth', authRoutes);
// app.use('/api/user', userRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = join(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));

  // Handle client-side routing
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);

  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ message: 'Internal server error' });
  } else {
    res.status(500).json({
      message: err.message,
      stack: err.stack
    });
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
});

export default app;