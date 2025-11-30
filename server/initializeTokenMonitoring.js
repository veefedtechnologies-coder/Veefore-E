/**
 * Initialize Instagram Token Monitoring Service
 * This script should be called during server startup to enable continuous token health monitoring
 */

import InstagramTokenMonitor from './services/instagramTokenMonitor.js';

let tokenMonitorInstance = null;

/**
 * Initialize and start the Instagram token monitoring service
 * @param {Object} storage - MongoDB storage instance
 * @param {Object} config - Optional configuration overrides
 */
export function initializeTokenMonitoring(storage, config = {}) {
  try {
    console.log('[TOKEN MONITORING INIT] Initializing Instagram token monitoring service...');
    
    if (tokenMonitorInstance) {
      console.log('[TOKEN MONITORING INIT] Service already initialized');
      return tokenMonitorInstance;
    }

    // Create monitor instance
    tokenMonitorInstance = new InstagramTokenMonitor(storage);
    
    // Apply configuration overrides
    if (Object.keys(config).length > 0) {
      tokenMonitorInstance.updateConfig(config);
      console.log('[TOKEN MONITORING INIT] Applied configuration overrides:', config);
    }
    
    // Start monitoring
    tokenMonitorInstance.start();
    
    console.log('[TOKEN MONITORING INIT] ✅ Instagram token monitoring service initialized successfully');
    
    // Set up graceful shutdown
    process.on('SIGINT', () => {
      console.log('[TOKEN MONITORING INIT] Received SIGINT, stopping token monitoring...');
      if (tokenMonitorInstance) {
        tokenMonitorInstance.stop();
      }
    });
    
    process.on('SIGTERM', () => {
      console.log('[TOKEN MONITORING INIT] Received SIGTERM, stopping token monitoring...');
      if (tokenMonitorInstance) {
        tokenMonitorInstance.stop();
      }
    });
    
    return tokenMonitorInstance;
    
  } catch (error) {
    console.error('[TOKEN MONITORING INIT] Failed to initialize token monitoring:', error);
    throw error;
  }
}

/**
 * Get the current token monitoring instance
 */
export function getTokenMonitorInstance() {
  return tokenMonitorInstance;
}

/**
 * Stop the token monitoring service
 */
export function stopTokenMonitoring() {
  if (tokenMonitorInstance) {
    tokenMonitorInstance.stop();
    tokenMonitorInstance = null;
    console.log('[TOKEN MONITORING INIT] Token monitoring service stopped');
  }
}

/**
 * Get monitoring statistics
 */
export function getMonitoringStats() {
  if (tokenMonitorInstance) {
    return tokenMonitorInstance.getStats();
  }
  return null;
}

/**
 * Force an immediate health check
 */
export async function forceHealthCheck() {
  if (tokenMonitorInstance) {
    return await tokenMonitorInstance.forceHealthCheck();
  }
  throw new Error('Token monitoring service not initialized');
}

// Default configuration for production
export const defaultConfig = {
  checkInterval: 30 * 60 * 1000, // 30 minutes
  maxRetries: 3,
  retryDelay: 5000,
  batchSize: 10,
  enableAutoFix: true,
  enableAutoRefresh: true,
  logLevel: 'info'
};

// Development configuration (more frequent checks)
export const developmentConfig = {
  checkInterval: 5 * 60 * 1000, // 5 minutes
  maxRetries: 2,
  retryDelay: 3000,
  batchSize: 5,
  enableAutoFix: true,
  enableAutoRefresh: true,
  logLevel: 'debug'
};

export default {
  initializeTokenMonitoring,
  getTokenMonitorInstance,
  stopTokenMonitoring,
  getMonitoringStats,
  forceHealthCheck,
  defaultConfig,
  developmentConfig
};