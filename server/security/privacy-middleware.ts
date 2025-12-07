/**
 * P3-6: Privacy-First Middleware
 * 
 * Implements privacy by design principles with automatic data protection,
 * consent validation, and privacy-preserving request processing
 */

import { Request, Response, NextFunction } from 'express';
import { DataPrivacyController } from './gdpr-compliance';

/**
 * P3-6.1: Privacy by design middleware
 */
export function privacyByDesignMiddleware(options: {
  requireConsent?: string[];
  logDataProcessing?: boolean;
  anonymizeIPs?: boolean;
  enableCookieConsent?: boolean;
  dataMinimization?: boolean;
} = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        requireConsent = [],
        logDataProcessing = true,
        anonymizeIPs = true,
        enableCookieConsent = true,
        dataMinimization = true
      } = options;

      // P3-6.1a: IP anonymization for privacy
      if (anonymizeIPs && req.ip) {
        req.originalIP = req.ip;
        // Anonymize IPv4 (remove last octet) and IPv6 (remove last 64 bits)
        if (req.ip.includes('.')) {
          req.ip = req.ip.replace(/\.\d+$/, '.0');
        } else if (req.ip.includes(':')) {
          req.ip = req.ip.replace(/:[\da-f]*:[\da-f]*:[\da-f]*:[\da-f]*$/i, '::');
        }
      }

      // P3-6.1b: Consent validation
      if (requireConsent.length > 0 && req.user?.id) {
        for (const consentType of requireConsent) {
          if (!DataPrivacyController.hasConsent(req.user.id, consentType)) {
            return res.status(403).json({
              error: 'Privacy consent required',
              consentType,
              message: `You must provide consent for ${consentType} to access this resource`
            });
          }
        }
      }

      // P3-6.1c: Data processing logging
      if (logDataProcessing && req.user?.id) {
        const dataType = req.route?.path || req.path;
        const action = req.method.toLowerCase();
        
        DataPrivacyController.logDataProcessing(
          req.user.id,
          action === 'get' ? 'process' : 
          action === 'post' ? 'collect' :
          action === 'put' || action === 'patch' ? 'process' :
          action === 'delete' ? 'delete' : 'process',
          `api_endpoint_${dataType.replace(/[^a-zA-Z0-9]/g, '_')}`,
          `${action}_request_processing`
        );
      }

      // P3-6.1d: Add privacy headers
      res.setHeader('X-Privacy-Policy', '/privacy-policy');
      res.setHeader('X-Data-Protection', 'GDPR-compliant');
      res.setHeader('X-Consent-Required', requireConsent.join(',') || 'none');

      // P3-6.1e: Data minimization helper
      if (dataMinimization) {
        req.minimizeData = (data: any, allowedFields: string[]) => {
          if (!data || typeof data !== 'object') return data;
          
          const minimized: any = {};
          allowedFields.forEach(field => {
            if (data.hasOwnProperty(field)) {
              minimized[field] = data[field];
            }
          });
          return minimized;
        };
      }

      console.log(`🔐 P3-6: Privacy middleware applied for ${req.method} ${req.path}`);
      next();

    } catch (error) {
      console.error('🚨 P3-6: Privacy middleware error:', error);
      res.status(500).json({ 
        error: 'Privacy protection system error' 
      });
    }
  };
}

/**
 * P3-6.2: Cookie consent middleware
 */
export function cookieConsentMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for cookie consent
      const hasConsent = req.cookies?.cookie_consent === 'granted' ||
                        req.headers['x-cookie-consent'] === 'granted';

      if (!hasConsent) {
        // Only set essential cookies without consent
        res.locals.cookiePolicy = 'essential-only';
        
        // Add consent banner requirement
        res.setHeader('X-Cookie-Consent-Required', 'true');
        res.setHeader('X-Cookie-Policy', 'essential-only');
      } else {
        res.locals.cookiePolicy = 'all-cookies';
        res.setHeader('X-Cookie-Policy', 'all-cookies');
        
        // Log consent if user is identified
        if (req.user?.id) {
          DataPrivacyController.recordConsent(
            req.user.id,
            req.workspace?.id || 'unknown',
            'cookies',
            true,
            ['analytics', 'functional', 'marketing'],
            req
          );
        }
      }

      console.log(`🍪 P3-6: Cookie consent status: ${hasConsent ? 'granted' : 'pending'}`);
      next();

    } catch (error) {
      console.error('🚨 P3-6: Cookie consent middleware error:', error);
      next(); // Continue without blocking
    }
  };
}

/**
 * P3-6.3: Data anonymization middleware
 */
export function dataAnonymizationMiddleware(options: {
  anonymizeFields?: string[];
  hashFields?: string[];
  removeFields?: string[];
} = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        anonymizeFields = ['ip', 'userAgent'],
        hashFields = ['email'],
        removeFields = ['password', 'token']
      } = options;

      // Anonymize request data
      if (req.body) {
        req.body = anonymizeObject(req.body, { anonymizeFields, hashFields, removeFields });
      }

      if (req.query) {
        req.query = anonymizeObject(req.query, { anonymizeFields, hashFields, removeFields });
      }

      // Override res.json to anonymize response data
      const originalJson = res.json;
      res.json = function(data: any) {
        if (data && typeof data === 'object') {
          data = anonymizeObject(data, { anonymizeFields, hashFields, removeFields });
        }
        return originalJson.call(this, data);
      };

      console.log(`🔒 P3-6: Data anonymization applied`);
      next();

    } catch (error) {
      console.error('🚨 P3-6: Data anonymization middleware error:', error);
      next();
    }
  };
}

/**
 * P3-6.4: Helper function to anonymize object data
 */
function anonymizeObject(obj: any, options: {
  anonymizeFields: string[];
  hashFields: string[];
  removeFields: string[];
}): any {
  if (!obj || typeof obj !== 'object') return obj;

  const result = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    // Remove sensitive fields
    if (options.removeFields.includes(key)) {
      continue;
    }

    // Hash specific fields
    if (options.hashFields.includes(key) && typeof value === 'string') {
      const crypto = require('crypto');
      (result as any)[key] = crypto.createHash('sha256').update(value).digest('hex').substring(0, 12) + '...';
      continue;
    }

    // Anonymize specific fields
    if (options.anonymizeFields.includes(key)) {
      if (key === 'ip' && typeof value === 'string') {
        (result as any)[key] = value.includes('.') ? 
          value.replace(/\.\d+$/, '.xxx') : 
          value.replace(/:[\da-f]*:[\da-f]*:[\da-f]*:[\da-f]*$/i, '::xxxx');
        continue;
      }
      if (key === 'email' && typeof value === 'string') {
        const [username, domain] = value.split('@');
        (result as any)[key] = username.substring(0, 2) + '***@' + domain;
        continue;
      }
      if (key === 'userAgent' && typeof value === 'string') {
        (result as any)[key] = 'Browser/Agent (anonymized)';
        continue;
      }
    }

    // Recursively process nested objects
    if (typeof value === 'object' && value !== null) {
      (result as any)[key] = anonymizeObject(value, options);
    } else {
      (result as any)[key] = value;
    }
  }

  return result;
}

/**
 * P3-6.5: Response data filtering for privacy
 */
export function filterResponseData(data: any, userRole: string = 'user'): any {
  if (!data || typeof data !== 'object') return data;

  // Define field access levels
  const fieldAccess = {
    admin: ['*'], // All fields
    moderator: ['id', 'username', 'email', 'profile', 'preferences', 'stats'],
    user: ['id', 'username', 'profile', 'preferences'],
    guest: ['id', 'username', 'profile']
  };

  const allowedFields = fieldAccess[userRole as keyof typeof fieldAccess] || fieldAccess.guest;

  if (allowedFields.includes('*')) {
    return data;
  }

  // Filter based on role
  const filtered: any = Array.isArray(data) ? [] : {};

  if (Array.isArray(data)) {
    return data.map(item => filterResponseData(item, userRole));
  }

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      if (typeof value === 'object' && value !== null) {
        filtered[key] = filterResponseData(value, userRole);
      } else {
        filtered[key] = value;
      }
    }
  }

  return filtered;
}

/**
 * P3-6.6: Pre-configured privacy middleware combinations
 */

// Standard privacy protection
export const standardPrivacyMiddleware = privacyByDesignMiddleware({
  logDataProcessing: true,
  anonymizeIPs: true,
  enableCookieConsent: true,
  dataMinimization: true
});

// High privacy protection (for sensitive endpoints)
export const highPrivacyMiddleware = [
  privacyByDesignMiddleware({
    requireConsent: ['data_processing'],
    logDataProcessing: true,
    anonymizeIPs: true,
    enableCookieConsent: true,
    dataMinimization: true
  }),
  dataAnonymizationMiddleware({
    anonymizeFields: ['ip', 'userAgent', 'deviceId'],
    hashFields: ['email', 'phone'],
    removeFields: ['password', 'token', 'apiKey', 'secret']
  })
];

// Marketing data processing (requires explicit consent)
export const marketingPrivacyMiddleware = privacyByDesignMiddleware({
  requireConsent: ['marketing', 'analytics'],
  logDataProcessing: true,
  anonymizeIPs: true,
  enableCookieConsent: true
});