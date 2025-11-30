/**
 * P1-5 SECURITY: CORS & Origins Security
 * 
 * Comprehensive Cross-Origin Resource Sharing security with explicit
 * origin allowlists, secure credentials handling, and optimized preflight
 */

import { Request, Response, NextFunction } from 'express';

/**
 * P1-5.1: Environment-specific origin allowlists
 * NO WILDCARDS for production security
 */
const getAllowedOrigins = (): string[] => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Base allowed origins
  const allowedOrigins: string[] = [];
  
  if (isDevelopment) {
    // Development origins - local development
    allowedOrigins.push(
      'http://localhost:3000',
      'http://localhost:5000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5000',
      'http://0.0.0.0:5000',
      // Cloudflare tunnel URL
      'https://veefore-webhook.veefore.com',
      // Replit development URL
      'https://61ac61b0-5835-4a08-a9df-b5bdf937f9b4-00-2ixvi7v9sb9yz.worf.replit.dev'
    );
  }
  
  if (isProduction) {
    // Production origins - explicit domains only
    allowedOrigins.push(
      'https://veefore.com',
      'https://www.veefore.com',
      'https://app.veefore.com',
      'https://dashboard.veefore.com',
      'https://veefore-webhook.veefore.com',
      // Allow localhost for same-server requests (Replit production environment)
      'http://localhost:5000',
      'http://127.0.0.1:5000',
      'http://0.0.0.0:5000'
    );
  }
  
  // Add Replit production domains if available
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) {
    allowedOrigins.push(`https://${replitDomain}`);
  }
  
  // Add any custom allowed origins from environment
  const customOrigins = process.env.ALLOWED_ORIGINS;
  if (customOrigins) {
    customOrigins.split(',').forEach(origin => {
      const trimmed = origin.trim();
      if (trimmed && !allowedOrigins.includes(trimmed)) {
        allowedOrigins.push(trimmed);
      }
    });
  }
  
  console.log(`🔒 CORS: Configured ${allowedOrigins.length} allowed origins for ${process.env.NODE_ENV} environment`);
  return allowedOrigins;
};

/**
 * P1-5.1: Origin validation with security logging
 */
function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    // Allow same-origin requests (no origin header)
    return true;
  }
  
  const isAllowed = allowedOrigins.includes(origin);
  
  if (!isAllowed) {
    console.warn(`🚨 CORS SECURITY: Blocked unauthorized origin: ${origin}`);
    console.warn(`🔒 CORS SECURITY: Allowed origins: ${allowedOrigins.join(', ')}`);
  } else {
    console.log(`✅ CORS SECURITY: Allowed origin: ${origin}`);
  }
  
  return isAllowed;
}

/**
 * P1-5.2: Secure credentials handling configuration
 */
interface CorsSecurityOptions {
  allowCredentials?: boolean;
  maxAge?: number;
  exposedHeaders?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
}

/**
 * P1-5: Main CORS security middleware
 */
export function corsSecurityMiddleware(options: CorsSecurityOptions = {}) {
  const {
    allowCredentials = true, // Required for HTTP-only cookies
    maxAge = 86400, // 24 hours cache for preflight
    exposedHeaders = [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining', 
      'X-RateLimit-Reset',
      'X-Total-Count',
      'ETag',
      'Last-Modified'
    ],
    allowedMethods = [
      'GET',
      'POST', 
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
      'HEAD'
    ],
    allowedHeaders = [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-CSRF-Token',
      'X-Workspace-ID',
      'Cache-Control',
      'Pragma',
      'If-Modified-Since',
      'If-None-Match'
    ]
  } = options;
  
  const allowedOrigins = getAllowedOrigins();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    // P1-5.1: Origin validation with explicit allowlist
    if (origin && !isOriginAllowed(origin, allowedOrigins)) {
      return res.status(403).json({
        error: 'CORS policy violation: Origin not allowed',
        code: 'CORS_ORIGIN_DENIED',
        timestamp: new Date().toISOString()
      });
    }
    
    // P1-5.2: Set secure CORS headers
    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    
    // P1-5.2: Credentials handling (required for HTTP-only cookies)
    if (allowCredentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    // P1-5.3: Optimized preflight handling
    if (req.method === 'OPTIONS') {
      // Preflight request
      res.header('Access-Control-Allow-Methods', allowedMethods.join(', '));
      res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      res.header('Access-Control-Max-Age', maxAge.toString());
      
      // P1-5.3: Additional preflight security headers
      res.header('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      
      console.log(`✅ CORS: Preflight response for ${origin} → ${req.headers['access-control-request-method']}`);
      return res.status(204).end();
    }
    
    // P1-5.2: Expose headers for actual requests
    if (exposedHeaders.length > 0) {
      res.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    }
    
    // P1-5.2: Vary header for caching optimization
    res.header('Vary', 'Origin');
    
    next();
  };
}

/**
 * P1-5: Strict CORS for sensitive endpoints
 */
export function strictCorsMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = getAllowedOrigins();
  const origin = req.headers.origin;
  
  // Require explicit origin for sensitive operations
  if (!origin) {
    console.warn('🚨 STRICT CORS: Missing origin header for sensitive endpoint');
    return res.status(403).json({
      error: 'Origin header required for this endpoint',
      code: 'CORS_ORIGIN_REQUIRED'
    });
  }
  
  if (!isOriginAllowed(origin, allowedOrigins)) {
    return res.status(403).json({
      error: 'CORS policy violation: Unauthorized origin for sensitive endpoint',
      code: 'CORS_STRICT_DENIED'
    });
  }
  
  console.log(`✅ STRICT CORS: Authorized origin for sensitive endpoint: ${origin}`);
  next();
}

/**
 * P1-5: CORS security for API endpoints
 */
export function apiCorsMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = getAllowedOrigins();
  const origin = req.headers.origin;
  
  // Check for API-specific threats
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers.referer || '';
  
  // P1-5.2: Block suspicious requests
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i
  ];
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
  
  if (isSuspicious && origin && !isOriginAllowed(origin, allowedOrigins)) {
    console.warn(`🚨 API CORS: Blocked suspicious request from ${origin} with UA: ${userAgent}`);
    return res.status(403).json({
      error: 'Request blocked by security policy',
      code: 'API_SECURITY_BLOCKED'
    });
  }
  
  // P1-5.2: Validate referer for state-changing operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (referer && origin) {
      try {
        const refererUrl = new URL(referer);
        const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
        
        if (refererOrigin !== origin) {
          console.warn(`🚨 API CORS: Origin/Referer mismatch - Origin: ${origin}, Referer: ${refererOrigin}`);
          return res.status(403).json({
            error: 'Origin and referer mismatch',
            code: 'CORS_REFERER_MISMATCH'
          });
        }
      } catch (error) {
        console.warn(`🚨 API CORS: Invalid referer header: ${referer}`);
      }
    }
  }
  
  next();
}

/**
 * P1-5: CORS monitoring and metrics
 */
export function corsMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const method = req.method;
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Log CORS activity for monitoring
  if (origin) {
    console.log(`📊 CORS METRICS: ${method} from ${origin} - UA: ${userAgent.substring(0, 50)}`);
  }
  
  // Add CORS metrics to response headers for monitoring
  res.on('finish', () => {
    const statusCode = res.statusCode;
    if (origin && statusCode >= 400) {
      console.warn(`📊 CORS METRICS: Error ${statusCode} for origin ${origin} on ${method} ${req.path}`);
    }
  });
  
  next();
}

/**
 * P1-5: Content Security Policy for CORS
 */
export function corsContentSecurityPolicy(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = getAllowedOrigins();
  
  // Build CSP connect-src from allowed origins
  const connectSrc = [
    "'self'",
    ...allowedOrigins,
    // Additional allowed connection sources
    'https://apis.google.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://graph.instagram.com',
    'https://api.instagram.com',
    'wss:',
    'ws:'
  ].join(' ');
  
  // Set CSP header that complements CORS policy - allow Replit iframe in development
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const frameAncestors = isDevelopment ? 
    `frame-ancestors 'self' https://replit.com https://*.replit.dev https://*.worf.replit.dev; ` :
    `frame-ancestors 'none'; `;
    
  res.header('Content-Security-Policy', 
    `connect-src ${connectSrc}; ` +
    frameAncestors +
    `base-uri 'self';`
  );
  
  next();
}

/**
 * P1-5: Emergency CORS lockdown (for security incidents)
 */
export function emergencyCorsLockdown(req: Request, res: Response, next: NextFunction) {
  const isLockdownActive = process.env.CORS_EMERGENCY_LOCKDOWN === 'true';
  
  if (isLockdownActive) {
    const origin = req.headers.origin;
    
    console.error(`🚨 EMERGENCY CORS LOCKDOWN: Blocking all cross-origin requests`);
    
    if (origin) {
      return res.status(503).json({
        error: 'Service temporarily unavailable due to security lockdown',
        code: 'CORS_EMERGENCY_LOCKDOWN',
        retryAfter: '3600' // 1 hour
      });
    }
  }
  
  next();
}

/**
 * P1-5: CORS health check endpoint
 */
export function corsHealthCheck(req: Request, res: Response) {
  const allowedOrigins = getAllowedOrigins();
  const origin = req.headers.origin;
  
  res.json({
    cors: {
      status: 'active',
      allowedOrigins: allowedOrigins.length,
      requestOrigin: origin || 'same-origin',
      isOriginAllowed: origin ? isOriginAllowed(origin, allowedOrigins) : true,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    }
  });
}
