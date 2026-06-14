/**
 * Storage Routes
 * 
 * Defines HTTP routes for file upload, image processing, and video upload endpoints.
 * Uses controllers from the storage service layer.
 * Includes authentication middleware and proper error handling.
 * 
 * Requirements: 4.6
 */

import { Router } from 'express';
import multer from 'multer';
import { fileUploadController } from '../controllers/file-upload.controller';
import { imageProcessingController } from '../controllers/image-processing.controller';
import { requireAuth } from '../../../middleware/require-auth';

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Basic file type validation
    const allowedMimeTypes = [
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      // Videos
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Other
      'text/plain',
      'application/json',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported`));
    }
  },
});

const router = Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// ============================================================================
// File Upload Routes
// ============================================================================

/**
 * POST /api/storage/upload
 * Upload a single file
 */
router.post(
  '/upload',
  upload.single('file'),
  fileUploadController.uploadFile.bind(fileUploadController)
);

/**
 * POST /api/storage/upload/multiple
 * Upload multiple files
 */
router.post(
  '/upload/multiple',
  upload.array('files', 10), // Max 10 files
  fileUploadController.uploadMultipleFiles.bind(fileUploadController)
);

/**
 * GET /api/storage/files/:fileId
 * Get file metadata
 */
router.get(
  '/files/:fileId',
  fileUploadController.getFile.bind(fileUploadController)
);

/**
 * DELETE /api/storage/files/:fileId
 * Delete a file
 */
router.delete(
  '/files/:fileId',
  fileUploadController.deleteFile.bind(fileUploadController)
);

/**
 * GET /api/storage/files/:fileId/signed-url
 * Get signed URL for secure file access
 */
router.get(
  '/files/:fileId/signed-url',
  fileUploadController.getSignedUrl.bind(fileUploadController)
);

/**
 * GET /api/storage/files
 * Get user's files (filtered by authentication)
 */
router.get(
  '/files',
  fileUploadController.getUserFiles.bind(fileUploadController)
);

/**
 * GET /api/storage/workspace/files
 * Get workspace files
 */
router.get(
  '/workspace/files',
  fileUploadController.getWorkspaceFiles.bind(fileUploadController)
);

/**
 * GET /api/storage/stats
 * Get storage statistics
 */
router.get(
  '/stats',
  fileUploadController.getStorageStats.bind(fileUploadController)
);

// ============================================================================
// Image Processing Routes
// ============================================================================

/**
 * POST /api/storage/images/process
 * Upload and process image with transformations
 */
router.post(
  '/images/process',
  upload.single('image'),
  imageProcessingController.processImage.bind(imageProcessingController)
);

/**
 * POST /api/storage/images/optimize
 * Upload and optimize image for web
 */
router.post(
  '/images/optimize',
  upload.single('image'),
  imageProcessingController.optimizeImage.bind(imageProcessingController)
);

/**
 * POST /api/storage/images/thumbnails
 * Generate thumbnails for uploaded image
 */
router.post(
  '/images/thumbnails',
  upload.single('image'),
  imageProcessingController.generateThumbnails.bind(imageProcessingController)
);

/**
 * POST /api/storage/images/:fileId/resize
 * Resize existing image
 */
router.post(
  '/images/:fileId/resize',
  imageProcessingController.resizeImage.bind(imageProcessingController)
);

// ============================================================================
// Video Upload Routes (compatibility with existing video routes)
// ============================================================================

/**
 * POST /api/storage/videos/upload
 * Upload video file
 * Note: Detailed video processing is handled by video-routes.ts
 */
router.post(
  '/videos/upload',
  upload.single('video'),
  fileUploadController.uploadFile.bind(fileUploadController)
);

// ============================================================================
// Error Handling Middleware
// ============================================================================

// Multer error handler
router.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size must not exceed 100MB',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        message: 'Maximum 10 files allowed per upload',
      });
    }
    return res.status(400).json({
      error: 'Upload error',
      message: err.message,
    });
  }

  // File type error
  if (err.message && err.message.includes('File type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      message: err.message,
    });
  }

  // Generic error handler
  console.error('[StorageRoutes] Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
  });
});

export default router;
