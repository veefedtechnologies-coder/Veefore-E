import sharp, { FormatEnum, ResizeOptions, Sharp } from 'sharp';
import path from 'path';
import { promises as fs } from 'fs';

export type ImageFormat = keyof FormatEnum;
export type ResizeMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export interface ResizeConfig {
  width?: number;
  height?: number;
  fit?: ResizeMode;
  withoutEnlargement?: boolean;
  background?: string | { r: number; g: number; b: number; alpha?: number };
}

export interface CompressionConfig {
  quality?: number;
  progressive?: boolean;
  lossless?: boolean;
  effort?: number;
}

export interface ThumbnailConfig {
  width: number;
  height: number;
  fit?: ResizeMode;
  quality?: number;
  format?: ImageFormat;
}

export interface ConversionConfig {
  format: ImageFormat;
  quality?: number;
  lossless?: boolean;
  progressive?: boolean;
}

export interface ProcessingResult {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
  size: number;
  metadata?: sharp.Metadata;
}

export interface BatchProcessingOptions {
  resize?: ResizeConfig;
  compress?: CompressionConfig;
  format?: ImageFormat;
  outputDir?: string;
}

export class ImageProcessingService {
  private readonly DEFAULT_QUALITY = 80;
  private readonly DEFAULT_THUMBNAIL_SIZE = 200;
  private readonly MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  private readonly SUPPORTED_FORMATS: ImageFormat[] = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'];

  private validateFormat(format: string): void {
    if (!this.SUPPORTED_FORMATS.includes(format as ImageFormat)) {
      throw new Error(
        `Unsupported image format: ${format}. Supported formats: ${this.SUPPORTED_FORMATS.join(', ')}`
      );
    }
  }

  private validateImageSize(buffer: Buffer): void {
    if (buffer.length > this.MAX_IMAGE_SIZE) {
      throw new Error(`Image size exceeds maximum allowed size of ${this.MAX_IMAGE_SIZE / 1024 / 1024}MB`);
    }
  }

  private createSharpInstance(input: Buffer | string): Sharp {
    if (typeof input === 'string') {
      return sharp(input);
    }
    this.validateImageSize(input);
    return sharp(input);
  }

  async getMetadata(input: Buffer | string): Promise<sharp.Metadata> {
    const instance = this.createSharpInstance(input);
    return await instance.metadata();
  }

  async resize(input: Buffer | string, config: ResizeConfig): Promise<ProcessingResult> {
    const instance = this.createSharpInstance(input);
    const resizeOptions: ResizeOptions = {
      width: config.width,
      height: config.height,
      fit: config.fit || 'cover',
      withoutEnlargement: config.withoutEnlargement ?? true,
      background: config.background || { r: 255, g: 255, b: 255, alpha: 1 }
    };
    const processed = instance.resize(resizeOptions);
    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();
    return {
      buffer,
      format: metadata.format || 'unknown',
      width: metadata.width || 0,
      height: metadata.height || 0,
      size: buffer.length,
      metadata
    };
  }

  async compress(input: Buffer | string, format: ImageFormat, config: CompressionConfig = {}): Promise<ProcessingResult> {
    this.validateFormat(format);
    const instance = this.createSharpInstance(input);
    const quality = config.quality ?? this.DEFAULT_QUALITY;
    let processed: Sharp;

    switch (format) {
      case 'jpeg':
        processed = instance.jpeg({ quality, progressive: config.progressive ?? true, mozjpeg: true });
        break;
      case 'png':
        processed = instance.png({ quality, compressionLevel: config.effort ?? 9, progressive: config.progressive ?? true });
        break;
      case 'webp':
        processed = instance.webp({ quality, lossless: config.lossless ?? false, effort: config.effort ?? 4 });
        break;
      case 'avif':
        processed = instance.avif({ quality, lossless: config.lossless ?? false, effort: config.effort ?? 4 });
        break;
      case 'tiff':
        processed = instance.tiff({ quality });
        break;
      case 'gif':
        processed = instance.gif();
        break;
      default:
        throw new Error(`Compression not supported for format: ${format}`);
    }

    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { buffer, format: metadata.format || format, width: metadata.width || 0, height: metadata.height || 0, size: buffer.length, metadata };
  }

  async convert(input: Buffer | string, config: ConversionConfig): Promise<ProcessingResult> {
    this.validateFormat(config.format);
    return await this.compress(input, config.format, { quality: config.quality, lossless: config.lossless, progressive: config.progressive });
  }

  async generateThumbnail(input: Buffer | string, config: ThumbnailConfig): Promise<ProcessingResult> {
    const instance = this.createSharpInstance(input);
    const resizeOptions: ResizeOptions = {
      width: config.width || this.DEFAULT_THUMBNAIL_SIZE,
      height: config.height || this.DEFAULT_THUMBNAIL_SIZE,
      fit: config.fit || 'cover',
      withoutEnlargement: false,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    };
    let processed = instance.resize(resizeOptions);
    if (config.format) {
      this.validateFormat(config.format);
      const quality = config.quality ?? this.DEFAULT_QUALITY;
      switch (config.format) {
        case 'jpeg':
          processed = processed.jpeg({ quality, progressive: true });
          break;
        case 'png':
          processed = processed.png({ quality });
          break;
        case 'webp':
          processed = processed.webp({ quality });
          break;
        default:
          processed = processed.toFormat(config.format);
      }
    }
    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { buffer, format: metadata.format || 'unknown', width: metadata.width || 0, height: metadata.height || 0, size: buffer.length, metadata };
  }

  async optimize(input: Buffer | string, targetFormat: ImageFormat = 'webp'): Promise<ProcessingResult> {
    this.validateFormat(targetFormat);
    const instance = this.createSharpInstance(input);
    const metadata = await instance.metadata();
    const maxDimension = 2048;
    let width = metadata.width;
    let height = metadata.height;

    if (width && height) {
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension);
          width = maxDimension;
        } else {
          width = Math.round((width / height) * maxDimension);
          height = maxDimension;
        }
      }
    }

    let processed = instance;
    if (width !== metadata.width || height !== metadata.height) {
      processed = processed.resize({ width, height, fit: 'inside', withoutEnlargement: true });
    }

    switch (targetFormat) {
      case 'jpeg':
        processed = processed.jpeg({ quality: 85, progressive: true, mozjpeg: true });
        break;
      case 'png':
        processed = processed.png({ quality: 80, compressionLevel: 9, progressive: true });
        break;
      case 'webp':
        processed = processed.webp({ quality: 85, effort: 6 });
        break;
      case 'avif':
        processed = processed.avif({ quality: 80, effort: 6 });
        break;
      default:
        processed = processed.toFormat(targetFormat);
    }

    const buffer = await processed.toBuffer();
    const finalMetadata = await sharp(buffer).metadata();
    return { buffer, format: finalMetadata.format || targetFormat, width: finalMetadata.width || 0, height: finalMetadata.height || 0, size: buffer.length, metadata: finalMetadata };
  }

  async generateMultipleThumbnails(input: Buffer | string, sizes: ThumbnailConfig[]): Promise<ProcessingResult[]> {
    return await Promise.all(sizes.map((config) => this.generateThumbnail(input, config)));
  }

  async crop(input: Buffer | string, width: number, height: number, left: number = 0, top: number = 0): Promise<ProcessingResult> {
    const instance = this.createSharpInstance(input);
    const processed = instance.extract({ width, height, left, top });
    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { buffer, format: metadata.format || 'unknown', width: metadata.width || 0, height: metadata.height || 0, size: buffer.length, metadata };
  }

  async rotate(input: Buffer | string, angle: number): Promise<ProcessingResult> {
    const instance = this.createSharpInstance(input);
    const processed = instance.rotate(angle);
    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { buffer, format: metadata.format || 'unknown', width: metadata.width || 0, height: metadata.height || 0, size: buffer.length, metadata };
  }

  async flip(input: Buffer | string, horizontal: boolean = false, vertical: boolean = false): Promise<ProcessingResult> {
    const instance = this.createSharpInstance(input);
    let processed = instance;
    if (horizontal) processed = processed.flop();
    if (vertical) processed = processed.flip();
    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { buffer, format: metadata.format || 'unknown', width: metadata.width || 0, height: metadata.height || 0, size: buffer.length, metadata };
  }

  async grayscale(input: Buffer | string): Promise<ProcessingResult> {
    const instance = this.createSharpInstance(input);
    const processed = instance.grayscale();
    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { buffer, format: metadata.format || 'unknown', width: metadata.width || 0, height: metadata.height || 0, size: buffer.length, metadata };
  }

  async adjust(input: Buffer | string, brightness?: number, contrast?: number, saturation?: number): Promise<ProcessingResult> {
    const instance = this.createSharpInstance(input);
    let processed = instance;
    if (brightness !== undefined && brightness !== 1.0) {
      processed = processed.modulate({ brightness });
    }
    if (saturation !== undefined && saturation !== 1.0) {
      processed = processed.modulate({ saturation });
    }
    if (contrast !== undefined && contrast !== 1.0) {
      processed = processed.linear(contrast, -(128 * contrast) + 128);
    }
    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { buffer, format: metadata.format || 'unknown', width: metadata.width || 0, height: metadata.height || 0, size: buffer.length, metadata };
  }

  async batchProcess(inputs: (Buffer | string)[], options: BatchProcessingOptions): Promise<ProcessingResult[]> {
    return await Promise.all(
      inputs.map(async (input) => {
        let processed: ProcessingResult | null = null;
        if (options.resize) {
          processed = await this.resize(input, options.resize);
          input = processed.buffer;
        }
        if (options.compress && options.format) {
          processed = await this.compress(input, options.format, options.compress);
        } else if (options.format) {
          processed = await this.convert(input, { format: options.format });
        }
        if (!processed) {
          const instance = this.createSharpInstance(input);
          const buffer = await instance.toBuffer();
          const metadata = await instance.metadata();
          processed = { buffer, format: metadata.format || 'unknown', width: metadata.width || 0, height: metadata.height || 0, size: buffer.length, metadata };
        }
        return processed;
      })
    );
  }

  async saveToFile(result: ProcessingResult, outputPath: string): Promise<string> {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, result.buffer);
    return outputPath;
  }

  getCompressionRatio(originalSize: number, processedSize: number): number {
    return Math.round(((originalSize - processedSize) / originalSize) * 100);
  }
}

export const imageProcessingService = new ImageProcessingService();
