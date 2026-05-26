import OpenAI from 'openai';

export interface Scene {
  id: string;
  narration: string;
  description: string;
  emotion: string;
  duration: number;
}

export interface ScriptResponse {
  title: string;
  scenes: Scene[];
  totalDuration: number;
}

export interface MotionEngineDecision {
  engine: 'runway' | 'animatediff';
  reason: string;
  confidence: number;
}

class OpenAIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateScript(params: {
    prompt: string;
    duration: number;
    visualStyle: string;
    tone: string;
  }): Promise<ScriptResponse> {
    const { prompt, duration, visualStyle, tone } = params;
    
    // Calculate number of scenes based on duration (4-8 seconds per scene)
    const scenesCount = Math.max(2, Math.min(8, Math.ceil(duration / 6)));
    const avgSceneDuration = duration / scenesCount;

    const systemPrompt = `You are an expert video script writer and director. Create engaging, professional video scripts that are perfect for AI video generation.

IMPORTANT RULES:
- Create exactly ${scenesCount} scenes for a ${duration}-second video
- Each scene should be ${Math.floor(avgSceneDuration)}-${Math.ceil(avgSceneDuration)} seconds long
- Write clear, specific visual descriptions for AI image generation
- Use ${tone} tone throughout
- Match ${visualStyle} visual style
- Keep narration natural and engaging
- Ensure scenes flow logically and tell a complete story

Return ONLY valid JSON in this exact format:
{
  "title": "Video Title",
  "scenes": [
    {
      "id": "scene_1",
      "narration": "What the narrator says during this scene",
      "description": "Detailed visual description for AI image generation",
      "emotion": "positive|neutral|dramatic|energetic",
      "duration": number_in_seconds
    }
  ]
}`;

    const userPrompt = `Create a ${duration}-second video script about: ${prompt}

Requirements:
- Visual Style: ${visualStyle}
- Tone: ${tone}
- Exactly ${scenesCount} scenes
- Total duration: exactly ${duration} seconds
- Each scene description should be detailed enough for AI image generation
- Include specific details about setting, lighting, composition, and mood`;

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 2000,
      });

      const scriptData = JSON.parse(response.choices[0].message.content!);
      
      // Validate and adjust scene durations
      let totalDuration = 0;
      const adjustedScenes = scriptData.scenes.map((scene: any, index: number) => {
        const sceneDuration = Math.max(3, Math.min(10, scene.duration || avgSceneDuration));
        totalDuration += sceneDuration;
        
        return {
          id: scene.id || `scene_${index + 1}`,
          narration: scene.narration,
          description: scene.description,
          emotion: scene.emotion || 'neutral',
          duration: sceneDuration,
        };
      });

      // Adjust total duration to match target
      if (Math.abs(totalDuration - duration) > 2) {
        const adjustment = (duration - totalDuration) / adjustedScenes.length;
        adjustedScenes.forEach(scene => {
          scene.duration = Math.max(3, scene.duration + adjustment);
        });
      }

      return {
        title: scriptData.title || 'AI Generated Video',
        scenes: adjustedScenes,
        totalDuration: adjustedScenes.reduce((sum, scene) => sum + scene.duration, 0),
      };
    } catch (error) {
      console.error('[OPENAI] Script generation error:', error);
      throw new Error('Failed to generate video script');
    }
  }

  async analyzeMotionEngine(scenes: Scene[], userCredits: number): Promise<MotionEngineDecision> {
    try {
      const systemPrompt = `You are an expert AI video production advisor. Analyze scenes and recommend the best motion engine based on content complexity and user budget.

MOTION ENGINES:
- AnimateDiff: Good for simple motions, basic animations, lower cost (5 credits per scene)
- Runway Gen-2: Best for complex motions, realistic movements, higher cost (15 credits per scene)

Consider:
- Scene complexity (simple vs complex motion)
- Visual style requirements
- User's available credits: ${userCredits}
- Motion requirements in scene descriptions

Return ONLY valid JSON:
{
  "engine": "runway" | "animatediff",
  "reason": "Brief explanation",
  "confidence": 0.0-1.0
}`;

      const userPrompt = `Analyze these ${scenes.length} scenes and recommend the best motion engine:

Scenes:
${scenes.map((scene, i) => `Scene ${i + 1}: ${scene.description}`).join('\n')}

User has ${userCredits} credits available.
AnimateDiff cost: ${scenes.length * 5} credits total
Runway cost: ${scenes.length * 15} credits total`;

      const response = await this.client.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 500,
      });

      return JSON.parse(response.choices[0].message.content!);
    } catch (error) {
      console.error('[OPENAI] Motion engine analysis error:', error);
      // Fallback decision based on credits
      if (userCredits >= scenes.length * 15) {
        return {
          engine: 'runway',
          reason: 'Sufficient credits for premium quality',
          confidence: 0.7
        };
      } else {
        return {
          engine: 'animatediff',
          reason: 'Budget-friendly option for good quality',
          confidence: 0.8
        };
      }
    }
  }

  async enhanceImagePrompt(description: string, visualStyle: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: `Enhance image prompts for AI generation. Add specific details about lighting, composition, camera angles, and ${visualStyle} style. Keep prompts under 300 characters. Focus on visual elements only.`
          },
          {
            role: "user",
            content: `Enhance this prompt for ${visualStyle} style: ${description}`
          }
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      return response.choices[0].message.content!.trim();
    } catch (error) {
      console.error('[OPENAI] Image prompt enhancement error:', error);
      return description; // Return original if enhancement fails
    }
  }
}

export const openaiService = new OpenAIService();