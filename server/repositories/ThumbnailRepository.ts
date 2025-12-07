import { Document, Schema, model, Model } from 'mongoose';
import { BaseRepository, PaginationOptions } from './BaseRepository';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export interface IThumbnailProject extends Document {
  _id: any;
  workspaceId: string;
  videoId?: string;
  title: string;
  status: 'pending' | 'analyzing' | 'generating' | 'ready' | 'completed' | 'failed';
  strategy?: any;
  variants?: any[];
  selectedVariant?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IThumbnailStrategy extends Document {
  _id: any;
  projectId: string;
  strategyType: string;
  hooks?: string[];
  colorPalette?: string[];
  textOverlays?: any[];
  visualElements?: any[];
  recommendations?: any[];
  analysisData?: Record<string, any>;
  createdAt: Date;
}

export interface IThumbnailVariant extends Document {
  _id: any;
  projectId: string;
  variantNumber: number;
  imageUrl?: string;
  thumbnailData?: Record<string, any>;
  canvasState?: Record<string, any>;
  status: 'pending' | 'generating' | 'ready' | 'selected' | 'exported';
  score?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface ICanvasEditorSession extends Document {
  _id: any;
  variantId: string;
  workspaceId: string;
  canvasState: Record<string, any>;
  history?: any[];
  currentHistoryIndex?: number;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  lastSaved: Date;
}

export interface IThumbnailExport extends Document {
  _id: any;
  sessionId: string;
  variantId?: string;
  format: 'png' | 'jpg' | 'webp';
  quality?: number;
  width?: number;
  height?: number;
  fileUrl?: string;
  fileSize?: number;
  downloadCount: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ThumbnailProjectSchema = new Schema<IThumbnailProject>({
  workspaceId: { type: String, required: true, index: true },
  videoId: { type: String },
  title: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'analyzing', 'generating', 'ready', 'completed', 'failed'],
    default: 'pending'
  },
  strategy: { type: Schema.Types.Mixed },
  variants: [{ type: Schema.Types.Mixed }],
  selectedVariant: { type: String },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'thumbnail_projects' });

const ThumbnailStrategySchema = new Schema<IThumbnailStrategy>({
  projectId: { type: String, required: true, index: true },
  strategyType: { type: String, required: true },
  hooks: [{ type: String }],
  colorPalette: [{ type: String }],
  textOverlays: [{ type: Schema.Types.Mixed }],
  visualElements: [{ type: Schema.Types.Mixed }],
  recommendations: [{ type: Schema.Types.Mixed }],
  analysisData: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'thumbnail_strategies' });

const ThumbnailVariantSchema = new Schema<IThumbnailVariant>({
  projectId: { type: String, required: true, index: true },
  variantNumber: { type: Number, required: true },
  imageUrl: { type: String },
  thumbnailData: { type: Schema.Types.Mixed },
  canvasState: { type: Schema.Types.Mixed },
  status: {
    type: String,
    enum: ['pending', 'generating', 'ready', 'selected', 'exported'],
    default: 'pending'
  },
  score: { type: Number },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'thumbnail_variants' });

const CanvasEditorSessionSchema = new Schema<ICanvasEditorSession>({
  variantId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  canvasState: { type: Schema.Types.Mixed, required: true },
  history: [{ type: Schema.Types.Mixed }],
  currentHistoryIndex: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  lastSaved: { type: Date, default: Date.now }
}, { collection: 'canvas_editor_sessions' });

const ThumbnailExportSchema = new Schema<IThumbnailExport>({
  sessionId: { type: String, required: true, index: true },
  variantId: { type: String },
  format: {
    type: String,
    enum: ['png', 'jpg', 'webp'],
    default: 'png'
  },
  quality: { type: Number },
  width: { type: Number },
  height: { type: Number },
  fileUrl: { type: String },
  fileSize: { type: Number },
  downloadCount: { type: Number, default: 0 },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'thumbnail_exports' });

export const ThumbnailProjectModel: Model<IThumbnailProject> = model<IThumbnailProject>('ThumbnailProject', ThumbnailProjectSchema);
export const ThumbnailStrategyModel: Model<IThumbnailStrategy> = model<IThumbnailStrategy>('ThumbnailStrategy', ThumbnailStrategySchema);
export const ThumbnailVariantModel: Model<IThumbnailVariant> = model<IThumbnailVariant>('ThumbnailVariant', ThumbnailVariantSchema);
export const CanvasEditorSessionModel: Model<ICanvasEditorSession> = model<ICanvasEditorSession>('CanvasEditorSession', CanvasEditorSessionSchema);
export const ThumbnailExportModel: Model<IThumbnailExport> = model<IThumbnailExport>('ThumbnailExport', ThumbnailExportSchema);

export class ThumbnailProjectRepository extends BaseRepository<IThumbnailProject> {
  constructor() {
    super(ThumbnailProjectModel, 'ThumbnailProject');
  }

  async createWithDefaults(data: Partial<IThumbnailProject>): Promise<IThumbnailProject> {
    const result = await this.create({
      ...data,
      status: data.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return result;
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, { ...options, sortBy: 'createdAt', sortOrder: 'desc' });
  }

  async findByVideoId(videoId: string): Promise<IThumbnailProject | null> {
    return this.findOne({ videoId });
  }

  async findByStatus(status: string, options?: PaginationOptions) {
    return this.findMany({ status }, options);
  }

  async updateStatus(projectId: string, status: IThumbnailProject['status']): Promise<IThumbnailProject | null> {
    return this.updateById(projectId, { status, updatedAt: new Date() });
  }

  async setSelectedVariant(projectId: string, variantId: string): Promise<IThumbnailProject | null> {
    return this.updateById(projectId, { selectedVariant: variantId, updatedAt: new Date() });
  }

  convertToOutput(project: IThumbnailProject): any {
    return {
      id: project._id.toString(),
      workspaceId: project.workspaceId,
      videoId: project.videoId,
      title: project.title,
      status: project.status,
      strategy: project.strategy,
      variants: project.variants,
      selectedVariant: project.selectedVariant,
      metadata: project.metadata,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
  }
}

export class ThumbnailStrategyRepository extends BaseRepository<IThumbnailStrategy> {
  constructor() {
    super(ThumbnailStrategyModel, 'ThumbnailStrategy');
  }

  async createWithDefaults(data: Partial<IThumbnailStrategy>): Promise<IThumbnailStrategy> {
    const result = await this.create({
      ...data,
      createdAt: new Date()
    });
    return result;
  }

  async findByProjectId(projectId: string): Promise<IThumbnailStrategy | null> {
    return this.findOne({ projectId });
  }

  async findByStrategyType(strategyType: string, options?: PaginationOptions) {
    return this.findMany({ strategyType }, options);
  }

  convertToOutput(strategy: IThumbnailStrategy): any {
    return {
      id: strategy._id.toString(),
      projectId: strategy.projectId,
      strategyType: strategy.strategyType,
      hooks: strategy.hooks,
      colorPalette: strategy.colorPalette,
      textOverlays: strategy.textOverlays,
      visualElements: strategy.visualElements,
      recommendations: strategy.recommendations,
      analysisData: strategy.analysisData,
      createdAt: strategy.createdAt
    };
  }
}

export class ThumbnailVariantRepository extends BaseRepository<IThumbnailVariant> {
  constructor() {
    super(ThumbnailVariantModel, 'ThumbnailVariant');
  }

  async createWithDefaults(data: Partial<IThumbnailVariant>): Promise<IThumbnailVariant> {
    const result = await this.create({
      ...data,
      status: data.status || 'pending',
      createdAt: new Date()
    });
    return result;
  }

  async findByProjectId(projectId: string): Promise<IThumbnailVariant[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ projectId })
        .sort({ variantNumber: 1 })
        .exec();
      logger.db.query('findByProjectId', this.entityName, Date.now() - startTime, { projectId, count: result.length });
      return result;
    } catch (error) {
      logger.db.error('findByProjectId', error, { entityName: this.entityName, projectId });
      throw new DatabaseError('Failed to find variants by project ID', error as Error);
    }
  }

  async updateStatus(variantId: string, status: IThumbnailVariant['status']): Promise<IThumbnailVariant | null> {
    return this.updateById(variantId, { status });
  }

  async updateCanvasState(variantId: string, canvasState: Record<string, any>): Promise<IThumbnailVariant | null> {
    return this.updateById(variantId, { canvasState });
  }

  async setScore(variantId: string, score: number): Promise<IThumbnailVariant | null> {
    return this.updateById(variantId, { score });
  }

  convertToOutput(variant: IThumbnailVariant): any {
    return {
      id: variant._id.toString(),
      projectId: variant.projectId,
      variantNumber: variant.variantNumber,
      imageUrl: variant.imageUrl,
      thumbnailData: variant.thumbnailData,
      canvasState: variant.canvasState,
      status: variant.status,
      score: variant.score,
      metadata: variant.metadata,
      createdAt: variant.createdAt
    };
  }
}

export class CanvasEditorSessionRepository extends BaseRepository<ICanvasEditorSession> {
  constructor() {
    super(CanvasEditorSessionModel, 'CanvasEditorSession');
  }

  async createWithDefaults(data: Partial<ICanvasEditorSession>): Promise<ICanvasEditorSession> {
    const result = await this.create({
      ...data,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date(),
      lastSaved: new Date()
    });
    return result;
  }

  async findByVariantId(variantId: string): Promise<ICanvasEditorSession | null> {
    return this.findOne({ variantId });
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findActiveSessions(workspaceId: string): Promise<ICanvasEditorSession[]> {
    return this.findAll({ workspaceId, isActive: true });
  }

  async updateCanvasState(sessionId: string, canvasState: Record<string, any>): Promise<ICanvasEditorSession | null> {
    return this.updateById(sessionId, { canvasState, lastSaved: new Date() });
  }

  async updateLastSaved(sessionId: string): Promise<ICanvasEditorSession | null> {
    return this.updateById(sessionId, { lastSaved: new Date() });
  }

  async deactivateSession(sessionId: string): Promise<ICanvasEditorSession | null> {
    return this.updateById(sessionId, { isActive: false, lastSaved: new Date() });
  }

  convertToOutput(session: ICanvasEditorSession): any {
    return {
      id: session._id.toString(),
      variantId: session.variantId,
      workspaceId: session.workspaceId,
      canvasState: session.canvasState,
      history: session.history,
      currentHistoryIndex: session.currentHistoryIndex,
      isActive: session.isActive,
      metadata: session.metadata,
      createdAt: session.createdAt,
      lastSaved: session.lastSaved
    };
  }
}

export class ThumbnailExportRepository extends BaseRepository<IThumbnailExport> {
  constructor() {
    super(ThumbnailExportModel, 'ThumbnailExport');
  }

  async createWithDefaults(data: Partial<IThumbnailExport>): Promise<IThumbnailExport> {
    const result = await this.create({
      ...data,
      format: data.format || 'png',
      downloadCount: 0,
      createdAt: new Date()
    });
    return result;
  }

  async findBySessionId(sessionId: string): Promise<IThumbnailExport[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ sessionId })
        .sort({ createdAt: -1 })
        .exec();
      logger.db.query('findBySessionId', this.entityName, Date.now() - startTime, { sessionId, count: result.length });
      return result;
    } catch (error) {
      logger.db.error('findBySessionId', error, { entityName: this.entityName, sessionId });
      throw new DatabaseError('Failed to find exports by session ID', error as Error);
    }
  }

  async findByVariantId(variantId: string, options?: PaginationOptions) {
    return this.findMany({ variantId }, options);
  }

  async incrementDownloadCount(exportId: string): Promise<IThumbnailExport | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(
          exportId,
          { $inc: { downloadCount: 1 } },
          { new: true }
        )
        .exec();
      logger.db.query('incrementDownloadCount', this.entityName, Date.now() - startTime, { exportId });
      return result;
    } catch (error) {
      logger.db.error('incrementDownloadCount', error, { entityName: this.entityName, exportId });
      throw new DatabaseError('Failed to increment download count', error as Error);
    }
  }

  async getTotalDownloads(sessionId: string): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { sessionId } },
        { $group: { _id: null, total: { $sum: '$downloadCount' } } }
      ]).exec();
      logger.db.query('getTotalDownloads', this.entityName, Date.now() - startTime, { sessionId });
      return result[0]?.total || 0;
    } catch (error) {
      logger.db.error('getTotalDownloads', error, { entityName: this.entityName, sessionId });
      throw new DatabaseError('Failed to get total downloads', error as Error);
    }
  }

  convertToOutput(exportDoc: IThumbnailExport): any {
    return {
      id: exportDoc._id.toString(),
      sessionId: exportDoc.sessionId,
      variantId: exportDoc.variantId,
      format: exportDoc.format,
      quality: exportDoc.quality,
      width: exportDoc.width,
      height: exportDoc.height,
      fileUrl: exportDoc.fileUrl,
      fileSize: exportDoc.fileSize,
      downloadCount: exportDoc.downloadCount,
      metadata: exportDoc.metadata,
      createdAt: exportDoc.createdAt
    };
  }
}

export const thumbnailProjectRepository = new ThumbnailProjectRepository();
export const thumbnailStrategyRepository = new ThumbnailStrategyRepository();
export const thumbnailVariantRepository = new ThumbnailVariantRepository();
export const canvasEditorSessionRepository = new CanvasEditorSessionRepository();
export const thumbnailExportRepository = new ThumbnailExportRepository();
