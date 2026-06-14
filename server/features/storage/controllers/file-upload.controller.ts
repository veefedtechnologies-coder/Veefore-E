/**
 * File Upload Controller
 * 
 * Handles HTTP requests for file uploads.
 * Delegates business logic to StorageService and StorageRepository.
 * 
 * Requirements: 4.1, 4.2
 */

import { Request, Response } from 'express';
import { storageService } from '../services/storage.service';
import { storageRepository } from '../repositories/storage.repository';

export class FileUploadController {
  /**
   * Upload a single file
   */
  async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const { buffer, originalname, mimetype, size } = req.file;
      const userId = (req as any).user?.id;
      const workspaceId = (req as any).workspaceId;
      const folder = req.body.folder || 'general';

      // Upload file to storage
      const uploadResult = await storageService.uploadFile({
        buffer,
        originalName: originalname,
        mimetype,
        folder,
      });

      // Save file metadata to database
      const fileMetadata = await storageRepository.createFile({
        key: uploadResult.key,
        originalName: originalname,
        mimetype,
        size,
        url: uploadResult.url,
        bucket: uploadResult.bucket,
        folder,
        userId,
        workspaceId,
        status: 'completed',
      });

      res.json({
        success: true,
        file: {
          id: fileMetadata.id,
          url: uploadResult.url,
          key: uploadResult.key,
          originalName: originalname,
          mimetype,
          size,
        },
      });
    } catch (error: any) {
      console.error('[FileUploadController] Upload failed:', error);
      res.status(500).json({
        error: 'File upload failed',
        message: error.message,
      });
    }
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(req: Request, res: Response): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      const userId = (req as any).user?.id;
      const workspaceId = (req as any).workspaceId;
      const folder = req.body.folder || 'general';

      // Upload all files
      const uploadPromises = files.map(async (file) => {
        const { buffer, originalname, mimetype, size } = file;

        // Upload to storage
        const uploadResult = await storageService.uploadFile({
          buffer,
          originalName: originalname,
          mimetype,
          folder,
        });

        // Save metadata
        const fileMetadata = await storageRepository.createFile({
          key: uploadResult.key,
          originalName: originalname,
          mimetype,
          size,
          url: uploadResult.url,
          bucket: uploadResult.bucket,
          folder,
          userId,
          workspaceId,
          status: 'completed',
        });

        return {
          id: fileMetadata.id,
          url: uploadResult.url,
          key: uploadResult.key,
          originalName: originalname,
          mimetype,
          size,
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);

      res.json({
        success: true,
        files: uploadedFiles,
      });
    } catch (error: any) {
      console.error('[FileUploadController] Multiple upload failed:', error);
      res.status(500).json({
        error: 'File upload failed',
        message: error.message,
      });
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;

      // Get file metadata
      const file = await storageRepository.getFile(fileId);
      
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // Delete from storage
      await storageService.deleteFile(file.key);

      // Mark as deleted in database
      await storageRepository.markFileDeleted(fileId);

      res.json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error: any) {
      console.error('[FileUploadController] Delete failed:', error);
      res.status(500).json({
        error: 'File deletion failed',
        message: error.message,
      });
    }
  }

  /**
   * Get file metadata
   */
  async getFile(req: Request, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;

      const file = await storageRepository.getFile(fileId);
      
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      res.json({
        success: true,
        file,
      });
    } catch (error: any) {
      console.error('[FileUploadController] Get file failed:', error);
      res.status(500).json({
        error: 'Failed to retrieve file',
        message: error.message,
      });
    }
  }

  /**
   * Get signed URL for secure file access
   */
  async getSignedUrl(req: Request, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;
      const expiresIn = parseInt(req.query.expiresIn as string) || 3600;

      const file = await storageRepository.getFile(fileId);
      
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const signedUrl = await storageService.getSignedUrl(file.key, expiresIn);

      res.json({
        success: true,
        url: signedUrl,
        expiresIn,
      });
    } catch (error: any) {
      console.error('[FileUploadController] Get signed URL failed:', error);
      res.status(500).json({
        error: 'Failed to generate signed URL',
        message: error.message,
      });
    }
  }

  /**
   * Get user's files
   */
  async getUserFiles(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const limit = parseInt(req.query.limit as string) || 100;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const files = await storageRepository.getFilesByUser(userId, limit);

      res.json({
        success: true,
        files,
      });
    } catch (error: any) {
      console.error('[FileUploadController] Get user files failed:', error);
      res.status(500).json({
        error: 'Failed to retrieve files',
        message: error.message,
      });
    }
  }

  /**
   * Get workspace files
   */
  async getWorkspaceFiles(req: Request, res: Response): Promise<void> {
    try {
      const workspaceId = (req as any).workspaceId;
      const limit = parseInt(req.query.limit as string) || 100;

      if (!workspaceId) {
        res.status(400).json({ error: 'Workspace ID required' });
        return;
      }

      const files = await storageRepository.getFilesByWorkspace(workspaceId, limit);

      res.json({
        success: true,
        files,
      });
    } catch (error: any) {
      console.error('[FileUploadController] Get workspace files failed:', error);
      res.status(500).json({
        error: 'Failed to retrieve files',
        message: error.message,
      });
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const workspaceId = (req as any).workspaceId;

      const stats = await storageRepository.getFileStats(userId, workspaceId);

      res.json({
        success: true,
        stats,
      });
    } catch (error: any) {
      console.error('[FileUploadController] Get storage stats failed:', error);
      res.status(500).json({
        error: 'Failed to retrieve storage statistics',
        message: error.message,
      });
    }
  }
}

// Export controller instance
export const fileUploadController = new FileUploadController();
