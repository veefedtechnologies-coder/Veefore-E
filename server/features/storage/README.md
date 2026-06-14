# Storage Feature Module

This module implements the storage service layer architecture for file uploads, image processing, and video storage management.

## Architecture Overview

The storage module follows a clean layered architecture:

```
storage/
├── controllers/          # HTTP request/response handling
│   ├── file-upload.controller.ts
│   └── image-processing.controller.ts
├── services/            # Business logic
│   ├── storage.service.ts
│   ├── image-processing.service.ts
│   └── video-storage.service.ts
├── repositories/        # Data access layer
│   └── storage.repository.ts
├── routes/              # Route definitions
│   └── storage.routes.ts
└── README.md
```

## Components

### Services

#### StorageService
- **Purpose**: Handles file uploads to AWS S3 or local filesystem
- **Key Methods**:
  - `uploadFile(options)` - Upload file to storage
  - `deleteFile(key)` - Delete file from storage
  - `getSignedUrl(key, expiresIn)` - Generate secure signed URL
  - `getPublicUrl(key)` - Get public URL for file

#### ImageProcessingService
- **Purpose**: Image transformations using Sharp library
- **Key Methods**:
  - `processImage(buffer, name, options)` - Resize, compress, format conversion
  - `generateThumbnails(buffer, name, options)` - Generate multiple thumbnail sizes
  - `optimizeImage(buffer, name)` - Automatic web optimization

#### VideoStorageService
- **Purpose**: Video upload and metadata extraction
- **Key Methods**:
  - `uploadVideo(buffer, name)` - Upload video and extract metadata
  - `extractMetadata(buffer)` - Extract video metadata using ffmpeg
  - `generateVideoThumbnail(buffer, name)` - Generate thumbnail from video
  - `queueTranscode(options)` - Queue video for transcoding

### Repository

#### StorageRepository
- **Purpose**: Database operations for file metadata tracking
- **Key Methods**:
  - `createFile(data)` - Save file metadata
  - `getFile(id)` - Get file by ID
  - `getFileByKey(key)` - Get file by storage key
  - `getFilesByUser(userId)` - Get user's files
  - `getFilesByWorkspace(workspaceId)` - Get workspace files
  - `deleteFile(id)` - Delete file record
  - `markFileDeleted(id)` - Soft delete
  - `getFileStats(userId, workspaceId)` - Get storage statistics

### Controllers

#### FileUploadController
- **Endpoints**:
  - `POST /api/storage/upload` - Upload single file
  - `POST /api/storage/upload/multiple` - Upload multiple files
  - `GET /api/storage/files/:fileId` - Get file metadata
  - `DELETE /api/storage/files/:fileId` - Delete file
  - `GET /api/storage/files/:fileId/signed-url` - Get signed URL
  - `GET /api/storage/files` - Get user's files
  - `GET /api/storage/workspace/files` - Get workspace files
  - `GET /api/storage/stats` - Get storage statistics

#### ImageProcessingController
- **Endpoints**:
  - `POST /api/storage/images/process` - Process image with transformations
  - `POST /api/storage/images/optimize` - Optimize image for web
  - `POST /api/storage/images/thumbnails` - Generate thumbnails
  - `POST /api/storage/images/:fileId/resize` - Resize existing image

## Configuration

### Environment Variables

```bash
# Storage Configuration
USE_LOCAL_STORAGE=true              # Use local filesystem (true) or AWS S3 (false)
AWS_REGION=us-east-1                # AWS region for S3
AWS_S3_BUCKET=veefore-uploads       # S3 bucket name
AWS_ACCESS_KEY_ID=your-key-id       # AWS access key
AWS_SECRET_ACCESS_KEY=your-secret   # AWS secret key

# Image Processing
ENABLE_WEBP=true                    # Enable WebP format for optimization
```

### Local vs S3 Storage

The module automatically detects whether to use local filesystem or AWS S3:
- **Local Storage**: Used when `USE_LOCAL_STORAGE=true` or AWS credentials are not set
- **AWS S3**: Used when AWS credentials are configured

Files are stored in:
- **Local**: `./uploads/{folder}/{filename}`
- **S3**: `s3://{bucket}/{folder}/{filename}`

## Usage Examples

### Upload File

```typescript
// POST /api/storage/upload
// Content-Type: multipart/form-data
// Body: file (binary), folder (optional)

const formData = new FormData();
formData.append('file', fileBlob);
formData.append('folder', 'documents');

const response = await fetch('/api/storage/upload', {
  method: 'POST',
  body: formData,
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const result = await response.json();
// {
//   success: true,
//   file: {
//     id: '...',
//     url: 'https://...',
//     key: 'documents/uuid.pdf',
//     originalName: 'document.pdf',
//     mimetype: 'application/pdf',
//     size: 1024000
//   }
// }
```

### Process Image

```typescript
// POST /api/storage/images/process
// Resize, compress, and convert format

const formData = new FormData();
formData.append('image', imageBlob);
formData.append('width', '800');
formData.append('height', '600');
formData.append('format', 'webp');
formData.append('quality', '80');

const response = await fetch('/api/storage/images/process', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
// {
//   success: true,
//   image: {
//     id: '...',
//     url: 'https://...',
//     key: 'images/uuid.webp',
//     size: 50000
//   }
// }
```

### Generate Thumbnails

```typescript
// POST /api/storage/images/thumbnails

const formData = new FormData();
formData.append('image', imageBlob);
formData.append('sizes', JSON.stringify([
  { width: 150, height: 150, name: 'small' },
  { width: 300, height: 300, name: 'medium' },
  { width: 600, height: 600, name: 'large' }
]));

const response = await fetch('/api/storage/images/thumbnails', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
// {
//   success: true,
//   original: { id: '...', url: 'https://...' },
//   thumbnails: [
//     { name: 'small', url: 'https://...', width: 150, height: 150 },
//     { name: 'medium', url: 'https://...', width: 300, height: 300 },
//     { name: 'large', url: 'https://...', width: 600, height: 600 }
//   ]
// }
```

### Get Signed URL

```typescript
// GET /api/storage/files/:fileId/signed-url?expiresIn=3600

const response = await fetch(`/api/storage/files/${fileId}/signed-url?expiresIn=3600`);
const result = await response.json();
// {
//   success: true,
//   url: 'https://s3.amazonaws.com/...?signature=...',
//   expiresIn: 3600
// }
```

### Get Storage Statistics

```typescript
// GET /api/storage/stats

const response = await fetch('/api/storage/stats');
const result = await response.json();
// {
//   success: true,
//   stats: {
//     totalFiles: 150,
//     totalSize: 52428800,  // bytes
//     filesByType: {
//       image: 80,
//       video: 30,
//       application: 40
//     }
//   }
// }
```

## Integration with Existing Code

### Migrating from Old Upload Endpoint

**Before (legacy endpoint):**
```typescript
// POST /api/upload
const formData = new FormData();
formData.append('file', file);
fetch('/api/upload', { method: 'POST', body: formData });
```

**After (new service layer):**
```typescript
// POST /api/storage/upload
const formData = new FormData();
formData.append('file', file);
formData.append('folder', 'general');
fetch('/api/storage/upload', { method: 'POST', body: formData });
```

### Benefits of New Architecture

1. **Separation of Concerns**: Controllers handle HTTP, services handle business logic
2. **Testability**: Easy to unit test services independently
3. **Flexibility**: Easy to switch between local storage and S3
4. **Scalability**: Repository pattern allows easy database swapping
5. **Maintainability**: Clear module structure with single responsibility
6. **Metadata Tracking**: All files tracked in database for audit and management

## Dependencies

- `@aws-sdk/client-s3` - AWS S3 client
- `@aws-sdk/s3-request-presigner` - Generate signed URLs
- `sharp` - High-performance image processing
- `fluent-ffmpeg` - Video processing and metadata extraction
- `multer` - Multipart form data handling
- `mongoose` - MongoDB ODM for metadata storage

## Testing

### Unit Tests
Test individual services with mocked dependencies:

```typescript
import { StorageService } from './services/storage.service';

describe('StorageService', () => {
  it('should upload file to local storage', async () => {
    // Test implementation
  });
});
```

### Integration Tests
Test complete workflows through controllers:

```typescript
import request from 'supertest';
import app from '../app';

describe('File Upload', () => {
  it('should upload and retrieve file', async () => {
    const response = await request(app)
      .post('/api/storage/upload')
      .attach('file', Buffer.from('test'), 'test.txt');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

## Future Enhancements

1. **Video Transcoding**: Implement actual transcoding with job queue (Bull/BullMQ)
2. **CDN Integration**: Add CloudFront/CloudFlare CDN support
3. **Image Variants**: Automatic responsive image generation
4. **Virus Scanning**: Integrate ClamAV for file scanning
5. **Compression**: Add ZIP/archive support
6. **Direct S3 Uploads**: Pre-signed POST for client-side uploads
7. **Quota Management**: Enforce storage limits per user/workspace
8. **File Versioning**: Track file versions and allow rollback

## Maintenance

### Cleaning Up Orphaned Files
Files marked as 'deleted' in database but still in storage:

```typescript
// Run periodic cleanup job
import { storageRepository } from './repositories/storage.repository';
import { storageService } from './services/storage.service';

async function cleanupOrphanedFiles() {
  const deletedFiles = await storageRepository.getFileStats();
  // Implement cleanup logic
}
```

### Monitoring Storage Usage
Track storage metrics for capacity planning:

```typescript
const stats = await storageRepository.getFileStats();
console.log(`Total storage used: ${stats.totalSize / 1024 / 1024} MB`);
```

## Support

For questions or issues, contact the development team or refer to:
- [Architecture Design Document](../../../.kiro/specs/codebase-refactoring-optimization/design.md)
- [Requirements Document](../../../.kiro/specs/codebase-refactoring-optimization/requirements.md)
