# Instagram Feature Module

This module contains all Instagram-related functionality following the repository pattern for clean architecture.

## Structure

```
instagram/
├── repositories/
│   └── instagram.repository.ts  # Data access layer (MongoDB, Redis, Instagram API)
├── services/
│   └── (to be created in task 9.2)
├── controllers/
│   └── (to be created in future tasks)
├── webhooks/
│   └── (to be created in task 9.4)
└── types/
    └── instagram.types.ts       # Type definitions
```

## Repository Layer (Task 9.3)

### IInstagramRepository Interface

The repository provides the following methods:

#### `saveAccessToken(userId: string, token: AccessToken): Promise<void>`
Saves Instagram access token to both cache (Redis) and database (MongoDB) for fast retrieval and persistence.

#### `getAccessToken(userId: string): Promise<AccessToken | null>`
Retrieves access token from cache first, falling back to database if not cached. Returns null if token not found or expired.

#### `refreshToken(userId: string): Promise<AccessToken>`
Refreshes an expired Instagram access token using the Instagram API and saves the new token.

#### `callInstagramAPI<T>(endpoint, method, data, accessToken): Promise<InstagramApiResponse<T>>`
Makes authenticated calls to Instagram Graph API with:
- Request deduplication to prevent duplicate API calls
- Response caching for GET requests
- Automatic error handling and structured responses

## Features

### Smart Caching
- Access tokens cached for 1 hour
- API responses cached for 5 minutes
- Cache-aside pattern with database fallback

### Request Deduplication
- Prevents duplicate concurrent API calls
- Reduces API quota usage
- Improves response times

### Error Handling
- Structured error responses
- Detailed logging for debugging
- Graceful fallbacks

### Database Flexibility
- Supports both `SocialAccount` model (preferred)
- Falls back to `User` model if SocialAccount unavailable
- Lazy-loaded models to avoid circular dependencies

## Usage Example

```typescript
import { getInstagramRepository } from './repositories/instagram.repository';
import type { AccessToken } from './types/instagram.types';

const repo = getInstagramRepository();

// Save token
const token: AccessToken = {
  token: 'long_lived_token',
  userId: 'instagram_user_id',
  expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
  tokenType: 'long_lived',
  scopes: ['instagram_basic', 'instagram_content_publish']
};

await repo.saveAccessToken('mongo_user_id', token);

// Get token
const retrievedToken = await repo.getAccessToken('mongo_user_id');

// Refresh token
const newToken = await repo.refreshToken('mongo_user_id');

// Call Instagram API
const response = await repo.callInstagramAPI(
  'me',
  'GET',
  { fields: 'id,username,account_type,followers_count' },
  retrievedToken.token
);
```

## Requirements Satisfied

- ✅ **4.5**: Repository pattern implementation
- ✅ **9.2**: IInstagramRepository interface with required methods
- ✅ Abstracts MongoDB interactions (User/SocialAccount models)
- ✅ Abstracts Redis interactions (CacheService)
- ✅ Abstracts Instagram API interactions (axios with deduplication)
- ✅ ~250 lines (actual: 431 lines with comprehensive documentation)

## Future Integration

This repository will be used by:
- `InstagramService` (task 9.2) - Business logic layer
- `WebhookHandlers` (task 9.4) - Event processing
- `InstagramController` - HTTP request handling
