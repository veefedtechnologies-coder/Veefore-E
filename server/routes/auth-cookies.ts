import { Router } from 'express';
import { 
  exchangeTokenForCookies, 
  clearAuthCookies, 
  authenticateCookie,
  generateCSRFToken,
  CookieAuthRequest 
} from '../middleware/cookie-auth';
import { validateRequest } from '../middleware/validation';
import { tokenExchangeSchema } from '../middleware/auth-validation-schemas';

const router = Router();

/**
 * P1-4.1 SECURITY: Exchange Bearer token for HTTP-only cookies with validation
 * This endpoint allows the frontend to migrate from localStorage to secure cookies
 */
router.post('/exchange-token', 
  validateRequest({ body: tokenExchangeSchema }), 
  exchangeTokenForCookies
);

/**
 * P1 SECURITY: Get CSRF token for authenticated users
 */
router.get('/csrf-token', authenticateCookie, (req: CookieAuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  
  const csrfToken = generateCSRFToken();
  
  // Update the CSRF token cookie
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false, // Frontend needs to read this
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000, // 1 hour
    path: '/'
  });
  
  res.json({ 
    csrfToken,
    user: {
      uid: req.user.uid,
      email: req.user.email,
      displayName: req.user.displayName
    }
  });
});

/**
 * P1 SECURITY: Logout and clear authentication cookies
 */
router.post('/logout', authenticateCookie, (req: CookieAuthRequest, res) => {
  clearAuthCookies(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * P1 SECURITY: Refresh authentication cookies
 */
router.post('/refresh', authenticateCookie, (req: CookieAuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  
  // For now, we'll rely on Firebase token refresh on the frontend
  // In a full implementation, we'd implement server-side token refresh
  const csrfToken = generateCSRFToken();
  
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000,
    path: '/'
  });
  
  res.json({ 
    success: true,
    csrfToken,
    user: {
      uid: req.user.uid,
      email: req.user.email,
      displayName: req.user.displayName
    }
  });
});

export default router;