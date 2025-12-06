import { Request, Response, NextFunction } from 'express'
import { admin } from '../firebase-admin'

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string
    email?: string
    displayName?: string
  }
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: 'Access token is required' })
    }

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token)
    
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      displayName: decodedToken.name
    }

    next()
  } catch (error) {
    console.error('Authentication error:', error)
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

// Export authenticateJWT as alias for backward compatibility
export const authenticateJWT = authenticateToken

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}
