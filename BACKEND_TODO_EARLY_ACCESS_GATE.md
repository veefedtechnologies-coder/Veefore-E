# Backend TODO: Implement Early Access Gate

Now that the frontend has been simplified, implement backend validation for early access.

## ✅ Frontend Complete
- Landing page always shows "Get Started" button
- Button navigates to `/signup` without checking early access
- User experience is transparent

## 🔨 Backend Implementation Needed

### 1. Create Early Access Verification Endpoint

**File:** `server/routes/early-access.ts` (or add to existing routes)

```typescript
import { Router } from 'express'

const router = Router()

/**
 * Verify if user has early access
 * GET /api/early-access/verify
 * 
 * Returns:
 * - hasAccess: boolean
 * - message?: string (for error cases)
 */
router.get('/verify', async (req, res) => {
  try {
    // Get email from session/cookies/auth
    const email = req.session?.email || 
                  req.cookies?.userEmail || 
                  req.headers['x-user-email']
    
    if (!email) {
      return res.json({ 
        hasAccess: false, 
        message: 'Please provide your email to check early access status.' 
      })
    }

    // Check database for early access status
    const result = await db.query(
      'SELECT status FROM early_access_users WHERE email = ? LIMIT 1',
      [email]
    )
    
    if (result && result.length > 0 && result[0].status === 'approved') {
      return res.json({ 
        hasAccess: true,
        email: email
      })
    }

    // User not approved or not in database
    return res.json({ 
      hasAccess: false, 
      message: 'You need early access to sign up. Join our waitlist to get notified!' 
    })
    
  } catch (error) {
    console.error('Early access verification error:', error)
    res.status(500).json({ 
      hasAccess: false, 
      message: 'Unable to verify early access status. Please try again.' 
    })
  }
})

export default router
```

### 2. Add Route Guard to Signup Page

**File:** `client/src/pages/Signup.tsx` (or similar)

```typescript
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { toast } from 'react-toastify' // or your toast library

export const Signup = () => {
  const [, navigate] = useLocation()
  const [isVerifying, setIsVerifying] = useState(true)
  const { openWaitlist } = useWaitlist() // if you want to offer waitlist

  useEffect(() => {
    // Verify early access on mount
    const verifyAccess = async () => {
      try {
        const response = await fetch('/api/early-access/verify')
        const { hasAccess, message } = await response.json()
        
        if (!hasAccess) {
          // Show error to user
          toast.error(message || 'Early access required')
          
          // Optional: Open waitlist modal
          // openWaitlist()
          
          // Redirect back to landing
          navigate('/')
        } else {
          // User has access, allow signup to proceed
          setIsVerifying(false)
        }
      } catch (error) {
        console.error('Access verification failed:', error)
        toast.error('Unable to verify access. Please try again.')
        navigate('/')
      }
    }

    verifyAccess()
  }, [navigate])

  // Show loading while verifying
  if (isVerifying) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Verifying access...</p>
        </div>
      </div>
    )
  }

  // Render signup form only if access is verified
  return (
    <div>
      {/* Your signup form */}
    </div>
  )
}
```

### 3. Alternative: Modal Instead of Redirect

If you prefer to show a modal instead of redirecting:

```typescript
import { useState } from 'react'
import Modal from '../components/Modal'

export const Signup = () => {
  const [showAccessDenied, setShowAccessDenied] = useState(false)
  const { openWaitlist } = useWaitlist()

  useEffect(() => {
    const verifyAccess = async () => {
      const response = await fetch('/api/early-access/verify')
      const { hasAccess, message } = await response.json()
      
      if (!hasAccess) {
        setShowAccessDenied(true)
      }
    }
    verifyAccess()
  }, [])

  return (
    <>
      {showAccessDenied && (
        <Modal onClose={() => navigate('/')}>
          <div className="p-6">
            <h2 className="text-2xl font-bold mb-4">Early Access Required</h2>
            <p className="mb-6">
              Sign up is currently limited to users with early access.
              Join our waitlist to be notified when we open to everyone!
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  openWaitlist()
                  setShowAccessDenied(false)
                }}
                className="btn-primary"
              >
                Join Waitlist
              </button>
              <button 
                onClick={() => navigate('/')}
                className="btn-secondary"
              >
                Back to Home
              </button>
            </div>
          </div>
        </Modal>
      )}
      
      {/* Your signup form */}
    </>
  )
}
```

## 🔒 Security Considerations

### 1. Don't Trust Frontend
- NEVER rely on localStorage or cookies alone
- Always validate on backend
- Backend is the single source of truth

### 2. Use Proper Authentication
```typescript
// Check if user is authenticated first
if (!req.session?.userId) {
  return res.status(401).json({ 
    hasAccess: false, 
    message: 'Please log in first' 
  })
}

// Then check early access for that authenticated user
const user = await getUserById(req.session.userId)
const hasEarlyAccess = await checkEarlyAccessStatus(user.email)
```

### 3. Rate Limiting
```typescript
import rateLimit from 'express-rate-limit'

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: 'Too many verification requests, please try again later.'
})

router.get('/verify', verifyLimiter, async (req, res) => {
  // ... verification logic
})
```

## 📊 Testing Backend Gate

### Manual Test Cases

1. **Test: User with Early Access**
   ```bash
   # Add user to database
   INSERT INTO early_access_users (email, status) VALUES ('user@test.com', 'approved');
   
   # Test API
   curl -H "x-user-email: user@test.com" http://localhost:5000/api/early-access/verify
   
   # Expected: { hasAccess: true, email: "user@test.com" }
   ```

2. **Test: User without Early Access**
   ```bash
   # Test API with unknown email
   curl -H "x-user-email: unknown@test.com" http://localhost:5000/api/early-access/verify
   
   # Expected: { hasAccess: false, message: "You need early access..." }
   ```

3. **Test: No Email Provided**
   ```bash
   curl http://localhost:5000/api/early-access/verify
   
   # Expected: { hasAccess: false, message: "Please provide your email..." }
   ```

### Integration Tests

```typescript
describe('Early Access Gate', () => {
  it('should allow approved users to access signup', async () => {
    // Setup: Add approved user to database
    await db.insert('early_access_users', { 
      email: 'approved@test.com', 
      status: 'approved' 
    })
    
    // Act: Try to access signup
    const response = await fetch('/api/early-access/verify', {
      headers: { 'x-user-email': 'approved@test.com' }
    })
    const data = await response.json()
    
    // Assert: Access granted
    expect(data.hasAccess).toBe(true)
  })

  it('should block non-approved users', async () => {
    const response = await fetch('/api/early-access/verify', {
      headers: { 'x-user-email': 'notapproved@test.com' }
    })
    const data = await response.json()
    
    expect(data.hasAccess).toBe(false)
    expect(data.message).toContain('waitlist')
  })
})
```

## 📋 Checklist

- [ ] Create `/api/early-access/verify` endpoint
- [ ] Add route guard to Signup page
- [ ] Implement error UI (toast or modal)
- [ ] Add rate limiting to verify endpoint
- [ ] Add proper authentication checks
- [ ] Write backend tests
- [ ] Test with approved user
- [ ] Test with non-approved user
- [ ] Test with no email
- [ ] Test error handling
- [ ] Deploy backend changes
- [ ] Verify in production

## 🎯 Expected User Flow

1. User visits landing page
2. User clicks "Get Started" button
3. Frontend navigates to `/signup`
4. Signup page mounts → calls `/api/early-access/verify`
5. Backend checks database for early access status
6. **If approved:** Signup form displays ✅
7. **If not approved:** Error message + redirect to landing ❌

## 📝 Database Schema Assumption

This assumes you have a table like:

```sql
CREATE TABLE early_access_users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL
);

-- Index for fast lookups
CREATE INDEX idx_email_status ON early_access_users(email, status);
```

If your schema is different, adjust the queries accordingly.

---

## ✅ Summary

**Frontend:** ✅ Complete (simplified, no early access logic)  
**Backend:** ⏳ To be implemented (validation endpoint + route guard)

The frontend is ready. Now implement the backend gate to complete the feature!
