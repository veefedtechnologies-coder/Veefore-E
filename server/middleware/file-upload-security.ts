/**
 * P1-4.4 SECURITY: Comprehensive File Upload Validation & Security
 * 
 * Production-ready file upload protection against malicious files,
 * oversized uploads, and path traversal attacks
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { sanitizeFileName } from './xss-protection';

/**
 * P1-4.4: Allowed file types with strict MIME validation
 */
export const ALLOWED_FILE_TYPES = {
  image: {
    mimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    maxSize: 10 * 1024 * 1024, // 10MB
    description: 'Images (JPEG, PNG, GIF, WebP, SVG)'
  },
  video: {
    mimes: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
    extensions: ['.mp4', '.mpeg', '.mov', '.avi', '.webm'],
    maxSize: 100 * 1024 * 1024, // 100MB
    description: 'Videos (MP4, MPEG, MOV, AVI, WebM)'
  },
  audio: {
    mimes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/x-wav'],
    extensions: ['.mp3', '.wav', '.ogg'],
    maxSize: 25 * 1024 * 1024, // 25MB
    description: 'Audio (MP3, WAV, OGG)'
  },
  document: {
    mimes: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    extensions: ['.pdf', '.txt', '.doc', '.docx'],
    maxSize: 25 * 1024 * 1024, // 25MB
    description: 'Documents (PDF, TXT, DOC, DOCX)'
  }
};

/**
 * P1-4.4: File upload validation options
 */
export interface FileUploadOptions {
  allowedTypes: (keyof typeof ALLOWED_FILE_TYPES)[];
  maxFileSize?: number;
  maxFiles?: number;
  customMimes?: string[];
  scanContent?: boolean;
  requireAuth?: boolean;
  uploadPath?: string;
}

/**
 * P1-4.4: Advanced file type detection using magic bytes
 */
const FILE_SIGNATURES = {
  // Images
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/gif': [Buffer.from([0x47, 0x49, 0x46, 0x38]), Buffer.from([0x47, 0x49, 0x46, 0x39])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF
  'image/bmp': [Buffer.from([0x42, 0x4D])],
  
  // Videos
  'video/mp4': [Buffer.from([0x66, 0x74, 0x79, 0x70])], // ftyp
  'video/avi': [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF
  'video/quicktime': [Buffer.from([0x66, 0x74, 0x79, 0x70, 0x71, 0x74])], // ftyp qt
  
  // Audio
  'audio/mp3': [Buffer.from([0x49, 0x44, 0x33]), Buffer.from([0xFF, 0xFB])],
  'audio/wav': [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF
  'audio/ogg': [Buffer.from([0x4F, 0x67, 0x67, 0x53])], // OggS
  
  // Documents
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  'application/zip': [Buffer.from([0x50, 0x4B, 0x03, 0x04])], // PK
  'application/msword': [Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])]
};

/**
 * P1-4.4: Validate file type using magic bytes
 */
async function validateFileContent(filePath: string, expectedMime: string): Promise<boolean> {
  try {
    const buffer = await fs.readFile(filePath);
    const signatures = FILE_SIGNATURES[expectedMime as keyof typeof FILE_SIGNATURES];
    
    if (!signatures) {
      console.warn(`⚠️ FILE SECURITY: No signature validation for MIME type: ${expectedMime}`);
      return true; // Allow if no signature defined
    }
    
    // Check if file starts with any of the expected signatures
    return signatures.some(signature => buffer.subarray(0, signature.length).equals(signature));
  } catch (error) {
    console.error('❌ FILE SECURITY: Content validation failed:', error);
    return false;
  }
}

/**
 * P1-4.4: Scan file for malicious content patterns
 */
async function scanForMaliciousContent(filePath: string, mimeType: string): Promise<boolean> {
  try {
    const buffer = await fs.readFile(filePath);
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024 * 10)); // First 10KB
    
    // Malicious patterns to detect
    const maliciousPatterns = [
      /<script[\s\S]*?<\/script>/gi, // Script tags
      /javascript:/gi, // JavaScript URLs
      /vbscript:/gi, // VBScript URLs
      /on\w+\s*=/gi, // Event handlers
      /eval\s*\(/gi, // Eval calls
      /document\.write/gi, // DOM manipulation
      /\.exe\b/gi, // Executable extensions in content
      /\.bat\b/gi, // Batch files
      /\.cmd\b/gi, // Command files
      /\.scr\b/gi, // Screen savers (often malicious)
      /\.pif\b/gi, // Program information files
      /shellcode/gi, // Shellcode references
      /metasploit/gi, // Metasploit references
      /%u[0-9a-f]{4}/gi, // Unicode encoded potentially malicious content
    ];
    
    const hasmaliciousContent = maliciousPatterns.some(pattern => pattern.test(content));
    
    if (hasmaliciousContent) {
      console.error(`🚨 FILE SECURITY: Malicious content detected in file: ${filePath}`);
      return false;
    }
    
    // Additional checks for specific file types
    if (mimeType.startsWith('image/svg')) {
      // SVG-specific security checks
      const svgMaliciousPatterns = [
        /<script/gi,
        /onload=/gi,
        /onerror=/gi,
        /onclick=/gi,
        /javascript:/gi,
        /<foreignObject/gi, // Can contain HTML/JS
        /<use\s+href\s*=\s*["']javascript:/gi
      ];
      
      const hasSvgMaliciousContent = svgMaliciousPatterns.some(pattern => pattern.test(content));
      if (hasSvgMaliciousContent) {
        console.error(`🚨 FILE SECURITY: Malicious SVG content detected in: ${filePath}`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ FILE SECURITY: Malicious content scan failed:', error);
    return false; // Err on the side of caution
  }
}

/**
 * P1-4.4: Generate secure file hash for duplicate detection
 */
async function generateFileHash(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
    return createHash('sha256').update(buffer).digest('hex');
  } catch (error) {
    console.error('❌ FILE SECURITY: Hash generation failed:', error);
    return '';
  }
}

/**
 * P1-4.4: Secure file upload middleware factory
 */
export function createSecureFileUpload(options: FileUploadOptions) {
  const {
    allowedTypes,
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    maxFiles = 5,
    customMimes = [],
    scanContent = true,
    requireAuth = true,
    uploadPath = 'uploads/temp'
  } = options;

  // Build allowed MIME types
  const allowedMimes = new Set<string>();
  allowedTypes.forEach(type => {
    if (ALLOWED_FILE_TYPES[type]) {
      ALLOWED_FILE_TYPES[type].mimes.forEach(mime => allowedMimes.add(mime));
    }
  });
  customMimes.forEach(mime => allowedMimes.add(mime));

  // Build allowed extensions
  const allowedExtensions = new Set<string>();
  allowedTypes.forEach(type => {
    if (ALLOWED_FILE_TYPES[type]) {
      ALLOWED_FILE_TYPES[type].extensions.forEach(ext => allowedExtensions.add(ext.toLowerCase()));
    }
  });

  // Configure multer with security settings
  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        await fs.mkdir(uploadPath, { recursive: true });
        cb(null, uploadPath);
      } catch (error) {
        cb(error as Error, '');
      }
    },
    filename: (req, file, cb) => {
      // Generate secure filename
      const sanitizedName = sanitizeFileName(file.originalname);
      const extension = path.extname(sanitizedName).toLowerCase();
      const baseName = path.basename(sanitizedName, extension);
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const secureFilename = `${baseName}-${timestamp}-${randomSuffix}${extension}`;
      
      cb(null, secureFilename);
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
      fieldSize: 1024 * 1024, // 1MB field size limit
      fieldNameSize: 100, // Field name length limit
      headerPairs: 20 // Number of header pairs limit
    },
    fileFilter: (req, file, cb) => {
      // MIME type validation
      if (!allowedMimes.has(file.mimetype)) {
        const error = new Error(`Invalid file type. Allowed types: ${Array.from(allowedMimes).join(', ')}`);
        (error as any).code = 'INVALID_FILE_TYPE';
        return cb(error);
      }

      // Extension validation
      const extension = path.extname(file.originalname).toLowerCase();
      if (!allowedExtensions.has(extension)) {
        const error = new Error(`Invalid file extension. Allowed extensions: ${Array.from(allowedExtensions).join(', ')}`);
        (error as any).code = 'INVALID_FILE_EXTENSION';
        return cb(error);
      }

      // Filename security validation
      const filename = file.originalname;
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        const error = new Error('Invalid filename - path traversal detected');
        (error as any).code = 'PATH_TRAVERSAL_DETECTED';
        return cb(error);
      }

      cb(null, true);
    }
  });

  // Return middleware function
  return async (req: Request, res: Response, next: NextFunction) => {
    // Authentication check
    if (requireAuth && !req.user) {
      return res.status(401).json({
        error: 'Authentication required for file upload',
        code: 'AUTH_REQUIRED'
      });
    }

    // Use multer middleware
    upload.array('files', maxFiles)(req, res, async (err: any) => {
      if (err) {
        console.error('🚨 FILE UPLOAD ERROR:', err.message);
        
        // Handle specific multer errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: `File too large. Maximum size: ${maxFileSize / (1024 * 1024)}MB`,
            code: 'FILE_TOO_LARGE'
          });
        }
        
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(413).json({
            error: `Too many files. Maximum: ${maxFiles}`,
            code: 'TOO_MANY_FILES'
          });
        }

        return res.status(400).json({
          error: err.message || 'File upload failed',
          code: err.code || 'UPLOAD_ERROR'
        });
      }

      // Additional security validation for uploaded files
      const files = req.files as Express.Multer.File[];
      if (files && files.length > 0) {
        try {
          for (const file of files) {
            // Content validation using magic bytes
            const isValidContent = await validateFileContent(file.path, file.mimetype);
            if (!isValidContent) {
              // Delete invalid file
              await fs.unlink(file.path).catch(console.error);
              return res.status(400).json({
                error: `File content doesn't match declared type: ${file.originalname}`,
                code: 'INVALID_FILE_CONTENT'
              });
            }

            // Malicious content scanning
            if (scanContent) {
              const isSafe = await scanForMaliciousContent(file.path, file.mimetype);
              if (!isSafe) {
                // Delete malicious file
                await fs.unlink(file.path).catch(console.error);
                return res.status(400).json({
                  error: `Malicious content detected in file: ${file.originalname}`,
                  code: 'MALICIOUS_CONTENT_DETECTED'
                });
              }
            }

            // Generate file hash for duplicate detection
            const fileHash = await generateFileHash(file.path);
            (file as any).hash = fileHash;

            console.log(`✅ FILE SECURITY: Validated file - ${file.originalname} (${file.mimetype}, ${Math.round(file.size / 1024)}KB, hash: ${fileHash.substring(0, 8)}...)`);
          }

          // Add security metadata to request
          req.files = files.map(file => ({
            ...file,
            securityValidated: true,
            validatedAt: new Date(),
            hash: (file as any).hash
          }));

        } catch (error) {
          console.error('❌ FILE SECURITY: Validation failed:', error);
          
          // Clean up uploaded files on validation failure
          if (files) {
            for (const file of files) {
              await fs.unlink(file.path).catch(console.error);
            }
          }

          return res.status(500).json({
            error: 'File security validation failed',
            code: 'SECURITY_VALIDATION_FAILED'
          });
        }
      }

      next();
    });
  };
}

/**
 * P1-4.4: File cleanup utility for temporary files
 */
export async function cleanupTempFiles(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const tempPath = 'uploads/temp';
    const files = await fs.readdir(tempPath).catch(() => []);
    const now = Date.now();

    for (const filename of files) {
      const filePath = path.join(tempPath, filename);
      const stats = await fs.stat(filePath).catch(() => null);
      
      if (stats && (now - stats.mtime.getTime() > maxAge)) {
        await fs.unlink(filePath);
        console.log(`🗑️ FILE CLEANUP: Removed old temp file: ${filename}`);
      }
    }
  } catch (error) {
    console.error('❌ FILE CLEANUP: Error during cleanup:', error);
  }
}

/**
 * P1-4.4: File security validation for existing files
 */
export async function validateExistingFile(filePath: string): Promise<{
  isValid: boolean;
  mimeType?: string;
  size?: number;
  hash?: string;
  errors: string[];
}> {
  const errors: string[] = [];
  
  try {
    const stats = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    
    // Basic checks
    if (!stats.isFile()) {
      errors.push('Not a regular file');
      return { isValid: false, errors };
    }
    
    if (stats.size === 0) {
      errors.push('File is empty');
      return { isValid: false, errors };
    }
    
    if (stats.size > 100 * 1024 * 1024) { // 100MB limit
      errors.push('File too large');
      return { isValid: false, errors };
    }
    
    // Generate hash
    const hash = createHash('sha256').update(buffer).digest('hex');
    
    return {
      isValid: errors.length === 0,
      size: stats.size,
      hash,
      errors
    };
    
  } catch (error) {
    errors.push(`File access error: ${error}`);
    return { isValid: false, errors };
  }
}