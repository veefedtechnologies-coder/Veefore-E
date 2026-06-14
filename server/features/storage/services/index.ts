/**
 * Storage Services Module
 * 
 * Exports all storage-related services including image processing,
 * file storage, and video storage services.
 */

export {
  ImageProcessingService,
  imageProcessingService,
  type ImageFormat,
  type ResizeMode,
  type ResizeConfig,
  type CompressionConfig,
  type ThumbnailConfig,
  type ConversionConfig,
  type ProcessingResult,
  type BatchProcessingOptions
} from './image-processing.service';

export {
  StorageService,
  StorageError,
  storageService,
  getStorageService,
  createStorageService,
  type IStorageService,
  type StorageConfig,
  type UploadOptions,
  type UploadFileOptions,
  type UploadFileResult,
  type DeleteOptions,
  type DeleteResult,
  type SignedUrlOptions,
  type SignedUrlResult,
  type FileValidation,
  type FileMetadata
} from './storage.service';

export {
  VideoStorageService,
  videoStorageService,
  type IVideoStorageService,
  type VideoMetadata,
  type VideoUploadResult,
  type VideoTranscodeOptions
} from './video-storage.service';
