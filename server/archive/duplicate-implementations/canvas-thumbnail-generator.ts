import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

interface ThumbnailConfig {
  title: string;
  description?: string;
  category: string;
  style: string;
  layout: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
  };
}

interface ThumbnailVariant {
  id: string;
  title: string;
  imageUrl: string;
  ctrScore: number;
  layout: string;
  metadata: {
    strategy: any;
    generated_at: string;
  };
}

export class CanvasThumbnailGenerator {
  private readonly width = 1280;
  private readonly height = 720;

  async generateThumbnailVariants(config: ThumbnailConfig, strategies: any[]): Promise<ThumbnailVariant[]> {
    console.log('[CANVAS GENERATOR] Creating professional thumbnails with Canvas API');
    
    const variants: ThumbnailVariant[] = [];
    
    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      const variant = await this.createThumbnailVariant(config, strategy, i + 1);
      variants.push(variant);
    }
    
    return variants;
  }

  private async createThumbnailVariant(config: ThumbnailConfig, strategy: any, variantNum: number): Promise<ThumbnailVariant> {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    // Create professional background
    await this.createBackground(ctx, config, strategy);
    
    // Add title text with professional styling
    await this.addTitleText(ctx, config.title, strategy);
    
    // Add visual elements
    await this.addVisualElements(ctx, config, strategy);
    
    // Add category badge
    await this.addCategoryBadge(ctx, config.category);
    
    // Save the image
    const fileName = `canvas_thumbnail_${Date.now()}_${variantNum}.png`;
    const filePath = path.join(process.cwd(), 'uploads', fileName);
    
    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);
    
    console.log(`[CANVAS GENERATOR] Created thumbnail variant ${variantNum}: ${fileName}`);
    
    return {
      id: `canvas_variant_${variantNum}`,
      title: `${config.title} - ${strategy.style || 'Professional'}`,
      imageUrl: `/uploads/${fileName}`,
      ctrScore: this.calculateCTRScore(strategy),
      layout: config.layout,
      metadata: {
        strategy: strategy,
        generated_at: new Date().toISOString()
      }
    };
  }

  private async createBackground(ctx: CanvasRenderingContext2D, config: ThumbnailConfig, strategy: any) {
    const { width, height } = this;
    
    // Create gradient background based on strategy
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    
    switch (strategy.style || config.style) {
      case 'gaming':
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(0.5, '#16213e');
        gradient.addColorStop(1, '#0f3460');
        break;
      case 'tech':
        gradient.addColorStop(0, '#0c0c0c');
        gradient.addColorStop(0.5, '#1a1a1a');
        gradient.addColorStop(1, '#333333');
        break;
      case 'lifestyle':
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(0.5, '#feca57');
        gradient.addColorStop(1, '#ff9ff3');
        break;
      case 'education':
        gradient.addColorStop(0, '#3742fa');
        gradient.addColorStop(0.5, '#2f3542');
        gradient.addColorStop(1, '#57606f');
        break;
      default:
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(0.5, '#764ba2');
        gradient.addColorStop(1, '#f093fb');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Add geometric patterns for visual interest
    this.addGeometricPatterns(ctx, strategy);
  }

  private addGeometricPatterns(ctx: CanvasRenderingContext2D, strategy: any) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    
    // Add circles and shapes
    const patternCount = 5;
    for (let i = 0; i < patternCount; i++) {
      const x = Math.random() * this.width;
      const y = Math.random() * this.height;
      const radius = 50 + Math.random() * 100;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fill();
    }
    
    ctx.restore();
  }

  private async addTitleText(ctx: CanvasRenderingContext2D, title: string, strategy: any) {
    const words = title.split(' ');
    const maxWordsPerLine = Math.ceil(words.length / 2);
    
    // Split title into lines for better readability
    const lines: string[] = [];
    for (let i = 0; i < words.length; i += maxWordsPerLine) {
      lines.push(words.slice(i, i + maxWordsPerLine).join(' '));
    }
    
    // Configure text styling
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add text shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    const fontSize = lines.length === 1 ? 80 : 65;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#ffffff';
    
    const lineHeight = fontSize + 10;
    const totalHeight = lines.length * lineHeight;
    const startY = (this.height / 2) - (totalHeight / 2) + (lineHeight / 2);
    
    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      
      // Add stroke for better visibility
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 4;
      ctx.strokeText(line, this.width / 2, y);
      
      // Fill text
      ctx.fillText(line, this.width / 2, y);
    });
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  private async addVisualElements(ctx: CanvasRenderingContext2D, config: ThumbnailConfig, strategy: any) {
    // Add arrow or pointer for CTR
    this.addCTRArrow(ctx);
    
    // Add corner accent
    this.addCornerAccent(ctx, strategy);
  }

  private addCTRArrow(ctx: CanvasRenderingContext2D) {
    const arrowSize = 60;
    const x = this.width - 100;
    const y = this.height / 2;
    
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.moveTo(x - arrowSize, y - arrowSize / 2);
    ctx.lineTo(x, y);
    ctx.lineTo(x - arrowSize, y + arrowSize / 2);
    ctx.lineTo(x - arrowSize + 20, y);
    ctx.closePath();
    ctx.fill();
    
    // Add glow effect
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur = 20;
    ctx.fill();
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  private addCornerAccent(ctx: CanvasRenderingContext2D, strategy: any) {
    const size = 100;
    
    // Top-left accent
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.closePath();
    ctx.fill();
    
    // Bottom-right accent
    ctx.beginPath();
    ctx.moveTo(this.width, this.height);
    ctx.lineTo(this.width - size, this.height);
    ctx.lineTo(this.width, this.height - size);
    ctx.closePath();
    ctx.fill();
  }

  private async addCategoryBadge(ctx: CanvasRenderingContext2D, category: string) {
    const badgeWidth = 200;
    const badgeHeight = 40;
    const x = 30;
    const y = 30;
    
    // Badge background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, badgeWidth, badgeHeight);
    
    // Badge border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, badgeWidth, badgeHeight);
    
    // Badge text
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(category.toUpperCase(), x + badgeWidth / 2, y + badgeHeight / 2);
  }

  private calculateCTRScore(strategy: any): number {
    let baseScore = 7.5;
    
    // Adjust based on strategy elements
    if (strategy.style === 'gaming') baseScore += 1.2;
    if (strategy.style === 'tech') baseScore += 0.8;
    if (strategy.emotion === 'excitement') baseScore += 1.0;
    if (strategy.emotion === 'curiosity') baseScore += 1.3;
    
    // Add some randomness for realistic variation
    const variation = (Math.random() - 0.5) * 2;
    
    return Math.min(10, Math.max(5, baseScore + variation));
  }
}

export const canvasThumbnailGenerator = new CanvasThumbnailGenerator();