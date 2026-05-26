/**
 * Real Video Processing Engine
 * Handles actual video files and YouTube URLs with FFmpeg integration
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  fps: number;
  format: string;
  title?: string;
}

interface ProcessedSegment {
  startTime: number;
  endTime: number;
  outputPath: string;
  score: number;
  thumbnail: string;
}

export class RealVideoProcessor {
  private uploadsDir = './uploads';
  private outputDir = './generated-content';

  constructor() {
    this.ensureDirectories();
  }

  private async ensureDirectories() {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  /**
   * Download video from YouTube URL using yt-dlp
   */
  async downloadFromURL(videoUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const outputPath = path.join(this.uploadsDir, `video_${timestamp}.%(ext)s`);
      
      console.log('[REAL VIDEO] Downloading video from URL:', videoUrl);
      
      // Enhanced yt-dlp with anti-restriction measures
      const ytDlp = spawn('yt-dlp', [
        '--format', 'best[height<=720]/best',
        '--output', outputPath,
        '--no-playlist',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--extractor-retries', '3',
        '--fragment-retries', '3',
        '--retry-sleep', '1',
        '--no-check-certificate',
        '--prefer-free-formats',
        '--merge-output-format', 'mp4',
        videoUrl
      ]);

      let stderr = '';
      let stdout = '';
      
      ytDlp.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log('[YT-DLP]', data.toString().trim());
      });
      
      ytDlp.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('[YT-DLP]', data.toString().trim());
      });

      ytDlp.on('close', async (code) => {
        if (code === 0) {
          // Find the downloaded file
          const files = await fs.readdir(this.uploadsDir);
          const videoFile = files.find(f => f.startsWith(`video_${timestamp}`));
          
          if (videoFile) {
            const fullPath = path.join(this.uploadsDir, videoFile);
            console.log('[REAL VIDEO] Successfully downloaded:', fullPath);
            resolve(fullPath);
          } else {
            reject(new Error('Downloaded file not found'));
          }
        } else {
          console.error('[YT-DLP] Error:', stderr);
          
          // Provide specific error messages for common issues
          if (stderr.includes('403: Forbidden') || stderr.includes('nsig extraction failed')) {
            reject(new Error('YouTube access restricted. Try a different video or use file upload instead.'));
          } else if (stderr.includes('Private video') || stderr.includes('members-only')) {
            reject(new Error('This video is private or restricted. Please use a public video.'));
          } else if (stderr.includes('Video unavailable')) {
            reject(new Error('Video not available. Please check the URL and try again.'));
          } else {
            reject(new Error(`Download failed: ${stderr.substring(0, 200)}...`));
          }
        }
      });
    });
  }

  /**
   * Extract video metadata using FFprobe
   */
  async getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath
      ]);

      let stdout = '';
      
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          try {
            const metadata = JSON.parse(stdout);
            const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
            
            if (!videoStream) {
              reject(new Error('No video stream found'));
              return;
            }

            resolve({
              duration: parseFloat(metadata.format.duration),
              width: videoStream.width,
              height: videoStream.height,
              bitrate: parseInt(metadata.format.bit_rate || '0'),
              fps: eval(videoStream.r_frame_rate), // Convert fraction to decimal
              format: metadata.format.format_name,
              title: metadata.format.tags?.title
            });
          } catch (error) {
            reject(new Error('Failed to parse metadata'));
          }
        } else {
          reject(new Error('FFprobe failed'));
        }
      });
    });
  }

  /**
   * Analyze video content using OpenAI vision
   */
  async analyzeVideoContent(videoPath: string, metadata: VideoMetadata): Promise<any> {
    console.log('[REAL VIDEO] Analyzing video content with OpenAI');
    
    // Extract frames for analysis
    const frameTimestamps = this.generateFrameTimestamps(metadata.duration);
    const frameAnalyses = [];

    for (const timestamp of frameTimestamps) {
      try {
        const framePath = await this.extractFrame(videoPath, timestamp);
        const frameBase64 = await fs.readFile(framePath, 'base64');
        
        const analysis = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this video frame at ${timestamp}s. Describe the visual content, any text, people, actions, and rate the engagement potential (1-10).`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${frameBase64}`
                }
              }
            ]
          }],
          max_tokens: 300
        });

        frameAnalyses.push({
          timestamp,
          analysis: analysis.choices[0].message.content,
          frame: framePath
        });

        // Clean up temporary frame
        await fs.unlink(framePath);
        
      } catch (error) {
        console.error('[REAL VIDEO] Frame analysis error:', error);
      }
    }

    return this.synthesizeAnalysis(frameAnalyses, metadata);
  }

  /**
   * Extract a frame at specific timestamp
   */
  private async extractFrame(videoPath: string, timestamp: number): Promise<string> {
    const frameOutput = path.join(this.outputDir, `frame_${Date.now()}_${timestamp}.jpg`);
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-ss', timestamp.toString(),
        '-vframes', '1',
        '-y',
        frameOutput
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(frameOutput);
        } else {
          reject(new Error('Frame extraction failed'));
        }
      });
    });
  }

  /**
   * Generate optimal frame timestamps for analysis
   */
  private generateFrameTimestamps(duration: number): number[] {
    const frameCount = Math.min(Math.floor(duration / 30), 10); // Max 10 frames
    const interval = duration / (frameCount + 1);
    
    return Array.from({ length: frameCount }, (_, i) => (i + 1) * interval);
  }

  /**
   * Synthesize frame analyses into video insights
   */
  private async synthesizeAnalysis(frameAnalyses: any[], metadata: VideoMetadata): Promise<any> {
    const analysisText = frameAnalyses.map(f => 
      `${f.timestamp}s: ${f.analysis}`
    ).join('\n\n');

    const synthesis = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: `Based on these video frame analyses, identify the 3 best segments for short-form content:

${analysisText}

Video duration: ${metadata.duration}s
Format: ${metadata.format}

Return JSON with this structure:
{
  "bestSegments": [
    {
      "startTime": number,
      "endTime": number,
      "reason": "string",
      "engagementScore": number,
      "highlights": ["string"]
    }
  ],
  "overallTheme": "string",
  "recommendedStyle": "highlights|tutorial|story|viral"
}`
      }],
      response_format: { type: "json_object" }
    });

    return JSON.parse(synthesis.choices[0].message.content || '{}');
  }

  /**
   * Create short video from best segment
   */
  async createShortVideo(
    inputPath: string, 
    startTime: number, 
    endTime: number, 
    aspectRatio: '9:16' | '16:9' | '1:1' = '9:16'
  ): Promise<string> {
    const timestamp = Date.now();
    const outputPath = path.join(this.outputDir, `short_${timestamp}.mp4`);
    
    console.log('[REAL VIDEO] Creating short video:', { startTime, endTime, aspectRatio, inputPath, outputPath });

    return new Promise((resolve, reject) => {
      let ffmpegArgs = [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-t', (endTime - startTime).toString(),
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart'
      ];

      // Apply aspect ratio transformations with proper scaling
      if (aspectRatio === '9:16') {
        ffmpegArgs.push('-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p');
      } else if (aspectRatio === '1:1') {
        ffmpegArgs.push('-vf', 'scale=720:720:force_original_aspect_ratio=increase,crop=720:720,format=yuv420p');
      } else {
        ffmpegArgs.push('-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,format=yuv420p');
      }

      ffmpegArgs.push('-y', outputPath);

      console.log('[REAL VIDEO] FFmpeg command:', ffmpegArgs.join(' '));

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let stderr = '';
      let stdout = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('[REAL VIDEO] FFmpeg progress:', data.toString().trim());
      });

      ffmpeg.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffmpeg.on('close', async (code) => {
        console.log('[REAL VIDEO] FFmpeg finished with code:', code);
        
        if (code === 0) {
          try {
            // Verify the output file was created and has content
            const stats = await fs.stat(outputPath);
            console.log('[REAL VIDEO] Output file size:', stats.size, 'bytes');
            
            if (stats.size > 1000) { // Minimum reasonable file size
              console.log('[REAL VIDEO] Short video created successfully:', outputPath);
              resolve(outputPath);
            } else {
              reject(new Error(`Generated video file is too small (${stats.size} bytes)`));
            }
          } catch (error) {
            reject(new Error(`Failed to verify output file: ${error.message}`));
          }
        } else {
          console.error('[REAL VIDEO] FFmpeg failed with code:', code);
          console.error('[REAL VIDEO] FFmpeg stderr:', stderr);
          reject(new Error(`Video processing failed (code ${code}): ${stderr.substring(0, 500)}`));
        }
      });

      ffmpeg.on('error', (error) => {
        console.error('[REAL VIDEO] FFmpeg process error:', error);
        reject(new Error(`FFmpeg process failed: ${error.message}`));
      });
    });
  }

  /**
   * Generate thumbnail for video
   */
  async generateThumbnail(videoPath: string, timestamp?: number): Promise<string> {
    const thumbOutput = path.join(this.outputDir, `thumb_${Date.now()}.jpg`);
    const seekTime = timestamp || 2; // Default to 2 seconds

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-ss', seekTime.toString(),
        '-vframes', '1',
        '-vf', 'scale=480:270',
        '-y',
        thumbOutput
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(thumbOutput);
        } else {
          reject(new Error('Thumbnail generation failed'));
        }
      });
    });
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePaths: string[]) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log('[REAL VIDEO] Cleaned up:', filePath);
      } catch (error) {
        console.error('[REAL VIDEO] Cleanup error:', error);
      }
    }
  }
}