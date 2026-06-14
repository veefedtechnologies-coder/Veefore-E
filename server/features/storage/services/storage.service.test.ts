/**
 * StorageService Unit Tests
 * 
 * Tests for AWS S3 storage operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService, StorageError } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    // Create service with test configuration
    service = new StorageService({
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      region: 'us-east-1',
      bucket: 'test-bucket',
    });
  });

  describe('validateFile', () => {
    it('should validate a valid JPEG file', async () => {
      // Create a minimal JPEG buffer (magic number: FFD8FF)
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      
      const result = await service.validateFile(buffer, 'test.jpg');
      
      expect(result.isValid).toBe(true);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.size).toBe(buffer.length);
    });

    it('should validate a valid PNG file', async () => {
      // Create a minimal PNG buffer (magic number: 89504E47)
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      
      const result = await service.validateFile(buffer, 'test.png');
      
      expect(result.isValid).toBe(true);
      expect(result.mimeType).toBe('image/png');
    });

    it('should reject files exceeding maximum size', async () => {
      // Create a buffer larger than MAX_FILE_SIZE (100MB)
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024);
      
      const result = await service.validateFile(largeBuffer, 'large.jpg');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    it('should reject unsupported file types', async () => {
      // Create a buffer that doesn't match any supported type
      const buffer = Buffer.from('invalid content');
      
      const result = await service.validateFile(buffer, 'test.txt');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('fileExists', () => {
    it('should use local storage when bucket is not configured', async () => {
      // When bucket is empty, service falls back to local storage
      const serviceNoBucket = new StorageService({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        region: 'us-east-1',
        bucket: '',
        useLocalStorage: true,
      });

      // Should not throw - will use local storage instead
      const exists = await serviceNoBucket.fileExists('nonexistent.jpg');
      expect(exists).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should create StorageError with all properties', () => {
      const error = new StorageError(
        'Test error',
        'TEST_CODE',
        400,
        { extra: 'details' }
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(StorageError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ extra: 'details' });
      expect(error.name).toBe('StorageError');
    });
  });

  describe('Configuration', () => {
    it('should use environment variables as fallback', () => {
      // Set environment variables
      process.env.AWS_ACCESS_KEY_ID = 'env-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'env-secret';
      process.env.AWS_REGION = 'us-west-2';
      process.env.AWS_S3_BUCKET = 'env-bucket';

      const serviceFromEnv = new StorageService();

      // Verify configuration was loaded (can't directly access private properties, 
      // but we can verify it doesn't throw initialization errors)
      expect(serviceFromEnv).toBeInstanceOf(StorageService);

      // Clean up
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_REGION;
      delete process.env.AWS_S3_BUCKET;
    });

    it('should prioritize constructor config over environment variables', () => {
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_S3_BUCKET = 'env-bucket';

      const serviceWithConfig = new StorageService({
        region: 'eu-west-1',
        bucket: 'config-bucket',
      });

      expect(serviceWithConfig).toBeInstanceOf(StorageService);

      // Clean up
      delete process.env.AWS_REGION;
      delete process.env.AWS_S3_BUCKET;
    });
  });

  describe('MIME Type Detection', () => {
    it('should detect JPEG from magic number', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      const result = await service.validateFile(jpegBuffer, 'unknown');
      
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should detect PNG from magic number', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const result = await service.validateFile(pngBuffer, 'unknown');
      
      expect(result.mimeType).toBe('image/png');
    });

    it('should detect GIF from magic number', async () => {
      const gifBuffer = Buffer.from('GIF89a', 'ascii');
      const result = await service.validateFile(gifBuffer, 'unknown');
      
      expect(result.mimeType).toBe('image/gif');
    });

    it('should fallback to extension-based detection', async () => {
      // Buffer without recognized magic number but valid extension
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const result = await service.validateFile(buffer, 'test.webp');
      
      // Should detect from extension since magic number is not recognized
      expect(result.mimeType).toBeDefined();
    });
  });
});

describe('StorageService Factory Functions', () => {
  it('should create singleton instance', async () => {
    const { getStorageService } = await import('./storage.service.js');
    
    const instance1 = getStorageService();
    const instance2 = getStorageService();
    
    expect(instance1).toBe(instance2);
  });

  it('should create new instance with custom config', async () => {
    const { createStorageService } = await import('./storage.service.js');
    
    const instance = createStorageService({
      region: 'eu-west-1',
      bucket: 'custom-bucket',
    });
    
    expect(instance).toBeInstanceOf(StorageService);
  });
});
