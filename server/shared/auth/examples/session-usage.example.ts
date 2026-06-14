/**
 * SessionController Usage Examples
 * 
 * This file demonstrates various use cases for the SessionController
 * in both Main_App and Admin_Panel contexts.
 * 
 * DO NOT import this file in production code - it's for reference only.
 */

import { Request, Response } from 'express';
import { 
  sessionController, 
  mongoSessionStore,
  redisSessionStore,
  SessionData
} from '../index';
import crypto from 'crypto';

// ============================================================================
// SETUP - Run once at application startup
// ============================================================================

export function initializeSessionManagement(useRedis: boolean = false) {
  // Choose storage backend
  const store = useRedis ? redisSessionStore : mongoSessionStore;
  
  // Configure Redis client if using Redis
  if (useRedis) {
    const redisClient = require('../../../lib/redis').getRedisClient();
    redisSessionStore.setRedisClient(redisClient);
  }
  
  // Set the session store
  sessionController.setSessionStore(store);
  
  console.log(`[SessionController] Initialized with ${useRedis ? 'Redis' : 'MongoDB'} store`);
}

// ============================================================================
// EXAMPLE 1: User Login (Main App)
// ============================================================================

export async function handleUserLogin(req: Request, res: Response) {
  try {
    // 1. Validate credentials (your existing logic)
    const { email, password } = req.body;
    const user = await authenticateUser(email, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // 2. Parse device info from user agent
    const device = parseUserAgent(req.headers['user-agent'] || '');
    
    // 3. Create session data
    const sessionData: SessionData = {
      sessionId: crypto.randomBytes(16).toString('hex'),
      userId: user.id,
      userType: 'user',
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      device,
      location: await getLocationFromIP(req.ip),
      isSecure: req.secure || req.headers['x-forwarded-proto'] === 'https'
    };
    
    // 4. Create session
    const result = await sessionController.createSession(sessionData);
    
    // 5. Return tokens to client
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      sessionToken: result.sessionToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt
    });
    
  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

// ============================================================================
// EXAMPLE 2: Admin Login (Admin Panel)
// ============================================================================

export async function handleAdminLogin(req: Request, res: Response) {
  try {
    // 1. Validate admin credentials
    const { email, password } = req.body;
    const admin = await authenticateAdmin(email, password);
    
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // 2. Create admin session
    const sessionData: SessionData = {
      sessionId: crypto.randomBytes(16).toString('hex'),
      userId: admin.id,
      userType: 'admin', // Mark as admin session
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      device: parseUserAgent(req.headers['user-agent'] || ''),
      location: await getLocationFromIP(req.ip),
      isSecure: req.secure
    };
    
    const result = await sessionController.createSession(sessionData);
    
    // 3. Check risk score for admin access
    const validation = await sessionController.validateSession(result.sessionToken);
    
    if (validation.session && validation.session.riskScore > 50) {
      // High risk - require 2FA or additional verification
      return res.status(403).json({
        error: 'additional_verification_required',
        message: 'Please verify your identity',
        riskScore: validation.session.riskScore
      });
    }
    
    res.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role
      },
      sessionToken: result.sessionToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt
    });
    
  } catch (error) {
    console.error('[AdminLogin] Error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

// ============================================================================
// EXAMPLE 3: Authentication Middleware
// ============================================================================

export async function requireAuth(req: any, res: Response, next: any) {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const sessionToken = authHeader.substring(7);
    
    // 2. Validate session
    const validation = await sessionController.validateSession(sessionToken);
    
    if (!validation.isValid) {
      return res.status(401).json({ 
        error: 'Invalid session',
        reason: validation.reason 
      });
    }
    
    // 3. Attach session to request
    req.session = validation.session;
    req.user = await getUserById(validation.session!.userId);
    
    // 4. Continue to next middleware
    next();
    
  } catch (error) {
    console.error('[Auth] Error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// ============================================================================
// EXAMPLE 4: Token Refresh
// ============================================================================

export async function handleRefreshToken(req: Request, res: Response) {
  try {
    const { sessionToken, refreshToken } = req.body;
    
    if (!sessionToken || !refreshToken) {
      return res.status(400).json({ error: 'Missing tokens' });
    }
    
    // Refresh the session
    const result = await sessionController.refreshSession(
      sessionToken,
      refreshToken
    );
    
    if (!result.success) {
      return res.status(401).json({ 
        error: 'Token refresh failed',
        reason: result.reason 
      });
    }
    
    res.json({
      success: true,
      sessionToken: result.sessionToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt
    });
    
  } catch (error) {
    console.error('[Refresh] Error:', error);
    res.status(500).json({ error: 'Refresh failed' });
  }
}

// ============================================================================
// EXAMPLE 5: Logout
// ============================================================================

export async function handleLogout(req: any, res: Response) {
  try {
    const sessionToken = req.headers.authorization?.substring(7);
    
    if (!sessionToken) {
      return res.status(400).json({ error: 'No token provided' });
    }
    
    const destroyed = await sessionController.destroySession(sessionToken);
    
    if (destroyed) {
      res.json({ 
        success: true,
        message: 'Logged out successfully' 
      });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
    
  } catch (error) {
    console.error('[Logout] Error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
}

// ============================================================================
// EXAMPLE 6: Logout from All Devices
// ============================================================================

export async function handleLogoutAllDevices(req: any, res: Response) {
  try {
    const currentSessionToken = req.headers.authorization?.substring(7);
    const userId = req.user.id;
    
    // Destroy all sessions except current one
    const count = await sessionController.destroyAllUserSessions(
      userId,
      currentSessionToken
    );
    
    res.json({
      success: true,
      message: `Logged out from ${count} other devices`,
      devicesLoggedOut: count
    });
    
  } catch (error) {
    console.error('[LogoutAll] Error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
}

// ============================================================================
// EXAMPLE 7: Get Active Sessions
// ============================================================================

export async function handleGetSessions(req: any, res: Response) {
  try {
    const userId = req.user.id;
    const sessions = await sessionController.getActiveSessions(userId);
    
    // Format for display
    const formattedSessions = sessions.map(s => ({
      id: s.id,
      device: {
        type: s.device.type,
        os: s.device.os,
        browser: s.device.browser
      },
      location: s.location?.city 
        ? `${s.location.city}, ${s.location.country}`
        : s.location?.country || 'Unknown',
      ipAddress: s.ipAddress,
      lastActivity: s.lastActivity,
      createdAt: s.createdAt,
      isCurrent: (s as any).sessionToken === req.headers.authorization?.substring(7)
    }));
    
    res.json({
      success: true,
      sessions: formattedSessions
    });
    
  } catch (error) {
    console.error('[GetSessions] Error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
}

// ============================================================================
// EXAMPLE 8: Activity Tracking Middleware
// ============================================================================

export function trackActivity(req: any, res: Response, next: any) {
  // Track activity asynchronously (don't block request)
  if (req.session) {
    const sessionToken = req.headers.authorization?.substring(7);
    const action = `${req.method} ${req.path}`;
    const page = req.originalUrl;
    
    sessionController.updateActivity(sessionToken, action, page)
      .catch(error => console.error('[Activity] Error:', error));
  }
  
  next();
}

// ============================================================================
// EXAMPLE 9: Scheduled Cleanup Job
// ============================================================================

export async function scheduleSessionCleanup() {
  // Run every 24 hours
  setInterval(async () => {
    try {
      console.log('[Cleanup] Starting session cleanup...');
      const count = await sessionController.cleanupExpiredSessions();
      console.log(`[Cleanup] Removed ${count} expired sessions`);
    } catch (error) {
      console.error('[Cleanup] Error:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
}

// ============================================================================
// Helper Functions
// ============================================================================

async function authenticateUser(email: string, password: string): Promise<any> {
  // Your existing user authentication logic
  return null;
}

async function authenticateAdmin(email: string, password: string): Promise<any> {
  // Your existing admin authentication logic
  return null;
}

async function getUserById(userId: string): Promise<any> {
  // Your existing user lookup logic
  return null;
}

function parseUserAgent(userAgent: string) {
  // Simple parser - use a library like 'ua-parser-js' in production
  const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
  const isTablet = /tablet|ipad/i.test(userAgent);
  
  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
  if (isTablet) deviceType = 'tablet';
  else if (isMobile) deviceType = 'mobile';
  
  return {
    type: deviceType,
    os: userAgent.includes('Windows') ? 'Windows' 
      : userAgent.includes('Mac') ? 'macOS'
      : userAgent.includes('Linux') ? 'Linux'
      : userAgent.includes('Android') ? 'Android'
      : userAgent.includes('iOS') ? 'iOS'
      : 'Unknown',
    browser: userAgent.includes('Chrome') ? 'Chrome'
      : userAgent.includes('Firefox') ? 'Firefox'
      : userAgent.includes('Safari') ? 'Safari'
      : userAgent.includes('Edge') ? 'Edge'
      : 'Unknown',
    version: '1.0' // Extract actual version in production
  };
}

async function getLocationFromIP(ip: string | undefined): Promise<any> {
  // Use a geolocation service in production (e.g., MaxMind, IPStack)
  if (!ip) return undefined;
  
  return {
    country: 'US',
    region: 'California',
    city: 'San Francisco',
    timezone: 'America/Los_Angeles'
  };
}
