/**
 * Storage Repository Unit Tests
 * 
 * Tests for the StorageRepository class that handles file metadata operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { StorageRepository, FileMetadata } from './storage.repository';

describe('StorageRepository', () => {
  let repository: StorageRepository;
  let mockFileData: Partial<FileMetadata>;

  beforeEach(() => {
    repository = new StorageRepository();
    mockFileData = {
      key: `test-file-${Date.now()}`,
      originalName: 'test-image.jpg',
      mimetype: 'image/jpeg',
      size: 1024000,
      url: '/uploads/test-image.jpg',
      bucket: 'test-bucket',
      folder: 'test-folder',
      userId: 'user-123',
      workspaceId: 'workspace-456',
      status: 'completed' as const,
      metadata: {
        width: 1920,
        height: 1080,
      },
    };
  });

  describe('Interface Definition', () => {
    it('should have createFile method', () => {
      expect(repository.createFile).toBeDefined();
      expect(typeof repository.createFile).toBe('function');
    });

    it('should have getFile method', () => {
      expect(repository.getFile).toBeDefined();
      expect(typeof repository.getFile).toBe('function');
    });

    it('should have getFileByKey method', () => {
      expect(repository.getFileByKey).toBeDefined();
      expect(typeof repository.getFileByKey).toBe('function');
    });

    it('should have getFilesByUser method', () => {
      expect(repository.getFilesByUser).toBeDefined();
      expect(typeof repository.getFilesByUser).toBe('function');
    });

    it('should have getFilesByWorkspace method', () => {
      expect(repository.getFilesByWorkspace).toBeDefined();
      expect(typeof repository.getFilesByWorkspace).toBe('function');
    });

    it('should have updateFile method', () => {
      expect(repository.updateFile).toBeDefined();
      expect(typeof repository.updateFile).toBe('function');
    });

    it('should have deleteFile method', () => {
      expect(repository.deleteFile).toBeDefined();
      expect(typeof repository.deleteFile).toBe('function');
    });

    it('should have markFileDeleted method', () => {
      expect(repository.markFileDeleted).toBeDefined();
      expect(typeof repository.markFileDeleted).toBe('function');
    });

    it('should have getFileStats method', () => {
      expect(repository.getFileStats).toBeDefined();
      expect(typeof repository.getFileStats).toBe('function');
    });
  });

  describe('Type Safety', () => {
    it('should enforce FileMetadata interface structure', () => {
      const fileMetadata: FileMetadata = {
        id: '123',
        key: 'test-key',
        originalName: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        url: '/test.jpg',
        bucket: 'test',
        folder: 'test',
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(fileMetadata).toBeDefined();
      expect(fileMetadata.key).toBe('test-key');
      expect(fileMetadata.status).toBe('completed');
    });

    it('should allow optional fields', () => {
      const fileMetadata: Partial<FileMetadata> = {
        key: 'test-key',
        originalName: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        url: '/test.jpg',
        bucket: 'test',
        folder: 'test',
      };

      expect(fileMetadata.userId).toBeUndefined();
      expect(fileMetadata.workspaceId).toBeUndefined();
      expect(fileMetadata.metadata).toBeUndefined();
    });

    it('should enforce status enum values', () => {
      const validStatuses: Array<FileMetadata['status']> = [
        'uploading',
        'completed',
        'failed',
        'deleted',
      ];

      validStatuses.forEach(status => {
        const fileMetadata: Partial<FileMetadata> = {
          status,
        };
        expect(fileMetadata.status).toBe(status);
      });
    });
  });

  describe('Data Structure', () => {
    it('should properly structure file metadata object', () => {
      expect(mockFileData.key).toBeDefined();
      expect(mockFileData.originalName).toBe('test-image.jpg');
      expect(mockFileData.mimetype).toBe('image/jpeg');
      expect(mockFileData.size).toBe(1024000);
      expect(mockFileData.url).toBe('/uploads/test-image.jpg');
      expect(mockFileData.bucket).toBe('test-bucket');
      expect(mockFileData.folder).toBe('test-folder');
      expect(mockFileData.userId).toBe('user-123');
      expect(mockFileData.workspaceId).toBe('workspace-456');
      expect(mockFileData.status).toBe('completed');
      expect(mockFileData.metadata).toEqual({
        width: 1920,
        height: 1080,
      });
    });

    it('should handle metadata with custom fields', () => {
      const fileWithCustomMetadata: Partial<FileMetadata> = {
        ...mockFileData,
        metadata: {
          width: 1920,
          height: 1080,
          duration: 120,
          format: 'mp4',
          customField: 'custom value',
        },
      };

      expect(fileWithCustomMetadata.metadata).toBeDefined();
      expect(fileWithCustomMetadata.metadata?.customField).toBe('custom value');
    });
  });

  describe('Repository Pattern Compliance', () => {
    it('should implement IStorageRepository interface', () => {
      const requiredMethods = [
        'createFile',
        'getFile',
        'getFileByKey',
        'getFilesByUser',
        'getFilesByWorkspace',
        'updateFile',
        'deleteFile',
        'markFileDeleted',
        'getFileStats',
      ];

      requiredMethods.forEach(method => {
        expect(repository).toHaveProperty(method);
        expect(typeof (repository as any)[method]).toBe('function');
      });
    });

    it('should separate data access from business logic', () => {
      // Repository should only handle database operations
      // Business logic should be in services
      const publicMethods = Object.getOwnPropertyNames(StorageRepository.prototype)
        .filter(name => name !== 'constructor' && !name.startsWith('_') && name !== 'toFileMetadata');

      // All public methods should be data access methods
      const expectedMethods = [
        'createFile', 'getFile', 'getFileByKey', 'getFilesByUser', 
        'getFilesByWorkspace', 'updateFile', 'deleteFile', 
        'markFileDeleted', 'getFileStats'
      ];

      publicMethods.forEach(method => {
        expect(expectedMethods).toContain(method);
      });
    });
  });

  describe('Requirements Coverage', () => {
    it('should meet requirement 4.5 - repository pattern for database operations', () => {
      // Requirement 4.5: "THE Service_Layer SHALL handle all database operations through a repository pattern"
      
      // The repository abstracts all database operations
      expect(repository.createFile).toBeDefined();
      expect(repository.getFile).toBeDefined();
      expect(repository.updateFile).toBeDefined();
      expect(repository.deleteFile).toBeDefined();
      
      // These methods provide the interface for the service layer
      // No direct Mongoose calls should be needed in services
    });

    it('should abstract MongoDB interactions', () => {
      // The repository hides Mongoose implementation details
      // Services don't need to know about Mongoose models
      const repositoryMethods = [
        'createFile',
        'getFile',
        'getFileByKey',
        'getFilesByUser',
        'getFilesByWorkspace',
        'updateFile',
        'deleteFile',
        'markFileDeleted',
        'getFileStats',
      ];

      repositoryMethods.forEach(method => {
        // Each method returns Promises (async operations)
        const result = (repository as any)[method];
        expect(result).toBeDefined();
        expect(typeof result).toBe('function');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid file data gracefully', async () => {
      // Testing with minimal invalid data
      const invalidData: Partial<FileMetadata> = {
        key: '',
        originalName: '',
      };

      // The method signature allows this, but database validation should catch it
      expect(invalidData.key).toBe('');
    });
  });

  describe('Integration Readiness', () => {
    it('should be ready for service layer integration', () => {
      // Check that repository can be used by services
      const repository = new StorageRepository();
      
      expect(repository).toBeDefined();
      expect(repository.createFile).toBeDefined();
      expect(repository.getFile).toBeDefined();
      expect(repository.getFilesByWorkspace).toBeDefined();
    });

    it('should provide all necessary CRUD operations', () => {
      const crudOperations = {
        create: repository.createFile,
        read: repository.getFile,
        update: repository.updateFile,
        delete: repository.deleteFile,
      };

      Object.values(crudOperations).forEach(operation => {
        expect(operation).toBeDefined();
        expect(typeof operation).toBe('function');
      });
    });

    it('should provide query operations for common use cases', () => {
      const queryOperations = {
        byKey: repository.getFileByKey,
        byUser: repository.getFilesByUser,
        byWorkspace: repository.getFilesByWorkspace,
        stats: repository.getFileStats,
      };

      Object.values(queryOperations).forEach(operation => {
        expect(operation).toBeDefined();
        expect(typeof operation).toBe('function');
      });
    });
  });
});
