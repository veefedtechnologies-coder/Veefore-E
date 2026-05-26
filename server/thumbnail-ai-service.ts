import { getOpenAIClient, isOpenAIAvailable } from './openai-client';
import { IStorage } from './storage';

export interface ThumbnailRequest {
  title: string;
  description?: string;
  category: string;
  imageUrl?: string;
  style?: 'auto' | 'manual';
}

export interface ThumbnailDesignData {
  titles: string[];
  ctas: string[];
  fonts: string[];
  colors: {
    background: string;
    title: string;
    cta: string;
  };
  style: string;
  emotion: string;
  hooks: string[];
  placement: string;
}

export interface TrendingThumbnailData {
  matched_trend_thumbnail: string;
  layout_style: string;
  visual_motif: string;
  emoji: string[];
  filters: string[];
}

export interface ThumbnailVariant {
  id: string;
  title: string;
  imageUrl: string;
  ctrScore: number;
  layout: string;
  metadata: any;
}

export class ThumbnailAIService {
  constructor(private storage: IStorage) {}

  /**
   * STAGE 2: GPT-4 Prompt Engine
   * Generates viral thumbnail strategy based on user input
   */
  async generateThumbnailStrategy(request: ThumbnailRequest): Promise<ThumbnailDesignData> {
    try {
      console.log('[THUMBNAIL AI] Generating strategy for:', request.title);
      console.log('[THUMBNAIL AI] OpenAI API key configured:', !!process.env.OPENAI_API_KEY);

      const prompt = `You are a viral video thumbnail strategist. Based on the following inputs:
- Title: ${request.title}
- Description: ${request.description || 'Not provided'}
- Category: ${request.category}

Return in JSON format:
1. 3 Short attention-grabbing thumbnail texts (<6 words)
2. 2 CTA badge texts
3. Suggested font families and font styles
4. Suggested color palettes (background, title, CTA)
5. Visual style tag (e.g. luxury, chaos, mystery)
6. Emotion type (e.g. shock, success, sadness, urgency)
7. Hook keyword suggestions (e.g. SECRET, EXPOSED)
8. Placement suggestions (e.g. left-face, right-text, top-badge)

Respond with ONLY valid JSON in this exact format:
{
  "titles": ["Title 1", "Title 2", "Title 3"],
  "ctas": ["CTA 1", "CTA 2"],
  "fonts": ["Font 1", "Font 2"],
  "colors": {"background": "#000000", "title": "#ffffff", "cta": "#ff0000"},
  "style": "style_name",
  "emotion": "emotion_name",
  "hooks": ["HOOK1", "HOOK2", "HOOK3"],
  "placement": "placement_description"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8,
      });

      const designData = JSON.parse(response.choices[0].message.content || '{}');
      console.log('[THUMBNAIL AI] Generated strategy:', designData);
      
      return designData;
    } catch (error) {
      console.error('[THUMBNAIL AI] Strategy generation failed:', error);
      // Fallback strategy
      return this.getFallbackStrategy(request);
    }
  }

  /**
   * STAGE 2: Vision-to-Design Match (Style AI + Trending Sync)
   * Analyzes trending thumbnails and matches with user content
   */
  async analyzeTrendingThumbnails(request: ThumbnailRequest): Promise<TrendingThumbnailData> {
    try {
      console.log('[THUMBNAIL AI] Analyzing trending thumbnails for category:', request.category);

      // For now, we'll use GPT-4 to simulate trending analysis
      // In production, this would scrape YouTube/Instagram trending thumbnails
      const prompt = `You are a trending thumbnail analyzer. For the category "${request.category}" and title "${request.title}", 
provide trending design insights in JSON format:

{
  "matched_trend_thumbnail": "https://example.com/trending-thumbnail.jpg",
  "layout_style": "Z-pattern-left-face",
  "visual_motif": "zoomed face + glow + red stroke",
  "emoji": ["🔥", "😱"],
  "filters": ["vibrance", "warm_tone"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const trendData = JSON.parse(response.choices[0].message.content || '{}');
      console.log('[THUMBNAIL AI] Trending analysis:', trendData);
      
      return trendData;
    } catch (error) {
      console.error('[THUMBNAIL AI] Trending analysis failed:', error);
      return this.getFallbackTrendData();
    }
  }

  /**
   * STAGE 3: Layout & Variant Generator
   * Creates multiple thumbnail variants with different layouts
   */
  async generateThumbnailVariants(
    request: ThumbnailRequest,
    designData: ThumbnailDesignData,
    trendData: TrendingThumbnailData
  ): Promise<ThumbnailVariant[]> {
    console.log('[THUMBNAIL AI] OPTIMIZED: Generating 1 AI thumbnail + 4 programmatic variations');

    const variants: ThumbnailVariant[] = [];
    const layouts = [
      'AI Generated Master',
      'Color Shift Variant',
      'Warm Tone Variant', 
      'High Contrast Variant',
      'Cool Tone Variant'
    ];

    // Step 1: Generate only 1 AI thumbnail (the base)
    const baseImageUrl = await this.generateThumbnailImage(request, designData, layouts[0]);
    
    // Step 2: Create base variant
    const baseVariant: ThumbnailVariant = {
      id: `variant_1`,
      title: layouts[0],
      imageUrl: baseImageUrl,
      ctrScore: this.calculateCTRScore(designData, trendData, layouts[0]),
      layout: layouts[0],
      metadata: {
        designData,
        trendData,
        layout: layouts[0],
        colors: designData.colors,
        fonts: designData.fonts[0] || 'Arial',
        emotion: designData.emotion,
        hooks: designData.hooks
      }
    };
    variants.push(baseVariant);

    // Step 3: Create 4 programmatic variations from the base image
    for (let i = 1; i < 5; i++) {
      const programmaticVariant = await this.createImageVariation(baseImageUrl, layouts[i], i + 1);
      const variant: ThumbnailVariant = {
        id: `variant_${i + 1}`,
        title: layouts[i],
        imageUrl: programmaticVariant.imageUrl,
        ctrScore: Math.max(baseVariant.ctrScore - (i * 0.5), 60),
        layout: layouts[i],
        metadata: {
          designData,
          trendData,
          layout: layouts[i],
          colors: designData.colors,
          fonts: designData.fonts[0] || 'Arial',
          emotion: designData.emotion,
          hooks: designData.hooks,
          isVariation: true,
          baseVariantId: 'variant_1'
        }
      };
      variants.push(variant);
    }

    console.log('[THUMBNAIL AI] Generated', variants.length, 'variants (1 AI + 4 programmatic)');
    return variants;
  }

  /**
   * Create programmatic variations from base image using Sharp
   */
  private async createImageVariation(baseImageUrl: string, layout: string, variantId: number): Promise<{ imageUrl: string }> {
    try {
      const sharp = require('sharp');
      const fs = require('fs');
      const path = require('path');
      
      // Download base image if it's a URL
      let baseImageBuffer;
      if (baseImageUrl.startsWith('http')) {
        const response = await fetch(baseImageUrl);
        baseImageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        baseImageBuffer = fs.readFileSync(path.join(process.cwd(), baseImageUrl));
      }
      
      let modifiedBuffer = baseImageBuffer;
      
      // Apply different modifications based on layout type
      switch (layout) {
        case 'Color Shift Variant':
          modifiedBuffer = await sharp(baseImageBuffer)
            .modulate({
              hue: 25,
              saturation: 1.15,
              brightness: 1.05
            })
            .toBuffer();
          break;
          
        case 'Warm Tone Variant':
          modifiedBuffer = await sharp(baseImageBuffer)
            .modulate({
              hue: -15,
              saturation: 0.95,
              brightness: 1.08
            })
            .tint({ r: 255, g: 250, b: 235 })
            .toBuffer();
          break;
          
        case 'High Contrast Variant':
          modifiedBuffer = await sharp(baseImageBuffer)
            .modulate({
              saturation: 1.25,
              brightness: 1.02
            })
            .gamma(1.15)
            .toBuffer();
          break;
          
        case 'Cool Tone Variant':
          modifiedBuffer = await sharp(baseImageBuffer)
            .modulate({
              hue: 35,
              saturation: 1.1,
              brightness: 0.98
            })
            .tint({ r: 230, g: 245, b: 255 })
            .toBuffer();
          break;
      }
      
      // Save the modified image
      const filename = `thumbnail_ai_variation_${variantId}_${Date.now()}.jpg`;
      const filePath = path.join(process.cwd(), 'uploads', filename);
      
      // Ensure uploads directory exists
      if (!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      }
      
      fs.writeFileSync(filePath, modifiedBuffer);
      
      return { imageUrl: `/uploads/${filename}` };
      
    } catch (error) {
      console.error(`[THUMBNAIL AI] Variation ${variantId} failed:`, error);
      // Fallback: return base image URL
      return { imageUrl: baseImageUrl };
    }
  }

  /**
   * Generate actual thumbnail image using AI
   */
  private async generateThumbnailImage(
    request: ThumbnailRequest,
    designData: ThumbnailDesignData,
    layout: string
  ): Promise<string> {
    try {
      console.log('[THUMBNAIL AI] Generating real AI thumbnail with DALL-E 3');
      
      const imagePrompt = `Create a high-quality YouTube thumbnail (1280x720) with:
- Title: "${request.title}"
- Style: ${designData.style}
- Emotion: ${designData.emotion}
- Layout: ${layout}
- Colors: ${JSON.stringify(designData.colors)}
- Professional, viral-worthy design that stops scrolling
- Clear, readable text with strong contrast
- Engaging visual elements that match the ${request.category} category`;

      console.log('[THUMBNAIL AI] DALL-E 3 prompt:', imagePrompt);

      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: imagePrompt,
        n: 1,
        size: "1792x1024", // Closest to 1280x720 ratio
        quality: "hd",
        style: "vivid"
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL returned from DALL-E 3');
      }

      console.log('[THUMBNAIL AI] DALL-E 3 generation successful:', imageUrl);
      
      // Download and save the image locally to bypass CORS restrictions
      const imageFileName = `thumbnail_dalle_${Date.now()}.png`;
      const localImageUrl = await this.downloadAndSaveImage(imageUrl, imageFileName);
      
      return localImageUrl;
      
    } catch (error) {
      console.error('[THUMBNAIL AI] CRITICAL: Real image generation failed:', error);
      throw new Error(`AI thumbnail generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download and save DALL-E images locally to bypass CORS restrictions
   */
  private async downloadAndSaveImage(imageUrl: string, fileName: string): Promise<string> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      const fs = await import('fs');
      const path = await import('path');
      
      // Ensure uploads directory exists
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      // Save the image file
      const filePath = path.join(uploadsDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(buffer));
      
      console.log(`[THUMBNAIL AI] Image saved locally: ${fileName}`);
      
      // Return the local URL that our server can serve
      return `/uploads/${fileName}`;
      
    } catch (error) {
      console.error('[THUMBNAIL AI] Failed to download image:', error);
      throw new Error(`Failed to save thumbnail image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate CTR score based on design elements
   */
  private calculateCTRScore(
    designData: ThumbnailDesignData,
    trendData: TrendingThumbnailData,
    layout: string
  ): number {
    let score = 60; // Base score

    // Emotion impact
    const emotionBonus: { [key: string]: number } = {
      'shock': 15,
      'success': 12,
      'urgency': 14,
      'curiosity': 13,
      'luxury': 8
    };
    score += emotionBonus[designData.emotion] || 5;

    // Layout impact
    if (layout.includes('Face')) score += 8;
    if (layout.includes('Bold')) score += 6;
    if (layout.includes('CTA')) score += 7;

    // Hook keywords impact
    score += designData.hooks.length * 2;

    // Trending elements
    score += trendData.emoji.length * 1.5;
    
    // Cap at 95
    return Math.min(95, Math.round(score));
  }

  /**
   * Fallback strategy when API fails
   */
  private getFallbackStrategy(request: ThumbnailRequest): ThumbnailDesignData {
    return {
      titles: ["You Won't Believe", "SHOCKING Truth", "Secret Revealed"],
      ctas: ["WATCH NOW", "DISCOVER"],
      fonts: ["Arial Black", "Impact"],
      colors: {
        background: "#000000",
        title: "#ffffff",
        cta: "#ff0000"
      },
      style: "bold",
      emotion: "curiosity",
      hooks: ["SECRET", "REVEALED", "TRUTH"],
      placement: "center-focus"
    };
  }

  /**
   * Fallback trending data
   */
  private getFallbackTrendData(): TrendingThumbnailData {
    return {
      matched_trend_thumbnail: "https://picsum.photos/1280/720",
      layout_style: "face-left-text-right",
      visual_motif: "bold text + bright colors",
      emoji: ["🔥", "😱", "💯"],
      filters: ["saturation", "contrast"]
    };
  }

  /**
   * Save thumbnail project for user
   */
  async saveThumbnailProject(
    userId: string,
    workspaceId: string,
    projectData: {
      title: string;
      variants: ThumbnailVariant[];
      selectedVariant?: string;
    }
  ): Promise<string> {
    try {
      // This would be implemented based on your storage schema
      console.log('[THUMBNAIL AI] Saving project for user:', userId);
      
      // For now, return a mock project ID
      return `thumbnail_project_${Date.now()}`;
    } catch (error) {
      console.error('[THUMBNAIL AI] Failed to save project:', error);
      throw error;
    }
  }
}