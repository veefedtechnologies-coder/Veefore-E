class RunwayService {
  private apiKey: string;
  private baseUrl = 'https://api.dev.runwayml.com/v1';

  constructor() {
    this.apiKey = process.env.RUNWAY_API_KEY || '';
  }

  async generateVideoFromImage(imageUrl: string, textPrompt: string): Promise<string> {
    try {
      console.log(`[RUNWAY] Generating video from image: ${textPrompt.substring(0, 50)}...`);
      
      // Step 1: Create generation task
      const response = await fetch(`${this.baseUrl}/image_to_video`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          promptImage: imageUrl,
          model: 'gen2',
          textPrompt: textPrompt,
          watermark: false,
          enhance: true,
          upscale: false,
          interpolate: false,
          seed: Math.floor(Math.random() * 1000000),
          aspectRatio: '16:9',
          duration: 4, // 4 seconds
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Runway API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const taskId = data.id;

      console.log(`[RUNWAY] Task created: ${taskId}`);

      // Step 2: Poll for completion
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max wait time
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const statusResponse = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Runway status check error: ${statusResponse.status}`);
        }

        const statusData = await statusResponse.json();
        
        console.log(`[RUNWAY] Status: ${statusData.status} (${attempts + 1}/${maxAttempts})`);
        
        if (statusData.status === 'SUCCEEDED') {
          const videoUrl = statusData.output?.[0];
          if (!videoUrl) {
            throw new Error('No video URL in Runway response');
          }
          console.log(`[RUNWAY] ✓ Video generated: ${videoUrl}`);
          return videoUrl;
        } else if (statusData.status === 'FAILED') {
          throw new Error(`Runway generation failed: ${statusData.failure_reason || 'Unknown error'}`);
        } else if (statusData.status === 'CANCELLED') {
          throw new Error('Runway generation was cancelled');
        }
        
        attempts++;
      }

      throw new Error('Runway generation timeout');
    } catch (error) {
      console.error('[RUNWAY] Video generation error:', error);
      throw new Error('Failed to generate video with Runway');
    }
  }

  async generateVideoFromText(textPrompt: string): Promise<string> {
    try {
      console.log(`[RUNWAY] Generating video from text: ${textPrompt.substring(0, 50)}...`);
      
      const response = await fetch(`${this.baseUrl}/text_to_video`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gen2',
          textPrompt: textPrompt,
          watermark: false,
          enhance: true,
          duration: 4,
          aspectRatio: '16:9',
          seed: Math.floor(Math.random() * 1000000),
        }),
      });

      if (!response.ok) {
        throw new Error(`Runway text-to-video error: ${response.status}`);
      }

      const data = await response.json();
      const taskId = data.id;

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 120;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const statusResponse = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });

        const statusData = await statusResponse.json();
        
        if (statusData.status === 'SUCCEEDED') {
          const videoUrl = statusData.output?.[0];
          console.log(`[RUNWAY] ✓ Text-to-video generated: ${videoUrl}`);
          return videoUrl;
        } else if (statusData.status === 'FAILED') {
          throw new Error(`Runway text-to-video failed: ${statusData.failure_reason}`);
        }
        
        attempts++;
      }

      throw new Error('Runway text-to-video timeout');
    } catch (error) {
      console.error('[RUNWAY] Text-to-video generation error:', error);
      throw new Error('Failed to generate video from text');
    }
  }

  async extendVideo(videoUrl: string, additionalDuration: number = 4): Promise<string> {
    try {
      console.log(`[RUNWAY] Extending video by ${additionalDuration} seconds...`);
      
      const response = await fetch(`${this.baseUrl}/extend_video`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gen2',
          inputVideo: videoUrl,
          duration: additionalDuration,
        }),
      });

      if (!response.ok) {
        throw new Error(`Runway extend video error: ${response.status}`);
      }

      const data = await response.json();
      const taskId = data.id;

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 120;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const statusResponse = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });

        const statusData = await statusResponse.json();
        
        if (statusData.status === 'SUCCEEDED') {
          const extendedVideoUrl = statusData.output?.[0];
          console.log(`[RUNWAY] ✓ Video extended: ${extendedVideoUrl}`);
          return extendedVideoUrl;
        } else if (statusData.status === 'FAILED') {
          throw new Error(`Runway extend failed: ${statusData.failure_reason}`);
        }
        
        attempts++;
      }

      throw new Error('Runway extend timeout');
    } catch (error) {
      console.error('[RUNWAY] Video extension error:', error);
      throw new Error('Failed to extend video');
    }
  }

  async getTaskStatus(taskId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Runway status error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[RUNWAY] Status check error:', error);
      return null;
    }
  }

  async listTasks(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Runway list tasks error: ${response.status}`);
      }

      const data = await response.json();
      return data.tasks || [];
    } catch (error) {
      console.error('[RUNWAY] List tasks error:', error);
      return [];
    }
  }
}

export const runwayService = new RunwayService();
export { RunwayService };