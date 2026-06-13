import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface SimpleCompressionResult {
  success: boolean;
  outputPath?: string;
  originalSize: number;
  compressedSize?: number;
  error?: string;
}

export class SimpleVideoCompressor {
  static async compressVideo(inputPath: string, targetSizeMB: number = 25): Promise<SimpleCompressionResult> {
    const originalSize = fs.statSync(inputPath).size;
    const timestamp = Date.now();
    const outputPath = inputPath.replace('.mp4', `-compressed-${timestamp}.mp4`);
    
    console.log(`[SIMPLE COMPRESSION] Compressing ${inputPath} to target ${targetSizeMB}MB`);
    
    return new Promise((resolve) => {
      const ffmpegArgs = [
        '-i', inputPath,
        '-vcodec', 'libx264',
        '-crf', '35',
        '-preset', 'veryfast',
        '-vf', 'scale=720:1280',
        '-acodec', 'aac',
        '-b:a', '48k',
        '-r', '30',
        '-t', '15',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ];
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('frame=')) {
          console.log('[SIMPLE COMPRESSION] Processing...');
        }
        errorOutput += output;
      });
      
      const timeout = setTimeout(() => {
        ffmpeg.kill('SIGKILL');
        console.log('[SIMPLE COMPRESSION] Timeout - killing process');
        resolve({
          success: false,
          originalSize,
          error: 'Compression timeout'
        });
      }, 60000); // 1 minute timeout
      
      ffmpeg.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0 && fs.existsSync(outputPath)) {
          const compressedSize = fs.statSync(outputPath).size;
          console.log(`[SIMPLE COMPRESSION] Success: ${(originalSize/1024/1024).toFixed(2)}MB → ${(compressedSize/1024/1024).toFixed(2)}MB`);
          
          resolve({
            success: true,
            outputPath,
            originalSize,
            compressedSize
          });
        } else {
          console.log(`[SIMPLE COMPRESSION] Failed with code ${code}`);
          resolve({
            success: false,
            originalSize,
            error: `FFmpeg exited with code ${code}`
          });
        }
      });
      
      ffmpeg.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[SIMPLE COMPRESSION] Process error:', err.message);
        resolve({
          success: false,
          originalSize,
          error: err.message
        });
      });
    });
  }
}