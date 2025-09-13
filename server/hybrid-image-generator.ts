import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import axios from 'axios';

export class HybridImageGenerator {
  private geminiAI: GoogleGenerativeAI;
  private openai: OpenAI;
  private dalleGenerator: any;

  constructor() {
    // Initialize Gemini
    if (process.env.GOOGLE_API_KEY) {
      this.geminiAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      console.log('[HYBRID IMAGE] ✓ Gemini API initialized');
    } else {
      console.log('[HYBRID IMAGE] ⚠️ Gemini API key not found');
    }

    // Initialize OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log('[HYBRID IMAGE] ✓ OpenAI API initialized');
    } else {
      console.log('[HYBRID IMAGE] ⚠️ OpenAI API key not found');
    }

    // Import DALL-E generator
    this.initializeDalleGenerator();
  }

  private async initializeDalleGenerator() {
    try {
      const dalleModule = await import('./thumbnail-dalle-generator');
      this.dalleGenerator = dalleModule.generateCustomDalleThumbnail;
    } catch (error) {
      console.error('[HYBRID IMAGE] Failed to import DALL-E generator:', error);
    }
  }

  async generateImage(params: {
    prompt: string;
    style?: string;
    emotions?: string[];
    colors?: string[];
    layout?: string;
    fallbackToPlaceholder?: boolean;
  }) {
    const {
      prompt,
      style = 'cinematic',
      emotions = ['dramatic', 'engaging'],
      colors = ['vibrant', 'cinematic'],
      layout = 'wide-cinematic',
      fallbackToPlaceholder = true
    } = params;

    console.log('[HYBRID IMAGE] Generating image with prompt:', prompt);

    // STEP 1: Try Gemini 2.5 Flash first (primary method for both text and images)
    if (this.geminiAI) {
      try {
        console.log('[HYBRID IMAGE] 🎨 Attempting Gemini 2.5 Flash generation...');
        const geminiResult = await this.generateImageWithGemini25(prompt, style, emotions, colors);
        
        if (geminiResult && geminiResult.imageUrl) {
          console.log('[HYBRID IMAGE] ✅ Gemini 2.5 Flash generation successful');
          return {
            success: true,
            imageUrl: geminiResult.imageUrl,
            source: 'gemini-2.5-flash',
            prompt: prompt
          };
        }
      } catch (error) {
        console.error('[HYBRID IMAGE] ❌ Gemini 2.5 Flash generation failed:', error.message);
        console.log('[HYBRID IMAGE] 🔄 Falling back to Vertex AI...');
      }
    } else {
      console.log('[HYBRID IMAGE] ⚠️ Gemini 2.5 Flash not available, trying Vertex AI...');
    }

    // STEP 2: Try Vertex AI Imagen as fallback (if Gemini 2.5 Flash failed)
    if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CLOUD_PROJECT_ID) {
      try {
        console.log('[HYBRID IMAGE] 🎨 Attempting Vertex AI Imagen generation...');
        const vertexResult = await this.generateImageWithVertexAI(prompt, style, emotions, colors);
        
        if (vertexResult && vertexResult.imageUrl) {
          console.log('[HYBRID IMAGE] ✅ Vertex AI Imagen generation successful');
          return {
            success: true,
            imageUrl: vertexResult.imageUrl,
            source: 'vertex-ai-imagen',
            prompt: prompt
          };
        }
      } catch (error) {
        console.error('[HYBRID IMAGE] ❌ Vertex AI Imagen generation failed:', error.message);
        console.log('[HYBRID IMAGE] 🔄 Falling back to DALL-E...');
      }
    } else {
      console.log('[HYBRID IMAGE] ⚠️ Vertex AI not available, trying DALL-E...');
    }

    // STEP 3: Try OpenAI DALL-E as final fallback (if both Gemini and Vertex AI failed)
    if (this.openai && this.dalleGenerator) {
      try {
        console.log('[HYBRID IMAGE] 🎨 Attempting DALL-E generation...');
        const dalleResult = await this.dalleGenerator({
          title: prompt,
          style,
          emotions,
          colors,
          layout
        });
        
        if (dalleResult && dalleResult.imageUrl) {
          console.log('[HYBRID IMAGE] ✅ DALL-E generation successful');
          return {
            success: true,
            imageUrl: dalleResult.imageUrl,
            source: 'dalle',
            prompt: prompt
          };
        }
      } catch (error) {
        console.error('[HYBRID IMAGE] ❌ DALL-E generation failed:', error.message);
        
        // Check if it's a credit/quota issue
        if (error.message.includes('quota') || error.message.includes('credit') || error.message.includes('billing')) {
          console.log('[HYBRID IMAGE] 💳 DALL-E credits exhausted, using placeholder...');
        }
      }
    } else {
      console.log('[HYBRID IMAGE] ⚠️ DALL-E not available, using placeholder...');
    }

    // STEP 4: Fallback to placeholder images (if all AI services failed)
    if (fallbackToPlaceholder) {
      console.log('[HYBRID IMAGE] 🖼️ Using placeholder image as final fallback');
      return {
        success: true,
        imageUrl: this.generatePlaceholderImage(prompt, style),
        source: 'placeholder',
        prompt: prompt
      };
    }

    throw new Error('All image generation methods failed');
  }

  private async generateImageWithGemini25(prompt: string, style: string, emotions: string[], colors: string[]) {
    try {
      console.log('[HYBRID IMAGE] Attempting Gemini 2.5 Flash image generation...');
      
      // Create a comprehensive prompt for image generation
      const imagePrompt = `Create a ${style} image with the following description: ${prompt}. 
      Style: ${style}, Emotions: ${emotions.join(', ')}, Colors: ${colors.join(', ')}. 
      Make it high-quality, professional, and visually appealing. No text or words in the image.`;
      
      console.log('[HYBRID IMAGE] Gemini 2.5 Flash prompt:', imagePrompt);
      
      // Use Gemini 2.5 Flash for image generation
      const model = this.geminiAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      
      const result = await model.generateContent([
        {
          text: `Generate an image based on this description: ${imagePrompt}. 
          Please create a high-quality, professional image that matches the style and requirements. 
          The image should be visually appealing and suitable for a video thumbnail.`
        }
      ]);
      
      const response = await result.response;
      const content = response.candidates?.[0]?.content;
      
      if (content && content.parts) {
        // Look for image data in the response
        for (const part of content.parts) {
          if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
            // Convert base64 image data to data URL
            const imageData = part.inlineData.data;
            const mimeType = part.inlineData.mimeType;
            const dataUrl = `data:${mimeType};base64,${imageData}`;
            
            console.log('[HYBRID IMAGE] ✅ Gemini 2.5 Flash generated image successfully');
            return {
              success: true,
              imageUrl: dataUrl,
              source: 'gemini-2.5-flash',
              prompt: imagePrompt
            };
          }
        }
      }
      
      // If no image data found, try alternative approach
      console.log('[HYBRID IMAGE] No image data found in Gemini 2.5 Flash response, trying alternative...');
      return null;
      
    } catch (error) {
      console.error('[HYBRID IMAGE] Gemini 2.5 Flash image generation failed:', error);
      return null;
    }
  }

  private async generateImageWithGemini(prompt: string, style: string, emotions: string[], colors: string[]) {
        try {
          console.log('[HYBRID IMAGE] Attempting Gemini image generation with Vertex AI...');
          return await this.generateImageWithVertexAI(prompt, style, emotions, colors);
        } catch (vertexError) {
          console.error('[HYBRID IMAGE] Vertex AI failed, trying standard Gemini:', vertexError.message);
          return await this.generateImageWithStandardGemini(prompt, style, emotions, colors);
        }
  }

  private async generateImageWithVertexAI(prompt: string, style: string, emotions: string[], colors: string[]) {
    try {
      // Create a comprehensive prompt for image generation
      const imagePrompt = `Create a ${style} image with the following description: ${prompt}. 
      Style: ${style}, Emotions: ${emotions.join(', ')}, Colors: ${colors.join(', ')}. 
      Make it high-quality, professional, and visually appealing. No text or words in the image.`;
      
      console.log('[HYBRID IMAGE] Vertex AI Imagen prompt:', imagePrompt);
      
      // Use Vertex AI Imagen for image generation
      const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'veefore';
      const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
      const vertexAIEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`;
      
      console.log('[HYBRID IMAGE] Vertex AI Imagen endpoint:', vertexAIEndpoint);
      
      const requestBody = {
        instances: [{
          prompt: imagePrompt
        }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          safetyFilterLevel: "block_some",
          personGeneration: "allow_adult"
        }
      };

      const response = await fetch(vertexAIEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GOOGLE_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[HYBRID IMAGE] Vertex AI API error response:', errorText);
        throw new Error(`Vertex AI Imagen API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[HYBRID IMAGE] Vertex AI response:', JSON.stringify(data, null, 2));
      
      if (data.predictions && data.predictions.length > 0) {
        const prediction = data.predictions[0];
        if (prediction.bytesBase64Encoded) {
          // Convert base64 to data URL
          const imageData = `data:image/png;base64,${prediction.bytesBase64Encoded}`;
          console.log('[HYBRID IMAGE] ✅ Vertex AI Imagen generated image successfully');
          return {
            success: true,
            imageUrl: imageData,
            source: 'vertex-ai-imagen',
          prompt: imagePrompt
        };
      } else {
        throw new Error('No images generated by Vertex AI Imagen');
      }
      
    } catch (error) {
      console.error('[HYBRID IMAGE] Vertex AI Imagen generation failed:', error);
      throw error;
    }
  }

  private async generateImageWithStandardGemini(prompt: string, style: string, emotions: string[], colors: string[]) {
    try {
      // Use Gemini's Imagen model for image generation
      const model = this.geminiAI.getGenerativeModel({ model: "imagen-3.0-generate-001" });
      
      // Create a comprehensive prompt for image generation
      const imagePrompt = `Create a ${style} image with the following description: ${prompt}. 
      Style: ${style}, Emotions: ${emotions.join(', ')}, Colors: ${colors.join(', ')}. 
      Make it high-quality, professional, and visually appealing. No text or words in the image.`;
      
      console.log('[HYBRID IMAGE] Standard Gemini Imagen prompt:', imagePrompt);
      
      // Generate image using Gemini's Imagen
      const result = await model.generateContent(imagePrompt);
      const response = await result.response;
      
      // Check if the response contains image data
      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
        const content = response.candidates[0].content;
        
        // Look for image data in the response
        if (content.parts && content.parts.length > 0) {
          for (const part of content.parts) {
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
              // Convert base64 image data to data URL
              const imageData = part.inlineData.data;
              const mimeType = part.inlineData.mimeType;
              const dataUrl = `data:${mimeType};base64,${imageData}`;
              
              console.log('[HYBRID IMAGE] ✅ Standard Gemini Imagen generated image successfully');
              return {
                success: true,
                imageUrl: dataUrl,
                source: 'gemini',
                prompt: imagePrompt
              };
            }
          }
        }
      }
      
      // If no image data found, try alternative approach
      console.log('[HYBRID IMAGE] No image data found in standard Gemini response, trying alternative...');
      return null;
      
    } catch (error) {
      console.error('[HYBRID IMAGE] Standard Gemini Imagen generation failed:', error);
      
      // If the specific model fails, try with a different approach
      try {
        console.log('[HYBRID IMAGE] Trying alternative Gemini image generation...');
        
        // Use a different model or approach
        const model = this.geminiAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Since Gemini doesn't directly generate images, we'll use it to enhance prompts
        // and then fall back to placeholder
        const enhancedPrompt = await this.enhancePromptWithGemini(prompt, style, emotions, colors);
        
        console.log('[HYBRID IMAGE] Gemini enhanced prompt for fallback:', enhancedPrompt);
        return null; // Will trigger fallback to placeholder
        
      } catch (fallbackError) {
        console.error('[HYBRID IMAGE] Alternative Gemini approach also failed:', fallbackError);
        return null;
      }
    }
  }

  private async enhancePromptWithGemini(originalPrompt: string, style: string, emotions: string[], colors: string[]) {
    try {
      const model = this.geminiAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const enhancementPrompt = `Enhance this image generation prompt to be more specific and detailed:

Original prompt: "${originalPrompt}"
Style: ${style}
Emotions: ${emotions.join(', ')}
Colors: ${colors.join(', ')}

Create a detailed, specific prompt that will generate a high-quality ${style} image. Focus on:
- Visual details and composition
- Lighting and atmosphere
- Specific visual elements
- Professional photography terms
- Avoid any text or words in the image

Respond with only the enhanced prompt, no additional text.`;

      const result = await model.generateContent(enhancementPrompt);
      const response = await result.response;
      const enhancedPrompt = response.text().trim();
      
      console.log('[HYBRID IMAGE] Enhanced prompt:', enhancedPrompt);
      return enhancedPrompt;
      
    } catch (error) {
      console.error('[HYBRID IMAGE] Prompt enhancement failed:', error);
      return originalPrompt; // Return original if enhancement fails
    }
  }

  private generatePlaceholderImage(prompt: string, style: string) {
    // Generate a placeholder using a service like picsum.photos with different images based on prompt
    const seed = prompt.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    const width = 1280;
    const height = 720;
    const imageId = Math.abs(seed) % 1000; // Use seed to get consistent "random" image
    
    return `https://picsum.photos/seed/${imageId}/${width}/${height}`;
  }

  async generateMultipleImages(scenes: any[], options: any = {}) {
    console.log(`[HYBRID IMAGE] Generating ${scenes.length} images...`);
    
    const results = {};
    const promises = scenes.map(async (scene, index) => {
      try {
        console.log(`[HYBRID IMAGE] Generating image ${index + 1}/${scenes.length} for scene: ${scene.id}`);
        
        const imageResult = await this.generateImage({
          prompt: `${scene.description}. ${scene.visualElements || ''}. Style: ${scene.visualStyle || 'cinematic'}. Narration context: "${scene.narration || ''}"`,
          style: scene.visualStyle || 'cinematic',
          emotions: ['dramatic', 'engaging'],
          colors: ['vibrant', 'cinematic'],
          layout: 'wide-cinematic',
          ...options
        });
        
        results[scene.id] = imageResult.imageUrl;
        console.log(`[HYBRID IMAGE] ✓ Generated image for scene ${scene.id}`);
        
        return { sceneId: scene.id, success: true, imageUrl: imageResult.imageUrl, source: imageResult.source };
        
      } catch (error) {
        console.error(`[HYBRID IMAGE] Failed to generate image for scene ${scene.id}:`, error);
        return { sceneId: scene.id, success: false, error: error.message };
      }
    });
    
    await Promise.all(promises);
    
    console.log(`[HYBRID IMAGE] ✓ Generated ${Object.keys(results).length}/${scenes.length} images`);
    return results;
  }
}
