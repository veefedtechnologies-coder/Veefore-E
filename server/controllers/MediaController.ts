import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { ValidationError, NotFoundError } from '../errors';
import { logger } from '../config/logger';
import path from 'path';
import fs from 'fs';

const MediaIdParams = z.object({
  mediaId: z.string().min(1),
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const MediaFilterQuery = z.object({
  type: z.enum(['image', 'video', 'audio', 'document', 'all']).default('all'),
  sortBy: z.enum(['createdAt', 'size', 'name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const UploadMediaSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive(),
  destination: z.enum(['content', 'thumbnail', 'avatar', 'attachment']).default('content'),
  metadata: z.record(z.any()).optional(),
});

const ProcessVideoSchema = z.object({
  sourceUrl: z.string().url().optional(),
  sourceMediaId: z.string().optional(),
  operations: z.array(z.enum([
    'trim',
    'resize',
    'watermark',
    'subtitles',
    'audio_extract',
    'thumbnail_extract',
    'format_convert',
  ])),
  options: z.object({
    startTime: z.number().min(0).optional(),
    endTime: z.number().min(0).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    watermarkText: z.string().optional(),
    watermarkPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']).optional(),
    outputFormat: z.enum(['mp4', 'webm', 'mov', 'avi', 'gif']).optional(),
    quality: z.enum(['low', 'medium', 'high', 'ultra']).optional(),
    fps: z.number().int().min(1).max(120).optional(),
  }).optional(),
});

const CompressVideoSchema = z.object({
  mediaId: z.string().min(1),
  targetSize: z.enum(['small', 'medium', 'large']).default('medium'),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  preserveAudio: z.boolean().default(true),
  outputFormat: z.enum(['mp4', 'webm']).default('mp4'),
});

const GeneratePresignedUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive().max(500 * 1024 * 1024),
  destination: z.enum(['content', 'thumbnail', 'avatar', 'attachment']).default('content'),
});

interface MediaRecord {
  id: string;
  workspaceId: string;
  userId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  destination: string;
  metadata?: Record<string, any>;
  status: 'pending' | 'processing' | 'ready' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

const mediaStore: Map<string, MediaRecord> = new Map();

export class MediaController extends BaseController {
  uploadMedia = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof UploadMediaSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = UploadMediaSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedMimeTypes.includes(input.mimeType)) {
      throw new ValidationError(`Unsupported file type: ${input.mimeType}`);
    }

    const maxSize = 100 * 1024 * 1024;
    if (input.size > maxSize) {
      throw new ValidationError(`File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB`);
    }

    const mediaId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const extension = path.extname(input.filename) || this.getExtensionFromMimeType(input.mimeType);
    const storedFilename = `${mediaId}${extension}`;

    const mediaRecord: MediaRecord = {
      id: mediaId,
      workspaceId,
      userId,
      filename: storedFilename,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
      url: `/uploads/${input.destination}/${storedFilename}`,
      destination: input.destination,
      metadata: input.metadata,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mediaStore.set(mediaId, mediaRecord);

    this.sendCreated(res, {
      mediaId,
      uploadUrl: `/api/media/upload/${mediaId}`,
      expiresIn: 3600,
      media: mediaRecord,
    }, 'Media upload initiated');
  });

  getPresignedUrl = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof GeneratePresignedUrlSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = GeneratePresignedUrlSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const mediaId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const extension = path.extname(input.filename) || this.getExtensionFromMimeType(input.mimeType);
    const storedFilename = `${mediaId}${extension}`;

    this.sendSuccess(res, {
      mediaId,
      presignedUrl: `/api/media/upload/${mediaId}`,
      fields: {
        key: `${input.destination}/${storedFilename}`,
        contentType: input.mimeType,
      },
      expiresIn: 3600,
    });
  });

  getMedia = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; mediaId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { mediaId } = MediaIdParams.parse(req.params);

    const media = mediaStore.get(mediaId);
    if (!media) {
      throw new NotFoundError('Media not found');
    }

    if (media.workspaceId !== workspaceId) {
      throw new ValidationError('Media does not belong to this workspace');
    }

    this.sendSuccess(res, media);
  });

  listMedia = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, z.infer<typeof MediaFilterQuery>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { type, sortBy, sortOrder, page, limit } = MediaFilterQuery.parse(req.query);

    let mediaList = Array.from(mediaStore.values())
      .filter(m => m.workspaceId === workspaceId);

    if (type !== 'all') {
      mediaList = mediaList.filter(m => m.mimeType.startsWith(type));
    }

    mediaList.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'name':
          comparison = a.originalFilename.localeCompare(b.originalFilename);
          break;
        case 'createdAt':
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const total = mediaList.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedList = mediaList.slice(startIndex, startIndex + limit);

    this.sendPaginated(res, paginatedList, {
      page,
      limit,
      total,
      totalPages,
    });
  });

  deleteMedia = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; mediaId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { mediaId } = MediaIdParams.parse(req.params);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const media = mediaStore.get(mediaId);
    if (!media) {
      throw new NotFoundError('Media not found');
    }

    if (media.workspaceId !== workspaceId) {
      throw new ValidationError('Media does not belong to this workspace');
    }

    mediaStore.delete(mediaId);
    logger.info('Media deleted', { mediaId, userId, workspaceId });

    this.sendNoContent(res);
  });

  processVideo = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof ProcessVideoSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = ProcessVideoSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    if (!input.sourceUrl && !input.sourceMediaId) {
      throw new ValidationError('Either sourceUrl or sourceMediaId is required');
    }

    if (input.sourceMediaId) {
      const media = mediaStore.get(input.sourceMediaId);
      if (!media) {
        throw new NotFoundError('Source media not found');
      }
      if (media.workspaceId !== workspaceId) {
        throw new ValidationError('Media does not belong to this workspace');
      }
      if (!media.mimeType.startsWith('video/')) {
        throw new ValidationError('Source media is not a video');
      }
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.sendCreated(res, {
      jobId,
      status: 'queued',
      operations: input.operations,
      estimatedTime: input.operations.length * 30,
      callbackUrl: `/api/media/jobs/${jobId}/status`,
    }, 'Video processing job created');
  });

  compressVideo = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof CompressVideoSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = CompressVideoSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const media = mediaStore.get(input.mediaId);
    if (!media) {
      throw new NotFoundError('Media not found');
    }

    if (media.workspaceId !== workspaceId) {
      throw new ValidationError('Media does not belong to this workspace');
    }

    if (!media.mimeType.startsWith('video/')) {
      throw new ValidationError('Media is not a video');
    }

    const targetSizeReduction: Record<string, number> = {
      small: 0.25,
      medium: 0.5,
      large: 0.75,
    };

    const estimatedOutputSize = Math.ceil(media.size * targetSizeReduction[input.targetSize]);
    const jobId = `compress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.sendCreated(res, {
      jobId,
      status: 'queued',
      originalSize: media.size,
      estimatedOutputSize,
      quality: input.quality,
      outputFormat: input.outputFormat,
      callbackUrl: `/api/media/jobs/${jobId}/status`,
    }, 'Video compression job created');
  });

  getJobStatus = this.wrapAsync(async (
    req: TypedRequest<{ jobId: string }>,
    res: Response
  ) => {
    const { jobId } = req.params;

    this.sendSuccess(res, {
      jobId,
      status: 'processing',
      progress: Math.floor(Math.random() * 100),
      message: 'Video is being processed',
    });
  });

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/webm': '.weba',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    };
    return mimeToExt[mimeType] || '.bin';
  }
}

export const mediaController = new MediaController();
