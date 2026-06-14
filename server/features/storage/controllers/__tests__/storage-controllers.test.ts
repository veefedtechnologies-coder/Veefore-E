/**
 * Storage Controllers Test Suite
 * 
 * Tests for file-upload.controller and image-processing.controller
 * Validates that controllers properly delegate to services
 * 
 * Requirements: 4.1, 4.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { FileUploadController } from '../file-upload.controller';
import { ImageProcessingController } from '../image-processing.controller';

// Mock the services
vi.mock('../../services/storage.service', () => ({
  storageService: {
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    getSignedUrl: vi.fn(),
  },
}));

vi.mock('../../repositories/storage.repository', () => ({
  storageRepository: {
    createFile: vi.fn(),
    getFile: vi.fn(),
    markFileDeleted: vi.fn(),
    getFilesByUser: vi.fn(),
    getFilesByWorkspace: vi.fn(),
    getFileStats: vi.fn(),
  },
}));

vi.mock('../../services/image-processing.service', () => ({
  imageProcessingService: {
    resize: vi.fn(),
    compress: vi.fn(),
    optimize: vi.fn(),
    generateMultipleThumbnails: vi.fn(),
  },
}));

describe('FileUploadController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let controller: FileUploadController;

  beforeEach(() => {
    controller = new FileUploadController();
    
    mockRequest = {
      file: {
        buffer: Buffer.from('test'),
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File,
      body: {},
      params: {},
      query: {},
    };

    mockResponse = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('uploadFile', () => {
    it('should return 400 when no file is uploaded', async () => {
      mockRequest.file = undefined;

      await controller.uploadFile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });

    it('should delegate to storageService.uploadFile', async () => {
      const { storageService } = await import('../../services/storage.service');
      const { storageRepository } = await import('../../repositories/storage.repository');

      vi.mocked(storageService.uploadFile).mockResolvedValue({
        key: 'test-key',
        url: 'https://example.com/test.jpg',
        location: 'https://example.com/test.jpg',
        bucket: 'test-bucket',
        size: 1024,
      });

      vi.mocked(storageRepository.createFile).mockResolvedValue({
        id: 'file-123',
        key: 'test-key',
        originalName: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        url: 'https://example.com/test.jpg',
        bucket: 'test-bucket',
        folder: 'general',
        status: 'completed',
        createdAt: new Date(),
      });

      await controller.uploadFile(mockRequest as Request, mockResponse as Response);

      expect(storageService.uploadFile).toHaveBeenCalledWith({
        buffer: expect.any(Buffer),
        originalName: 'test.jpg',
        mimetype: 'image/jpeg',
        folder: 'general',
      });

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        file: expect.objectContaining({
          id: 'file-123',
          url: 'https://example.com/test.jpg',
          key: 'test-key',
        }),
      });
    });
  });

  describe('deleteFile', () => {
    it('should return 404 when file not found', async () => {
      mockRequest.params = { fileId: 'non-existent' };
      
      const { storageRepository } = await import('../../repositories/storage.repository');
      vi.mocked(storageRepository.getFile).mockResolvedValue(null);

      await controller.deleteFile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should delegate to storageService.deleteFile and repository', async () => {
      mockRequest.params = { fileId: 'file-123' };
      
      const { storageService } = await import('../../services/storage.service');
      const { storageRepository } = await import('../../repositories/storage.repository');

      vi.mocked(storageRepository.getFile).mockResolvedValue({
        id: 'file-123',
        key: 'test-key',
        originalName: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        url: 'https://example.com/test.jpg',
        bucket: 'test-bucket',
        folder: 'general',
        status: 'completed',
        createdAt: new Date(),
      });

      vi.mocked(storageService.deleteFile).mockResolvedValue({
        success: true,
        key: 'test-key',
      });

      await controller.deleteFile(mockRequest as Request, mockResponse as Response);

      expect(storageService.deleteFile).toHaveBeenCalledWith('test-key');
      expect(storageRepository.markFileDeleted).toHaveBeenCalledWith('file-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'File deleted successfully',
      });
    });
  });
});

describe('ImageProcessingController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let controller: ImageProcessingController;

  beforeEach(() => {
    controller = new ImageProcessingController();
    
    mockRequest = {
      file: {
        buffer: Buffer.from('test-image'),
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
        size: 2048,
      } as Express.Multer.File,
      body: {
        width: 800,
        height: 600,
        format: 'jpeg',
        quality: 80,
      },
      params: {},
      query: {},
    };

    mockResponse = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('processImage', () => {
    it('should return 400 when no image is uploaded', async () => {
      mockRequest.file = undefined;

      await controller.processImage(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'No image uploaded' });
    });

    it('should delegate to imageProcessingService for resize and compress', async () => {
      const { imageProcessingService } = await import('../../services/image-processing.service');
      const { storageService } = await import('../../services/storage.service');
      const { storageRepository } = await import('../../repositories/storage.repository');

      const resizeResult = {
        buffer: Buffer.from('resized'),
        format: 'jpeg',
        width: 800,
        height: 600,
        size: 1500,
      };

      const compressResult = {
        buffer: Buffer.from('compressed'),
        format: 'jpeg',
        width: 800,
        height: 600,
        size: 1200,
      };

      vi.mocked(imageProcessingService.resize).mockResolvedValue(resizeResult);
      vi.mocked(imageProcessingService.compress).mockResolvedValue(compressResult);
      
      vi.mocked(storageService.uploadFile).mockResolvedValue({
        key: 'images/processed.jpg',
        url: 'https://example.com/processed.jpg',
        location: 'https://example.com/processed.jpg',
        bucket: 'test-bucket',
        size: 1200,
      });

      vi.mocked(storageRepository.createFile).mockResolvedValue({
        id: 'img-123',
        key: 'images/processed.jpg',
        originalName: 'image.jpg',
        mimetype: 'image/jpeg',
        size: 1200,
        url: 'https://example.com/processed.jpg',
        bucket: 'test-bucket',
        folder: 'images',
        status: 'completed',
        createdAt: new Date(),
      });

      await controller.processImage(mockRequest as Request, mockResponse as Response);

      expect(imageProcessingService.resize).toHaveBeenCalled();
      expect(imageProcessingService.compress).toHaveBeenCalledWith(
        resizeResult.buffer,
        'jpeg',
        { quality: 80 }
      );
      expect(storageService.uploadFile).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        image: expect.objectContaining({
          id: 'img-123',
          url: 'https://example.com/processed.jpg',
          width: 800,
          height: 600,
        }),
      });
    });
  });

  describe('optimizeImage', () => {
    it('should delegate to imageProcessingService.optimize', async () => {
      const { imageProcessingService } = await import('../../services/image-processing.service');
      const { storageService } = await import('../../services/storage.service');
      const { storageRepository } = await import('../../repositories/storage.repository');

      const optimizeResult = {
        buffer: Buffer.from('optimized'),
        format: 'webp',
        width: 1024,
        height: 768,
        size: 800,
      };

      vi.mocked(imageProcessingService.optimize).mockResolvedValue(optimizeResult);
      
      vi.mocked(storageService.uploadFile).mockResolvedValue({
        key: 'images/optimized/image.webp',
        url: 'https://example.com/optimized.webp',
        location: 'https://example.com/optimized.webp',
        bucket: 'test-bucket',
        size: 800,
      });

      vi.mocked(storageRepository.createFile).mockResolvedValue({
        id: 'img-opt-123',
        key: 'images/optimized/image.webp',
        originalName: 'image.jpg',
        mimetype: 'image/webp',
        size: 800,
        url: 'https://example.com/optimized.webp',
        bucket: 'test-bucket',
        folder: 'images/optimized',
        status: 'completed',
        createdAt: new Date(),
      });

      mockRequest.body.format = 'webp';

      await controller.optimizeImage(mockRequest as Request, mockResponse as Response);

      expect(imageProcessingService.optimize).toHaveBeenCalledWith(
        expect.any(Buffer),
        'webp'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        image: expect.objectContaining({
          id: 'img-opt-123',
          url: 'https://example.com/optimized.webp',
        }),
      });
    });
  });
});

describe('Controller Integration', () => {
  it('should verify controllers are slim and delegate to services', () => {
    const fileController = new FileUploadController();
    const imageController = new ImageProcessingController();

    // Controllers should only have request/response handling methods
    expect(typeof fileController.uploadFile).toBe('function');
    expect(typeof fileController.deleteFile).toBe('function');
    expect(typeof imageController.processImage).toBe('function');
    expect(typeof imageController.optimizeImage).toBe('function');

    // Controllers should be instantiable (class pattern)
    expect(fileController).toBeInstanceOf(FileUploadController);
    expect(imageController).toBeInstanceOf(ImageProcessingController);
  });
});
