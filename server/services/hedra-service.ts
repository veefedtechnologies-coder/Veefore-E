class HedraService {
  private apiKey: string;
  private baseUrl = 'https://mercury.dev.hedra.com/api/v1';

  constructor() {
    this.apiKey = process.env.HEDRA_API_KEY || '';
  }

  async generateTalkingHead(imageUrl: string, audioPath: string): Promise<string> {
    try {
      console.log(`[HEDRA] Generating talking head avatar...`);
      
      // Step 1: Upload image
      const imageResponse = await fetch(`${this.baseUrl}/portrait`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: imageUrl,
        }),
      });

      if (!imageResponse.ok) {
        throw new Error(`Hedra image upload error: ${imageResponse.status}`);
      }

      const imageData = await imageResponse.json();
      const portraitId = imageData.portraitId;

      // Step 2: Upload audio
      const audioData = await fetch(audioPath);
      const audioBlob = await audioData.blob();
      
      const audioFormData = new FormData();
      audioFormData.append('file', audioBlob, 'voice.mp3');

      const audioResponse = await fetch(`${this.baseUrl}/audio`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: audioFormData,
      });

      if (!audioResponse.ok) {
        throw new Error(`Hedra audio upload error: ${audioResponse.status}`);
      }

      const audioUploadData = await audioResponse.json();
      const audioId = audioUploadData.audioId;

      // Step 3: Generate talking head video
      const generateResponse = await fetch(`${this.baseUrl}/characters`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portraitId: portraitId,
          audioId: audioId,
          aspectRatio: '1:1',
          videoLength: 'audio', // Use audio length
        }),
      });

      if (!generateResponse.ok) {
        throw new Error(`Hedra generation error: ${generateResponse.status}`);
      }

      const generateData = await generateResponse.json();
      const jobId = generateData.jobId;

      // Step 4: Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max wait time
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const statusResponse = await fetch(`${this.baseUrl}/characters/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Hedra status check error: ${statusResponse.status}`);
        }

        const statusData = await statusResponse.json();
        
        if (statusData.status === 'completed') {
          console.log(`[HEDRA] ✓ Talking head generated: ${statusData.videoUrl}`);
          return statusData.videoUrl;
        } else if (statusData.status === 'failed') {
          throw new Error('Hedra generation failed');
        }
        
        console.log(`[HEDRA] Status: ${statusData.status} (${attempts + 1}/${maxAttempts})`);
        attempts++;
      }

      throw new Error('Hedra generation timeout');
    } catch (error) {
      console.error('[HEDRA] Talking head generation error:', error);
      throw new Error('Failed to generate talking head with Hedra');
    }
  }

  async generateExpressiveAvatar(imageUrl: string, audioPath: string, emotion: string = 'neutral'): Promise<string> {
    try {
      console.log(`[HEDRA] Generating expressive avatar with ${emotion} emotion...`);
      
      const response = await fetch(`${this.baseUrl}/expressive`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: imageUrl,
          audioUrl: audioPath,
          emotion: emotion,
          intensity: 0.7,
          aspectRatio: '16:9',
        }),
      });

      if (!response.ok) {
        throw new Error(`Hedra expressive avatar error: ${response.status}`);
      }

      const data = await response.json();
      const jobId = data.jobId;

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const statusResponse = await fetch(`${this.baseUrl}/expressive/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });

        const statusData = await statusResponse.json();
        
        if (statusData.status === 'completed') {
          console.log(`[HEDRA] ✓ Expressive avatar generated: ${statusData.videoUrl}`);
          return statusData.videoUrl;
        } else if (statusData.status === 'failed') {
          throw new Error('Hedra expressive generation failed');
        }
        
        attempts++;
      }

      throw new Error('Hedra expressive generation timeout');
    } catch (error) {
      console.error('[HEDRA] Expressive avatar generation error:', error);
      throw new Error('Failed to generate expressive avatar');
    }
  }

  async getJobStatus(jobId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/characters/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Hedra status error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[HEDRA] Status check error:', error);
      return null;
    }
  }

  async listJobs(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/characters`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Hedra list jobs error: ${response.status}`);
      }

      const data = await response.json();
      return data.jobs || [];
    } catch (error) {
      console.error('[HEDRA] List jobs error:', error);
      return [];
    }
  }
}

export const hedraService = new HedraService();