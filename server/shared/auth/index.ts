/**
 * Shared Authentication Package
 * 
 * Consolidated authentication system for Veefore-E application.
 * Provides authentication, authorization, and session management
 * for both main application and admin panel.
 * 
 * @module @server/shared/auth
 */

// Configuration
export * from './config/auth.config';

// Types
export * from './types';

// Utilities
export * from './utils';

// Controllers
export * from './controllers';

// Services
export * from './services';

// Middleware
export * from './middleware';

/**
 * Package Version
 */
export const AUTH_PACKAGE_VERSION = '1.0.0';

/**
 * Initialize auth package
 * Call this during application startup to validate configuration
 */
export { validateAuthConfig as initializeAuth } from './config/auth.config';
