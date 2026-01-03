import mongoose from "mongoose";

export interface ConnectionMetrics {
  connectAttempts: number;
  successfulConnections: number;
  failedConnections: number;
  lastConnectedAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  averageConnectTimeMs: number;
  isConnected: boolean;
  readyState: number;
  readyStateLabel: string;
}

export class MongoConnectionManager {
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private connectionMetrics = {
    connectAttempts: 0,
    successfulConnections: 0,
    failedConnections: 0,
    lastConnectedAt: null as Date | null,
    lastErrorAt: null as Date | null,
    lastError: null as string | null,
    averageConnectTimeMs: 0,
  };
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly BASE_RETRY_DELAY_MS = 1000;

  getConnectionMetrics(): ConnectionMetrics {
    return {
      ...this.connectionMetrics,
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      readyStateLabel: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
    };
  }

  private async connectWithRetry(retryCount = 0): Promise<void> {
    const startTime = Date.now();
    this.connectionMetrics.connectAttempts++;

    try {
      if (mongoose.connection.readyState === 3) {
        await mongoose.disconnect();
      }

      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/veefore';

      if (retryCount === 0) {
        // P1-7 SECURITY: Mask credentials in logs
        const maskedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
        console.log('[MONGODB] Attempting to connect to:', maskedUri);
      } else {
        console.log(`[MONGODB] Retry attempt ${retryCount}/${MongoConnectionManager.MAX_RETRY_ATTEMPTS}...`);
      }

      const poolSize = parseInt(process.env.MONGODB_POOL_SIZE || '50', 10);
      const serverSelectionTimeout = parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT || '10000', 10);
      const socketTimeout = parseInt(process.env.MONGODB_SOCKET_TIMEOUT || '45000', 10);
      const maxIdleTime = parseInt(process.env.MONGODB_MAX_IDLE_TIME || '30000', 10);

      await mongoose.connect(mongoUri, {
        dbName: process.env.MONGODB_DB_NAME || 'veeforedb',
        serverSelectionTimeoutMS: serverSelectionTimeout,
        socketTimeoutMS: socketTimeout,
        maxPoolSize: poolSize,
        minPoolSize: Math.min(5, poolSize),
        bufferCommands: false,
        maxIdleTimeMS: maxIdleTime,
        retryWrites: true,
        retryReads: true,
        connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT || '10000', 10),
      });

      const connectTime = Date.now() - startTime;
      this.isConnected = true;
      this.connectionMetrics.successfulConnections++;
      this.connectionMetrics.lastConnectedAt = new Date();
      this.connectionMetrics.averageConnectTimeMs =
        (this.connectionMetrics.averageConnectTimeMs * (this.connectionMetrics.successfulConnections - 1) + connectTime) /
        this.connectionMetrics.successfulConnections;

      console.log(`✅ Connected to MongoDB - ${mongoose.connection.db?.databaseName} database (${connectTime}ms)`);
    } catch (error: unknown) {
      this.connectionMetrics.failedConnections++;
      this.connectionMetrics.lastErrorAt = new Date();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : '';
      this.connectionMetrics.lastError = errorMessage;
      this.isConnected = false;

      const isTransient = errorName === 'MongoNetworkError' ||
        errorName === 'MongoServerSelectionError' ||
        errorMessage?.includes('ECONNREFUSED') ||
        errorMessage?.includes('timeout');

      if (isTransient && retryCount < MongoConnectionManager.MAX_RETRY_ATTEMPTS) {
        const delay = MongoConnectionManager.BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        console.warn(`[MONGODB] Transient error, retrying in ${delay}ms...`, errorMessage);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connectWithRetry(retryCount + 1);
      }

      console.error('❌ FATAL: MongoDB connection failed after retries:', errorMessage);

      if (process.env.NODE_ENV === 'production') {
        throw new Error('MongoDB connection required for production');
      }

      console.warn('⚠️ Development mode: Continuing with limited functionality');
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected && mongoose.connection.readyState === 1) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (mongoose.connection.readyState === 2) {
      this.connectionPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.connectionPromise = null;
          reject(new Error('MongoDB connection timeout'));
        }, 10000);

        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.connectionPromise = null;
          resolve();
        });
        mongoose.connection.once('error', (error) => {
          clearTimeout(timeout);
          this.isConnected = false;
          this.connectionPromise = null;
          reject(error);
        });
      });
      return this.connectionPromise;
    }

    this.connectionPromise = this.connectWithRetry().finally(() => {
      this.connectionPromise = null;
    });

    return this.connectionPromise;
  }

  async ensureConnected(): Promise<void> {
    if (!this.isConnected || mongoose.connection.readyState !== 1) {
      await this.connect();
    }
  }
}

export const connectionManager = new MongoConnectionManager();
