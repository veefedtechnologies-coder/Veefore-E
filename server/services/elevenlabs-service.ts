import fs from 'fs';
import path from 'path';

export interface VoiceProfile {
  gender: 'male' | 'female' | 'neutral';
  language: string;
  accent: string;
  tone: string;
}

class ElevenLabsService {
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
  }

  private getVoiceId(profile: VoiceProfile): string {
    // Map voice profiles to ElevenLabs voice IDs
    const voiceMap = {
      // Female voices
      'female_english_american_conversational': 'EXAVITQu4vr4xnSDxMaL', // Bella
      'female_english_american_professional': 'MF3mGyEYCl7XYWbV9V6O', // Elli
      'female_english_british_conversational': '21m00Tcm4TlvDq8ikWAM', // Rachel
      'female_english_british_professional': 'AZnzlk1XvdvUeBnXmlld', // Domi
      
      // Male voices  
      'male_english_american_conversational': 'TxGEqnHWrfWFTfGW9XjX', // Josh
      'male_english_american_professional': 'VR6AewLTigWG4xSOukaG', // Arnold
      'male_english_british_conversational': 'onwK4e9ZLuTAKqWW03F9', // Daniel
      'male_english_british_professional': 'IKne3meq5aSn9XLyUdCD', // Charlie
      
      // Neutral/Other
      'neutral_english_american_conversational': 'pNInz6obpgDQGcFmaJgB', // Adam
      'neutral_english_british_conversational': 'Xb7hH8MSUJpSbSDYk0k2', // Alice
    };

    const key = `${profile.gender}_${profile.language.toLowerCase()}_${profile.accent.toLowerCase()}_${profile.tone}`;
    return voiceMap[key as keyof typeof voiceMap] || voiceMap['female_english_american_conversational'];
  }

  async generateVoice(text: string, profile: VoiceProfile, outputPath: string): Promise<void> {
    try {
      console.log(`[ELEVENLABS] Generating voice: ${text.substring(0, 50)}...`);
      
      const voiceId = this.getVoiceId(profile);
      
      const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
      }

      // Create directory if it doesn't exist
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save audio file
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, audioBuffer);

      console.log(`[ELEVENLABS] ✓ Voice generated: ${outputPath}`);
    } catch (error) {
      console.error('[ELEVENLABS] Voice generation error:', error);
      throw new Error('Failed to generate voice with ElevenLabs');
    }
  }

  async getVoices(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const data = await response.json();
      return data.voices;
    } catch (error) {
      console.error('[ELEVENLABS] Get voices error:', error);
      return [];
    }
  }

  async cloneVoice(name: string, audioFiles: string[]): Promise<string> {
    try {
      console.log(`[ELEVENLABS] Cloning voice: ${name}`);
      
      const formData = new FormData();
      formData.append('name', name);
      
      // Add audio files
      for (let i = 0; i < audioFiles.length; i++) {
        const audioData = fs.readFileSync(audioFiles[i]);
        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        formData.append('files', blob, `sample_${i}.mp3`);
      }

      const response = await fetch(`${this.baseUrl}/voices/add`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[ELEVENLABS] ✓ Voice cloned: ${data.voice_id}`);
      return data.voice_id;
    } catch (error) {
      console.error('[ELEVENLABS] Voice cloning error:', error);
      throw new Error('Failed to clone voice');
    }
  }

  async getUsage(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[ELEVENLABS] Usage check error:', error);
      return null;
    }
  }
}

export const elevenLabsService = new ElevenLabsService();
export { ElevenLabsService };