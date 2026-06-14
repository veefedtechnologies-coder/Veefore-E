/**
 * Image Processing Controller
 * 
 * Handles HTTP requests for image processing operations.
 * Delegates to ImageProcessingService for transformations.
 * 
 * Requirements: 4.1, 4.2
 */

import { Request, Response } from 'express';
import { imageProcessingService, type ResizeMode, type ImageFormat } from '../services/image-processing.service';
import { storageRepository } from '../repositories/storage.repository';
import { storageService } from '../services/storage.service';

export class ImageProcessingController {
  /**
   * Upload and process image with transformations
   */
  async processImage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No image uploaded' });
        return;
      }

      const { buffer, originalname, mimetype } = req.file;
      const userId = (req as any).user?.id;
      const workspaceId = (req as any).workspaceId;

      // Parse processing options from request body
      const resizeOptions = {
        width: req.body.width ? parseInt(req.body.width) : undefined,
        height: req.body.height ? parseInt(req.body.height) : undefined,
        fit: (req.body.fit || 'cover') as ResizeMode,
      };

      const format = (req.body.format || 'jpeg') as ImageFormat;
      const quality = req.body.quality ? parseInt(req.body.quality) : 80;

      // Process image with resize
      let result = await imageProcessingService.resize(buffer, resizeOptions);
      
      // Compress to desired format
      result = await imageProcessingService.compress(result.buffer, format, { quality });

      // Upload processed image to storage
      const uploadResult = await storageService.uploadFile({
        buffer: result.buffer,
        originalName: originalname,
        mimetype: `image/${format}`,
        folder: 'images',
      });

      // Save metadata
      const fileMetadata = await storageRepository.createFile({
        key: uploadResult.key,
        originalName: originalname,
        mimetype: `image/${format}`,
        size: result.size,
        url: uploadResult.url,
        bucket: uploadResult.bucket,
        folder: 'images',
        userId,
        workspaceId,
        metadata: {
          width: result.width,
          height: result.height,
          format: result.format,
        },
        status: 'completed',
      });

      res.json({
        success: true,
        image: {
          id: fileMetadata.id,
          url: uploadResult.url,
          key: uploadResult.key,
          size: result.size,
          width: result.width,
          height: result.height,
        },
      });
    } catch (error: any) {
      console.error('[ImageProcessingController] Process image failed:', error);
      res.status(500).json({
        error: 'Image processing failed',
        message: error.message,
      });
    }
  }

  /**
   * Upload and optimize image for web
   */
  async optimizeImage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No image uploaded' });
        return;
      }

      const { buffer, originalname } = req.file;
      const userId = (req as any).user?.id;
      const workspaceId = (req as any).workspaceId;
      const targetFormat = (req.body.format || 'webp') as ImageFormat;

      // Optimize image
      const result = await imageProcessingService.optimize(buffer, targetFormat);

      // Upload optimized image to storage
      const uploadResult = await storageService.uploadFile({
        buffer: result.buffer,
        originalName: originalname,
        mimetype: `image/${targetFormat}`,
        folder: 'images/optimized',
      });

      // Save metadata
      const fileMetadata = await storageRepository.createFile({
        key: uploadResult.key,
        originalName: originalname,
        mimetype: `image/${targetFormat}`,
        size: result.size,
        url: uploadResult.url,
        bucket: uploadResult.bucket,
        folder: 'images/optimized',
        userId,
        workspaceId,
        metadata: {
          width: result.width,
          height: result.height,
          format: result.format,
          optimized: true,
        },
        status: 'completed',
      });

      res.json({
        success: true,
        image: {
          id: fileMetadata.id,
          url: uploadResult.url,
          key: uploadResult.key,
          size: result.size,
          width: result.width,
          height: result.height,
        },
      });
    } catch (error: any) {
      console.error('[ImageProcessingController] Optimize image failed:', error);
      res.status(500).json({
        error: 'Image optimization failed',
        message: error.message,
      });
    }
  }

  /**
   * Generate thumbnails for uploaded image
   */
  async generateThumbnails(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No image uploaded' });
        return;
      }

      const { buffer, originalname } = req.file;
      const userId = (req as any).user?.id;
      const workspaceId = (req as any).workspaceId;

      // Parse thumbnail sizes from request body
      const sizes = req.body.sizes
        ? JSON.parse(req.body.sizes)
        : [
            { width: 150, height: 150, name: 'small' },
            { width: 300, height: 300, name: 'medium' },
            { width: 600, height: 600, name: 'large' },
          ];

      const format = (req.body.format || 'jpeg') as ImageFormat;
      const quality = req.body.quality ? parseInt(req.body.quality) : 80;

      // Upload original image first
      const originalUpload = await storageService.uploadFile({
        buffer,
        originalName: originalname,
        mimetype: 'image/jpeg',
        folder: 'images/originals',
      });

      const originalMetadata = await storageRepository.createFile({
        key: originalUpload.key,
        originalName: originalname,
        mimetype: 'image/jpeg',
        size: originalUpload.size,
        url: originalUpload.url,
        bucket: originalUpload.bucket,
        folder: 'images/originals',
        userId,
        workspaceId,
        status: 'completed',
      });

      // Generate thumbnails
      const thumbnailResults = await imageProcessingService.generateMultipleThumbnails(
        buffer,
        sizes.map((size: { width: number; height: number; name: string }) => ({
          width: size.width,
          height: size.height,
          fit: 'cover' as ResizeMode,
          quality,
          format,
        }))
      );

      // Upload thumbnails
      const thumbnails = await Promise.all(
        thumbnailResults.map(async (result, index) => {
          const size = sizes[index];
          const uploadResult = await storageService.uploadFile({
            buffer: result.buffer,
            originalName: `${size.name}_${originalname}`,
            mimetype: `image/${format}`,
            folder: 'images/thumbnails',
          });

          await storageRepository.createFile({
            key: uploadResult.key,
            originalName: `${size.name}_${originalname}`,
            mimetype: `image/${format}`,
            size: result.size,
            url: uploadResult.url,
            bucket: uploadResult.bucket,
            folder: 'images/thumbnails',
            userId,
            workspaceId,
            metadata: {
              width: result.width,
              height: result.height,
              thumbnailOf: originalMetadata.id,
            },
            status: 'completed',
          });

          return {
            name: size.name,
            url: uploadResult.url,
            width: result.width,
            height: result.height,
          };
        })
      );

      res.json({
        success: true,
        original: {
          id: originalMetadata.id,
          url: originalUpload.url,
        },
        thumbnails,
      });
    } catch (error: any) {
      console.error('[ImageProcessingController] Generate thumbnails failed:', error);
      res.status(500).json({
        error: 'Thumbnail generation failed',
        message: error.message,
      });
    }
  }

  /**
   * Resize existing image
   */
  async resizeImage(req: Request, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;
      const width = req.body.width ? parseInt(req.body.width) : undefined;
      const height = req.body.height ? parseInt(req.body.height) : undefined;

      if (!width && !height) {
        res.status(400).json({ error: 'Width or height required' });
        return;
      }

      // Get original file
      const file = await storageRepository.getFile(fileId);
      
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // For now, return error as we need to implement fetching from storage
      // In production, would fetch buffer from S3/local storage and process
      res.status(501).json({
        error: 'Resize operation not yet implemented',
        message: 'This endpoint will be implemented when file retrieval from storage is available',
      });
    } catch (error: any) {
      console.error('[ImageProcessingController] Resize image failed:', error);
      res.status(500).json({
        error: 'Image resize failed',
        message: error.message,
      });
    }
  }
}

// Export controller instance
export const imageProcessingController = new ImageProcessingController();
