/**
 * Video Storage Service
 * 
 * Handles video upload, metadata extraction, thumbnail generation, and transcoding queue management.
 * Manages video processing workflow and storage.
 * 
 * Requirements: 4.2
 */

import { storageService, UploadFileResult } from './storage.service';
import { imageProcessingService } from './image-processing.service';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const unlinkAsync = promisify(fs.unlink);
const writeFileAsync = promisify(fs.writeFile);

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  format: string;
  size: number;
  bitrate?: number;
  codec?: string;
  fps?: number;
}

export interface VideoUploadResult extends UploadFileResult {
  metadata: VideoMetadata;
  thumbnail?: string;
}

export interface VideoTranscodeOptions {
  videoId: string;
  inputKey: string;
  outputFormat?: 'mp4' | 'webm';
  quality?: 'low' | 'medium' | 'high';
  resolution?: { width?: number; height?: number };
}

export interface IVideoStorageService {
  uploadVideo(buffer: Buffer, originalName: string): Promise<VideoUploadResult>;
  extractMetadata(buffer: Buffer): Promise<VideoMetadata>;
  generateVideoThumbnail(buffer: Buffer, originalName: string): Promise<string>;
  queueTranscode(options: VideoTranscodeOptions): Promise<void>;
}

export class VideoStorageService implements IVideoStorageService {
  private transcodingQueue: Map<string, VideoTranscodeOptions> = new Map();

  /**
   * Upload video file to storage and extract metadata
   */
  async uploadVideo(buffer: Buffer, originalName: string): Promise<VideoUploadResult> {
    // Extract metadata first
    const metadata = await this.extractMetadata(buffer);

    // Upload video to storage
    const uploadResult = await storageService.uploadFile({
      buffer,
      originalName,
      mimetype: 'video/mp4',
      folder: 'videos',
    });

    // Generate thumbnail
    let thumbnail: string | undefined;
    try {
      thumbnail = await this.generateVideoThumbnail(buffer, originalName);
    } catch (error) {
      console.error('[VideoStorageService] Failed to generate thumbnail:', error);
      // Continue without thumbnail
    }

    return {
      ...uploadResult,
      metadata,
      thumbnail,
    };
  }

  /**
   * Extract video metadata using ffmpeg
   */
  async extractMetadata(buffer: Buffer): Promise<VideoMetadata> {
    // Write buffer to temporary file for ffmpeg processing
    const tempFilePath = path.join(process.cwd(), 'uploads', 'temp', `${uuidv4()}.tmp`);
    const tempDir = path.dirname(tempFilePath);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    await writeFileAsync(tempFilePath, buffer);

    try {
      return await this.extractMetadataFromFile(tempFilePath);
    } finally {
      // Cleanup temp file
      try {
        await unlinkAsync(tempFilePath);
      } catch (error) {
        console.error('[VideoStorageService] Failed to cleanup temp file:', error);
      }
    }
  }

  /**
   * Extract metadata from video file
   */
  private extractMetadataFromFile(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          return reject(err);
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          return reject(new Error('No video stream found'));
        }

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          format: metadata.format.format_name || 'unknown',
          size: metadata.format.size || 0,
          bitrate: metadata.format.bit_rate,
          codec: videoStream.codec_name,
          fps: this.parseFps(videoStream.r_frame_rate),
        });
      });
    });
  }

  /**
   * Parse frame rate string (e.g., "30/1" -> 30)
   */
  private parseFps(fpsString?: string): number | undefined {
    if (!fpsString) return undefined;
    
    const parts = fpsString.split('/');
    if (parts.length === 2) {
      const numerator = parseInt(parts[0], 10);
      const denominator = parseInt(parts[1], 10);
      return numerator / denominator;
    }
    
    return parseFloat(fpsString);
  }

  /**
   * Generate thumbnail from video at specified timestamp
   */
  async generateVideoThumbnail(
    buffer: Buffer,
    originalName: string,
    timestamp: string = '00:00:01'
  ): Promise<string> {
    // Write buffer to temporary file
    const tempVideoPath = path.join(process.cwd(), 'uploads', 'temp', `${uuidv4()}.tmp`);
    const tempThumbnailPath = path.join(process.cwd(), 'uploads', 'temp', `${uuidv4()}.jpg`);
    const tempDir = path.dirname(tempVideoPath);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    await writeFileAsync(tempVideoPath, buffer);

    try {
      // Generate thumbnail using ffmpeg
      await this.generateThumbnailFromFile(tempVideoPath, tempThumbnailPath, timestamp);

      // Read thumbnail buffer
      const thumbnailBuffer = await fs.promises.readFile(tempThumbnailPath);

      // Upload thumbnail
      const uploadResult = await storageService.uploadFile({
        buffer: thumbnailBuffer,
        originalName: `thumb_${originalName}.jpg`,
        mimetype: 'image/jpeg',
        folder: 'videos/thumbnails',
      });

      return uploadResult.url;
    } finally {
      // Cleanup temp files
      try {
        await unlinkAsync(tempVideoPath);
      } catch (e) { /* ignore */ }
      
      try {
        await unlinkAsync(tempThumbnailPath);
      } catch (e) { /* ignore */ }
    }
  }

  /**
   * Generate thumbnail from video file
   */
  private generateThumbnailFromFile(
    inputPath: string,
    outputPath: string,
    timestamp: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '640x360',
        })
        .on('end', () => resolve())
        .on('error', reject);
    });
  }

  /**
   * Queue video for transcoding (for future implementation with job queue)
   */
  async queueTranscode(options: VideoTranscodeOptions): Promise<void> {
    const { videoId } = options;
    
    // Store in in-memory queue (replace with Redis/Bull queue in production)
    this.transcodingQueue.set(videoId, options);
    
    console.log(`[VideoStorageService] Queued video ${videoId} for transcoding`);
    
    // TODO: Implement actual transcoding with job queue (Bull, BullMQ, or AWS MediaConvert)
    // For now, just log the queue operation
  }

  /**
   * Get transcoding queue status (for monitoring)
   */
  getQueueStatus(): { videoId: string; options: VideoTranscodeOptions }[] {
    return Array.from(this.transcodingQueue.entries()).map(([videoId, options]) => ({
      videoId,
      options,
    }));
  }

  /**
   * Remove from transcoding queue
   */
  removeFromQueue(videoId: string): boolean {
    return this.transcodingQueue.delete(videoId);
  }
}

// Export singleton instance
export const videoStorageService = new VideoStorageService();
