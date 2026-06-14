/**
 * Storage Service Type Definitions
 * 
 * Centralized type definitions for storage operations
 */

// Re-export types from service for external use
export type {
  StorageConfig,
  UploadOptions,
  UploadFileOptions,
  UploadFileResult,
  DeleteOptions,
  DeleteResult,
  SignedUrlOptions,
  SignedUrlResult,
  FileValidation,
  FileMetadata,
  IStorageService,
} from '../services/storage.service';

export { StorageError } from '../services/storage.service';
