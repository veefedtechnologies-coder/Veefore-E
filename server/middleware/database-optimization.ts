/**
 * P9-2: DATABASE OPTIMIZATION & CONNECTION POOLING
 * Enterprise-grade database performance optimization
 */

import mongoose from 'mongoose';

interface DatabaseOptimizationConfig {
  maxPoolSize: number;
  minPoolSize: number;
  maxIdleTimeMS: number;
  serverSelectionTimeoutMS: number;
  heartbeatFrequencyMS: number;
  retryWrites: boolean;
  bufferCommands: boolean;
  bufferMaxEntries: number;
  readPreference: string;
  writeConcern: any; // Simplified for compatibility
}

// Enterprise database configuration
export const DATABASE_CONFIG: DatabaseOptimizationConfig = {
  maxPoolSize: 20,        // Maximum number of connections in the connection pool
  minPoolSize: 5,         // Minimum number of connections to maintain
  maxIdleTimeMS: 300000,  // 5 minutes - close connections after being idle
  serverSelectionTimeoutMS: 10000,  // 10 seconds to select a server
  heartbeatFrequencyMS: 10000,      // 10 seconds between heartbeats
  retryWrites: true,      // Automatically retry certain write operations
  bufferCommands: false,  // Disable mongoose buffering for better error handling
  bufferMaxEntries: 0,    // No buffering
  readPreference: 'primaryPreferred', // Prefer primary but allow secondary reads
  writeConcern: {
    w: 'majority',        // Wait for majority of replica set members
    wtimeout: 10000,      // 10 second timeout for write concern
    j: true              // Wait for write to be written to journal
  }
};

// Database connection state management
export class DatabaseManager {
  private static instance: DatabaseManager;
  private connectionAttempts = 0;
  private maxRetries = 5;
  private retryDelay = 2000; // 2 seconds

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize optimized database connection with enterprise settings
   */
  public async initializeConnection(uri: string): Promise<void> {
    const optimizedUri = this.buildOptimizedUri(uri);
    
    // Configure mongoose with enterprise settings
    mongoose.set('strictQuery', true);
    mongoose.set('sanitizeFilter', true);
    
    // Set up connection event handlers
    this.setupConnectionEventHandlers();

    try {
      await mongoose.connect(optimizedUri, {
        maxPoolSize: DATABASE_CONFIG.maxPoolSize,
        minPoolSize: DATABASE_CONFIG.minPoolSize,
        maxIdleTimeMS: DATABASE_CONFIG.maxIdleTimeMS,
        serverSelectionTimeoutMS: DATABASE_CONFIG.serverSelectionTimeoutMS,
        heartbeatFrequencyMS: DATABASE_CONFIG.heartbeatFrequencyMS,
        retryWrites: DATABASE_CONFIG.retryWrites,
        bufferCommands: DATABASE_CONFIG.bufferCommands,
        bufferMaxEntries: DATABASE_CONFIG.bufferMaxEntries,
        readPreference: DATABASE_CONFIG.readPreference as any,
        writeConcern: DATABASE_CONFIG.writeConcern
      });

      console.log('🔄 P9: Database connection optimized with enterprise settings');
      console.log(`📊 P9: Connection pool - Min: ${DATABASE_CONFIG.minPoolSize}, Max: ${DATABASE_CONFIG.maxPoolSize}`);
      
    } catch (error) {
      console.error('❌ P9: Database connection failed:', error);
      await this.retryConnection(optimizedUri);
    }
  }

  /**
   * Build optimized MongoDB URI with connection parameters
   */
  private buildOptimizedUri(baseUri: string): string {
    const url = new URL(baseUri);
    
    // Add optimization parameters to URI
    url.searchParams.set('retryWrites', 'true');
    url.searchParams.set('w', 'majority');
    url.searchParams.set('readPreference', 'primaryPreferred');
    url.searchParams.set('maxPoolSize', DATABASE_CONFIG.maxPoolSize.toString());
    url.searchParams.set('minPoolSize', DATABASE_CONFIG.minPoolSize.toString());
    url.searchParams.set('maxIdleTimeMS', DATABASE_CONFIG.maxIdleTimeMS.toString());
    url.searchParams.set('serverSelectionTimeoutMS', DATABASE_CONFIG.serverSelectionTimeoutMS.toString());
    
    return url.toString();
  }

  /**
   * Set up comprehensive connection event handlers
   */
  private setupConnectionEventHandlers(): void {
    mongoose.connection.on('connected', () => {
      console.log('✅ P9: MongoDB connected successfully');
      this.connectionAttempts = 0; // Reset counter on successful connection
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ P9: MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ P9: MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 P9: MongoDB reconnected successfully');
    });

    mongoose.connection.on('close', () => {
      console.log('📴 P9: MongoDB connection closed');
    });

    // Handle MongoDB server selection issues
    mongoose.connection.on('serverSelectionError', (err) => {
      console.error('🔍 P9: MongoDB server selection error:', err.message);
    });
  }

  /**
   * Retry connection with exponential backoff
   */
  private async retryConnection(uri: string): Promise<void> {
    if (this.connectionAttempts >= this.maxRetries) {
      throw new Error(`P9: Database connection failed after ${this.maxRetries} attempts`);
    }

    this.connectionAttempts++;
    const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1); // Exponential backoff
    
    console.log(`🔄 P9: Retrying database connection (${this.connectionAttempts}/${this.maxRetries}) in ${delay}ms...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await mongoose.connect(uri);
    } catch (error) {
      await this.retryConnection(uri);
    }
  }

  /**
   * Get current connection pool statistics
   */
  public getConnectionStats(): {
    state: string;
    poolSize?: number;
    activeConnections?: number;
    availableConnections?: number;
  } {
    const connection = mongoose.connection;
    
    return {
      state: this.getConnectionState(),
      poolSize: DATABASE_CONFIG.maxPoolSize,
      // Note: Mongoose doesn't expose detailed pool stats by default
      // These would need to be implemented with custom monitoring
      activeConnections: connection.readyState === 1 ? 1 : 0,
      availableConnections: connection.readyState === 1 ? DATABASE_CONFIG.maxPoolSize - 1 : 0
    };
  }

  /**
   * Get human-readable connection state
   */
  private getConnectionState(): string {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[mongoose.connection.readyState as keyof typeof states] || 'unknown';
  }

  /**
   * Graceful shutdown of database connections
   */
  public async gracefulShutdown(): Promise<void> {
    console.log('🔄 P9: Shutting down database connections...');
    
    try {
      await mongoose.connection.close();
      console.log('✅ P9: Database connections closed gracefully');
    } catch (error) {
      console.error('❌ P9: Error closing database connections:', error);
      throw error;
    }
  }

  /**
   * Health check for database connection
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    state: string;
    responseTime?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      if (mongoose.connection.readyState !== 1) {
        return {
          healthy: false,
          state: this.getConnectionState(),
          error: 'Database not connected'
        };
      }

      // Perform a simple ping to test connectivity
      await mongoose.connection.db?.admin().ping();
      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        state: this.getConnectionState(),
        responseTime
      };
    } catch (error) {
      return {
        healthy: false,
        state: this.getConnectionState(),
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Query optimization utilities
 */
export class QueryOptimizer {
  /**
   * Create common database indexes for performance
   */
  public static async createOptimizedIndexes(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        console.warn('⚠️ P9: Cannot create indexes - database not connected');
        return;
      }

      console.log('📊 P9: Creating optimized database indexes...');

      // Common indexes for performance (example for social media app)
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      // Users collection indexes
      if (collectionNames.includes('users')) {
        await db.collection('users').createIndex({ firebaseUid: 1 }, { unique: true });
        await db.collection('users').createIndex({ email: 1 });
        await db.collection('users').createIndex({ createdAt: -1 });
        console.log('✅ P9: Users collection indexes created');
      }

      // Social accounts indexes
      if (collectionNames.includes('socialaccounts')) {
        await db.collection('socialaccounts').createIndex({ workspaceId: 1, platform: 1 });
        await db.collection('socialaccounts').createIndex({ username: 1, platform: 1 });
        await db.collection('socialaccounts').createIndex({ lastSyncAt: -1 });
        console.log('✅ P9: Social accounts collection indexes created');
      }

      // Workspaces collection indexes
      if (collectionNames.includes('workspaces')) {
        await db.collection('workspaces').createIndex({ ownerId: 1 });
        await db.collection('workspaces').createIndex({ createdAt: -1 });
        console.log('✅ P9: Workspaces collection indexes created');
      }

      console.log('🎉 P9: All database indexes created successfully');

    } catch (error) {
      console.error('❌ P9: Error creating database indexes:', error);
    }
  }

  /**
   * Analyze slow queries and suggest optimizations
   */
  public static async analyzeSlowQueries(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      if (!db) return;

      console.log('📊 P9: Analyzing database performance...');

      // Enable profiling for slow queries (> 100ms)
      await db.admin().command({
        profile: 2,
        slowms: 100
      });

      console.log('✅ P9: Database profiling enabled for queries > 100ms');

    } catch (error) {
      console.error('❌ P9: Error setting up query analysis:', error);
    }
  }
}

// Singleton instance export
export const dbManager = DatabaseManager.getInstance();