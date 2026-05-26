import { spawn } from 'child_process';
import fs from 'fs';

interface FastCompressionResult {
  success: boolean;
  outputPath?: string;
  originalSize: number;
  compressedSize?: number;
  error?: string;
}

export class FastVideoCompressor {
  static async compressVideoForInstagram(inputPath: string): Promise<FastCompressionResult> {
    const originalSize = fs.statSync(inputPath).size;
    const timestamp = Date.now();
    const outputPath = inputPath.replace('.mp4', `-fast-compressed-${timestamp}.mp4`);
    
    console.log(`[FAST COMPRESSION] Starting ultra-fast compression for Instagram`);
    
    return new Promise((resolve) => {
      // Ultra-aggressive compression for large files
      const ffmpegArgs = [
        '-i', inputPath,
        '-vcodec', 'libx264',
        '-crf', '40', // More aggressive compression
        '-preset', 'ultrafast',
        '-vf', 'scale=480:854', // Smaller resolution
        '-acodec', 'copy', // Don't re-encode audio
        '-t', '10', // Limit to 10 seconds
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ];
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let hasResolved = false;
      
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          ffmpeg.kill('SIGKILL');
          hasResolved = true;
          resolve({
            success: false,
            originalSize,
            error: 'Compression timeout'
          });
        }
      }, 30000); // 30 second timeout
      
      ffmpeg.on('close', (code) => {
        if (!hasResolved) {
          clearTimeout(timeout);
          hasResolved = true;
          
          if (code === 0 && fs.existsSync(outputPath)) {
            const compressedSize = fs.statSync(outputPath).size;
            console.log(`[FAST COMPRESSION] Success: ${(originalSize/1024/1024).toFixed(2)}MB → ${(compressedSize/1024/1024).toFixed(2)}MB`);
            
            resolve({
              success: true,
              outputPath,
              originalSize,
              compressedSize
            });
          } else {
            resolve({
              success: false,
              originalSize,
              error: `FFmpeg failed with code ${code}`
            });
          }
        }
      });
      
      ffmpeg.on('error', (err) => {
        if (!hasResolved) {
          clearTimeout(timeout);
          hasResolved = true;
          resolve({
            success: false,
            originalSize,
            error: err.message
          });
        }
      });
    });
  }
}