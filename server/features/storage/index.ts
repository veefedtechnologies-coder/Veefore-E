/**
 * Storage Feature Module - Public API
 * 
 * Exports all storage-related functionality for external use
 */

// Export service class and factory functions
export {
  StorageService,
  getStorageService,
  createStorageService,
  storageService,
} from './services/storage.service';

// Export interface for dependency injection
export type { IStorageService } from './services/storage.service';

// Export all types
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
} from './types/storage.types';

// Export error class
export { StorageError } from './types/storage.types';
