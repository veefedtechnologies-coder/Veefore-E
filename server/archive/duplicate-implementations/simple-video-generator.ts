/**
 * Simplified video generator for testing
 * Creates a basic video with text overlay
 */

import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { mkdir } from 'fs/promises';
import OpenAI from 'openai';

export class SimpleVideoGenerator {
  private outputDir: string;
  private openai: OpenAI;

  constructor() {
    // Use /tmp on Railway/production for generated files (filesystem may be read-only)
    const baseDir = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production' 
      ? '/tmp/media/generated'
      : join(process.cwd(), 'media', 'generated');
    this.outputDir = baseDir;
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private async ensureOutputDirectory() {
    try {
      await mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('[SIMPLE VIDEO] Failed to create directory:', error);
      // Non-fatal - will try again if needed
    }
  }

  async generateSimpleVideo(prompt: string, duration: number = 10): Promise<{ videoPath: string; script: any }> {
    await this.ensureOutputDirectory();

    // Step 1: Generate a simple script with OpenAI
    console.log('[SIMPLE VIDEO] Generating script...');
    const script = await this.generateScript(prompt, duration);

    // Step 2: Create a simple video with text overlay
    console.log('[SIMPLE VIDEO] Creating video...');
    const videoPath = await this.createTextVideo(script.title, script.description, duration);

    return { videoPath, script };
  }

  private async generateScript(prompt: string, duration: number): Promise<any> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o", // Use gpt-4o which supports JSON response format
        messages: [
          {
            role: "system",
            content: "You are a video script writer. Create a simple script with a title and description. Always respond with valid JSON."
          },
          {
            role: "user",
            content: `Create a script for a ${duration}-second video about: ${prompt}. Return JSON with 'title' and 'description' fields.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      });

      return JSON.parse(completion.choices[0].message.content || '{}');
    } catch (error) {
      console.error('[SIMPLE VIDEO] Script generation error:', error);
      return {
        title: "Test Video",
        description: prompt
      };
    }
  }

  private async createTextVideo(title: string, description: string, duration: number): Promise<string> {
    const outputPath = join(this.outputDir, `video_${uuidv4()}.mp4`);
    
    return new Promise((resolve, reject) => {
      // Create a simple video with blue background - no text overlay for now
      const command = ffmpeg()
        .input('color=c=blue:s=1920x1080:d=' + duration)
        .inputFormat('lavfi')
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-preset fast'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('[SIMPLE VIDEO] FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress && progress.percent) {
            console.log('[SIMPLE VIDEO] Progress:', Math.round(progress.percent) + '%');
          }
        })
        .on('end', () => {
          console.log('[SIMPLE VIDEO] Video created successfully:', outputPath);
          console.log('[SIMPLE VIDEO] Title was:', title);
          console.log('[SIMPLE VIDEO] Description was:', description);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('[SIMPLE VIDEO] FFmpeg error:', err);
          reject(err);
        });

      command.run();
    });
  }
}