# Shared Auth Controllers

## Overview

This directory contains authentication controllers that are shared across the Main_App and Admin_Panel. These controllers provide unified interfaces for common authentication flows including OAuth, email authentication, and session management.

## OAuthController

The `OAuthController` provides a centralized implementation of OAuth 2.0 flows for multiple providers including Google, GitHub, Instagram, and Facebook.

### Features

- **Multi-Provider Support**: Unified interface for Google, GitHub, Instagram, and Facebook OAuth
- **Security**: Implements PKCE (Proof Key for Code Exchange) and state parameter for CSRF protection
- **Token Management**: Handles token exchange, refresh, and expiration
- **Account Linking**: Support for linking/unlinking OAuth accounts to user profiles
- **Flexible Integration**: Works with both Main_App and Admin_Panel OAuth requirements

### Setup

#### 1. Environment Variables

Configure the following environment variables for each provider you want to support:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OAUTH_CALLBACK_URL=https://yourdomain.com/api/v1/google-auth/callback

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=https://yourdomain.com/api/v1/github-auth/callback

# Instagram OAuth
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
SOCIAL_AUTH_BASE_URL=https://yourdomain.com

# Facebook OAuth (for Instagram Business)
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
```

#### 2. Initialize Controller

```typescript
import { OAuthController } from '../shared/auth/controllers';
import { storage } from './mongodb-storage';

const oauthController = new OAuthController(storage);
```


### Usage Examples

#### Basic OAuth Flow

```typescript
import { Router } from 'express';
import { OAuthController } from '../shared/auth/controllers';
import { storage } from './mongodb-storage';

const router = Router();
const oauthController = new OAuthController(storage);

// Initiate Google OAuth
router.get('/auth/google/start', async (req, res) => {
  await oauthController.initiateOAuth('google', req, res, {
    workspaceId: req.user?.workspaceId
  });
});

// Handle Google OAuth callback
router.get('/auth/google/callback', async (req, res) => {
  await oauthController.handleCallback(
    'google',
    req,
    res,
    // Success handler
    async (profile, tokens) => {
      // Link account to user
      await oauthController.linkAccount(
        req.user!.id,
        'google',
        profile,
        tokens
      );
      
      // Redirect to success page
      res.redirect('/dashboard?oauth=success');
    },
    // Error handler
    async (error) => {
      console.error('OAuth failed:', error);
      res.redirect('/auth?error=oauth_failed');
    }
  );
});
```

#### Instagram OAuth with Custom Flow

```typescript
// Initiate Instagram OAuth with workspace context
router.get('/social/instagram/authorize', async (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  
  await oauthController.initiateOAuth('instagram', req, res, {
    workspaceId,
    flow: 'business' // Custom flow identifier
  });
});

// Handle Instagram callback
router.get('/social/instagram/callback', async (req, res) => {
  await oauthController.handleCallback(
    'instagram',
    req,
    res,
    async (profile, tokens) => {
      // Store Instagram business account
      const workspaceId = (req.session as any).oauthState?.workspaceId;
      
      await oauthController.linkAccount(
        workspaceId,
        'instagram',
        profile,
        tokens
      );
      
      res.redirect(`/settings?tab=social&connected=instagram`);
    }
  );
});
```


#### Token Refresh

```typescript
// Refresh an expired access token
try {
  const newTokens = await oauthController.refreshAccessToken(
    'google',
    oldRefreshToken
  );
  
  // Update stored tokens
  await storage.updateSocialAccount(accountId, {
    accessToken: newTokens.accessToken,
    refreshToken: newTokens.refreshToken,
    expiresAt: new Date(Date.now() + newTokens.expiresIn! * 1000)
  });
} catch (error) {
  console.error('Token refresh failed:', error);
  // Handle re-authentication
}
```

#### Account Unlinking

```typescript
// Unlink an OAuth account
router.delete('/social/:provider/:accountId', async (req, res) => {
  const { provider, accountId } = req.params;
  const userId = req.user!.id;
  
  try {
    await oauthController.unlinkAccount(
      userId,
      provider as any,
      accountId
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unlink account' });
  }
});
```

#### Get Authorization URL (for Mobile Apps)

```typescript
// Get OAuth URL without redirecting (useful for mobile apps)
router.get('/auth/:provider/url', (req, res) => {
  const { provider } = req.params;
  const state = generateCustomState(); // Your custom state generation
  
  try {
    const authUrl = oauthController.getAuthorizationUrl(
      provider as any,
      { state, workspaceId: req.user?.workspaceId }
    );
    
    res.json({ authUrl });
  } catch (error) {
    res.status(400).json({ error: 'Provider not configured' });
  }
});
```

### API Reference

#### Methods

##### `initiateOAuth(provider, req, res, options?)`

Initiates the OAuth flow for a specific provider.

- **Parameters:**
  - `provider`: OAuth provider name (`'google'`, `'github'`, `'instagram'`, `'facebook'`)
  - `req`: Express Request object
  - `res`: Express Response object
  - `options`: Optional configuration
    - `workspaceId`: Workspace/user ID for linking
    - `flow`: Custom flow identifier

- **Returns:** `Promise<void>` (redirects to provider's authorization page)

##### `handleCallback(provider, req, res, onSuccess?, onError?)`

Handles the OAuth callback from the provider.

- **Parameters:**
  - `provider`: OAuth provider name
  - `req`: Express Request object with query parameters
  - `res`: Express Response object
  - `onSuccess`: Callback function when OAuth succeeds
  - `onError`: Callback function when OAuth fails

- **Returns:** `Promise<void>`


##### `linkAccount(userId, provider, profile, tokens)`

Links an OAuth account to a user.

- **Parameters:**
  - `userId`: User/workspace ID
  - `provider`: OAuth provider name
  - `profile`: OAuth user profile
  - `tokens`: OAuth token response

- **Returns:** `Promise<void>`

##### `unlinkAccount(userId, provider, accountId)`

Unlinks an OAuth account from a user.

- **Parameters:**
  - `userId`: User/workspace ID
  - `provider`: OAuth provider name
  - `accountId`: Provider-specific account ID

- **Returns:** `Promise<void>`

##### `refreshAccessToken(provider, refreshToken)`

Refreshes an expired access token.

- **Parameters:**
  - `provider`: OAuth provider name
  - `refreshToken`: Current refresh token

- **Returns:** `Promise<OAuthTokenResponse>`

##### `getAuthorizationUrl(provider, options?)`

Generates an authorization URL without storing state.

- **Parameters:**
  - `provider`: OAuth provider name
  - `options`: Optional configuration
    - `workspaceId`: Workspace ID
    - `flow`: Custom flow identifier
    - `state`: Custom state parameter

- **Returns:** `string` (authorization URL)

##### `isProviderConfigured(provider)`

Checks if a provider is configured.

- **Parameters:**
  - `provider`: OAuth provider name

- **Returns:** `boolean`

##### `getConfiguredProviders()`

Gets list of configured providers.

- **Returns:** `OAuthProvider[]`

### Security Considerations

1. **State Parameter**: Always used for CSRF protection
2. **PKCE**: Implemented for Google and GitHub to prevent authorization code interception
3. **Session Storage**: OAuth state is stored server-side with 10-minute TTL
4. **HTTPS Only**: All OAuth flows must use HTTPS in production
5. **Secure Cookies**: Use secure, HTTP-only cookies for session management

### Provider-Specific Notes

#### Google OAuth
- Supports PKCE
- Requires `openid`, `email`, `profile` scopes minimum
- Uses `access_type=offline` to get refresh tokens
- Refresh tokens are long-lived

#### GitHub OAuth
- Supports PKCE
- Requires `user:email`, `read:user` scopes minimum
- Refresh tokens available with proper configuration

#### Instagram OAuth
- Uses Instagram Basic Display API or Instagram Graph API
- Requires Business/Creator account for advanced features
- Long-lived tokens (60 days) obtained through token exchange
- Token refresh uses different endpoint than standard OAuth

#### Facebook OAuth
- Used for Instagram Business account access
- Requires Facebook Page linked to Instagram Business
- Page tokens needed for Instagram messaging features

### Migration Guide

#### From Existing Google OAuth Routes

Replace existing route handlers with OAuthController:

```typescript
// Before
router.get('/google-auth/start', async (req, res) => {
  // Custom OAuth implementation
});

// After
router.get('/google-auth/start', async (req, res) => {
  await oauthController.initiateOAuth('google', req, res);
});
```

#### From Existing Instagram OAuth Service

Replace InstagramOAuthService calls with OAuthController:

```typescript
// Before
const instagramOAuth = new InstagramOAuthService(storage);
const authUrl = instagramOAuth.getAuthUrl(workspaceId);

// After
await oauthController.initiateOAuth('instagram', req, res, { workspaceId });
```

### Testing

```typescript
import { OAuthController } from '../shared/auth/controllers';
import { MockStorage } from '../test-utils/mock-storage';

describe('OAuthController', () => {
  let controller: OAuthController;
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    controller = new OAuthController(mockStorage);
  });

  it('should initiate OAuth flow', async () => {
    const mockReq = createMockRequest();
    const mockRes = createMockResponse();
    
    await controller.initiateOAuth('google', mockReq, mockRes);
    
    expect(mockRes.redirect).toHaveBeenCalledWith(
      expect.stringContaining('accounts.google.com')
    );
  });
});
```

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 5.2**: Component Architecture Optimization - Extracts OAuth logic into reusable controller
- **Requirement 6.3**: Code Duplication Elimination - Consolidates OAuth implementations
- **Requirement 8.2**: Authentication Logic Consolidation - Creates shared auth module
- **Requirement 8.3**: Shared auth package with OAuthController
- **Requirement 8.4**: Main_App and Admin_Panel use shared authentication
- **Requirement 8.6**: Preserves security measures (JWT, rate limiting, session management)

## Support

For issues or questions, please refer to the main authentication documentation or create an issue in the project repository.
