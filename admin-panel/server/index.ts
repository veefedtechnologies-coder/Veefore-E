import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from the admin-panel .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Set default JWT secret if not provided
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'your-super-secret-jwt-key-here-change-this-in-production';
  console.log('⚠️  Using default JWT_SECRET - change this in production!');
}

// Import routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import userRoutes from './routes/user';
import usersRoutes from './routes/users';
import dashboardRoutes from './routes/dashboard';
import refundRoutes from './routes/refund';
import notificationRoutes from './routes/notification';
import popupRoutes from './routes/popup';
import subscriptionRoutes from './routes/subscription';
import couponRoutes from './routes/coupon';
import supportTicketRoutes from './routes/supportTicket';
import teamRoutes from './routes/team';
import maintenanceRoutes from './routes/maintenance';
import analyticsRoutes from './routes/analytics';
import auditRoutes from './routes/audit';
import roleRoutes from './routes/role';
import adminOnboardingRoutes from './routes/adminOnboarding';
import teamHierarchyRoutes from './routes/teamHierarchy';
import aiModerationRoutes from './routes/aiModeration';
import performanceAnalyticsRoutes from './routes/performanceAnalytics';
import webhookRoutes from './routes/webhook';
import maintenanceBannerRoutes from './routes/maintenanceBanner';
import globalSearchRoutes from './routes/globalSearch';
import sessionManagementRoutes from './routes/sessionManagement';
import bulkOperationsRoutes from './routes/bulkOperations';
import userDetailRoutes from './routes/userDetail';
import waitlistRoutes from './routes/waitlist';
import permissionsRoutes from './routes/permissions';
import adminManagementRoutes from './routes/adminManagement';
import { SystemMonitoringService } from './services/systemMonitoringService';

// Import middleware
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

class AdminServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:8000',
        methods: ['GET', 'POST']
      }
    });
    
    this.initializeDatabase();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeSocketIO();
    this.initializeErrorHandling();
    this.initializeSystemMonitoring();
  }

  private async initializeDatabase() {
    try {
      // Connect to separate admin database for admin users
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
      if (mongoUri.includes('mongodb+srv://')) {
        // For MongoDB Atlas, use admin database
        await mongoose.connect(mongoUri, {
          dbName: 'veefore-admin'
        });
      } else {
        // For local MongoDB, use admin database
        await mongoose.connect(mongoUri.replace('/veefore', '/veefore-admin'));
      }
      console.log('✅ Admin database connected successfully (veefore-admin)');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      process.exit(1);
    }
  }

  private initializeMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Device-Fingerprint']
    }));

    // Rate limiting - more lenient for development
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'development' ? 1000 : 100, // More lenient in development
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for localhost in development
        if (process.env.NODE_ENV === 'development') {
          return req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
        }
        return false;
      }
    });
    this.app.use('/api', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use(requestLogger);

    // Trust proxy (for accurate IP addresses)
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        message: 'VeeFore Admin Panel API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/admin', authenticate, adminRoutes);
    this.app.use('/api/dashboard', dashboardRoutes);
    this.app.use('/api/users', usersRoutes);
    this.app.use('/api/user', authenticate, userRoutes);
    this.app.use('/api/refunds', authenticate, refundRoutes);
    this.app.use('/api/subscriptions', authenticate, subscriptionRoutes);
    this.app.use('/api/support-tickets', supportTicketRoutes);
    this.app.use('/api/coupons', authenticate, couponRoutes);
    this.app.use('/api/analytics', authenticate, analyticsRoutes);
    this.app.use('/api/audit', authenticate, auditRoutes);
    this.app.use('/api/roles', authenticate, roleRoutes);
    this.app.use('/api/onboarding', adminOnboardingRoutes);
    this.app.use('/api/teams', authenticate, teamHierarchyRoutes);
    this.app.use('/api/notifications', authenticate, notificationRoutes);
    this.app.use('/api/popups', popupRoutes);
    this.app.use('/api/maintenance', maintenanceRoutes);
    this.app.use('/api/ai-moderation', authenticate, aiModerationRoutes);
    this.app.use('/api/performance-analytics', authenticate, performanceAnalyticsRoutes);
    this.app.use('/api/webhooks', authenticate, webhookRoutes);
    this.app.use('/api/maintenance-banners', maintenanceBannerRoutes);
    this.app.use('/api/search', authenticate, globalSearchRoutes);
    this.app.use('/api/sessions', authenticate, sessionManagementRoutes);
    this.app.use('/api/bulk-operations', authenticate, bulkOperationsRoutes);
    this.app.use('/api/user-detail', authenticate, userDetailRoutes);
    this.app.use('/api/waitlist', authenticate, waitlistRoutes);
    this.app.use('/api/permissions', permissionsRoutes);
    this.app.use('/api', adminManagementRoutes);

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../dist/client')));
      
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/client/index.html'));
      });
    }

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    });
  }

  private initializeSocketIO() {
    this.io.on('connection', (socket) => {
      console.log('🔌 Admin connected:', socket.id);

      // Join admin to their role-based room
      socket.on('join-role', (role: string) => {
        socket.join(`role-${role}`);
        console.log(`Admin ${socket.id} joined role room: ${role}`);
      });

      // Join admin to their team room
      socket.on('join-team', (team: string) => {
        socket.join(`team-${team}`);
        console.log(`Admin ${socket.id} joined team room: ${team}`);
      });

      // Handle real-time notifications
      socket.on('subscribe-notifications', (adminId: string) => {
        socket.join(`admin-${adminId}`);
        console.log(`Admin ${socket.id} subscribed to notifications for admin: ${adminId}`);
      });

      // Handle ticket updates
      socket.on('ticket-update', (data) => {
        socket.broadcast.emit('ticket-updated', data);
      });

      // Handle refund updates
      socket.on('refund-update', (data) => {
        socket.broadcast.emit('refund-updated', data);
      });

      // Handle user updates
      socket.on('user-update', (data) => {
        socket.broadcast.emit('user-updated', data);
      });

      socket.on('disconnect', () => {
        console.log('🔌 Admin disconnected:', socket.id);
      });
    });
  }

  private initializeErrorHandling() {
    this.app.use(errorHandler);
  }

  private initializeSystemMonitoring() {
    // Start system monitoring with 1-minute intervals
    const monitoringService = SystemMonitoringService.getInstance();
    monitoringService.startCollection(60000); // 60 seconds
    console.log('🔍 System monitoring initialized');
  }

  public start() {
    const port = process.env.ADMIN_PORT || 8001;
    
    this.server.listen(port, '0.0.0.0', () => {
      console.log(`🚀 VeeFore Admin Panel Server running on port ${port}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:8000'}`);
      console.log(`📱 API URL: http://localhost:${port}/api`);
    });
  }

  public getIO() {
    return this.io;
  }
}

// Create and start server
const adminServer = new AdminServer();
adminServer.start();

// Export for testing
export default adminServer;
