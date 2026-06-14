import { describe, it, expect, beforeAll } from 'vitest';
import { ImageProcessingService } from '../image-processing.service';
import sharp from 'sharp';

describe('ImageProcessingService', () => {
  let service: ImageProcessingService;
  let testImageBuffer: Buffer;

  beforeAll(async () => {
    service = new ImageProcessingService();

    // Create a simple test image (100x100 red square)
    testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
      .png()
      .toBuffer();
  });

  describe('getMetadata', () => {
    it('should extract image metadata correctly', async () => {
      const metadata = await service.getMetadata(testImageBuffer);

      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
      expect(metadata.format).toBe('png');
    });
  });

  describe('resize', () => {
    it('should resize image to specified dimensions', async () => {
      const result = await service.resize(testImageBuffer, {
        width: 50,
        height: 50,
        fit: 'cover'
      });

      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should not enlarge image when withoutEnlargement is true', async () => {
      const result = await service.resize(testImageBuffer, {
        width: 200,
        height: 200,
        withoutEnlargement: true
      });

      expect(result.width).toBeLessThanOrEqual(100);
      expect(result.height).toBeLessThanOrEqual(100);
    });
  });

  describe('compress', () => {
    it('should compress JPEG image', async () => {
      const result = await service.compress(testImageBuffer, 'jpeg', {
        quality: 50
      });

      expect(result.format).toBe('jpeg');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should compress WebP image', async () => {
      const result = await service.compress(testImageBuffer, 'webp', {
        quality: 80
      });

      expect(result.format).toBe('webp');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should throw error for unsupported format', async () => {
      await expect(
        service.compress(testImageBuffer, 'invalid' as any, {})
      ).rejects.toThrow('Unsupported image format');
    });
  });

  describe('convert', () => {
    it('should convert image to different format', async () => {
      const result = await service.convert(testImageBuffer, {
        format: 'webp',
        quality: 80
      });

      expect(result.format).toBe('webp');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('generateThumbnail', () => {
    it('should generate thumbnail with specified size', async () => {
      const result = await service.generateThumbnail(testImageBuffer, {
        width: 50,
        height: 50,
        quality: 80
      });

      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    });

    it('should generate thumbnail with format conversion', async () => {
      const result = await service.generateThumbnail(testImageBuffer, {
        width: 30,
        height: 30,
        format: 'jpeg',
        quality: 70
      });

      expect(result.width).toBe(30);
      expect(result.height).toBe(30);
      expect(result.format).toBe('jpeg');
    });
  });

  describe('optimize', () => {
    it('should optimize image for web delivery', async () => {
      const result = await service.optimize(testImageBuffer, 'webp');

      expect(result.format).toBe('webp');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should optimize image with default format', async () => {
      const result = await service.optimize(testImageBuffer);

      expect(result.format).toBe('webp');
    });
  });

  describe('generateMultipleThumbnails', () => {
    it('should generate multiple thumbnail sizes', async () => {
      const sizes = [
        { width: 50, height: 50 },
        { width: 100, height: 100 },
        { width: 200, height: 200 }
      ];

      const results = await service.generateMultipleThumbnails(
        testImageBuffer,
        sizes
      );

      expect(results).toHaveLength(3);
      expect(results[0].width).toBe(50);
      expect(results[1].width).toBe(100);
      expect(results[2].width).toBe(200); // Thumbnails allow enlargement by default
    });
  });

  describe('crop', () => {
    it('should crop image to specified dimensions', async () => {
      const result = await service.crop(testImageBuffer, 50, 50, 10, 10);

      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    });
  });

  describe('rotate', () => {
    it('should rotate image by specified angle', async () => {
      const result = await service.rotate(testImageBuffer, 90);

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('flip', () => {
    it('should flip image horizontally', async () => {
      const result = await service.flip(testImageBuffer, true, false);

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should flip image vertically', async () => {
      const result = await service.flip(testImageBuffer, false, true);

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });
  });

  describe('grayscale', () => {
    it('should convert image to grayscale', async () => {
      const result = await service.grayscale(testImageBuffer);

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('adjust', () => {
    it('should adjust image brightness', async () => {
      const result = await service.adjust(testImageBuffer, 1.5);

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should adjust image saturation', async () => {
      const result = await service.adjust(
        testImageBuffer,
        undefined,
        undefined,
        0.5
      );

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });
  });

  describe('batchProcess', () => {
    it('should process multiple images with same settings', async () => {
      const inputs = [testImageBuffer, testImageBuffer, testImageBuffer];

      const results = await service.batchProcess(inputs, {
        resize: { width: 50, height: 50 },
        format: 'jpeg',
        compress: { quality: 80 }
      });

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.width).toBe(50);
        expect(result.height).toBe(50);
        expect(result.format).toBe('jpeg');
      });
    });
  });

  describe('getCompressionRatio', () => {
    it('should calculate compression ratio correctly', () => {
      const ratio = service.getCompressionRatio(1000, 500);
      expect(ratio).toBe(50);
    });

    it('should return 0 when no compression occurred', () => {
      const ratio = service.getCompressionRatio(1000, 1000);
      expect(ratio).toBe(0);
    });
  });
});
