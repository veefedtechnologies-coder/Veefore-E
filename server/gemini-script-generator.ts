import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiScriptGenerator {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private vertexAIEndpoint: string;
  private projectId: string;
  private location: string;

  constructor() {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is required for Gemini script generation');
    }
    
    // Initialize Vertex AI configuration
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'my-first-project';
    this.location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    this.vertexAIEndpoint = `https://aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models`;
    
    // Initialize both standard Gemini and Vertex AI
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    console.log('[GEMINI VERTEX] ✓ Vertex AI endpoint configured:', this.vertexAIEndpoint);
  }

  async generateVideoScript(params: {
    prompt: string;
    duration?: number;
    visualStyle?: string;
    tone?: string;
    voiceGender?: string;
    language?: string;
    accent?: string;
  }) {
    const {
      prompt,
      duration = 30,
      visualStyle = 'cinematic',
      tone = 'professional',
      voiceGender = 'Female',
      language = 'English',
      accent = 'American'
    } = params;

    const scriptPrompt = `Create a comprehensive video script for a ${duration}-second video based on this prompt: "${prompt}"

Requirements:
- Visual Style: ${visualStyle}
- Tone: ${tone}
- Voice Gender: ${voiceGender}
- Language: ${language}
- Accent: ${accent}
- Duration: ${duration} seconds

Please provide a detailed script with:
1. A compelling title
2. Scene-by-scene breakdown with:
   - Scene description
   - Visual elements
   - Narration text
   - Duration for each scene
3. Visual style guidelines
4. Recommended camera angles
5. Music and sound effects suggestions

Format the response as a structured JSON object with the following structure:
{
  "title": "Video Title",
  "totalDuration": ${duration},
  "scenes": [
    {
      "id": "scene_1",
      "description": "Scene description",
      "visualElements": "Visual elements",
      "narration": "Narration text",
      "duration": 5,
      "visualStyle": "${visualStyle}",
      "cameraAngle": "Wide shot",
      "musicSuggestion": "Upbeat background music"
    }
  ],
  "visualGuidelines": "Overall visual style guidelines",
  "recommendedMusic": "Music and sound effects suggestions"
}`;

        // Use Vertex AI with Google Cloud API key
        try {
          console.log('[GEMINI VERTEX] Attempting script generation with Vertex AI...');
          return await this.generateWithVertexAI(scriptPrompt, prompt, duration, visualStyle);
        } catch (vertexError) {
          const errorMessage = vertexError instanceof Error ? vertexError.message : 'Unknown vertex error occurred';
          console.error('[GEMINI VERTEX] Vertex AI failed, falling back to standard Gemini:', errorMessage);
          return await this.generateWithStandardGemini(scriptPrompt, prompt, duration, visualStyle);
        }
  }

  private async generateWithVertexAI(scriptPrompt: string, prompt: string, duration: number, visualStyle: string) {
    const requestBody = {
      contents: [{
        role: "user",
        parts: [{
          text: scriptPrompt
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    };

    const response = await fetch(`${this.vertexAIEndpoint}/gemini-2.5-flash:streamGenerateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Vertex AI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const text = data.candidates[0].content.parts[0].text;
      console.log('[GEMINI VERTEX] ✓ Script generated with Vertex AI');
      
      // Try to parse JSON from the response
      let scriptData;
      try {
        // Extract JSON from the response (sometimes Gemini includes extra text)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          scriptData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('[GEMINI VERTEX] JSON parsing failed:', parseError);
        // Fallback: create a basic script structure
        scriptData = this.createFallbackScript(prompt, duration, visualStyle);
      }
      
      return scriptData;
    } else {
      throw new Error('Invalid response from Vertex AI');
    }
  }

  private async generateWithStandardGemini(scriptPrompt: string, prompt: string, duration: number, visualStyle: string) {
    try {
      console.log('[GEMINI STANDARD] Generating video script with standard Gemini...');
      const result = await this.model.generateContent(scriptPrompt);
      const response = await result.response;
      const text = response.text();
      
      console.log('[GEMINI STANDARD] Raw response:', text);
      
      // Try to parse JSON from the response
      let scriptData;
      try {
        // Extract JSON from the response (sometimes Gemini includes extra text)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          scriptData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('[GEMINI STANDARD] JSON parsing failed:', parseError);
        // Fallback: create a basic script structure
        scriptData = this.createFallbackScript(prompt, duration, visualStyle);
      }
      
      console.log('[GEMINI STANDARD] ✓ Script generated successfully');
      return scriptData;
      
    } catch (error) {
      console.error('[GEMINI STANDARD] Script generation failed:', error);
      throw new Error(`Gemini script generation failed: ${error.message}`);
    }
  }

  private createFallbackScript(prompt: string, duration: number, visualStyle: string) {
    const sceneCount = Math.max(3, Math.floor(duration / 10));
    const scenesPerDuration = duration / sceneCount;
    
    const scenes = [];
    for (let i = 0; i < sceneCount; i++) {
      scenes.push({
        id: `scene_${i + 1}`,
        description: `Scene ${i + 1} related to: ${prompt}`,
        visualElements: `${visualStyle} visual elements for scene ${i + 1}`,
        narration: `Narration for scene ${i + 1} about ${prompt}`,
        duration: Math.round(scenesPerDuration),
        visualStyle: visualStyle,
        cameraAngle: i === 0 ? 'Wide shot' : i === sceneCount - 1 ? 'Close-up' : 'Medium shot',
        musicSuggestion: 'Background music matching the scene mood'
      });
    }
    
    return {
      title: `Video: ${prompt}`,
      totalDuration: duration,
      scenes,
      visualGuidelines: `Use ${visualStyle} style throughout the video`,
      recommendedMusic: 'Background music that matches the video tone'
    };
  }

  async regenerateScene(params: {
    originalPrompt: string;
    sceneId: string;
    visualStyle?: string;
    tone?: string;
    currentScript?: any;
  }) {
    const { originalPrompt, sceneId, visualStyle = 'cinematic', tone = 'professional', currentScript } = params;

    const regeneratePrompt = `Regenerate scene ${sceneId} for this video script about: "${originalPrompt}"

Current script context: ${JSON.stringify(currentScript, null, 2)}

Requirements:
- Visual Style: ${visualStyle}
- Tone: ${tone}
- Make it more engaging and detailed

Provide a JSON response with the updated scene:
{
  "id": "${sceneId}",
  "description": "Updated scene description",
  "visualElements": "Updated visual elements",
  "narration": "Updated narration text",
  "duration": 5,
  "visualStyle": "${visualStyle}",
  "cameraAngle": "Recommended camera angle",
  "musicSuggestion": "Music suggestion for this scene"
}`;

    try {
      console.log(`[GEMINI] Regenerating scene ${sceneId}...`);
      const result = await this.model.generateContent(regeneratePrompt);
      const response = await result.response;
      const text = response.text();
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const sceneData = JSON.parse(jsonMatch[0]);
        console.log(`[GEMINI] ✓ Scene ${sceneId} regenerated successfully`);
        return sceneData;
      } else {
        throw new Error('No JSON found in response');
      }
      
    } catch (error) {
      console.error(`[GEMINI] Scene regeneration failed:`, error);
      throw new Error(`Gemini scene regeneration failed: ${error.message}`);
    }
  }
}
