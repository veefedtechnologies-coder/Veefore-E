import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export interface VideoCompressionOptions {
  inputPath: string;
  outputPath?: string;
  maxSize?: number; // in MB
  targetBitrate?: string;
  resolution?: string;
  fps?: number;
}

export interface VideoCompressionResult {
  success: boolean;
  outputPath?: string;
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: number;
  error?: string;
}

export class VideoCompressor {
  /**
   * Compress a video file to reduce its size
   * @param options Compression options
   * @returns Promise with compression result
   */
  static async compressVideo(options: VideoCompressionOptions): Promise<VideoCompressionResult> {
    const {
      inputPath,
      outputPath,
      maxSize = 100, // Default 100MB
      targetBitrate = '2000k',
      resolution = '1280x720',
      fps = 30
    } = options;

    try {
      // Check if input file exists
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      // Get original file size
      const stats = fs.statSync(inputPath);
      const originalSize = stats.size;
      const originalSizeMB = originalSize / (1024 * 1024);

      console.log(`[VIDEO COMPRESSION] Original file size: ${originalSizeMB.toFixed(2)} MB`);

      // Generate output path if not provided
      const finalOutputPath = outputPath || this.generateOutputPath(inputPath);

      // If file is already small enough, just copy it
      if (originalSizeMB <= maxSize) {
        console.log('[VIDEO COMPRESSION] File is already within size limit, copying...');
        fs.copyFileSync(inputPath, finalOutputPath);
        return {
          success: true,
          outputPath: finalOutputPath,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1.0
        };
      }

      // Compress the video
      return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .output(finalOutputPath)
          .videoBitrate(targetBitrate)
          .size(resolution)
          .fps(fps)
          .videoCodec('libx264')
          .audioCodec('aac')
          .audioBitrate('128k')
          .on('start', (commandLine: string) => {
            console.log('[VIDEO COMPRESSION] FFmpeg command:', commandLine);
          })
          .on('progress', (progress: any) => {
            console.log(`[VIDEO COMPRESSION] Processing: ${progress.percent?.toFixed(2)}% done`);
          })
          .on('end', () => {
            const compressedStats = fs.statSync(finalOutputPath);
            const compressedSize = compressedStats.size;
            const compressedSizeMB = compressedSize / (1024 * 1024);
            const compressionRatio = originalSize / compressedSize;

            console.log(`[VIDEO COMPRESSION] Compressed file size: ${compressedSizeMB.toFixed(2)} MB`);
            console.log(`[VIDEO COMPRESSION] Compression ratio: ${compressionRatio.toFixed(2)}x`);

            resolve({
              success: true,
              outputPath: finalOutputPath,
              originalSize,
              compressedSize,
              compressionRatio
            });
          })
          .on('error', (err: Error) => {
            console.error('[VIDEO COMPRESSION] Error:', err.message);
            reject({
              success: false,
              error: err.message
            });
          })
          .run();
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[VIDEO COMPRESSION] Compression failed:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Generate output path for compressed video
   */
  private static generateOutputPath(inputPath: string): string {
    const dir = path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const basename = path.basename(inputPath, ext);
    return path.join(dir, `${basename}_compressed${ext}`);
  }

  /**
   * Get video metadata
   */
  static async getVideoMetadata(inputPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
  }

  /**
   * Get file size in MB
   */
  static getFileSizeMB(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size / (1024 * 1024);
    } catch (error) {
      console.error('[VIDEO COMPRESSION] Failed to get file size:', error);
      return 0;
    }
  }

  /**
   * Compress video specifically for Instagram requirements
   */
  static async compressForInstagram(inputPath: string, outputPath?: string): Promise<VideoCompressionResult> {
    return this.compressVideo({
      inputPath,
      outputPath,
      maxSize: 100, // Instagram max: 100MB
      targetBitrate: '3500k',
      resolution: '1080x1080',
      fps: 30
    });
  }

  /**
   * Validate video file for Instagram requirements
   */
  static async validateForInstagram(inputPath: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const metadata = await this.getVideoMetadata(inputPath);
      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');

      if (!videoStream) {
        errors.push('No video stream found');
        return { valid: false, errors };
      }

      // Check duration (Instagram: 3-60 seconds for feed, 15 seconds for stories)
      const duration = parseFloat(metadata.format.duration || '0');
      if (duration < 3) {
        errors.push('Video too short (minimum 3 seconds)');
      }
      if (duration > 60) {
        errors.push('Video too long (maximum 60 seconds for feed posts)');
      }

      // Check file size (Instagram: max 100MB)
      const fileSizeMB = metadata.format.size / (1024 * 1024);
      if (fileSizeMB > 100) {
        errors.push(`File size too large (${fileSizeMB.toFixed(2)}MB, maximum 100MB)`);
      }

      // Check resolution (Instagram: 1080x1920 for stories, 1080x1080 for feed)
      const width = videoStream.width;
      const height = videoStream.height;
      if (width > 1920 || height > 1920) {
        errors.push(`Resolution too high (${width}x${height}, maximum 1920x1920)`);
      }

      // Check frame rate (Instagram: max 30fps)
      const fps = eval(videoStream.r_frame_rate || '30/1');
      if (fps > 30) {
        errors.push(`Frame rate too high (${fps}fps, maximum 30fps)`);
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to validate video: ${errorMessage}`);
      return { valid: false, errors };
    }
  }
}
