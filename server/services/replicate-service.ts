import Replicate from 'replicate';

class ReplicateService {
  private client: Replicate;

  constructor() {
    this.client = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateImage(description: string, style: string = 'cinematic'): Promise<string> {
    try {
      console.log(`[REPLICATE] Generating image with SDXL: ${description.substring(0, 50)}...`);
      
      // Style-specific prompts
      const stylePrompts = {
        cinematic: 'cinematic lighting, film grain, dramatic composition, professional photography',
        realistic: 'photorealistic, high resolution, detailed, natural lighting',
        animated: 'animation style, vibrant colors, stylized, cartoon-like',
        artistic: 'artistic interpretation, painterly style, creative composition',
        minimalist: 'clean composition, minimalist design, simple background, elegant'
      };
      
      const stylePrompt = stylePrompts[style as keyof typeof stylePrompts] || stylePrompts.cinematic;
      const fullPrompt = `${description}, ${stylePrompt}, high quality, 4K resolution`;
      
      const output = await this.client.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: fullPrompt,
            negative_prompt: "blurry, low quality, distorted, text, watermark, signature, logo, username, low resolution, worst quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
            width: 1024,
            height: 1024,
            num_outputs: 1,
            scheduler: "DPMSolverMultistep",
            num_inference_steps: 30,
            guidance_scale: 7.5,
            seed: Math.floor(Math.random() * 1000000),
          }
        }
      ) as string[];

      const imageUrl = output[0];
      console.log(`[REPLICATE] ✓ SDXL image generated: ${imageUrl}`);
      return imageUrl;
    } catch (error) {
      console.error('[REPLICATE] SDXL image generation error:', error);
      throw new Error('Failed to generate image with SDXL');
    }
  }

  async generateAnimatedVideo(imageUrl: string, description: string): Promise<string> {
    try {
      console.log(`[REPLICATE] Generating video with AnimateDiff: ${description.substring(0, 50)}...`);
      
      const output = await this.client.run(
        "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb1a4919c746077dc4589434d17a76b83b5caca4dd",
        {
          input: {
            input_image: imageUrl,
            conditioning_augmentation: 0.02,
            decoding_t: 14,
            video_length: "14_frames_with_svd",
            sizing_strategy: "maintain_aspect_ratio",
            motion_bucket_id: 127,
            cond_aug: 0.02,
            seed: Math.floor(Math.random() * 1000000),
          }
        }
      ) as string;

      console.log(`[REPLICATE] ✓ AnimateDiff video generated: ${output}`);
      return output;
    } catch (error) {
      console.error('[REPLICATE] AnimateDiff video generation error:', error);
      throw new Error('Failed to generate video with AnimateDiff');
    }
  }

  async enhanceImage(imageUrl: string): Promise<string> {
    try {
      console.log(`[REPLICATE] Enhancing image quality with Real-ESRGAN...`);
      
      const output = await this.client.run(
        "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
        {
          input: {
            image: imageUrl,
            scale: 2,
            face_enhance: false,
          }
        }
      ) as string;

      console.log(`[REPLICATE] ✓ Image enhanced: ${output}`);
      return output;
    } catch (error) {
      console.error('[REPLICATE] Image enhancement error:', error);
      return imageUrl; // Return original if enhancement fails
    }
  }

  async upscaleVideo(videoUrl: string): Promise<string> {
    try {
      console.log(`[REPLICATE] Upscaling video with Real-ESRGAN Video...`);
      
      const output = await this.client.run(
        "fictionalsphere/real-esrgan-video:8cab096f0e7b1a5c37cb9c8deaa0ad6b7dd1b7ace9a6e7a3a27ae4f6c65c5b8a",
        {
          input: {
            video: videoUrl,
            scale: 2,
            version: "RealESRGAN_x4plus",
          }
        }
      ) as string;

      console.log(`[REPLICATE] ✓ Video upscaled: ${output}`);
      return output;
    } catch (error) {
      console.error('[REPLICATE] Video upscaling error:', error);
      return videoUrl; // Return original if upscaling fails
    }
  }

  async interpolateFrames(videoUrl: string): Promise<string> {
    try {
      console.log(`[REPLICATE] Interpolating frames with RIFE...`);
      
      const output = await this.client.run(
        "pollinations/rife-video-interpolation:5b70d1e72bfcf0d9f8d7e7f1c8a9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9",
        {
          input: {
            video: videoUrl,
            interpolation_factor: 2,
            model: "rife-v4.6",
          }
        }
      ) as string;

      console.log(`[REPLICATE] ✓ Frame interpolation complete: ${output}`);
      return output;
    } catch (error) {
      console.error('[REPLICATE] Frame interpolation error:', error);
      return videoUrl; // Return original if interpolation fails
    }
  }

  async generateMusicTrack(description: string, duration: number): Promise<string> {
    try {
      console.log(`[REPLICATE] Generating background music: ${description}`);
      
      const output = await this.client.run(
        "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
        {
          input: {
            prompt: `${description}, instrumental background music, no vocals, ${duration} seconds`,
            model_version: "stereo-large",
            output_format: "mp3",
            normalization_strategy: "peak",
            duration: duration,
          }
        }
      ) as string;

      console.log(`[REPLICATE] ✓ Background music generated: ${output}`);
      return output;
    } catch (error) {
      console.error('[REPLICATE] Music generation error:', error);
      throw new Error('Failed to generate background music');
    }
  }
}

export const replicateService = new ReplicateService();
export { ReplicateService };