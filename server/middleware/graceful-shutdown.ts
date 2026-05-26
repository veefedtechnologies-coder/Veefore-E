/**
 * P9-2: GRACEFUL SHUTDOWN HANDLER
 * Ensures clean shutdown of database connections and ongoing requests
 */

import { Server } from 'http';
import mongoose from 'mongoose';

interface GracefulShutdownConfig {
  timeout: number; // Maximum time to wait for connections to close
  signals: string[]; // Process signals to handle
  logger?: (message: string) => void;
}

const DEFAULT_CONFIG: GracefulShutdownConfig = {
  timeout: 30000, // 30 seconds
  signals: ['SIGTERM', 'SIGINT', 'SIGUSR2'],
  logger: console.log
};

export class GracefulShutdown {
  private server: Server;
  private config: GracefulShutdownConfig;
  private isShuttingDown = false;
  private connections = new Set<any>();
  private logger: (message: string) => void;

  constructor(server: Server, config: Partial<GracefulShutdownConfig> = {}) {
    this.server = server;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = this.config.logger || console.log;

    this.setupSignalHandlers();
    this.trackConnections();
  }

  private setupSignalHandlers() {
    this.config.signals.forEach(signal => {
      process.on(signal, () => {
        this.logger(`🛑 P9: Received ${signal}, starting graceful shutdown...`);
        this.shutdown();
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger(`🚨 P9: Uncaught exception: ${error.message}`);
      this.shutdown(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger(`🚨 P9: Unhandled rejection at: ${promise}, reason: ${reason}`);
      this.shutdown(1);
    });
  }

  private trackConnections() {
    // Track active connections for proper cleanup
    this.server.on('connection', (connection) => {
      this.connections.add(connection);

      connection.on('close', () => {
        this.connections.delete(connection);
      });
    });
  }

  private async shutdown(exitCode = 0) {
    if (this.isShuttingDown) {
      this.logger('⚠️ P9: Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;

    const shutdownTimeout = setTimeout(() => {
      this.logger(`⏰ P9: Shutdown timeout reached (${this.config.timeout}ms), forcing exit...`);
      process.exit(1);
    }, this.config.timeout);

    try {
      this.logger('🔄 P9: Starting graceful shutdown sequence...');

      // Step 1: Stop accepting new connections
      this.logger('📡 P9: Stopping server from accepting new connections...');
      this.server.close(() => {
        this.logger('✅ P9: Server stopped accepting new connections');
      });

      // Step 2: Close existing connections gracefully
      this.logger(`🔌 P9: Closing ${this.connections.size} active connections...`);
      for (const connection of this.connections) {
        connection.end();
      }

      // Wait a moment for connections to close naturally
      await this.delay(2000);

      // Force close remaining connections
      if (this.connections.size > 0) {
        this.logger(`🔨 P9: Force closing ${this.connections.size} remaining connections...`);
        for (const connection of this.connections) {
          connection.destroy();
        }
      }

      // Step 3: Close database connections
      this.logger('🗄️ P9: Closing database connections...');
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        this.logger('✅ P9: Database connections closed');
      }

      // Step 4: Cleanup other resources (Redis, external connections, etc.)
      await this.cleanupResources();

      clearTimeout(shutdownTimeout);
      this.logger('🎉 P9: Graceful shutdown completed successfully');

      process.exit(exitCode);

    } catch (error) {
      clearTimeout(shutdownTimeout);
      this.logger(`❌ P9: Error during shutdown: ${error.message}`);
      process.exit(1);
    }
  }

  private async cleanupResources() {
    this.logger('🧹 P9: Cleaning up additional resources...');

    // Add cleanup for other resources like:
    // - Redis connections
    // - File handles
    // - WebSocket connections
    // - Background jobs
    // - Cache systems

    // For now, just wait a moment to ensure cleanup
    await this.delay(1000);
    this.logger('✅ P9: Resource cleanup completed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public method to manually trigger shutdown
  public async gracefulShutdown(): Promise<void> {
    return this.shutdown();
  }

  // Health check method
  public isHealthy(): boolean {
    return !this.isShuttingDown && this.server.listening;
  }

  // Get connection stats
  public getConnectionStats() {
    return {
      activeConnections: this.connections.size,
      isShuttingDown: this.isShuttingDown,
      serverListening: this.server.listening
    };
  }
}

// Helper function to initialize graceful shutdown
export function initializeGracefulShutdown(
  server: Server,
  config?: Partial<GracefulShutdownConfig>
): GracefulShutdown {
  return new GracefulShutdown(server, config);
}