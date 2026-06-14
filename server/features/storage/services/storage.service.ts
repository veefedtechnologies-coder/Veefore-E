/**
 * Storage Service - Enhanced AWS S3 Integration
 * 
 * Provides unified storage operations for file management:
 * - File upload to S3 with validation
 * - File deletion from S3
 * - Signed URL generation for secure file access
 * - File existence checks
 * - Content type detection
 * - Local storage fallback for development
 * 
 * Requirements: 4.1, 4.2, 4.5
 * 
 * This service consolidates storage logic with proper error handling,
 * validation, and security measures. Supports both AWS S3 and local
 * filesystem storage for development environments.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  PutObjectCommandInput,
  DeleteObjectCommandInput,
  HeadObjectCommandInput,
  ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);
const statAsync = promisify(fs.stat);

// ============================================================================
// Configuration Constants
// ============================================================================

const DEFAULT_SIGNED_URL_EXPIRATION = 3600; // 1 hour in seconds
const MAX_SIGNED_URL_EXPIRATION = 86400; // 24 hours in seconds
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska', 'video/x-m4v'];
const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

// ============================================================================
// Type Definitions
// ============================================================================

export interface StorageConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  bucket?: string;
  useLocalStorage?: boolean;
  localStoragePath?: string;
}

export interface UploadOptions {
  contentType?: string;
  acl?: ObjectCannedACL;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  prefix?: string;
  generateUniqueFilename?: boolean;
  cacheControl?: string;
  expires?: Date;
}

export interface UploadFileOptions {
  buffer: Buffer;
  originalName: string;
  mimetype: string;
  folder?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  acl?: ObjectCannedACL;
}

export interface UploadFileResult {
  key: string;
  url: string;
  location: string;
  bucket: string;
  size: number;
  etag?: string;
  versionId?: string;
  contentType?: string;
}

export interface DeleteOptions {
  versionId?: string;
}

export interface DeleteResult {
  success: boolean;
  key: string;
  versionId?: string;
}

export interface SignedUrlOptions {
  expiresIn?: number; // seconds
  responseContentType?: string;
  responseContentDisposition?: string;
  versionId?: string;
}

export interface SignedUrlResult {
  url: string;
  expiresAt: Date;
  key: string;
}

export interface FileValidation {
  isValid: boolean;
  error?: string;
  mimeType?: string;
  size?: number;
}

export interface FileMetadata {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
  etag?: string;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'StorageError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// Interface Definition
// ============================================================================

export interface IStorageService {
  uploadFile(options: UploadFileOptions): Promise<UploadFileResult>;
  deleteFile(key: string, options?: DeleteOptions): Promise<DeleteResult>;
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<SignedUrlResult>;
  getPublicUrl(key: string): Promise<string>;
  fileExists(key: string): Promise<boolean>;
  validateFile(buffer: Buffer, filename: string): Promise<FileValidation>;
  getFileMetadata(key: string): Promise<FileMetadata>;
  copyFile(sourceKey: string, destinationKey: string): Promise<UploadFileResult>;
  listFiles(prefix?: string, maxKeys?: number): Promise<FileMetadata[]>;
}

// ============================================================================
// StorageService Implementation
// ============================================================================

export class StorageService implements IStorageService {
  private s3Client: S3Client;
  private bucket: string;
  private region: string;
  private useLocalStorage: boolean;
  private localStoragePath: string;

  constructor(config?: StorageConfig) {
    // Initialize AWS S3 configuration
    const accessKeyId = config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = config?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    this.region = config?.region || process.env.AWS_REGION || 'us-east-1';
    this.bucket = config?.bucket || process.env.AWS_S3_BUCKET || 'veefore-uploads';
    this.useLocalStorage = config?.useLocalStorage ?? (process.env.USE_LOCAL_STORAGE === 'true' || !accessKeyId);
    this.localStoragePath = config?.localStoragePath || path.join(process.cwd(), 'uploads');

    if (this.useLocalStorage) {
      console.log('[STORAGE SERVICE] Using local file storage at:', this.localStoragePath);
      // Ensure local storage directory exists
      if (!fs.existsSync(this.localStoragePath)) {
        fs.mkdirSync(this.localStoragePath, { recursive: true });
      }
    } else {
      console.log(`[STORAGE SERVICE] Using AWS S3 storage - bucket: ${this.bucket}, region: ${this.region}`);
      
      if (!accessKeyId || !secretAccessKey) {
        console.warn('[STORAGE SERVICE] AWS credentials not configured. Storage operations will fail.');
      }

      this.s3Client = new S3Client({
        region: this.region,
        credentials: accessKeyId && secretAccessKey ? {
          accessKeyId,
          secretAccessKey,
        } : undefined,
      });
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Generate a unique filename with UUID and timestamp
   */
  private generateUniqueFilename(originalFilename: string): string {
    const ext = path.extname(originalFilename);
    const uuid = randomUUID();
    const timestamp = Date.now();
    return `${uuid}-${timestamp}${ext}`;
  }

  /**
   * Sanitize filename to prevent path traversal attacks
   */
  private sanitizeFilename(filename: string): string {
    // Remove any path components
    const basename = path.basename(filename);
    
    // Remove special characters except dots, dashes, and underscores
    const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    return sanitized;
  }

  /**
   * Build S3 key with optional prefix
   */
  private buildS3Key(filename: string, prefix?: string): string {
    const sanitized = this.sanitizeFilename(filename);
    
    if (prefix) {
      // Ensure prefix doesn't start with / and ends with /
      const cleanPrefix = prefix.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
      return cleanPrefix + sanitized;
    }
    
    return sanitized;
  }

  /**
   * Detect MIME type from file buffer
   */
  private detectMimeType(buffer: Buffer, filename: string): string {
    // Check magic numbers for common file types
    if (buffer.length >= 4) {
      const header = buffer.toString('hex', 0, 4);
      
      // JPEG
      if (header.startsWith('ffd8ff')) {
        return 'image/jpeg';
      }
      
      // PNG
      if (header.startsWith('89504e47')) {
        return 'image/png';
      }
      
      // GIF
      if (buffer.toString('ascii', 0, 3) === 'GIF') {
        return 'image/gif';
      }
      
      // WebP
      if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
      }
      
      // MP4
      if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
        return 'video/mp4';
      }
    }

    // Fallback to extension-based detection
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.m4v': 'video/x-m4v',
    };

    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * Ensure bucket is configured
   */
  private ensureBucketConfigured(): void {
    if (!this.useLocalStorage && !this.bucket) {
      throw new StorageError(
        'AWS S3 bucket not configured',
        'BUCKET_NOT_CONFIGURED',
        500
      );
    }
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Validate file before upload
   */
  async validateFile(buffer: Buffer, filename: string): Promise<FileValidation> {
    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        size: buffer.length,
      };
    }

    // Detect and validate MIME type
    const mimeType = this.detectMimeType(buffer, filename);
    
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return {
        isValid: false,
        error: `File type ${mimeType} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        mimeType,
        size: buffer.length,
      };
    }

    return {
      isValid: true,
      mimeType,
      size: buffer.length,
    };
  }

  /**
   * Upload file to storage (S3 or local filesystem)
   */
  async uploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
    const { buffer, originalName, mimetype, folder = 'general', metadata, tags, acl } = options;

    // Validate file
    const validation = await this.validateFile(buffer, originalName);
    if (!validation.isValid) {
      throw new StorageError(
        validation.error || 'File validation failed',
        'VALIDATION_ERROR',
        400
      );
    }

    // Generate unique filename
    const filename = this.generateUniqueFilename(originalName);
    const key = `${folder}/${filename}`;

    if (this.useLocalStorage) {
      return this.uploadToLocalStorage(key, buffer, mimetype, metadata);
    } else {
      return this.uploadToS3(key, buffer, mimetype, { metadata, tags, acl });
    }
  }

  /**
   * Upload to local filesystem
   */
  private async uploadToLocalStorage(
    key: string,
    buffer: Buffer,
    mimetype: string,
    metadata?: Record<string, string>
  ): Promise<UploadFileResult> {
    const filePath = path.join(this.localStoragePath, key);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    await fs.promises.writeFile(filePath, buffer);

    // Store metadata if provided (in a separate .meta file)
    if (metadata) {
      const metaPath = filePath + '.meta';
      await fs.promises.writeFile(metaPath, JSON.stringify(metadata), 'utf-8');
    }

    return {
      key,
      url: `/uploads/${key}`,
      location: `/uploads/${key}`,
      bucket: 'local',
      size: buffer.length,
      contentType: mimetype,
    };
  }

  /**
   * Upload to AWS S3
   */
  private async uploadToS3(
    key: string,
    buffer: Buffer,
    mimetype: string,
    options?: {
      metadata?: Record<string, string>;
      tags?: Record<string, string>;
      acl?: string;
    }
  ): Promise<UploadFileResult> {
    this.ensureBucketConfigured();

    try {
      const uploadParams: PutObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        ACL: (options?.acl || 'private') as ObjectCannedACL,
        Metadata: options?.metadata || {},
      };

      // Add tags if provided
      if (options?.tags) {
        const tagString = Object.entries(options.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join('&');
        uploadParams.Tagging = tagString;
      }

      console.log(`[STORAGE SERVICE] Uploading to S3: ${key}`);

      const command = new PutObjectCommand(uploadParams);
      const response = await this.s3Client.send(command);

      const location = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      return {
        key,
        url: location,
        location,
        bucket: this.bucket,
        size: buffer.length,
        etag: response.ETag,
        versionId: response.VersionId,
        contentType: mimetype,
      };
    } catch (error: any) {
      console.error('[STORAGE SERVICE] S3 upload failed:', error);
      throw new StorageError(
        `File upload failed: ${error.message}`,
        'UPLOAD_ERROR',
        500,
        { originalError: error, key }
      );
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(key: string, options: DeleteOptions = {}): Promise<DeleteResult> {
    if (this.useLocalStorage) {
      await this.deleteFromLocalStorage(key);
      return { success: true, key };
    } else {
      return this.deleteFromS3(key, options);
    }
  }

  /**
   * Delete from local filesystem
   */
  private async deleteFromLocalStorage(key: string): Promise<void> {
    const filePath = path.join(this.localStoragePath, key);
    
    if (fs.existsSync(filePath)) {
      await unlinkAsync(filePath);
      
      // Also delete metadata file if exists
      const metaPath = filePath + '.meta';
      if (fs.existsSync(metaPath)) {
        await unlinkAsync(metaPath);
      }
    }
  }

  /**
   * Delete from AWS S3
   */
  private async deleteFromS3(key: string, options: DeleteOptions = {}): Promise<DeleteResult> {
    this.ensureBucketConfigured();

    try {
      console.log(`[STORAGE SERVICE] Deleting from S3: ${key}`);

      const deleteParams: DeleteObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
      };

      if (options.versionId) {
        deleteParams.VersionId = options.versionId;
      }

      const command = new DeleteObjectCommand(deleteParams);
      const response = await this.s3Client.send(command);

      return {
        success: true,
        key,
        versionId: response.VersionId,
      };
    } catch (error: any) {
      console.error('[STORAGE SERVICE] S3 delete failed:', error);
      throw new StorageError(
        `File deletion failed: ${error.message}`,
        'DELETE_ERROR',
        500,
        { originalError: error, key }
      );
    }
  }

  /**
   * Get signed URL for secure file access (expires after specified time)
   */
  async getSignedUrl(key: string, options: SignedUrlOptions = {}): Promise<SignedUrlResult> {
    if (this.useLocalStorage) {
      // For local storage, return public URL (no signing needed)
      return {
        url: `/uploads/${key}`,
        expiresAt: new Date(Date.now() + DEFAULT_SIGNED_URL_EXPIRATION * 1000),
        key,
      };
    }

    this.ensureBucketConfigured();

    try {
      // Validate and set expiration time
      let expiresIn = options.expiresIn || DEFAULT_SIGNED_URL_EXPIRATION;
      if (expiresIn > MAX_SIGNED_URL_EXPIRATION) {
        expiresIn = MAX_SIGNED_URL_EXPIRATION;
        console.warn(`[STORAGE SERVICE] Expiration time capped at ${MAX_SIGNED_URL_EXPIRATION} seconds`);
      }

      console.log(`[STORAGE SERVICE] Generating signed URL for: ${key} (expires in ${expiresIn}s)`);

      const commandParams: any = {
        Bucket: this.bucket,
        Key: key,
      };

      if (options.responseContentType) {
        commandParams.ResponseContentType = options.responseContentType;
      }

      if (options.responseContentDisposition) {
        commandParams.ResponseContentDisposition = options.responseContentDisposition;
      }

      if (options.versionId) {
        commandParams.VersionId = options.versionId;
      }

      const command = new GetObjectCommand(commandParams);
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        url,
        expiresAt,
        key,
      };
    } catch (error: any) {
      console.error('[STORAGE SERVICE] Signed URL generation failed:', error);
      throw new StorageError(
        `Signed URL generation failed: ${error.message}`,
        'SIGNED_URL_ERROR',
        500,
        { originalError: error, key }
      );
    }
  }

  /**
   * Get public URL for file
   */
  async getPublicUrl(key: string): Promise<string> {
    if (this.useLocalStorage) {
      return `/uploads/${key}`;
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Check if a file exists in storage
   */
  async fileExists(key: string): Promise<boolean> {
    if (this.useLocalStorage) {
      const filePath = path.join(this.localStoragePath, key);
      return fs.existsSync(filePath);
    }

    this.ensureBucketConfigured();

    try {
      const headParams: HeadObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
      };

      const command = new HeadObjectCommand(headParams);
      await this.s3Client.send(command);

      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }

      console.error('[STORAGE SERVICE] File exists check failed:', error);
      throw new StorageError(
        `File existence check failed: ${error.message}`,
        'FILE_EXISTS_ERROR',
        500,
        { originalError: error, key }
      );
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<FileMetadata> {
    if (this.useLocalStorage) {
      const filePath = path.join(this.localStoragePath, key);
      
      if (!fs.existsSync(filePath)) {
        throw new StorageError('File not found', 'FILE_NOT_FOUND', 404, { key });
      }

      const stats = await statAsync(filePath);

      return {
        key,
        size: stats.size,
        lastModified: stats.mtime,
        contentType: this.detectMimeType(await fs.promises.readFile(filePath), key),
      };
    }

    this.ensureBucketConfigured();

    try {
      const headParams: HeadObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
      };

      const command = new HeadObjectCommand(headParams);
      const response = await this.s3Client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType,
        etag: response.ETag,
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        throw new StorageError('File not found', 'FILE_NOT_FOUND', 404, { key });
      }

      console.error('[STORAGE SERVICE] Get metadata failed:', error);
      throw new StorageError(
        `Get metadata failed: ${error.message}`,
        'GET_METADATA_ERROR',
        500,
        { originalError: error, key }
      );
    }
  }

  /**
   * Copy file to a new location
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<UploadFileResult> {
    if (this.useLocalStorage) {
      const sourcePath = path.join(this.localStoragePath, sourceKey);
      const destPath = path.join(this.localStoragePath, destinationKey);
      
      if (!fs.existsSync(sourcePath)) {
        throw new StorageError('Source file not found', 'FILE_NOT_FOUND', 404, { key: sourceKey });
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const buffer = await fs.promises.readFile(sourcePath);
      await fs.promises.writeFile(destPath, buffer);

      const stats = await statAsync(destPath);

      return {
        key: destinationKey,
        url: `/uploads/${destinationKey}`,
        location: `/uploads/${destinationKey}`,
        bucket: 'local',
        size: stats.size,
        contentType: this.detectMimeType(buffer, destinationKey),
      };
    }

    this.ensureBucketConfigured();

    try {
      const copyCommand = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      });

      const response = await this.s3Client.send(copyCommand);

      // Get metadata for the copied file
      const metadata = await this.getFileMetadata(destinationKey);

      return {
        key: destinationKey,
        url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${destinationKey}`,
        location: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${destinationKey}`,
        bucket: this.bucket,
        size: metadata.size,
        etag: response.CopyObjectResult?.ETag,
        contentType: metadata.contentType,
      };
    } catch (error: any) {
      console.error('[STORAGE SERVICE] Copy file failed:', error);
      throw new StorageError(
        `File copy failed: ${error.message}`,
        'COPY_ERROR',
        500,
        { originalError: error, sourceKey, destinationKey }
      );
    }
  }

  /**
   * List files with optional prefix filter
   */
  async listFiles(prefix?: string, maxKeys: number = 1000): Promise<FileMetadata[]> {
    if (this.useLocalStorage) {
      return this.listLocalFiles(prefix, maxKeys);
    }

    this.ensureBucketConfigured();

    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.s3Client.send(listCommand);

      if (!response.Contents) {
        return [];
      }

      return response.Contents.map(item => ({
        key: item.Key!,
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
        contentType: undefined,
        etag: item.ETag,
      }));
    } catch (error: any) {
      console.error('[STORAGE SERVICE] List files failed:', error);
      throw new StorageError(
        `List files failed: ${error.message}`,
        'LIST_ERROR',
        500,
        { originalError: error, prefix }
      );
    }
  }

  /**
   * List files in local storage
   */
  private async listLocalFiles(prefix?: string, maxKeys: number = 1000): Promise<FileMetadata[]> {
    const searchDir = prefix ? path.join(this.localStoragePath, prefix) : this.localStoragePath;
    
    if (!fs.existsSync(searchDir)) {
      return [];
    }

    const files: FileMetadata[] = [];
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= maxKeys) break;

        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && !entry.name.endsWith('.meta')) {
          const relativePath = path.relative(this.localStoragePath, fullPath);
          const stats = fs.statSync(fullPath);

          files.push({
            key: relativePath.replace(/\\/g, '/'), // Normalize path separators
            size: stats.size,
            lastModified: stats.mtime,
          });
        }
      }
    };

    walk(searchDir);
    return files;
  }
}

// ============================================================================
// Export singleton instance and factory functions
// ============================================================================

let storageServiceInstance: StorageService | null = null;

/**
 * Get or create the singleton StorageService instance
 */
export function getStorageService(config?: StorageConfig): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService(config);
  }
  return storageServiceInstance;
}

/**
 * Create a new StorageService instance with custom configuration
 */
export function createStorageService(config?: StorageConfig): StorageService {
  return new StorageService(config);
}

// Export default singleton instance (backward compatibility)
export const storageService = getStorageService();
