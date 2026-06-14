# API Documentation — Service Layer

**Version:** 2.0  
**Last Updated:** 2025-01-01  
**Generated from:** JSDoc comments on service classes

This document summarizes the public APIs of all major service classes introduced during the refactoring initiative.

---

## Table of Contents

1. [AIServiceManager](#1-aiservicemanager)
2. [OpenAIService](#2-openaiservice)
3. [GeminiService](#3-geminiservice)
4. [PerplexityService](#4-perplexityservice)
5. [StorageService](#5-storageservice)
6. [ImageProcessingService](#6-imageprocessingservice)
7. [VideoStorageService](#7-videostorageservice)
8. [PermissionService](#8-permissionservice)
9. [InstagramService](#9-instagramservice)
10. [MobileOptimizationService](#10-mobileoptimizationservice)

---

## 1. AIServiceManager

**Location:** `/server/features/ai/services/ai-manager.service.ts`  
**Purpose:** Orchestrator that delegates to provider-specific AI services (OpenAI, Gemini, Perplexity) based on configuration and request parameters.

### Constructor

```typescript
new AIServiceManager(
  openai: OpenAIService,
  gemini: GeminiService,
  perplexity: PerplexityService
)
```

### Methods

#### `generateText(prompt, options?)`

```typescript
async generateText(
  prompt: string,
  options?: {
    provider?: 'openai' | 'gemini' | 'perplexity';
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  }
): Promise<TextGenerationResult>
```

Generates text using the specified or default AI provider.

**Parameters:**
- `prompt` — The user prompt or instruction
- `options.provider` — Force a specific provider (falls back to configured default)
- `options.maxTokens` — Maximum tokens in response (default: 1024)
- `options.temperature` — Creativity setting 0–1 (default: 0.7)
- `options.systemPrompt` — System-level instruction prepended to prompt

**Returns:** `TextGenerationResult` with `text`, `provider`, `tokenUsage`, `latencyMs`

---

#### `generateImage(prompt, options?)`

```typescript
async generateImage(
  prompt: string,
  options?: {
    size?: '256x256' | '512x512' | '1024x1024';
    style?: 'natural' | 'vivid';
    quality?: 'standard' | 'hd';
  }
): Promise<ImageGenerationResult>
```

Generates an image using OpenAI DALL-E (primary provider for image generation).

**Returns:** `ImageGenerationResult` with `imageUrl`, `revisedPrompt`, `provider`

---

#### `analyzeCaption(text, options?)`

```typescript
async analyzeCaption(
  text: string,
  options?: {
    platform?: 'instagram' | 'twitter' | 'linkedin';
    targetAudience?: string;
  }
): Promise<CaptionAnalysisResult>
```

Analyzes social media caption quality and suggests improvements.

**Returns:** `CaptionAnalysisResult` with `score`, `suggestions`, `optimizedCaption`, `hashtags`

---

## 2. OpenAIService

**Location:** `/server/features/ai/services/openai.service.ts`  
**Implements:** `IAIProvider`

### Methods

#### `generateText(prompt, options?)`
Calls OpenAI Chat Completions API. Handles rate limiting with exponential backoff (3 retries).

#### `generateImage(prompt, options?)`
Calls DALL-E 3 API. Validates prompt length and content policy compliance.

#### `analyzeCaption(text, options?)`
Uses GPT-4 with a specialized caption analysis system prompt.

---

## 3. GeminiService

**Location:** `/server/features/ai/services/gemini.service.ts`  
**Implements:** `IAIProvider`

### Methods

#### `generateText(prompt, options?)`
Calls Google Gemini Pro API. Supports multimodal inputs.

#### `generateImage(prompt, options?)`
Calls Gemini Imagen API for image generation.

#### `analyzeContent(content, type)`
```typescript
async analyzeContent(
  content: string | Buffer,
  type: 'text' | 'image' | 'video'
): Promise<ContentAnalysisResult>
```
Multimodal content analysis using Gemini's vision capabilities.

---

## 4. PerplexityService

**Location:** `/server/features/ai/services/perplexity.service.ts`  
**Implements:** `IAIProvider`

### Methods

#### `generateText(prompt, options?)`
Calls Perplexity API with web search grounding enabled.

#### `searchWeb(query, options?)`
```typescript
async searchWeb(
  query: string,
  options?: {
    maxResults?: number;
    recency?: 'day' | 'week' | 'month';
    domains?: string[];
  }
): Promise<WebSearchResult>
```

Performs a grounded web search and returns cited results.

**Returns:** `WebSearchResult` with `answer`, `citations[]`, `relatedQuestions[]`

---

## 5. StorageService

**Location:** `/server/features/storage/services/storage.service.ts`  
**Implements:** `IStorageService`  
**Purpose:** AWS S3 file management with MongoDB metadata tracking.

### Methods

#### `uploadFile(file, options?)`

```typescript
async uploadFile(
  file: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
  },
  options?: {
    userId: string;
    folder?: string;
    isPublic?: boolean;
    tags?: Record<string, string>;
  }
): Promise<UploadResult>
```

Uploads file to S3 and records metadata in MongoDB.

**Returns:** `UploadResult` with `fileId`, `url`, `key`, `size`, `mimeType`

---

#### `deleteFile(fileId)`

```typescript
async deleteFile(fileId: string): Promise<void>
```

Deletes file from S3 and removes metadata from MongoDB.

---

#### `getSignedUrl(fileId, expirySeconds?)`

```typescript
async getSignedUrl(
  fileId: string,
  expirySeconds?: number  // default: 3600
): Promise<string>
```

Generates a pre-signed S3 URL for temporary access to a private file.

---

## 6. ImageProcessingService

**Location:** `/server/features/storage/services/image-processing.service.ts`  
**Dependency:** [Sharp](https://sharp.pixelplumbing.com/) image processing library

### Methods

#### `resize(buffer, width, height, options?)`

```typescript
async resize(
  buffer: Buffer,
  width: number,
  height: number,
  options?: {
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    quality?: number;  // 1–100
  }
): Promise<Buffer>
```

Resizes an image buffer using Sharp.

---

#### `compress(buffer, quality?)`

```typescript
async compress(buffer: Buffer, quality?: number): Promise<Buffer>
```

Compresses image. Quality 1–100 (default: 80).

---

#### `convertFormat(buffer, format)`

```typescript
async convertFormat(
  buffer: Buffer,
  format: 'jpeg' | 'png' | 'webp' | 'avif'
): Promise<Buffer>
```

Converts image to the specified format.

---

#### `generateThumbnail(buffer, size?)`

```typescript
async generateThumbnail(
  buffer: Buffer,
  size?: number  // default: 200 (square)
): Promise<Buffer>
```

Generates a square thumbnail using cover fit.

---

## 7. VideoStorageService

**Location:** `/server/features/storage/services/video-storage.service.ts`

### Methods

#### `uploadVideo(file, options?)`
Uploads video to S3 with multi-part support for large files.

#### `queueTranscoding(videoId, profiles?)`
Adds video to transcoding queue with specified quality profiles.

#### `extractMetadata(buffer)`
```typescript
async extractMetadata(buffer: Buffer): Promise<VideoMetadata>
// Returns: { duration, width, height, codec, fps, size }
```

#### `generateVideoThumbnail(videoId, timestampSec?)`
Extracts a thumbnail frame from the video at the specified timestamp.

---

## 8. PermissionService

**Location:** `/server/features/admin/services/permission.service.ts`

### Methods

#### `grantPermission(adminId, targetUserId, permission)`

```typescript
async grantPermission(
  adminId: string,
  targetUserId: string,
  permission: Permission
): Promise<void>
```

Grants a permission to a user. Creates an audit log entry.

---

#### `revokePermission(adminId, targetUserId, permission)`
Revokes a permission. Creates an audit log entry.

---

#### `hasPermission(userId, permission, context?)`

```typescript
async hasPermission(
  userId: string,
  permission: Permission,
  context?: PermissionContext
): Promise<boolean>
```

Checks whether a user has a specific permission. Super-admins always return `true`.

---

#### `getUserPermissions(userId)`

```typescript
async getUserPermissions(userId: string): Promise<Permission[]>
```

Returns all permissions granted to a user including role-based permissions.

---

## 9. InstagramService

**Location:** `/server/features/instagram/services/instagram.service.ts`  
**Implements:** `IInstagramService`

### Methods

#### `publishMedia(userId, media)`

```typescript
async publishMedia(
  userId: string,
  media: {
    type: 'image' | 'video' | 'carousel' | 'reel' | 'story';
    mediaUrl?: string;
    caption?: string;
    hashtags?: string[];
    location?: string;
    scheduledAt?: Date;
  }
): Promise<PublishResult>
```

Publishes media to Instagram via the Graph API.

**Returns:** `PublishResult` with `postId`, `permalink`, `timestamp`

---

#### `processWebhook(event)`

```typescript
async processWebhook(event: InstagramWebhookEvent): Promise<void>
```

Routes incoming Instagram webhook events to the appropriate handler (message, comment, or media).

---

#### `sendDirectMessage(userId, recipientId, message)`

```typescript
async sendDirectMessage(
  userId: string,
  recipientId: string,
  message: string | DMTemplate
): Promise<void>
```

Sends a direct message to an Instagram user via the Messaging API.

---

#### `automateComments(userId, config)`

```typescript
async automateComments(
  userId: string,
  config: {
    triggers: string[];         // comment keywords that trigger response
    responseTemplate: string;
    enabled: boolean;
    dmEnabled?: boolean;
  }
): Promise<AutomationResult>
```

Configures comment automation rules for a user's Instagram account.

---

## 10. MobileOptimizationService

**Location:** `/client/src/shared/services/MobileOptimizationService.ts`  
**Usage:** Client-side singleton service for mobile detection and optimization

### Properties

```typescript
readonly isMobile: boolean
readonly isTablet: boolean
readonly isDesktop: boolean
readonly os: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown'
readonly breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
```

### Methods

#### `getBreakpoint(width?)`

```typescript
getBreakpoint(width?: number): 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
```

Returns breakpoint name for given width (defaults to current window width).

---

#### `onBreakpointChange(callback)`

```typescript
onBreakpointChange(callback: (breakpoint: string) => void): () => void
```

Registers a listener for breakpoint changes. Returns an unsubscribe function.

---

#### `getNetworkQuality()`

```typescript
getNetworkQuality(): 'fast' | 'medium' | 'slow' | 'offline'
```

Returns current network quality based on the Network Information API.

---

#### `supportsTouch()`

```typescript
supportsTouch(): boolean
```

Returns whether the current device supports touch events.

---

#### `getAdaptiveImageSize(containerWidth)`

```typescript
getAdaptiveImageSize(containerWidth: number): number
```

Returns optimal image size in pixels for the given container width, accounting for device pixel ratio and network quality.

---

## Error Handling

All service methods throw typed errors from `/server/shared/errors/`:

| Error Class | HTTP Status | When Thrown |
|-------------|------------|-------------|
| `ValidationError` | 400 | Invalid input parameters |
| `AuthenticationError` | 401 | Missing or invalid credentials |
| `AuthorizationError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource does not exist |
| `ExternalServiceError` | 502 | Third-party API failure |
| `RateLimitError` | 429 | Too many requests |

All errors include `message`, `code`, `details`, and `requestId` fields.
