import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface VideoScene {
  videoPath: string;
  audioPath?: string;
  duration: number;
  text?: string;
  transition?: 'fade' | 'slide' | 'wipe';
}

export class FFmpegService {
  private mediaDir: string;

  constructor(mediaDir: string = './media') {
    this.mediaDir = mediaDir;
    this.ensureMediaDirectory();
  }

  private ensureMediaDirectory() {
    if (!fs.existsSync(this.mediaDir)) {
      fs.mkdirSync(this.mediaDir, { recursive: true });
    }
  }

  async concatenateScenes(scenes: VideoScene[], outputPath: string): Promise<string> {
    console.log(`[FFMPEG] Concatenating ${scenes.length} scenes`);

    // Create input list file
    const listPath = path.join(this.mediaDir, 'scenes_list.txt');
    const listContent = scenes.map(scene => `file '${scene.videoPath}'`).join('\n');
    fs.writeFileSync(listPath, listContent);

    try {
      const command = `ffmpeg -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}" -y`;
      await execAsync(command);
      
      console.log(`[FFMPEG] Scenes concatenated to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[FFMPEG] Concatenation failed:', error);
      throw new Error(`Video concatenation failed: ${error}`);
    } finally {
      // Cleanup
      if (fs.existsSync(listPath)) {
        fs.unlinkSync(listPath);
      }
    }
  }

  async addAudioToVideo(videoPath: string, audioPath: string, outputPath: string): Promise<string> {
    console.log(`[FFMPEG] Adding audio to video`);

    try {
      const command = `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}" -y`;
      await execAsync(command);
      
      console.log(`[FFMPEG] Audio added to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[FFMPEG] Audio addition failed:', error);
      throw new Error(`Audio addition failed: ${error}`);
    }
  }

  async mixAudioTracks(voicePath: string, backgroundMusicPath: string, outputPath: string, voiceVolume: number = 1.0, musicVolume: number = 0.3): Promise<string> {
    console.log(`[FFMPEG] Mixing audio tracks`);

    try {
      const command = `ffmpeg -i "${voicePath}" -i "${backgroundMusicPath}" -filter_complex "[0:a]volume=${voiceVolume}[voice];[1:a]volume=${musicVolume}[music];[voice][music]amix=inputs=2:duration=first" "${outputPath}" -y`;
      await execAsync(command);
      
      console.log(`[FFMPEG] Audio mixed to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[FFMPEG] Audio mixing failed:', error);
      throw new Error(`Audio mixing failed: ${error}`);
    }
  }

  async addSubtitles(videoPath: string, subtitlePath: string, outputPath: string): Promise<string> {
    console.log(`[FFMPEG] Adding subtitles to video`);

    try {
      const command = `ffmpeg -i "${videoPath}" -vf "subtitles=${subtitlePath}" "${outputPath}" -y`;
      await execAsync(command);
      
      console.log(`[FFMPEG] Subtitles added to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[FFMPEG] Subtitle addition failed:', error);
      throw new Error(`Subtitle addition failed: ${error}`);
    }
  }

  async addTextOverlay(videoPath: string, text: string, outputPath: string, options: {
    x?: number;
    y?: number;
    fontSize?: number;
    fontColor?: string;
    startTime?: number;
    duration?: number;
  } = {}): Promise<string> {
    console.log(`[FFMPEG] Adding text overlay: ${text}`);

    const {
      x = 50,
      y = 50,
      fontSize = 24,
      fontColor = 'white',
      startTime = 0,
      duration = 5
    } = options;

    try {
      const enableClause = startTime > 0 || duration < Infinity 
        ? `:enable='between(t,${startTime},${startTime + duration})'`
        : '';

      const command = `ffmpeg -i "${videoPath}" -vf "drawtext=text='${text}':x=${x}:y=${y}:fontsize=${fontSize}:fontcolor=${fontColor}${enableClause}" "${outputPath}" -y`;
      await execAsync(command);
      
      console.log(`[FFMPEG] Text overlay added to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[FFMPEG] Text overlay failed:', error);
      throw new Error(`Text overlay failed: ${error}`);
    }
  }

  async addAvatarOverlay(baseVideoPath: string, avatarVideoPath: string, outputPath: string, position: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  }): Promise<string> {
    console.log(`[FFMPEG] Adding avatar overlay`);

    const { x, y, width = 200, height = 200 } = position;

    try {
      const command = `ffmpeg -i "${baseVideoPath}" -i "${avatarVideoPath}" -filter_complex "[1:v]scale=${width}:${height}[avatar];[0:v][avatar]overlay=${x}:${y}" "${outputPath}" -y`;
      await execAsync(command);
      
      console.log(`[FFMPEG] Avatar overlay added to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[FFMPEG] Avatar overlay failed:', error);
      throw new Error(`Avatar overlay failed: ${error}`);
    }
  }

  async addTransition(video1Path: string, video2Path: string, outputPath: string, transition: 'fade' | 'slide' | 'wipe' = 'fade', duration: number = 1): Promise<string> {
    console.log(`[FFMPEG] Adding ${transition} transition`);

    try {
      let filterComplex: string;
      
      switch (transition) {
        case 'fade':
          filterComplex = `[0][1]xfade=transition=fade:duration=${duration}:offset=4`;
          break;
        case 'slide':
          filterComplex = `[0][1]xfade=transition=slideleft:duration=${duration}:offset=4`;
          break;
        case 'wipe':
          filterComplex = `[0][1]xfade=transition=wiperight:duration=${duration}:offset=4`;
          break;
        default:
          filterComplex = `[0][1]xfade=transition=fade:duration=${duration}:offset=4`;
      }

      const command = `ffmpeg -i "${video1Path}" -i "${video2Path}" -filter_complex "${filterComplex}" "${outputPath}" -y`;
      await execAsync(command);
      
      console.log(`[FFMPEG] Transition added to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[FFMPEG] Transition failed:', error);
      throw new Error(`Transition failed: ${error}`);
    }
  }

  async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
  }> {
    try {
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
      const { stdout } = await execAsync(command);
      const info = JSON.parse(stdout);
      
      const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
      
      return {
        duration: parseFloat(info.format.duration),
        width: videoStream.width,
        height: videoStream.height,
        fps: videoStream.r_frame_rate.includes('/') ? (parseInt(videoStream.r_frame_rate.split('/')[0]) / parseInt(videoStream.r_frame_rate.split('/')[1])) : parseFloat(videoStream.r_frame_rate) // e.g., "30/1" -> 30
      };
    } catch (error) {
      console.error('[FFMPEG] Failed to get video info:', error);
      throw new Error(`Failed to get video info: ${error}`);
    }
  }

  async resizeVideo(inputPath: string, outputPath: string, width: number, height: number): Promise<string> {
    console.log(`[FFMPEG] Resizing video to ${width}x${height}`);

    try {
      const command = `ffmpeg -i "${inputPath}" -vf "scale=${width}:${height}" "${outputPath}" -y`;
      await execAsync(command);
      
      console.log(`[FFMPEG] Video resized to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[FFMPEG] Video resize failed:', error);
      throw new Error(`Video resize failed: ${error}`);
    }
  }
}

export const ffmpegService = new FFmpegService();