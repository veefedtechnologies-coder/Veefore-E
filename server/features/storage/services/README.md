# Storage Services

Comprehensive storage services for the Veefore-E application, including image processing, file storage, and video management capabilities.

## Services Overview

1. **Image Processing Service** - High-performance image manipulation using Sharp
2. **Storage Service** - AWS S3 and local file storage management
3. **Video Storage Service** - Video upload, metadata extraction, and transcoding management

---

# Image Processing Service

A comprehensive image manipulation service built on top of the Sharp library, providing high-performance image processing capabilities for the Veefore-E application.

## Features

- **Image Resizing**: Resize images with multiple fit modes (cover, contain, fill, inside, outside)
- **Image Compression**: Compress images with quality control for various formats
- **Format Conversion**: Convert between JPEG, PNG, WebP, AVIF, TIFF, and GIF formats
- **Thumbnail Generation**: Generate single or multiple thumbnail sizes
- **Image Optimization**: Automatically optimize images for web delivery
- **Image Cropping**: Crop images to specific dimensions and positions
- **Image Rotation**: Rotate images by specified degrees
- **Image Flipping**: Flip images horizontally or vertically
- **Color Adjustments**: Convert to grayscale and adjust brightness, contrast, saturation
- **Batch Processing**: Process multiple images with the same settings
- **Metadata Extraction**: Extract image metadata information

## Installation

The service depends on the Sharp library, which is already included in the project's optional dependencies:

```json
{
  "optionalDependencies": {
    "sharp": "^0.34.3"
  }
}
```

## Usage

### Basic Usage

```typescript
import { imageProcessingService } from './image-processing.service';

// Resize an image
const resized = await imageProcessingService.resize(imageBuffer, {
  width: 800,
  height: 600,
  fit: 'cover'
});

// Compress an image
const compressed = await imageProcessingService.compress(
  imageBuffer,
  'jpeg',
  { quality: 80, progressive: true }
);

// Generate a thumbnail
const thumbnail = await imageProcessingService.generateThumbnail(imageBuffer, {
  width: 200,
  height: 200,
  quality: 80
});
```

### Advanced Operations

```typescript
// Convert image format
const converted = await imageProcessingService.convert(imageBuffer, {
  format: 'webp',
  quality: 85,
  lossless: false
});

// Optimize for web
const optimized = await imageProcessingService.optimize(imageBuffer, 'webp');

// Generate multiple thumbnails
const thumbnails = await imageProcessingService.generateMultipleThumbnails(
  imageBuffer,
  [
    { width: 100, height: 100 },
    { width: 300, height: 300 },
    { width: 600, height: 600 }
  ]
);

// Crop image
const cropped = await imageProcessingService.crop(
  imageBuffer,
  400,
  400,
  100,
  100
);

// Rotate image
const rotated = await imageProcessingService.rotate(imageBuffer, 90);

// Apply grayscale
const grayscale = await imageProcessingService.grayscale(imageBuffer);

// Adjust image properties
const adjusted = await imageProcessingService.adjust(
  imageBuffer,
  1.2,  // brightness
  1.1,  // contrast
  0.9   // saturation
);
```

### Batch Processing

```typescript
const images = [imageBuffer1, imageBuffer2, imageBuffer3];

const results = await imageProcessingService.batchProcess(images, {
  resize: { width: 800, height: 600, fit: 'cover' },
  format: 'webp',
  compress: { quality: 85 }
});
```

### Saving to File

```typescript
const result = await imageProcessingService.resize(imageBuffer, {
  width: 800,
  height: 600
});

await imageProcessingService.saveToFile(
  result,
  '/path/to/output/image.png'
);
```

## API Reference

### Configuration Interfaces

#### `ResizeConfig`
```typescript
interface ResizeConfig {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  withoutEnlargement?: boolean;
  background?: string | { r: number; g: number; b: number; alpha?: number };
}
```

#### `CompressionConfig`
```typescript
interface CompressionConfig {
  quality?: number; // 1-100 for JPEG/WebP, 0-9 for PNG
  progressive?: boolean;
  lossless?: boolean;
  effort?: number; // 0-9 for PNG/WebP compression effort
}
```

#### `ThumbnailConfig`
```typescript
interface ThumbnailConfig {
  width: number;
  height: number;
  fit?: ResizeMode;
  quality?: number;
  format?: ImageFormat;
}
```

#### `ConversionConfig`
```typescript
interface ConversionConfig {
  format: ImageFormat;
  quality?: number;
  lossless?: boolean;
  progressive?: boolean;
}
```

### Methods

#### `getMetadata(input: Buffer | string): Promise<Metadata>`
Extract metadata information about an image.

**Parameters:**
- `input`: Image buffer or file path

**Returns:** Promise resolving to image metadata

---

#### `resize(input: Buffer | string, config: ResizeConfig): Promise<ProcessingResult>`
Resize an image to specified dimensions.

**Parameters:**
- `input`: Image buffer or file path
- `config`: Resize configuration options

**Returns:** Promise resolving to processed image result

---

#### `compress(input: Buffer | string, format: ImageFormat, config?: CompressionConfig): Promise<ProcessingResult>`
Compress an image with specified quality settings.

**Parameters:**
- `input`: Image buffer or file path
- `format`: Target image format
- `config`: Compression configuration options

**Returns:** Promise resolving to processed image result

---

#### `convert(input: Buffer | string, config: ConversionConfig): Promise<ProcessingResult>`
Convert an image to a different format.

**Parameters:**
- `input`: Image buffer or file path
- `config`: Conversion configuration options

**Returns:** Promise resolving to processed image result

---

#### `generateThumbnail(input: Buffer | string, config: ThumbnailConfig): Promise<ProcessingResult>`
Generate a thumbnail from an image.

**Parameters:**
- `input`: Image buffer or file path
- `config`: Thumbnail configuration options

**Returns:** Promise resolving to processed image result

---

#### `optimize(input: Buffer | string, targetFormat?: ImageFormat): Promise<ProcessingResult>`
Optimize an image for web delivery. Automatically selects best compression settings.

**Parameters:**
- `input`: Image buffer or file path
- `targetFormat`: Preferred output format (defaults to 'webp')

**Returns:** Promise resolving to processed image result

---

#### `generateMultipleThumbnails(input: Buffer | string, sizes: ThumbnailConfig[]): Promise<ProcessingResult[]>`
Generate multiple thumbnail sizes from a single image.

**Parameters:**
- `input`: Image buffer or file path
- `sizes`: Array of thumbnail configurations

**Returns:** Promise resolving to array of processed images

---

#### `crop(input: Buffer | string, width: number, height: number, left?: number, top?: number): Promise<ProcessingResult>`
Crop an image to specified dimensions and position.

**Parameters:**
- `input`: Image buffer or file path
- `width`: Crop width
- `height`: Crop height
- `left`: X offset (defaults to 0)
- `top`: Y offset (defaults to 0)

**Returns:** Promise resolving to processed image result

---

#### `rotate(input: Buffer | string, angle: number): Promise<ProcessingResult>`
Rotate an image by specified degrees.

**Parameters:**
- `input`: Image buffer or file path
- `angle`: Rotation angle in degrees (0, 90, 180, 270)

**Returns:** Promise resolving to processed image result

---

#### `flip(input: Buffer | string, horizontal?: boolean, vertical?: boolean): Promise<ProcessingResult>`
Flip an image horizontally or vertically.

**Parameters:**
- `input`: Image buffer or file path
- `horizontal`: Flip horizontally
- `vertical`: Flip vertically

**Returns:** Promise resolving to processed image result

---

#### `grayscale(input: Buffer | string): Promise<ProcessingResult>`
Apply grayscale effect to an image.

**Parameters:**
- `input`: Image buffer or file path

**Returns:** Promise resolving to processed image result

---

#### `adjust(input: Buffer | string, brightness?: number, contrast?: number, saturation?: number): Promise<ProcessingResult>`
Adjust image brightness, contrast, and saturation.

**Parameters:**
- `input`: Image buffer or file path
- `brightness`: Brightness multiplier (1.0 = no change)
- `contrast`: Contrast multiplier (1.0 = no change)
- `saturation`: Saturation multiplier (1.0 = no change)

**Returns:** Promise resolving to processed image result

---

#### `batchProcess(inputs: (Buffer | string)[], options: BatchProcessingOptions): Promise<ProcessingResult[]>`
Process multiple images in batch with same settings.

**Parameters:**
- `inputs`: Array of image buffers or file paths
- `options`: Processing options to apply to all images

**Returns:** Promise resolving to array of processed images

---

#### `saveToFile(result: ProcessingResult, outputPath: string): Promise<string>`
Save processed image to file.

**Parameters:**
- `result`: Processing result containing buffer
- `outputPath`: Output file path

**Returns:** Promise resolving to output file path

---

#### `getCompressionRatio(originalSize: number, processedSize: number): number`
Get compression ratio between original and processed image.

**Parameters:**
- `originalSize`: Original image size in bytes
- `processedSize`: Processed image size in bytes

**Returns:** Compression ratio as percentage

## Supported Formats

- **JPEG** (.jpg, .jpeg)
- **PNG** (.png)
- **WebP** (.webp)
- **AVIF** (.avif)
- **TIFF** (.tiff, .tif)
- **GIF** (.gif)

## Performance Considerations

1. **Memory Usage**: Large images consume significant memory during processing. Consider implementing streaming for very large files.

2. **Concurrency**: The service supports parallel processing for batch operations, but be mindful of memory constraints.

3. **Format Selection**:
   - **WebP**: Best balance of quality and file size for web delivery
   - **AVIF**: Superior compression but slower encoding
   - **JPEG**: Universal support, good for photos
   - **PNG**: Lossless compression, best for graphics with transparency

4. **Quality Settings**:
   - JPEG/WebP: 80-85 provides good balance
   - PNG: Compression level 9 for maximum compression
   - AVIF: 80 quality with effort 6 for reasonable encoding time

## Error Handling

The service validates inputs and throws descriptive errors:

```typescript
try {
  const result = await imageProcessingService.compress(
    imageBuffer,
    'invalid' as any,
    {}
  );
} catch (error) {
  // Error: Unsupported image format: invalid. Supported formats: jpeg, png, webp, avif, tiff, gif
}
```

## Testing

Run tests with:

```bash
npm test -- server/features/storage/services/__tests__/image-processing.service.test.ts
```

## Requirements

This service fulfills **Requirement 4.2** of the Codebase Refactoring and Optimization specification.

## Integration Example

```typescript
import { imageProcessingService } from './services/image-processing.service';
import { Router } from 'express';

const router = Router();

router.post('/process-image', async (req, res) => {
  try {
    const imageBuffer = req.file.buffer;
    
    // Optimize for web
    const optimized = await imageProcessingService.optimize(
      imageBuffer,
      'webp'
    );
    
    // Generate thumbnails
    const thumbnails = await imageProcessingService.generateMultipleThumbnails(
      optimized.buffer,
      [
        { width: 150, height: 150 },
        { width: 300, height: 300 }
      ]
    );
    
    res.json({
      optimized: {
        size: optimized.size,
        format: optimized.format
      },
      thumbnails: thumbnails.map(t => ({
        width: t.width,
        height: t.height,
        size: t.size
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

## License

MIT


---

# Video Storage Service

A comprehensive video management service that handles video upload, metadata extraction, thumbnail generation, and transcoding queue management using FFmpeg.

## Features

- **Video Upload**: Upload videos to S3 or local storage with validation
- **Metadata Extraction**: Extract duration, resolution, format, bitrate, codec, and FPS using FFmpeg
- **Thumbnail Generation**: Generate video thumbnails at specified timestamps
- **Transcoding Queue**: Queue videos for transcoding with quality and format options
- **Format Support**: MP4, MOV, AVI, WebM, MKV, M4V
- **Error Handling**: Graceful error handling with cleanup of temporary files

## Installation

The service depends on FFmpeg, which is included in optional dependencies:

```json
{
  "optionalDependencies": {
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.3"
  }
}
```

**Note:** You need FFmpeg installed on your system. Install via:
- **Mac**: `brew install ffmpeg`
- **Ubuntu/Debian**: `apt-get install ffmpeg`
- **Windows**: Download from [ffmpeg.org](https://ffmpeg.org)

## Usage

### Basic Video Upload

```typescript
import { videoStorageService } from './video-storage.service';

// Upload video with metadata extraction
const result = await videoStorageService.uploadVideo(
  videoBuffer,
  'my-video.mp4'
);

console.log(result.key); // Storage key
console.log(result.url); // Public URL
console.log(result.metadata); // { duration, width, height, format, ... }
console.log(result.thumbnail); // Thumbnail URL (if generated)
```

### Extract Video Metadata

```typescript
const metadata = await videoStorageService.extractMetadata(videoBuffer);

console.log(metadata);
// {
//   duration: 120.5,
//   width: 1920,
//   height: 1080,
//   format: 'mov,mp4,m4a,3gp,3g2,mj2',
//   size: 15728640,
//   bitrate: 1048576,
//   codec: 'h264',
//   fps: 30
// }
```

### Generate Video Thumbnail

```typescript
// Generate thumbnail at 1 second mark
const thumbnailUrl = await videoStorageService.generateVideoThumbnail(
  videoBuffer,
  'my-video.mp4',
  '00:00:01' // timestamp
);

// Use default timestamp (00:00:01)
const thumbnailUrl2 = await videoStorageService.generateVideoThumbnail(
  videoBuffer,
  'my-video.mp4'
);
```

### Queue Video for Transcoding

```typescript
// Queue video for transcoding
await videoStorageService.queueTranscode({
  videoId: 'video-123',
  inputKey: 'videos/input.mp4',
  outputFormat: 'mp4',
  quality: 'high',
  resolution: { width: 1920, height: 1080 }
});

// Check queue status
const queue = videoStorageService.getQueueStatus();
console.log(queue);
// [
//   {
//     videoId: 'video-123',
//     options: { inputKey: '...', outputFormat: 'mp4', ... }
//   }
// ]

// Remove from queue
videoStorageService.removeFromQueue('video-123');
```

## API Reference

### Types

#### `VideoMetadata`
```typescript
interface VideoMetadata {
  duration: number;        // Duration in seconds
  width: number;           // Video width in pixels
  height: number;          // Video height in pixels
  format: string;          // Video format name
  size: number;            // File size in bytes
  bitrate?: number;        // Bitrate in bits/second
  codec?: string;          // Video codec (e.g., 'h264')
  fps?: number;            // Frames per second
}
```

#### `VideoUploadResult`
```typescript
interface VideoUploadResult extends UploadFileResult {
  metadata: VideoMetadata;
  thumbnail?: string;      // Thumbnail URL if generated
}
```

#### `VideoTranscodeOptions`
```typescript
interface VideoTranscodeOptions {
  videoId: string;
  inputKey: string;
  outputFormat?: 'mp4' | 'webm';
  quality?: 'low' | 'medium' | 'high';
  resolution?: { width?: number; height?: number };
}
```

### Methods

#### `uploadVideo(buffer: Buffer, originalName: string): Promise<VideoUploadResult>`
Upload a video file with automatic metadata extraction and thumbnail generation.

**Parameters:**
- `buffer`: Video file buffer
- `originalName`: Original filename

**Returns:** Promise resolving to upload result with metadata

**Example:**
```typescript
const result = await videoStorageService.uploadVideo(
  videoBuffer,
  'presentation.mp4'
);
```

---

#### `extractMetadata(buffer: Buffer): Promise<VideoMetadata>`
Extract video metadata using FFmpeg's ffprobe.

**Parameters:**
- `buffer`: Video file buffer

**Returns:** Promise resolving to video metadata

**Example:**
```typescript
const metadata = await videoStorageService.extractMetadata(videoBuffer);
console.log(`Duration: ${metadata.duration}s`);
console.log(`Resolution: ${metadata.width}x${metadata.height}`);
```

---

#### `generateVideoThumbnail(buffer: Buffer, originalName: string, timestamp?: string): Promise<string>`
Generate a thumbnail from a video at the specified timestamp.

**Parameters:**
- `buffer`: Video file buffer
- `originalName`: Original filename
- `timestamp`: Timestamp for thumbnail (format: HH:MM:SS, default: '00:00:01')

**Returns:** Promise resolving to thumbnail URL

**Example:**
```typescript
// Thumbnail at 5 seconds
const thumb = await videoStorageService.generateVideoThumbnail(
  videoBuffer,
  'video.mp4',
  '00:00:05'
);
```

---

#### `queueTranscode(options: VideoTranscodeOptions): Promise<void>`
Queue a video for transcoding (for future implementation with job queue).

**Parameters:**
- `options`: Transcoding options

**Returns:** Promise resolving when queued

**Example:**
```typescript
await videoStorageService.queueTranscode({
  videoId: 'vid-123',
  inputKey: 'videos/raw/input.mp4',
  outputFormat: 'webm',
  quality: 'medium',
  resolution: { width: 1280, height: 720 }
});
```

---

#### `getQueueStatus(): { videoId: string; options: VideoTranscodeOptions }[]`
Get the current transcoding queue status.

**Returns:** Array of queued videos with their options

**Example:**
```typescript
const queue = videoStorageService.getQueueStatus();
queue.forEach(item => {
  console.log(`Video ${item.videoId}: ${item.options.quality} quality`);
});
```

---

#### `removeFromQueue(videoId: string): boolean`
Remove a video from the transcoding queue.

**Parameters:**
- `videoId`: Video ID to remove

**Returns:** True if removed, false if not found

**Example:**
```typescript
const removed = videoStorageService.removeFromQueue('vid-123');
if (removed) {
  console.log('Video removed from queue');
}
```

## Supported Video Formats

- **MP4** (.mp4, .m4v) - Recommended for web
- **QuickTime** (.mov)
- **AVI** (.avi)
- **WebM** (.webm)
- **Matroska** (.mkv)

## Performance Considerations

1. **FFmpeg Processing**: Video processing is CPU-intensive. Consider:
   - Processing videos asynchronously using job queues (Bull/BullMQ)
   - Rate limiting video uploads
   - Implementing timeouts for large videos

2. **Memory Usage**: Video processing uses temporary files to manage memory:
   - Temp files are automatically cleaned up
   - Monitor disk space for temp directory

3. **Thumbnail Generation**: 
   - Generated at 640x360 resolution by default
   - Stored in `videos/thumbnails/` folder
   - Consider generating multiple thumbnail sizes

4. **Storage**: Videos are large files:
   - Implement file size limits (default: 100MB)
   - Use S3 lifecycle policies for old videos
   - Consider video compression before upload

## Error Handling

The service handles errors gracefully with cleanup:

```typescript
try {
  const result = await videoStorageService.uploadVideo(buffer, 'video.mp4');
} catch (error) {
  if (error.message.includes('ffprobe')) {
    console.error('FFmpeg not available or video format unsupported');
  } else if (error.message.includes('validation')) {
    console.error('Video validation failed:', error.message);
  }
}
```

## Testing

Run tests with:

```bash
npm test -- server/features/storage/services/__tests__/video-storage.service.test.ts
```

**Note:** Tests require FFmpeg to be installed. If FFmpeg is not available, tests will be skipped gracefully.

## Future Enhancements

The current transcoding queue is in-memory. For production, implement:

1. **Job Queue Integration**: Use Bull/BullMQ with Redis for persistent queue
2. **AWS MediaConvert**: For cloud-based transcoding
3. **Multiple Quality Levels**: Generate multiple resolutions (360p, 720p, 1080p)
4. **Adaptive Streaming**: Generate HLS or DASH manifests
5. **Progress Tracking**: Track transcoding progress and notify clients

## Integration Example

```typescript
import { videoStorageService } from './services/video-storage.service';
import { Router } from 'express';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    // Upload video with metadata extraction
    const result = await videoStorageService.uploadVideo(
      req.file.buffer,
      req.file.originalname
    );

    // Queue for transcoding (optional)
    await videoStorageService.queueTranscode({
      videoId: result.key,
      inputKey: result.key,
      outputFormat: 'mp4',
      quality: 'high'
    });

    res.json({
      success: true,
      video: {
        url: result.url,
        thumbnail: result.thumbnail,
        duration: result.metadata.duration,
        resolution: {
          width: result.metadata.width,
          height: result.metadata.height
        },
        size: result.metadata.size,
        format: result.metadata.format
      }
    });
  } catch (error) {
    console.error('Video upload failed:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

## Requirements

This service fulfills **Requirement 4.2** of the Codebase Refactoring and Optimization specification:
- Video upload handling
- Transcoding queue management  
- Video metadata extraction
- Thumbnail generation

## License

MIT
