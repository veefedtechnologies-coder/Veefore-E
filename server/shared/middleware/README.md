# Shared Authentication Middleware

Consolidated authentication middleware for both Main Application and Admin Panel. This middleware provides JWT validation, session management, role-based access control, and workspace permission checking.

## Features

- **JWT Validation**: Validates Firebase authentication tokens
- **Session Management**: Supports cookie-based sessions
- **Admin Authentication**: Separate authentication for admin users
- **Workspace Access Control**: Validates user access to workspaces
- **Permission Checking**: Fine-grained permission validation
- **Error Handling**: Consistent error responses with proper status codes

## Middleware Functions

### `authenticateUser`

Main authentication middleware that validates JWT tokens from Firebase.

**Supports**:
- Bearer tokens in Authorization header
- Cookie-based session tokens

**Usage**:
```typescript
import { authenticateUser } from '../shared/middleware/auth.middleware';

router.get('/api/user/profile', authenticateUser, getUserProfile);
```

**Error Responses**:
- `401 NO_TOKEN`: No authentication token provided
- `401 TOKEN_EXPIRED`: Token has expired
- `401 INVALID_TOKEN_FORMAT`: Token format is invalid
- `404 USER_NOT_FOUND`: User doesn't exist in database
- `403 AUTH_FAILED`: General authentication failure

### `requireAdmin`

Authentication middleware for admin-only routes.

**Usage**:
```typescript
import { requireAdmin } from '../shared/middleware/auth.middleware';

router.get('/api/admin/users', requireAdmin, getAllUsers);
```

**Error Responses**:
- `401 NO_ADMIN_TOKEN`: No admin token provided
- `403 NOT_ADMIN`: User is not an admin
- `401 INVALID_ADMIN_TOKEN`: Invalid admin token

### `requireWorkspace`

Validates that the authenticated user has access to the specified workspace.

**Workspace ID Sources** (in order of precedence):
1. Route parameters: `req.params.workspaceId`
2. Query parameters: `req.query.workspaceId`
3. Request body: `req.body.workspaceId`
4. User's default workspace: `req.user.workspaceId`

**Usage**:
```typescript
import { authenticateUser, requireWorkspace } from '../shared/middleware/auth.middleware';

router.get('/api/workspace/:workspaceId/content', 
  authenticateUser, 
  requireWorkspace, 
  getWorkspaceContent
);
```

**Error Responses**:
- `401 NO_AUTH`: User not authenticated
- `400 NO_WORKSPACE_ID`: No workspace ID provided
- `404 WORKSPACE_NOT_FOUND`: Workspace doesn't exist
- `403 WORKSPACE_ACCESS_DENIED`: User is not a member or owner

### `checkPermission(permission: string)`

Permission checking middleware factory. Creates middleware that checks specific permissions.

**Permission Format**: `resource:action`

**Examples**:
- `workspace:admin` - Workspace admin actions (owner only)
- `workspace:delete` - Delete workspace (owner only)
- `workspace:settings` - Modify workspace settings (owner only)
- `content:create` - Create content (members and owner)
- `content:read` - Read content (members and owner)

**Usage**:
```typescript
import { authenticateUser, requireWorkspace, checkPermission } from '../shared/middleware/auth.middleware';

// Only workspace owner can modify settings
router.put('/api/workspace/:workspaceId/settings', 
  authenticateUser, 
  requireWorkspace,
  checkPermission('workspace:settings'),
  updateWorkspaceSettings
);

// All members can create content
router.post('/api/workspace/:workspaceId/content',
  authenticateUser,
  requireWorkspace,
  checkPermission('content:create'),
  createContent
);
```

**Error Responses**:
- `401 NO_AUTH`: User not authenticated
- `400 NO_WORKSPACE_CONTEXT`: Workspace context required for permission check
- `403 INSUFFICIENT_PERMISSIONS`: User doesn't have required permission

### `optionalAuth`

Attempts authentication but doesn't fail if no token is present. Useful for routes that behave differently for authenticated vs anonymous users.

**Usage**:
```typescript
import { optionalAuth } from '../shared/middleware/auth.middleware';

// Public endpoint that shows different data for authenticated users
router.get('/api/public/content', optionalAuth, getPublicContent);
```

**Behavior**:
- If token present and valid: Sets `req.user`
- If token invalid or missing: Continues without setting `req.user`
- Never fails the request

## Type Definitions

### `AuthenticatedRequest`

Extended Express Request with authentication data:

```typescript
interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;                 // Firebase UID
    email?: string;              // User email
    displayName?: string;        // Display name
    role?: 'user' | 'admin' | 'superadmin';  // User role
    isAdmin?: boolean;           // Admin flag
    userId?: string;             // Database user ID
    workspaceId?: string;        // Default workspace ID
  };
  workspace?: {
    workspaceId: string;         // Workspace ID
    name: string;                // Workspace name
    ownerId: string;             // Owner user ID
    members: string[];           // Member user IDs
    plan: string;                // Subscription plan
  };
}
```

### `AuthenticationError`

Custom error class for authentication failures:

```typescript
class AuthenticationError extends Error {
  constructor(
    message: string,
    statusCode: number = 401,
    code: string = 'AUTH_ERROR'
  );
}
```

## Common Usage Patterns

### Protected User Route
```typescript
router.get('/api/user/profile',
  authenticateUser,
  getUserProfile
);
```

### Protected Admin Route
```typescript
router.get('/api/admin/users',
  requireAdmin,
  getAllUsers
);
```

### Workspace-Scoped Route
```typescript
router.get('/api/workspace/:workspaceId/analytics',
  authenticateUser,
  requireWorkspace,
  getWorkspaceAnalytics
);
```

### Permission-Based Route
```typescript
router.delete('/api/workspace/:workspaceId',
  authenticateUser,
  requireWorkspace,
  checkPermission('workspace:delete'),
  deleteWorkspace
);
```

### Public Route with Optional Auth
```typescript
router.get('/api/public/videos',
  optionalAuth,
  (req, res) => {
    // Show personalized results if user is authenticated
    if (req.user) {
      return getPersonalizedVideos(req, res);
    }
    return getPublicVideos(req, res);
  }
);
```

### Complex Permission Chain
```typescript
router.post('/api/workspace/:workspaceId/content/publish',
  authenticateUser,           // Verify user is logged in
  requireWorkspace,           // Verify user has workspace access
  checkPermission('content:create'),  // Verify create permission
  publishContent
);
```

## Backward Compatibility

The following exports maintain backward compatibility with existing codebase:

```typescript
export const authenticateToken = authenticateUser;
export const authenticateJWT = authenticateUser;
export const requireAuth = authenticateUser;
```

## Requirements

This middleware fulfills the following requirements:
- **Requirement 5.3**: Component Architecture Optimization - Extract shared authentication middleware
- **Requirement 6.4**: Bundle Size Optimization - Consolidate duplicate authentication logic

## Testing

Comprehensive unit tests are available in `auth.middleware.test.ts` covering:
- User authentication with Bearer tokens
- User authentication with cookies
- Token expiration handling
- Admin authentication
- Workspace access validation
- Permission checking
- Optional authentication
- Error handling

Run tests:
```bash
npm test -- auth.middleware.test.ts
```

## Security Considerations

1. **Token Validation**: All tokens are verified against Firebase Auth
2. **Session Management**: Cookie-based sessions use secure, signed cookies
3. **Error Handling**: Errors don't leak sensitive information
4. **Permission Checking**: Hierarchical permission model (admin > owner > member)
5. **Workspace Isolation**: Users can only access workspaces they're members of

## Migration Guide

### From Old Middleware

**Before**:
```typescript
import { authenticateToken } from '../../middleware/auth';

router.get('/api/user/profile', authenticateToken, getUserProfile);
```

**After**:
```typescript
import { authenticateUser } from '../../shared/middleware/auth.middleware';

router.get('/api/user/profile', authenticateUser, getUserProfile);
```

## Dependencies

- `firebase-admin`: Firebase authentication
- `express`: Web framework types
- `../../models/User/User`: User model
- `../../models/Admin/Admin`: Admin model
- `../../models/Workspace`: Workspace model
- `../../middleware/sessionManager`: Session cookie management
