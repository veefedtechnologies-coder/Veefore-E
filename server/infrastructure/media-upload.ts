import multer from 'multer';
import path from 'path';
import fsSync from 'fs';

export const UPLOAD_DIR = './uploads';

export const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);
export const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']);
export const ALLOWED_EXTENSIONS = new Set([...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS]);

if (!fsSync.existsSync(UPLOAD_DIR)) {
  fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function createMediaUpload(): multer.Multer {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
      },
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
      }
    }),
    limits: {
      fileSize: 100 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const isValidMime = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
      const isValidExt = ALLOWED_EXTENSIONS.has(ext);
      
      if (isValidMime && isValidExt) {
        cb(null, true);
      } else if (!isValidExt) {
        cb(new Error(`File extension '${ext}' not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`));
      } else {
        cb(new Error('Only image and video files are allowed'));
      }
    }
  });
}
